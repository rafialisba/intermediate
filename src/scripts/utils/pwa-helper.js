let deferredPrompt;

export const initPWA = () => {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();

    deferredPrompt = e;
    showInstallPromotion();
  });

  window.addEventListener("appinstalled", () => {
    hideInstallPromotion();
    deferredPrompt = null;
    showInstallationSuccess();
  });
};

export const installPWA = async () => {
  if (!deferredPrompt) {
    alert("Aplikasi sudah terinstal atau tidak dapat diinstal saat ini");
    return;
  }

  deferredPrompt.prompt();

  const { outcome } = await deferredPrompt.userChoice;

  if (outcome === "accepted") {
    console.log("User accepted the install prompt");
  } else {
    console.log("User dismissed the install prompt");
  }

  deferredPrompt = null;
};

const showInstallPromotion = () => {
  const installContainer = document.getElementById("install-container");
  const installButton = document.getElementById("install-button");

  if (installContainer && installButton) {
    installContainer.style.display = "flex";
    installContainer.style.flexDirection = "column";
    installContainer.style.alignItems = "center";
    installContainer.style.gap = "10px";
    installContainer.style.marginTop = "20px";

    const description = document.createElement("p");
    description.textContent =
      "💡 Pasang aplikasi ini di perangkat Anda untuk akses lebih cepat!";
    description.style.color = "var(--text-secondary)";
    description.style.textAlign = "center";
    description.style.margin = "0";

    installContainer.innerHTML = "";
    installContainer.appendChild(description);
    installContainer.appendChild(installButton);

    installButton.style.padding = "10px 20px";
    installButton.style.marginTop = "10px";
    installButton.style.backgroundColor = "transparent";
    installButton.style.color = "white";
    installButton.style.border = "2px solid var(--accent-color)";
    installButton.style.borderRadius = "8px";
    installButton.style.cursor = "pointer";
    installButton.style.transition = "all 0.3s ease";
    installButton.textContent = "📱 Install Aplikasi";

    installButton.onclick = installPWA;

    installButton.onmouseover = () => {
      installButton.style.backgroundColor = "var(--accent-color)";
    };
    installButton.onmouseout = () => {
      installButton.style.backgroundColor = "transparent";
    };
  }
};

const hideInstallPromotion = () => {
  const installContainer = document.getElementById("install-container");
  if (installContainer) {
    installContainer.style.display = "none";
  }
};

const showInstallationSuccess = () => {
  const notification = document.createElement("div");
  notification.style.position = "fixed";
  notification.style.bottom = "20px";
  notification.style.left = "50%";
  notification.style.transform = "translateX(-50%)";
  notification.style.backgroundColor = "var(--success-color)";
  notification.style.color = "white";
  notification.style.padding = "12px 24px";
  notification.style.borderRadius = "8px";
  notification.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)";
  notification.style.zIndex = "9999";
  notification.textContent = "✅ Aplikasi berhasil dipasang!";

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.opacity = "0";
    notification.style.transition = "opacity 0.5s ease";
    setTimeout(() => notification.remove(), 500);
  }, 3000);
};
