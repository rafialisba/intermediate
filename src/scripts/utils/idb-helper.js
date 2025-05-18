import {
  isPushNotificationSupported,
  isSubscribedToPushNotifications,
  registerServiceWorker,
  requestNotificationPermission,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
} from "./notification-helper.js";
import { openDB } from "idb";

const dbPromise = openDB("snapshot-store", 1, {
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

export async function saveStoriesToIndexedDB(stories) {
  if (!stories || stories.length === 0) return;

  try {
    const db = await dbPromise;
    const tx = db.transaction("stories", "readwrite");
    const store = tx.objectStore("stories");

    const existingStories = await store.getAll();
    const optimizedStories = stories.map((story) => ({
      id: story.id,
      title: story.name,
      description: story.description,
      photoUrl: story.photoUrl,
      lat: story.lat,
      lon: story.lon,
      createdAt: story.createdAt,
      syncTimestamp: new Date().toISOString(),
    }));

    const allStories = [...existingStories, ...optimizedStories]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 10);

    await store.clear();

    for (const story of allStories) {
      await store.put(story);
    }

    await tx.done;
    await saveUserPreference("lastSyncTime", new Date().toISOString());
    console.log("Successfully saved latest 10 stories to IndexedDB");
    return true;
  } catch (error) {
    console.error("Error saving stories to IndexedDB:", error);
    return false;
  }
}

export async function getStoriesFromIndexedDB() {
  try {
    const db = await dbPromise;
    const stories = await db.getAll("stories");

    return stories.sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
  } catch (error) {
    console.error("Error getting stories from IndexedDB:", error);
    return [];
  }
}

export async function saveOfflinePost(postData) {
  try {
    const db = await dbPromise;
    await db.add("offline-posts", {
      data: postData,
      timestamp: new Date().toISOString(),
    });
    console.log("Offline post saved successfully");
    return true;
  } catch (error) {
    console.error("Error saving offline post:", error);
    return false;
  }
}

export async function syncOfflinePosts(postCallback) {
  try {
    if (!navigator.onLine) {
      console.log("Still offline, sync postponed");
      return false;
    }

    if ("serviceWorker" in navigator && "SyncManager" in window) {
      const registration = await navigator.serviceWorker.ready;
      await registration.sync.register("sync-stories");
      return true;
    } else {
      const db = await dbPromise;
      const offlinePosts = await db.getAll("offline-posts");

      let syncSuccess = true;

      for (const post of offlinePosts) {
        try {
          if (postCallback && typeof postCallback === "function") {
            const result = await postCallback(post.data);

            if (result && result.ok) {
              await db.delete("offline-posts", post.id);
            } else {
              syncSuccess = false;
            }
          }
        } catch (error) {
          console.error("Error syncing offline post:", error);
          syncSuccess = false;
        }
      }

      return syncSuccess;
    }
  } catch (error) {
    console.error("Error during offline posts sync:", error);
    return false;
  }
}

export async function saveUserPreference(key, value) {
  try {
    const db = await dbPromise;
    await db.put("preferences", { id: key, value });
    return true;
  } catch (error) {
    console.error("Error saving user preference:", error);
    return false;
  }
}

export async function getUserPreference(key) {
  try {
    const db = await dbPromise;
    const preference = await db.get("preferences", key);
    return preference ? preference.value : null;
  } catch (error) {
    console.error("Error getting user preference:", error);
    return null;
  }
}

export async function sendMessageToSW(message) {
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    return navigator.serviceWorker.controller.postMessage(message);
  }
  return false;
}

export function registerSWMessageListener(callback) {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", callback);
  }
}

export function setupOnlineStatusListener(onlineCallback, offlineCallback) {
  window.addEventListener("online", () => {
    console.log("Aplikasi online");
    if (typeof onlineCallback === "function") {
      onlineCallback();
    }
  });

  window.addEventListener("offline", () => {
    console.log("Aplikasi offline");
    if (typeof offlineCallback === "function") {
      offlineCallback();
    }
  });
}

export async function setupPWA() {
  const registration = await registerServiceWorker();

  setupOnlineStatusListener(
    async () => {
      await syncOfflinePosts();

      if (Notification.permission === "granted") {
        new Notification("Snapshot", {
          body: "Anda kembali online!",
          icon: "/images/logo.png",
        });
      }
    },

    () => {
      if (Notification.permission === "granted") {
        new Notification("Snapshot", {
          body: "Anda sedang offline. Postingan akan disimpan dan dikirim saat online.",
          icon: "/images/logo.png",
        });
      }
    }
  );

  return registration;
}

registerSWMessageListener((event) => {
  const message = event.data;

  if (message.action === "syncComplete") {
    console.log("Sync completed:", message.result);

    if (message.result && Notification.permission === "granted") {
      new Notification("Snapshot", {
        body: "Semua postingan offline berhasil disinkronkan!",
        icon: "/images/logo.png",
      });
    }
  }
});
