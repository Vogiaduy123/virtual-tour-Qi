import { fetchMinimap } from '../core/api.js';

let env = {
  getRoomsData: () => ({}),
  getCurrentRoomId: () => null,
  switchRoom: (id) => {},
  getViewer: () => null
};

// Minimap elements
const minimapWrapper = document.getElementById('minimapWrapper');
const minimapToggle = document.getElementById('minimapToggle');
const minimapContent = document.getElementById('minimapContent');
const userMinimapContainer = document.getElementById('userMinimapContainer');
const userMinimapImage = document.getElementById('userMinimapImage');
const userMinimapCanvas = document.getElementById('userMinimapCanvas');

// Pan/zoom elements
const minimapViewport = document.getElementById('minimapViewport');
const minimapLayer = document.getElementById('minimapLayer');
const minimapZoomIn = document.getElementById('minimapZoomIn');
const minimapZoomOut = document.getElementById('minimapZoomOut');
const minimapZoomReset = document.getElementById('minimapZoomReset');
const minimapZoomLabel = document.getElementById('minimapZoomLabel');

// State
let minimapData = null;
let minimapCtx = null;
let isMinimapCollapsed = false;
let currentFloorId = 1;

// Pan/zoom state
const ZOOM_MIN = 1;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;
const VIEWPORT_W = 240;
const VIEWPORT_H = 180;

let zoom = 1;
let panX = 0;
let panY = 0;
let isDragging = false;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function applyTransform() {
  if (!minimapLayer) return;
  minimapLayer.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  if (minimapZoomLabel) {
    minimapZoomLabel.textContent = `${Math.round(zoom * 100)}%`;
  }
}

function clampPan() {
  const layerW = VIEWPORT_W * zoom;
  const layerH = VIEWPORT_H * zoom;
  panX = Math.min(0, Math.max(panX, VIEWPORT_W - layerW));
  panY = Math.min(0, Math.max(panY, VIEWPORT_H - layerH));
}

function setZoom(newZoom) {
  zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, newZoom));
  if (zoom === ZOOM_MIN) { panX = 0; panY = 0; }
  clampPan();
  applyTransform();
}

// ─── Pan/zoom init ────────────────────────────────────────────────────────────

function initMinimapPanZoom() {
  if (!minimapViewport) return;

  // Zoom buttons
  minimapZoomIn?.addEventListener('click', () => setZoom(zoom + ZOOM_STEP));
  minimapZoomOut?.addEventListener('click', () => setZoom(zoom - ZOOM_STEP));
  minimapZoomReset?.addEventListener('click', () => {
    zoom = ZOOM_MIN;
    panX = 0;
    panY = 0;
    applyTransform();
  });

  // Pan — mouse drag
  minimapViewport.addEventListener('mousedown', (e) => {
    // Only primary button
    if (e.button !== 0) return;
    e.preventDefault();

    isDragging = false;
    const startX = e.clientX;
    const startY = e.clientY;
    const panStartX = panX;
    const panStartY = panY;

    function onMove(me) {
      const dx = me.clientX - startX;
      const dy = me.clientY - startY;
      if (!isDragging && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
        isDragging = true;
      }
      if (!isDragging) return;
      panX = panStartX + dx;
      panY = panStartY + dy;
      clampPan();
      applyTransform();
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      // Reset isDragging after a tick so click handler can check it
      setTimeout(() => { isDragging = false; }, 0);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// ─── Core init ────────────────────────────────────────────────────────────────

export function initMinimap(dependencies) {
  env = { ...env, ...dependencies };

  if (minimapToggle) {
    minimapToggle.addEventListener('click', () => {
      isMinimapCollapsed = !isMinimapCollapsed;
      if (isMinimapCollapsed) {
        minimapContent.style.display = 'none';
        minimapToggle.textContent = '+';
      } else {
        minimapContent.style.display = 'block';
        minimapToggle.textContent = '−';
      }
    });
  }

  initMinimapPanZoom();
}

// ─── Floor helpers ────────────────────────────────────────────────────────────

function getCurrentFloor() {
  if (!minimapData || !minimapData.floors) return null;
  return minimapData.floors.find(f => f.id === currentFloorId) || minimapData.floors[0];
}

function getCurrentRoomFloor() {
  const room = env.getRoomsData()[env.getCurrentRoomId()];
  return room ? (room.floor || 1) : 1;
}

// ─── Floor tabs ───────────────────────────────────────────────────────────────

function renderFloorTabs() {
  const floorTabsContainer = document.getElementById('floorTabs');
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

// ─── Load ─────────────────────────────────────────────────────────────────────

export async function loadMinimap() {
  try {
    const data = await fetchMinimap();

    if (data.success && data.minimap && data.minimap.floors && data.minimap.floors.length > 0) {
      minimapData = data.minimap;

      const roomFloor = getCurrentRoomFloor();
      currentFloorId = minimapData.floors.find(f => f.id === roomFloor)?.id || minimapData.floors[0].id;

      const floor = getCurrentFloor();
      if (floor && floor.image) {
        userMinimapImage.src = floor.image;

        userMinimapImage.onload = () => {
          minimapWrapper.style.display = 'block';

          setTimeout(() => {
            renderFloorTabs();
            initUserMinimapCanvas();
            drawUserMinimap();
          }, 100);
        };
      }
    }
  } catch (err) {
    console.error('Lỗi load minimap:', err);
  }
}

// ─── Canvas init ──────────────────────────────────────────────────────────────

function initUserMinimapCanvas() {
  const width = userMinimapImage.offsetWidth;
  const height = userMinimapImage.offsetHeight;

  userMinimapCanvas.width = width;
  userMinimapCanvas.height = height;
  minimapCtx = userMinimapCanvas.getContext('2d');

  // Register click/hover on viewport (not canvas, since canvas has pointer-events:none)
  // Remove old listeners first to avoid duplicates on floor switch
  minimapViewport?.removeEventListener('click', handleMinimapClick);
  minimapViewport?.removeEventListener('mousemove', handleMinimapHover);
  minimapViewport?.addEventListener('click', handleMinimapClick);
  minimapViewport?.addEventListener('mousemove', handleMinimapHover);
}

// ─── Event handlers ───────────────────────────────────────────────────────────

function handleMinimapClick(e) {
  // Ignore if the user was dragging (not a real click)
  if (isDragging) return;

  const floor = getCurrentFloor();
  if (!floor || !floor.markers) return;

  const rect = minimapViewport.getBoundingClientRect();
  const rawX = e.clientX - rect.left;
  const rawY = e.clientY - rect.top;
  // Map raw viewport coords back through the current pan/zoom transform
  const x = (rawX - panX) / (rect.width * zoom);
  const y = (rawY - panY) / (rect.height * zoom);

  const clickedMarkerIndex = getMarkerAtPosition(x, y);
  if (clickedMarkerIndex !== -1) {
    const marker = floor.markers[clickedMarkerIndex];
    if (marker.roomId && env.getRoomsData()[marker.roomId]) {
      env.switchRoom(marker.roomId);

      const roomFloor = env.getRoomsData()[marker.roomId].floor || 1;
      if (roomFloor !== currentFloorId) {
        switchFloor(roomFloor);
      }
    }
  }
}

function handleMinimapHover(e) {
  if (isDragging) return;

  const floor = getCurrentFloor();
  if (!floor || !floor.markers) return;

  const rect = minimapViewport.getBoundingClientRect();
  const rawX = e.clientX - rect.left;
  const rawY = e.clientY - rect.top;
  const x = (rawX - panX) / (rect.width * zoom);
  const y = (rawY - panY) / (rect.height * zoom);

  const hoverIndex = getMarkerAtPosition(x, y);
  minimapViewport.style.cursor = hoverIndex !== -1 ? 'pointer' : 'grab';
}

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

// ─── Draw ─────────────────────────────────────────────────────────────────────

export function drawUserMinimap() {
  if (!minimapCtx) return;
  const floor = getCurrentFloor();
  if (!floor) return;

  minimapCtx.clearRect(0, 0, userMinimapCanvas.width, userMinimapCanvas.height);

  if (!floor.markers || floor.markers.length === 0) return;

  floor.markers.forEach((marker, index) => {
    const x = marker.x * userMinimapCanvas.width;
    const y = marker.y * userMinimapCanvas.height;

    const isCurrentRoom = marker.roomId === env.getCurrentRoomId();
    const room = env.getRoomsData()[marker.roomId];

    if (isCurrentRoom) {
      // Get yaw and fov from the panorama viewer
      const viewer = env.getViewer && env.getViewer();
      if (viewer && viewer.view()) {
        const view = viewer.view();
        let currentYaw = view.yaw(); // Radians (0 is front)
        let currentFov = view.fov(); // Radians
        
        // Define radar offset (typically north is top => -90 degrees / -PI/2)
        // If rooms have specific rotations, an offset could be added here in the future
        const radarOffset = -Math.PI / 2;
        
        // Ensure angle boundaries
        const startRad = currentYaw - (currentFov / 2) + radarOffset;
        const endRad = currentYaw + (currentFov / 2) + radarOffset;
        const radius = 60; // Size of the cone
        
        // Draw the radar cone
        minimapCtx.beginPath();
        minimapCtx.moveTo(x, y);
        minimapCtx.arc(x, y, radius, startRad, endRad);
        minimapCtx.lineTo(x, y);
        
        const gradient = minimapCtx.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, 'rgba(43, 50, 120, 0.5)'); // Slightly more opaque near the center
        gradient.addColorStop(1, 'rgba(43, 50, 120, 0.0)'); // Fades out completely
        
        minimapCtx.fillStyle = gradient;
        minimapCtx.fill();
        minimapCtx.closePath();
      }

      // Draw the pulsing active dot underneath the radar
      minimapCtx.beginPath();
      minimapCtx.arc(x, y, 18, 0, 2 * Math.PI);
      minimapCtx.fillStyle = 'rgba(43, 50, 120, 0.3)';
      minimapCtx.fill();
    }

    minimapCtx.beginPath();
    minimapCtx.arc(x, y, 12, 0, 2 * Math.PI);

    if (isCurrentRoom) {
      minimapCtx.fillStyle = '#2B3278';
    } else {
      minimapCtx.fillStyle = marker.roomId ? '#4CAF50' : '#999';
    }

    minimapCtx.fill();
    minimapCtx.strokeStyle = '#fff';
    minimapCtx.lineWidth = 3;
    minimapCtx.stroke();

    minimapCtx.fillStyle = '#fff';
    minimapCtx.font = 'bold 12px Arial';
    minimapCtx.textAlign = 'center';
    minimapCtx.textBaseline = 'middle';
    minimapCtx.fillText(index + 1, x, y);

    if (room) {
      minimapCtx.fillStyle = isCurrentRoom ? '#2B3278' : '#000';
      minimapCtx.font = isCurrentRoom ? 'bold 11px Arial' : '11px Arial';
      minimapCtx.fillText(room.name, x, y + 22);
    }
  });
}

// ─── Update highlight ─────────────────────────────────────────────────────────

export function updateMinimapHighlight() {
  const roomFloor = getCurrentRoomFloor();
  if (roomFloor !== currentFloorId) {
    switchFloor(roomFloor);
  } else {
    drawUserMinimap();
  }
}
