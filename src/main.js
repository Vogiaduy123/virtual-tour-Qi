const pano = document.getElementById("pano");
const roomSelect = document.getElementById("roomSelect");
const buildingSelect = document.getElementById("buildingSelect");
const buildingSelectWrapper = document.getElementById("buildingSelectWrapper");

let currentRoomId = null;
let allRooms = [];
let allBuildings = [];

import { degToRad, radToDeg, parseJsonResponse } from './core/utils.js';
import { fetchRooms } from './core/api.js';
import { initViewer, initZoomControl, getViewer } from './core/viewer.js';
import { initScenesFeature, initRooms, getScenes, getRoomsData } from './core/scenes.js';
import { initMinimap, loadMinimap, updateMinimapHighlight, drawUserMinimap } from './features/minimap.js';
import { initSensors, loadSensors, updateSensorWidget, renderCameraPanel, addSensorHotspots, startSensorRealTimeUpdates, closeCameraModal } from './features/sensors.js';
import { initMailFeature, resolveMailPointToPanorama, createPanoramaMailHotspot, clearFixedMailHotspots, closeMailComposer } from './features/mail.js';
import { initAutoTour } from './features/autotour.js';
import { initCompass } from './features/compass.js';
import { initMediaOverlay, createMediaHotspotOverlay, hideMediaOverlay, showMediaOverlay, MEDIA_ICONS, createMediaHotspotElement, resetActiveNoteHotspot, create3DHighlightElement } from './features/media-overlay.js';

/* ===== HELPERS ===== */
/**
 * Creates a navigation arrow element for hotspots.
 * If the hotspot has a custom iconUrl, uses that image.
 * Otherwise falls back to the built-in SVG double-chevron.
 */
function createNavArrow(hs) {
  const wrap = document.createElement("div");
  wrap.className = "hotspot-arrow";

  if (hs && hs.iconUrl) {
    // Custom uploaded arrow image
    const img = document.createElement("img");
    img.src = hs.iconUrl;
    img.className = "hotspot-arrow-img";
    img.alt = "";
    img.draggable = false;
    img.onerror = () => {
      // Fallback to default SVG if image fails to load
      wrap.innerHTML = defaultChevronSVG();
    };
    wrap.appendChild(img);
  } else {
    wrap.innerHTML = defaultChevronSVG();
  }
  return wrap;
}

function defaultChevronSVG() {
  return `<svg viewBox="0 0 44 36" width="44" height="36" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <polyline points="8,20 22,6 36,20" fill="none" stroke="rgba(255,255,255,0.95)" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
      <polyline points="8,32 22,18 36,32" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}



/* ===== BUILDING SELECTOR ===== */
function initBuildingSelector(rooms, buildings) {
  if (!buildingSelect || !buildingSelectWrapper) return;

  // Only show if there are buildings with rooms assigned
  const buildingsWithRooms = buildings.filter(b => rooms.some(r => r.buildingId === b.id));
  const hasUnassigned = rooms.some(r => !r.buildingId);

  if (buildingsWithRooms.length === 0) {
    // No buildings configured — hide selector, show all rooms normally
    buildingSelectWrapper.style.display = 'none';
    return;
  }

  buildingSelectWrapper.style.display = 'block';
  buildingSelect.innerHTML = '';

  // Option: All rooms
  if (hasUnassigned || buildingsWithRooms.length > 1) {
    const allOpt = document.createElement('option');
    allOpt.value = '';
    allOpt.textContent = '🌐 Tất cả phân khu';
    buildingSelect.appendChild(allOpt);
  }

  buildingsWithRooms.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.id;
    opt.textContent = '🏢 ' + b.name;
    buildingSelect.appendChild(opt);
  });

  // Auto-select first building (with rooms)
  const firstBuilding = buildingsWithRooms[0];
  buildingSelect.value = firstBuilding.id;
  filterRoomsByBuilding(firstBuilding.id);

  buildingSelect.onchange = () => {
    filterRoomsByBuilding(buildingSelect.value);
  };
}

function filterRoomsByBuilding(buildingId) {
  if (!roomSelect) return;

  const filtered = buildingId
    ? allRooms.filter(r => r.buildingId === buildingId)
    : allRooms;

  // Rebuild room dropdown
  roomSelect.innerHTML = '';
  filtered.forEach(room => {
    const opt = document.createElement('option');
    opt.value = room.id;
    opt.textContent = room.name;
    roomSelect.appendChild(opt);
  });

  roomSelect.onchange = (e) => {
    switchRoom(parseInt(e.target.value));
  };

  // Switch to first room of this building
  if (filtered.length > 0) {
    switchRoom(filtered[0].id);
  }
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
      switchRoom: switchRoom,
      getViewer: getViewer
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
    allRooms = rooms;

    // Load buildings
    try {
      const bRes = await fetch('/api/admin/buildings').then(r => r.json());
      allBuildings = (bRes && bRes.success) ? bRes.buildings : [];
    } catch { allBuildings = []; }

    initBuildingSelector(allRooms, allBuildings);
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

  // Handle clicks on polygon overlay
  const polygonOverlay = document.getElementById('polygonOverlay');
  if (polygonOverlay) {
    polygonOverlay.addEventListener('click', (e) => {
      const target = e.target;
      const mediaIndex = target.getAttribute('data-media-index');
      if (mediaIndex !== null && window.currentRoomMediaHotspots && window.currentHotspotContainer) {
        const media = window.currentRoomMediaHotspots[mediaIndex];
        if (media) {
          createMediaHotspotOverlay(media, window.currentHotspotContainer, degToRad(media.yaw), degToRad(-media.pitch));
        }
      }
    });
  }
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

  // Bind polygon update when view changes for this scene
  const view = scene.view();
  if (view) {
    view.removeEventListener('change', update3DPolygons);
    view.addEventListener('change', update3DPolygons);
    // Bind minimap radar cone updates
    view.removeEventListener('change', drawUserMinimap);
    view.addEventListener('change', drawUserMinimap);
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
  } catch { }

  const hotspots = room.hotspots || [];
  const mediaHotspots = room.mediaHotspots || [];
  const mailHotspots = room.mailHotspots || [];

  hotspots.forEach(hs => {
    const el = document.createElement("div");
    el.className = "hotspot";

    const yawRad = degToRad(hs.yaw);
    const pitchRad = degToRad(-hs.pitch);

    // Use custom arrow if iconUrl is set, otherwise use built-in SVG chevron
    el.appendChild(createNavArrow(hs));

    el.onclick = (e) => {
      e.stopPropagation();
      switchRoom(hs.target);
    };

    container.createHotspot(el, {
      yaw: yawRad,
      pitch: pitchRad
    }, {
      perspective: {
        radius: 1000,
        extraTransforms: `rotateX(60deg) rotateZ(${hs.rotation || 0}deg) scale(2.5)`
      }
    });
  });

  mediaHotspots.forEach((media, index) => {
    // If it has a highlight polygon, we ONLY render the SVG polygon later, no icon.
    // However, we inject the index so the SVG click handler can find the media object.
    const hasPolygon = media.mediaType === '3d' && media.highlightPolygon && media.highlightPolygon.length >= 3;
    if (hasPolygon) {
      media._originalIndex = index; // Save index for update3DPolygons
      return; 
    }

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

  // Render 3D highlight polygons dynamically
  window.currentRoomMediaHotspots = mediaHotspots;
  window.currentHotspotContainer = container;
  update3DPolygons();

  addSensorHotspots(roomId);
}

/* ===== 3D HIGHLIGHT POLYGONS ===== */
function update3DPolygons() {
  const viewer = getViewer();
  if (!viewer) return;
  const scene = viewer.scene();
  if (!scene) return;
  const view = scene.view();
  const svg = document.getElementById('polygonOverlay');
  if (!svg) return;
  
  if (!window.currentRoomMediaHotspots) {
    svg.innerHTML = '';
    return;
  }

  let pathsHTML = `
    <defs>
      <filter id="glow-3d-filter-real" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="5" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
  `;

  let hasPolygon = false;
  window.currentRoomMediaHotspots.forEach(media => {
    if (media.mediaType !== '3d' || !media.highlightPolygon || media.highlightPolygon.length < 3) return;
    
    // Project points
    const points = media.highlightPolygon.map(([y, p]) => {
      const coords = view.coordinatesToScreen({yaw: degToRad(y), pitch: degToRad(-p)});
      if (!coords || typeof coords.x !== 'number') return null;
      return `${coords.x},${coords.y}`;
    });
    
    if (points.includes(null)) return;
    
    const d = points.join(' ');
    
    pathsHTML += `
      <!-- Outer glow/click target -->
      <polygon points="${d}" fill="rgba(80, 80, 200, 0.4)" stroke="rgba(255, 255, 255, 0.9)" stroke-width="2" stroke-linejoin="round"
        style="pointer-events: visiblePainted; cursor: pointer;"
        data-media-index="${media._originalIndex}" />
      <polygon points="${d}" fill="none" class="highlight-3d-polygon" stroke="rgba(100, 150, 255, 0.6)" stroke-width="8" stroke-linejoin="round" filter="url(#glow-3d-filter-real)" style="mix-blend-mode: screen; pointer-events: none;" />
    `;
    hasPolygon = true;
  });
  
  svg.innerHTML = hasPolygon ? pathsHTML : '';
}
