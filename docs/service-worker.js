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
  { url: "./favicon.png", revision: "1" },
  { url: "./offline.html", revision: "1" },
]);

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
    cacheName: "pages-cache",
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
  const db = await dbPromise;
  const tx = db.transaction(storeName, "readwrite");
  const store = tx.objectStore(storeName);

  if (Array.isArray(data)) {
    for (const item of data) {
      await store.put(item);
    }
  } else {
    await store.put(data);
  }

  const allItems = await store.getAll();

  if (allItems.length > 10) {
    const sorted = allItems.sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
    );
    const toDelete = sorted.slice(10);
    for (const item of toDelete) {
      await store.delete(item.id);
    }
  }

  await tx.done;
}

async function getFromIndexedDB(storeName, key) {
  const db = await dbPromise;
  return key ? db.get(storeName, key) : db.getAll(storeName);
}

async function deleteFromIndexedDB(storeName, key) {
  const db = await dbPromise;
  const tx = db.transaction(storeName, "readwrite");
  const store = tx.objectStore(storeName);
  await store.delete(key);
  await tx.done;
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
          data: stories,
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
  }
});

self.addEventListener("fetch", function (event) {
  if (event.request.url.includes("/api/")) {
    const fetchPromise = fetch(event.request.clone())
      .then(async (response) => {
        if (response.ok && event.request.method === "GET") {
          const responseToCache = response.clone();
          try {
            const data = await responseToCache.clone().json();
            if (data && data.listStory) {
              await saveToIndexedDB("stories", data.listStory);
            }
          } catch (error) {
            console.error("Error caching API response data:", error);
          }
        }
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

        const cache = await caches.open("pages-cache");
        const cachedResponse = await cache.match("./offline.html");
        return (
          cachedResponse ||
          new Response("Network error, and no offline page available", {
            status: 503,
            statusText: "Service Unavailable",
          })
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
    const db = await dbPromise;
    const offlinePosts = await db.getAll("offline-posts");

    if (!offlinePosts || offlinePosts.length === 0) {
      return;
    }

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

          await self.registration.showNotification("Snapshot", {
            body: "Postingan yang Anda buat saat offline berhasil dikirim!",
            icon: "./images/logo.png",
          });
        }
      } catch (error) {
        console.error(`Failed to sync offline post (id: ${post.id}):`, error);
      }
    }
  } catch (error) {
    console.error("Error during sync:", error);
  }
}

self.addEventListener("fetch", function (event) {
  const url = new URL(event.request.url);

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      new NetworkFirst({
        cacheName: "api-cache",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 50,
            maxAgeSeconds: 60 * 60,
          }),
        ],
      }).handle({ request: event.request })
    );
  }
});
