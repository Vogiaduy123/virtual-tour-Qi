# MainJS Refactoring To Vite Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Chuyển đổi hệ thống frontend từ file script tĩnh cũ trong `public/main.js` sang cấu trúc sử dụng Vite bundler với ES Modules đễ dễ tách file và bảo trì.

**Architecture:** Sử dụng Vite làm tool build, cấu hình `vite.config.js` server proxy sang `localhost:3000` cho API/SSE. Hệ frontend mới sẽ nằm trong `src/`, và khi build ra sẽ cho vào `dist/`.

**Tech Stack:** Vanilla JavaScript (ES Modules), Vite, Express.

---

### Task 1: Thiết lập Vite và chuyển cấu trúc frontend cơ bản

**Files:**
- Modify: `package.json`
- Create: `vite.config.js`
- Create/Move: `src/index.html`, `src/style.css`, `src/main.js`
- Modify: `src/index.html` (thay `<script src="main.js">` thành `<script type="module" src="/main.js">`)

**Step 1: Cài đặt và cấu hình package.json**

Run: `npm install --save-dev vite`
Expected: Cài đặt thành công.

Run: Chỉnh sửa package.json để thêm scripts: `"dev:ui": "vite"` và `"build:ui": "vite build"`.
Expected: `package.json` có scripts mới.

**Step 2: Khởi tạo vite.config.js**

```javascript
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'src',
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/events': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000'
    }
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/index.html')
      }
    }
  }
});
```

**Step 3: Di chuyển thư mục frontend sang thư mục `src/`**

Run: `mkdir -p src; mv public/index.html src/; mv public/style.css src/; mv public/main.js src/`
Expected: Các file đã nằm trong `src/`.

**Step 4: Cập nhật index.html để dùng Vite module**

```html
<!-- In src/index.html, find the <script src="main.js"></script> -->
<script type="module" src="/main.js"></script>
```

**Step 5: Chỉnh sửa server.js để hỗ trợ phục vụ trang từ dist**

Sửa logic server phục vụ trang '/' để check nếu có `dist/index.html` thì serve, nếu chưa build thì có thể nhắc user chạy vite. Đồng thời thêm thư mục `dist` vào middlewares tĩnh `app.use(express.static(path.join(__dirname, 'dist')));`. Đoạn này sẽ được handle sau bằng tay.
*(Task này ta tập trung config Vite chạy thành công trước)*

**Step 6: Commit**

```bash
git add src/ package.json vite.config.js
git commit -m "chore: setup vite bundler and restructure frontend to src/"
```
---

### Task 2: Tách module cơ bản (Utils và Config)

**Files:**
- Create: `src/core/utils.js`
- Modify: `src/main.js`

**Step 1: Tách hàm degToRad, radToDeg, parseJsonResponse**

Tạo nội dung `src/core/utils.js`:
```javascript
export function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad) {
  return (rad * 180) / Math.PI;
}

export async function parseJsonResponse(res) {
  const raw = await res.text();
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    const snippet = String(raw || "").slice(0, 180).replace(/\s+/g, " ").trim();
    const prefix = snippet ? `: ${snippet}` : "";
    throw new Error(`Phản hồi API không hợp lệ (HTTP ${res.status})${prefix}`);
  }
}
```

**Step 2: Cập nhật main.js để import utils**

Thêm lên đầu `src/main.js`:
```javascript
import { degToRad, radToDeg, parseJsonResponse } from './core/utils.js';
```
Và xoá phần thân của 3 hàm này trong file `main.js`.

**Step 3: Test trên trình duyệt**

Run: `npx vite --port 5173`
Expected: Server Vite khởi chạy, app hoạt động bình thường qua proxy. Không thấy lỗi TypeError do thiếu các helper trên console.

**Step 4: Commit**

```bash
git add src/core/utils.js src/main.js
git commit -m "refactor: extract utils to module"
```

---

### Task 3: Tách module API và Data Loaders

**Files:**
- Create: `src/core/api.js`
- Modify: `src/main.js`

**Step 1: Tạo module API mới**

Tạo nội dung `src/core/api.js`:
```javascript
import { parseJsonResponse } from './utils.js';

export async function fetchRooms() {
  const res = await fetch("/api/rooms");
  return parseJsonResponse(res);
}

export async function fetchMinimap() {
  const res = await fetch("/api/admin/minimap");
  return parseJsonResponse(res);
}

export async function fetchSensors() {
  const res = await fetch("/api/sensors");
  return parseJsonResponse(res);
}
```

**Step 2: Sửa main.js để sử dụng module API**

Trong `src/main.js`, thêm import:
```javascript
import { fetchRooms, fetchMinimap, fetchSensors } from './core/api.js';
```

Và tìm các đoạn `fetch("/api/...")` trong hàm `initApp()`, `loadMinimap()`, `loadSensors()` thay thế bằng các hàm Vừa tạo.
*(Lưu ý: hiện tại `loadMinimap` và `loadSensors` đang gọi fetch trực tiếp ở đâu đó trong main.js, cần tìm file và thay thế).*

**Step 3: Test trên trình duyệt**

Run: `npx vite --port 5173`
Expected: App vẫn load phòng và dữ liệu bình thường, kiểm tra Network tab không có API nào bị fail (HTTP 4xx/5xx).

**Step 4: Commit**

```bash
git add src/core/api.js src/main.js
git commit -m "refactor: extract api calls to module"
```

---

### Task 4: Tách module Minimap

**Files:**
- Create: `src/features/minimap.js`
- Modify: `src/main.js`

**Step 1: Khởi tạo module Minimap**

Tạo nội dung `src/features/minimap.js`:
Cắt tất cả logic liên quan đến Minimap từ `main.js` sang đây bao gồm các biến trạng thái (`minimapData`, `isMinimapCollapsed`, `currentFloorId`), các DOM element (`minimapWrapper`, `minimapContent`, `minimapToggle`, `userMinimapCanvas`, `userMinimapImage`, `minimapCtx`), và các hàm xử lý (`getCurrentFloor`, `getCurrentRoomFloor`, `renderFloorTabs`, `switchFloor`, `initUserMinimapCanvas`, `handleMinimapClick`, `handleMinimapHover`, `drawUserMinimap`, `getMarkerAtPosition`).

_Lưu ý:_ Các hàm này có thể cần sử dụng `roomsData`, `currentRoomId`, và hàm `switchRoom` từ file chính. Chúng ta sẽ cần inject các dependencies này vào bằng cách truyền qua tham số hoặc setup callback, ví dụ:
```javascript
let deps = {
  getRoomsData: () => ({}),
  getCurrentRoomId: () => null,
  switchRoom: (id) => {}
};

export function initMinimap(dependencies) {
  deps = { ...deps, ...dependencies };
  // Gắn event listeners cho DOM
}

export function loadMinimapData(data, startRoomFloor) {
  minimapData = data;
  currentFloorId = minimapData.floors.find(f => f.id === startRoomFloor)?.id || minimapData.floors[0].id;
  // setup UI...
}
//...
```

**Step 2: Cập nhật main.js để sử dụng module Minimap**

Trong `main.js`:
1. Xoá hết toàn bộ code Minimap cũ.
2. Import `initMinimap`, `loadMinimapData`, `drawUserMinimap` (nếu cần re-draw khi update view).
3. Update đoạn load minimap:
```javascript
import { fetchMinimap } from './core/api.js';
import { initMinimap, loadMinimapData, drawUserMinimap } from './features/minimap.js';

// Setup dependencies
initMinimap({
  getRoomsData: () => roomsData,
  getCurrentRoomId: () => currentRoomId,
  switchRoom: switchRoom
});

async function loadMinimap() {
  try {
    const data = await fetchMinimap();
    if (data.success && data.minimap && data.minimap.floors && data.minimap.floors.length > 0) {
      const room = roomsData[currentRoomId] || {};
      const roomFloor = room.floor || 1;
      loadMinimapData(data.minimap, roomFloor);
    }
  } catch (err) {
    console.error("Lỗi load minimap:", err);
  }
}
```

Và thêm dòng gọi `drawUserMinimap(yaw)` trong logic event listener của `pano` khi thay đổi góc nhìn `viewChange` để vẽ biểu tượng góc nhìn.

**Step 3: Test trên trình duyệt**

Run: `npm run dev:ui` (nếu chưa chạy) hoặc kiểm tra trên giao diện `http://localhost:5173/`.
Expected: Minimap tải bình thường, click vào hotspot trên minimap nhảy được sang phòng khác, thu gọn/mở rộng minimap hoạt động tốt, và biểu tượng rẻ quạt góc nhìn xoay đúng hướng khi xoay camera.

**Step 4: Commit**

```bash
git add src/features/minimap.js src/main.js
git commit -m "refactor: extract minimap feature"
```

---

### Task 5: Tách module Cảm biến (Sensors)

**Files:**
- Create: `src/features/sensors.js`
- Modify: `src/main.js`

**Step 1: Khởi tạo module Sensors**

Tạo nội dung `src/features/sensors.js`:
Cắt tất cả logic liên quan đến Cảm biến từ `main.js` sang đây bao gồm các biến trạng thái (`sensorsData`, `sensorUpdateInterval`), các hàm xử lý (`loadSensors`, `updateSensorWidget`, `startSensorUpdates`, `stopSensorUpdates`, `getSensorData`, `addSensorHotspots`).

_Lưu ý:_ Các hàm này có thể cần sử dụng `fetchSensors` từ api module, biến `currentRoomId`, hàm `scene.hotspotContainer`, và hàm `degToRad` từ `utils`. Chúng ta sẽ inject các phụ thuộc này qua `initSensors`.
```javascript
import { fetchSensors } from '../core/api.js';
import { degToRad } from '../core/utils.js';

let env = {
  getCurrentRoomId: () => null,
  getHotspotContainer: () => null,
  getRoomsData: () => ({})
};
export function initSensors(dependencies) {
  env = { ...env, ...dependencies };
}
export async function loadSensors() { /* ... */ }
// ... các logic widget và hotspot
```

**Step 2: Cập nhật main.js để sử dụng module Sensors**

Xoá khối biến và hàm Sensors trong `main.js`.
Import `initSensors`, `loadSensors`, `startSensorUpdates`, `stopSensorUpdates`, `addSensorHotspots` vào `main.js` và khởi tạo. Thêm lệnh `addSensorHotspots()` vào hàm `addHotspots` của room.

**Step 3: Test trên trình duyệt**

Run: `npm run dev:ui`
Expected: Data môi trường và các hotspot cảm biến tải bình thường và hiển thị đúng thông số.

**Step 4: Commit**

```bash
git add src/features/sensors.js src/main.js
git commit -m "refactor: extract sensors feature"
```
