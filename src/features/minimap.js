import { fetchMinimap } from '../core/api.js';

let env = {
  getRoomsData: () => ({}),
  getCurrentRoomId: () => null,
  switchRoom: (id) => {}
};

// Minimap elements
const minimapWrapper = document.getElementById("minimapWrapper");
const minimapToggle = document.getElementById("minimapToggle");
const minimapContent = document.getElementById("minimapContent");
const userMinimapContainer = document.getElementById("userMinimapContainer");
const userMinimapImage = document.getElementById("userMinimapImage");
const userMinimapCanvas = document.getElementById("userMinimapCanvas");

// State
let minimapData = null;
let minimapCtx = null;
let isMinimapCollapsed = false;
let currentFloorId = 1;

export function initMinimap(dependencies) {
  env = { ...env, ...dependencies };

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
}

function getCurrentFloor() {
  if (!minimapData || !minimapData.floors) return null;
  return minimapData.floors.find(f => f.id === currentFloorId) || minimapData.floors[0];
}

function getCurrentRoomFloor() {
  const room = env.getRoomsData()[env.getCurrentRoomId()];
  return room ? (room.floor || 1) : 1;
}

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

function initUserMinimapCanvas() {
  const width = userMinimapImage.offsetWidth;
  const height = userMinimapImage.offsetHeight;
  
  userMinimapCanvas.width = width;
  userMinimapCanvas.height = height;
  minimapCtx = userMinimapCanvas.getContext("2d");

  userMinimapCanvas.addEventListener("click", handleMinimapClick);
  userMinimapCanvas.addEventListener("mousemove", handleMinimapHover);
}

function handleMinimapClick(e) {
  const floor = getCurrentFloor();
  if (!floor || !floor.markers) return;

  const rect = userMinimapCanvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;

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
  const floor = getCurrentFloor();
  if (!floor || !floor.markers) return;

  const rect = userMinimapCanvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;

  const hoverIndex = getMarkerAtPosition(x, y);
  userMinimapCanvas.style.cursor = hoverIndex !== -1 ? "pointer" : "default";
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
      minimapCtx.beginPath();
      minimapCtx.arc(x, y, 18, 0, 2 * Math.PI);
      minimapCtx.fillStyle = "rgba(33, 150, 243, 0.3)";
      minimapCtx.fill();
    }

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

    minimapCtx.fillStyle = "#fff";
    minimapCtx.font = "bold 12px Arial";
    minimapCtx.textAlign = "center";
    minimapCtx.textBaseline = "middle";
    minimapCtx.fillText(index + 1, x, y);

    if (room) {
      minimapCtx.fillStyle = isCurrentRoom ? "#2196F3" : "#000";
      minimapCtx.font = isCurrentRoom ? "bold 11px Arial" : "11px Arial";
      minimapCtx.fillText(room.name, x, y + 22);
    }
  });
}

export function updateMinimapHighlight() {
  const roomFloor = getCurrentRoomFloor();
  if (roomFloor !== currentFloorId) {
    switchFloor(roomFloor);
  } else {
    drawUserMinimap();
  }
}
