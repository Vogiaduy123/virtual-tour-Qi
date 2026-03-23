import { degToRad } from '../core/utils.js';

let env = {
  getCurrentRoomId: () => null,
  getRoomsData: () => ({}),
  getScenes: () => ({}), // Needs scenes object mapping id -> scene
  switchRoom: (id) => {}
};

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

export function initAutoTour(dependencies) {
  env = { ...env, ...dependencies };

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
  const roomsData = env.getRoomsData();
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
  const currentRoomId = env.getCurrentRoomId();
  const roomsData = env.getRoomsData();

  // Switch to room if not already there
  if (currentRoomId !== stop.roomId) {
    env.switchRoom(stop.roomId);
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
  const currentRoomId = env.getCurrentRoomId();
  const roomsData = env.getRoomsData();

  // Make sure we're in the correct room
  if (currentRoomId !== stop.roomId) {
    env.switchRoom(stop.roomId);
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
  const currentRoomId = env.getCurrentRoomId();
  const scenes = env.getScenes();
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
  const currentRoomId = env.getCurrentRoomId();
  const scenes = env.getScenes();
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
  const currentRoomId = env.getCurrentRoomId();
  const scenes = env.getScenes();
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
  const currentRoomId = env.getCurrentRoomId();
  const scenes = env.getScenes();
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
  const scenes = env.getScenes();
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
