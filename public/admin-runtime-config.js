const isLocalHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
window.ADMIN_API_BASE_URL = isLocalHost ? "" : "https://virtual-tour-qi.onrender.com";