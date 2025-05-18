import routes from "../routes/routes";
import { getActiveRoute } from "../routes/url-parser";
import { isAuthenticated, unauthenticatedRoutesOnly } from "../utils/auth";

class App {
    #content = null;
    #drawerButton = null;
    #navigationDrawer = null;
    #currentPage = null;
    #logoutButton = null;

    constructor({ navigationDrawer, drawerButton, content, logoutButton }) {
        this.#content = content;
        this.#drawerButton = drawerButton;
        this.#navigationDrawer = navigationDrawer;
        this.#logoutButton = logoutButton;

        this.#setupDrawer();
        this.#setupLogoutButtonVisibility();
    }

    #setupDrawer() {
        this.#drawerButton.addEventListener("click", () => {
            this.#navigationDrawer.classList.toggle("open");
        });

        document.body.addEventListener("click", (event) => {
            if (
                !this.#navigationDrawer.contains(event.target) &&
                !this.#drawerButton.contains(event.target)
            ) {
                this.#navigationDrawer.classList.remove("open");
            }

            this.#navigationDrawer.querySelectorAll("a").forEach((link) => {
                if (link.contains(event.target)) {
                    this.#navigationDrawer.classList.remove("open");
                }
            });
        });
    }

    #setupLogoutButtonVisibility() {
        if (!this.#logoutButton) {
            console.error("Tombol logout tidak ditemukan!");
            return;
        }

        const updateLogoutVisibility = () => {
            const isLogin = isAuthenticated();
            const currentPage = window.location.hash;

            if (
                isLogin &&
                currentPage !== "#/login" &&
                currentPage !== "#/register"
            ) {
                this.#logoutButton.style.display = "inline-block";
            } else {
                this.#logoutButton.style.display = "none";
            }
        };

        updateLogoutVisibility();

        window.addEventListener("hashchange", updateLogoutVisibility);

        setInterval(updateLogoutVisibility, 500);
    }

    async renderPage() {
        try {
            const url = getActiveRoute();
            let page = routes[url];

            if (!page) {
                console.error(`Route not found: ${url}`);
                window.location.hash = isAuthenticated() ? "#/" : "#/login";
                return;
            }

            if (
                !isAuthenticated() &&
                !unauthenticatedRoutesOnly.includes(url)
            ) {
                window.location.hash = "#/login";
                return;
            }

            if (isAuthenticated() && unauthenticatedRoutesOnly.includes(url)) {
                window.location.hash = "#/";
                return;
            }

            console.log("Routing:", { url, page });

            if ("startViewTransition" in document) {
                const transition = document.startViewTransition(async () => {
                    await this.#renderPageContent(page);
                });
            } else {
                await this.#renderPageContent(page);
            }
        } catch (error) {
            console.error("Error rendering page:", error);
            window.location.hash = isAuthenticated() ? "#/" : "#/login";
        }
    }

    async #renderPageContent(page) {
        if (
            this.#currentPage &&
            typeof this.#currentPage.stopCamera === "function"
        ) {
            this.#currentPage.stopCamera();
        }

        this.#content.innerHTML = await page.render();
        this.#currentPage = page;

        if (typeof page.afterRender === "function") {
            await page.afterRender();
        }
    }
}

export default App;
