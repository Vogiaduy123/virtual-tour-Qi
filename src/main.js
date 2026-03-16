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
let pendingMailPlacement = null;
let activeMailHotspotIndex = -1;
let isMailDragActive = false;
let activeNoteHotspotEl = null;

if (window.matchMedia) {
  const setMode = () => {
    const mql = window.matchMedia("(max-width: 500px), (max-height: 500px)");
    if (mql.matches) {
      document.body.classList.remove("desktop");
      document.body.classList.add("mobile");
    } else {
      document.body.classList.remove("mobile");
      document.body.classList.add("desktop");
    }
  };

  setMode();
  const mql = window.matchMedia("(max-width: 500px), (max-height: 500px)");
  if (typeof mql.addEventListener === "function") {
    mql.addEventListener("change", setMode);
  } else if (typeof mql.addListener === "function") {
    mql.addListener(setMode);
  }
} else {
  document.body.classList.add("desktop");
}

document.body.classList.add("no-touch");
window.addEventListener("touchstart", () => {
  document.body.classList.remove("no-touch");
  document.body.classList.add("touch");
}, { passive: true, once: true });

import { degToRad, radToDeg, parseJsonResponse } from './core/utils.js';
import { fetchRooms } from './core/api.js';
import { initMinimap, loadMinimap, updateMinimapHighlight, drawUserMinimap } from './features/minimap.js';
import { initSensors, loadSensors, updateSensorWidget, renderCameraPanel, addSensorHotspots, startSensorRealTimeUpdates, closeCameraModal } from './features/sensors.js';

// Media overlay elements
const mediaOverlay = document.getElementById("mediaOverlay");
const mediaOverlayTitle = document.getElementById("mediaOverlayTitle");
const mediaOverlayDescription = document.getElementById("mediaOverlayDescription");
const mediaOverlayContent = document.getElementById("mediaOverlayContent");
const mediaOverlayLink = document.getElementById("mediaOverlayLink");
const mediaOverlayClose = document.getElementById("mediaOverlayClose");
const MEDIA_ICONS = { image: "🖼️", pdf: "📄", video: "🎥", "3d": "🎮", youtube: "▶️", facebook: "", web: "🌐", note: "i" };
// Mail feature elements
const mailToolbox = document.getElementById("mailToolbox");
const mailDragIcon = document.getElementById("mailDragIcon");
const mailComposerPanel = document.getElementById("mailComposerPanel");
const mailComposerTitle = document.getElementById("mailComposerTitle");
const mailComposerClose = document.getElementById("mailComposerClose");
const mailPointTitle = document.getElementById("mailPointTitle");
const mailRecipientSelect = document.getElementById("mailRecipientSelect");
const mailRecipientInput = document.getElementById("mailRecipientInput");
const mailSubjectInput = document.getElementById("mailSubjectInput");
const mailBodyInput = document.getElementById("mailBodyInput");
const mailComposerStatus = document.getElementById("mailComposerStatus");
const mailSaveBtn = document.getElementById("mailSaveBtn");
const mailSendBtn = document.getElementById("mailSendBtn");
const mailDeleteBtn = document.getElementById("mailDeleteBtn");
// Compass elements
const compassContainer = document.getElementById("compassContainer");
const compassCanvas = document.getElementById("compassCanvas");
let compassCtx = null;
let viewerUiAnimId = null;
let northOffset = 0;


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

document.addEventListener("click", () => {
  if (activeNoteHotspotEl) {
    activeNoteHotspotEl.classList.remove("visible");
    activeNoteHotspotEl = null;
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
    initMinimap({
      getRoomsData: () => roomsData,
      getCurrentRoomId: () => currentRoomId,
      switchRoom: switchRoom
    });
    
    initSensors({
      getCurrentRoomId: () => currentRoomId,
      getRoomsData: () => roomsData,
      getScene: (id) => scenes[id],
      switchRoom: switchRoom
    });

    // Load rooms first
    const rooms = await fetchRooms();
    
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
    // Initialize user mail feature
    initMailFeature();
  } catch (err) {
    console.error("LOAD ERROR:", err);
  }
}

initApp();

/* ===== COMPASS ===== */
function initCompass() {
  if (compassCanvas) {
    compassCtx = compassCanvas.getContext("2d");
  }
  startViewerUiLoop();
}

function startViewerUiLoop() {
  if (viewerUiAnimId) cancelAnimationFrame(viewerUiAnimId);
  const draw = () => {
    syncHotspotRollCompensation();
    drawCompass();
    viewerUiAnimId = requestAnimationFrame(draw);
  };
  viewerUiAnimId = requestAnimationFrame(draw);
}

function syncHotspotRollCompensation() {
  if (!pano || !currentRoomId) return;

  const scene = scenes[currentRoomId];
  const view = scene?.view?.();
  if (!view) return;

  const roll = typeof view.roll === "function" ? view.roll() : 0;
  const compensationDeg = Number.isFinite(roll) ? -radToDeg(roll) : 0;
  pano.style.setProperty("--hotspot-roll-compensation", `${compensationDeg}deg`);
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
  closeCameraModal();
  closeMailComposer();
  
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
  activeNoteHotspotEl = null;
  clearFixedMailHotspots();
  // Remove existing hotspots
  try {
    const existing = container.listHotspots();
    existing.forEach(h => container.destroyHotspot(h));
  } catch {}

  const hotspots = room.hotspots || [];
  const mediaHotspots = room.mediaHotspots || [];
  const mailHotspots = room.mailHotspots || [];

  hotspots.forEach(hs => {
    const el = document.createElement("div");
    el.className = "hotspot";
    
    // Admin lưu theo degrees, chuyển sang radians cho Marzipano
    const yawRad = degToRad(hs.yaw);
    const pitchRad = degToRad(-hs.pitch); // Đảo chiều dọc
    
    if (hs.iconUrl && typeof hs.iconUrl === "string") {
      const normalizedIconUrl = hs.iconUrl.trim();
      if (normalizedIconUrl) {
        const safeIconUrl = normalizedIconUrl.replace(/"/g, "\\\"");
        el.style.setProperty('--hotspot-icon', `url("${safeIconUrl}")`);
      }
    }
    
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
      el.className = "note-hotspot info-hotspot";
      el.setAttribute("aria-label", media.title || "Ghi chú");
      el.textContent = "";
      el.style.cursor = "pointer";
      
      const header = document.createElement("div");
      header.className = "info-hotspot-header";

      const iconWrap = document.createElement("div");
      iconWrap.className = "info-hotspot-icon-wrapper";
      const icon = document.createElement("img");
      icon.className = "info-hotspot-icon";
      icon.src = "images/info.png";
      icon.alt = "Info";
      iconWrap.appendChild(icon);

      const titleWrap = document.createElement("div");
      titleWrap.className = "info-hotspot-title-wrapper";
      const title = document.createElement("div");
      title.className = "info-hotspot-title";
      title.textContent = media.title || "Ghi chú";
      titleWrap.appendChild(title);

      const closeWrap = document.createElement("div");
      closeWrap.className = "info-hotspot-close-wrapper";
      closeWrap.setAttribute("role", "button");
      closeWrap.setAttribute("aria-label", "Đóng ghi chú");
      const closeIcon = document.createElement("span");
      closeIcon.className = "info-hotspot-close-icon";
      closeIcon.textContent = "×";
      closeWrap.appendChild(closeIcon);

      header.appendChild(iconWrap);
      header.appendChild(titleWrap);
      header.appendChild(closeWrap);

      const content = document.createElement("div");
      content.className = "info-hotspot-text";
      content.textContent = media.mediaUrl || media.description || "Không có nội dung";

      el.appendChild(header);
      el.appendChild(content);

      closeWrap.addEventListener("click", (e) => {
        e.stopPropagation();
        el.classList.remove("visible");
        if (activeNoteHotspotEl === el) activeNoteHotspotEl = null;
      });

      header.addEventListener("click", (e) => {
        e.stopPropagation();

        if (activeNoteHotspotEl && activeNoteHotspotEl !== el) {
          activeNoteHotspotEl.classList.remove("visible");
        }

        const willOpen = !el.classList.contains("visible");
        el.classList.toggle("visible", willOpen);
        activeNoteHotspotEl = willOpen ? el : null;
      });

      el.addEventListener("click", (e) => {
        e.stopPropagation();
      });

      ["mousedown", "pointerdown", "touchstart", "wheel"].forEach((eventName) => {
        content.addEventListener(eventName, (e) => e.stopPropagation(), { passive: false });
      });
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

  mailHotspots.forEach((mailPoint, index) => {
    const panoramaPoint = resolveMailPointToPanorama(mailPoint, scene);

    if (panoramaPoint) {
      createPanoramaMailHotspot(container, index, {
        ...mailPoint,
        yaw: panoramaPoint.yaw,
        pitch: panoramaPoint.pitch
      });
    }
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

/* ===== MAIL HOTSPOT FUNCTIONS ===== */
function initMailFeature() {
  if (!pano || !mailDragIcon) return;

  mailDragIcon.addEventListener("dragstart", (event) => {
    isMailDragActive = true;
    event.dataTransfer?.setData("text/plain", "mail-hotspot");
    event.dataTransfer.effectAllowed = "copy";
  });

  mailDragIcon.addEventListener("dragend", () => {
    isMailDragActive = false;
    pano.classList.remove("mail-drop-target");
  });

  mailDragIcon.addEventListener("click", () => {
    if (!currentRoomId) return;

    const scene = scenes[currentRoomId];
    const view = scene?.view?.();
    if (view && Number.isFinite(view.yaw()) && Number.isFinite(view.pitch())) {
      pendingMailPlacement = {
        yaw: radToDeg(view.yaw()),
        pitch: -radToDeg(view.pitch()),
        screenX: 0.5,
        screenY: 0.5
      };
    } else {
      pendingMailPlacement = { screenX: 0.5, screenY: 0.5 };
    }

    activeMailHotspotIndex = -1;
    openMailComposer(-1, null);
    setMailComposerStatus("Đã chọn vị trí tạo mail tại tâm góc nhìn hiện tại.");
  });

  pano.addEventListener("dragover", (event) => {
    if (!isMailDragActive) return;
    event.preventDefault();
    pano.classList.add("mail-drop-target");
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  });

  pano.addEventListener("dragleave", () => {
    pano.classList.remove("mail-drop-target");
  });

  pano.addEventListener("drop", (event) => {
    if (!isMailDragActive || !currentRoomId) return;

    event.preventDefault();
    pano.classList.remove("mail-drop-target");
    isMailDragActive = false;

    const placement = screenToMailCoordinates(event.clientX, event.clientY);
    if (!placement) return;

    pendingMailPlacement = placement;
    activeMailHotspotIndex = -1;
    openMailComposer(-1, null);
  });

  if (mailComposerClose) {
    mailComposerClose.addEventListener("click", closeMailComposer);
  }

  if (mailRecipientSelect) {
    mailRecipientSelect.addEventListener("change", () => {
      if (mailRecipientSelect.value) {
        mailRecipientInput.value = mailRecipientSelect.value;
      }
    });
  }

  if (mailSaveBtn) {
    mailSaveBtn.addEventListener("click", saveMailHotspot);
  }

  if (mailDeleteBtn) {
    mailDeleteBtn.addEventListener("click", deleteMailHotspot);
  }

  if (mailSendBtn) {
    mailSendBtn.addEventListener("click", sendMailFromComposer);
  }
}

function getCurrentMailHotspots() {
  return roomsData[currentRoomId]?.mailHotspots || [];
}

function setMailComposerStatus(message, isError = false) {
  if (!mailComposerStatus) return;
  mailComposerStatus.textContent = message || "";
  mailComposerStatus.style.color = isError ? "#ff8f8f" : "#9ac7ff";
}

function refreshRecipientOptions(selected = "") {
  if (!mailRecipientSelect) return;

  const hotspots = getCurrentMailHotspots();
  const uniqueRecipients = [...new Set(hotspots.map(h => (h.recipient || "").trim()).filter(Boolean))];
  mailRecipientSelect.innerHTML = '<option value="">-- Chọn hoặc nhập mới --</option>';

  uniqueRecipients.forEach((recipient) => {
    const option = document.createElement("option");
    option.value = recipient;
    option.textContent = recipient;
    if (selected && selected === recipient) option.selected = true;
    mailRecipientSelect.appendChild(option);
  });
}

function openMailComposer(index = -1, mailPoint = null) {
  if (!mailComposerPanel) return;

  activeMailHotspotIndex = index;
  const editing = index >= 0;

  if (mailComposerTitle) {
    mailComposerTitle.textContent = editing ? "✉️ Chỉnh sửa điểm mail" : "✉️ Tạo điểm mail mới";
  }

  const selectedPoint = mailPoint || (editing ? getCurrentMailHotspots()[index] : null) || {};

  if (mailPointTitle) mailPointTitle.value = selectedPoint.title || "";
  if (mailRecipientInput) mailRecipientInput.value = selectedPoint.recipient || "";
  if (mailSubjectInput) mailSubjectInput.value = selectedPoint.subject || "";
  if (mailBodyInput) mailBodyInput.value = selectedPoint.body || "";

  refreshRecipientOptions(selectedPoint.recipient || "");
  setMailComposerStatus(editing ? "Bạn có thể chỉnh sửa hoặc gửi mail ngay." : "Nhập thông tin rồi nhấn Lưu để tạo điểm mail.");

  if (mailDeleteBtn) {
    mailDeleteBtn.style.display = editing ? "inline-block" : "none";
  }

  mailComposerPanel.classList.remove("hidden");
}

function closeMailComposer() {
  if (!mailComposerPanel) return;
  mailComposerPanel.classList.add("hidden");
  setMailComposerStatus("");
  pendingMailPlacement = null;
  activeMailHotspotIndex = -1;
}

function clearFixedMailHotspots() {
  if (!pano) return;
  pano.querySelectorAll(".mail-fixed-hotspot").forEach((element) => element.remove());
}

function resolveFixedMailPoint(mailPoint, sceneOverride = null) {
  const normalized = { ...(mailPoint || {}) };

  const hasScreenCoords = Number.isFinite(Number(normalized.screenX)) && Number.isFinite(Number(normalized.screenY));
  if (hasScreenCoords) {
    normalized.screenX = Math.max(0, Math.min(1, Number(normalized.screenX)));
    normalized.screenY = Math.max(0, Math.min(1, Number(normalized.screenY)));
    return normalized;
  }

  if (!pano) {
    normalized.screenX = 0.5;
    normalized.screenY = 0.5;
    return normalized;
  }

  const scene = sceneOverride || scenes[currentRoomId];
  const view = scene?.view?.();
  const rect = pano.getBoundingClientRect();

  if (!view || !rect.width || !rect.height || typeof view.coordinatesToScreen !== "function") {
    normalized.screenX = 0.5;
    normalized.screenY = 0.5;
    return normalized;
  }

  if (!Number.isFinite(Number(normalized.yaw)) || !Number.isFinite(Number(normalized.pitch))) {
    normalized.screenX = 0.5;
    normalized.screenY = 0.5;
    return normalized;
  }

  const projected = view.coordinatesToScreen({
    yaw: degToRad(Number(normalized.yaw)),
    pitch: degToRad(-Number(normalized.pitch))
  });

  if (!projected || !Number.isFinite(projected.x) || !Number.isFinite(projected.y)) {
    normalized.screenX = 0.5;
    normalized.screenY = 0.5;
    return normalized;
  }

  const center = view.coordinatesToScreen({ yaw: view.yaw(), pitch: view.pitch() });
  const isCenterOrigin = center && Number.isFinite(center.x) && Number.isFinite(center.y)
    ? Math.abs(center.x) < 5 && Math.abs(center.y) < 5
    : false;

  const candidateScales = [1];
  const dpr = window.devicePixelRatio || 1;
  if (Math.abs(dpr - 1) > 0.01) {
    candidateScales.push(dpr);
  }

  let best = null;
  for (const scale of candidateScales) {
    const x = isCenterOrigin
      ? projected.x / scale + rect.width / 2
      : projected.x / scale;
    const y = isCenterOrigin
      ? projected.y / scale + rect.height / 2
      : projected.y / scale;

    const overflowX = Math.max(0, -x) + Math.max(0, x - rect.width);
    const overflowY = Math.max(0, -y) + Math.max(0, y - rect.height);
    const score = overflowX + overflowY;

    const candidate = { x, y, score };
    if (!best || candidate.score < best.score) {
      best = candidate;
    }
  }

  const finalX = best ? best.x : rect.width / 2;
  const finalY = best ? best.y : rect.height / 2;

  normalized.screenX = Math.max(0, Math.min(1, finalX / rect.width));
  normalized.screenY = Math.max(0, Math.min(1, finalY / rect.height));
  return normalized;
}

function projectMailScreenPointToPanorama(pixelX, pixelY, sceneOverride = null) {
  if (!pano) return null;

  const scene = sceneOverride || scenes[currentRoomId];
  const view = scene?.view?.();
  if (!view || typeof view.screenToCoordinates !== "function") {
    return null;
  }

  const rect = pano.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return null;
  }

  const targetX = Math.max(0, Math.min(rect.width, Number(pixelX)));
  const targetY = Math.max(0, Math.min(rect.height, Number(pixelY)));

  const scales = [1];
  const dpr = window.devicePixelRatio || 1;
  if (Math.abs(dpr - 1) > 0.01) {
    scales.push(dpr);
  }

  const centerProjected = typeof view.coordinatesToScreen === "function"
    ? view.coordinatesToScreen({ yaw: view.yaw(), pitch: view.pitch() })
    : null;

  const isCenterOrigin = centerProjected && Number.isFinite(centerProjected.x) && Number.isFinite(centerProjected.y)
    ? Math.abs(centerProjected.x) < 5 && Math.abs(centerProjected.y) < 5
    : true;

  let best = null;

  for (const scale of scales) {
    const inputCandidates = [
      { x: (targetX - rect.width / 2) * scale, y: (targetY - rect.height / 2) * scale },
      { x: targetX * scale, y: targetY * scale }
    ];

    for (const input of inputCandidates) {
      const coords = view.screenToCoordinates(input);
      if (!coords) continue;
      if (!Number.isFinite(coords.yaw) || !Number.isFinite(coords.pitch)) continue;

      let error = 0;
      if (typeof view.coordinatesToScreen === "function") {
        const projected = view.coordinatesToScreen({ yaw: coords.yaw, pitch: coords.pitch });
        if (projected && Number.isFinite(projected.x) && Number.isFinite(projected.y)) {
          const cssX = isCenterOrigin
            ? projected.x / scale + rect.width / 2
            : projected.x / scale;
          const cssY = isCenterOrigin
            ? projected.y / scale + rect.height / 2
            : projected.y / scale;
          error = Math.hypot(cssX - targetX, cssY - targetY);
        } else {
          error = Number.POSITIVE_INFINITY;
        }
      }

      const candidate = {
        yaw: radToDeg(coords.yaw),
        pitch: -radToDeg(coords.pitch),
        screenX: Math.max(0, Math.min(1, targetX / rect.width)),
        screenY: Math.max(0, Math.min(1, targetY / rect.height)),
        error
      };

      if (!best || candidate.error < best.error) {
        best = candidate;
      }
    }
  }

  if (!best) return null;

  return {
    yaw: best.yaw,
    pitch: best.pitch,
    screenX: best.screenX,
    screenY: best.screenY
  };
}

function resolveMailPointToPanorama(mailPoint, sceneOverride = null) {
  const source = mailPoint || {};
  if (Number.isFinite(Number(source.yaw)) && Number.isFinite(Number(source.pitch))) {
    return {
      yaw: Number(source.yaw),
      pitch: Number(source.pitch)
    };
  }

  const screenX = Number(source.screenX);
  const screenY = Number(source.screenY);
  if (!Number.isFinite(screenX) || !Number.isFinite(screenY)) {
    return null;
  }

  if (!pano) return null;
  const rect = pano.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return null;
  }

  const px = Math.max(0, Math.min(1, screenX)) * rect.width;
  const py = Math.max(0, Math.min(1, screenY)) * rect.height;
  const projected = projectMailScreenPointToPanorama(px, py, sceneOverride);
  if (projected) {
    return {
      yaw: projected.yaw,
      pitch: projected.pitch
    };
  }

  return null;
}

function createFixedMailHotspot(index, mailPoint) {
  if (!pano) return;

  const el = document.createElement("button");
  el.type = "button";
  el.className = "mail-hotspot mail-fixed-hotspot";
  el.title = mailPoint.title || "Điểm gửi mail";
  el.textContent = "✉️";
  el.style.left = `${Math.max(0, Math.min(1, Number(mailPoint.screenX))) * 100}%`;
  el.style.top = `${Math.max(0, Math.min(1, Number(mailPoint.screenY))) * 100}%`;

  el.onclick = (event) => {
    event.stopPropagation();
    openMailComposer(index, mailPoint);
  };

  pano.appendChild(el);
}

function createPanoramaMailHotspot(container, index, mailPoint) {
  if (!container) return;

  const el = document.createElement("button");
  el.type = "button";
  el.className = "mail-hotspot";
  el.title = mailPoint.title || "Điểm gửi mail";
  el.textContent = "✉️";

  el.onclick = (event) => {
    event.stopPropagation();
    openMailComposer(index, mailPoint);
  };

  container.createHotspot(el, {
    yaw: degToRad(Number(mailPoint.yaw)),
    pitch: degToRad(-Number(mailPoint.pitch))
  });
}

function screenToMailCoordinates(clientX, clientY) {
  if (!currentRoomId || !pano) return null;

  const rect = pano.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const relativeX = clientX - rect.left;
  const relativeY = clientY - rect.top;

  const projected = projectMailScreenPointToPanorama(relativeX, relativeY);
  if (projected) {
    return projected;
  }

  const scene = scenes[currentRoomId];
  const view = scene?.view?.();
  if (!view || !Number.isFinite(view.yaw()) || !Number.isFinite(view.pitch())) {
    return null;
  }

  return {
    yaw: radToDeg(view.yaw()),
    pitch: -radToDeg(view.pitch()),
    screenX: Math.max(0, Math.min(1, relativeX / rect.width)),
    screenY: Math.max(0, Math.min(1, relativeY / rect.height))
  };
}

async function saveMailHotspot() {
  if (!currentRoomId) return;

  const payload = {
    title: mailPointTitle?.value?.trim() || "Gửi mail",
    recipient: mailRecipientInput?.value?.trim() || "",
    subject: mailSubjectInput?.value?.trim() || "",
    body: mailBodyInput?.value?.trim() || ""
  };

  if (activeMailHotspotIndex >= 0) {
    const current = getCurrentMailHotspots()[activeMailHotspotIndex];
    if (!current) return;

    const resolvedPoint = resolveMailPointToPanorama(current);
    if (resolvedPoint) {
      payload.yaw = Number(resolvedPoint.yaw);
      payload.pitch = Number(resolvedPoint.pitch);
    } else {
      const fixedCurrent = resolveFixedMailPoint(current);
      payload.screenX = Number(fixedCurrent.screenX);
      payload.screenY = Number(fixedCurrent.screenY);
    }
  } else if (pendingMailPlacement) {
    if (Number.isFinite(Number(pendingMailPlacement.yaw)) && Number.isFinite(Number(pendingMailPlacement.pitch))) {
      payload.yaw = Number(pendingMailPlacement.yaw);
      payload.pitch = Number(pendingMailPlacement.pitch);
    }

    if (Number.isFinite(Number(pendingMailPlacement.screenX)) && Number.isFinite(Number(pendingMailPlacement.screenY))) {
      payload.screenX = Number(pendingMailPlacement.screenX);
      payload.screenY = Number(pendingMailPlacement.screenY);
    }
  } else {
    const scene = scenes[currentRoomId];
    const view = scene?.view?.();
    if (view && Number.isFinite(view.yaw()) && Number.isFinite(view.pitch())) {
      payload.yaw = radToDeg(view.yaw());
      payload.pitch = -radToDeg(view.pitch());
    } else {
      payload.screenX = 0.5;
      payload.screenY = 0.5;
    }
  }

  try {
    let res;
    if (activeMailHotspotIndex >= 0) {
      res = await fetch(`/api/rooms/${currentRoomId}/mail-hotspots/${activeMailHotspotIndex}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch(`/api/rooms/${currentRoomId}/mail-hotspots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    }

    const data = await parseJsonResponse(res);
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Lưu điểm mail thất bại");
    }

    if (data.room) {
      roomsData[currentRoomId] = data.room;
      addHotspots(currentRoomId);
    }

    pendingMailPlacement = null;
    setMailComposerStatus("Đã lưu điểm mail thành công.");
    refreshRecipientOptions(payload.recipient);
  } catch (err) {
    setMailComposerStatus(err.message || "Lưu điểm mail thất bại.", true);
  }
}

async function deleteMailHotspot() {
  if (!currentRoomId || activeMailHotspotIndex < 0) return;

  try {
    const res = await fetch(`/api/rooms/${currentRoomId}/mail-hotspots/${activeMailHotspotIndex}`, {
      method: "DELETE"
    });
    const data = await parseJsonResponse(res);

    if (!res.ok || !data.success) {
      throw new Error(data.error || "Xóa điểm mail thất bại");
    }

    if (data.room) {
      roomsData[currentRoomId] = data.room;
      addHotspots(currentRoomId);
    }

    closeMailComposer();
  } catch (err) {
    setMailComposerStatus(err.message || "Xóa điểm mail thất bại.", true);
  }
}

async function sendMailFromComposer() {
  const to = mailRecipientInput?.value?.trim();
  const subject = mailSubjectInput?.value?.trim();
  const body = mailBodyInput?.value?.trim();

  if (!to || !subject || !body) {
    setMailComposerStatus("Vui lòng nhập đủ người nhận, tiêu đề và nội dung.", true);
    return;
  }

  try {
    setMailComposerStatus("Đang gửi mail...");

    const selectedPoint =
      activeMailHotspotIndex >= 0
        ? getCurrentMailHotspots()[activeMailHotspotIndex]
        : null;
    const pointCoords = selectedPoint || pendingMailPlacement || {};

    const notes = [
      {
        roomName: roomsData[currentRoomId]?.name || "Không xác định",
        content: body,
        yaw: pointCoords.yaw,
        pitch: pointCoords.pitch,
        screenX: pointCoords.screenX,
        screenY: pointCoords.screenY,
        time: new Date().toISOString()
      }
    ];

    const res = await fetch("/api/mail/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to,
        subject: subject || "GHI CHÚ TỪ VIRTUAL TOUR",
        body,
        pageUrl: window.location.href,
        summary: body,
        notes,
        format: "virtual-tour-note"
      })
    });

    const data = await parseJsonResponse(res);
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Gửi mail thất bại");
    }

    setMailComposerStatus("Đã gửi mail thành công.");
  } catch (err) {
    setMailComposerStatus(err.message || "Gửi mail thất bại.", true);
  }
}

// Sensor functionality moved to src/features/sensors.js

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