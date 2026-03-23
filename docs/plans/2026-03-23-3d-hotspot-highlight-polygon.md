# 3D Hotspot Blue Highlight Polygon — Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Khi admin thêm hotspot loại 3D, cho phép vẽ polygon bao quanh vật thể trên panorama; polygon này sẽ hiển thị trong tour với màu xanh + viền trắng phát sáng giống AR highlight bảo tàng.

**Architecture:** (1) Admin panel (`admin-rooms.html`) thêm UI vẽ polygon — click từng điểm trên Pannellum viewer → lưu `highlightPolygon: [[yaw,pitch],...]` vào media hotspot data. (2) Frontend (`media-overlay.js` + `main.js`) render polygon bằng `<svg>` Marzipano hotspot anchor ở centroid. (3) Không cần file ảnh mask — tất cả thuần CSS/SVG.

**Tech Stack:** Vanilla JS, SVG, Pannellum (admin), Marzipano (tour frontend), existing `/api/admin/rooms/:id/media-hotspots` API

---

## Task 1: Thêm UI vẽ polygon vào media hotspot modal (admin)

**Files:**
- Modify: `public/admin-rooms.html` — dòng 970 (sau field mediaPitch), thêm polygon section

**Step 1: Thêm state variable và polygon section HTML**

Sau dòng `let editingMediaHotspotIndex = null;` (dòng ~990), thêm:
```javascript
let polygonPoints = []; // [[yaw, pitch], ...]
let isPolygonDrawMode = false;
```

Trong HTML form `#mediaHotspotForm` (sau field `mediaPitch` ~dòng 970, trước nút lưu), thêm:
```html
<!-- Polygon highlight section — only shown for 3d type -->
<div id="polygonHighlightSection" style="display:none; margin-bottom:16px;">
  <label style="display:block; margin-bottom:6px; font-weight:600; color:#2c3e50; font-size:12px; text-transform:uppercase; letter-spacing:0.5px;">
    🔷 Vùng Highlight 3D (tùy chọn)
  </label>
  <div style="background:#f0f7ff; border:1px solid #3498db; border-radius:6px; padding:12px;">
    <p style="font-size:12px; color:#555; margin-bottom:10px;">
      Vẽ vùng bao quanh vật thể trên ảnh 360 để tạo highlight màu xanh trong tour.
    </p>
    <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px;">
      <button type="button" id="polygonDrawBtn" onclick="togglePolygonDrawMode()"
        style="padding:7px 12px; background:#3498db; color:white; border:none; border-radius:5px; font-size:12px; font-weight:600; cursor:pointer;">
        ✏️ Bắt đầu vẽ
      </button>
      <button type="button" onclick="undoPolygonPoint()"
        style="padding:7px 12px; background:#f39c12; color:white; border:none; border-radius:5px; font-size:12px; cursor:pointer;">
        ↩️ Xóa điểm cuối
      </button>
      <button type="button" onclick="clearPolygon()"
        style="padding:7px 12px; background:#e74c3c; color:white; border:none; border-radius:5px; font-size:12px; cursor:pointer;">
        🗑️ Xóa tất cả
      </button>
    </div>
    <div id="polygonStatus" style="font-size:11px; color:#3498db; min-height:16px;"></div>
  </div>
</div>
```

**Step 2: Thêm JS cho polygon drawing**

Thêm sau block `/* ===== MEDIA HOTSPOT FUNCTIONS ===== */`:
```javascript
/* ===== POLYGON DRAWING ===== */
function togglePolygonDrawMode() {
  isPolygonDrawMode = !isPolygonDrawMode;
  const btn = document.getElementById('polygonDrawBtn');
  const status = document.getElementById('polygonStatus');
  if (isPolygonDrawMode) {
    btn.textContent = '⏹️ Dừng vẽ';
    btn.style.background = '#e74c3c';
    status.textContent = `✏️ Click trên ảnh 360 để đánh điểm. Đã có ${polygonPoints.length} điểm.`;
    // Override mousedown on panoramaViewer for polygon mode
    addPolygonClickListener();
  } else {
    btn.textContent = '✏️ Bắt đầu vẽ';
    btn.style.background = '#3498db';
    status.textContent = polygonPoints.length > 0 ? `✅ ${polygonPoints.length} điểm đã lưu.` : '';
    removePolygonClickListener();
  }
}
window.togglePolygonDrawMode = togglePolygonDrawMode;

function addPolygonClickListener() {
  // Pannellum's mousedown event is already set up. We hook into it by checking isPolygonDrawMode.
  // The existing panoramaViewer.on('mousedown') checks addHotspotMode / addMediaMode / addSensorPositionMode.
  // We already added our check in Task 2 inside that handler.
}

function removePolygonClickListener() {}

function handlePolygonClick(pitch, yaw) {
  polygonPoints.push([yaw, pitch]);
  const status = document.getElementById('polygonStatus');
  if (status) status.textContent = `✏️ ${polygonPoints.length} điểm. Tiếp tục click để thêm.`;
  // Render preview on Pannellum
  updatePolygonPreviewHotspots();
}

function updatePolygonPreviewHotspots() {
  if (!panoramaViewer) return;
  // Remove old preview markers
  for (let i = 0; i < 50; i++) {
    try { panoramaViewer.removeHotSpot(`poly-pt-${i}`); } catch {}
  }
  polygonPoints.forEach(([yaw, pitch], i) => {
    try {
      panoramaViewer.addHotSpot({
        id: `poly-pt-${i}`,
        pitch,
        yaw,
        type: 'info',
        text: `${i+1}`,
        cssClass: 'custom-hotspot',
        createTooltipFunc: function(div) {
          div.innerHTML = `<span style="background:#00aaff;color:white;padding:3px 7px;border-radius:50%;font-size:11px;font-weight:bold;">${i+1}</span>`;
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
```

**Step 3: Hiện polygon section khi chọn loại 3d**

Trong hàm `updateMediaUploadHint()`, thêm logic show/hide:
```javascript
// Sau dòng "Hide both sections first":
const polySection = document.getElementById('polygonHighlightSection');
if (polySection) polySection.style.display = (type === '3d') ? 'block' : 'none';
```

**Step 4: Tích hợp polygon click vào mousedown handler Pannellum**

Trong block existing `panoramaViewer.on('mousedown', ...)` (dòng ~1819), thêm check TRƯỚC các mode khác:
```javascript
// Polygon drawing mode — check before other modes
if (isPolygonDrawMode) {
  handlePolygonClick(pitch, yaw);
  return;
}
```

**Step 5: Lưu polygon vào mediaHotspot data khi submit**

Trong `mediaForm.addEventListener('submit', ...)`, trong object `mediaHotspot` (dòng ~2050), thêm:
```javascript
const mediaHotspot = {
  yaw: ...,
  pitch: ...,
  title: ...,
  description: ...,
  mediaUrl: mediaUrl,
  mediaType: mediaType,
  // NEW:
  highlightPolygon: (mediaType === '3d' && polygonPoints.length >= 3) ? polygonPoints : null
};
```

**Step 6: Load polygon khi edit media hotspot**

Trong `editMediaHotspot(idx)`, thêm sau load các field:
```javascript
const media = room.mediaHotspots[idx];
polygonPoints = (media.highlightPolygon && Array.isArray(media.highlightPolygon)) ? [...media.highlightPolygon] : [];
const polySection = document.getElementById('polygonHighlightSection');
if (polySection) polySection.style.display = (media.mediaType === '3d') ? 'block' : 'none';
const status = document.getElementById('polygonStatus');
if (status && polygonPoints.length > 0) status.textContent = `✅ ${polygonPoints.length} điểm đã lưu.`;
updatePolygonPreviewHotspots();
```

**Step 7: Reset polygon khi đóng modal**

Trong `closeMediaHotspotModal()`, thêm:
```javascript
polygonPoints = [];
isPolygonDrawMode = false;
const polyBtn = document.getElementById('polygonDrawBtn');
if (polyBtn) { polyBtn.textContent = '✏️ Bắt đầu vẽ'; polyBtn.style.background = '#3498db'; }
const status = document.getElementById('polygonStatus');
if (status) status.textContent = '';
```

**Step 8: Commit**
```bash
git add public/admin-rooms.html
git commit -m "feat(admin): add polygon drawing tool for 3D media hotspot highlight"
```

---

## Task 2: Render polygon highlight trong tour (frontend)

**Files:**
- Modify: `src/features/media-overlay.js` — hàm `createMediaHotspotElement` (dòng ~651), export `MEDIA_ICONS`
- Modify: `src/main.js` — hàm `addHotspots` (dòng ~170)

### 2a: Thêm hàm render polygon hotspot element

Trong `media-overlay.js`, thêm hàm mới export:
```javascript
/**
 * Creates a 3D highlight polygon hotspot element.
 * The SVG viewBox is centered at (500,500) to allow points to extend in any direction.
 * Points are [[yaw,pitch],...] relative to anchorYaw/anchorPitch (the centroid).
 * Scale: 1 degree ≈ 10px in SVG space.
 */
export function create3DHighlightElement(media) {
  const points = media.highlightPolygon; // [[yaw,pitch],...]
  if (!points || points.length < 3) return null;

  // Compute centroid in yaw/pitch space
  const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
  const cy = points.reduce((s, p) => s + p[1], 0) / points.length;

  const SCALE = 10; // px per degree
  const OFFSET = 500; // SVG center
  const SIZE = 1000;

  const svgPoints = points.map(([y, p]) => {
    const sx = OFFSET + (y - cx) * SCALE;
    const sy = OFFSET - (p - cy) * SCALE; // pitch inverted in screen
    return `${sx},${sy}`;
  }).join(' ');

  const el = document.createElement('div');
  el.className = 'highlight-3d-hotspot';
  el.style.cssText = 'position:absolute;pointer-events:none;';

  el.innerHTML = `
    <svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"
         xmlns="http://www.w3.org/2000/svg"
         style="position:absolute;left:-${OFFSET}px;top:-${OFFSET}px;overflow:visible;">
      <defs>
        <filter id="glow-3d">
          <feGaussianBlur stdDeviation="4" result="blur"/>
          <feComposite in="SourceGraphic" in2="blur" operator="over"/>
        </filter>
      </defs>
      <!-- Fill -->
      <polygon points="${svgPoints}"
        fill="rgba(30,120,255,0.28)"
        stroke="rgba(255,255,255,0.9)"
        stroke-width="3"
        stroke-linejoin="round"
        filter="url(#glow-3d)"
        class="highlight-3d-polygon"/>
      <!-- Outer glow stroke -->
      <polygon points="${svgPoints}"
        fill="none"
        stroke="rgba(60,160,255,0.5)"
        stroke-width="8"
        stroke-linejoin="round"
        opacity="0.6"/>
    </svg>
  `;

  return { el, anchorYaw: cx, anchorPitch: cy };
}
```

**Thêm CSS animation trong `src/style.css`:**
```css
/* ===== 3D HIGHLIGHT POLYGON ===== */
@keyframes highlight-3d-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.65; }
}

.highlight-3d-polygon {
  animation: highlight-3d-pulse 2.5s ease-in-out infinite;
}
```

### 2b: Render polygon hotspot trong main.js

Trong `addHotspots()` trong `src/main.js`, sau vòng `mediaHotspots.forEach(...)` (sau dòng ~221), thêm:
```javascript
// 3D highlight polygons
mediaHotspots.forEach(media => {
  if (media.mediaType !== '3d' || !media.highlightPolygon || media.highlightPolygon.length < 3) return;

  const result = create3DHighlightElement(media);
  if (!result) return;
  const { el, anchorYaw, anchorPitch } = result;

  container.createHotspot(el, {
    yaw: degToRad(anchorYaw),
    pitch: degToRad(-anchorPitch)
  });
});
```

**Import thêm:**
```javascript
import { ..., create3DHighlightElement } from './features/media-overlay.js';
```

**Step: Commit**
```bash
git add src/features/media-overlay.js src/main.js src/style.css
git commit -m "feat(tour): render 3D blue highlight polygon for 3d media hotspots"
```

---

## Task 3: Đổi icon 3d từ 🎮 thành 🧊 (bonus)

**Files:**
- Modify: `src/features/media-overlay.js` dòng 1
- Modify: `public/admin-rooms.html` dòng ~939 và ~1791

**Step 1:**
Trong `media-overlay.js` dòng 1, đổi `"3d": "🎮"` thành `"3d": "🧊"`.

Trong `admin-rooms.html`:
- Dòng ~939: `<option value="3d">🎮 Mô hình 3D</option>` → `<option value="3d">🧊 Mô hình 3D</option>`
- Dòng ~1791: `'3d': '🎮'` → `'3d': '🧊'`

**Step 2: Commit**
```bash
git add src/features/media-overlay.js public/admin-rooms.html
git commit -m "feat(ui): change 3d hotspot icon from game controller to cube"
```

---

## Verification Plan

### Manual Verification (No automated tests for this UI feature)

**Setup:** Dev server đang chạy tại `http://localhost:5173`

1. Mở `http://localhost:5173/admin-rooms.html`
2. Chọn phòng có panorama → Click **📁 Tư liệu**
3. Chọn loại = `🧊 Mô hình 3D` → Xác nhận section **Vùng Highlight 3D** xuất hiện
4. Click **✏️ Bắt đầu vẽ** → Click ≥3 điểm trên ảnh panorama → Thấy marker số xuất hiện trên ảnh
5. Upload file .glb → Click **💾 Lưu**
6. Mở `http://localhost:5173` → Vào phòng đó → Xác nhận:
   - Hotspot icon hiện `🧊` thay vì `🎮`
   - Polygon màu xanh pulse phủ lên vúng vật thể
   - Click hotspot → Modal 3D mở ra bình thường
