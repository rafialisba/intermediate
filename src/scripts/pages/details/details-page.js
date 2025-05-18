import DetailPagePresenter from "./details-presenter.js";
import { showFormattedDate } from "../../utils/index.js";
import L from "leaflet";
import * as SnapPostAPI from "../../data/api.js";

export default class DetailPage {
    #presenter = null;
    #storyId = null;
    #map = null;
    #marker = null;

    constructor() {}

    async render() {
        return `
      <section class="container-detail">
        <div class="detail-header">
          <h1>Detail Cerita</h1>
          <a href="#/" class="back-button">← Kembali ke Beranda</a>
        </div>
        
        <div class="story-detail-container" id="story-detail">
          <div class="loading-indicator" id="loading-indicator">
            <p>Memuat detail cerita...</p>
          </div>
          
          <div class="error-message" id="error-message" style="display: none;"></div>
          
          <div class="story-content" id="story-content" style="display: none;">
            <div class="story-image-container">
              <img id="story-photo" src="" alt="Foto cerita" class="story-photo">
            </div>
            
            <div class="story-meta">
              <h2 id="story-name"></h2>
              <p class="created-at" id="created-at"></p>
            </div>
            
            <div class="story-description">
              <p id="story-description"></p>
            </div>
            
            <div class="coordinate">
              <p id="detail-latitude">Latitude: -</p>
              <p id="detail-longitude">Longitude: -</p>
            </div>
          </div>
          <div class="map-session">
            <div id="detail-map" class="detail-map"></div>
          </div>
        </div>
      </section>
    `;
    }

    async afterRender() {
        this.cleanupMap();

        this.#storyId = this.#getStoryIdFromUrl();

        if (!this.#presenter) {
            this.#presenter = new DetailPagePresenter({
                view: this,
                model: SnapPostAPI,
            });
        }

        const backButton = document.querySelector(".back-button");
        if (backButton) {
            const newBackButton = backButton.cloneNode(true);
            backButton.parentNode.replaceChild(newBackButton, backButton);

            newBackButton.addEventListener("click", (e) => {
                e.preventDefault();
                window.location.hash = "#/";
            });
        }

        if (this.#storyId) {
            console.log("Loading story detail for ID:", this.#storyId);
            await this.#presenter.loadStoryDetail(this.#storyId);
        } else {
            this.showError("ID Cerita tidak valid");
        }
    }

    cleanupMap() {
        if (this.#map) {
            console.log("Cleaning up previous map");
            this.#map.remove();
            this.#map = null;
            this.#marker = null;
        }
    }

    stopCamera() {
        this.cleanupMap();
    }

    #getStoryIdFromUrl() {
        const hash = window.location.hash;
        const match = hash.match(/#\/stories\/([a-zA-Z0-9-_]+)/);

        if (!match || !match[1]) {
            console.error("Invalid story ID in URL");
            setTimeout(() => {
                this.showError("ID Cerita tidak valid dalam URL");
            }, 0);
            return null;
        }

        return match[1];
    }

    #initializeMap(lat, lng) {
        const mapContainer = document.getElementById("detail-map");
        if (!mapContainer) {
            console.error("Map container not found");
            return;
        }

        if (
            typeof lat !== "number" ||
            isNaN(lat) ||
            typeof lng !== "number" ||
            isNaN(lng)
        ) {
            console.error("Invalid coordinates:", lat, lng);
            mapContainer.style.display = "none";
            return;
        }

        mapContainer.style.display = "block";

        setTimeout(() => {
            try {
                void mapContainer.offsetHeight;

                this.cleanupMap();

                console.log("Initializing map at", lat, lng);
                this.#map = L.map("detail-map", {
                    center: [lat, lng],
                    zoom: 13,
                    attributionControl: true,
                });

                L.tileLayer(
                    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
                    {
                        attribution:
                            '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors',
                    }
                ).addTo(this.#map);

                this.#marker = L.marker([lat, lng])
                    .addTo(this.#map)
                    .bindPopup("Lokasi Cerita")
                    .openPopup();

                this.#map.invalidateSize(true);

                setTimeout(() => {
                    if (this.#map) {
                        this.#map.invalidateSize(true);
                    }
                }, 500);
            } catch (error) {
                console.error("Detail map initialization error:", error);
                mapContainer.style.display = "none";
            }
        }, 300);
    }

    showLoading() {
        const loadingIndicator = document.getElementById("loading-indicator");
        const errorMessage = document.getElementById("error-message");
        const storyContent = document.getElementById("story-content");

        if (loadingIndicator) loadingIndicator.style.display = "block";
        if (errorMessage) errorMessage.style.display = "none";
        if (storyContent) storyContent.style.display = "none";
    }

    showError(message) {
        const loadingIndicator = document.getElementById("loading-indicator");
        const errorMessage = document.getElementById("error-message");
        const storyContent = document.getElementById("story-content");

        if (loadingIndicator) loadingIndicator.style.display = "none";
        if (errorMessage) {
            errorMessage.style.display = "block";
            errorMessage.textContent = message;
        }
        if (storyContent) storyContent.style.display = "none";
    }

    showStoryDetail(story) {
        console.log("Showing story detail:", story);

        if (!story || !story.id) {
            this.showError("Data cerita tidak valid atau kosong");
            return;
        }

        const loadingIndicator = document.getElementById("loading-indicator");
        const errorMessage = document.getElementById("error-message");
        const storyContent = document.getElementById("story-content");

        if (loadingIndicator) loadingIndicator.style.display = "none";
        if (errorMessage) errorMessage.style.display = "none";
        if (storyContent) storyContent.style.display = "block";

        const storyPhoto = document.getElementById("story-photo");
        const storyName = document.getElementById("story-name");
        const storyDescription = document.getElementById("story-description");
        const createdAt = document.getElementById("created-at");

        if (storyPhoto) {
            storyPhoto.src = story.photoUrl || "";
            storyPhoto.alt = story.name || "Foto cerita";
        }
        if (storyName)
            storyName.textContent = story.name || "Cerita tanpa judul";
        if (storyDescription)
            storyDescription.textContent =
                story.description || "Tidak ada deskripsi";
        if (createdAt && story.createdAt) {
            try {
                createdAt.textContent = `Diposting pada ${showFormattedDate(
                    story.createdAt,
                    "id-ID"
                )}`;
            } catch (error) {
                console.error("Error formatting date:", error);
                createdAt.textContent =
                    "Diposting pada waktu yang tidak diketahui";
            }
        }

        const latElement = document.getElementById("detail-latitude");
        const longElement = document.getElementById("detail-longitude");
        const mapElement = document.getElementById("detail-map");

        const lat = story.lat !== undefined ? Number(story.lat) : null;
        const lon = story.lon !== undefined ? Number(story.lon) : null;

        if (lat !== null && !isNaN(lat) && lon !== null && !isNaN(lon)) {
            if (latElement) latElement.textContent = `Latitude: ${lat}`;
            if (longElement) longElement.textContent = `Longitude: ${lon}`;

            this.#initializeMap(lat, lon);
        } else {
            if (latElement) latElement.textContent = "Tidak ada data latitude";
            if (longElement)
                longElement.textContent = "Tidak ada data longitude";
            if (mapElement) mapElement.style.display = "none";
        }
    }
}
