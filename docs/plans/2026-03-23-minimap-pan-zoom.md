# Minimap Pan & Zoom Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Thêm tính năng kéo thả (pan) và phóng to/thu nhỏ (zoom bằng nút +/−) cho minimap.

**Architecture:** Bọc `#userMinimapImage` và `#userMinimapCanvas` trong `#minimapLayer` (transform layer) bên trong `#minimapViewport` (clip region). Zoom và pan state được lưu trong `minimap.js` và áp dụng qua CSS transform. Click detection được điều chỉnh theo transform hiện tại.

**Tech Stack:** Vanilla JS, CSS transform, existing minimap.js module

---

### Task 1: Cập nhật HTML — Thêm viewport/layer wrapper

**Files:**
- Modify: `src/index.html:22-25`

**Step 1: Thêm `#minimapViewport`, `#minimapLayer`, `#minimapZoomControls`**

Thay thế đoạn:
```html
<div id="userMinimapContainer">
  <img id="userMinimapImage" draggable="false">
  <canvas id="userMinimapCanvas"></canvas>
</div>
```

Thành:
```html
<div id="userMinimapContainer">
  <div id="minimapViewport">
    <div id="minimapLayer">
      <img id="userMinimapImage" draggable="false">
      <canvas id="userMinimapCanvas"></canvas>
    </div>
  </div>
  <div id="minimapZoomControls">
    <button id="minimapZoomOut" title="Thu nhỏ">−</button>
    <span id="minimapZoomLabel">100%</span>
    <button id="minimapZoomIn" title="Phóng to">+</button>
    <button id="minimapZoomReset" title="Về mặc định">↺</button>
  </div>
</div>
```

**Step 2: Commit**
```bash
git add src/index.html
git commit -m "feat(minimap): add viewport/layer wrapper and zoom controls HTML"
```

---

### Task 2: Cập nhật CSS — Viewport clip, layer transform, zoom bar

**Files:**
- Modify: `src/style.css` — block `#userMinimapContainer` và các ID liên quan (khoảng dòng 1502–1520)

**Step 1: Thay thế CSS block cho container/image/canvas**

```css
#userMinimapContainer {
  width: 240px;
  user-select: none;
}

/* Viewport: clips content, handles drag events */
#minimapViewport {
  width: 240px;
  height: 180px;
  overflow: hidden;
  position: relative;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.2);
  cursor: grab;
}

#minimapViewport:active {
  cursor: grabbing;
}

/* Transform layer — image + canvas scaled/translated here */
#minimapLayer {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
  will-change: transform;
  width: 240px;
}

#userMinimapImage {
  display: block;
  width: 100%;
  height: auto;
  user-select: none;
  pointer-events: none;
}

#userMinimapCanvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

/* Zoom controls bar */
#minimapZoomControls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  margin-top: 6px;
}

#minimapZoomControls button {
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: #fff;
  width: 26px;
  height: 26px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 15px;
  font-weight: bold;
  transition: background 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
}

#minimapZoomControls button:hover {
  background: rgba(255, 255, 255, 0.28);
}

#minimapZoomLabel {
  min-width: 38px;
  text-align: center;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.8);
  font-variant-numeric: tabular-nums;
}
```

**Step 2: Commit**
```bash
git add src/style.css
git commit -m "feat(minimap): add viewport clip, layer transform, and zoom controls CSS"
```

---

### Task 3: Cập nhật JS — Pan/zoom state và event handlers

**Files:**
- Modify: `src/features/minimap.js`

**Step 1: Thêm pan/zoom state variables (sau block state hiện tại ~dòng 17–21)**

```javascript
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
let dragStartX = 0;
let dragStartY = 0;
let panStartX = 0;
let panStartY = 0;
```

**Step 2: Thêm references đến elements mới (sau các `const` hiện tại ~dòng 9–15)**

```javascript
const minimapViewport = document.getElementById('minimapViewport');
const minimapLayer = document.getElementById('minimapLayer');
const minimapZoomIn = document.getElementById('minimapZoomIn');
const minimapZoomOut = document.getElementById('minimapZoomOut');
const minimapZoomReset = document.getElementById('minimapZoomReset');
const minimapZoomLabel = document.getElementById('minimapZoomLabel');
```

**Step 3: Thêm helper functions (trước `initMinimap`)**

```javascript
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
  // Khi zoom về 1 thì reset pan
  if (zoom === ZOOM_MIN) { panX = 0; panY = 0; }
  clampPan();
  applyTransform();
}
```

**Step 4: Thêm `initMinimapPanZoom()` và gọi trong `initMinimap()`**

```javascript
function initMinimapPanZoom() {
  if (!minimapViewport) return;

  // Zoom buttons
  minimapZoomIn?.addEventListener('click', () => setZoom(zoom + ZOOM_STEP));
  minimapZoomOut?.addEventListener('click', () => setZoom(zoom - ZOOM_STEP));
  minimapZoomReset?.addEventListener('click', () => { zoom = ZOOM_MIN; panX = 0; panY = 0; applyTransform(); });

  // Pan — mouse
  minimapViewport.addEventListener('mousedown', (e) => {
    // Chỉ pan, không click marker, khi đang drag
    isDragging = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    panStartX = panX;
    panStartY = panY;

    function onMove(me) {
      const dx = me.clientX - dragStartX;
      const dy = me.clientY - dragStartY;
      if (!isDragging && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) isDragging = true;
      if (!isDragging) return;
      panX = panStartX + dx;
      panY = panStartY + dy;
      clampPan();
      applyTransform();
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}
```

Trong `initMinimap()`, sau block minimapToggle, thêm:
```javascript
initMinimapPanZoom();
```

**Step 5: Cập nhật `handleMinimapClick` và `handleMinimapHover` để tính tọa độ theo transform**

Thay `handleMinimapClick`:
```javascript
function handleMinimapClick(e) {
  if (isDragging) return; // bỏ qua nếu đang drag
  const floor = getCurrentFloor();
  if (!floor || !floor.markers) return;

  const rect = minimapViewport.getBoundingClientRect();
  const rawX = e.clientX - rect.left;
  const rawY = e.clientY - rect.top;
  // Tính ngược tọa độ từ transform
  const x = (rawX - panX) / (rect.width * zoom);
  const y = (rawY - panY) / (rect.height * zoom);

  const clickedMarkerIndex = getMarkerAtPosition(x, y);
  if (clickedMarkerIndex !== -1) {
    const marker = floor.markers[clickedMarkerIndex];
    if (marker.roomId && env.getRoomsData()[marker.roomId]) {
      env.switchRoom(marker.roomId);
      const roomFloor = env.getRoomsData()[marker.roomId].floor || 1;
      if (roomFloor !== currentFloorId) switchFloor(roomFloor);
    }
  }
}
```

Thay `handleMinimapHover`:
```javascript
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
  minimapViewport.style.cursor = hoverIndex !== -1 ? 'pointer' : (isDragging ? 'grabbing' : 'grab');
}
```

**Step 6: Cập nhật `initUserMinimapCanvas` — đăng ký events trên `minimapViewport` thay vì canvas**

```javascript
function initUserMinimapCanvas() {
  const width = userMinimapImage.offsetWidth;
  const height = userMinimapImage.offsetHeight;

  userMinimapCanvas.width = width;
  userMinimapCanvas.height = height;
  minimapCtx = userMinimapCanvas.getContext('2d');

  // Gỡ event cũ trên canvas nếu có, dùng viewport thay thế
  minimapViewport?.addEventListener('click', handleMinimapClick);
  minimapViewport?.addEventListener('mousemove', handleMinimapHover);
}
```

**Step 7: Commit**
```bash
git add src/features/minimap.js
git commit -m "feat(minimap): add pan/zoom state, event handlers, and transform-aware click detection"
```

---

### Task 4: Verification

**Manual test — chạy dev server:**
```bash
npm run dev
```
Mở trình duyệt tại `http://localhost:5173`

**Test cases:**
1. **Nút +:** Click `+` nhiều lần → label tăng từ 100% lên 125%, 150%... 300%; bản đồ phóng to
2. **Nút −:** Click `−` → label giảm; không xuống dưới 100%
3. **Nút ↺:** Sau khi zoom, click `↺` → về 100%, bản đồ về vị trí gốc
4. **Pan khi zoom 1×:** Kéo → không di chuyển (không có gì để pan khi zoom=1)
5. **Pan khi zoom > 1×:** Zoom lên 200%, kéo → ảnh di chuyển trong khung, không trượt ra ngoài
6. **Click marker:** Zoom 200%, pan sang phải, click vào marker → chuyển phòng đúng
7. **Drag vs click:** Kéo nhẹ (< 3px) → vẫn được tính là click marker
