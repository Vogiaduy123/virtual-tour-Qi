const pano = document.getElementById("pano");
const roomSelect = document.getElementById("roomSelect");

// Tạo viewer
const viewer = new Marzipano.Viewer(pano);

// Thiết lập giới hạn zoom cho viewer
// minFov: giới hạn zoom in (FOV tối thiểu) = 45°
// maxFov: giới hạn zoom out (FOV tối đa) = 85°
const MIN_FOV = 45 * Math.PI / 180;  // 45° = zoom in sâu nhất
const MAX_FOV = 85 * Math.PI / 180;  // 85° = zoom out không quá xa

const scenes = {};
const roomsData = {};
let currentRoomId = null;

// Helper: convert degrees to radians
function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

// Minimap elements
const minimapWrapper = document.getElementById("minimapWrapper");
const minimapToggle = document.getElementById("minimapToggle");
const minimapContent = document.getElementById("minimapContent");
const userMinimapContainer = document.getElementById("userMinimapContainer");
const userMinimapImage = document.getElementById("userMinimapImage");
const userMinimapCanvas = document.getElementById("userMinimapCanvas");
// Media overlay elements
const mediaOverlay = document.getElementById("mediaOverlay");
const mediaOverlayTitle = document.getElementById("mediaOverlayTitle");
const mediaOverlayDescription = document.getElementById("mediaOverlayDescription");
const mediaOverlayContent = document.getElementById("mediaOverlayContent");
const mediaOverlayLink = document.getElementById("mediaOverlayLink");
const mediaOverlayClose = document.getElementById("mediaOverlayClose");
const MEDIA_ICONS = { image: "🖼️", pdf: "📄", video: "🎥", "3d": "🎮", youtube: "▶️", facebook: "", web: "🌐", note: "i" };
// Sensor widget elements
const sensorWidget = document.getElementById("sensorWidget");
const sensorWidgetContent = document.getElementById("sensorWidgetContent");
// Compass elements
const compassContainer = document.getElementById("compassContainer");
const compassCanvas = document.getElementById("compassCanvas");
let compassCtx = null;
let compassAnimId = null;
let northOffset = 0;

let minimapData = null;
let minimapCtx = null;
let isMinimapCollapsed = false;
let currentFloorId = 1;

// Sensors data
let sensorsData = [];
let sensorUpdateInterval = null;

// Auto Tour State
let autoTourState = {
  isPlaying: false,
  isPaused: false,
  currentStopIndex: 0,
  tourStops: [],
  animationFrameId: null,
  timeoutId: null,
  progressIntervalId: null,
  pausedAt: 0,
  remainingTime: 0,
  currentScenario: null
};

const AUTO_TOUR_CONFIG = {
  panDuration: 8000,        // Camera pan duration (ms)
  stopDuration: 5000,       // Time to stay at each stop (ms)
  rotationSpeed: 0.3,       // Camera rotation speed
  highlightDuration: 1000,  // Hotspot highlight duration (ms)
  transitionDelay: 500      // Delay before transition (ms)
};

function getTourPanDuration() {
  const configuredDuration = Number(autoTourState.currentScenario?.cameraPanDuration);
  if (Number.isFinite(configuredDuration) && configuredDuration >= 1000) {
    return configuredDuration;
  }
  return AUTO_TOUR_CONFIG.panDuration;
}

// Close overlay interactions
if (mediaOverlayClose) mediaOverlayClose.addEventListener("click", hideMediaOverlay);

document.addEventListener("keyup", (e) => {
  if (e.key === "Escape") {
    hideMediaOverlay();
  }
});

/* ===== BUILD/UPDATE ROOMS ===== */
function initRooms(rooms) {
  // Reset roomsData
  Object.keys(roomsData).forEach(k => delete roomsData[k]);

  // Rebuild room dropdown
  if (roomSelect) roomSelect.innerHTML = "";

  rooms.forEach(room => {
    roomsData[room.id] = room;

    // Create scene if new
    if (!scenes[room.id]) {
      const source = Marzipano.ImageUrlSource.fromString(room.image);
      const geometry = new Marzipano.EquirectGeometry([{ width: 4000 }]);
      const view = new Marzipano.RectilinearView({ fov: Math.PI / 2 });

      const scene = viewer.createScene({ source, geometry, view });
      scenes[room.id] = scene;
    }

    // Room option
    if (roomSelect) {
      const option = document.createElement("option");
      option.value = room.id;
      option.textContent = room.name;
      roomSelect.appendChild(option);
    }
  });

  // Add change event listener
  if (roomSelect) {
    roomSelect.addEventListener("change", (e) => {
      switchRoom(parseInt(e.target.value));
    });
  }
}

/* ===== INITIAL LOAD ===== */
async function initApp() {
  try {
    // Load rooms first
    const roomsRes = await fetch("/api/rooms");
    const rooms = await roomsRes.json();
    
    if (!rooms || rooms.length === 0) {
      alert("Chưa có phòng nào");
      return;
    }
    
    initRooms(rooms);
    switchRoom(rooms[0].id);
    
    // Then load minimap (now roomsData is populated)
    await loadMinimap();
    
    // Load sensors
    await loadSensors();
    
    // Initialize zoom control
    initZoomControl();
    // Initialize compass overlay
    initCompass();
    // Initialize auto tour
    initAutoTour();
  } catch (err) {
    console.error("LOAD ERROR:", err);
  }
}

initApp();

/* ===== COMPASS ===== */
function initCompass() {
  if (!compassCanvas) return;
  compassCtx = compassCanvas.getContext("2d");
  startCompassLoop();
}

function startCompassLoop() {
  if (compassAnimId) cancelAnimationFrame(compassAnimId);
  const draw = () => {
    drawCompass();
    compassAnimId = requestAnimationFrame(draw);
  };
  compassAnimId = requestAnimationFrame(draw);
}

function drawCompass() {
  if (!compassCtx || !currentRoomId) return;
  const scene = scenes[currentRoomId];
  if (!scene || !scene.view()) return;

  const view = scene.view();
  const yaw = view.yaw();
  const fov = view.fov();

  const ctx = compassCtx;
  const w = compassCanvas.width;
  const h = compassCanvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(cx, cy) - 6;

  ctx.clearRect(0, 0, w, h);

  // Outer ring
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.lineWidth = 10;
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.stroke();

  // Inner ring
  ctx.beginPath();
  ctx.arc(cx, cy, r - 12, 0, Math.PI * 2);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.stroke();

  // North mark 'N'
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = "bold 22px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("N", cx, cy - r + 24);

  // FOV wedge
  const heading = yaw + northOffset;
  const start = heading - fov / 2;
  const end = heading + fov / 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, r - 18, start, end);
  ctx.closePath();
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.fill();

  // (Đã loại bỏ vạch đỏ và chấm xanh)

  // Center dot
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fill();
}

/* ===== SUBSCRIBE TO SSE ===== */
try {
  const es = new EventSource("/events");
  es.addEventListener("rooms", (e) => {
    const rooms = JSON.parse(e.data || "[]");
    if (!rooms || rooms.length === 0) return;

    initRooms(rooms);
    // Keep current room if still exists; otherwise switch to first
    const exists = rooms.find(r => r.id === currentRoomId);
    if (exists) {
      addHotspots(currentRoomId);
    } else {
      switchRoom(rooms[0].id);
    }
  });
  
  es.addEventListener("sensors", (e) => {
    const sensors = JSON.parse(e.data || "[]");
    if (!sensors || sensors.length === 0) return;
    
    sensorsData = sensors;
    // Update sensor hotspots in current room
    if (currentRoomId) {
      addSensorHotspots(currentRoomId);
    }
    // Update widget and camera panel
    updateSensorWidget();
    renderCameraPanel();
  });
} catch (e) {
  console.warn("SSE not supported:", e);
}

/* ===== SWITCH ROOM ===== */
function switchRoom(roomId) {
  currentRoomId = roomId;
  const scene = scenes[roomId];

  if (!scene) return;

  // Close any open media hotspot overlay
  if (activeMediaHotspotOverlay) {
    activeMediaHotspotOverlay = null; // Hotspot will be destroyed when new scene loads
  }

  // Update dropdown value
  if (roomSelect) {
    roomSelect.value = roomId;
  }

  scene.switchTo();
  addHotspots(roomId);
  updateMinimapHighlight();
  hideMediaOverlay();
  
  // Update sensor widget and camera panel for new room
  updateSensorWidget();
  renderCameraPanel();
}

/* ===== HOTSPOTS ===== */
function addHotspots(roomId) {
  const room = roomsData[roomId];
  const scene = scenes[roomId];

  if (!room || !scene) return;

  const container = scene.hotspotContainer();
  // Remove existing hotspots
  try {
    const existing = container.listHotspots();
    existing.forEach(h => container.destroyHotspot(h));
  } catch {}

  const hotspots = room.hotspots || [];
  const mediaHotspots = room.mediaHotspots || [];

  hotspots.forEach(hs => {
    const el = document.createElement("div");
    el.className = "hotspot";
    
    // Admin lưu theo degrees, chuyển sang radians cho Marzipano
    const yawRad = degToRad(hs.yaw);
    const pitchRad = degToRad(-hs.pitch); // Đảo chiều dọc
    
    // Xoay mũi tên theo rotation (nếu có) hoặc yaw
    const rotationDeg = (hs.rotation !== undefined ? hs.rotation : hs.yaw) - 45;
    el.style.setProperty('--rotation', `${rotationDeg}deg`);
    
    // Áp dụng màu sắc nếu có
    const arrowColor = hs.color || "#000000";
    el.style.setProperty('--arrow-color', arrowColor);

       el.onclick = (e) => {
         e.stopPropagation();
         // Chuyển phòng trực tiếp không có hiệu ứng
         switchRoom(hs.target);
       };

    container.createHotspot(el, {
      yaw: yawRad,
      pitch: pitchRad
    });
  });

  mediaHotspots.forEach(media => {
    // Helper to extract YouTube video ID
    function getYouTubeVideoId(url) {
      const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
        /youtube\.com\/embed\/([^?&\n]+)/
      ];
      for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
      }
      return null;
    }

    let el;

    // For notes, create a note hotspot with tooltip
    if (media.mediaType === "note") {
      el = document.createElement("div");
      el.className = "media-hotspot note-hotspot";
      el.setAttribute("aria-label", media.title || "Ghi chú");
      el.textContent = MEDIA_ICONS[media.mediaType] || "!";
      el.style.cursor = "help";
      
      // Create tooltip container
      const tooltip = document.createElement("div");
      tooltip.className = "note-tooltip";
      tooltip.innerHTML = `<strong>${media.title || 'Ghi chú'}</strong>${media.mediaUrl || media.description || ''}`;
      
      el.appendChild(tooltip);
    } else if (media.mediaType === "youtube") {
      // For YouTube, create video player directly instead of icon
      const videoId = getYouTubeVideoId(media.mediaUrl);
      if (videoId) {
        el = document.createElement("div");
        el.className = "media-hotspot youtube-hotspot";
        el.setAttribute("aria-label", media.title || "YouTube Video");
        
        const iframe = document.createElement("iframe");
        iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=0`;
        iframe.title = media.title || "YouTube Video";
        iframe.style.width = "100%";
        iframe.style.height = "100%";
        iframe.style.borderRadius = "6px";
        iframe.frameBorder = "0";
        iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
        iframe.allowFullscreen = true;
        
        el.appendChild(iframe);
      } else {
        // Fallback if video ID extraction failed
        el = document.createElement("div");
        el.className = "media-hotspot";
        el.setAttribute("aria-label", media.title || "Tư liệu");
        el.textContent = "❌";
      }
    } else {
      // For other media types, use icon and overlay
      el = document.createElement("div");
      el.className = "media-hotspot";
      el.setAttribute("aria-label", media.title || "Tư liệu");
      
      // Add Facebook styling with SVG icon
      if (media.mediaType === "facebook") {
        el.setAttribute("data-fb", "true");
        // Create SVG Facebook icon
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("width", "24");
        svg.setAttribute("height", "24");
        svg.setAttribute("fill", "white");
        
        // Facebook "f" path
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", "M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z");
        svg.appendChild(path);
        
        el.appendChild(svg);
      } else {
        el.textContent = MEDIA_ICONS[media.mediaType] || "📁";
      }

      el.onclick = (e) => {
        e.stopPropagation();
        // For Facebook, show overlay; for others, show overlay
        createMediaHotspotOverlay(media, container, degToRad(media.yaw), degToRad(-media.pitch));
      };
    }

    // Admin lưu theo degrees, chuyển sang radians cho Marzipano
    container.createHotspot(el, {
      yaw: degToRad(media.yaw),
      pitch: degToRad(-media.pitch) // Đảo chiều dọc
    });
  });
  
  // Add sensor hotspots
  addSensorHotspots(roomId);
}

/* ===== MEDIA OVERLAY ===== */
function normalizeMediaUrl(url) {
  if (!url) return "";
  return /^https?:\/\//i.test(url) ? url : `${window.location.origin}${url}`;
}

// Store active media hotspot overlay reference
let activeMediaHotspotOverlay = null;

// Create media overlay as a Marzipano hotspot
function createMediaHotspotOverlay(media, container, yaw, pitch) {
  // Close existing overlay if any
  if (activeMediaHotspotOverlay) {
    container.destroyHotspot(activeMediaHotspotOverlay);
    activeMediaHotspotOverlay = null;
  }

  const url = normalizeMediaUrl(media.mediaUrl);
  
  // Create overlay element
  const overlayEl = document.createElement("div");
  overlayEl.className = "media-hotspot-overlay";
  
  // Header
  const header = document.createElement("div");
  header.className = "media-overlay-header";
  
  const title = document.createElement("h3");
  title.className = "media-overlay-title";
  title.textContent = media.title || "Tư liệu";
  
  const closeBtn = document.createElement("button");
  closeBtn.className = "media-overlay-close-btn";
  closeBtn.textContent = "×";
  closeBtn.onclick = (e) => {
    e.stopPropagation();
    container.destroyHotspot(activeMediaHotspotOverlay);
    activeMediaHotspotOverlay = null;
  };
  
  header.appendChild(title);
  header.appendChild(closeBtn);
  overlayEl.appendChild(header);
  
  // Description
  if (media.description) {
    const desc = document.createElement("p");
    desc.className = "media-overlay-description";
    desc.textContent = media.description;
    overlayEl.appendChild(desc);
  }
  
  // Content
  const content = document.createElement("div");
  content.className = "media-overlay-content";
  
  // Helper to extract YouTube video ID
  function getYouTubeVideoId(url) {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
      /youtube\.com\/embed\/([^?&\n]+)/
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  }
  
  // Helper to extract Facebook video ID
  function getFacebookEmbedUrl(url) {
    // Facebook videos can be embedded directly using iframe
    return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false`;
  }
  
  if (media.mediaType === "image") {
    const img = new Image();
    img.src = url;
    img.alt = media.title || "Media";
    content.appendChild(img);
  } else if (media.mediaType === "video") {
    const video = document.createElement("video");
    video.controls = true;
    video.src = url;
    video.style.maxHeight = "320px";
    content.appendChild(video);
  } else if (media.mediaType === "pdf") {
    const iframe = document.createElement("iframe");
    iframe.src = url;
    iframe.title = media.title || "PDF";
    iframe.height = "320";
    content.appendChild(iframe);
  } else if (media.mediaType === "youtube") {
    const videoId = getYouTubeVideoId(media.mediaUrl);
    if (videoId) {
      const iframeWrapper = document.createElement("div");
      iframeWrapper.style.width = "100%";
      iframeWrapper.style.position = "relative";
      iframeWrapper.style.paddingBottom = "56.25%"; // 16:9 aspect ratio
      iframeWrapper.style.height = "0";
      iframeWrapper.style.overflow = "hidden";
      iframeWrapper.style.borderRadius = "6px";
      
      const iframe = document.createElement("iframe");
      iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=0`;
      iframe.title = media.title || "YouTube Video";
      iframe.style.position = "absolute";
      iframe.style.top = "0";
      iframe.style.left = "0";
      iframe.style.width = "100%";
      iframe.style.height = "100%";
      iframe.style.borderRadius = "6px";
      iframe.frameBorder = "0";
      iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
      iframe.allowFullscreen = true;
      
      iframeWrapper.appendChild(iframe);
      content.appendChild(iframeWrapper);
    } else {
      const note = document.createElement("div");
      note.style.color = "#d7d7d7";
      note.style.fontSize = "13px";
      note.textContent = "❌ URL YouTube không hợp lệ. Nhấn 🔗 để mở trong tab mới.";
      content.appendChild(note);
    }
  } else if (media.mediaType === "facebook") {
    // Facebook doesn't allow profile/page embeds, show a nice preview with cover image
    const fbPreview = document.createElement("div");
    fbPreview.style.background = "linear-gradient(135deg, #1877f2 0%, #0a66c2 100%)";
    fbPreview.style.padding = "24px";
    fbPreview.style.borderRadius = "6px";
    fbPreview.style.textAlign = "center";
    fbPreview.style.color = "white";
    fbPreview.style.minHeight = "200px";
    fbPreview.style.display = "flex";
    fbPreview.style.flexDirection = "column";
    fbPreview.style.justifyContent = "center";
    fbPreview.style.alignItems = "center";
    fbPreview.style.gap = "12px";
    fbPreview.style.backgroundSize = "cover";
    fbPreview.style.backgroundPosition = "center";
    fbPreview.style.position = "relative";
    
    // Create overlay for text
    const overlay = document.createElement("div");
    overlay.style.position = "absolute";
    overlay.style.inset = "0";
    overlay.style.background = "linear-gradient(135deg, rgba(24, 119, 242, 0.95) 0%, rgba(10, 102, 194, 0.95) 100%)";
    overlay.style.borderRadius = "6px";
    overlay.style.zIndex = "1";
    fbPreview.appendChild(overlay);
    
    // Content wrapper
    const contentWrapper = document.createElement("div");
    contentWrapper.style.position = "relative";
    contentWrapper.style.zIndex = "2";
    contentWrapper.style.display = "flex";
    contentWrapper.style.flexDirection = "column";
    contentWrapper.style.alignItems = "center";
    contentWrapper.style.gap = "12px";
    
    // Try to load thumbnail from Facebook
    const url = media.mediaUrl;
    const thumbUrl = url.includes('facebook.com/') ? 
      `https://www.facebook.com/favicon.ico` : url;
    
    // Extract username from URL for better matching
    const usernameMatch = url.match(/facebook\.com\/([a-zA-Z0-9._-]+)/);
    const username = usernameMatch ? usernameMatch[1] : null;
    
    // Create decorative image container with Facebook icon
    const imageContainer = document.createElement("div");
    imageContainer.style.width = "100px";
    imageContainer.style.height = "100px";
    imageContainer.style.borderRadius = "50%";
    imageContainer.style.background = "rgba(255, 255, 255, 0.2)";
    imageContainer.style.display = "flex";
    imageContainer.style.alignItems = "center";
    imageContainer.style.justifyContent = "center";
    imageContainer.style.fontSize = "48px";
    imageContainer.style.border = "3px solid white";
    imageContainer.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
    
    // Try to load actual avatar
    const avatar = document.createElement("img");
    avatar.style.width = "100%";
    avatar.style.height = "100%";
    avatar.style.borderRadius = "50%";
    avatar.style.objectFit = "cover";
    avatar.src = `https://graph.facebook.com/v18.0/${username || 'facebook'}/picture?width=100&height=100&access_token=`;
    
    avatar.onerror = () => {
      avatar.style.display = "none";
      imageContainer.textContent = "f";
      imageContainer.style.background = "#1877f2";
      imageContainer.style.fontSize = "50px";
      imageContainer.style.fontWeight = "bold";
      imageContainer.style.color = "white";
      imageContainer.style.fontFamily = "Arial, sans-serif";
      imageContainer.style.textAlign = "center"
    };
    
    avatar.onload = () => {
      // Image loaded successfully
    };
    
    imageContainer.appendChild(avatar);
    contentWrapper.appendChild(imageContainer);
    
    const fbTitle = document.createElement("div");
    fbTitle.style.fontSize = "16px";
    fbTitle.style.fontWeight = "600";
    fbTitle.textContent = media.title || "Facebook";
    contentWrapper.appendChild(fbTitle);
    
    const fbDesc = document.createElement("div");
    fbDesc.style.fontSize = "13px";
    fbDesc.style.opacity = "0.95";
    fbDesc.textContent = "Nhấn nút dưới để mở trang Facebook";
    contentWrapper.appendChild(fbDesc);
    
    fbPreview.appendChild(contentWrapper);
    content.appendChild(fbPreview);
  } else if (media.mediaType === "web") {
    const iframe = document.createElement("iframe");
    iframe.src = url;
    iframe.title = media.title || "Web";
    iframe.height = "600";
    iframe.style.width = "100%";
    iframe.style.border = "none";
    iframe.style.borderRadius = "6px";
    content.appendChild(iframe);
  } else {
    const note = document.createElement("div");
    note.style.color = "#d7d7d7";
    note.style.fontSize = "13px";
    note.textContent = "Không thể xem trực tiếp. Nhấn 🔗 để mở trong tab mới.";
    content.appendChild(note);
  }
  
  overlayEl.appendChild(content);
  
  // Link/Button section
  const buttonSection = document.createElement("div");
  buttonSection.style.display = "flex";
  buttonSection.style.gap = "8px";
  buttonSection.style.marginTop = "12px";
  
  if (url) {
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.className = "media-overlay-link";
    link.textContent = "🔗 Mở trong tab mới";
    buttonSection.appendChild(link);
  }
  
  // For Facebook, add "Mở Facebook" button
  if (media.mediaType === "facebook") {
    const fbButton = document.createElement("button");
    fbButton.style.flex = "1";
    fbButton.style.padding = "8px 12px";
    fbButton.style.background = "#1877f2";
    fbButton.style.color = "white";
    fbButton.style.border = "none";
    fbButton.style.borderRadius = "6px";
    fbButton.style.fontSize = "12px";
    fbButton.style.fontWeight = "600";
    fbButton.style.cursor = "pointer";
    fbButton.style.transition = "background 0.2s ease";
    fbButton.textContent = "👍 Mở Facebook";
    
    fbButton.onmouseover = () => fbButton.style.background = "#165bc0";
    fbButton.onmouseout = () => fbButton.style.background = "#1877f2";
    
    fbButton.onclick = () => {
      window.open(media.mediaUrl, '_blank');
    };
    
    buttonSection.appendChild(fbButton);
  }
  
  if (buttonSection.childNodes.length > 0) {
    overlayEl.appendChild(buttonSection);
  }
  
  // Create hotspot using Marzipano positioning
  activeMediaHotspotOverlay = container.createHotspot(overlayEl, {
    yaw: yaw,
    pitch: pitch
  });
}

function hideMediaOverlay() {
  if (!mediaOverlay) return;
  mediaOverlay.classList.add("hidden");
  if (mediaOverlayContent) mediaOverlayContent.innerHTML = "";
  if (mediaOverlayLink) mediaOverlayLink.href = "#";
}

function showMediaOverlay(media) {
  if (!mediaOverlay) return;
  const url = normalizeMediaUrl(media.mediaUrl);

  if (mediaOverlayTitle) mediaOverlayTitle.textContent = media.title || "Tư liệu";
  if (mediaOverlayDescription) {
    mediaOverlayDescription.textContent = media.description || "";
    mediaOverlayDescription.style.display = media.description ? "block" : "none";
  }

  if (mediaOverlayContent) {
    mediaOverlayContent.innerHTML = "";

    if (media.mediaType === "image") {
      const img = new Image();
      img.src = url;
      img.alt = media.title || "Media";
      mediaOverlayContent.appendChild(img);
    } else if (media.mediaType === "video") {
      const video = document.createElement("video");
      video.controls = true;
      video.src = url;
      video.style.maxHeight = "320px";
      mediaOverlayContent.appendChild(video);
    } else if (media.mediaType === "pdf") {
      const iframe = document.createElement("iframe");
      iframe.src = url;
      iframe.title = media.title || "PDF";
      iframe.height = "320";
      mediaOverlayContent.appendChild(iframe);
    } else if (media.mediaType === "web") {
      const iframe = document.createElement("iframe");
      iframe.src = url;
      iframe.title = media.title || "Web";
      iframe.height = "450";
      iframe.style.width = "100%";
      iframe.style.border = "none";
      iframe.style.borderRadius = "6px";
      mediaOverlayContent.appendChild(iframe);
    } else {
      const note = document.createElement("div");
      note.style.color = "#d7d7d7";
      note.style.fontSize = "13px";
      note.textContent = "Không thể xem trực tiếp. Nhấn " + "\u27a1\ufe0f" + " để mở trong tab mới.";
      mediaOverlayContent.appendChild(note);
    }
  }

  if (mediaOverlayLink) {
    mediaOverlayLink.href = url || "#";
    mediaOverlayLink.style.display = url ? "inline-flex" : "none";
  }

  mediaOverlay.classList.remove("hidden");
}

/* ===== SENSOR FUNCTIONS ===== */

// Determine sensor status based on thresholds
function getSensorStatus(sensorData) {
  const temp = sensorData.temperature;
  const humidity = sensorData.humidity;
  const smoke = sensorData.smoke;
  const co2 = sensorData.co2;
  const pm25 = sensorData.pm25;
  
  // Check PM2.5 AQI levels first (most important)
  if (pm25) {
    if (pm25.value > 150.4) return "critical"; // Không tốt - Xấu
    if (pm25.value > 55.4) return "warning"; // Nhạy cảm
  }
  
  // Check critical levels
  if (temp && (temp.value < temp.min || temp.value > temp.max)) return "critical";
  if (humidity && (humidity.value < humidity.min || humidity.value > humidity.max)) return "critical";
  if (smoke && smoke.value > 50) return "critical";
  if (co2 && co2.value > 1500) return "critical";
  
  return "normal";
}

// Get color based on sensor value and thresholds
function getSensorColor(value, min, max) {
  if (value < min || value > max) {
    return "#FF1744"; // Red for out of range
  } else if ((value - min) / (max - min) > 0.7) {
    return "#FFB84D"; // Orange for high
  }
  return "#4CAF50"; // Green for normal
}

// Format sensor timestamp
function formatLastUpdate(timestamp) {
  try {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return "Vừa rồi";
    if (diff < 3600000) return `${Math.floor(diff / 60000)} phút trước`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} giờ trước`;
    return date.toLocaleDateString('vi-VN');
  } catch {
    return timestamp;
  }
}

// Hide sensor overlay
function hideSensorOverlay() {
  // Removed - using widget instead
}

// Show camera preview in modal
let activeCameraStream = null;
let activeCameraRefreshInterval = null;

function showCameraPreview(camera) {
  const cameraModal = document.getElementById('cameraModal');
  const cameraModalTitle = document.getElementById('cameraModalTitle');
  const cameraPreviewContainer = document.getElementById('cameraPreviewContainer');
  
  if (!cameraModal) return;
  
  // Update title
  cameraModalTitle.textContent = `📹 ${camera.name}`;
  
  // Stop any active camera stream
  if (activeCameraStream) {
    activeCameraStream.getTracks().forEach(track => track.stop());
    activeCameraStream = null;
  }
  
  // Clear refresh interval
  if (activeCameraRefreshInterval) {
    clearInterval(activeCameraRefreshInterval);
    activeCameraRefreshInterval = null;
  }
  
  // Clear previous content
  cameraPreviewContainer.innerHTML = '';

  // If camera is offline/maintenance, show status state
  if (camera.camera?.status === 'offline' || camera.camera?.status === 'maintenance') {
    const isMaintenance = camera.camera?.status === 'maintenance';
    cameraPreviewContainer.innerHTML = `
      <div style="text-align: center; padding: 60px 40px; color: #fff;">
        <div style="font-size: 64px; margin-bottom: 16px;">${isMaintenance ? '🟡' : '🔴'}</div>
        <div style="font-size: 18px; margin-bottom: 8px; font-weight: 600;">${isMaintenance ? 'Camera đang Bảo trì' : 'Camera đang Offline'}</div>
        <div style="font-size: 13px; color: #999; margin-bottom: 20px;">
          ${isMaintenance ? 'Camera đang được bảo trì từ phía Admin' : 'Camera này đang tắt từ phía Admin'}
        </div>
        <div style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 16px; text-align: left; font-size: 12px; color: #d7d7d7; margin-top: 16px;">
          <strong style="color: #9ac7ff;">Thông tin camera:</strong><br>
          Độ phân giải: ${camera.camera?.resolution || 'N/A'}<br>
          Trạng thái: ${isMaintenance ? 'maintenance' : 'offline'}<br>
          ${camera.camera?.notes ? 'Ghi chú: ' + camera.camera.notes : ''}
        </div>
      </div>
    `;
    cameraModal.classList.remove('hidden');
    return;
  }
  
  if (camera.camera?.streamUrl === 'webcam://0') {
    // Webcam preview
    const videoContainer = document.createElement('div');
    videoContainer.style.cssText = 'position: relative; display: inline-block; width: 100%;';
    
    const video = document.createElement('video');
    video.autoplay = true;
    video.playsinline = true;
    video.muted = true;
    video.style.cssText = 'width: 100%; border-radius: 12px; background: #000; border: 1px solid rgba(255,255,255,0.1);';
    
    const statusDiv = document.createElement('div');
    statusDiv.className = 'camera-status-badge';
    statusDiv.innerHTML = '🔴 Đang kết nối...';
    
    videoContainer.appendChild(video);
    videoContainer.appendChild(statusDiv);
    cameraPreviewContainer.appendChild(videoContainer);
    
    // Add info bar
    const infoBar = document.createElement('div');
    infoBar.className = 'camera-info-bar';
    infoBar.innerHTML = `
      <div class="camera-info-item">
        <strong>Độ phân giải</strong>
        <span>${camera.camera?.resolution || 'N/A'}</span>
      </div>
      <div class="camera-info-item">
        <strong>Trạng thái</strong>
        <span id="cameraStatusText">🔴 Đang kết nối</span>
      </div>
    `;
    cameraPreviewContainer.appendChild(infoBar);
    
    // Request webcam access
    navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      .then(stream => {
        activeCameraStream = stream;
        video.srcObject = stream;
        statusDiv.innerHTML = '🟢 LIVE';
        statusDiv.style.background = 'rgba(76, 175, 80, 0.8)';
        document.getElementById('cameraStatusText').textContent = '🟢 Hoạt động';
        console.log('✅ Webcam stream started');
      })
      .catch(err => {
        console.error('❌ Webcam error:', err);
        statusDiv.innerHTML = '🔴 Lỗi kết nối';
        statusDiv.style.background = 'rgba(244, 67, 54, 0.8)';
        document.getElementById('cameraStatusText').textContent = '🔴 Lỗi: ' + err.name;
        
        const errorMsg = document.createElement('div');
        errorMsg.style.cssText = 'margin-top: 16px; padding: 12px; background: rgba(244, 67, 54, 0.1); border: 1px solid rgba(244, 67, 54, 0.3); border-radius: 8px; color: #ff6b6b; font-size: 12px;';
        if (err.name === 'NotAllowedError') {
          errorMsg.innerHTML = '🔒 Quyền truy cập bị từ chối. Vui lòng cho phép camera trong cài đặt trình duyệt.';
        } else if (err.name === 'NotFoundError') {
          errorMsg.innerHTML = '📷 Không tìm thấy webcam. Vui lòng kiểm tra kết nối.';
        } else if (err.name === 'NotReadableError') {
          errorMsg.innerHTML = '⚠️ Webcam đang được sử dụng bởi ứng dụng khác.';
        } else {
          errorMsg.innerHTML = `❌ Lỗi: ${err.message}`;
        }
        cameraPreviewContainer.appendChild(errorMsg);
      });
  } else if (camera.camera?.snapshotUrl) {
    // Snapshot URL - show image with auto-refresh
    const imgContainer = document.createElement('div');
    imgContainer.style.cssText = 'position: relative; display: inline-block; width: 100%;';
    
    const img = document.createElement('img');
    img.style.cssText = 'width: 100%; border-radius: 12px; background: #000; border: 1px solid rgba(255,255,255,0.1);';
    img.alt = camera.name;
    img.src = camera.camera.snapshotUrl + '?t=' + Date.now();
    
    const statusDiv = document.createElement('div');
    statusDiv.className = 'camera-status-badge';
    statusDiv.innerHTML = '📸 Snapshot';
    
    imgContainer.appendChild(img);
    imgContainer.appendChild(statusDiv);
    cameraPreviewContainer.appendChild(imgContainer);
    
    // Add info bar
    const infoBar = document.createElement('div');
    infoBar.className = 'camera-info-bar';
    infoBar.innerHTML = `
      <div class="camera-info-item">
        <strong>Độ phân giải</strong>
        <span>${camera.camera?.resolution || 'N/A'}</span>
      </div>
      <div class="camera-info-item">
        <strong>Cập nhật</strong>
        <span>Mỗi 2 giây</span>
      </div>
    `;
    cameraPreviewContainer.appendChild(infoBar);
    
    // Auto-refresh snapshot every 2 seconds
    activeCameraRefreshInterval = setInterval(() => {
      if (!cameraModal.classList.contains('hidden')) {
        img.src = camera.camera.snapshotUrl + '?t=' + Date.now();
      }
    }, 2000);
  } else {
    // No stream available
    cameraPreviewContainer.innerHTML = `
      <div style="text-align: center; padding: 60px 40px; color: #fff;">
        <div style="font-size: 64px; margin-bottom: 16px;">📹</div>
        <div style="font-size: 18px; margin-bottom: 8px; font-weight: 600;">Camera không có stream</div>
        <div style="font-size: 13px; color: #999; margin-bottom: 20px;">
          Vui lòng cấu hình URL stream hoặc snapshot cho camera này
        </div>
        <div style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 16px; text-align: left; font-size: 12px; color: #d7d7d7; margin-top: 16px;">
          <strong style="color: #9ac7ff;">Thông tin camera:</strong><br>
          Độ phân giải: ${camera.camera?.resolution || 'N/A'}<br>
          Trạng thái: ${camera.camera?.status || 'unknown'}<br>
          ${camera.camera?.notes ? 'Ghi chú: ' + camera.camera.notes : ''}
        </div>
      </div>
    `;
  }
  
  // Show modal
  cameraModal.classList.remove('hidden');
}

// Close camera modal
function closeCameraModal() {
  const cameraModal = document.getElementById('cameraModal');
  if (!cameraModal) return;
  
  cameraModal.classList.add('hidden');
  
  // Stop camera stream
  if (activeCameraStream) {
    activeCameraStream.getTracks().forEach(track => track.stop());
    activeCameraStream = null;
  }
  
  // Clear refresh interval
  if (activeCameraRefreshInterval) {
    clearInterval(activeCameraRefreshInterval);
    activeCameraRefreshInterval = null;
  }
}

// Add event listeners for camera modal
document.addEventListener('DOMContentLoaded', () => {
  const cameraModal = document.getElementById('cameraModal');
  const cameraModalClose = document.getElementById('cameraModalClose');
  const cameraModalBackdrop = document.querySelector('.camera-modal-backdrop');
  
  if (cameraModalClose) {
    cameraModalClose.addEventListener('click', closeCameraModal);
  }
  
  if (cameraModalBackdrop) {
    cameraModalBackdrop.addEventListener('click', closeCameraModal);
  }
  
  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && cameraModal && !cameraModal.classList.contains('hidden')) {
      closeCameraModal();
    }
  });
});

// Update sensor widget with all sensors
function updateSensorWidget() {
  if (!sensorWidgetContent) return;
  sensorWidgetContent.innerHTML = "";
  
  // Filter sensors for current room only - ONLY environment sensors, exclude cameras
  const currentRoomSensors = sensorsData.filter(s => s.roomId === currentRoomId && s.type !== 'camera');
  
  if (currentRoomSensors.length === 0) {
    sensorWidgetContent.innerHTML = `
      <div style="text-align: center; padding: 16px; color: #888; font-size: 12px;">
        Chưa có cảm biến trong phòng này
      </div>
    `;
    return;
  }
  
  // Add header
  const header = document.createElement("div");
  header.style.cssText = `
    padding: 8px 10px;
    background: rgba(255,255,255,0.06);
    border-bottom: 1px solid rgba(255,255,255,0.12);
    font-weight: 600;
    font-size: 12px;
    color: #9ac7ff;
  `;
  
  const envCount = currentRoomSensors.length;
  header.textContent = `🌡️ Cảm biến (${envCount})`;
  sensorWidgetContent.appendChild(header);
  
  // Add each sensor
  const itemsContainer = document.createElement("div");
  itemsContainer.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
    max-height: 300px;
    overflow-y: auto;
  `;
  
  currentRoomSensors.forEach(sensor => {
    console.log('🔍 Rendering sensor:', sensor.name, 'Type:', sensor.type, 'Has camera:', !!sensor.camera, 'Has sensors:', !!sensor.sensors);
    
    // Only render environment sensors (cameras are excluded by filter above)
    // Render Environment Sensor
    const status = getSensorStatus(sensor.sensors || {});
    const pm25Value = sensor.sensors?.pm25?.value || 0;
    
    // Determine color based on PM2.5 AQI levels
    let borderColor, statusIcon, statusColor;
    if (status === "critical" || pm25Value > 150.4) {
      borderColor = '#FF1744'; // Red - Không tốt
      statusIcon = '🔴';
      statusColor = 'rgba(255, 23, 68, 0.3)';
    } else if (status === "warning" || pm25Value > 55.4) {
      borderColor = '#FF9800'; // Orange - Nhạy cảm
      statusIcon = '🟠';
      statusColor = 'rgba(255, 152, 0, 0.3)';
    } else if (pm25Value > 35.4) {
      borderColor = '#FFC107'; // Yellow - Chấp nhận được
      statusIcon = '🟡';
      statusColor = 'rgba(255, 193, 7, 0.3)';
    } else {
      borderColor = '#4CAF50'; // Green - Tốt
      statusIcon = '🟢';
      statusColor = 'rgba(76, 175, 80, 0.3)';
    }
    
    const temp = sensor.sensors?.temperature?.value || '--';
    const humidity = sensor.sensors?.humidity?.value || '--';
    const pm25 = sensor.sensors?.pm25?.value || '--';
    
    const item = document.createElement("div");
    item.style.cssText = `
      padding: 8px;
      background: rgba(255,255,255,0.04);
      border: 1px solid ${statusColor};
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s ease;
      border-left: 3px solid ${borderColor};
    `;
    
    item.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
        <div>
          <div style="font-size: 11px; color: #9ac7ff; font-weight: 600;">${sensor.name}</div>
          <div style="font-size: 12px; color: #fff; margin-top: 2px;">
            🌡️${temp}° 💧${humidity}% 💨${pm25}
          </div>
          <div style="font-size: 10px; color: #888; margin-top: 2px;">
            📍 ${sensor.location || (sensor.roomId && roomsData[sensor.roomId] ? roomsData[sensor.roomId].name : 'Không xác định')}
          </div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 14px;">${statusIcon}</div>
        </div>
      </div>
    `;
    
    item.onmouseover = () => {
      item.style.background = 'rgba(255,255,255,0.08)';
      const hoverColor = statusColor.replace('0.3', '0.5');
      item.style.borderColor = hoverColor;
    };
  
    item.onmouseout = () => {
      item.style.background = 'rgba(255,255,255,0.04)';
      item.style.borderColor = statusColor;
    };
    
    item.onclick = () => {
      if (sensor.roomId && roomsData[sensor.roomId]) {
        switchRoom(sensor.roomId);
      }
    };
    
    itemsContainer.appendChild(item);
  });
  
  sensorWidgetContent.appendChild(itemsContainer);
  
  // Render camera panel if there are cameras
  renderCameraPanel();
}

// Render camera panel with all cameras for current room
function renderCameraPanel() {
  const cameraPanel = document.getElementById('cameraPanel');
  const cameraPanelContent = document.getElementById('cameraPanelContent');
  
  if (!cameraPanel || !cameraPanelContent) {
    console.warn('⚠️ Camera panel elements not found!');
    return;
  }
  
  // Filter cameras for current room
  const currentRoomCameras = sensorsData.filter(s => s.type === 'camera' && s.roomId === currentRoomId);
  console.log('📹 Camera Panel - Current Room:', currentRoomId, 'Cameras found:', currentRoomCameras.length, currentRoomCameras);
  
  if (currentRoomCameras.length === 0) {
    cameraPanel.classList.add('hidden');
    return;
  }
  
  // Show camera panel
  cameraPanel.classList.remove('hidden');
  
  // Clear previous content
  cameraPanelContent.innerHTML = '';
  
  // Create tiles for each camera
  currentRoomCameras.forEach((camera, index) => {
    const tile = document.createElement('div');
    tile.className = 'camera-tile';
    
    const isWebcam = camera.camera?.streamUrl === 'webcam://0';
    const statusLabel = {
      online: 'Online',
      offline: 'Offline',
      maintenance: 'Bảo trì'
    }[camera.camera?.status] || 'Unknown';
    
    tile.innerHTML = `
      <div class="camera-tile-header">
        <span>${isWebcam ? '💻' : '📹'} ${camera.name}</span>
      </div>
      <div class="camera-tile-preview" id="preview-${index}">
        <div style="
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 100%;
          background: rgba(0,0,0,0.3);
          color: #888;
          font-size: 12px;
        ">📹 Loading...</div>
      </div>
      <div class="camera-tile-info">
        <div style="font-size: 11px; color: #9ac7ff;">📐 ${camera.camera?.resolution || 'N/A'}</div>
        <div style="font-size: 10px; color: #888;">Status: ${statusLabel}</div>
      </div>
    `;
    
    // Click to expand camera (skip if offline)
    if (camera.camera?.status === 'offline') {
      tile.style.cursor = 'not-allowed';
      tile.style.opacity = '0.7';
      tile.onclick = () => {
        showCameraPreview(camera);
      };
    } else {
      tile.style.cursor = 'pointer';
      tile.onclick = () => {
        showCameraPreview(camera);
      };
    }
    
    tile.onmouseover = () => {
      tile.style.background = 'rgba(33, 150, 243, 0.2)';
      tile.style.borderColor = 'rgba(33, 150, 243, 0.5)';
    };
    
    tile.onmouseout = () => {
      tile.style.background = 'rgba(33, 150, 243, 0.1)';
      tile.style.borderColor = 'rgba(33, 150, 243, 0.3)';
    };
    
    cameraPanelContent.appendChild(tile);
    
    // Setup preview for this camera
    setupCameraPreview(camera, index);
  });
  
  // Setup panel toggle
  const cameraPanelToggle = document.getElementById('cameraPanelToggle');
  if (cameraPanelToggle) {
    cameraPanelToggle.onclick = (e) => {
      e.stopPropagation();
      cameraPanel.classList.toggle('collapsed');
      cameraPanelToggle.textContent = cameraPanel.classList.contains('collapsed') ? '⊕' : '−';
    };
  }
}

// Setup preview for a camera tile
function setupCameraPreview(camera, index) {
  const previewContainer = document.getElementById(`preview-${index}`);
  if (!previewContainer) return;

  if (camera.camera?.status === 'offline' || camera.camera?.status === 'maintenance') {
    const isMaintenance = camera.camera?.status === 'maintenance';
    previewContainer.innerHTML = `
      <div style="
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        background: ${isMaintenance ? 'rgba(255,193,7,0.2)' : 'rgba(255,0,0,0.15)'};
        color: ${isMaintenance ? '#ffca28' : '#ff6b6b'};
        font-size: 12px;
      ">${isMaintenance ? '🟡 Bảo trì' : '🔴 Offline'}</div>
    `;
    return;
  }
  
  const isWebcam = camera.camera?.streamUrl === 'webcam://0';
  
  if (isWebcam) {
    // Webcam preview
    const video = document.createElement('video');
    video.style.cssText = `
      width: 100%;
      height: 100%;
      object-fit: cover;
      background: #000;
      border-radius: 6px;
    `;
    video.autoplay = true;
    video.playsinline = true;
    video.muted = true;
    
    previewContainer.innerHTML = '';
    previewContainer.appendChild(video);
    
    navigator.mediaDevices.getUserMedia({ 
      video: { width: 1280, height: 720 },
      audio: false
    })
    .then(stream => {
      video.srcObject = stream;
      video.onloadedmetadata = () => {
        video.play().catch(e => console.log('Play error:', e));
      };
    })
    .catch(err => {
      console.error('❌ Webcam access error:', err);
      previewContainer.innerHTML = `
        <div style="
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 100%;
          background: rgba(255,0,0,0.2);
          color: #ff6b6b;
          font-size: 11px;
          padding: 8px;
          text-align: center;
        ">❌ Webcam Error</div>
      `;
    });
  } else if (camera.camera?.snapshotUrl) {
    // Snapshot preview with auto-refresh
    const img = document.createElement('img');
    img.style.cssText = `
      width: 100%;
      height: 100%;
      object-fit: cover;
      background: #000;
      border-radius: 6px;
    `;
    img.onerror = () => {
      img.style.opacity = '0.5';
    };
    
    previewContainer.innerHTML = '';
    previewContainer.appendChild(img);
    
    // Initial load
    img.src = camera.camera.snapshotUrl;
    
    // Auto-refresh every 3 seconds
    const refreshInterval = setInterval(() => {
      if (!document.contains(previewContainer)) {
        clearInterval(refreshInterval);
        return;
      }
      img.src = camera.camera.snapshotUrl + '?t=' + Date.now();
    }, 3000);
  } else {
    // No preview available
    previewContainer.innerHTML = `
      <div style="
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        color: #888;
        font-size: 12px;
      ">📹 No Preview</div>
    `;
  }
}

// Load sensors
async function loadSensors() {
  try {
    console.log("🔄 Đang load sensors từ /api/sensors...");
    const res = await fetch("/api/sensors");
    console.log("📡 Response status:", res.status);
    const data = await res.json();
    console.log("📦 Data nhận được:", data);
    
    if (data.success && data.sensors) {
      sensorsData = data.sensors;
      console.log(`✅ Đã load ${sensorsData.length} sensors`);
      
      // Add sensor hotspots to current room
      if (currentRoomId) {
        addSensorHotspots(currentRoomId);
      }
      // Update widget and camera panel with current room sensors
      updateSensorWidget();
      renderCameraPanel();
      // Start real-time updates
      startSensorRealTimeUpdates();
    } else {
      console.error("❌ API không trả về sensors:", data);
    }
  } catch (err) {
    console.error("❌ Error loading sensors:", err);
  }
}

// Start real-time sensor updates (simulate temperature changes)
function startSensorRealTimeUpdates() {
  // Clear existing interval
  if (sensorUpdateInterval) clearInterval(sensorUpdateInterval);
  
  // Update local sensors every 5 seconds (KHÔNG thay đổi temperature/humidity/pm25 nữa)
  sensorUpdateInterval = setInterval(() => {
    sensorsData.forEach(sensor => {
      // Only update CO2 and smoke (simulated)
      if (sensor.sensors && sensor.sensors.co2) {
        const co2 = sensor.sensors.co2;
        // Simulate CO2 fluctuation (±20 ppm)
        const change = (Math.random() - 0.5) * 40;
        co2.value = Math.round(co2.value + change);
        
        // Keep within realistic bounds
        co2.value = Math.max(300, Math.min(2500, co2.value));
      }
      
      if (sensor.sensors && sensor.sensors.smoke) {
        const smoke = sensor.sensors.smoke;
        // Small fluctuation
        const change = (Math.random() - 0.5) * 2;
        smoke.value = Math.max(0, Math.round(smoke.value + change));
      }
    });
    
    // Refresh widget
    updateSensorWidget();
  }, 5000); // Update every 5 seconds
  
  // Fetch REAL temperature, humidity, PM2.5 data every 30 seconds
  fetchRealPM25Data(); // Gọi ngay lần đầu
  setInterval(fetchRealPM25Data, 10000); // Rồi mỗi 10 giây
}

// Fetch real PM2.5 data from API
async function fetchRealPM25Data() {
  try {
    // Đợi nếu sensors chưa load
    if (sensorsData.length === 0) {
      console.log("⏳ Đang đợi sensors load...");
      return;
    }
    
    if (!currentRoomId) {
      console.log("⏳ Chưa chọn phòng, bỏ qua fetch dữ liệu môi trường.");
      return;
    }

    console.log("🔄 Đang fetch dữ liệu môi trường thực...");
    const res = await fetch(`/api/real-data/combined?roomId=${currentRoomId}`);
    const data = await res.json();
    
    console.log("📡 Phản hồi API:", data);
    
    if (data.success && data.data) {
      const currentRoomSensors = sensorsData.filter(s => s.roomId === currentRoomId && s.type !== 'camera');

      // Update ONLY environment sensors in current room (skip cameras)
      currentRoomSensors.forEach((sensor, index) => {
        if (!sensor.sensors) return; // Skip if no sensors data
        
        const oldTemp = sensor.sensors.temperature?.value;
        const oldHumidity = sensor.sensors.humidity?.value;
        const oldPM25 = sensor.sensors.pm25?.value;
        
        // Update with real data (add small variation for each sensor)
        const variation = index * 0.5;
        
        sensor.sensors.temperature.value = Math.round((data.data.temperature + variation) * 10) / 10;
        sensor.sensors.humidity.value = Math.round(data.data.humidity + variation);
        sensor.sensors.pm25.value = Math.round((data.data.pm25 + variation) * 10) / 10;
        
        // Update timestamp
        sensor.lastUpdate = new Date().toISOString();
        
        console.log(`✅ Sensor ${index + 1} cập nhật (phòng ${currentRoomId}):`);
        console.log(`   🌡️ Nhiệt độ: ${oldTemp}° → ${sensor.sensors.temperature.value}°C (THỰC)`);
        console.log(`   💧 Độ ẩm: ${oldHumidity}% → ${sensor.sensors.humidity.value}% (THỰC)`);
        console.log(`   💨 PM2.5: ${oldPM25} → ${sensor.sensors.pm25.value} µg/m³ (THỰC)`);
      });
      
      // Refresh widget
      updateSensorWidget();
      
      console.log(`📊 Chất lượng không khí: ${data.data.aqi.level}`);
      console.log(`📍 Vị trí: ${data.data.location}`);
      console.log(`🌤️ Thời tiết: ${data.data.weather}`);
    } else {
      console.warn("⚠️ API không trả về dữ liệu:", data);
    }
  } catch (err) {
    console.error("❌ Lỗi fetch dữ liệu môi trường:", err.message);
  }
}

// Add sensor hotspots to room (show ALL sensors in every room)
function addSensorHotspots(roomId) {
  const scene = scenes[roomId];
  if (!scene) return;
  
  const container = scene.hotspotContainer();
  
  // Remove existing sensor hotspots
  try {
    const existing = container.listHotspots();
    existing.forEach(h => {
      if (h.element && h.element.classList && h.element.classList.contains("sensor-hotspot")) {
        container.destroyHotspot(h);
      }
    });
  } catch {}
  
  // Hotspots disabled - using widget instead
}

/* ===== MINIMAP FUNCTIONS ===== */

// Toggle minimap collapse
if (minimapToggle) {
  minimapToggle.addEventListener("click", () => {
    isMinimapCollapsed = !isMinimapCollapsed;
    if (isMinimapCollapsed) {
      minimapContent.style.display = "none";
      minimapToggle.textContent = "+";
    } else {
      minimapContent.style.display = "block";
      minimapToggle.textContent = "−";
    }
  });
}

// Get current floor
function getCurrentFloor() {
  if (!minimapData || !minimapData.floors) return null;
  return minimapData.floors.find(f => f.id === currentFloorId) || minimapData.floors[0];
}

// Get current room floor
function getCurrentRoomFloor() {
  const room = roomsData[currentRoomId];
  return room ? (room.floor || 1) : 1;
}

// Render floor selector
function renderFloorTabs() {
  const floorTabsContainer = document.getElementById("floorTabs");
  if (!floorTabsContainer || !minimapData || !minimapData.floors) return;

  floorTabsContainer.innerHTML = '';

  const currentFloor = getCurrentFloor();
  if (!currentFloor) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'floor-switcher';

  const currentLabel = document.createElement('div');
  currentLabel.className = 'floor-current-name';
  currentLabel.textContent = currentFloor.name;

  const dropdown = document.createElement('select');
  dropdown.className = 'floor-dropdown';

  const remainingFloors = minimapData.floors.filter(f => f.id !== currentFloor.id);

  const placeholder = document.createElement('option');
  placeholder.value = '';

  if (remainingFloors.length === 0) {
    placeholder.textContent = 'Không có minimap khác';
    dropdown.disabled = true;
  } else {
    placeholder.textContent = 'Chọn minimap khác...';
    dropdown.disabled = false;
  }

  dropdown.appendChild(placeholder);

  remainingFloors.forEach(floor => {
    const option = document.createElement('option');
    option.value = String(floor.id);
    option.textContent = floor.name;
    dropdown.appendChild(option);
  });

  dropdown.addEventListener('change', () => {
    const selectedFloorId = Number(dropdown.value);
    if (selectedFloorId) {
      switchFloor(selectedFloorId);
    }
  });

  wrapper.appendChild(currentLabel);
  wrapper.appendChild(dropdown);
  floorTabsContainer.appendChild(wrapper);
}

// Switch floor
function switchFloor(floorId) {
  currentFloorId = floorId;
  renderFloorTabs();
  const floor = getCurrentFloor();
  if (floor && floor.image) {
    userMinimapImage.src = floor.image;
    userMinimapImage.onload = () => {
      initUserMinimapCanvas();
      drawUserMinimap();
    };
  }
}

// Load minimap
async function loadMinimap() {
  try {
    const res = await fetch("/api/minimap");
    const data = await res.json();

    if (data.success && data.minimap && data.minimap.floors && data.minimap.floors.length > 0) {
      minimapData = data.minimap;
      
      // Auto-switch to current room's floor
      const roomFloor = getCurrentRoomFloor();
      currentFloorId = minimapData.floors.find(f => f.id === roomFloor)?.id || minimapData.floors[0].id;
      
      const floor = getCurrentFloor();
      if (floor && floor.image) {
        userMinimapImage.src = floor.image;
        
        userMinimapImage.onload = () => {
          minimapWrapper.style.display = "block";
          
          setTimeout(() => {
            renderFloorTabs();
            initUserMinimapCanvas();
            drawUserMinimap();
          }, 100);
        };
      }
    }
  } catch (err) {
    console.error("Lỗi load minimap:", err);
  }
}

// Initialize canvas
function initUserMinimapCanvas() {
  const width = userMinimapImage.offsetWidth;
  const height = userMinimapImage.offsetHeight;
  
  userMinimapCanvas.width = width;
  userMinimapCanvas.height = height;
  minimapCtx = userMinimapCanvas.getContext("2d");

  // Click event to switch rooms
  userMinimapCanvas.addEventListener("click", handleMinimapClick);
  
  // Hover effect
  userMinimapCanvas.addEventListener("mousemove", handleMinimapHover);
}

// Handle click on minimap marker
function handleMinimapClick(e) {
  const floor = getCurrentFloor();
  if (!floor || !floor.markers) return;

  const rect = userMinimapCanvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;

  const clickedMarkerIndex = getMarkerAtPosition(x, y);
  if (clickedMarkerIndex !== -1) {
    const marker = floor.markers[clickedMarkerIndex];
    if (marker.roomId && roomsData[marker.roomId]) {
      switchRoom(marker.roomId);
      
      // Auto-switch to room's floor if different
      const roomFloor = roomsData[marker.roomId].floor || 1;
      if (roomFloor !== currentFloorId) {
        switchFloor(roomFloor);
      }
    }
  }
}

// Handle hover on minimap
function handleMinimapHover(e) {
  const floor = getCurrentFloor();
  if (!floor || !floor.markers) return;

  const rect = userMinimapCanvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;

  const hoverIndex = getMarkerAtPosition(x, y);
  userMinimapCanvas.style.cursor = hoverIndex !== -1 ? "pointer" : "default";
}

// Get marker at position
function getMarkerAtPosition(x, y) {
  const floor = getCurrentFloor();
  if (!floor || !floor.markers) return -1;

  const tolerance = 20 / userMinimapCanvas.width;

  for (let i = floor.markers.length - 1; i >= 0; i--) {
    const marker = floor.markers[i];
    const dx = marker.x - x;
    const dy = marker.y - y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < tolerance) {
      return i;
    }
  }
  return -1;
}

// Draw minimap
function drawUserMinimap() {
  if (!minimapCtx) return;
  const floor = getCurrentFloor();
  if (!floor) return;

  minimapCtx.clearRect(0, 0, userMinimapCanvas.width, userMinimapCanvas.height);

  if (!floor.markers || floor.markers.length === 0) return;

  floor.markers.forEach((marker, index) => {
    const x = marker.x * userMinimapCanvas.width;
    const y = marker.y * userMinimapCanvas.height;

    const isCurrentRoom = marker.roomId === currentRoomId;
    const room = roomsData[marker.roomId];

    // Draw outer glow for current room
    if (isCurrentRoom) {
      minimapCtx.beginPath();
      minimapCtx.arc(x, y, 18, 0, 2 * Math.PI);
      minimapCtx.fillStyle = "rgba(33, 150, 243, 0.3)";
      minimapCtx.fill();
    }

    // Draw circle
    minimapCtx.beginPath();
    minimapCtx.arc(x, y, 12, 0, 2 * Math.PI);
    
    if (isCurrentRoom) {
      minimapCtx.fillStyle = "#2196F3";
    } else {
      minimapCtx.fillStyle = marker.roomId ? "#4CAF50" : "#999";
    }
    
    minimapCtx.fill();
    minimapCtx.strokeStyle = "#fff";
    minimapCtx.lineWidth = 3;
    minimapCtx.stroke();

    // Draw number
    minimapCtx.fillStyle = "#fff";
    minimapCtx.font = "bold 12px Arial";
    minimapCtx.textAlign = "center";
    minimapCtx.textBaseline = "middle";
    minimapCtx.fillText(index + 1, x, y);

    // Draw room name if available
    if (room) {
      minimapCtx.fillStyle = isCurrentRoom ? "#2196F3" : "#000";
      minimapCtx.font = isCurrentRoom ? "bold 11px Arial" : "11px Arial";
      minimapCtx.fillText(room.name, x, y + 22);
    }
  });
}

// Update minimap highlight
function updateMinimapHighlight() {
  // Auto-switch to current room's floor
  const roomFloor = getCurrentRoomFloor();
  if (roomFloor !== currentFloorId) {
    switchFloor(roomFloor);
  } else {
    drawUserMinimap();
  }
}
/* ===== ZOOM CONTROL ===== */
function initZoomControl() {
  const zoomSlider = document.getElementById("zoomSlider");
  const zoomValue = document.getElementById("zoomValue");
  const pano = document.getElementById("pano");
  
  // Đồng bộ giới hạn slider với cấu hình FOV
  if (zoomSlider) {
    const minDeg = Math.round(MIN_FOV * 180 / Math.PI);
    const maxDeg = Math.round(MAX_FOV * 180 / Math.PI);
    zoomSlider.min = String(minDeg);
    zoomSlider.max = String(maxDeg);
    // Clamp giá trị hiện tại nếu ngoài khoảng
    const cur = parseInt(zoomSlider.value || String(minDeg), 10);
    const clamped = Math.min(maxDeg, Math.max(minDeg, cur));
    zoomSlider.value = String(clamped);
    if (zoomValue) zoomValue.textContent = String(clamped);
  }
  
  if (!zoomSlider) return;
  
  // Cập nhật từ slider với animation mượt
  zoomSlider.addEventListener("input", (e) => {
    const targetFov = parseFloat(e.target.value) * Math.PI / 180;
    if (zoomValue) zoomValue.textContent = e.target.value;
    animateFovTo(targetFov);
  });
  
  // Zoom bằng cách cuộn chuột với throttling
  let lastWheelTime = 0;
  const wheelThrottle = 50; // ms - tối ưu tốc độ cuộn
  
  if (pano) {
    pano.addEventListener("wheel", (e) => {
      const now = Date.now();
      if (now - lastWheelTime < wheelThrottle) return;
      lastWheelTime = now;
      
      e.preventDefault();
      
      if (!viewer || !currentRoomId) return;
      
      const scene = scenes[currentRoomId];
      if (!scene || !scene.view()) return;
      
      const currentFov = scene.view().fov();

      // Tính toán zoom step dựa trên deltaY (mượt hơn)
      const baseStep = 1.2 * Math.PI / 180; // ~1.2° mỗi tick
      const accel = Math.min(3, 1 + Math.abs(e.deltaY) / 150); // tăng nhẹ theo tốc độ cuộn
      const delta = (e.deltaY < 0 ? -1 : 1) * baseStep * accel;

      // Mục tiêu FOV + easing
      let targetFov = currentFov + delta;
      targetFov = Math.max(MIN_FOV, Math.min(MAX_FOV, targetFov));

      animateFovTo(targetFov);
    }, { passive: false });
  }
}

// Hàm helper để cập nhật zoom
function updateSceneZoom(fov) {
  if (viewer && currentRoomId) {
    const scene = scenes[currentRoomId];
    if (scene && scene.view()) {
      scene.view().setFov(fov);
    }
  }
}

// Animation mượt để chuyển FOV
let fovAnimFrame = null;
function animateFovTo(targetFov) {
  if (!viewer || !currentRoomId) return;
  const scene = scenes[currentRoomId];
  if (!scene || !scene.view()) return;

  // Hủy frame cũ nếu đang chạy
  if (fovAnimFrame) cancelAnimationFrame(fovAnimFrame);

  const view = scene.view();
  const ease = 0.25; // hệ số easing (0-1)

  function step() {
    const cur = view.fov();
    const diff = targetFov - cur;
    if (Math.abs(diff) < 0.0005) {
      view.setFov(targetFov);
      // đồng bộ slider
      const deg = Math.round(targetFov * 180 / Math.PI);
      const slider = document.getElementById("zoomSlider");
      const valueEl = document.getElementById("zoomValue");
      if (slider) slider.value = String(deg);
      if (valueEl) valueEl.textContent = String(deg);
      fovAnimFrame = null;
      return;
    }
    const next = cur + diff * ease;
    view.setFov(next);
    // đồng bộ slider mỗi frame
    const deg = Math.round(next * 180 / Math.PI);
    const slider = document.getElementById("zoomSlider");
    const valueEl = document.getElementById("zoomValue");
    if (slider) slider.value = String(deg);
    if (valueEl) valueEl.textContent = String(deg);
    fovAnimFrame = requestAnimationFrame(step);
  }
  fovAnimFrame = requestAnimationFrame(step);
}

/* ===== AUTO TOUR FUNCTIONALITY ===== */

function initAutoTour() {
  const startBtn = document.getElementById('autoTourStartBtn');
  const playPauseBtn = document.getElementById('tourPlayPauseBtn');
  const prevBtn = document.getElementById('tourPrevBtn');
  const nextBtn = document.getElementById('tourNextBtn');
  const restartBtn = document.getElementById('tourRestartBtn');
  const stopBtn = document.getElementById('tourStopBtn');

  if (startBtn) startBtn.addEventListener('click', startAutoTour);
  if (playPauseBtn) playPauseBtn.addEventListener('click', togglePlayPause);
  if (prevBtn) prevBtn.addEventListener('click', goToPreviousStop);
  if (nextBtn) nextBtn.addEventListener('click', goToNextStop);
  if (restartBtn) restartBtn.addEventListener('click', restartAutoTour);
  if (stopBtn) stopBtn.addEventListener('click', stopAutoTour);
  
  // Load tour scenario from server if available
  loadTourScenario();
}

function togglePlayPause() {
  if (autoTourState.isPaused) {
    resumeAutoTour();
  } else {
    pauseAutoTour();
  }
}

function pauseAutoTour() {
  if (!autoTourState.isPlaying || autoTourState.isPaused) return;
  
  autoTourState.isPaused = true;
  autoTourState.pausedAt = Date.now();
  
  // Clear all timers but keep state
  if (autoTourState.timeoutId) {
    clearTimeout(autoTourState.timeoutId);
    autoTourState.timeoutId = null;
  }
  if (autoTourState.animationFrameId) {
    cancelAnimationFrame(autoTourState.animationFrameId);
    autoTourState.animationFrameId = null;
  }
  if (autoTourState.progressIntervalId) {
    clearInterval(autoTourState.progressIntervalId);
    autoTourState.progressIntervalId = null;
  }
  
  updateTourUI();
}

function resumeAutoTour() {
  if (!autoTourState.isPlaying || !autoTourState.isPaused) return;
  
  autoTourState.isPaused = false;
  updateTourUI();
  
  // Continue from current stop
  executeCurrentStop();
}

function goToPreviousStop() {
  if (!autoTourState.isPlaying) return;
  
  // Clear current timers
  clearAllTourTimers();
  removeAllTourHighlights();
  removeTourInfo();
  
  // Go to previous stop
  autoTourState.currentStopIndex = Math.max(0, autoTourState.currentStopIndex - 1);
  autoTourState.isPaused = false;
  
  updateTourUI();
  executeCurrentStop();
}

function goToNextStop() {
  if (!autoTourState.isPlaying) return;
  
  // Clear current timers
  clearAllTourTimers();
  removeAllTourHighlights();
  removeTourInfo();
  
  // Go to next stop
  autoTourState.currentStopIndex++;
  autoTourState.isPaused = false;
  
  if (autoTourState.currentStopIndex >= autoTourState.tourStops.length) {
    completeTour();
  } else {
    updateTourUI();
    executeCurrentStop();
  }
}

function restartAutoTour() {
  if (!autoTourState.isPlaying) return;
  
  // Clear everything
  clearAllTourTimers();
  removeAllTourHighlights();
  removeTourInfo();
  
  // Reset to beginning
  autoTourState.currentStopIndex = 0;
  autoTourState.isPaused = false;
  
  updateTourUI();
  executeCurrentStop();
}

function clearAllTourTimers() {
  if (autoTourState.animationFrameId) {
    cancelAnimationFrame(autoTourState.animationFrameId);
    autoTourState.animationFrameId = null;
  }
  if (autoTourState.timeoutId) {
    clearTimeout(autoTourState.timeoutId);
    autoTourState.timeoutId = null;
  }
  if (autoTourState.progressIntervalId) {
    clearInterval(autoTourState.progressIntervalId);
    autoTourState.progressIntervalId = null;
  }
}

async function loadTourScenario() {
  try {
    const res = await fetch('/api/tour-scenario');
    const data = await res.json();
    if (data.success && data.scenario) {
      autoTourState.currentScenario = data.scenario;
    }
  } catch (err) {
    console.log('No custom tour scenario found, will use default route');
  }
}

function startAutoTour() {
  // Build tour route from scenario or auto-generate
  let tourRoute;
  
  if (autoTourState.currentScenario && autoTourState.currentScenario.stops) {
    tourRoute = autoTourState.currentScenario.stops;
  } else {
    tourRoute = buildTourRoute();
  }
  
  if (!tourRoute || tourRoute.length === 0) {
    alert('Không có điểm tham quan nào. Vui lòng thêm phòng và hotspot!');
    return;
  }

  autoTourState.isPlaying = true;
  autoTourState.isPaused = false;
  autoTourState.currentStopIndex = 0;
  autoTourState.tourStops = tourRoute;

  // Update UI
  updateTourUI();
  
  // Start tour from first stop
  executeCurrentStop();
}

function stopAutoTour() {
  autoTourState.isPlaying = false;
  autoTourState.isPaused = false;
  
  // Clear all timers and animations
  clearAllTourTimers();

  // Remove all highlights
  removeAllTourHighlights();
  
  // Remove info overlay if exists
  const overlay = document.querySelector('.tour-info-overlay');
  if (overlay) overlay.remove();

  // Update UI
  updateTourUI();
}

function buildTourRoute() {
  // Get all rooms in order
  const rooms = Object.values(roomsData).sort((a, b) => a.id - b.id);
  
  const route = [];
  
  rooms.forEach(room => {
    // Add room as a stop
    route.push({
      type: 'room',
      roomId: room.id,
      roomName: room.name
    });
    
    // Add hotspots as stops
    if (room.hotspots && room.hotspots.length > 0) {
      room.hotspots.forEach((hotspot, index) => {
        const targetRoom = roomsData[hotspot.target];
        if (targetRoom) {
          route.push({
            type: 'hotspot',
            roomId: room.id,
            hotspotIndex: index,
            hotspot: hotspot,
            targetRoomName: targetRoom.name
          });
        }
      });
    }
  });
  
  return route;
}

function executeCurrentStop() {
  if (!autoTourState.isPlaying || autoTourState.isPaused) return;
  
  const stop = autoTourState.tourStops[autoTourState.currentStopIndex];
  
  if (!stop) {
    // Tour completed
    completeTour();
    return;
  }

  if (stop.type === 'room') {
    executeRoomStop(stop);
  } else if (stop.type === 'hotspot') {
    executeHotspotStop(stop);
  }
}

function executeNextStop() {
  autoTourState.currentStopIndex++;
  executeCurrentStop();
}

function executeRoomStop(stop) {
  // Switch to room if not already there
  if (currentRoomId !== stop.roomId) {
    switchRoom(stop.roomId);
  }

  // Show room info with custom title/description if available
  const title = stop.title || roomsData[stop.roomId]?.name || 'Phòng';
  const description = stop.description || `Đang tham quan điểm ${autoTourState.currentStopIndex + 1}/${autoTourState.tourStops.length}`;
  
  showTourInfo(title, description);

  // Animate camera pan
  animateCameraPan(getTourPanDuration(), () => {
    // After pan, wait and move to next
    const duration = stop.duration || AUTO_TOUR_CONFIG.stopDuration;
    autoTourState.timeoutId = setTimeout(() => {
      removeTourInfo();
      executeNextStop();
    }, duration);
    
    // Update progress bar
    startProgressBar(duration);
  });
}

function executeHotspotStop(stop) {
  // Make sure we're in the correct room
  if (currentRoomId !== stop.roomId) {
    switchRoom(stop.roomId);
  }

  // Get hotspot data
  const room = roomsData[stop.roomId];
  if (!room || !room.hotspots || !room.hotspots[stop.hotspotIndex]) {
    // Hotspot not found, skip to next
    console.warn('Hotspot not found, skipping');
    executeNextStop();
    return;
  }

  const hotspot = room.hotspots[stop.hotspotIndex];
  const targetRoom = roomsData[hotspot.target];

  // Pan camera to hotspot
  const targetYaw = degToRad(hotspot.yaw);
  const targetPitch = degToRad(-hotspot.pitch);

  panCameraTo(targetYaw, targetPitch, () => {
    // Highlight the hotspot
    highlightHotspot(stop.hotspotIndex);
    
    // Show info with custom title/description if available
    const title = stop.title || `Điểm chuyển: ${targetRoom?.name || 'Phòng khác'}`;
    const description = stop.description || `Hotspot ${autoTourState.currentStopIndex + 1}/${autoTourState.tourStops.length}`;
    
    showTourInfo(title, description);

    // Wait and move to next
    const duration = stop.duration || AUTO_TOUR_CONFIG.stopDuration;
    autoTourState.timeoutId = setTimeout(() => {
      removeHotspotHighlight(stop.hotspotIndex);
      removeTourInfo();
      executeNextStop();
    }, duration);
    
    // Update progress bar
    startProgressBar(duration);
  });
}

function animateCameraPan(duration, onComplete) {
  const scene = scenes[currentRoomId];
  if (!scene || !scene.view()) {
    onComplete();
    return;
  }

  const view = scene.view();
  const startYaw = view.yaw();
  const animationDuration = Math.max(1000, Number(duration) || AUTO_TOUR_CONFIG.panDuration);
  const startTime = Date.now();
  
  // Pan 360 degrees slowly
  const targetYaw = startYaw + Math.PI * 2;

  function animate() {
    if (!autoTourState.isPlaying) return;
    
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / animationDuration, 1);
    
    // Ease-in-out function
    const eased = progress < 0.5 
      ? 2 * progress * progress 
      : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    
    const currentYaw = startYaw + (targetYaw - startYaw) * eased;
    view.setYaw(currentYaw);
    
    if (progress < 1) {
      autoTourState.animationFrameId = requestAnimationFrame(animate);
    } else {
      onComplete();
    }
  }
  
  autoTourState.animationFrameId = requestAnimationFrame(animate);
}

function panCameraTo(targetYaw, targetPitch, onComplete) {
  const scene = scenes[currentRoomId];
  if (!scene || !scene.view()) {
    onComplete();
    return;
  }

  const view = scene.view();
  const startYaw = view.yaw();
  const startPitch = view.pitch();
  const duration = getTourPanDuration();
  const startTime = Date.now();

  function animate() {
    if (!autoTourState.isPlaying) return;
    
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Ease-in-out function
    const eased = progress < 0.5 
      ? 2 * progress * progress 
      : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    
    const currentYaw = startYaw + (targetYaw - startYaw) * eased;
    const currentPitch = startPitch + (targetPitch - startPitch) * eased;
    
    view.setYaw(currentYaw);
    view.setPitch(currentPitch);
    
    if (progress < 1) {
      autoTourState.animationFrameId = requestAnimationFrame(animate);
    } else {
      onComplete();
    }
  }
  
  autoTourState.animationFrameId = requestAnimationFrame(animate);
}

function highlightHotspot(index) {
  const scene = scenes[currentRoomId];
  if (!scene) return;
  
  const container = scene.hotspotContainer();
  const hotspots = container.listHotspots();
  
  if (hotspots[index]) {
    const element = hotspots[index]._domElement;
    if (element) {
      element.classList.add('tour-highlight');
    }
  }
}

function removeHotspotHighlight(index) {
  const scene = scenes[currentRoomId];
  if (!scene) return;
  
  const container = scene.hotspotContainer();
  const hotspots = container.listHotspots();
  
  if (hotspots[index]) {
    const element = hotspots[index]._domElement;
    if (element) {
      element.classList.remove('tour-highlight');
    }
  }
}

function removeAllTourHighlights() {
  Object.values(scenes).forEach(scene => {
    const container = scene.hotspotContainer();
    const hotspots = container.listHotspots();
    hotspots.forEach(h => {
      if (h._domElement) {
        h._domElement.classList.remove('tour-highlight');
      }
    });
  });
}

function showTourInfo(title, description) {
  removeTourInfo();
  
  const overlay = document.createElement('div');
  overlay.className = 'tour-info-overlay';
  overlay.innerHTML = `
    <h2>${title}</h2>
    <p>${description}</p>
  `;
  
  document.body.appendChild(overlay);
}

function removeTourInfo() {
  const overlay = document.querySelector('.tour-info-overlay');
  if (overlay) overlay.remove();
}

function startProgressBar(duration) {
  const progressFill = document.getElementById('progressFill');
  if (!progressFill) return;
  
  progressFill.style.width = '0%';
  
  const startTime = Date.now();
  
  if (autoTourState.progressIntervalId) {
    clearInterval(autoTourState.progressIntervalId);
  }
  
  autoTourState.progressIntervalId = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const progress = Math.min((elapsed / duration) * 100, 100);
    progressFill.style.width = progress + '%';
    
    if (progress >= 100) {
      clearInterval(autoTourState.progressIntervalId);
      autoTourState.progressIntervalId = null;
    }
  }, 50);
}

function completeTour() {
  showTourInfo('Hoàn thành!', 'Đã tham quan xong tất cả các điểm. Cảm ơn bạn đã tham quan!');
  
  setTimeout(() => {
    stopAutoTour();
  }, 5000);
}

function updateTourUI() {
  const startBtn = document.getElementById('autoTourStartBtn');
  const controlPanel = document.getElementById('tourControlPanel');
  const playPauseBtn = document.getElementById('tourPlayPauseBtn');
  const playPauseIcon = playPauseBtn?.querySelector('.control-icon');
  const tourStatus = document.getElementById('tourStatus');
  
  if (!startBtn || !controlPanel) return;
  
  if (autoTourState.isPlaying) {
    // Show control panel, hide start button
    startBtn.style.display = 'none';
    controlPanel.style.display = 'flex';
    
    // Update play/pause button
    if (playPauseBtn && playPauseIcon) {
      if (autoTourState.isPaused) {
        playPauseIcon.textContent = '▶';
        playPauseBtn.classList.add('paused');
        playPauseBtn.classList.remove('active');
        playPauseBtn.title = 'Tiếp tục';
      } else {
        playPauseIcon.textContent = '⏸';
        playPauseBtn.classList.add('active');
        playPauseBtn.classList.remove('paused');
        playPauseBtn.title = 'Tạm dừng';
      }
    }
    
    // Update status text
    if (tourStatus) {
      const current = autoTourState.currentStopIndex + 1;
      const total = autoTourState.tourStops.length;
      const status = autoTourState.isPaused ? 'Đã tạm dừng' : 'Đang tham quan';
      tourStatus.textContent = `${status} - Điểm ${current}/${total}`;
    }
  } else {
    // Show start button, hide control panel
    startBtn.style.display = 'flex';
    controlPanel.style.display = 'none';
  }
}