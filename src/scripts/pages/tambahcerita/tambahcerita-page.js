import TambahCeritaPresenter from "./tambahcerita-presenter";
import * as SnapPostAPI from "../../data/api.js";
import L from "leaflet";

export default class TambahCerita {
    #presenter = null;
    #stream = null;

    async render() {
        return `
      <section class="upload-form-section">
        <h1>Tambah Cerita Baru</h1>
        <div class="form-toggle">
            <button id="regular-form-btn" class="active">Login User</button>
            <button id="guest-form-btn">Guest User</button>
        </div>
        <form id="story-form">
            <div class="form-control-home">
               <video id="camera-preview" autoplay playsinline width="300"></video>
               <button id="capture-button" type="button">Ambil foto</button>
               <canvas id="snapshot" style="display: none;"></canvas>
             </div>
            <div id="map" style="height: 400px;"></div>
            <div class="form-control-home">
                <label for="description">Deskripsi:</label>
                <textarea id="description" name="description" required></textarea>
            </div>
            <div class="form-control-home">
                <p>Text based:</p>
                <input id="latitude" name="latitude" />
                <input id="longitude" name="longitude" />
            </div>
            <div class="form-button">
                <button type="submit" id="submit-button">Kirim cerita</button>
            </div>
            <div class="form-submission-type">
                <p>Mode pengiriman: <span id="submission-mode">Login User</span></p>
            </div>
        </form>
      </section>
    `;
    }

    async afterRender() {
        this.#presenter = new TambahCeritaPresenter({
            view: this,
            model: SnapPostAPI,
        });

        const video = document.getElementById("camera-preview");
        const canvas = document.getElementById("snapshot");
        const captureButton = document.getElementById("capture-button");
        const form = document.getElementById("story-form");
        const regularFormBtn = document.getElementById("regular-form-btn");
        const guestFormBtn = document.getElementById("guest-form-btn");
        const submissionMode = document.getElementById("submission-mode");

        let capturedBlob = null;
        let marker = null;
        let map = null;
        let isGuestMode = false;

        regularFormBtn.addEventListener("click", (e) => {
            e.preventDefault();
            isGuestMode = false;
            regularFormBtn.classList.add("active");
            guestFormBtn.classList.remove("active");
            submissionMode.textContent = "Login User";
        });

        guestFormBtn.addEventListener("click", (e) => {
            e.preventDefault();
            isGuestMode = true;
            guestFormBtn.classList.add("active");
            regularFormBtn.classList.remove("active");
            submissionMode.textContent = "Guest User";
        });

        window.addEventListener("hashchange", () => {
            this.stopCamera();
        });

        try {
            this.#stream = await navigator.mediaDevices.getUserMedia({
                video: true,
            });
            video.srcObject = this.#stream;
        } catch (err) {
            console.error("Camera access error:", err);
            alert("Gagal mengakses kamera: " + err.message);
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                document.getElementById("latitude").value =
                    position.coords.latitude;
                document.getElementById("longitude").value =
                    position.coords.longitude;

                initializeMap(
                    position.coords.latitude,
                    position.coords.longitude
                );
            },
            (error) => {
                console.error("Geolocation error:", error);
                alert("Gagal mengambil lokasi: " + error.message);

                initializeMap(-6.2, 106.8);
            }
        );

        const initializeMap = (lat, lng) => {
            const mapContainer = document.getElementById("map");

            setTimeout(() => {
                try {
                    void mapContainer.offsetHeight;

                    map = L.map("map", {
                        center: [lat, lng],
                        zoom: 13,
                    });

                    L.tileLayer(
                        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
                        {
                            attribution:
                                '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors',
                        }
                    ).addTo(map);

                    marker = L.marker([lat, lng])
                        .addTo(map)
                        .bindPopup("Lokasi Anda")
                        .openPopup();

                    map.on("click", function (e) {
                        const { lat, lng } = e.latlng;
                        document.getElementById("latitude").value = lat;
                        document.getElementById("longitude").value = lng;

                        if (marker) marker.remove();

                        marker = L.marker([lat, lng])
                            .addTo(map)
                            .bindPopup("Lokasi dipilih")
                            .openPopup();
                    });

                    map.invalidateSize(true);
                } catch (error) {
                    console.error("Map initialization error:", error);
                }
            }, 300);
        };

        captureButton.addEventListener("click", () => {
            if (!this.#stream) {
                alert("Kamera tidak tersedia. Coba muat ulang halaman.");
                return;
            }

            const context = canvas.getContext("2d");
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            context.drawImage(video, 0, 0, canvas.width, canvas.height);

            canvas.toBlob(
                (blob) => {
                    capturedBlob = blob;
                    alert("Foto berhasil diambil!");
                },
                "image/jpeg",
                0.9
            );
        });

        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            const description = document.getElementById("description").value;
            const lat = document.getElementById("latitude").value;
            const lon = document.getElementById("longitude").value;

            if (!capturedBlob) {
                alert("Silakan ambil foto dulu.");
                return;
            }

            if (isGuestMode) {
                await this.#presenter.submitNewStoryAsGuest({
                    description,
                    photo: capturedBlob,
                    lat,
                    lon,
                });
            } else {
                await this.#presenter.submitNewStory({
                    description,
                    photo: capturedBlob,
                    lat,
                    lon,
                });
            }

            form.reset();
            if (capturedBlob) {
                capturedBlob = null;
            }
        });
    }

    stopCamera() {
        if (this.#stream) {
            this.#stream.getTracks().forEach((track) => track.stop());
            this.#stream = null;
            console.log("Camera stream stopped");
        }
    }

    showLoading() {
        document.getElementById("submit-button").disabled = true;
        document.getElementById("submit-button").textContent = "Mengirim...";
    }

    hideLoading() {
        document.getElementById("submit-button").disabled = false;
        document.getElementById("submit-button").textContent = "Kirim cerita";
    }

    showError(message) {
        alert(message);
    }

    showSuccess(message) {
        alert(message);
        window.location.hash = "#/";
    }
}
