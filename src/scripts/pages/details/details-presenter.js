export default class DetailPagePresenter {
    #view = null;
    #model = null;
    #currentStoryId = null;

    constructor({ view, model }) {
        this.#view = view;
        this.#model = model;
    }

    async loadStoryDetail(storyId) {
        if (this.#currentStoryId === storyId && this._cachedStory) {
            console.log("Using cached story data for ID:", storyId);
            this.#view.showStoryDetail(this._cachedStory);
            return;
        }

        this.#currentStoryId = storyId;
        this.#view.showLoading();

        try {
            console.log("Fetching story detail for ID:", storyId);
            const response = await this.#model.DetailStory(storyId);

            console.log("Raw API response:", response);

            if (response.error || !response.ok) {
                console.error("API error:", response);
                this.#view.showError(
                    response.message || "Gagal memuat detail cerita"
                );

                this._cachedStory = null;
            } else {
                if (!response.story) {
                    console.error(
                        "Invalid API response structure: story property missing",
                        response
                    );
                    this.#view.showError("Format respons API tidak sesuai");
                    this._cachedStory = null;
                    return;
                }

                console.log("Story detail received:", response.story.id);

                const normalizedStory = this.#normalizeStory(response.story);

                this._cachedStory = normalizedStory;
                this.#view.showStoryDetail(normalizedStory);
            }
        } catch (error) {
            console.error("Error loading story detail:", error);
            this.#view.showError("Terjadi kesalahan saat memuat detail cerita");
            this._cachedStory = null;
        }
    }

    #normalizeStory(story) {
        return {
            id: story.id || "",
            name: story.name || "",
            description: story.description || "",
            photoUrl: story.photoUrl || "",
            createdAt: story.createdAt || new Date().toISOString(),
            lat:
                story.lat !== undefined && story.lat !== null
                    ? Number(story.lat)
                    : null,
            lon:
                story.lon !== undefined && story.lon !== null
                    ? Number(story.lon)
                    : null,
        };
    }

    clearCache() {
        this._cachedStory = null;
        this.#currentStoryId = null;
    }
}
