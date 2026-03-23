const isLocalHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
window.ADMIN_API_BASE_URL = isLocalHost ? "" : "https://virtual-tour-qi.onrender.com";

// - Chạy trên server local thì sài phần này
// const savedBase = (window.localStorage.getItem("ADMIN_API_BASE_URL") || "").trim();
// window.ADMIN_API_BASE_URL = (savedBase || (isLocalHost ? "" : window.location.origin)).replace(/\/$/, "");