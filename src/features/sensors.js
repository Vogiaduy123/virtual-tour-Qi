import { fetchSensors } from '../core/api.js';
import { degToRad } from '../core/utils.js';

let env = {
  getCurrentRoomId: () => null,
  getRoomsData: () => ({}),
  getScene: (roomId) => null,
  switchRoom: (id) => {}
};

// Sensor widget elements (removed completely layout)

// Sensors data
let sensorsData = [];
let sensorUpdateInterval = null;

// Camera Preview State
let activeCameraStream = null;
let activeCameraRefreshInterval = null;
let activeCameraPeerConnection = null;

export function initSensors(dependencies) {
  env = { ...env, ...dependencies };

  // Sensor widget removed from initialization

  // Add event listeners for camera modal
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
}

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

function stopActiveCameraPlayback() {
  if (activeCameraStream) {
    activeCameraStream.getTracks().forEach(track => track.stop());
    activeCameraStream = null;
  }

  if (activeCameraRefreshInterval) {
    clearInterval(activeCameraRefreshInterval);
    activeCameraRefreshInterval = null;
  }

  if (activeCameraPeerConnection) {
    try {
      activeCameraPeerConnection.close();
    } catch {}
    activeCameraPeerConnection = null;
  }
}

function normalizeWebRtcUrl(streamUrl) {
  const raw = String(streamUrl || '').trim();
  if (!raw || raw.startsWith('webcam://')) return null;

  const preferredHttpScheme = window.location.protocol === 'https:' ? 'https://' : 'http://';

  if (raw.startsWith('webrtc://')) {
    const withoutScheme = raw.slice('webrtc://'.length).replace(/^\/+/, '');
    return `${preferredHttpScheme}${withoutScheme.replace(/\/+$/, '')}/whep`;
  }

  if (raw.startsWith('whep://')) {
    const withoutScheme = raw.slice('whep://'.length).replace(/^\/+/, '');
    return `${preferredHttpScheme}${withoutScheme}`;
  }

  if (/^https?:\/\//i.test(raw) && /\/whep(\?|$)/i.test(raw)) {
    return raw;
  }

  return null;
}

function waitForIceGatheringComplete(peerConnection, timeoutMs = 5000) {
  return new Promise((resolve) => {
    if (peerConnection.iceGatheringState === 'complete') {
      resolve(true);
      return;
    }

    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      peerConnection.removeEventListener('icegatheringstatechange', onStateChange);
      clearTimeout(timer);
      resolve(true);
    };

    const onStateChange = () => {
      if (peerConnection.iceGatheringState === 'complete') {
        done();
      }
    };

    const timer = setTimeout(done, timeoutMs);
    peerConnection.addEventListener('icegatheringstatechange', onStateChange);
  });
}

async function playWebRtcWhep(whepUrl, videoElement) {
  const peerConnection = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });
  activeCameraPeerConnection = peerConnection;

  peerConnection.addTransceiver('video', { direction: 'recvonly' });
  peerConnection.addTransceiver('audio', { direction: 'recvonly' });

  peerConnection.ontrack = (event) => {
    const [firstStream] = event.streams || [];
    if (firstStream) {
      videoElement.srcObject = firstStream;
      return;
    }
    const mediaStream = new MediaStream([event.track]);
    videoElement.srcObject = mediaStream;
  };

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  await waitForIceGatheringComplete(peerConnection);

  const response = await fetch(whepUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/sdp' },
    body: peerConnection.localDescription?.sdp || offer.sdp
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(errorText || `WHEP server lỗi HTTP ${response.status}`);
  }

  const answerSdp = await response.text();
  await peerConnection.setRemoteDescription({ type: 'answer', sdp: answerSdp });

  return peerConnection;
}

function createCameraInfoBar(camera, rightText) {
  const infoBar = document.createElement('div');
  infoBar.className = 'camera-info-bar';
  infoBar.innerHTML = `
    <div class="camera-info-item">
      <strong>Độ phân giải</strong>
      <span>${camera.camera?.resolution || 'N/A'}</span>
    </div>
    <div class="camera-info-item">
      <strong>Trạng thái</strong>
      <span id="cameraStatusText">${rightText}</span>
    </div>
  `;
  return infoBar;
}

function showSnapshotFallback(camera, container, statusText) {
  const snapshotUrl = (camera.camera?.snapshotUrl || '').trim();
  if (!snapshotUrl) return false;

  container.innerHTML = '';

  const imgContainer = document.createElement('div');
  imgContainer.style.cssText = 'position: relative; display: inline-block; width: 100%;';

  const img = document.createElement('img');
  img.style.cssText = 'width: 100%; border-radius: 12px; background: #000; border: 1px solid rgba(255,255,255,0.1);';
  img.alt = camera.name;

  const statusDiv = document.createElement('div');
  statusDiv.className = 'camera-status-badge';
  statusDiv.innerHTML = '📸 Snapshot';

  imgContainer.appendChild(img);
  imgContainer.appendChild(statusDiv);
  container.appendChild(imgContainer);
  container.appendChild(createCameraInfoBar(camera, statusText || '📸 Snapshot'));

  const updateSnapshot = () => {
    const separator = snapshotUrl.includes('?') ? '&' : '?';
    img.src = `${snapshotUrl}${separator}t=${Date.now()}`;
  };

  updateSnapshot();
  activeCameraRefreshInterval = setInterval(updateSnapshot, 2000);
  return true;
}

function showCameraPreview(camera) {
  const cameraModal = document.getElementById('cameraModal');
  const cameraModalTitle = document.getElementById('cameraModalTitle');
  const cameraPreviewContainer = document.getElementById('cameraPreviewContainer');
  
  if (!cameraModal) return;
  
  // Update title
  cameraModalTitle.textContent = `📹 ${camera.name}`;
  
  // Stop any active camera stream
  stopActiveCameraPlayback();
  
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
  
  const streamUrl = (camera.camera?.streamUrl || '').trim();

  if (streamUrl === 'webcam://0') {
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
    cameraPreviewContainer.appendChild(createCameraInfoBar(camera, '🔴 Đang kết nối'));
    
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
  } else if (streamUrl) {
    const videoContainer = document.createElement('div');
    videoContainer.style.cssText = 'position: relative; display: inline-block; width: 100%;';

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsinline = true;
    video.muted = true;
    video.controls = true;
    video.style.cssText = 'width: 100%; border-radius: 12px; background: #000; border: 1px solid rgba(255,255,255,0.1);';

    const statusDiv = document.createElement('div');
    statusDiv.className = 'camera-status-badge';
    statusDiv.innerHTML = '⏳ Đang kết nối...';

    videoContainer.appendChild(video);
    videoContainer.appendChild(statusDiv);
    cameraPreviewContainer.appendChild(videoContainer);
    cameraPreviewContainer.appendChild(createCameraInfoBar(camera, '⏳ Đang kết nối'));

    const statusTextEl = () => document.getElementById('cameraStatusText');
    const setStatus = (badgeText, text, badgeColor) => {
      statusDiv.innerHTML = badgeText;
      if (badgeColor) statusDiv.style.background = badgeColor;
      const statusElement = statusTextEl();
      if (statusElement) statusElement.textContent = text;
    };

    video.onplaying = () => {
      setStatus('🟢 LIVE', '🟢 Hoạt động', 'rgba(76, 175, 80, 0.85)');
    };

    video.onerror = () => {
      if (showSnapshotFallback(camera, cameraPreviewContainer, '📸 Fallback snapshot')) {
        return;
      }
      setStatus('🔴 Lỗi stream', '🔴 Không phát được stream', 'rgba(244, 67, 54, 0.85)');
    };

    const whepUrl = normalizeWebRtcUrl(streamUrl);
    if (!whepUrl) {
      if (showSnapshotFallback(camera, cameraPreviewContainer, '📸 Fallback snapshot')) {
        setStatus('📸 Snapshot', '📸 Fallback snapshot', 'rgba(52, 152, 219, 0.85)');
        return;
      }
      setStatus('🔴 Sai URL', '🔴 Chỉ hỗ trợ webcam hoặc WebRTC WHEP', 'rgba(244, 67, 54, 0.85)');
      return;
    }

    playWebRtcWhep(whepUrl, video)
      .then(() => {
        video.play().catch(() => {});
      })
      .catch((err) => {
        if (showSnapshotFallback(camera, cameraPreviewContainer, '📸 Fallback snapshot')) {
          setStatus('📸 Snapshot', '📸 Fallback snapshot', 'rgba(52, 152, 219, 0.85)');
          return;
        }
        setStatus('🔴 Lỗi kết nối', `🔴 ${err.message}`, 'rgba(244, 67, 54, 0.85)');
      });
  } else if (camera.camera?.snapshotUrl) {
    // Snapshot URL - show image with auto-refresh
    showSnapshotFallback(camera, cameraPreviewContainer, '📸 Snapshot mỗi 2 giây');
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
export function closeCameraModal() {
  const cameraModal = document.getElementById('cameraModal');
  if (!cameraModal) return;
  
  cameraModal.classList.add('hidden');

  stopActiveCameraPlayback();
}


// Update sensor widget with all sensors
export function updateSensorWidget() {
  // Sensor List rendering removed per user request
  
  // Render camera panel if there are cameras
  renderCameraPanel();
}

// Render camera panel with all cameras for current room
export function renderCameraPanel() {
  const currentRoomId = env.getCurrentRoomId();
  const cameraPanel = document.getElementById('cameraPanel');
  const cameraPanelContent = document.getElementById('cameraPanelContent');
  
  if (!cameraPanel || !cameraPanelContent) return;
  
  // Filter cameras for current room
  const currentRoomCameras = sensorsData.filter(s => s.type === 'camera' && s.roomId === currentRoomId);
  
  if (currentRoomCameras.length === 0) {
    cameraPanel.classList.add('hidden');
    return;
  }

  cameraPanel.classList.remove('hidden');
  cameraPanelContent.innerHTML = '';

  currentRoomCameras.forEach(camera => {
    const isOffline = camera.camera?.status === 'offline';
    const isMaintenance = camera.camera?.status === 'maintenance';
    const isWebcam = camera.camera?.streamUrl === 'webcam://0';
    
    const card = document.createElement('div');
    card.className = `camera-card ${isOffline ? 'offline' : ''} ${isMaintenance ? 'maintenance' : ''}`;
    
    // Status text and style
    let statusHTML = '';
    if (isOffline) {
      statusHTML = '<span style="color: #ff5252; font-size: 10px;">🔴 Offline</span>';
    } else if (isMaintenance) {
      statusHTML = '<span style="color: #ffb84d; font-size: 10px;">🟡 Maintenance</span>';
    } else {
      statusHTML = '<span style="color: #4CAF50; font-size: 10px;">🟢 Hoạt động</span>';
    }
    
    card.onclick = () => showCameraPreview(camera);
    
    const snapshotUrl = camera.camera?.snapshotUrl || '';
    const hasSnapshot = snapshotUrl && snapshotUrl !== 'webcam://0/snapshot';
    
    card.innerHTML = `
      <div class="camera-card-header">
        <div class="camera-card-title">${isWebcam ? '💻' : '📹'} ${camera.name}</div>
        ${statusHTML}
      </div>
      <div class="camera-card-preview" style="${!hasSnapshot ? 'display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.3); padding: 20px 0;' : ''}">
        ${(hasSnapshot && !isOffline && !isMaintenance) 
          ? `<img src="${snapshotUrl}" alt="${camera.name}" style="width: 100%; height: auto; display: block; filter: brightness(0.8);" onerror="this.src=''; this.style.display='none'; this.nextElementSibling.style.display='block';">
             <div style="display: none; font-size: 12px; color: #888;">No Preview</div>` 
          : `<div style="font-size: 24px;">${isMaintenance ? '🟡' : isOffline ? '🔴' : isWebcam ? '💻' : '📹'}</div>
             <div style="font-size: 12px; margin-top: 8px; opacity: 0.7;">
               ${isMaintenance ? 'Đang bảo trì' : isOffline ? 'Offline' : 'Không có ảnh'}
             </div>`
        }
      </div>
    `;
    
    cameraPanelContent.appendChild(card);
  });
}

// Load sensors
export async function loadSensors() {
  try {
    const data = await fetchSensors();
    if (data.success && data.sensors) {
      sensorsData = data.sensors;
      const currentRoomId = env.getCurrentRoomId();
      
      // Add sensor hotspots to current room
      if (currentRoomId) {
        addSensorHotspots(currentRoomId);
      }
      // Update widget and camera panel with current room sensors
      updateSensorWidget();
      renderCameraPanel();
      // Start real-time updates
      startSensorRealTimeUpdates();
    }
  } catch (err) {
    console.error("❌ Error loading sensors:", err);
  }
}

// Start real-time sensor updates (simulate temperature changes)
export function startSensorRealTimeUpdates() {
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
  const currentRoomId = env.getCurrentRoomId();
  try {
    // Đợi nếu sensors chưa load
    if (sensorsData.length === 0) {
      return;
    }
    
    if (!currentRoomId) {
      return;
    }

    const res = await fetch(`/api/real-data/combined?roomId=${currentRoomId}`);
    const data = await res.json();
    
    if (data.success && data.data) {
      const currentRoomSensors = sensorsData.filter(s => s.roomId === currentRoomId && s.type !== 'camera');

      // Update ONLY environment sensors in current room (skip cameras)
      currentRoomSensors.forEach((sensor, index) => {
        if (!sensor.sensors) return; // Skip if no sensors data
        
        // Update with real data (add small variation for each sensor)
        const variation = index * 0.5;
        
        sensor.sensors.temperature.value = Math.round((data.data.temperature + variation) * 10) / 10;
        sensor.sensors.humidity.value = Math.round(data.data.humidity + variation);
        sensor.sensors.pm25.value = Math.round((data.data.pm25 + variation) * 10) / 10;
        
        // Update timestamp
        sensor.lastUpdate = new Date().toISOString();
      });
      
      // Refresh widget
      updateSensorWidget();
    }
  } catch (err) {
    console.error("❌ Lỗi fetch dữ liệu môi trường:", err.message);
  }
}

// Add sensor hotspots to room (show ALL sensors in every room)
export function addSensorHotspots(roomId) {
  const scene = env.getScene(roomId);
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

  const roomSensors = sensorsData.filter(s => s.roomId === roomId);
  if (!roomSensors.length) return;

  roomSensors.forEach(sensor => {
    const yaw = Number(sensor.position?.yaw || 0);
    const pitch = Number(sensor.position?.pitch || 0);

    const el = document.createElement("div");
    const isCamera = sensor.type === "camera";
    const isWebcam = sensor.camera?.streamUrl === "webcam://0";
    const cameraStatus = sensor.camera?.status || "unknown";

    let hotspotClass = "sensor-hotspot temperature";
    if (isCamera) {
      hotspotClass = "sensor-hotspot camera";
      if (cameraStatus === "offline") hotspotClass += " camera-offline";
      if (cameraStatus === "maintenance") hotspotClass += " camera-maintenance";
    }

    el.className = hotspotClass;
    el.title = sensor.name || (isCamera ? "Camera" : "Cảm biến");

    const iconEl = document.createElement("span");
    iconEl.className = "sensor-hotspot-icon";
    iconEl.textContent = isCamera ? (isWebcam ? "💻" : "📹") : "🌡️";
    el.appendChild(iconEl);

    const badgeEl = document.createElement("span");
    badgeEl.className = "sensor-hotspot-badge";
    if (isCamera) {
      if (cameraStatus === "online") badgeEl.classList.add("online");
      else if (cameraStatus === "maintenance") badgeEl.classList.add("maintenance");
      else badgeEl.classList.add("offline");
    } else {
      const pm25 = Number(sensor.sensors?.pm25?.value ?? 0);
      if (pm25 > 150.4) badgeEl.classList.add("offline");
      else if (pm25 > 55.4) badgeEl.classList.add("maintenance");
      else badgeEl.classList.add("online");
    }
    el.appendChild(badgeEl);

    const tooltip = document.createElement("div");
    tooltip.className = "sensor-hotspot-tooltip";

    if (isCamera) {
      const statusText = cameraStatus;
      const statusIcon = statusText === "online" ? "🟢" : statusText === "maintenance" ? "🟡" : "🔴";
      const snapshotUrl = sensor.camera?.snapshotUrl || "";
      const canShowSnapshot = snapshotUrl && snapshotUrl !== "webcam://0/snapshot";

      tooltip.innerHTML = `
        <div class="sensor-tooltip-title">${isWebcam ? "💻" : "📹"} ${sensor.name || "Camera"}</div>
        <div class="sensor-tooltip-line">${statusIcon} ${statusText}</div>
        <div class="sensor-tooltip-line">📐 ${sensor.camera?.resolution || "N/A"}</div>
        ${canShowSnapshot ? `<img class="sensor-tooltip-image" src="${snapshotUrl}?t=${Date.now()}" alt="${sensor.name || "camera"}">` : `<div class="sensor-tooltip-line">${isWebcam ? "Webcam laptop" : "Không có ảnh preview"}</div>`}
      `;
      el.onclick = (event) => {
        event.stopPropagation();
        showCameraPreview(sensor);
      };
    } else {
      const temp = sensor.sensors?.temperature?.value ?? "--";
      const humidity = sensor.sensors?.humidity?.value ?? "--";
      const pm25 = sensor.sensors?.pm25?.value ?? "--";
      tooltip.innerHTML = `
        <div class="sensor-tooltip-title">🌡️ ${sensor.name || "Cảm biến"}</div>
        <div class="sensor-tooltip-line">Nhiệt độ: ${temp}°C</div>
        <div class="sensor-tooltip-line">Độ ẩm: ${humidity}%</div>
        <div class="sensor-tooltip-line">PM2.5: ${pm25}</div>
      `;
    }

    el.appendChild(tooltip);

    container.createHotspot(el, {
      yaw: degToRad(yaw),
      pitch: degToRad(-pitch)
    });
  });
}
