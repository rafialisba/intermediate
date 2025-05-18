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
  setupPWA,
  sendMessageToSW,
  saveUserPreference,
  getUserPreference,
} from "../../utils/idb-helper.js";

export default class HomePage {
  #presenter = null;
  #isOnline = navigator.onLine;
  #cachedStories = [];

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

      <!-- Tambahkan bagian untuk data yang disimpan di offline mode -->
      <section class="offline-data-section" id="offline-data-section">
        <h2>Data Tersimpan</h2>
        <p class="offline-info">Cerita yang tersimpan secara lokal akan muncul di sini dan tetap dapat diakses saat offline.</p>
        <div class="offline-data-count">
          <span id="cached-stories-count">0</span> cerita tersimpan di perangkat Anda
        </div>
        <div class="last-sync" id="last-sync">
          Terakhir disinkronkan: <span id="last-sync-time">Belum pernah</span>
        </div>
        <div class="cached-stories" id="cached-stories">
          <p id="no-cached-data" style="display: none;">Tidak ada data tersimpan. Koneksi ke internet diperlukan untuk mendapatkan cerita.</p>
        </div>
      </section>

      <section class="stories-section">
        <div class="stories-header">
          <h2>Cerita Terbaru</h2>
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

    await this.#loadStoriesWithCache();

    await this.#displayCachedData();
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
        }" loading="lazy" onerror="this.src='/images/placeholder.png';" />
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

        storyCard.addEventListener("click", (e) => {
          if (e.target.closest(".cached-story-map")) return;
          window.location.hash = `#/stories/${story.id}`;
        });

        cachedStoriesContainer.appendChild(storyCard);
      });
    } catch (error) {
      console.error("Error displaying cached data:", error);
    }
  }

  #showAllCachedStories() {
    const modal = document.createElement("div");
    modal.className = "cached-stories-modal";

    const modalContent = document.createElement("div");
    modalContent.className = "cached-stories-modal-content";

    const closeBtn = document.createElement("span");
    closeBtn.className = "close-modal";
    closeBtn.innerHTML = "&times;";
    closeBtn.addEventListener("click", () => {
      document.body.removeChild(modal);
    });

    const heading = document.createElement("h2");
    heading.textContent = "Semua Cerita Tersimpan";

    const storiesList = document.createElement("div");
    storiesList.className = "all-cached-stories-list";

    this.#cachedStories.forEach((story) => {
      const storyCard = document.createElement("div");
      storyCard.className = "modal-story-card";

      storyCard.innerHTML = `
        <img src="${story.photoUrl}" alt="${story.name}" loading="lazy" />
        <div class="modal-story-content">
          <h3>${story.name}</h3>
          <p>${story.description}</p>
          <p class="modal-story-date">${showFormattedDate(
            story.createdAt,
            "id-ID"
          )}</p>
        </div>
      `;

      storyCard.addEventListener("click", () => {
        window.location.hash = `#/stories/${story.id}`;
        document.body.removeChild(modal);
      });

      storiesList.appendChild(storyCard);
    });

    modalContent.appendChild(closeBtn);
    modalContent.appendChild(heading);
    modalContent.appendChild(storiesList);
    modal.appendChild(modalContent);

    document.body.appendChild(modal);

    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    });
  }

  async #loadStoriesWithCache() {
    this.showLoading();

    try {
      const cachedStories = await getStoriesFromIndexedDB();
      if (cachedStories && cachedStories.length > 0) {
        console.log("Showing cached stories from IndexedDB");
        this.showStories(cachedStories);
        this.hideLoading();

        await saveUserPreference("lastVisit", new Date().toISOString());
      }

      if (navigator.onLine) {
        this.#presenter.loadStories();
      } else {
        if (!cachedStories || cachedStories.length === 0) {
          this.showError(
            "Anda sedang offline dan tidak ada data lokal tersedia"
          );
          this.hideLoading();
        }
      }
    } catch (error) {
      console.error("Error loading stories with cache:", error);
      if (navigator.onLine) {
        this.#presenter.loadStories();
      } else {
        this.showError(
          "Tidak dapat memuat data. Silakan periksa koneksi internet Anda."
        );
        this.hideLoading();
      }
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
          icon: "/images/logo.png",
          badge: "/images/badge.png",
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
    alert(message);
  }

  showStories(stories) {
    const container = document.getElementById("story-list");

    const loading = document.getElementById("loading-text");
    if (loading) loading.style.display = "none";

    if (!stories.length) {
      container.innerHTML = `
        <h2>Cerita Terbaru</h2>
        <p>Tidak ada cerita ditemukan.</p>
      `;
      return;
    }

    container.innerHTML = "";

    stories.forEach((story) => {
      const storyCard = document.createElement("article");
      storyCard.className = "story-card";
      storyCard.innerHTML = `
          <img src="${story.photoUrl}" alt="${
        story.name
      }" loading="lazy" onerror="this.src='/images/placeholder.png';" />
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
          <button class="story-card-button-details" data-id="${
            story.id
          }">Details ></button>
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

    this.#setupDetailButtons();
  }

  #setupDetailButtons() {
    document
      .querySelectorAll(".story-card-button-details")
      .forEach((button) => {
        button.addEventListener("click", (e) => {
          const storyId = e.currentTarget.getAttribute("data-id");
          window.location.hash = `#/stories/${storyId}`;
        });
      });
  }
}
