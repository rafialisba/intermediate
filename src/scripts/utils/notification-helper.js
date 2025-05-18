import * as SnapPostAPI from "../data/api.js";

const VAPID_PUBLIC_KEY =
  "BCCs2eonMI-6H2ctvFaWg-UYdDv387Vno_bzUzALpB442r2lCnsHmtrx8biyPi_E-1fSGABK_Qs_GlvPoJJqxbk";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    try {
      const registration = await navigator.serviceWorker.register(
        "./service-worker.js"
      );
      console.log("Service Worker registered with scope:", registration.scope);
      return registration;
    } catch (error) {
      console.error("Service Worker registration failed:", error);
      return null;
    }
  }
  return null;
}

export function isPushNotificationSupported() {
  return "serviceWorker" in navigator && "PushManager" in window;
}

export async function requestNotificationPermission() {
  if (!("Notification" in window)) {
    console.log("This browser does not support notifications");
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  } catch (error) {
    console.error("Error requesting notification permission:", error);
    return false;
  }
}

export async function subscribeToPushNotifications() {
  try {
    const registration = await navigator.serviceWorker.ready;

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    const subscriptionJSON = subscription.toJSON();

    const response = await SnapPostAPI.subscribeNotification({
      endpoint: subscriptionJSON.endpoint,
      keys: subscriptionJSON.keys,
    });

    if (response.error) {
      console.error(
        "Failed to subscribe for push notifications:",
        response.message
      );
      return false;
    }

    localStorage.setItem("pushSubscription", JSON.stringify(subscriptionJSON));

    return true;
  } catch (error) {
    console.error("Error subscribing to push notifications:", error);
    return false;
  }
}

export async function unsubscribeFromPushNotifications() {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      console.log("No subscription to unsubscribe from");
      return true;
    }

    const subscriptionJSON = subscription.toJSON();

    const unsubscribed = await subscription.unsubscribe();

    if (unsubscribed) {
      const response = await SnapPostAPI.unsubscribeNotification({
        endpoint: subscriptionJSON.endpoint,
      });

      if (response.error) {
        console.error("Failed to unsubscribe from server:", response.message);
      }

      localStorage.removeItem("pushSubscription");

      return true;
    }

    return false;
  } catch (error) {
    console.error("Error unsubscribing from push notifications:", error);
    return false;
  }
}

export async function isSubscribedToPushNotifications() {
  if (!isPushNotificationSupported()) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return !!subscription;
  } catch (error) {
    console.error("Error checking subscription status:", error);
    return false;
  }
}
