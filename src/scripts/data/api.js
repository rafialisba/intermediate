import CONFIG from "../config";
import { getAccessToken } from "../utils/auth";

const ENDPOINTS = {
    LOGIN: `${CONFIG.BASE_URL}/login`,
    REGISTER: `${CONFIG.BASE_URL}/register`,
    GETALLSTORIES: `${CONFIG.BASE_URL}/stories`,
    ADDNEWSTORY: `${CONFIG.BASE_URL}/stories`,
    ADDNEWSTORYGUEST: `${CONFIG.BASE_URL}/stories/guest`,
    DETAILSTORY: `${CONFIG.BASE_URL}/stories/:id`,
    NOTIFICATION_SUBSCRIBE: `${CONFIG.BASE_URL}/notifications/subscribe`,
    NOTIFICATION_UNSUBSCRIBE: `${CONFIG.BASE_URL}/notifications/subscribe`,
};

export async function getData() {
    const fetchResponse = await fetch(ENDPOINTS.ENDPOINT);
    return await fetchResponse.json();
}

export async function getLogin({ email, password }) {
    const data = JSON.stringify({ email, password });

    const fetchResponse = await fetch(ENDPOINTS.LOGIN, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: data,
    });

    const json = await fetchResponse.json();

    return {
        ...json,
        ok: fetchResponse.ok,
    };
}

export async function getRegistered({ name, email, password }) {
    const data = JSON.stringify({ name, email, password });

    const fetchResponse = await fetch(ENDPOINTS.REGISTER, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: data,
    });

    const json = await fetchResponse.json();

    return {
        ...json,
        ok: fetchResponse.ok,
    };
}

export async function getAllStories({
    page = 1,
    size = 10,
    location = 0,
} = {}) {
    const url = new URL(ENDPOINTS.GETALLSTORIES);
    url.searchParams.set("page", page);
    url.searchParams.set("size", size);
    url.searchParams.set("location", location);

    const token = getAccessToken();

    const fetchResponse = await fetch(url.toString(), {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
    });

    const json = await fetchResponse.json();

    return {
        ...json,
        ok: fetchResponse.ok,
    };
}

export async function addNewStory({ description, photo, lat, lon }) {
    const token = getAccessToken();

    const formData = new FormData();
    formData.append("description", description);
    formData.append("photo", photo);

    if (lat !== undefined && lat !== null) formData.append("lat", lat);
    if (lon !== undefined && lon !== null) formData.append("lon", lon);

    const fetchResponse = await fetch(ENDPOINTS.ADDNEWSTORY, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
        },
        body: formData,
    });

    const json = await fetchResponse.json();

    return {
        ...json,
        ok: json.ok,
    };
}

export async function DetailStory(id) {
    try {
        if (!id) {
            throw new Error("ID tidak boleh kosong");
        }

        const token = getAccessToken();
        const url = ENDPOINTS.DETAILSTORY.replace(":id", id);

        console.log(`Fetching detail story from URL: ${url}`);

        const fetchResponse = await fetch(url, {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
        });

        const json = await fetchResponse.json();

        return {
            ...json,
            ok: fetchResponse.ok,
        };
    } catch (error) {
        console.error("Error in DetailStory API call:", error);
        return {
            error: true,
            message:
                error.message ||
                "Terjadi kesalahan saat mengambil detail cerita",
            ok: false,
        };
    }
}

export async function addNewStoryGuest({ description, photo, lat, lon }) {
    const formData = new FormData();
    formData.append("description", description);
    formData.append("photo", photo);

    if (lat !== undefined && lat !== null) formData.append("lat", lat);
    if (lon !== undefined && lon !== null) formData.append("lon", lon);

    const fetchResponse = await fetch(ENDPOINTS.ADDNEWSTORYGUEST, {
        method: "POST",
        body: formData,
    });

    const json = await fetchResponse.json();

    return {
        ...json,
        ok: fetchResponse.ok,
    };
}

export async function subscribeNotification({ endpoint, keys }) {
    const token = getAccessToken();

    const data = JSON.stringify({
        endpoint,
        keys,
    });

    const fetchResponse = await fetch(ENDPOINTS.NOTIFICATION_SUBSCRIBE, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: data,
    });

    const json = await fetchResponse.json();

    return {
        ...json,
        ok: fetchResponse.ok,
    };
}

export async function unsubscribeNotification({ endpoint }) {
    const token = getAccessToken();

    const data = JSON.stringify({
        endpoint,
    });

    const fetchResponse = await fetch(ENDPOINTS.NOTIFICATION_UNSUBSCRIBE, {
        method: "DELETE",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: data,
    });

    const json = await fetchResponse.json();

    return {
        ...json,
        ok: fetchResponse.ok,
    };
}
