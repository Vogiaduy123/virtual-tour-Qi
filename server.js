require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const os = require("os");
const nodemailer = require("nodemailer");

// Import admin routes
const adminRoutes = require("./public/admin-api");

const app = express();
const PORT = process.env.PORT || 3000;
const DEFAULT_UPLOADS_DIR = path.join(__dirname, "uploads");
const RAW_UPLOAD_DIR = String(process.env.UPLOAD_DIR || "").trim();
const ENV_UPLOADS_DIR = RAW_UPLOAD_DIR
  ? (path.isAbsolute(RAW_UPLOAD_DIR) ? RAW_UPLOAD_DIR : path.resolve(__dirname, RAW_UPLOAD_DIR))
  : "";
const LEGACY_UPLOADS_DIR = path.join(__dirname, "uploads");

function canUseDirectory(dirPath) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    fs.accessSync(dirPath, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveUploadsDir() {
  const candidates = [
    ENV_UPLOADS_DIR,
    DEFAULT_UPLOADS_DIR,
    path.join(os.tmpdir(), "virtual-tour-uploads")
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (canUseDirectory(candidate)) {
      if (candidate !== ENV_UPLOADS_DIR && ENV_UPLOADS_DIR) {
        console.warn(`[UPLOAD_DIR] Cannot write to ${ENV_UPLOADS_DIR}. Fallback to ${candidate}`);
      }
      return candidate;
    }
  }

  throw new Error("No writable uploads directory found. Please set UPLOAD_DIR to a writable path.");
}

const UPLOADS_DIR = resolveUploadsDir();

/* ===== DATA FILES ===== */
const DATA_FILE = path.join(__dirname, "data", "rooms.json");
const MINIMAP_FILE = path.join(__dirname, "data", "minimap.json");
const SENSORS_FILE = path.join(__dirname, "data", "sensors.json");
const API_CONFIG_FILE = path.join(__dirname, "data", "api-config.json");
const ROOM_API_CONFIGS_DIR = path.join(__dirname, "data", "room-api-configs");

// Create room-api-configs directory if not exists
if (!fs.existsSync(ROOM_API_CONFIGS_DIR)) {
  fs.mkdirSync(ROOM_API_CONFIGS_DIR, { recursive: true });
}

/* ===== SSE CLIENTS ===== */
const sseClients = new Set();

// Đọc danh sách phòng từ file dữ liệu.
function getRooms() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE));
  } catch {
    return [];
  }
}

// Đọc cấu hình minimap hiện tại.
function getMinimap() {
  try {
    return JSON.parse(fs.readFileSync(MINIMAP_FILE));
  } catch {
    return { image: "", markers: [] };
  }
}

// Đọc danh sách sensor từ file dữ liệu.
function getSensors() {
  try {
    return JSON.parse(fs.readFileSync(SENSORS_FILE));
  } catch {
    return [];
  }
}

// Trả về cấu hình API mặc định dùng khi chưa có file cấu hình.
function getDefaultApiConfig() {
  return {
    weatherApi: {
      provider: "openweathermap",
      url: "https://api.openweathermap.org/data/2.5/weather",
      apiKey: "",
      params: { lat: 10.7769, lon: 106.7009, units: "metric" }
    },
    airQualityApi: {
      provider: "waqi",
      url: "https://api.waqi.info/feed/@13659/",
      token: ""
    },
    refreshInterval: 10000,
    autoRefresh: true
  };
}

// Lấy cấu hình API từ file, fallback về mặc định nếu lỗi.
function getApiConfig() {
  try {
    return JSON.parse(fs.readFileSync(API_CONFIG_FILE));
  } catch {
    return getDefaultApiConfig();
  }
}

// Lưu cấu hình API tổng vào file.
function saveApiConfig(config) {
  fs.writeFileSync(API_CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Phát dữ liệu sensor mới cho các client SSE đang kết nối.
function broadcastSensors() {
  const payload = JSON.stringify(getSensors());
  const message = `event: sensors\ndata: ${payload}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(message);
    } catch {
      sseClients.delete(res);
    }
  }
}

// Phát dữ liệu phòng mới cho các client SSE đang kết nối.
function broadcastRooms() {
  const payload = JSON.stringify(getRooms());
  const message = `event: rooms\ndata: ${payload}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(message);
    } catch {
      // Remove broken clients
      sseClients.delete(res);
    }
  }
}

// Đọc cấu hình SMTP từ biến môi trường.
function getSmtpConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secure = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";
  const from = process.env.MAIL_FROM || user;

  return { host, port, user, pass, secure, from };
}

// Tạo transporter Nodemailer theo cấu hình SMTP.
function createMailTransporter(config) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass
    }
  });
}

// Đọc cấu hình gửi mail qua HTTP API (Resend/Brevo/SendGrid).
function getMailApiConfig() {
  const provider = String(process.env.MAIL_PROVIDER || "").trim().toLowerCase();
  const from = process.env.MAIL_FROM;

  return {
    provider,
    from,
    resendApiKey: process.env.RESEND_API_KEY,
    brevoApiKey: process.env.BREVO_API_KEY,
    sendgridApiKey: process.env.SENDGRID_API_KEY
  };
}

// Tách chuỗi email dạng "Name <email>" về object chuẩn.
function parseEmailAddress(email) {
  const value = String(email || "").trim();
  const match = value.match(/^(.*)<(.+)>$/);
  if (match) {
    return { name: match[1].trim().replace(/^"|"$/g, ""), email: match[2].trim() };
  }
  return { email: value };
}

// Gửi mail qua nhà cung cấp HTTP API theo MAIL_PROVIDER.
async function sendMailViaHttpApi({ provider, apiKey, from, toList, subject, text, html }) {
  const normalizedProvider = String(provider || "").toLowerCase();

  if (normalizedProvider === "resend") {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        from,
        to: toList,
        subject,
        text,
        html
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.message || data?.error || `Resend error ${response.status}`);
    }

    return { messageId: data?.id || null, provider: "resend" };
  }

  if (normalizedProvider === "brevo") {
    const sender = parseEmailAddress(from);
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey
      },
      body: JSON.stringify({
        sender,
        to: toList.map(email => ({ email })),
        subject,
        textContent: text,
        htmlContent: html
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.message || data?.code || `Brevo error ${response.status}`);
    }

    return { messageId: data?.messageId || null, provider: "brevo" };
  }

  if (normalizedProvider === "sendgrid") {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        from: parseEmailAddress(from),
        personalizations: [{ to: toList.map(email => ({ email })) }],
        subject,
        content: [
          { type: "text/plain", value: text || "" },
          { type: "text/html", value: html || "" }
        ]
      })
    });

    if (!response.ok) {
      const textBody = await response.text().catch(() => "");
      const snippet = String(textBody || "").slice(0, 300);
      throw new Error(snippet || `SendGrid error ${response.status}`);
    }

    return {
      messageId: response.headers.get("x-message-id") || null,
      provider: "sendgrid"
    };
  }

  throw new Error("Unsupported MAIL_PROVIDER. Use: resend, brevo, sendgrid, or smtp");
}

// Escape HTML để tránh lỗi hiển thị và chèn mã độc trong email.
function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Dựng nội dung email (HTML + plain text) cho ghi chú virtual tour.
function buildVirtualTourMailContent({ pageUrl, summary, notes }) {
  const safeSummary = summary && String(summary).trim() ? String(summary).trim() : "(Không có)";
  const safePageUrl = pageUrl && String(pageUrl).trim() ? String(pageUrl).trim() : "";
  const safeNotes = Array.isArray(notes) ? notes : [];

  const formatCoord = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(6) : "N/A";
  };

  const notesHtml = safeNotes.length
    ? safeNotes
      .map((note) => {
          const roomName = escapeHtml(note?.roomName || "Không xác định");
          const content = escapeHtml(note?.content || "");
          const yaw = escapeHtml(formatCoord(note?.yaw));
          const pitch = escapeHtml(formatCoord(note?.pitch));
          const time = escapeHtml(note?.time || new Date().toISOString());

          return `
            <li style="margin-bottom: 10px;">
              <div><strong>Phòng:</strong> ${roomName}</div>
              <div><strong>Nội dung:</strong> ${content || "(Trống)"}</div>
              <div><strong>Tọa độ:</strong> yaw=${yaw}, pitch=${pitch}</div>
              <div><strong>Thời gian:</strong> ${time}</div>
            </li>
          `;
        })
        .join("")
    : '<li>Không có ghi chú.</li>';

  const html = `
    <div style="font-family: Arial, sans-serif; color: #222; line-height: 1.5;">
      <h2 style="margin-bottom: 18px;">GHI CHÚ TỪ VIRTUAL TOUR</h2>
      ${safePageUrl ? `<p><strong>Trang:</strong> <a href="${escapeHtml(safePageUrl)}">${escapeHtml(safePageUrl)}</a></p>` : ""}
      <p><strong>Nội dung tổng quát:</strong><br>${escapeHtml(safeSummary)}</p>
      <div style="margin-top: 12px;"><strong>Danh sách ghi chú:</strong></div>
      <ol style="padding-left: 18px; margin-top: 8px;">${notesHtml}</ol>
    </div>
  `;

  const notesText = safeNotes.length
    ? safeNotes
        .map((note, index) => {
          const roomName = note?.roomName || "Không xác định";
          const content = note?.content || "(Trống)";
          const yaw = formatCoord(note?.yaw);
          const pitch = formatCoord(note?.pitch);
          const time = note?.time || new Date().toISOString();
          return `${index + 1}. Phòng: ${roomName}\n   Nội dung: ${content}\n   -Tọa độ: yaw=${yaw}, pitch=${pitch}\n   -Thời gian: ${time}`;
        })
        .join("\n\n")
    : "1. Không có ghi chú.";

  const text = `GHI CHÚ TỪ VIRTUAL TOUR\n\n${safePageUrl ? `Trang: ${safePageUrl}\n\n` : ""}Nội dung tổng quát:\n${safeSummary}\n\nDanh sách ghi chú:\n${notesText}`;

  return { html, text };
}
if (!fs.existsSync(API_CONFIG_FILE)) {
  const defaultConfig = {
    weatherApi: {
      provider: "openweathermap",
      url: "https://api.openweathermap.org/data/2.5/weather",
      apiKey: "bce5ee254644957ef51a0314ba2f36f7",
      params: { lat: 10.7769, lon: 106.7009, units: "metric" }
    },
    airQualityApi: {
      provider: "waqi",
      url: "https://api.waqi.info/feed/@13659/",
      token: "d61e181df66964a513acd018c7cdb9c9993226d1"
    },
    refreshInterval: 10000,
    autoRefresh: true
  };
  fs.writeFileSync(API_CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
}

/* ===== MIDDLEWARE ===== */
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(express.static("dist"));
app.use("/uploads", express.static(UPLOADS_DIR));
if (path.resolve(LEGACY_UPLOADS_DIR) !== path.resolve(UPLOADS_DIR)) {
  // Backward-compatibility: keep serving old files previously saved in local uploads.
  app.use("/uploads", express.static(LEGACY_UPLOADS_DIR));
}
app.use("/backend/tiles", express.static("backend/tiles"));

// Fallback for development mode when frontend isn't built to dist/
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="utf-8">
      <title>Dev Mode - Virtual Tour</title>
      <style>
        body { font-family: system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #f0f4f8; margin: 0; color: #333; }
        .card { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); text-align: center; }
        h1 { margin-top: 0; color: #2c3e50; }
        a { display: inline-block; margin-top: 20px; padding: 12px 24px; background: #3498db; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; transition: background 0.3s; }
        a:hover { background: #2980b9; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Vite Dev Mode Tích Cực 🚀</h1>
        <p>Giao diện xem tour đang chạy trên cổng Vite thay vì server Express hiện tại.</p>
        <p>Vui lòng click vào link bên dưới nếu trình duyệt không tự chuyển hướng:</p>
        <a href="http://localhost:5173/">Mở Frontend VITE (localhost:5173)</a>
      </div>
      <script>
        setTimeout(() => { window.location.href = "http://localhost:5173/"; }, 3000);
      </script>
    </body>
    </html>
  `);
});

/* ===== INIT FOLDERS ===== */
if (!canUseDirectory(UPLOADS_DIR)) {
  throw new Error(`Cannot create/write uploads directory: ${UPLOADS_DIR}`);
}
if (!fs.existsSync("data")) fs.mkdirSync("data");
if (!fs.existsSync("backend")) fs.mkdirSync("backend");
if (!fs.existsSync("backend/raw")) fs.mkdirSync("backend/raw", { recursive: true });
if (!fs.existsSync("backend/tiles")) fs.mkdirSync("backend/tiles", { recursive: true });

// Ensure data files exist
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, "[]");
}
if (!fs.existsSync(MINIMAP_FILE)) {
  fs.writeFileSync(MINIMAP_FILE, JSON.stringify({ image: "", markers: [] }, null, 2));
}
if (!fs.existsSync(SENSORS_FILE)) {
  fs.writeFileSync(SENSORS_FILE, "[]");
}

/* ===== SSE ENDPOINT ===== */
app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  // Add to clients set
  sseClients.add(res);

  // Send initial rooms snapshot
  const initial = JSON.stringify(getRooms());
  res.write(`event: rooms\ndata: ${initial}\n\n`);

  // Send initial sensors snapshot
  const initialSensors = JSON.stringify(getSensors());
  res.write(`event: sensors\ndata: ${initialSensors}\n\n`);

  req.on("close", () => {
    sseClients.delete(res);
  });
});

/* ===== MULTER ===== */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

/* ===== ROUTES ===== */

// TEST
app.get("/test", (req, res) => {
  res.send("SERVER OK");
});

// GET ROOMS
app.get("/api/rooms", (req, res) => {
  const rooms = JSON.parse(fs.readFileSync(DATA_FILE));
  res.json(rooms);
});

// UPDATE HOTSPOT
app.put("/api/rooms/:id/hotspots", (req, res) => {
  const roomId = Number(req.params.id);
  const { yaw, pitch, target, rotation, color } = req.body;

  console.log("PUT hotspot payload:", {
    roomId,
    yaw,
    pitch,
    target,
    rotation,
    color
  });

  // Basic validation
  if ([yaw, pitch, target].some(v => v === undefined || v === null || v === "")) {
    return res.status(400).json({ success: false, error: "Missing yaw/pitch/target" });
  }

  const rooms = JSON.parse(fs.readFileSync(DATA_FILE));
  const room = rooms.find(r => r.id === roomId);

  if (!room) {
    console.log("Room not found for add hotspot", roomId);
    return res.status(404).json({ success: false, error: "Room not found" });
  }

  if (!room.hotspots) {
    room.hotspots = [];
  }

  const hotspot = {
    yaw: Number(yaw),
    pitch: Number(pitch),
    target: Number(target)
  };

  if (rotation !== undefined) hotspot.rotation = Number(rotation);
  if (color !== undefined) hotspot.color = color;

  room.hotspots.push(hotspot);

  fs.writeFileSync(DATA_FILE, JSON.stringify(rooms, null, 2));
  console.log("Hotspot added successfully", { roomId, index: room.hotspots.length - 1 });
  // Notify connected users
  broadcastRooms();
  res.json({ success: true, room });
});

// DELETE HOTSPOT
app.delete("/api/rooms/:id/hotspots/:index", (req, res) => {
  console.log("DELETE request received:", req.params);
  
  const roomId = Number(req.params.id);
  const index = Number(req.params.index);

  console.log("roomId:", roomId, "index:", index);

  const rooms = JSON.parse(fs.readFileSync(DATA_FILE));
  const room = rooms.find(r => r.id === roomId);

  if (!room) {
    console.log("Room not found!");
    return res.status(404).json({ success: false, error: "Room not found" });
  }

  if (!room.hotspots || index < 0 || index >= room.hotspots.length) {
    console.log("Invalid hotspot index:", index, "length:", room.hotspots?.length);
    return res.status(400).json({ success: false, error: "Invalid hotspot index" });
  }

  room.hotspots.splice(index, 1);

  fs.writeFileSync(DATA_FILE, JSON.stringify(rooms, null, 2));
  console.log("Hotspot deleted successfully");
  // Notify connected users
  broadcastRooms();
  res.json({ success: true, room });
});

// UPDATE HOTSPOT (edit existing)
app.patch("/api/rooms/:id/hotspots/:index", (req, res) => {
  console.log("PATCH request received:", req.params);
  
  const roomId = Number(req.params.id);
  const index = Number(req.params.index);
  const { yaw, pitch, target, rotation, color } = req.body;

  const rooms = JSON.parse(fs.readFileSync(DATA_FILE));
  const room = rooms.find(r => r.id === roomId);

  if (!room) {
    return res.status(404).json({ success: false, error: "Room not found" });
  }

  if (!room.hotspots || index < 0 || index >= room.hotspots.length) {
    return res.status(400).json({ success: false, error: "Invalid hotspot index" });
  }

  // Update existing hotspot
  if (yaw !== undefined) room.hotspots[index].yaw = yaw;
  if (pitch !== undefined) room.hotspots[index].pitch = pitch;
  if (target !== undefined) room.hotspots[index].target = target;
  if (rotation !== undefined) room.hotspots[index].rotation = rotation;
  if (color !== undefined) room.hotspots[index].color = color;

  fs.writeFileSync(DATA_FILE, JSON.stringify(rooms, null, 2));
  console.log("Hotspot updated successfully");
  // Notify connected users
  broadcastRooms();
  res.json({ success: true, room });
});

// GET MAIL HOTSPOTS
app.get("/api/rooms/:id/mail-hotspots", (req, res) => {
  const roomId = Number(req.params.id);
  const rooms = JSON.parse(fs.readFileSync(DATA_FILE));
  const room = rooms.find(r => r.id === roomId);

  if (!room) {
    return res.status(404).json({ success: false, error: "Room not found" });
  }

  res.json({ success: true, mailHotspots: room.mailHotspots || [] });
});

// ADD MAIL HOTSPOT
app.post("/api/rooms/:id/mail-hotspots", (req, res) => {
  const roomId = Number(req.params.id);
  const { yaw, pitch, screenX, screenY, title, recipient, subject, body } = req.body;

  const hasSphericalCoords = ![yaw, pitch].some(v => v === undefined || v === null || v === "");
  const hasScreenCoords = ![screenX, screenY].some(v => v === undefined || v === null || v === "");

  if (!hasSphericalCoords && !hasScreenCoords) {
    return res.status(400).json({ success: false, error: "Missing coordinates (yaw/pitch or screenX/screenY)" });
  }

  const rooms = JSON.parse(fs.readFileSync(DATA_FILE));
  const room = rooms.find(r => r.id === roomId);

  if (!room) {
    return res.status(404).json({ success: false, error: "Room not found" });
  }

  if (!room.mailHotspots) {
    room.mailHotspots = [];
  }

  const mailHotspot = {
    title: title || "Gửi mail",
    recipient: recipient || "",
    subject: subject || "",
    body: body || "",
    updatedAt: new Date().toISOString()
  };

  if (hasSphericalCoords) {
    mailHotspot.yaw = Number(yaw);
    mailHotspot.pitch = Number(pitch);
  }

  if (hasScreenCoords) {
    mailHotspot.screenX = Math.max(0, Math.min(1, Number(screenX)));
    mailHotspot.screenY = Math.max(0, Math.min(1, Number(screenY)));
  }

  room.mailHotspots.push(mailHotspot);

  fs.writeFileSync(DATA_FILE, JSON.stringify(rooms, null, 2));
  broadcastRooms();
  res.json({ success: true, room });
});

// UPDATE MAIL HOTSPOT
app.patch("/api/rooms/:id/mail-hotspots/:index", (req, res) => {
  const roomId = Number(req.params.id);
  const index = Number(req.params.index);
  const { yaw, pitch, screenX, screenY, title, recipient, subject, body } = req.body;

  const rooms = JSON.parse(fs.readFileSync(DATA_FILE));
  const room = rooms.find(r => r.id === roomId);

  if (!room) {
    return res.status(404).json({ success: false, error: "Room not found" });
  }

  if (!room.mailHotspots || index < 0 || index >= room.mailHotspots.length) {
    return res.status(400).json({ success: false, error: "Invalid mail hotspot index" });
  }

  if (yaw !== undefined) room.mailHotspots[index].yaw = Number(yaw);
  if (pitch !== undefined) room.mailHotspots[index].pitch = Number(pitch);
  if (screenX !== undefined) room.mailHotspots[index].screenX = Math.max(0, Math.min(1, Number(screenX)));
  if (screenY !== undefined) room.mailHotspots[index].screenY = Math.max(0, Math.min(1, Number(screenY)));
  if (title !== undefined) room.mailHotspots[index].title = title;
  if (recipient !== undefined) room.mailHotspots[index].recipient = recipient;
  if (subject !== undefined) room.mailHotspots[index].subject = subject;
  if (body !== undefined) room.mailHotspots[index].body = body;
  room.mailHotspots[index].updatedAt = new Date().toISOString();

  fs.writeFileSync(DATA_FILE, JSON.stringify(rooms, null, 2));
  broadcastRooms();
  res.json({ success: true, room });
});

// DELETE MAIL HOTSPOT
app.delete("/api/rooms/:id/mail-hotspots/:index", (req, res) => {
  const roomId = Number(req.params.id);
  const index = Number(req.params.index);

  const rooms = JSON.parse(fs.readFileSync(DATA_FILE));
  const room = rooms.find(r => r.id === roomId);

  if (!room) {
    return res.status(404).json({ success: false, error: "Room not found" });
  }

  if (!room.mailHotspots || index < 0 || index >= room.mailHotspots.length) {
    return res.status(400).json({ success: false, error: "Invalid mail hotspot index" });
  }

  room.mailHotspots.splice(index, 1);
  fs.writeFileSync(DATA_FILE, JSON.stringify(rooms, null, 2));
  broadcastRooms();
  res.json({ success: true, room });
});

// SEND MAIL
app.post("/api/mail/send", async (req, res) => {
  try {
    const { to, subject, body, pageUrl, summary, notes, format } = req.body;

    if (!to) {
      return res.status(400).json({ success: false, error: "Missing recipient (to)" });
    }

    const normalizedTo = Array.isArray(to)
      ? to.filter(Boolean).join(",")
      : String(to)
          .split(",")
          .map(email => email.trim())
          .filter(Boolean)
          .join(",");

    const toList = normalizedTo
      .split(",")
      .map(email => email.trim())
      .filter(Boolean);

    if (!toList.length) {
      return res.status(400).json({ success: false, error: "Invalid recipient list" });
    }

    const useTemplate = format === "virtual-tour-note" || Array.isArray(notes);
    const content = useTemplate
      ? buildVirtualTourMailContent({
          pageUrl,
          summary: summary ?? body,
          notes
        })
      : {
          text: String(body || ""),
          html: `<pre style=\"font-family: Arial, sans-serif; white-space: pre-wrap;\">${escapeHtml(body || "")}</pre>`
        };

    const mailSubject = String(subject || "GHI CHÚ TỪ VIRTUAL TOUR");
    const apiMail = getMailApiConfig();
    const preferredProvider = apiMail.provider || "smtp";

    if (preferredProvider !== "smtp") {
      const providerKeyMap = {
        resend: apiMail.resendApiKey,
        brevo: apiMail.brevoApiKey,
        sendgrid: apiMail.sendgridApiKey
      };
      const apiKey = providerKeyMap[preferredProvider];

      if (!apiKey || !apiMail.from) {
        return res.status(500).json({
          success: false,
          error: "Mail API is not configured. Please set MAIL_PROVIDER, MAIL_FROM and corresponding API key"
        });
      }

      const result = await sendMailViaHttpApi({
        provider: preferredProvider,
        apiKey,
        from: apiMail.from,
        toList,
        subject: mailSubject,
        text: content.text,
        html: content.html
      });

      return res.json({ success: true, messageId: result.messageId, provider: result.provider });
    }

    const smtp = getSmtpConfig();
    if (!smtp.host || !smtp.port || !smtp.user || !smtp.pass) {
      return res.status(500).json({
        success: false,
        error: "SMTP is not configured. Please set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS or switch to MAIL_PROVIDER"
      });
    }

    const transporter = createMailTransporter(smtp);
    await transporter.verify();

    const info = await transporter.sendMail({
      from: smtp.from,
      to: normalizedTo,
      subject: mailSubject,
      text: content.text,
      html: content.html
    });

    res.json({ success: true, messageId: info.messageId, provider: "smtp" });
  } catch (err) {
    console.error("MAIL SEND ERROR:", err);
    res.status(500).json({ success: false, error: err.message || "Send mail failed" });
  }
});


// ADD ROOM
app.post("/api/rooms", upload.single("image"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: "No image uploaded" });
  }

  if (!req.body.name || req.body.name.trim() === "") {
    return res.status(400).json({ success: false, error: "Room name is required" });
  }

  const rooms = JSON.parse(fs.readFileSync(DATA_FILE));

  const room = {
    id: Date.now(),
    name: req.body.name,
    image: "/uploads/" + req.file.filename,
    hotspots: []
  };

  rooms.push(room);
  fs.writeFileSync(DATA_FILE, JSON.stringify(rooms, null, 2));
  // Notify connected users
  broadcastRooms();
  res.json({ success: true, room });
});

/* ===== MINIMAP PUBLIC API ===== */
app.get("/api/minimap", (req, res) => {
  const minimap = getMinimap();
  res.json({ success: true, minimap });
});

/* ===== TOUR SCENARIO PUBLIC API ===== */
const TOUR_SCENARIO_FILE = path.join(__dirname, "data", "tour-scenario.json");

// Đọc kịch bản tour tự động từ file.
function getTourScenario() {
  try {
    return JSON.parse(fs.readFileSync(TOUR_SCENARIO_FILE));
  } catch {
    return null;
  }
}

app.get("/api/tour-scenario", (req, res) => {
  const scenario = getTourScenario();
  if (scenario) {
    res.json({ success: true, scenario });
  } else {
    res.json({ success: false, message: "No scenario found" });
  }
});

/* ===== SENSORS API ===== */
app.get("/api/sensors", (req, res) => {
  const sensors = getSensors();
  const roomId = req.query.roomId ? Number(req.query.roomId) : null;
  
  if (roomId) {
    const filteredSensors = sensors.filter(s => s.roomId === roomId);
    return res.json({ success: true, sensors: filteredSensors });
  }
  
  res.json({ success: true, sensors });
});

app.get("/api/sensors/:id", (req, res) => {
  const sensorId = Number(req.params.id);
  const sensors = getSensors();
  const sensor = sensors.find(s => s.id === sensorId);
  
  if (!sensor) {
    return res.status(404).json({ success: false, error: "Sensor not found" });
  }
  
  res.json({ success: true, sensor });
});

app.put("/api/sensors/:id", (req, res) => {
  const sensorId = Number(req.params.id);
  const sensors = getSensors();
  const sensor = sensors.find(s => s.id === sensorId);
  
  if (!sensor) {
    return res.status(404).json({ success: false, error: "Sensor not found" });
  }
  
  const { name, position, sensors: envSensors, type, camera } = req.body;
  const nextType = type || sensor.type || "environment";
  const isCamera = nextType === "camera";

  // Update common fields
  if (name) sensor.name = name;
  if (position) sensor.position = position;
  if (type) sensor.type = type;

  // Update type-specific fields
  if (isCamera) {
    const defaultCamera = {
      streamUrl: "",
      snapshotUrl: "",
      resolution: "1920x1080",
      status: "online",
      notes: ""
    };
    sensor.camera = { ...defaultCamera, ...(sensor.camera || {}), ...(camera || {}) };
    sensor.color = "#2196F3";
  } else if (envSensors) {
    sensor.sensors = envSensors;
    sensor.color = "#4CAF50";
  }

  sensor.lastUpdate = new Date().toISOString();
  
  fs.writeFileSync(SENSORS_FILE, JSON.stringify(sensors, null, 2));
  broadcastSensors();
  
  res.json({ success: true, sensor });
});

app.post("/api/sensors", (req, res) => {
  const { name, roomId, position, sensors, type, camera } = req.body;
  
  if (!name || !roomId) {
    return res.status(400).json({ success: false, error: "Missing required fields" });
  }
  
  const sensorsList = getSensors();
  const newSensor = {
    id: Date.now(),
    name,
    roomId,
    type: type || "environment",
    position: position || { yaw: 0, pitch: 0 },
    lastUpdate: new Date().toISOString(),
    color: type === "camera" ? "#2196F3" : "#4CAF50"
  };

  // Add type-specific fields
  if (type === "camera") {
    newSensor.camera = camera || {
      streamUrl: "",
      snapshotUrl: "",
      resolution: "1920x1080",
      status: "online",
      notes: ""
    };
  } else {
    newSensor.sensors = sensors || {
      temperature: { value: 0, unit: "°C", min: 0, max: 50 },
      humidity: { value: 0, unit: "%", min: 0, max: 100 },
      smoke: { value: 0, unit: "ppm", status: "normal" },
      co2: { value: 0, unit: "ppm", min: 0, max: 2000 },
      pm25: { value: 0, unit: "µg/m³", min: 0, max: 500 }
    };
  }
  
  sensorsList.push(newSensor);
  fs.writeFileSync(SENSORS_FILE, JSON.stringify(sensorsList, null, 2));
  broadcastSensors();
  
  res.json({ success: true, sensor: newSensor });
});

app.delete("/api/sensors/:id", (req, res) => {
  const sensorId = Number(req.params.id);
  let sensors = getSensors();
  const index = sensors.findIndex(s => s.id === sensorId);
  
  if (index === -1) {
    return res.status(404).json({ success: false, error: "Sensor not found" });
  }
  
  const deleted = sensors.splice(index, 1)[0];
  fs.writeFileSync(SENSORS_FILE, JSON.stringify(sensors, null, 2));
  broadcastSensors();
  
  res.json({ success: true, sensor: deleted });
});

/* ===== API CONFIG MANAGEMENT ===== */
app.get("/api/config/api", (req, res) => {
  const config = getApiConfig();
  res.json({ success: true, config });
});

app.post("/api/config/api", (req, res) => {
  try {
    const config = req.body;
    saveApiConfig(config);
    res.json({ success: true, message: "Config saved successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ===== ROOM-SPECIFIC API CONFIG ===== */
// Get room API config
app.get("/api/rooms/:roomId/api-config", (req, res) => {
  const roomId = req.params.roomId;
  const configFile = path.join(ROOM_API_CONFIGS_DIR, `${roomId}.json`);
  
  try {
    if (fs.existsSync(configFile)) {
      const config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
      res.json({ success: true, config });
    } else {
      // Return safe defaults (do not leak global config into rooms)
      const defaultConfig = getDefaultApiConfig();
      res.json({ success: true, config: defaultConfig, isDefault: true });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Save room API config
app.post("/api/rooms/:roomId/api-config", (req, res) => {
  const roomId = req.params.roomId;
  const config = req.body;
  const configFile = path.join(ROOM_API_CONFIGS_DIR, `${roomId}.json`);
  
  try {
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
    res.json({ success: true, message: "Room API config saved successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ===== REAL-TIME DATA API ===== */
// Gộp dữ liệu thời tiết và chất lượng không khí thành 1 payload.
async function getCombinedData(config) {
  const weatherApi = config.weatherApi;
  const airApi = config.airQualityApi;
  
  let temp = 26 + Math.random() * 5; // Default fallback
  let humidity = 70 + Math.random() * 10;
  let weather = "partly cloudy";
  
  // Try to fetch real weather data from configured API
  try {
    const lat = Number(weatherApi?.params?.lat);
    const lon = Number(weatherApi?.params?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      throw new Error(`Invalid coordinates (lat=${weatherApi?.params?.lat}, lon=${weatherApi?.params?.lon})`);
    }
    const weatherUrl = `${weatherApi.url}?lat=${lat}&lon=${lon}&appid=${weatherApi.apiKey}&units=${weatherApi.params.units}`;
    const weatherResponse = await fetch(weatherUrl);
    const weatherData = await weatherResponse.json();
    
    if (weatherData.main && weatherData.main.temp !== undefined) {
      temp = Math.round(weatherData.main.temp * 10) / 10;
      humidity = Math.round(weatherData.main.humidity);
      weather = weatherData.weather?.[0]?.description || weather;
      console.log(`✅ Weather API OK: ${temp}°C | Độ ẩm: ${humidity}%`);
    } else {
      console.log("⚠️ Weather API không trả về dữ liệu đúng");
    }
  } catch (e) {
    console.log("❌ Weather API lỗi:", e.message);
  }
  
  let pm25Value = 25 + Math.random() * 20;
  let pmSource = "Simulated";
  
  // Try to fetch real PM2.5 from configured API
  try {
    const pm25Url = `${airApi.url}?token=${airApi.token}`;
    const pm25Response = await fetch(pm25Url);
    const pm25Data = await pm25Response.json();
    
    console.log("📡 WAQI Full Response:", pm25Data.status, "PM2.5:", pm25Data.data?.iaqi?.pm25?.v, "AQI:", pm25Data.data?.aqi);
    
    if (pm25Data.status === "ok" && pm25Data.data?.iaqi?.pm25?.v && typeof pm25Data.data.iaqi.pm25.v === "number") {
      pm25Value = pm25Data.data.iaqi.pm25.v;
      pmSource = "Real (WAQI PM2.5)";
      console.log("✅ PM2.5 API OK:", pm25Value + " µg/m³");
    } else if (pm25Data.status === "ok" && pm25Data.data?.aqi && typeof pm25Data.data.aqi === "number" && pm25Data.data.aqi > 0) {
      pm25Value = pm25Data.data.aqi;
      pmSource = "Real (WAQI AQI)";
      console.log("✅ AQI API OK:", pm25Value);
    } else {
      console.log("⚠️ WAQI không có dữ liệu hợp lệ, dùng simulated");
    }
  } catch (e) {
    console.log("⚠️ PM2.5 API lỗi:", e.message);
  }
  
  const locationName = `Lat: ${weatherApi.params.lat}, Lon: ${weatherApi.params.lon}`;
  console.log(`📊 ${locationName} - Nhiệt độ: ${temp}°C | Độ ẩm: ${humidity}% | PM2.5: ${Math.round(pm25Value * 10)/10} (${pmSource})`);
  
  return {
    temperature: temp,
    humidity: humidity,
    pm25: Math.round(pm25Value * 10) / 10,
    location: locationName,
    timestamp: new Date().toISOString(),
    aqi: calculateAQI(pm25Value),
    weather: weather
  };
}

// Get combined environmental data (PM2.5 + Temperature + Humidity)
app.get("/api/real-data/combined", async (req, res) => {
  try {
    const roomId = req.query.roomId;
    let config;
    
    // Check if room has specific API config
    if (roomId) {
      const roomConfigFile = path.join(ROOM_API_CONFIGS_DIR, `${roomId}.json`);
      if (fs.existsSync(roomConfigFile)) {
        config = JSON.parse(fs.readFileSync(roomConfigFile, 'utf-8'));
      } else {
        config = getDefaultApiConfig();
      }
    } else {
      config = getApiConfig();
    }
    
    const data = await getCombinedData(config);
    res.json({ success: true, data });
  } catch (err) {
    console.error("❌ Error fetching combined data:", err.message);
    res.json({
      success: true,
      data: {
        temperature: 26.5,
        humidity: 70,
        pm25: 35,
        location: "Mock Data",
        timestamp: new Date().toISOString(),
        aqi: calculateAQI(35),
        weather: "clear sky"
      }
    });
  }
});

// Get combined data using custom config (from admin-rooms form)
app.post("/api/real-data/combined/custom", async (req, res) => {
  try {
    const config = req.body;
    const data = await getCombinedData(config);
    res.json({ success: true, data });
  } catch (err) {
    console.error("❌ Error fetching combined data (custom):", err.message);
    res.json({
      success: true,
      data: {
        temperature: 26.5,
        humidity: 70,
        pm25: 35,
        location: "Mock Data",
        timestamp: new Date().toISOString(),
        aqi: calculateAQI(35),
        weather: "clear sky"
      }
    });
  }
});

// Legacy PM2.5 endpoint (kept for compatibility)
app.get("/api/real-data/pm25", async (req, res) => {
  try {
    const response = await fetch("https://api.waqi.info/feed/hanoi/?token=d61e181df66964a513acd018c7cdb9c9993226d1");
    const data = await response.json();
    
    if (data.status === "ok" && data.data.iaqi.pm25) {
      const pm25Value = data.data.iaqi.pm25.v;
      res.json({
        success: true,
        data: {
          pm25: pm25Value,
          unit: "µg/m³",
          location: data.data.city.name,
          timestamp: new Date().toISOString(),
          aqi: calculateAQI(pm25Value)
        }
      });
    } else {
      throw new Error("No PM2.5 data");
    }
  } catch (err) {
    const mockPM25 = 20 + Math.random() * 30;
    res.json({
      success: true,
      data: {
        pm25: Math.round(mockPM25 * 10) / 10,
        unit: "µg/m³",
        location: "Mock Data",
        timestamp: new Date().toISOString(),
        aqi: calculateAQI(mockPM25)
      }
    });
  }
});

// Helper: Calculate AQI status
// Quy đổi PM2.5 sang mức AQI để hiển thị trạng thái.
function calculateAQI(pm25) {
  if (pm25 <= 12) return { level: "Tốt", color: "#4CAF50" };
  if (pm25 <= 35.4) return { level: "Chấp nhận được", color: "#FFC107" };
  if (pm25 <= 55.4) return { level: "Nhạy cảm", color: "#FF9800" };
  if (pm25 <= 150.4) return { level: "Không tốt", color: "#F44336" };
  if (pm25 <= 250.4) return { level: "Xấu", color: "#C62828" };
  return { level: "Nguy hiểm", color: "#6D1B1B" };
}

/* ===== ADMIN ROUTES ===== */
app.use("/api/admin", adminRoutes);

/* ===== START ===== */
app.listen(PORT, () => {
  console.log("Server running");
});
