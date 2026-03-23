let viewerInstance = null;

export const MIN_FOV = 45 * Math.PI / 180;
export const MAX_FOV = 85 * Math.PI / 180;

let env = {
  getCurrentRoomId: () => null,
  getScene: (id) => null
};

export function initViewer(panoElement, dependencies) {
  env = { ...env, ...dependencies };
  viewerInstance = new Marzipano.Viewer(panoElement);
  setupDeviceMode();
  return viewerInstance;
}

export function getViewer() {
  return viewerInstance;
}

export function setupDeviceMode() {
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
}

export function initZoomControl() {
  const zoomSlider = document.getElementById("zoomSlider");
  const zoomValue = document.getElementById("zoomValue");
  const pano = document.getElementById("pano");
  const viewer = getViewer();
  
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
      
      const currentRoomId = env.getCurrentRoomId();
      if (!viewer || !currentRoomId) return;
      
      const scene = env.getScene(currentRoomId);
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
export function updateSceneZoom(fov) {
  const viewer = getViewer();
  const currentRoomId = env.getCurrentRoomId();
  if (viewer && currentRoomId) {
    const scene = env.getScene(currentRoomId);
    if (scene && scene.view()) {
      scene.view().setFov(fov);
    }
  }
}

// Animation mượt để chuyển FOV
let fovAnimFrame = null;
export function animateFovTo(targetFov) {
  const viewer = getViewer();
  const currentRoomId = env.getCurrentRoomId();
  if (!viewer || !currentRoomId) return;
  
  const scene = env.getScene(currentRoomId);
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
