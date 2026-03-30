// Pannellum library
    if (typeof pannellum === 'undefined') {
      console.error('Pannellum not loaded');
    }

    /* ===== STATE ===== */
    let rooms = [];
    let selectedRoomId = null;
    let editingHotspotIndex = null;
    let editingMediaHotspotIndex = null;
    let panoramaViewer = null;
    let selectedMediaFile = null;
    let selectedHotspotIconFile = null;
    let addHotspotMode = false;
    let addMediaMode = false;
    let addSensorPositionMode = false;
    let adminSensorHotspotIds = [];
    let editingSensorIndex = null;
    let roomSensors = [];
    let autoRefreshInterval = null;
    let isAutoRefreshEnabled = false;
    let currentPreviewPeerConnection = null;
    let polygonPoints = []; // [[yaw, pitch], ...] for 3D hotspot highlight
    let isPolygonDrawMode = false;

    /* ===== WEBCAM MANAGEMENT ===== */
    let webcamStream = null;

    function toggleWebcam() {
      const useWebcam = document.getElementById('useWebcam').checked;
      const webcamPreview = document.getElementById('webcamPreview');
      const manualUrlGroup = document.getElementById('manualCameraUrlGroup');
      const streamUrlInput = document.getElementById('cameraStreamUrl');
      const snapshotUrlInput = document.getElementById('cameraSnapshotUrl');
      const statusEl = document.getElementById('cameraConnectionStatus');

      if (useWebcam) {
        webcamPreview.style.display = 'block';
        manualUrlGroup.style.display = 'none';
        streamUrlInput.value = 'webcam://0';
        snapshotUrlInput.value = 'webcam://0/snapshot';
        snapshotUrlInput.disabled = true;
        resetCameraDiagnostics();
        if (statusEl) {
          statusEl.style.color = '#3498db';
          statusEl.textContent = 'ℹ️ Chế độ webcam nội bộ: bỏ qua kiểm tra URL WebRTC';
        }
      } else {
        webcamPreview.style.display = 'none';
        manualUrlGroup.style.display = 'block';
        if (streamUrlInput.value === 'webcam://0') {
          streamUrlInput.value = '';
          snapshotUrlInput.value = '';
        }
        snapshotUrlInput.disabled = false;
        resetCameraDiagnostics();
        stopWebcam();
      }
    }
    window.toggleWebcam = toggleWebcam;

    async function startWebcam() {
      try {
        const video = document.getElementById('webcamVideo');
        const cameraStatusSelect = document.getElementById('cameraStatus');

        // Stop existing stream if any
        if (webcamStream) {
          webcamStream.getTracks().forEach(track => track.stop());
        }

        // Request webcam access
        webcamStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });

        video.srcObject = webcamStream;

        // Ensure video plays
        video.onloadedmetadata = () => {
          video.play().then(() => {
            console.log('✅ Webcam started successfully');
            if (cameraStatusSelect) cameraStatusSelect.value = 'online';
            alert('✅ Webcam đã được bật thành công!');
          }).catch(e => {
            console.error('Play error:', e);
            alert('⚠️ Webcam đã bật nhưng không thể phát video. Hãy kiểm tra quyền truy cập.');
          });
        };
      } catch (err) {
        console.error('❌ Webcam error:', err);
        let errorMsg = '❌ Không thể truy cập webcam: ' + err.message;

        if (err.name === 'NotAllowedError') {
          errorMsg += '\n\n🔒 Bạn đã từ chối quyền truy cập camera. Vui lòng:\n1. Click vào biểu tượng 🔒 trên thanh địa chỉ\n2. Cho phép truy cập Camera\n3. Tải lại trang';
        } else if (err.name === 'NotFoundError') {
          errorMsg += '\n\n📷 Không tìm thấy webcam. Vui lòng kiểm tra:\n- Webcam đã được kết nối\n- Driver webcam đã cài đặt';
        } else if (err.name === 'NotReadableError') {
          errorMsg += '\n\n⚠️ Webcam đang được sử dụng bởi ứng dụng khác';
        }

        alert(errorMsg);
      }
    }
    window.startWebcam = startWebcam;

    function stopWebcam() {
      const video = document.getElementById('webcamVideo');
      const cameraStatusSelect = document.getElementById('cameraStatus');

      if (webcamStream) {
        webcamStream.getTracks().forEach(track => track.stop());
        webcamStream = null;
        video.srcObject = null;
        if (cameraStatusSelect) cameraStatusSelect.value = 'offline';
        console.log('⏹️ Webcam stopped');
      }
    }
    window.stopWebcam = stopWebcam;

    function setCameraConnectionStatus(message, color = '#7f8c8d') {
      const statusEl = document.getElementById('cameraConnectionStatus');
      if (!statusEl) return;
      statusEl.style.color = color;
      statusEl.textContent = message;
    }

    function resetCameraDiagnostics() {
      const wrapper = document.getElementById('snapshotPreviewWrapper');
      const video = document.getElementById('cameraStreamPreviewVideo');
      if (video) {
        try {
          video.pause();
          video.removeAttribute('src');
          video.load();
        } catch (_) { }
      }
      if (currentPreviewPeerConnection) {
        try { currentPreviewPeerConnection.close(); } catch (_) { }
        currentPreviewPeerConnection = null;
      }
      if (wrapper) wrapper.style.display = 'none';
      if (wrapper) wrapper.innerHTML = '';
    }

    function withCacheBuster(url) {
      const separator = url.includes('?') ? '&' : '?';
      return `${url}${separator}t=${Date.now()}`;
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

    async function attachWebRtcPreview(whepUrl, videoEl) {
      const peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      currentPreviewPeerConnection = peerConnection;

      peerConnection.addTransceiver('video', { direction: 'recvonly' });
      peerConnection.addTransceiver('audio', { direction: 'recvonly' });

      peerConnection.ontrack = (event) => {
        const [stream] = event.streams || [];
        if (stream) {
          videoEl.srcObject = stream;
        }
      };

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      await waitForIceGatheringComplete(peerConnection);

      const res = await fetch(whepUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: peerConnection.localDescription?.sdp || offer.sdp
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(errText || `WHEP server lỗi HTTP ${res.status}`);
      }

      const answerSdp = await res.text();
      await peerConnection.setRemoteDescription({ type: 'answer', sdp: answerSdp });
    }

    function previewCameraStream() {
      const streamUrl = (document.getElementById('cameraStreamUrl')?.value || '').trim();
      const wrapper = document.getElementById('snapshotPreviewWrapper');

      if (!streamUrl) {
        resetCameraDiagnostics();
        setCameraConnectionStatus('⚠️ Vui lòng nhập URL stream trước khi xem', '#e67e22');
        return;
      }

      if (streamUrl.startsWith('webcam://')) {
        resetCameraDiagnostics();
        setCameraConnectionStatus('ℹ️ Webcam dùng preview riêng ở phía trên', '#3498db');
        return;
      }

      const whepUrl = normalizeWebRtcUrl(streamUrl);
      if (!whepUrl) {
        resetCameraDiagnostics();
        setCameraConnectionStatus('❌ URL không hợp lệ. Dùng URL /whep hoặc webrtc://host/path', '#e74c3c');
        return;
      }

      if (!wrapper) return;

      wrapper.innerHTML = `
        <video id="cameraStreamPreviewVideo" autoplay muted controls playsinline style="width: 100%; max-height: 220px; object-fit: contain; border-radius: 6px; background: white;"></video>
        <img id="cameraStreamPreviewImageFallback" alt="Stream preview" style="display: none; width: 100%; max-height: 220px; object-fit: contain; border-radius: 6px; background: white;">
      `;
      wrapper.style.display = 'block';
      setCameraConnectionStatus('⏳ Đang kết nối WebRTC...', '#3498db');

      const video = document.getElementById('cameraStreamPreviewVideo');
      const imageFallback = document.getElementById('cameraStreamPreviewImageFallback');
      if (!video || !imageFallback) return;

      video.oncanplay = () => {
        setCameraConnectionStatus('✅ Stream đang phát', '#27ae60');
      };

      video.onerror = () => {
        video.style.display = 'none';
        imageFallback.style.display = 'block';
        imageFallback.src = withCacheBuster(streamUrl);
        setCameraConnectionStatus('ℹ️ Không phát được WebRTC, đang thử hiển thị ảnh snapshot/MJPEG...', '#f39c12');
      };

      imageFallback.onload = () => {
        setCameraConnectionStatus('✅ Stream hiển thị theo chế độ ảnh MJPEG', '#27ae60');
      };

      imageFallback.onerror = () => {
        wrapper.style.display = 'none';
        setCameraConnectionStatus('❌ Không xem trực tiếp được luồng này trên trình duyệt admin', '#e74c3c');
      };

      attachWebRtcPreview(whepUrl, video)
        .then(() => {
          video.play().catch(() => { });
        })
        .catch((err) => {
          wrapper.style.display = 'none';
          setCameraConnectionStatus(`❌ Không xem được stream WebRTC: ${err.message}`, '#e74c3c');
        });
    }
    window.previewCameraStream = previewCameraStream;

    async function checkCameraStreamUrl() {
      const streamUrl = (document.getElementById('cameraStreamUrl')?.value || '').trim();
      const cameraStatusSelect = document.getElementById('cameraStatus');

      if (!streamUrl) {
        setCameraConnectionStatus('⚠️ Vui lòng nhập URL stream trước khi kiểm tra', '#e67e22');
        return;
      }

      if (streamUrl.startsWith('webcam://')) {
        setCameraConnectionStatus('ℹ️ Webcam nội bộ đang hoạt động trên trình duyệt, không cần kiểm tra URL WebRTC', '#3498db');
        return;
      }

      const whepUrl = normalizeWebRtcUrl(streamUrl);
      if (!whepUrl) {
        if (cameraStatusSelect) cameraStatusSelect.value = 'offline';
        setCameraConnectionStatus('❌ URL không hợp lệ. Dùng URL /whep hoặc webrtc://host/path', '#e74c3c');
        return;
      }

      if (cameraStatusSelect) cameraStatusSelect.value = 'online';
      setCameraConnectionStatus(`✅ URL WebRTC hợp lệ: ${whepUrl}`, '#27ae60');
    }
    window.checkCameraStreamUrl = checkCameraStreamUrl;

    /* ===== TOGGLE SENSOR/CAMERA FIELDS ===== */
    function toggleSensorFields() {
      const sensorType = document.getElementById('sensorType').value;
      const environmentFields = document.getElementById('environmentFields');
      const cameraFields = document.getElementById('cameraFields');
      const apiConfigContainer = environmentFields.previousElementSibling;

      if (sensorType === 'camera') {
        environmentFields.style.display = 'none';
        cameraFields.style.display = 'block';
        // Hide API config for camera
        if (apiConfigContainer && apiConfigContainer.style) {
          apiConfigContainer.style.display = 'none';
        }
      } else {
        environmentFields.style.display = 'block';
        cameraFields.style.display = 'none';
        // Show API config for environment sensor
        if (apiConfigContainer && apiConfigContainer.style) {
          apiConfigContainer.style.display = 'block';
        }
      }
    }
    window.toggleSensorFields = toggleSensorFields;

    /* ===== DOM ELEMENTS ===== */
    const selectedRoomInfo = document.getElementById('selectedRoomInfo');
    const hotspotSection = document.getElementById('hotspotSection');
    const hotspotsList = document.getElementById('hotspotsList');
    const hotspotForm = document.getElementById('hotspotForm');
    const hotspotModal = document.getElementById('hotspotModal');
    const modalTitle = document.getElementById('modalTitle');
    const colorPicker = document.getElementById('colorPicker');
    const hotspotIconUrlInput = document.getElementById('hotspotIconUrl');
    const hotspotIconFileInput = document.getElementById('hotspotIconFile');
    const hotspotIconFileInfo = document.getElementById('hotspotIconFileInfo');
    const addHotspotBtn = document.getElementById('addHotspotBtn');
    const addMediaBtn = document.getElementById('addMediaBtn');

    // ===== AUTO-REFRESH FUNCTIONS (declared early for inline onclick) =====
    function toggleAutoRefresh() {
      if (isAutoRefreshEnabled) {
        stopAutoRefresh();
      } else {
        startAutoRefresh();
      }
    }

    function startAutoRefresh() {
      if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
      }

      isAutoRefreshEnabled = true;
      updateAutoRefreshStatus();

      // Will load config later
      const interval = 10000; // default 10 seconds
      autoRefreshInterval = setInterval(() => {
        if (selectedRoomId && roomSensors.length > 0) {
          refreshAllSensors();
        }
      }, interval);

      console.log(`🔄 Auto-refresh enabled (interval: ${interval / 1000}s)`);
    }

    function stopAutoRefresh() {
      if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
      }
      isAutoRefreshEnabled = false;
      updateAutoRefreshStatus();
      console.log('🛑 Auto-refresh disabled');
    }

    function updateAutoRefreshStatus() {
      const statusEl = document.getElementById('autoRefreshStatus');
      if (statusEl) {
        statusEl.textContent = isAutoRefreshEnabled ? '🔄 Auto-refresh: ON' : '⏸️ Auto-refresh: OFF';
        statusEl.style.color = isAutoRefreshEnabled ? '#27ae60' : '#7f8c8d';
      }
    }

    async function refreshAllSensors() {
      if (!selectedRoomId) {
        console.warn('⚠️ Chưa chọn phòng, bỏ qua refresh.');
        return;
      }

      console.log(`🔄 Refreshing sensors (room ${selectedRoomId})...`);

      try {
        const res = await fetch(`/api/real-data/combined?roomId=${selectedRoomId}`);
        const result = await res.json();

        if (result.success && result.data && roomSensors.length > 0) {
          // Update only environment sensors in current room with new data
          // Skip cameras as they don't have temperature/humidity/pm25
          let updatedCount = 0;
          for (const sensor of roomSensors) {
            // Only update environment sensors, not cameras
            if (sensor.type === 'camera' || !sensor.sensors) {
              console.log(`⏭️ Skipping ${sensor.name} (type: ${sensor.type})`);
              continue;
            }

            sensor.sensors.temperature.value = result.data.temperature;
            sensor.sensors.humidity.value = result.data.humidity;
            sensor.sensors.pm25.value = result.data.pm25;
            sensor.lastUpdate = new Date().toISOString();

            // Save to backend
            await fetch(`/api/sensors/${sensor.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(sensor)
            });

            updatedCount++;
          }

          // Reload sensors to display updated data
          await loadSensors();
          console.log(`✅ Refreshed ${updatedCount} environment sensor(s) successfully`);
        }
      } catch (err) {
        console.error('❌ Auto-refresh error:', err);
      }
    }

    // ===== LOAD & RENDER ROOMS =====
    let adminBuildings = [];

    async function loadBuildings() {
      try {
        const rawRes = await fetch('/api/buildings');
        const res = await rawRes.json();
        if (res && res.buildings) {
          adminBuildings = res.buildings;
          const filterSel = document.getElementById('filterBuilding');
          const editSel = document.getElementById('editRoomBuilding');
          
          if (filterSel) {
             const defaultOption1 = '<option value="">-- Tất cả tòa nhà --</option>';
             const defaultOption2 = '<option value="none">-- Phòng rời (không có) --</option>';
             let options = defaultOption1 + defaultOption2;
             adminBuildings.forEach(b => options += `<option value="${b.id}">${b.name}</option>`);
             filterSel.innerHTML = options;
          }
          
          if (editSel) {
             const defaultOption = '<option value="">-- Phòng rời (không có) --</option>';
             let options = defaultOption;
             adminBuildings.forEach(b => options += `<option value="${b.id}">${b.name}</option>`);
             editSel.innerHTML = options;
          }
        }
      } catch (error) {
        console.error('Error loading buildings:', error);
      }
    }

    async function loadRooms() {
      try {
        if (adminBuildings.length === 0) await loadBuildings();
        const res = await fetch('/api/rooms');
        rooms = await res.json();
        renderRooms();
        updateTargetRoomSelect();
      } catch (error) {
        console.error('Error loading rooms:', error);
      }
    }

    function renderRooms() {
      const filterVal = document.getElementById('filterBuilding')?.value;
      const filteredRooms = rooms.filter(room => {
        if (!filterVal) return true;
        if (filterVal === 'none') return !room.buildingId;
        return room.buildingId === filterVal;
      });

      if (filteredRooms.length === 0) {
        roomsList.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📭</div><p>Không có phòng nào</p></div>';
        return;
      }

      roomsList.innerHTML = filteredRooms.map(room => {
        const b = adminBuildings.find(x => x.id === room.buildingId);
        const bName = b ? `🏢 ${b.name}` : `🏢 Phòng rời`;
        return `
        <div class="room-item ${room.id === selectedRoomId ? 'active' : ''}">
          <div class="room-item-text" onclick="selectRoom(${room.id})">
            <div class="room-item-name">🏠 ${room.name}</div>
            <div class="room-item-info">Hotspot: ${room.hotspots ? room.hotspots.length : 0} | Tầng ${room.floor || 1} | ${bName}</div>
          </div>
          <button class="room-item-delete" onclick="deleteRoom(${room.id}, event)">🗑️</button>
        </div>
        `;
      }).join('');
    }

    function updateTargetRoomSelect() {
      const select = document.getElementById('targetRoom');
      select.innerHTML = '<option value="">-- Chọn phòng đích --</option>';
      rooms.forEach(room => {
        if (room.id !== selectedRoomId) {
          select.innerHTML += `<option value="${room.id}">${room.name}</option>`;
        }
      });
    }

    // Will be redefined below after media functions are loaded
    window.selectRoom = function (roomId) {
      // Placeholder - see below for actual implementation
    };

    function renderHotspots() {
      const room = rooms.find(r => r.id === selectedRoomId);
      if (!room || !room.hotspots || room.hotspots.length === 0) {
        hotspotsList.innerHTML = '<div class="empty-state"><p>Chưa có hotspot</p></div>';
        return;
      }

      hotspotsList.innerHTML = room.hotspots.map((hotspot, idx) => {
        const targetRoom = rooms.find(r => r.id === hotspot.target);
        return `
          <div class="hotspot-item">
            <h5>🎯 Hotspot ${idx + 1}</h5>
            <div class="hotspot-info">
              <span><strong>Phòng:</strong> ${targetRoom ? targetRoom.name : '?'}</span>
              <span><strong>Yaw:</strong> ${hotspot.yaw.toFixed(2)}° | <strong>Pitch:</strong> ${hotspot.pitch.toFixed(2)}°</span>
              <span><strong>Icon:</strong> ${hotspot.iconUrl ? 'Có icon tùy chỉnh' : 'Mặc định'}</span>
            </div>
            <div class="hotspot-actions">
              <button class="btn btn-edit btn-small" onclick="editHotspot(${idx})" style="margin-bottom: 0;">✏️ Sửa</button>
              <button class="btn btn-danger btn-small" onclick="deleteHotspot(${idx})" style="margin-bottom: 0;">🗑️ Xóa</button>
            </div>
          </div>
        `;
      }).join('');
    }

    // ===== HOTSPOT OPERATIONS =====
    async function uploadHotspotIconFile(file) {
      const formData = new FormData();
      formData.append('media', file);

      const uploadRes = await fetch('/api/admin/media/upload', {
        method: 'POST',
        body: formData
      });

      const contentType = uploadRes.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const errorText = await uploadRes.text();
        throw new Error(`Upload icon thất bại (${uploadRes.status}): ${errorText.slice(0, 150)}`);
      }

      const uploadData = await uploadRes.json();
      if (!uploadRes.ok || !uploadData.success || !uploadData.media?.url) {
        throw new Error(uploadData.error || `Upload icon thất bại (${uploadRes.status})`);
      }

      return uploadData.media.url;
    }

    hotspotForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const targetId = Number(document.getElementById('targetRoom').value);
      if (!targetId) {
        alert('Vui lòng chọn phòng đích');
        return;
      }

      let iconUrl = hotspotIconUrlInput ? hotspotIconUrlInput.value.trim() : '';
      try {
        if (selectedHotspotIconFile) {
          if (hotspotIconFileInfo) hotspotIconFileInfo.textContent = 'Đang upload icon...';
          iconUrl = await uploadHotspotIconFile(selectedHotspotIconFile);
          if (hotspotIconUrlInput) hotspotIconUrlInput.value = iconUrl;
          if (hotspotIconFileInfo) hotspotIconFileInfo.textContent = `Đã upload: ${selectedHotspotIconFile.name}`;
        }
      } catch (uploadError) {
        alert(uploadError.message);
        if (hotspotIconFileInfo) hotspotIconFileInfo.textContent = '';
        return;
      }

      const data = {
        target: targetId,
        yaw: Number(document.getElementById('yaw').value),
        pitch: Number(document.getElementById('pitch').value),
        rotation: Number(document.getElementById('rotation').value),
        color: document.getElementById('color').value,
        iconUrl
      };

      try {
        let url = `/api/admin/rooms/${selectedRoomId}/hotspots`;
        let method = 'PUT';

        if (editingHotspotIndex !== null) {
          url += `/${editingHotspotIndex}`;
          method = 'PATCH';
        }

        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });

        if (res.ok) {
          await loadRooms();
          renderHotspots();
          loadPanoramaPreview();
          hotspotModal.classList.remove('active');
          selectedHotspotIconFile = null;
          if (hotspotIconFileInput) hotspotIconFileInput.value = '';
          if (hotspotIconFileInfo) hotspotIconFileInfo.textContent = '';
          alert(editingHotspotIndex !== null ? 'Cập nhật thành công!' : 'Thêm thành công!');
        } else {
          alert('Lỗi lưu hotspot');
        }
      } catch (error) {
        console.error('Error saving hotspot:', error);
        alert('Lỗi: ' + error.message);
      }
    });

    window.editHotspot = function (idx) {
      const room = rooms.find(r => r.id === selectedRoomId);
      const hotspot = room.hotspots[idx];

      editingHotspotIndex = idx;
      modalTitle.textContent = 'Chỉnh sửa Hotspot';
      document.getElementById('targetRoom').value = hotspot.target;
      document.getElementById('yaw').value = hotspot.yaw;
      document.getElementById('pitch').value = hotspot.pitch;
      document.getElementById('rotation').value = hotspot.rotation || 0;
      document.getElementById('color').value = hotspot.color || '#ff0000';
      colorPicker.value = hotspot.color || '#ff0000';
      if (hotspotIconUrlInput) hotspotIconUrlInput.value = hotspot.iconUrl || '';
      selectedHotspotIconFile = null;
      if (hotspotIconFileInput) hotspotIconFileInput.value = '';
      if (hotspotIconFileInfo) hotspotIconFileInfo.textContent = hotspot.iconUrl ? 'Đang dùng icon đã lưu' : '';

      hotspotModal.classList.add('active');
    };

    window.deleteHotspot = async function (idx) {
      if (!confirm('Xóa hotspot này?')) return;

      try {
        const res = await fetch(`/api/admin/rooms/${selectedRoomId}/hotspots/${idx}`, {
          method: 'DELETE'
        });

        if (res.ok) {
          await loadRooms();
          renderHotspots();
          loadPanoramaPreview();
          alert('Đã xóa!');
        } else {
          alert('Lỗi xóa hotspot');
        }
      } catch (error) {
        console.error('Error deleting hotspot:', error);
      }
    };

    // ===== DELETE ROOM =====
    window.deleteRoom = async function (roomId, event) {
      event.stopPropagation();

      const room = rooms.find(r => r.id === roomId);
      if (!room) return;

      const confirmed = confirm(`Xóa phòng "${room.name}"?\n\nThao tác này sẽ xóa phòng, hotspot, tiles và ảnh.`);
      if (!confirmed) return;

      try {
        const res = await fetch(`/api/admin/rooms/${roomId}`, { method: 'DELETE' });
        const data = await res.json();

        if (data.success) {
          await loadRooms();

          if (selectedRoomId === roomId) {
            selectedRoomId = null;
            hotspotSection.style.display = 'none';
            selectedRoomInfo.style.display = 'block';

            if (panoramaViewer) {
              panoramaViewer.destroy();
              panoramaViewer = null;
            }
          }

          alert('Đã xóa phòng!');
        } else {
          alert('Lỗi: ' + data.error);
        }
      } catch (err) {
        console.error('Delete error:', err);
        alert('Lỗi: ' + err.message);
      }
    };

    // ===== PANORAMA VIEWER =====
    function renderAdminSensorHotspots() {
      if (!panoramaViewer) return;

      // Remove old sensor hotspots
      adminSensorHotspotIds.forEach(id => {
        try { panoramaViewer.removeHotSpot(id); } catch { }
      });
      adminSensorHotspotIds = [];

      if (!roomSensors || roomSensors.length === 0) return;

      roomSensors.forEach((sensor, idx) => {
        const yaw = Number(sensor.position?.yaw || 0);
        const pitch = Number(sensor.position?.pitch || 0);
        const isCamera = sensor.type === 'camera';
        const isWebcam = sensor.camera?.streamUrl === 'webcam://0';

        const hotspotId = `sensor-${sensor.id || idx}`;
        adminSensorHotspotIds.push(hotspotId);

        const statusText = isCamera ? (sensor.camera?.status || 'unknown') : 'online';
        const statusIcon = statusText === 'online' ? '🟢' : statusText === 'maintenance' ? '🟡' : '🔴';
        const icon = isCamera ? (isWebcam ? '💻' : '📹') : '🌡️';
        const label = `${icon} ${sensor.name || (isCamera ? 'Camera' : 'Cảm biến')} ${statusIcon}`;
        const bg = isCamera ? '#2196f3' : '#FF6B6B';

        panoramaViewer.addHotSpot({
          id: hotspotId,
          pitch,
          yaw,
          type: 'info',
          text: label,
          cssClass: 'custom-hotspot',
          createTooltipFunc: function (div) {
            div.innerHTML = `<span style="background: ${bg}; color: white; padding: 8px 12px; border-radius: 6px; font-size: 12px; white-space: nowrap;">${label}</span>`;
          },
          clickHandlerFunc: function () {
            const index = roomSensors.findIndex(s => s.id === sensor.id);
            if (index !== -1) {
              editSensor(index);
            }
          }
        });
      });
    }

    function loadPanoramaPreview() {
      const room = rooms.find(r => r.id === selectedRoomId);
      if (!room) return;

      const viewerContainer = document.getElementById('panoramaViewer');

      if (panoramaViewer) {
        panoramaViewer.destroy();
        panoramaViewer = null;
      }

      const imageUrl = room.image.startsWith('http') ? room.image : window.location.origin + room.image;

      panoramaViewer = pannellum.viewer('panoramaViewer', {
        type: 'equirectangular',
        panorama: imageUrl,
        autoLoad: true,
        showControls: true,
        mouseZoom: true,
        compass: false,
        hfov: 100,
        minHfov: 50,
        maxHfov: 120,
        pitch: 0,
        yaw: 0
      });

      panoramaViewer.on('load', function () {
        console.log('✅ Panorama loaded');

        // Add navigation hotspots
        if (room.hotspots && room.hotspots.length > 0) {
          room.hotspots.forEach((hotspot, idx) => {
            const targetRoom = rooms.find(r => r.id === hotspot.target);
            const tooltipText = targetRoom ? targetRoom.name : `Hotspot ${idx + 1}`;

            panoramaViewer.addHotSpot({
              id: `hotspot-${idx}`,
              pitch: hotspot.pitch,
              yaw: hotspot.yaw,
              type: 'info',
              text: tooltipText,
              cssClass: 'custom-hotspot',
              createTooltipFunc: function (div) {
                const iconHtml = hotspot.iconUrl
                  ? `<img src="${hotspot.iconUrl}" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin-right:6px;">`
                  : '📍 ';
                div.innerHTML = `<span style="background: ${hotspot.color || '#ff0000'}; color: white; padding: 8px 12px; border-radius: 6px; font-size: 12px; white-space: nowrap;">${iconHtml}${tooltipText}</span>`;
              },
              clickHandlerFunc: function () {
                console.log('Clicked hotspot', idx);
                editHotspot(idx);
              }
            });

            console.log(`Added hotspot ${idx}: Yaw=${hotspot.yaw}°, Pitch=${hotspot.pitch}°`);
          });
          console.log(`✅ Added ${room.hotspots.length} hotspots`);
        }

        // Add media hotspots
        window.savedPolygonAnchors = [];
        if (window.syncSavedPolygonRaf) cancelAnimationFrame(window.syncSavedPolygonRaf);

        if (room.mediaHotspots && room.mediaHotspots.length > 0) {
          room.mediaHotspots.forEach((media, idx) => {
            const icons = { image: '🖼️', pdf: '📄', video: '🎥', '3d': '🧊' };
            const icon = icons[media.mediaType] || '📁';
            const polyText = (media.mediaType === '3d' && media.highlightPolygon && media.highlightPolygon.length >= 3) ? ' [Vùng sáng]' : '';
            const label = `${icon} ${media.title}${polyText}`;

            panoramaViewer.addHotSpot({
              id: `media-${idx}`,
              pitch: media.pitch,
              yaw: media.yaw,
              type: 'info',
              text: label,
              cssClass: 'custom-hotspot',
              createTooltipFunc: function (div) {
                div.innerHTML = `<span style="background: #2196f3; color: white; padding: 8px 12px; border-radius: 6px; font-size: 12px; white-space: nowrap;">${label}</span>`;
              },
              clickHandlerFunc: function () {
                window.open(media.mediaUrl, '_blank');
              }
            });

            console.log(`Added media hotspot ${idx}: ${label}`);

            if (media.mediaType === '3d' && media.highlightPolygon && media.highlightPolygon.length >= 3) {
               const anchors = [];
               media.highlightPolygon.forEach((pt, ptIdx) => {
                  panoramaViewer.addHotSpot({
                     id: `poly-anchor-${idx}-${ptIdx}`,
                     pitch: pt[1],
                     yaw: pt[0],
                     type: 'info',
                     cssClass: 'hidden-poly-anchor',
                     createTooltipFunc: function(div) {
                        div.style.opacity = '0'; // Invisible but takes space for rect
                        div.style.pointerEvents = 'none';
                        div.style.width = '1px';
                        div.style.height = '1px';
                        anchors.push(div);
                     }
                  });
               });
               window.savedPolygonAnchors.push({ anchors: anchors });
            }
          });
          console.log(`✅ Added ${room.mediaHotspots.length} media hotspots`);
          
          let svgSaved = document.getElementById('adminSavedPolygonsOverlay');
          if (!svgSaved) {
             const viewerNode = document.getElementById('panoramaViewer');
             svgSaved = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
             svgSaved.id = 'adminSavedPolygonsOverlay';
             svgSaved.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 5;';
             viewerNode.appendChild(svgSaved);
          }
          
          function syncSavedPolygons() {
             const viewerNode = document.getElementById('panoramaViewer');
             const svgLayer = document.getElementById('adminSavedPolygonsOverlay');
             if (!viewerNode || !svgLayer) return;
             const viewerRect = viewerNode.getBoundingClientRect();
             
             let html = '';
             window.savedPolygonAnchors.forEach(item => {
                let pts = [];
                let valid = true;
                for (let i = 0; i < item.anchors.length; i++) {
                   const div = item.anchors[i];
                   if (!div || div.style.display === 'none') { valid = false; break; }
                   const rect = div.getBoundingClientRect();
                   const x = rect.left - viewerRect.left + rect.width / 2;
                   const y = rect.top - viewerRect.top + rect.height / 2;
                   pts.push(`${x},${y}`);
                }
                if (valid && pts.length >= 3) {
                   html += `<polygon points="${pts.join(' ')}" fill="rgba(80, 80, 200, 0.4)" stroke="rgba(100, 150, 255, 0.8)" stroke-width="2" stroke-linejoin="round" style="pointer-events: none;" />`;
                }
             });
             svgLayer.innerHTML = html;
             window.syncSavedPolygonRaf = requestAnimationFrame(syncSavedPolygons);
          }
          window.syncSavedPolygonRaf = requestAnimationFrame(syncSavedPolygons);
        }

        // Add sensor/camera hotspots on admin panorama
        renderAdminSensorHotspots();
      });

      // Add mousemove tracking for Polygon Draft Line
      panoramaViewer.getContainer().addEventListener('mousemove', function(e) {
        if (!isPolygonDrawMode) return;
        const draftLine = document.getElementById('adminPolygonDraftLine');
        if (!draftLine) return;
        const viewerRect = panoramaViewer.getContainer().getBoundingClientRect();
        const mouseX = e.clientX - viewerRect.left;
        const mouseY = e.clientY - viewerRect.top;

        if (window.handleDivs && window.handleDivs.length > 0) {
          // Get last valid point
          for (let i = window.handleDivs.length - 1; i >= 0; i--) {
            const lastDiv = window.handleDivs[i];
            if (lastDiv && lastDiv.style.opacity !== '0' && lastDiv.style.display !== 'none') {
               const rect = lastDiv.getBoundingClientRect();
               const lastX = rect.left - viewerRect.left + rect.width / 2;
               const lastY = rect.top - viewerRect.top + rect.height / 2;
               
               draftLine.setAttribute('x1', lastX);
               draftLine.setAttribute('y1', lastY);
               draftLine.setAttribute('x2', mouseX);
               draftLine.setAttribute('y2', mouseY);
               draftLine.style.display = 'block';
               return;
            }
          }
        }
        draftLine.style.display = 'none';
      });

      panoramaViewer.on('mousedown', function (event) {
        if (event.button === 0) {
          setTimeout(() => {
            const coords = panoramaViewer.mouseEventToCoords(event);
            if (coords && coords[0] !== undefined && coords[1] !== undefined) {
              const pitch = coords[0];
              const yaw = coords[1];

              // Polygon drawing mode — intercept click before other modes
              if (isPolygonDrawMode) {
                handlePolygonClick(pitch, yaw);
                return;
              }

              // Add media hotspot via click
              if (addMediaMode) {
                document.getElementById('mediaYaw').value = yaw.toFixed(2);
                document.getElementById('mediaPitch').value = pitch.toFixed(2);
                document.getElementById('mediaHotspotModal').classList.add('active');
                setAddMediaMode(false);
                return;
              }

              // Pick sensor/camera position via click
              if (addSensorPositionMode) {
                document.getElementById('sensorYaw').value = yaw.toFixed(2);
                document.getElementById('sensorPitch').value = pitch.toFixed(2);
                sensorModal.classList.add('active');
                setAddSensorPositionMode(false);
                return;
              }

              // Add navigation hotspot via click
              if (addHotspotMode) {
                editingHotspotIndex = null;
                modalTitle.textContent = 'Thêm Hotspot (từ ảnh)';
                document.getElementById('targetRoom').value = '';
                document.getElementById('yaw').value = yaw.toFixed(2);
                document.getElementById('pitch').value = pitch.toFixed(2);
                document.getElementById('rotation').value = 0;
                document.getElementById('color').value = '#ff0000';
                colorPicker.value = '#ff0000';
                if (hotspotIconUrlInput) hotspotIconUrlInput.value = '';
                selectedHotspotIconFile = null;
                if (hotspotIconFileInput) hotspotIconFileInput.value = '';
                if (hotspotIconFileInfo) hotspotIconFileInfo.textContent = '';
                hotspotModal.classList.add('active');
                setAddHotspotMode(false);
              }
            }
          }, 50);
        }
      });
    }

    // ===== ADD MODE FUNCTIONS =====
    function setAddHotspotMode(on) {
      addHotspotMode = on;
      if (addHotspotMode) addMediaMode = false;
      updateAddHotspotButton();
      updateAddMediaButton();
    }

    function updateAddHotspotButton() {
      if (addHotspotMode) {
        addHotspotBtn.textContent = '🎯 Click ảnh';
        addHotspotBtn.style.background = '#27ae60';
      } else {
        addHotspotBtn.textContent = '➕ Di chuyển';
        addHotspotBtn.style.background = '';
      }

    }

    if (addHotspotBtn) {
      addHotspotBtn.addEventListener('click', () => {
        setAddHotspotMode(!addHotspotMode);
      });
    }

    if (hotspotIconFileInput) {
      hotspotIconFileInput.addEventListener('change', (event) => {
        const file = event.target.files?.[0] || null;
        selectedHotspotIconFile = file;
        if (hotspotIconFileInfo) {
          hotspotIconFileInfo.textContent = file
            ? `${file.name} (${(file.size / 1024).toFixed(1)} KB) - sẽ upload khi lưu`
            : '';
        }
      });
    }

    // Color picker
    if (colorPicker) {
      colorPicker.addEventListener('change', (e) => {
        document.getElementById('color').value = e.target.value;
      });
    }

    const colorSwatches = document.querySelectorAll('.color-swatch');
    colorSwatches.forEach(swatch => {
      swatch.addEventListener('click', () => {
        const color = swatch.getAttribute('data-color');
        if (color) {
          document.getElementById('color').value = color;
          colorPicker.value = color;
        }
      });
    });

    /* ===== MEDIA HOTSPOT FUNCTIONS ===== */
    function closeMediaHotspotModal() {
      document.getElementById('mediaHotspotModal').classList.remove('active');
      document.getElementById('mediaHotspotForm').reset();
      selectedMediaFile = null;
      editingMediaHotspotIndex = null;
      document.getElementById('mediaFileInfo').textContent = '';
      delete document.getElementById('mediaHotspotForm').dataset.existingMediaUrl;

      // Reset modal header to default
      const modal = document.getElementById('mediaHotspotModal');
      const modalHeader = modal.querySelector('.modal-header h3');
      modalHeader.textContent = '📁 Thêm Tư liệu';

      // Reset polygon drawing
      if (typeof clearPolygon === 'function') clearPolygon();
      isPolygonDrawMode = false;
      const polyBtn = document.getElementById('polygonDrawBtn');
      if (polyBtn) { polyBtn.textContent = '✏️ Bắt đầu vẽ'; polyBtn.style.background = '#3498db'; }
      const polyStatus = document.getElementById('polygonStatus');
      if (polyStatus) polyStatus.textContent = '';
      const polySection = document.getElementById('polygonHighlightSection');
      if (polySection) polySection.style.display = 'none';
      
      // Hide floating finish button
      const finishBtn = document.getElementById('floatingFinishDrawBtn');
      if (finishBtn) finishBtn.style.display = 'none';
      
      const svgOverlay = document.getElementById('adminPolygonOverlay');
      if (svgOverlay) svgOverlay.style.display = 'none';
      if (window.syncPolygonRaf) cancelAnimationFrame(window.syncPolygonRaf);
    }

    /* ===== POLYGON DRAWING ===== */
    window.handleDivs = [];
    window.syncPolygonRaf = null;

    function syncPolygonLoop() {
      if (!isPolygonDrawMode) return;
      const polygon = document.getElementById('adminPolygonShape');
      const viewerNode = document.getElementById('panoramaViewer');
      if (!viewerNode) return;
      const viewerRect = viewerNode.getBoundingClientRect();
      
      if (polygon && window.handleDivs && window.handleDivs.length > 0) {
        let pts = [];
        for (let i = 0; i < window.handleDivs.length; i++) {
            const div = window.handleDivs[i];
            if (!div || div.style.display === 'none' || div.style.opacity === '0') continue;
            const rect = div.getBoundingClientRect();
            const x = rect.left - viewerRect.left + rect.width / 2;
            const y = rect.top - viewerRect.top + rect.height / 2;
            pts.push(`${x},${y}`);
        }
        polygon.setAttribute('points', pts.join(' '));
      } else if (polygon) {
        polygon.setAttribute('points', '');
      }
      window.syncPolygonRaf = requestAnimationFrame(syncPolygonLoop);
    }

    function togglePolygonDrawMode() {
      isPolygonDrawMode = !isPolygonDrawMode;
      const btn = document.getElementById('polygonDrawBtn');
      const status = document.getElementById('polygonStatus');
      const modal = document.getElementById('mediaHotspotModal');
      
      if (isPolygonDrawMode) {
        // Change button state
        btn.textContent = '✏️ Đang vẽ (Click Xong phía trên)';
        btn.style.background = '#e74c3c';
        status.textContent = `✏️ Click trên ảnh 360 phía trên. Đã có ${polygonPoints.length} điểm.`;
        
        // Hide modal so user can click panorama
        modal.classList.remove('active');
        
        // Show floating finish button on panorama
        let finishBtn = document.getElementById('floatingFinishDrawBtn');
        if (!finishBtn) {
          finishBtn = document.createElement('button');
          finishBtn.id = 'floatingFinishDrawBtn';
          finishBtn.innerHTML = '✅ Lưu vùng vẽ & Trở lại form';
          finishBtn.className = 'btn';
          finishBtn.style.cssText = 'position: absolute; top: 15px; right: 15px; z-index: 10000; background: #e74c3c; color: white; margin: 0; box-shadow: 0 4px 15px rgba(0,0,0,0.4); padding: 10px 16px; border-radius: 8px; font-weight: bold; font-size: 14px;';
          finishBtn.onclick = togglePolygonDrawMode;
          document.getElementById('panoramaViewer').appendChild(finishBtn);
        }
        finishBtn.style.display = 'block';
        
        let svgOverlay = document.getElementById('adminPolygonOverlay');
        if (!svgOverlay) {
          const viewerNode = document.getElementById('panoramaViewer');
          viewerNode.style.position = 'relative';
          
          svgOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svgOverlay.id = 'adminPolygonOverlay';
          svgOverlay.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 10;';
          
          const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
          polygon.id = 'adminPolygonShape';
          polygon.setAttribute('fill', 'rgba(80, 80, 200, 0.4)');
          polygon.setAttribute('stroke', 'rgba(100, 150, 255, 0.8)');
          polygon.setAttribute('stroke-width', '2');
          polygon.setAttribute('stroke-linejoin', 'round');
          
          const draftLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          draftLine.id = 'adminPolygonDraftLine';
          draftLine.setAttribute('stroke', 'rgba(255, 100, 100, 0.8)');
          draftLine.setAttribute('stroke-width', '2');
          draftLine.setAttribute('stroke-dasharray', '4');
          draftLine.style.display = 'none';

          svgOverlay.appendChild(polygon);
          svgOverlay.appendChild(draftLine);
          viewerNode.appendChild(svgOverlay);
        }
        svgOverlay.style.display = 'block';
        window.syncPolygonRaf = requestAnimationFrame(syncPolygonLoop);
        
      } else {
        // Change button state
        btn.textContent = '✏️ Sửa vùng vẽ';
        btn.style.background = '#3498db';
        status.textContent = polygonPoints.length > 0 ? `✅ ${polygonPoints.length} điểm đã lưu.` : '';
        
        // Restore modal
        modal.classList.add('active');
        
        // Hide floating finish button
        const finishBtn = document.getElementById('floatingFinishDrawBtn');
        if (finishBtn) finishBtn.style.display = 'none';
        
        const svgOverlay = document.getElementById('adminPolygonOverlay');
        if (svgOverlay) svgOverlay.style.display = 'none';
        const draftLine = document.getElementById('adminPolygonDraftLine');
        if (draftLine) draftLine.style.display = 'none';
        if (window.syncPolygonRaf) cancelAnimationFrame(window.syncPolygonRaf);
      }
    }
    window.togglePolygonDrawMode = togglePolygonDrawMode;

    function handlePolygonClick(pitch, yaw) {
      polygonPoints.push([yaw, pitch]);
      const status = document.getElementById('polygonStatus');
      if (status) status.textContent = `✏️ ${polygonPoints.length} điểm. Tiếp tục click để thêm.`;
      updatePolygonPreviewHotspots();
    }

    function updatePolygonPreviewHotspots() {
      if (!panoramaViewer) return;
      for (let i = 0; i < 50; i++) {
        try { panoramaViewer.removeHotSpot(`poly-pt-${i}`); } catch {}
      }
      window.handleDivs = [];
      polygonPoints.forEach(([yaw, pitch], i) => {
        try {
          panoramaViewer.addHotSpot({
            id: `poly-pt-${i}`,
            pitch, yaw,
            type: 'info',
            text: `${i+1}`,
            cssClass: 'custom-hotspot',
            createTooltipFunc: function(div) {
              window.handleDivs[i] = div;
              div.innerHTML = '';
              div.style.width = '14px';
              div.style.height = '14px';
              div.style.background = '#ffeb3b';
              div.style.borderRadius = '50%';
              div.style.border = '2px solid #000';
              div.style.boxShadow = '0 0 5px rgba(0,0,0,0.5)';
              div.style.pointerEvents = 'auto';
              div.style.cursor = 'pointer';
              div.title = "Double click để xoá điểm này";
              div.ondblclick = (e) => {
                 e.stopPropagation();
                 polygonPoints.splice(i, 1);
                 updatePolygonPreviewHotspots();
                 const status = document.getElementById('polygonStatus');
                 if (status) status.textContent = polygonPoints.length > 0 ? `✏️ Đã xoá. Còn ${polygonPoints.length} điểm.` : 'Chưa có điểm nào.';
              };
            }
          });
        } catch {}
      });
    }

    function undoPolygonPoint() {
      polygonPoints.pop();
      updatePolygonPreviewHotspots();
      const status = document.getElementById('polygonStatus');
      if (status) status.textContent = polygonPoints.length > 0 ? `${polygonPoints.length} điểm còn lại.` : 'Chưa có điểm nào.';
    }
    window.undoPolygonPoint = undoPolygonPoint;

    function clearPolygon() {
      polygonPoints = [];
      updatePolygonPreviewHotspots();
      const status = document.getElementById('polygonStatus');
      if (status) status.textContent = '';
    }
    window.clearPolygon = clearPolygon;

    function updateMediaUploadHint() {
      const type = document.getElementById('mediaType').value;
      const hint = document.getElementById('mediaUploadHint');
      const fileInput = document.getElementById('mediaFileInput');
      const fileSection = document.getElementById('fileUploadSection');
      const linkSection = document.getElementById('linkInputSection');
      const mediaUrlInput = document.getElementById('mediaUrl');

      // Hide both sections first
      fileSection.style.display = 'none';
      linkSection.style.display = 'none';

      // Show/hide polygon section for 3d type
      const polySection = document.getElementById('polygonHighlightSection');
      if (polySection) polySection.style.display = (type === '3d') ? 'block' : 'none';
      if (type !== '3d') { polygonPoints = []; isPolygonDrawMode = false; }

      const hints = {
        'image': { text: '🖼️ Chọn ảnh', accept: 'image/*' },
        'pdf': { text: '📄 Chọn PDF', accept: '.pdf' },
        'video': { text: '🎥 Chọn video', accept: 'video/*' },
        '3d': { text: '🎮 Chọn 3D', accept: '.glb,.gltf' }
      };

      if (type === 'youtube' || type === 'facebook' || type === 'web') {
        // Show link input section
        linkSection.style.display = 'block';
        if (type === 'youtube') {
          mediaUrlInput.placeholder = 'https://www.youtube.com/watch?v=... hoặc https://youtu.be/...';
        } else if (type === 'facebook') {
          mediaUrlInput.placeholder = 'https://www.facebook.com/watch/?v=... hoặc link bài đăng Facebook';
        } else if (type === 'web') {
          mediaUrlInput.placeholder = 'https://example.com - Nhập URL trang web';
        }
      } else if (type === 'note') {
        // For notes, don't show file or link section - description is enough
        // Note: nothing to show, just let user fill in description
      } else {
        // Show file upload section
        fileSection.style.display = 'block';
        if (hints[type]) {
          hint.textContent = hints[type].text;
          fileInput.accept = hints[type].accept;
        }
      }
    }

    function handleMediaFileSelect(event) {
      const file = event.target.files[0];
      if (!file) return;

      selectedMediaFile = file;
      document.getElementById('mediaFileInfo').textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    }

    const mediaForm = document.getElementById('mediaHotspotForm');
    if (mediaForm) {
      mediaForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const mediaType = document.getElementById('mediaType').value;

        if (!selectedRoomId) {
          alert('Vui lòng chọn phòng');
          return;
        }

        let mediaUrl = null;

        try {
          // Handle YouTube/Facebook/Web links
          if (mediaType === 'youtube' || mediaType === 'facebook' || mediaType === 'web') {
            mediaUrl = document.getElementById('mediaUrl').value.trim();
            if (!mediaUrl) {
              alert('Vui lòng nhập URL');
              return;
            }
          } else if (mediaType === 'note') {
            // For notes, use the description as mediaUrl (we'll use it as note content)
            // Description is optional - can be empty
            const description = document.getElementById('mediaDescription').value.trim();
            mediaUrl = description || ''; // Allow empty notes
          } else {
            // Handle file upload
            if (editingMediaHotspotIndex !== null && !selectedMediaFile) {
              mediaUrl = mediaForm.dataset.existingMediaUrl;
            } else if (!selectedMediaFile) {
              alert('Vui lòng chọn file');
              return;
            }

            // Upload new media file if provided
            if (selectedMediaFile) {
              const formData = new FormData();
              formData.append('media', selectedMediaFile);

              const uploadRes = await fetch('/api/admin/media/upload', {
                method: 'POST',
                body: formData
              });

              const contentType = uploadRes.headers.get('content-type') || '';
              if (!contentType.includes('application/json')) {
                const errorText = await uploadRes.text();
                throw new Error(`Upload thất bại (${uploadRes.status}): ${errorText.slice(0, 150)}`);
              }

              const uploadData = await uploadRes.json();
              if (!uploadRes.ok || !uploadData.success) {
                throw new Error(uploadData.error || `Upload thất bại (${uploadRes.status})`);
              }

              mediaUrl = uploadData.media.url;
            }
          }

          // Prepare media hotspot data
          const mediaHotspot = {
            yaw: parseFloat(document.getElementById('mediaYaw').value),
            pitch: parseFloat(document.getElementById('mediaPitch').value),
            title: document.getElementById('mediaTitle').value,
            description: document.getElementById('mediaDescription').value,
            mediaUrl: mediaUrl,
            mediaType: mediaType,
            highlightPolygon: (mediaType === '3d' && polygonPoints.length >= 3) ? polygonPoints.map(p => [...p]) : null
          };

          // Add or update
          let url = `/api/admin/rooms/${selectedRoomId}/media-hotspots`;
          let method = 'POST';

          if (editingMediaHotspotIndex !== null) {
            url += `/${editingMediaHotspotIndex}`;
            method = 'PATCH';
          }

          const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(mediaHotspot)
          });

          const data = await res.json();

          if (data.success) {
            document.getElementById('mediaHotspotModal').classList.remove('active');
            mediaForm.reset();
            selectedMediaFile = null;
            editingMediaHotspotIndex = null;
            document.getElementById('mediaFileInfo').textContent = '';
            document.getElementById('mediaUrl').value = '';
            delete mediaForm.dataset.existingMediaUrl;

            // --- Reset Polygon State ---
            if (typeof clearPolygon === 'function') clearPolygon();
            isPolygonDrawMode = false;
            const polyBtn = document.getElementById('polygonDrawBtn');
            if (polyBtn) { polyBtn.textContent = '✏️ Bắt đầu vẽ'; polyBtn.style.background = '#3498db'; }
            const polyStatus = document.getElementById('polygonStatus');
            if (polyStatus) polyStatus.textContent = '';
            const finishBtn = document.getElementById('floatingFinishDrawBtn');
            if (finishBtn) finishBtn.style.display = 'none';
            const svgOverlay = document.getElementById('adminPolygonOverlay');
            if (svgOverlay) svgOverlay.style.display = 'none';
            if (window.syncPolygonRaf) cancelAnimationFrame(window.syncPolygonRaf);
            // ---------------------------

            // Reset modal header to default
            const modal = document.getElementById('mediaHotspotModal');
            const modalHeader = modal.querySelector('.modal-header h3');
            modalHeader.textContent = '📁 Thêm Tư liệu';

            // Refresh room data so panorama has latest media hotspots
            await loadRooms();
            loadMediaHotspots();
            loadPanoramaPreview();
            alert('✅ ' + (method === 'PATCH' ? 'Cập nhật thành công!' : 'Đã thêm tư liệu!'));
          } else {
            alert('Lỗi: ' + data.error);
          }
        } catch (err) {
          console.error(err);
          alert('Lỗi: ' + err.message);
        }
      });
    }

    async function loadMediaHotspots() {
      if (!selectedRoomId) return;

      try {
        const res = await fetch(`/api/admin/rooms/${selectedRoomId}/media-hotspots`);
        const data = await res.json();

        if (data.success) {
          renderMediaHotspots(data.mediaHotspots || []);
        }
      } catch (err) {
        console.error('Load media error:', err);
      }
    }

    function renderMediaHotspots(mediaHotspots) {
      const list = document.getElementById('mediaHotspotsList');

      if (!mediaHotspots || mediaHotspots.length === 0) {
        list.innerHTML = '<div class="empty-state"><p>Chưa có tư liệu</p></div>';
        return;
      }

      const icons = { image: '🖼️', pdf: '📄', video: '🎥', '3d': '🧊', youtube: '▶️', facebook: '👍', web: '🌐', note: '!' };

      list.innerHTML = mediaHotspots.map((media, idx) => {
        const polyText = (media.mediaType === '3d' && media.highlightPolygon && media.highlightPolygon.length >= 3) ? '<span style="font-size:11px;color:#e74c3c;background:#fdebd0;padding:2px 4px;border-radius:4px;margin-left:5px;display:inline-block;vertical-align:middle;">🔲 Có vùng sáng</span>' : '';
        return `
        <div class="hotspot-item" style="background: #e8f5e9; border-left-color: #27ae60;">
          <h5>${icons[media.mediaType] || '📁'} ${media.title}${polyText}</h5>
          <div class="hotspot-info">
            <span>${media.description || ''}</span>
            <span><strong>Yaw:</strong> ${media.yaw?.toFixed(2) || '?'}° | <strong>Pitch:</strong> ${media.pitch?.toFixed(2) || '?'}°</span>
          </div>
          <div class="hotspot-actions">
            <button class="btn btn-small" onclick="window.open('${media.mediaUrl}', '_blank')" style="margin-bottom: 0; background: #2196f3; color: white;">👁️ Xem</button>
            <button class="btn btn-edit btn-small" onclick="editMediaHotspot(${idx})" style="margin-bottom: 0;">✏️ Sửa</button>
            <button class="btn btn-small" onclick="deleteMediaHotspot(${idx})" style="margin-bottom: 0; background: #f44336; color: white;">🗑️ Xóa</button>
          </div>
        </div>
        `;
      }).join('');
    }

    window.deleteMediaHotspot = async function (index) {
      if (!confirm('Xóa tư liệu này?')) return;

      try {
        const res = await fetch(`/api/admin/rooms/${selectedRoomId}/media-hotspots/${index}`, {
          method: 'DELETE'
        });

        const data = await res.json();

        if (data.success) {
          await loadRooms();
          loadMediaHotspots();
          loadPanoramaPreview();
          alert('✅ Đã xóa!');
        }
      } catch (err) {
        alert('Lỗi: ' + err.message);
      }
    };

    window.editMediaHotspot = function (idx) {
      const room = rooms.find(r => r.id === selectedRoomId);
      if (!room || !room.mediaHotspots || !room.mediaHotspots[idx]) return;

      const media = room.mediaHotspots[idx];

      editingMediaHotspotIndex = idx;
      document.getElementById('mediaTitle').value = media.title;
      document.getElementById('mediaDescription').value = media.description || '';
      document.getElementById('mediaType').value = media.mediaType;
      document.getElementById('mediaYaw').value = media.yaw;
      document.getElementById('mediaPitch').value = media.pitch;

      // Store the current media URL for reference if not uploading new file
      document.getElementById('mediaHotspotForm').dataset.existingMediaUrl = media.mediaUrl;

      // Update UI based on media type
      if (media.mediaType === 'youtube' || media.mediaType === 'facebook' || media.mediaType === 'web') {
        document.getElementById('mediaUrl').value = media.mediaUrl;
        document.getElementById('mediaFileInfo').textContent = '';
      } else if (media.mediaType === 'note') {
        // For notes, media.mediaUrl contains the note content
        document.getElementById('mediaUrl').value = '';
        document.getElementById('mediaFileInfo').textContent = '';
      } else {
        document.getElementById('mediaFileInfo').textContent = `📎 Tệp hiện tại: ${media.mediaUrl.split('/').pop()}`;
        document.getElementById('mediaUrl').value = '';
      }

      updateMediaUploadHint();

      // Restore polygon for 3d hotspots
      polygonPoints = (media.mediaType === '3d' && Array.isArray(media.highlightPolygon)) ? media.highlightPolygon.map(p => [...p]) : [];
      const polyStatus = document.getElementById('polygonStatus');
      if (polyStatus && polygonPoints.length > 0) polyStatus.textContent = `✅ ${polygonPoints.length} điểm đã lưu.`;
      setTimeout(() => updatePolygonPreviewHotspots(), 500);

      const modal = document.getElementById('mediaHotspotModal');
      const modalHeader = modal.querySelector('.modal-header h3');
      modalHeader.textContent = '📝 Chỉnh sửa Tư liệu';

      modal.classList.add('active');
    };

    function setAddMediaMode(on) {
      addMediaMode = on;
      if (addMediaMode) addHotspotMode = false;
      updateAddMediaButton();
      updateAddHotspotButton();
    }

    function setAddSensorPositionMode(on) {
      addSensorPositionMode = on;
      if (addSensorPositionMode) {
        addHotspotMode = false;
        addMediaMode = false;
      }

      updateAddMediaButton();
      updateAddHotspotButton();

      const pickBtn = document.getElementById('pickSensorPositionBtn');
      const hint = document.getElementById('sensorPositionHint');
      if (pickBtn) {
        pickBtn.textContent = addSensorPositionMode ? '🎯 Đang chờ click ảnh...' : '🎯 Chọn trên ảnh 360';
        pickBtn.style.background = addSensorPositionMode ? '#e67e22' : '#27ae60';
      }
      if (hint) {
        hint.textContent = addSensorPositionMode
          ? 'Đang chờ chọn vị trí: hãy click 1 điểm trên ảnh 360.'
          : 'Có thể nhập tay hoặc bấm nút để click trực tiếp trên ảnh.';
      }
    }

    window.startSensorPositionPick = function () {
      if (!panoramaViewer || !selectedRoomId) {
        alert('⚠️ Vui lòng chọn phòng và chờ ảnh 360 tải xong trước khi chọn vị trí.');
        return;
      }

      if (!sensorModal.classList.contains('active')) {
        alert('⚠️ Vui lòng mở form thêm/sửa thiết bị trước.');
        return;
      }

      sensorModal.classList.remove('active');
      setAddSensorPositionMode(true);
      alert('🎯 Hãy click 1 điểm trên ảnh 360 để lấy vị trí cảm biến.');
    };

    function updateAddMediaButton() {
      if (!addMediaBtn) return;
      if (addMediaMode) {
        addMediaBtn.textContent = '🎯 Click ảnh';
        addMediaBtn.style.background = '#2196f3';
      } else {
        addMediaBtn.textContent = '📁 Tư liệu';
        addMediaBtn.style.background = '';
      }
    }

    if (addMediaBtn) {
      addMediaBtn.addEventListener('click', () => {
        setAddMediaMode(!addMediaMode);
      });
    }

    // Update selectRoom to load media hotspots and sensors
    window.selectRoom = function (roomId) {
      selectedRoomId = roomId;
      const room = rooms.find(r => r.id === roomId);
      if (room) {
        const editSel = document.getElementById('editRoomBuilding');
        if (editSel) {
           editSel.value = room.buildingId || '';
        }
      }
      renderRooms();
      updateTargetRoomSelect();
      renderHotspots();
      loadPanoramaPreview();
      loadMediaHotspots();
      loadSensors();
      hotspotSection.style.display = 'block';
      selectedRoomInfo.style.display = 'none';
    };

    window.saveRoomBuilding = async function() {
      if (!selectedRoomId) return;
      const editSel = document.getElementById('editRoomBuilding');
      if (!editSel) return;
      const newBuildingId = editSel.value;
      const room = rooms.find(r => r.id === selectedRoomId);
      if (!room) return;
      if (room.buildingId === newBuildingId) {
         alert("Phòng đã ở tòa nhà này.");
         return;
      }
      if (!confirm("Bạn có muốn chuyển phòng này sang tòa nhà khác? Các file ảnh cũng sẽ được di chuyển theo.")) return;

      try {
        const rawRes = await fetch(`/api/rooms/${selectedRoomId}`, {
           method: "PATCH",
           headers: { "Content-Type": "application/json" },
           body: JSON.stringify({ buildingId: newBuildingId || null })
        });
        const res = await rawRes.json();
        if (res && res.success) {
           alert("Chuyển phòng thành công!");
           await loadRooms();
           selectRoom(selectedRoomId);
        } else {
           alert("Lỗi: " + (res?.error || "Không rõ nguyên nhân."));
        }
      } catch(e) {
        console.error(e);
        alert("Lỗi khi chuyển phòng.");
      }
    };

    // (Handled inside panorama mousedown)

    // ===== SENSOR MANAGEMENT =====
    const addSensorBtn = document.getElementById('addSensorBtn');
    const sensorModal = document.getElementById('sensorModal');
    const sensorForm = document.getElementById('sensorForm');
    const sensorModalTitle = document.getElementById('sensorModalTitle');
    let currentRoomApiConfig = null;

    const cameraStreamUrlInput = document.getElementById('cameraStreamUrl');
    if (cameraStreamUrlInput) {
      cameraStreamUrlInput.addEventListener('change', () => {
        const value = (cameraStreamUrlInput.value || '').trim();
        if (!value) {
          resetCameraDiagnostics();
          setCameraConnectionStatus('', '#7f8c8d');
          return;
        }
        previewCameraStream();
      });
    }

    // Toggle API Config Section
    function setApiInputsDisabled(disabled) {
      const ids = [
        'roomWeatherUrl',
        'roomWeatherApiKey',
        'roomWeatherLat',
        'roomWeatherLon',
        'roomAirUrl',
        'roomAirToken'
      ];
      ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = disabled;
      });
    }

    async function toggleApiConfigSection() {
      const section = document.getElementById('apiConfigSection');
      const summary = document.getElementById('apiConfigSummary');
      const btn = document.getElementById('toggleApiConfig');

      if (section.style.display === 'none') {
        section.style.display = 'block';
        summary.style.display = 'none';
        btn.textContent = '✅ Xong';
        setApiInputsDisabled(false);
      } else {
        // Save config when closing edit
        if (selectedRoomId) {
          await saveRoomApiConfig(selectedRoomId);
        }
        section.style.display = 'none';
        summary.style.display = 'block';
        btn.textContent = '📝 Chỉnh sửa';
        setApiInputsDisabled(true);
        updateApiConfigSummary();
      }
    }

    // Update API Config Summary
    function updateApiConfigSummary() {
      const weatherKey = document.getElementById('roomWeatherApiKey').value;
      const airToken = document.getElementById('roomAirToken').value;

      document.getElementById('summaryWeatherStatus').textContent = weatherKey ? '✅ Đã cấu hình' : '❌ Chưa cấu hình';
      document.getElementById('summaryAirStatus').textContent = airToken ? '✅ Đã cấu hình' : '❌ Chưa cấu hình';
    }

    // Load Room API Config
    async function loadRoomApiConfig(roomId) {
      try {
        const res = await fetch(`/api/rooms/${roomId}/api-config`);
        const data = await res.json();

        if (data.success && data.config) {
          currentRoomApiConfig = data.config;

          // Fill form with existing config
          document.getElementById('roomWeatherUrl').value = data.config.weatherApi?.url || 'https://api.openweathermap.org/data/2.5/weather';
          document.getElementById('roomWeatherApiKey').value = data.config.weatherApi?.apiKey || '';
          document.getElementById('roomWeatherLat').value = data.config.weatherApi?.params?.lat || 10.7769;
          document.getElementById('roomWeatherLon').value = data.config.weatherApi?.params?.lon || 106.7009;

          document.getElementById('roomAirUrl').value = data.config.airQualityApi?.url || 'https://api.waqi.info/feed/@13659/';
          document.getElementById('roomAirToken').value = data.config.airQualityApi?.token || '';

          updateApiConfigSummary();
        } else {
          // No config yet, use defaults
          document.getElementById('roomWeatherUrl').value = 'https://api.openweathermap.org/data/2.5/weather';
          document.getElementById('roomWeatherApiKey').value = '';
          document.getElementById('roomWeatherLat').value = 10.7769;
          document.getElementById('roomWeatherLon').value = 106.7009;
          document.getElementById('roomAirUrl').value = 'https://api.waqi.info/feed/@13659/';
          document.getElementById('roomAirToken').value = '';
          updateApiConfigSummary();
        }
      } catch (err) {
        console.error('Load room API config error:', err);
      }
    }

    // Save Room API Config
    async function saveRoomApiConfig(roomId) {
      const config = {
        weatherApi: {
          provider: 'openweathermap',
          url: document.getElementById('roomWeatherUrl').value,
          apiKey: document.getElementById('roomWeatherApiKey').value,
          params: {
            lat: parseFloat(document.getElementById('roomWeatherLat').value),
            lon: parseFloat(document.getElementById('roomWeatherLon').value),
            units: 'metric'
          }
        },
        airQualityApi: {
          provider: 'waqi',
          url: document.getElementById('roomAirUrl').value,
          token: document.getElementById('roomAirToken').value
        }
      };

      try {
        const res = await fetch(`/api/rooms/${roomId}/api-config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config)
        });

        const data = await res.json();
        if (data.success) {
          currentRoomApiConfig = config;
          return true;
        }
        return false;
      } catch (err) {
        console.error('Save room API config error:', err);
        return false;
      }
    }

    async function loadSensors() {
      if (!selectedRoomId) return;

      try {
        const res = await fetch(`/api/sensors?roomId=${selectedRoomId}`);
        const data = await res.json();

        if (data.success) {
          roomSensors = data.sensors;
          renderSensors();
          renderAdminSensorHotspots();
        }
      } catch (err) {
        console.error('Load sensors error:', err);
      }
    }

    function renderSensors() {
      const list = document.getElementById('sensorsList');

      if (!roomSensors || roomSensors.length === 0) {
        list.innerHTML = '<div class="empty-state"><p>Chưa có cảm biến</p></div>';
        return;
      }

      list.innerHTML = roomSensors.map((sensor, idx) => {
        if (sensor.type === 'camera') {
          // Render camera
          const statusIcons = {
            online: '🟢',
            offline: '🔴',
            maintenance: '🟡'
          };
          const statusLabels = {
            online: 'Online',
            offline: 'Offline',
            maintenance: 'Bảo trì'
          };
          const statusIcon = statusIcons[sensor.camera?.status] || '⚪';
          const statusLabel = statusLabels[sensor.camera?.status] || 'N/A';

          const isWebcam = sensor.camera?.streamUrl === 'webcam://0';
          const cameraIcon = isWebcam ? '💻' : '📹';
          const cameraType = isWebcam ? 'Webcam Laptop' : 'Camera IP';
          const streamUrl = (sensor.camera?.streamUrl || '').trim();
          const streamFallback = `<div style="margin-top: 10px; color: #7f8c8d; font-size: 12px;">${isWebcam ? 'ℹ️ Webcam xem trực tiếp trong modal cấu hình' : streamUrl ? 'ℹ️ Camera này dùng WebRTC (WHEP), bấm "Xem trực tiếp" để kiểm tra' : 'ℹ️ Chưa cấu hình stream WebRTC cho camera này'}</div>`;

          return `
            <div class="hotspot-item" style="background: #e3f2fd; border-left-color: #2196F3;">
              <h5>${cameraIcon} ${sensor.name}</h5>
              <div class="hotspot-info">
                <span><strong>Loại:</strong> ${cameraType}</span>
                <span><strong>Trạng thái:</strong> ${statusIcon} ${statusLabel}</span>
                <span><strong>Độ phân giải:</strong> ${sensor.camera?.resolution || 'N/A'}</span>
                ${isWebcam ? '' : `<span><strong>Stream:</strong> ${sensor.camera?.streamUrl ? '✅ Có' : '❌ Không'}</span>`}
              </div>
              ${streamFallback}
              <div class="hotspot-actions">
                <button class="btn btn-small" onclick="openCameraLiveStream(${idx})" style="margin-bottom: 0; background: #3498db; color: white;">🎥 Xem trực tiếp</button>
                <button class="btn btn-edit btn-small" onclick="editSensor(${idx})" style="margin-bottom: 0;">✏️ Sửa</button>
                <button class="btn btn-danger btn-small" onclick="deleteSensor(${idx})" style="margin-bottom: 0;">🗑️ Xóa</button>
              </div>
            </div>
          `;
        } else {
          // Render environment sensor
          return `
            <div class="hotspot-item" style="background: #fff3e0; border-left-color: #FF6B6B;">
              <h5>🌡️ ${sensor.name}</h5>
              <div class="hotspot-info">
                <span><strong>Nhiệt độ:</strong> ${sensor.sensors?.temperature?.value || 0}°C</span>
                <span><strong>Độ ẩm:</strong> ${sensor.sensors?.humidity?.value || 0}%</span>
                <span><strong>PM2.5:</strong> ${sensor.sensors?.pm25?.value || 0} µg/m³</span>
                <span><strong>Yaw:</strong> ${sensor.position?.yaw?.toFixed(2) || 0}° | <strong>Pitch:</strong> ${sensor.position?.pitch?.toFixed(2) || 0}°</span>
              </div>
              <div class="hotspot-actions">
                <button class="btn btn-edit btn-small" onclick="editSensor(${idx})" style="margin-bottom: 0;">✏️ Sửa</button>
                <button class="btn btn-danger btn-small" onclick="deleteSensor(${idx})" style="margin-bottom: 0;">🗑️ Xóa</button>
              </div>
            </div>
          `;
        }
      }).join('');

    }

    window.openCameraLiveStream = function (idx) {
      editSensor(idx);
      setTimeout(() => {
        if (document.getElementById('sensorType')?.value === 'camera') {
          previewCameraStream();
        }
      }, 200);
    };

    if (addSensorBtn) {
      addSensorBtn.addEventListener('click', async () => {
        editingSensorIndex = null;
        sensorModalTitle.textContent = '🌡️ Thêm Thiết bị IoT';

        // Reset form first
        sensorForm.reset();
        document.getElementById('weatherDataInfo').textContent = '';

        // Set type to environment by default (after reset)
        setTimeout(() => {
          document.getElementById('sensorType').value = 'environment';
          document.getElementById('useWebcam').checked = false;
          document.getElementById('sensorYaw').value = 0;
          document.getElementById('sensorPitch').value = 0;
          resetCameraDiagnostics();
          setCameraConnectionStatus('', '#7f8c8d');
          toggleSensorFields(); // Show environment fields by default
          setAddSensorPositionMode(false);
          console.log('✅ Modal opened, type set to:', document.getElementById('sensorType').value);
        }, 10);

        // Load room API config
        if (selectedRoomId) {
          await loadRoomApiConfig(selectedRoomId);
        }

        // Reset API config section state
        document.getElementById('apiConfigSection').style.display = 'none';
        document.getElementById('apiConfigSummary').style.display = 'block';
        document.getElementById('toggleApiConfig').textContent = '📝 Chỉnh sửa';
        setApiInputsDisabled(true);

        sensorModal.classList.add('active');
      });
    }

    function closeSensorModal() {
      sensorModal.classList.remove('active');
      editingSensorIndex = null;
      setAddSensorPositionMode(false);
      sensorForm.reset();
      document.getElementById('weatherDataInfo').textContent = '';
      document.getElementById('sensorType').value = 'environment';
      document.getElementById('useWebcam').checked = false;
      document.getElementById('sensorYaw').value = 0;
      document.getElementById('sensorPitch').value = 0;
      stopWebcam(); // Stop webcam if running
      resetCameraDiagnostics();
      setCameraConnectionStatus('', '#7f8c8d');
      toggleSensorFields(); // Reset to show environment fields
    }

    window.fetchRealWeatherData = async function () {
      const infoEl = document.getElementById('weatherDataInfo');
      const tempInput = document.getElementById('sensorTemp');
      const humidityInput = document.getElementById('sensorHumidity');
      const pm25Input = document.getElementById('sensorPM25');

      infoEl.innerHTML = '<span style="color: #3498db;">⏳ Đang lấy dữ liệu từ API thời tiết...</span>';

      try {
        if (selectedRoomId) {
          await saveRoomApiConfig(selectedRoomId);
        }
        const configPayload = {
          weatherApi: {
            provider: 'openweathermap',
            url: document.getElementById('roomWeatherUrl').value,
            apiKey: document.getElementById('roomWeatherApiKey').value,
            params: {
              lat: parseFloat(document.getElementById('roomWeatherLat').value),
              lon: parseFloat(document.getElementById('roomWeatherLon').value),
              units: 'metric'
            }
          },
          airQualityApi: {
            provider: 'waqi',
            url: document.getElementById('roomAirUrl').value,
            token: document.getElementById('roomAirToken').value
          }
        };
        // Use config from admin-rooms form directly
        const res = await fetch('/api/real-data/combined/custom', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(configPayload)
        });
        const result = await res.json();

        if (result.success && result.data) {
          tempInput.value = result.data.temperature.toFixed(1);
          humidityInput.value = Math.round(result.data.humidity);
          pm25Input.value = result.data.pm25.toFixed(1);

          const timestamp = new Date().toLocaleTimeString('vi-VN');
          const aqiInfo = result.data.aqi ? `<span style="padding: 3px 8px; border-radius: 4px; background: ${result.data.aqi.color}; color: white; font-size: 11px; font-weight: 600;">${result.data.aqi.level}</span>` : '';

          infoEl.innerHTML = `
            <div style="color: #27ae60; font-weight: 600; margin-bottom: 5px;">✅ Đã cập nhật dữ liệu thực tế (API riêng của phòng)</div>
            <div style="font-size: 11px; color: #555;">
              📍 ${result.data.location} | ⏰ ${timestamp}<br>
              🌤️ ${result.data.weather || 'N/A'} | AQI: ${aqiInfo}
            </div>
          `;
        } else {
          throw new Error('Không thể lấy dữ liệu');
        }
      } catch (err) {
        console.error('Fetch weather error:', err);
        infoEl.innerHTML = '<span style="color: #e74c3c;">❌ Lỗi: ' + err.message + '</span>';
      }
    };

    sensorForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const sensorType = document.getElementById('sensorType').value;
      console.log('📝 Sensor Type:', sensorType);

      let sensorData = {
        name: document.getElementById('sensorName').value,
        roomId: selectedRoomId,
        type: sensorType,
        position: {
          yaw: Number(document.getElementById('sensorYaw').value || 0),
          pitch: Number(document.getElementById('sensorPitch').value || 0)
        }
      };

      // Build data based on sensor type
      if (sensorType === 'environment') {
        // Save room API config first
        await saveRoomApiConfig(selectedRoomId);

        sensorData.sensors = {
          temperature: {
            value: Number(document.getElementById('sensorTemp').value),
            unit: '°C',
            min: 0,
            max: 50
          },
          humidity: {
            value: Number(document.getElementById('sensorHumidity').value),
            unit: '%',
            min: 0,
            max: 100
          },
          pm25: {
            value: Number(document.getElementById('sensorPM25').value),
            unit: 'µg/m³',
            min: 0,
            max: 500
          }
        };
      } else if (sensorType === 'camera') {
        sensorData.camera = {
          streamUrl: document.getElementById('cameraStreamUrl').value,
          snapshotUrl: document.getElementById('cameraSnapshotUrl').value,
          resolution: document.getElementById('cameraResolution').value,
          status: document.getElementById('cameraStatus').value,
          notes: document.getElementById('cameraNotes').value
        };
      }

      console.log('📤 Sending sensor data:', JSON.stringify(sensorData, null, 2));

      try {
        let url = '/api/sensors';
        let method = 'POST';

        if (editingSensorIndex !== null) {
          const sensor = roomSensors[editingSensorIndex];
          url = `/api/sensors/${sensor.id}`;
          method = 'PUT';
        }

        console.log(`🌐 ${method} ${url}`);

        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sensorData)
        });

        const data = await res.json();
        console.log('📥 Server response:', data);

        if (data.success) {
          closeSensorModal();
          await loadSensors();
          const deviceType = sensorType === 'camera' ? 'camera' : 'cảm biến';
          alert('✅ ' + (method === 'PUT' ? `Cập nhật ${deviceType} thành công!` : `Đã thêm ${deviceType}!`));
        } else {
          alert('Lỗi: ' + data.error);
        }
      } catch (err) {
        console.error(err);
        alert('Lỗi: ' + err.message);
      }
    });

    window.editSensor = async function (idx) {
      const sensor = roomSensors[idx];
      if (!sensor) return;

      editingSensorIndex = idx;
      sensorModalTitle.textContent = '✏️ Chỉnh sửa ' + (sensor.type === 'camera' ? 'Camera' : 'Cảm biến');

      document.getElementById('sensorName').value = sensor.name;
      document.getElementById('sensorType').value = sensor.type || 'environment';
      document.getElementById('sensorYaw').value = sensor.position?.yaw || 0;
      document.getElementById('sensorPitch').value = sensor.position?.pitch || 0;
      setAddSensorPositionMode(false);

      // Toggle fields based on sensor type
      toggleSensorFields();

      if (sensor.type === 'camera') {
        // Fill camera fields
        const isWebcam = sensor.camera?.streamUrl === 'webcam://0';
        document.getElementById('useWebcam').checked = isWebcam;
        document.getElementById('cameraStreamUrl').value = sensor.camera?.streamUrl || '';
        document.getElementById('cameraSnapshotUrl').value = sensor.camera?.snapshotUrl || '';
        document.getElementById('cameraResolution').value = sensor.camera?.resolution || '1920x1080';
        document.getElementById('cameraStatus').value = sensor.camera?.status || 'online';
        document.getElementById('cameraNotes').value = sensor.camera?.notes || '';

        // Toggle webcam UI if it's a webcam
        if (isWebcam) {
          toggleWebcam();
        } else {
          previewCameraStream();
        }
      } else {
        // Fill environment sensor fields
        document.getElementById('sensorTemp').value = sensor.sensors?.temperature?.value || 0;
        document.getElementById('sensorHumidity').value = sensor.sensors?.humidity?.value || 0;
        document.getElementById('sensorPM25').value = sensor.sensors?.pm25?.value || 0;
        document.getElementById('weatherDataInfo').textContent = '';

        // Load room API config
        if (selectedRoomId) {
          await loadRoomApiConfig(selectedRoomId);
        }

        // Reset API config section state
        document.getElementById('apiConfigSection').style.display = 'none';
        document.getElementById('apiConfigSummary').style.display = 'block';
        document.getElementById('toggleApiConfig').textContent = '📝 Chỉnh sửa';
        setApiInputsDisabled(true);
      }

      sensorModal.classList.add('active');
    };

    window.deleteSensor = async function (idx) {
      const sensor = roomSensors[idx];
      if (!sensor) return;

      if (!confirm(`Xóa cảm biến "${sensor.name}"?`)) return;

      try {
        const res = await fetch(`/api/sensors/${sensor.id}`, {
          method: 'DELETE'
        });

        const data = await res.json();

        if (data.success) {
          await loadSensors();
          alert('✅ Đã xóa cảm biến!');
        } else {
          alert('Lỗi: ' + data.error);
        }
      } catch (err) {
        console.error('Delete sensor error:', err);
        alert('Lỗi: ' + err.message);
      }
    };

    // Initialize
    loadRooms();
    loadApiConfig();

    // Load API config and start auto-refresh if enabled
    let apiConfig = null;

    async function loadApiConfig() {
      try {
        const res = await fetch('/api/config/api');
        const data = await res.json();
        if (data.success) {
          apiConfig = data.config;

          // Update interval if different from default
          if (apiConfig.refreshInterval && apiConfig.refreshInterval !== 10000) {
            if (autoRefreshInterval) {
              clearInterval(autoRefreshInterval);
              autoRefreshInterval = setInterval(() => {
                if (selectedRoomId && roomSensors.length > 0) {
                  refreshAllSensors();
                }
              }, apiConfig.refreshInterval);
            }
          }

          // Auto-start if configured
          if (apiConfig.autoRefresh && !isAutoRefreshEnabled) {
            startAutoRefresh();
          }
        }
      } catch (err) {
        console.error('Load API config error:', err);
      }
    }