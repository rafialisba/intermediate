import { isSubscribedToPushNotifications } from "../../utils/notification-helper.js";

export default class TambahCeritaPresenter {
    #view;
    #model;

    constructor({ view, model }) {
        this.#view = view;
        this.#model = model;
    }

    async submitNewStory({ description, photo, lat, lon }) {
        try {
            this.#view.showLoading();

            const response = await this.#model.addNewStory({
                description,
                photo,
                lat,
                lon,
            });

            if (response.error) {
                this.#view.showError(response.message);
            } else {
                this.#view.showSuccess("Cerita berhasil dikirim!");

                const isSubscribed = await isSubscribedToPushNotifications();
                if (isSubscribed) {
                    console.log(
                        "User will receive push notification for this story"
                    );
                }
            }
        } catch (error) {
            console.error("submitNewStory error:", error);
            this.#view.showError("Gagal mengirim cerita.");
        } finally {
            this.#view.hideLoading();
        }
    }

    async submitNewStoryAsGuest({ description, photo, lat, lon }) {
        try {
            this.#view.showLoading();

            const response = await this.#model.addNewStoryGuest({
                description,
                photo,
                lat,
                lon,
            });

            if (response.error) {
                this.#view.showError(
                    response.message || "Gagal mengirim cerita sebagai tamu."
                );
            } else {
                this.#view.showSuccess("Cerita berhasil dikirim sebagai tamu!");
            }
        } catch (error) {
            console.error("submitNewStoryAsGuest error:", error);
            this.#view.showError("Gagal mengirim cerita sebagai tamu.");
        } finally {
            this.#view.hideLoading();
        }
    }
}
