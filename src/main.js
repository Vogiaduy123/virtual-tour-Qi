const pano = document.getElementById("pano");
const roomSelect = document.getElementById("roomSelect");

let currentRoomId = null;

import { degToRad, radToDeg, parseJsonResponse } from './core/utils.js';
import { fetchRooms } from './core/api.js';
import { initViewer, initZoomControl, getViewer } from './core/viewer.js';
import { initScenesFeature, initRooms, getScenes, getRoomsData } from './core/scenes.js';
import { initMinimap, loadMinimap, updateMinimapHighlight, drawUserMinimap } from './features/minimap.js';
import { initSensors, loadSensors, updateSensorWidget, renderCameraPanel, addSensorHotspots, startSensorRealTimeUpdates, closeCameraModal } from './features/sensors.js';
import { initMailFeature, resolveMailPointToPanorama, createPanoramaMailHotspot, clearFixedMailHotspots, closeMailComposer } from './features/mail.js';
import { initAutoTour } from './features/autotour.js';
import { initCompass } from './features/compass.js';
import { initMediaOverlay, createMediaHotspotOverlay, hideMediaOverlay, showMediaOverlay, MEDIA_ICONS, createMediaHotspotElement, resetActiveNoteHotspot } from './features/media-overlay.js';

/* ===== HELPERS ===== */
/**
 * Creates a clean SVG double-chevron arrow element for navigation hotspots.
 * Two stacked "^" shapes, top one brighter, bottom one faded — EVN style.
 */
function createChevronArrow() {
  const wrap = document.createElement("div");
  wrap.className = "hotspot-arrow";
  wrap.innerHTML = `
    <svg viewBox="0 0 44 36" width="44" height="36" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <!-- top chevron (brighter) -->
      <polyline
        points="8,22 22,8 36,22"
        fill="none"
        stroke="rgba(255,255,255,0.95)"
        stroke-width="4"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <!-- bottom chevron (faded) -->
      <polyline
        points="8,34 22,20 36,34"
        fill="none"
        stroke="rgba(255,255,255,0.45)"
        stroke-width="4"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  `.trim();
  return wrap;
}


/* ===== INITIAL LOAD ===== */
async function initApp() {
  try {
    initViewer(pano, {
      getCurrentRoomId: () => currentRoomId,
      getScene: (id) => getScenes()[id]
    });

    initScenesFeature({
      getViewer: getViewer,
      switchRoom: switchRoom
    });

    initMinimap({
      getRoomsData: () => getRoomsData(),
      getCurrentRoomId: () => currentRoomId,
      switchRoom: switchRoom
    });
    
    initSensors({
      getCurrentRoomId: () => currentRoomId,
      getRoomsData: () => getRoomsData(),
      getScene: (id) => getScenes()[id],
      switchRoom: switchRoom
    });

    const rooms = await fetchRooms();
    if (!rooms || rooms.length === 0) {
      alert("Chưa có phòng nào");
      return;
    }
    
    initRooms(rooms, roomSelect);
    switchRoom(rooms[0].id);
    
    await loadMinimap();
    await loadSensors();
    
    initZoomControl();
    initCompass({
      getCurrentRoomId: () => currentRoomId,
      getScenes: getScenes,
      getPano: () => pano
    });
    initAutoTour({
      getCurrentRoomId: () => currentRoomId,
      getRoomsData: getRoomsData,
      getScenes: getScenes,
      switchRoom: switchRoom
    });
    initMediaOverlay();
    initMailFeature({
      getCurrentRoomId: () => currentRoomId,
      getRoomsData: () => getRoomsData(),
      getScene: (id) => getScenes()[id],
      getPano: () => pano,
      addHotspots: addHotspots
    });
  } catch (err) {
    console.error("LOAD ERROR:", err);
  }
}

initApp();

/* ===== SUBSCRIBE TO SSE ===== */
try {
  const es = new EventSource("/events");
  es.addEventListener("rooms", (e) => {
    const rooms = JSON.parse(e.data || "[]");
    if (!rooms || rooms.length === 0) return;

    initRooms(rooms, roomSelect);
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
  const scene = getScenes()[roomId];

  if (!scene) return;

  if (roomSelect) {
    roomSelect.value = roomId;
  }

  scene.switchTo();
  addHotspots(roomId);
  updateMinimapHighlight();
  hideMediaOverlay();
  closeCameraModal();
  closeMailComposer();
  
  updateSensorWidget();
  renderCameraPanel();
}

/* ===== HOTSPOTS ===== */
function addHotspots(roomId) {
  const room = getRoomsData()[roomId];
  const scene = getScenes()[roomId];

  if (!room || !scene) return;

  const container = scene.hotspotContainer();
  resetActiveNoteHotspot();
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

    const yawRad = degToRad(hs.yaw);
    const pitchRad = degToRad(-hs.pitch);

    if (hs.iconUrl && typeof hs.iconUrl === "string") {
      const normalizedIconUrl = hs.iconUrl.trim();
      if (normalizedIconUrl) {
        const safeIconUrl = normalizedIconUrl.replace(/"/g, "\\\"");
        el.style.setProperty('--hotspot-icon', `url("${safeIconUrl}")`);
      } else {
        el.appendChild(createChevronArrow());
      }
    } else {
      // No iconUrl → default EVN-style double chevron SVG
      el.appendChild(createChevronArrow());
    }

    el.onclick = (e) => {
      e.stopPropagation();
      switchRoom(hs.target);
    };

    container.createHotspot(el, {
      yaw: yawRad,
      pitch: pitchRad
    });
  });

  mediaHotspots.forEach(media => {
    const el = createMediaHotspotElement(media, () => {
      createMediaHotspotOverlay(media, container, degToRad(media.yaw), degToRad(-media.pitch));
    });

    container.createHotspot(el, {
      yaw: degToRad(media.yaw),
      pitch: degToRad(-media.pitch) 
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
  
  addSensorHotspots(roomId);
}
