import HomePagePresenter from "./home-presenter";
import * as SnapPostAPI from "../../data/api.js";
import { showFormattedDate } from "../../utils/index.js";
import L from "leaflet";
import {
  registerServiceWorker,
  requestNotificationPermission,
  isPushNotificationSupported,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
  isSubscribedToPushNotifications,
} from "../../utils/notification-helper.js";
import {
  saveStoriesToIndexedDB,
  getStoriesFromIndexedDB,
  deleteStoryFromIndexedDB,
  setupPWA,
  sendMessageToSW,
  saveUserPreference,
  getUserPreference,
} from "../../utils/idb-helper.js";

export default class HomePage {
  #presenter = null;
  #isOnline = navigator.onLine;
  #cachedStories = [];
  #onlineStories = [];

  async render() {
    return `
      <section class="container-homepage">
        <h1>Selamat datang di Snapshot</h1>
        <p>Snapshot adalah tempat untuk membagikan momen spesial dalam hidupmu, entah itu cerita singkat, foto favorit, atau pemikiran spontan.
        Temukan kisah dari pengguna lain, berinteraksi, dan jadikan setiap postingan punya arti.</p>
        <div class="network-status">
            <p id="online-status" class="online-status">Status Jaringan: <span id="status-label"></span></p>
        </div>
        <div class="notification-control">
            <button id="notification-toggle" class="notification-button">Aktifkan Notifikasi</button>
            <p id="notification-status" class="notification-status">Status: Tidak Aktif</p>
        </div>
        <div class="form-button" style="margin-top: 20px;">
            <a href="#/addstory">
                <button type="button" class="btn">Tambah Cerita Baru</button>
            </a>
        </div>
        <div class="install-pwa" id="install-container" style="display: none; margin-top: 20px;">
            <button id="install-button" class="btn btn-secondary">Instal Aplikasi</button>
        </div>
      </section>

      <!-- Bagian untuk data yang disimpan offline -->
      <section class="offline-data-section" id="offline-data-section">
        <h2>Data Tersimpan Offline</h2>
        <p class="offline-info">Cerita yang tersimpan secara lokal akan muncul di sini dan tetap dapat diakses saat offline.</p>
        <div class="offline-data-count">
          <span id="cached-stories-count">0</span> cerita tersimpan di perangkat Anda
        </div>
        <div class="last-sync" id="last-sync">
          Terakhir disinkronkan: <span id="last-sync-time">Belum pernah</span>
        </div>
        <div class="cached-stories" id="cached-stories">
          <p id="no-cached-data" style="display: none;">Tidak ada data tersimpan. Anda dapat menyimpan cerita dari daftar online.</p>
        </div>
      </section>

      <section class="stories-section">
        <div class="stories-header">
          <h2>Cerita Online</h2>
          <p id="loading-text" style="display: none;">Loading stories...</p>
          <p id="error-message"></p>
        </div>
        <div class="story-list" id="story-list">
        </div>
      </section>
    `;
  }

  async afterRender() {
    this.#presenter = new HomePagePresenter({
      view: this,
      model: SnapPostAPI,
    });

    await setupPWA();

    this.#updateOnlineStatus();
    window.addEventListener("online", () => {
      this.#updateOnlineStatus();
      this.#presenter.loadStories();
    });
    window.addEventListener("offline", () => this.#updateOnlineStatus());

    const notificationToggleBtn = document.getElementById(
      "notification-toggle"
    );
    const notificationStatus = document.getElementById("notification-status");

    await this.#initializeNotifications(
      notificationToggleBtn,
      notificationStatus
    );

    this.#setupInstallButton();

    await this.#displayCachedData();

    if (navigator.onLine) {
      await this.#presenter.loadStories();
    } else {
      this.showError(
        "Anda sedang offline. Hanya data tersimpan yang dapat diakses."
      );
    }
  }

  async #displayCachedData() {
    try {
      this.#cachedStories = await getStoriesFromIndexedDB();

      document.getElementById("cached-stories-count").textContent =
        this.#cachedStories.length;

      const lastVisit = await getUserPreference("lastVisit");
      if (lastVisit) {
        const lastVisitDate = new Date(lastVisit);
        document.getElementById("last-sync-time").textContent =
          lastVisitDate.toLocaleString("id-ID");
      }

      const cachedStoriesContainer = document.getElementById("cached-stories");

      if (!this.#cachedStories || this.#cachedStories.length === 0) {
        document.getElementById("no-cached-data").style.display = "block";
        return;
      }

      document.getElementById("no-cached-data").style.display = "none";
      cachedStoriesContainer.innerHTML = "";

      this.#cachedStories.forEach((story) => {
        const storyCard = document.createElement("div");
        storyCard.className = "cached-story-card";

        const hasLocation =
          typeof story.lat === "number" && typeof story.lon === "number";

        storyCard.innerHTML = `
          <div class="cached-story-image">
            <img src="${story.photoUrl}" alt="${
          story.title
        }" loading="lazy" onerror="this.src='./images/placeholder.png';" />
          </div>
          <div class="cached-story-content">
            <h3>${story.title}</h3>
            <p class="cached-story-description">${story.description}</p>
            ${
              hasLocation
                ? `
              <div class="cached-story-coordinates">
                <p><span>📍</span> Latitude: ${story.lat}</p>
                <p><span>📍</span> Longitude: ${story.lon}</p>
              </div>
            `
                : ""
            }
            <div class="cached-story-date">
              <span>📅</span> ${showFormattedDate(story.createdAt, "id-ID")}
            </div>
            <div class="story-actions">
              <button class="delete-story-btn" data-id="${
                story.id
              }">🗑️ Hapus</button>
              <button class="story-details-btn" data-id="${
                story.id
              }">Details ></button>
            </div>
          </div>
        `;

        if (hasLocation) {
          const mapDiv = document.createElement("div");
          mapDiv.id = `cached-map-${story.id}`;
          mapDiv.className = "cached-story-map";
          storyCard.querySelector(".cached-story-content").appendChild(mapDiv);

          requestAnimationFrame(() => {
            try {
              const map = L.map(mapDiv.id, {
                center: [story.lat, story.lon],
                zoom: 13,
                attributionControl: true,
                zoomControl: true,
                dragging: true,
                scrollWheelZoom: false,
              });

              L.tileLayer(
                "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
                {
                  attribution: "© OpenStreetMap contributors",
                }
              ).addTo(map);

              const marker = L.marker([story.lat, story.lon]).addTo(map);
              marker.bindPopup(
                `<b>${story.title}</b><br>${story.description.substring(
                  0,
                  50
                )}...`
              );

              setTimeout(() => {
                map.invalidateSize(true);
              }, 250);
            } catch (error) {
              console.error(
                `Error initializing map for cached story ${story.id}:`,
                error
              );
              mapDiv.innerHTML =
                '<div class="map-unavailable">Peta tidak dapat dimuat</div>';
            }
          });
        }

        cachedStoriesContainer.appendChild(storyCard);
      });

      this.#setupCachedStoryActions();
    } catch (error) {
      console.error("Error displaying cached data:", error);
    }
  }

  #setupCachedStoryActions() {
    document.querySelectorAll(".delete-story-btn").forEach((button) => {
      button.addEventListener("click", async (e) => {
        e.stopPropagation();
        const storyId = e.target.getAttribute("data-id");

        if (
          confirm(
            "Apakah Anda yakin ingin menghapus cerita ini dari penyimpanan offline?"
          )
        ) {
          await this.#deleteStoryCached(storyId);
        }
      });
    });

    document.querySelectorAll(".story-details-btn").forEach((button) => {
      button.addEventListener("click", (e) => {
        e.stopPropagation();
        const storyId = e.target.getAttribute("data-id");
        window.location.hash = `#/stories/${storyId}`;
      });
    });
  }

  async #deleteStoryCached(storyId) {
    try {
      const success = await deleteStoryFromIndexedDB(storyId);

      if (success) {
        this.showSuccess("Cerita berhasil dihapus dari penyimpanan offline");
        await this.#displayCachedData();
      } else {
        this.showError("Gagal menghapus cerita dari penyimpanan offline");
      }
    } catch (error) {
      console.error("Error deleting cached story:", error);
      this.showError("Terjadi kesalahan saat menghapus cerita");
    }
  }

  async #saveStoryToCache(story) {
    try {
      const storyToSave = {
        id: story.id,
        title: story.name,
        description: story.description,
        photoUrl: story.photoUrl,
        lat: story.lat,
        lon: story.lon,
        createdAt: story.createdAt,
        syncTimestamp: new Date().toISOString(),
      };

      const success = await saveStoriesToIndexedDB([storyToSave]);

      if (success) {
        this.showSuccess("Cerita berhasil disimpan untuk akses offline");
        await this.#displayCachedData();
      } else {
        this.showError("Gagal menyimpan cerita untuk akses offline");
      }
    } catch (error) {
      console.error("Error saving story to cache:", error);
      this.showError("Terjadi kesalahan saat menyimpan cerita");
    }
  }

  #updateOnlineStatus() {
    const statusLabel = document.getElementById("status-label");
    const onlineStatus = document.getElementById("online-status");
    const offlineSection = document.getElementById("offline-data-section");

    this.#isOnline = navigator.onLine;

    if (this.#isOnline) {
      statusLabel.textContent = "Online";
      statusLabel.className = "status-online";
      onlineStatus.className = "online-status online";

      if (offlineSection) {
        offlineSection.classList.remove("highlighted");
      }

      sendMessageToSW({ action: "checkSync" });
    } else {
      statusLabel.textContent = "Offline";
      statusLabel.className = "status-offline";
      onlineStatus.className = "online-status offline";

      if (offlineSection) {
        offlineSection.classList.add("highlighted");
      }
    }
  }

  #setupInstallButton() {
    const installContainer = document.getElementById("install-container");
    const installButton = document.getElementById("install-button");

    installContainer.style.margin = "20px 0";
    installContainer.style.textAlign = "center";

    installButton.style.padding = "10px 20px";
    installButton.style.backgroundColor = "transparent";
    installButton.style.color = "white";
    installButton.style.border = "1px solid #ffffff1e";
    installButton.style.borderRadius = "4px";
    installButton.style.cursor = "pointer";

    let deferredPrompt;

    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredPrompt = e;
      installContainer.style.display = "block";
    });

    installButton.addEventListener("click", async () => {
      installContainer.style.display = "none";

      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to the install prompt: ${outcome}`);
        deferredPrompt = null;
      }
    });

    window.addEventListener("appinstalled", (evt) => {
      console.log("PWA was installed");
      installContainer.style.display = "none";
      saveUserPreference("appInstalled", true);
      this.showSuccess(
        "Aplikasi berhasil diinstal! Kamu dapat membukanya dari layar utama perangkat."
      );
    });
  }

  async #initializeNotifications(toggleButton, statusElement) {
    if (!isPushNotificationSupported()) {
      toggleButton.disabled = true;
      statusElement.textContent = "Status: Tidak Didukung di Browser Ini";
      return;
    }

    const registration = await registerServiceWorker();
    if (!registration) {
      toggleButton.disabled = true;
      statusElement.textContent = "Status: Gagal Mendaftarkan Service Worker";
      return;
    }

    await this.#updateNotificationButtonState(toggleButton, statusElement);

    toggleButton.addEventListener("click", async () => {
      const isSubscribed = await isSubscribedToPushNotifications();

      if (isSubscribed) {
        const success = await unsubscribeFromPushNotifications();
        if (success) {
          statusElement.textContent = "Status: Tidak Aktif";
          toggleButton.textContent = "Aktifkan Notifikasi";
          toggleButton.classList.remove("active");
          await saveUserPreference("notificationsEnabled", false);
        }
      } else {
        const permissionGranted = await requestNotificationPermission();
        if (permissionGranted) {
          const subscribed = await subscribeToPushNotifications();
          if (subscribed) {
            statusElement.textContent = "Status: Aktif";
            toggleButton.textContent = "Nonaktifkan Notifikasi";
            toggleButton.classList.add("active");
            await saveUserPreference("notificationsEnabled", true);
            this.#sendWelcomeNotification();
          }
        } else {
          alert(
            "Izin notifikasi ditolak. Silakan ubah pengaturan browser Anda."
          );
        }
      }
    });
  }

  async #sendWelcomeNotification() {
    const previouslySubscribed = await getUserPreference(
      "previouslySubscribed"
    );

    if (!previouslySubscribed) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.showNotification("Selamat datang di Snapshot!", {
          body: "Terima kasih telah mengaktifkan notifikasi. Kami akan memberi tahu saat ada cerita baru!",
          icon: "./images/logo.png",
          badge: "./images/badge.png",
        });
      });

      await saveUserPreference("previouslySubscribed", true);
    }
  }

  async #updateNotificationButtonState(toggleButton, statusElement) {
    const isSubscribed = await isSubscribedToPushNotifications();

    if (isSubscribed) {
      statusElement.textContent = "Status: Aktif";
      toggleButton.textContent = "Nonaktifkan Notifikasi";
      toggleButton.classList.add("active");
    } else {
      statusElement.textContent = "Status: Tidak Aktif";
      toggleButton.textContent = "Aktifkan Notifikasi";
      toggleButton.classList.remove("active");
    }
  }

  showLoading() {
    const loadingText = document.getElementById("loading-text");
    if (loadingText) {
      loadingText.style.display = "block";
    }
  }

  hideLoading() {
    const loadingText = document.getElementById("loading-text");
    if (loadingText) {
      loadingText.style.display = "none";
    }
  }

  showError(message) {
    document.getElementById("error-message").textContent = message;
  }

  showSuccess(message) {
    const notification = document.createElement("div");
    notification.className = "success-notification";
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #4CAF50;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      z-index: 9999;
      animation: slideIn 0.3s ease;
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.opacity = "0";
      notification.style.transition = "opacity 0.5s ease";
      setTimeout(() => notification.remove(), 500);
    }, 3000);
  }

  async showStories(stories) {
    const container = document.getElementById("story-list");
    this.#onlineStories = stories || [];

    const loading = document.getElementById("loading-text");
    if (loading) loading.style.display = "none";

    if (!stories.length) {
      container.innerHTML = `
        <p>Tidak ada cerita ditemukan.</p>
      `;
      return;
    }

    container.innerHTML = "";

    const cachedStoryIds = this.#cachedStories.map((story) => story.id);

    stories.forEach((story) => {
      const storyCard = document.createElement("article");
      storyCard.className = "story-card";

      const isAlreadySaved = cachedStoryIds.includes(story.id);

      storyCard.innerHTML = `
          <img src="${story.photoUrl}" alt="${
        story.name
      }" loading="lazy" onerror="this.src='./images/placeholder.png';" />
          <h2>${story.name}</h2>
          <p>${story.description}</p>
          <div class="coordinate">
              <p id="card-latitude">Latitude: ${
                story.lat || "Tidak tersedia"
              }</p>
              <p id="card-longitude">Longitude: ${
                story.lon || "Tidak tersedia"
              }</p>
          </div>
          <p>${showFormattedDate(story.createdAt, "id-ID")}</p>
          <div class="story-actions">
            <button class="save-story-btn" data-id="${story.id}" ${
        isAlreadySaved ? "disabled" : ""
      }>
              ${isAlreadySaved ? "✅ Tersimpan" : "💾 Simpan"}
            </button>
            <button class="story-card-button-details" data-id="${story.id}">
              Details >
            </button>
          </div>
      `;

      const mapDiv = document.createElement("div");
      mapDiv.id = `map-${story.id}`;
      mapDiv.className = "story-map";
      mapDiv.style.height = "200px";
      mapDiv.style.width = "100%";
      mapDiv.style.display = "block";

      storyCard.appendChild(mapDiv);
      container.appendChild(storyCard);

      if (
        navigator.onLine &&
        typeof story.lat === "number" &&
        typeof story.lon === "number"
      ) {
        requestAnimationFrame(() => {
          try {
            void mapDiv.offsetHeight;

            const storyMap = L.map(mapDiv, {
              center: [story.lat, story.lon],
              zoom: 13,
              attributionControl: true,
            });

            L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
              attribution: "© OpenStreetMap contributors",
            }).addTo(storyMap);

            L.marker([story.lat, story.lon]).addTo(storyMap);

            setTimeout(() => {
              storyMap.invalidateSize(true);
            }, 250);
          } catch (error) {
            console.error(
              `Error initializing map for story ${story.id}:`,
              error
            );
            mapDiv.innerHTML =
              '<p class="map-unavailable">Error loading map</p>';
          }
        });
      } else {
        mapDiv.innerHTML =
          '<p class="map-unavailable">Peta tidak tersedia saat offline</p>';
      }
    });

    this.#setupOnlineStoryActions();
  }

  #setupOnlineStoryActions() {
    document.querySelectorAll(".save-story-btn").forEach((button) => {
      button.addEventListener("click", async (e) => {
        e.stopPropagation();
        const storyId = e.target.getAttribute("data-id");
        const story = this.#onlineStories.find((s) => s.id === storyId);

        if (story && !button.disabled) {
          button.disabled = true;
          button.textContent = "⏳ Menyimpan...";

          await this.#saveStoryToCache(story);

          button.textContent = "✅ Tersimpan";
        }
      });
    });

    document
      .querySelectorAll(".story-card-button-details")
      .forEach((button) => {
        button.addEventListener("click", (e) => {
          e.stopPropagation();
          const storyId = e.currentTarget.getAttribute("data-id");
          window.location.hash = `#/stories/${storyId}`;
        });
      });
  }
}
