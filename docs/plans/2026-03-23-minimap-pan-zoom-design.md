# Minimap Nâng Cao — Pan & Zoom: Design Document

**Date:** 2026-03-23  
**Feature:** Bản đồ Minimap với kéo thả (pan) và phóng to/thu nhỏ (zoom)

---

## Mục tiêu

Nâng cấp minimap hiện tại để người dùng có thể:
1. **Kéo thả (pan)** — drag bằng chuột để di chuyển trong bản đồ
2. **Phóng to/thu nhỏ (zoom)** — dùng nút +/− và reset

## Quyết định Thiết kế

| Quyết định | Lựa chọn | Lý do |
|---|---|---|
| Kích thước khung | Giữ 240px | Minimap là widget phụ, không chiếm panorama |
| Cách zoom | Nút +/− + reset ↺ | Đơn giản, hoạt động trên mobile và desktop |
| Zoom range | 1× đến 3× (bước 0.25×) | Đủ chi tiết mà không mất định hướng |
| Scroll wheel | Không dùng | Tránh conflict với scroll trang |
| Pinch mobile | Không dùng | Giảm độ phức tạp, nút đủ dùng |

## DOM Structure

```
#userMinimapContainer          (unchanged outer, overflow: hidden)
  └── #minimapViewport         (NEW: 240×180px clip region, cursor: grab)
        └── #minimapLayer      (NEW: transform: translate(panX,panY) scale(zoom))
              ├── #userMinimapImage
              └── #userMinimapCanvas
  └── #minimapZoomControls     (NEW: [−] [100%] [+] [↺])
```

## State mới trong minimap.js

```javascript
let zoom = 1;        // range: 1 – 3
let panX = 0;        // pixels, clamped
let panY = 0;        // pixels, clamped
let isDragging = false;
let dragStartX = 0, dragStartY = 0;
let panStartX = 0, panStartY = 0;
```

## Event Handlers mới

- `mousedown` trên `#minimapViewport` → bắt đầu drag
- `mousemove` trên `document` → cập nhật pan (khi đang drag)
- `mouseup` / `mouseleave` → kết thúc drag
- Click `#minimapZoomIn` → zoom += 0.25, clamp max 3
- Click `#minimapZoomOut` → zoom -= 0.25, clamp min 1
- Click `#minimapZoomReset` → zoom = 1, pan = 0,0

## Tọa độ Click (quan trọng)

Khi user click vào marker, tọa độ cần được điều chỉnh ngược lại theo transform:
```javascript
// Trước (không có zoom):
const x = (e.clientX - rect.left) / rect.width;

// Sau (có zoom/pan):
const rawX = e.clientX - rect.left;
const rawY = e.clientY - rect.top;
const x = (rawX - panX) / (rect.width * zoom);
const y = (rawY - panY) / (rect.height * zoom);
```

## Clamp Pan

Pan phải bị giới hạn để ảnh không trượt khỏi viewport:
```javascript
function clampPan() {
  const viewW = 240, viewH = 180;
  const layerW = viewW * zoom;
  const layerH = viewH * zoom;
  panX = Math.min(0, Math.max(panX, viewW - layerW));
  panY = Math.min(0, Math.max(panY, viewH - layerH));
}
```
