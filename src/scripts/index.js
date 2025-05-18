import "../styles/styles.css";
import { getLogout, isAuthenticated } from "./utils/auth";
import App from "./pages/app";
import { initPWA } from "./utils/pwa-helper";

document.addEventListener("DOMContentLoaded", async () => {
  const initialHash = window.location.hash.substring(1) || "/";
  const isLogin = isAuthenticated();

  initPWA();

  if (!isLogin && !["/login", "/register"].includes(initialHash)) {
    window.location.hash = "#/login";
  } else if (isLogin && ["/login", "/register"].includes(initialHash)) {
    window.location.hash = "#/";
  }

  const logoutButton = document.getElementById("logout-button");
  if (logoutButton) {
    logoutButton.addEventListener("click", getLogout);
  }

  const app = new App({
    content: document.querySelector("#main-content"),
    drawerButton: document.querySelector("#drawer-button"),
    navigationDrawer: document.querySelector("#navigation-drawer"),
    logoutButton: logoutButton,
  });

  await app.renderPage();

  window.addEventListener("storage", (event) => {
    if (event.key === "accessToken") {
      const isLogin = isAuthenticated();
      const authEvent = new CustomEvent("authStateChanged", {
        detail: { isAuthenticated: isLogin },
      });
      window.dispatchEvent(authEvent);
    }
  });

  window.addEventListener("authStateChanged", async (event) => {
    const { isAuthenticated } = event.detail;
    const currentHash = window.location.hash.substring(1) || "/";

    if (isAuthenticated) {
      if (["/login", "/register"].includes(currentHash)) {
        window.location.hash = "#/";
      }
    } else {
      if (!["/login", "/register"].includes(currentHash)) {
        window.location.hash = "#/login";
      }
    }

    await app.renderPage();
  });

  window.addEventListener("hashchange", async () => {
    await app.renderPage();
  });
});
