export default class HomePagePresenter {
  #view;
  #model;

  constructor({ view, model }) {
    this.#view = view;
    this.#model = model;
  }

  async loadStories() {
    this.#view.showLoading();

    try {
      const response = await this.#model.getAllStories({
        location: 1,
      });

      if (!response.ok) {
        this.#view.showError(response.message);
        return;
      }

      this.#view.showStories(response.listStory);

      if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          action: "saveStories",
          data: response.listStory,
        });
      }
    } catch (error) {
      if (!navigator.onLine) {
        this.#view.showError(
          "Anda sedang offline. Menampilkan data lokal jika tersedia."
        );
      } else {
        this.#view.showError("Terjadi kesalahan saat mengambil data");
        console.error("loadStories error:", error);
      }
    } finally {
      this.#view.hideLoading();
    }
  }
}
