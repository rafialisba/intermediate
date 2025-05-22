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
  if (!stories || stories.length === 0) return false;

  try {
    const db = await dbPromise;
    const tx = db.transaction("stories", "readwrite");
    const store = tx.objectStore("stories");

    const existingStories = await store.getAll();
    const existingIds = existingStories.map((story) => story.id);

    for (const story of stories) {
      if (!existingIds.includes(story.id)) {
        const optimizedStory = {
          id: story.id,
          title: story.title || story.name,
          description: story.description,
          photoUrl: story.photoUrl,
          lat: story.lat,
          lon: story.lon,
          createdAt: story.createdAt,
          syncTimestamp: new Date().toISOString(),
        };

        await store.put(optimizedStory);
      }
    }

    await tx.done;
    await saveUserPreference("lastSyncTime", new Date().toISOString());
    console.log("Successfully saved stories to IndexedDB");
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

export async function deleteStoryFromIndexedDB(storyId) {
  try {
    const db = await dbPromise;
    const tx = db.transaction("stories", "readwrite");
    const store = tx.objectStore("stories");

    await store.delete(storyId);
    await tx.done;

    console.log(`Story ${storyId} deleted from IndexedDB`);
    return true;
  } catch (error) {
    console.error("Error deleting story from IndexedDB:", error);
    return false;
  }
}

export async function getStoryFromIndexedDB(storyId) {
  try {
    const db = await dbPromise;
    const story = await db.get("stories", storyId);
    return story || null;
  } catch (error) {
    console.error("Error getting single story from IndexedDB:", error);
    return null;
  }
}

export async function isStorySavedOffline(storyId) {
  try {
    const story = await getStoryFromIndexedDB(storyId);
    return story !== null;
  } catch (error) {
    console.error("Error checking if story is saved offline:", error);
    return false;
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
          icon: "./images/logo.png",
        });
      }
    },

    () => {
      if (Notification.permission === "granted") {
        new Notification("Snapshot", {
          body: "Anda sedang offline. Postingan akan disimpan dan dikirim saat online kembali.",
          icon: "./images/logo.png",
        });
      }
    }
  );

  return registration;
}
