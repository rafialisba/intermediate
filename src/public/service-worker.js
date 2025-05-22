importScripts(
  "https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js"
);
importScripts("https://cdn.jsdelivr.net/npm/idb@7.1.1/build/umd.js");

workbox.setConfig({
  debug: false,
});

const { registerRoute } = workbox.routing;
const { CacheFirst, StaleWhileRevalidate, NetworkFirst } = workbox.strategies;
const { ExpirationPlugin } = workbox.expiration;
const { precacheAndRoute } = workbox.precaching;

precacheAndRoute([
  { url: "./", revision: "1" },
  { url: "./index.html", revision: "1" },
  { url: "./manifest.json", revision: "1" },
]);

// Alternatif: Gunakan runtime caching untuk file statis
registerRoute(
  ({ request }) =>
    request.destination === "document" || request.destination === "manifest",
  new NetworkFirst({
    cacheName: "pages-cache",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 20,
        maxAgeSeconds: 24 * 60 * 60,
      }),
    ],
    networkTimeoutSeconds: 3,
  })
);

registerRoute(
  /\/api\/.*$/,
  new NetworkFirst({
    cacheName: "api-cache",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 60 * 60,
      }),
    ],
  })
);

registerRoute(
  ({ request }) => request.destination === "image",
  new CacheFirst({
    cacheName: "image-cache",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 60,
        maxAgeSeconds: 30 * 24 * 60 * 60,
      }),
    ],
  })
);

registerRoute(
  ({ request }) => request.destination === "font",
  new StaleWhileRevalidate({
    cacheName: "font-cache",
  })
);

registerRoute(
  ({ request }) => request.mode === "navigate",
  new NetworkFirst({
    cacheName: "navigate-cache",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 20,
        maxAgeSeconds: 24 * 60 * 60,
      }),
    ],
    networkTimeoutSeconds: 3,
  }),
  "GET"
);

registerRoute(
  ({ request }) =>
    request.destination === "script" || request.destination === "style",
  new StaleWhileRevalidate({
    cacheName: "static-resources",
  })
);

const dbPromise = idb.openDB("snapshot-store", 1, {
  upgrade(db) {
    if (!db.objectStoreNames.contains("stories")) {
      db.createObjectStore("stories", { keyPath: "id" });
    }

    if (!db.objectStoreNames.contains("preferences")) {
      db.createObjectStore("preferences", { keyPath: "id" });
    }

    if (!db.objectStoreNames.contains("offline-posts")) {
      db.createObjectStore("offline-posts", {
        keyPath: "id",
        autoIncrement: true,
      });
    }
  },
});

async function saveToIndexedDB(storeName, data) {
  try {
    const db = await dbPromise;
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);

    if (Array.isArray(data)) {
      if (storeName === "stories") {
        const existingStories = await store.getAll();
        const existingIds = existingStories.map((story) => story.id);

        for (const item of data) {
          if (!existingIds.includes(item.id)) {
            await store.put(item);
          }
        }
      } else {
        for (const item of data) {
          await store.put(item);
        }
      }
    } else {
      await store.put(data);
    }

    if (storeName !== "stories") {
      const allItems = await store.getAll();
      if (allItems.length > 50) {
        const sorted = allItems.sort(
          (a, b) =>
            new Date(b.timestamp || b.createdAt) -
            new Date(a.timestamp || a.createdAt)
        );
        const toDelete = sorted.slice(50);
        for (const item of toDelete) {
          await store.delete(item.id);
        }
      }
    }

    await tx.done;
    console.log(`Successfully saved data to ${storeName}`);
  } catch (error) {
    console.error(`Error saving to ${storeName}:`, error);
  }
}

async function getFromIndexedDB(storeName, key) {
  try {
    const db = await dbPromise;
    return key ? db.get(storeName, key) : db.getAll(storeName);
  } catch (error) {
    console.error(`Error getting from ${storeName}:`, error);
    return key ? null : [];
  }
}

async function deleteFromIndexedDB(storeName, key) {
  try {
    const db = await dbPromise;
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    await store.delete(key);
    await tx.done;
    console.log(`Successfully deleted ${key} from ${storeName}`);
  } catch (error) {
    console.error(`Error deleting from ${storeName}:`, error);
  }
}

self.addEventListener("push", async function (event) {
  try {
    let notificationData;

    if (event.data) {
      notificationData = event.data.json();
    } else {
      notificationData = {
        title: "Snapshot App",
        options: {
          body: "Ada pembaruan baru di Snapshot",
          icon: "./images/logo.png",
          badge: "./images/badge.png",
        },
      };
    }

    const options = notificationData.options || {};

    if (notificationData.data) {
      await saveToIndexedDB("notifications", {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        ...notificationData,
      });
    }

    event.waitUntil(
      self.registration.showNotification(notificationData.title, options)
    );
  } catch (error) {
    console.error("Error handling push notification:", error);
  }
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();

  const urlToOpen =
    event.notification.data && event.notification.data.url
      ? new URL(event.notification.data.url, self.location.origin).href
      : "/";

  event.waitUntil(
    clients.matchAll({ type: "window" }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === urlToOpen && "focus" in client) {
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

self.addEventListener("message", async function (event) {
  const message = event.data;

  try {
    switch (message.action) {
      case "saveStories":
        await saveToIndexedDB("stories", message.data);
        event.source.postMessage({
          action: "saveStoriesComplete",
          success: true,
        });
        break;

      case "getStories":
        try {
          const stories = await getFromIndexedDB("stories");
          event.source.postMessage({
            action: "getStoriesComplete",
            data: stories || [],
          });
        } catch (error) {
          console.error("Error getting stories from IndexedDB:", error);
          event.source.postMessage({
            action: "getStoriesComplete",
            error: error.message,
            data: [],
          });
        }
        break;

      case "savePreference":
        await saveToIndexedDB("preferences", message.data);
        break;

      case "saveOfflinePost":
        await saveToIndexedDB("offline-posts", message.data);
        break;

      case "checkSync":
        if (self.registration.sync) {
          try {
            await self.registration.sync.register("sync-stories");
          } catch (error) {
            console.log("Background sync not available, manually syncing");
            await syncOfflinePosts();
          }
        }
        break;

      default:
        console.log("Unknown message action:", message.action);
    }
  } catch (error) {
    console.error("Error handling service worker message:", error);
    event.source.postMessage({
      action: message.action + "Complete",
      success: false,
      error: error.message,
    });
  }
});

self.addEventListener("fetch", function (event) {
  if (event.request.url.includes("/api/")) {
    const fetchPromise = fetch(event.request.clone())
      .then(async (response) => {
        return response;
      })
      .catch(async (error) => {
        console.error("Fetch failed, falling back to cache:", error);

        if (event.request.method === "POST") {
          try {
            const requestClone = event.request.clone();
            let requestData;

            const contentType = event.request.headers.get("Content-Type");

            if (contentType && contentType.includes("application/json")) {
              requestData = await requestClone.json();
            } else if (
              contentType &&
              contentType.includes("multipart/form-data")
            ) {
              requestData = {
                url: event.request.url,
                method: event.request.method,
                timestamp: new Date().toISOString(),
                offline: true,
              };
            }

            if (requestData) {
              await saveToIndexedDB("offline-posts", {
                data: requestData,
                url: event.request.url,
                method: event.request.method,
                timestamp: new Date().toISOString(),
              });

              return new Response(
                JSON.stringify({
                  error: false,
                  message: "Postingan disimpan dan akan dikirim saat online",
                  offline: true,
                }),
                {
                  status: 202,
                  headers: { "Content-Type": "application/json" },
                }
              );
            }
          } catch (e) {
            console.error("Error saving offline request:", e);
          }
        }

        if (event.request.method === "GET") {
          if (event.request.url.includes("/stories")) {
            try {
              const stories = await getFromIndexedDB("stories");
              if (stories && stories.length > 0) {
                return new Response(
                  JSON.stringify({
                    error: false,
                    message: "Success (offline)",
                    listStory: stories,
                  }),
                  {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                  }
                );
              }
            } catch (dbError) {
              console.error("Error fetching from IndexedDB:", dbError);
            }
          }
        }

        // Fallback ke generic offline response jika tidak ada offline.html
        return new Response(
          JSON.stringify({
            error: true,
            message: "Network tidak tersedia, silakan coba lagi nanti",
            offline: true,
          }),
          {
            status: 503,
            headers: { "Content-Type": "application/json" },
            statusText: "Service Unavailable",
          }
        );
      });

    event.respondWith(fetchPromise);
  }
});

self.addEventListener("sync", async function (event) {
  if (event.tag === "sync-stories") {
    event.waitUntil(syncOfflinePosts());
  }
});

async function syncOfflinePosts() {
  try {
    const offlinePosts = await getFromIndexedDB("offline-posts");

    if (!offlinePosts || offlinePosts.length === 0) {
      return;
    }

    let syncedCount = 0;

    for (const post of offlinePosts) {
      try {
        let requestBody;

        if (post.data) {
          if (post.data instanceof FormData) {
            requestBody = post.data;
          } else {
            requestBody = JSON.stringify(post.data);
          }
        }

        const response = await fetch(post.url, {
          method: post.method,
          headers: {
            "Content-Type": "application/json",
            Authorization: self.localStorage
              ? `Bearer ${self.localStorage.getItem("accessToken")}`
              : "",
          },
          body: requestBody,
        });

        if (response.ok) {
          await deleteFromIndexedDB("offline-posts", post.id);
          syncedCount++;
        }
      } catch (error) {
        console.error(`Failed to sync offline post (id: ${post.id}):`, error);
      }
    }

    if (syncedCount > 0) {
      await self.registration.showNotification("Snapshot", {
        body: `${syncedCount} postingan yang dibuat saat offline berhasil dikirim!`,
        icon: "./images/logo.png",
      });
    }
  } catch (error) {
    console.error("Error during sync:", error);
  }
}
