import { getActiveRoute } from "../routes/url-parser";
import { ACCESS_TOKEN_KEY } from "../config";

export function getAccessToken() {
    try {
        const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);

        if (accessToken === "null" || accessToken === "undefined") {
            return null;
        }

        return accessToken;
    } catch (error) {
        console.error("getAccessToken: error:", error);
        return null;
    }
}

export function putAccessToken(token, redirect = true) {
    try {
        localStorage.setItem(ACCESS_TOKEN_KEY, token);

        if (redirect) {
            window.location.hash = "#/";
        }

        window.dispatchEvent(
            new CustomEvent("authStateChanged", {
                detail: { isAuthenticated: true },
            })
        );
        return true;
    } catch (error) {
        console.error("putAccessToken: error:", error);
        return false;
    }
}

export function removeAccessToken() {
    try {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        window.dispatchEvent(
            new CustomEvent("authStateChanged", {
                detail: { isAuthenticated: false },
            })
        );
        return true;
    } catch (error) {
        console.error("getLogout: error:", error);
        return false;
    }
}

export function isAuthenticated() {
    return !!getAccessToken();
}

export const unauthenticatedRoutesOnly = ["/login", "/register"];

export function checkUnauthenticatedRouteOnly(page) {
    const url = getActiveRoute();
    const isLogin = isAuthenticated();

    console.log(`CheckUnauthenticatedRouteOnly - url var: ${url}`);
    console.log(`isCheckUnauthenticatedRouteOnly - isLogin var: ${isLogin}`);

    if (unauthenticatedRoutesOnly.includes(url) && isLogin) {
        window.location.hash = "/";
        return null;
    }

    return page;
}

export function checkAuthenticatedRoute(page) {
    const isLogin = isAuthenticated();
    console.log(`checkAuthenticatedRouteMethod: ${isLogin}`);

    if (!isLogin) {
        window.location.hash = "/login";
        return null;
    }

    return page;
}

export function getLogout() {
    removeAccessToken();

    const authEvent = new CustomEvent("authStateChanged", {
        detail: { isAuthenticated: false },
    });
    window.dispatchEvent(authEvent);
}
