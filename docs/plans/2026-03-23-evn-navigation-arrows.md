# EVN-Style Navigation Arrows — Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Thay thế hotspot navigation `.hotspot` bằng mũi tên chevron kiểu EVN — nằm trên sàn, màu trắng semi-transparent, có animation pulse/glow.

**Architecture:** Tất cả thay đổi trong CSS (`style.css`) và JS (`main.js`) — không thêm file mới. Animation thuần CSS với `@keyframes`. Mũi tên được render bằng CSS (Unicode `❯❯` hoặc SVG inline), không cần file ảnh.

**Tech Stack:** Vanilla CSS, CSS keyframes animation, existing Marzipano hotspot system

---

## Visual Design (dựa trên phân tích EVN)

| Thuộc tính | Giá trị |
|---|---|
| **Shape** | Hai chevron `❯❯` chồng lên nhau |
| **Màu** | Trắng (`#fff`) với opacity 0.85 |
| **Background** | Circle semi-transparent trắng/glowing |
| **Shadow** | `drop-shadow` trắng blur |
| **Animation** | Pulse up-down + fade |
| **Size** | ~60px |
| **Hover** | Scale up + glow mạnh hơn |

---

### Task 1: Thêm CSS `.hotspot` navigation arrow style

**Files:**
- Modify: `src/style.css` — thêm vào cuối file (sau block SENSOR HOTSPOT hoặc cuối cùng)

**Step 1: Thêm CSS**

```css
/* ===== NAVIGATION HOTSPOT — EVN style arrow ===== */
.hotspot {
  position: relative;
  width: 60px;
  height: 60px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  /* Remove default border/bg from Marzipano */
  background: transparent;
  border: none;
  outline: none;
}

/* Vòng tròn nền mờ */
.hotspot::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.18);
  border: 2px solid rgba(255, 255, 255, 0.5);
  box-shadow:
    0 0 12px rgba(255, 255, 255, 0.4),
    0 0 30px rgba(255, 255, 255, 0.2);
  animation: hotspot-pulse 2s ease-in-out infinite;
  transition: all 0.25s ease;
}

/* Icon: custom iconUrl hoặc default chevron */
.hotspot::after {
  content: '';
  display: block;
  width: 28px;
  height: 28px;
  background-image: var(--hotspot-icon, none);
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
  position: relative;
  z-index: 1;
  filter: drop-shadow(0 0 4px rgba(255,255,255,0.8));
  animation: hotspot-float 2s ease-in-out infinite;
}

/* Default: nếu không có iconUrl thì dùng chevron CSS */
.hotspot:not([style*="--hotspot-icon"])::after {
  background-image: none;
  width: 0;
  height: 0;
}

/* Chevron mũi tên đôi kiểu EVN */
.hotspot-arrow {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  z-index: 1;
  animation: hotspot-float 2s ease-in-out infinite;
}

.hotspot-arrow span {
  display: block;
  width: 24px;
  height: 12px;
  border-right: 3px solid rgba(255, 255, 255, 0.95);
  border-bottom: 3px solid rgba(255, 255, 255, 0.95);
  transform: rotate(-45deg);
  filter: drop-shadow(0 0 3px rgba(255, 255, 255, 0.8));
}

.hotspot-arrow span:first-child {
  opacity: 0.6;
  margin-top: -4px;
}

/* Hover effect */
.hotspot:hover::before {
  background: rgba(255, 255, 255, 0.32);
  box-shadow:
    0 0 20px rgba(255, 255, 255, 0.7),
    0 0 50px rgba(255, 255, 255, 0.3);
  transform: scale(1.15);
}

.hotspot:hover .hotspot-arrow {
  animation: none;
  transform: translateY(-4px);
}

/* Animations */
@keyframes hotspot-pulse {
  0%, 100% {
    box-shadow:
      0 0 12px rgba(255, 255, 255, 0.4),
      0 0 30px rgba(255, 255, 255, 0.2);
    opacity: 1;
  }
  50% {
    box-shadow:
      0 0 20px rgba(255, 255, 255, 0.7),
      0 0 50px rgba(255, 255, 255, 0.35);
    opacity: 0.85;
  }
}

@keyframes hotspot-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
}

/* Highlighted state (used by autotour) */
.hotspot.hotspot-highlight::before {
  background: rgba(255, 215, 0, 0.3);
  border-color: rgba(255, 215, 0, 0.8);
  box-shadow:
    0 0 20px rgba(255, 215, 0, 0.8),
    0 0 40px rgba(255, 215, 0, 0.4);
  animation: pulse-highlight 1s ease-in-out infinite;
}
```

**Step 2: Commit**
```bash
git add src/style.css
git commit -m "feat(hotspot): add EVN-style navigation arrow CSS"
```

---

### Task 2: Cập nhật JS — inject `.hotspot-arrow` HTML vào mỗi hotspot

**Files:**
- Modify: `src/main.js` — hàm `addHotspots()`, block `hotspots.forEach` (dòng ~157-181)

**Step 1: Thêm chevron HTML vào hotspot element**

Thay đoạn:
```javascript
hotspots.forEach(hs => {
  const el = document.createElement("div");
  el.className = "hotspot";
  
  const yawRad = degToRad(hs.yaw);
  const pitchRad = degToRad(-hs.pitch);
  
  if (hs.iconUrl && typeof hs.iconUrl === "string") {
    const normalizedIconUrl = hs.iconUrl.trim();
    if (normalizedIconUrl) {
      const safeIconUrl = normalizedIconUrl.replace(/"/g, "\\\"");
      el.style.setProperty('--hotspot-icon', `url("${safeIconUrl}")`);
    }
  }
  
  el.onclick = (e) => {
    e.stopPropagation();
    switchRoom(hs.target);
  };

  container.createHotspot(el, {
    yaw: yawRad,
    pitch: pitchRad
  });
});
```

Thành:
```javascript
hotspots.forEach(hs => {
  const el = document.createElement("div");
  el.className = "hotspot";

  const yawRad = degToRad(hs.yaw);
  const pitchRad = degToRad(-hs.pitch);

  if (hs.iconUrl && typeof hs.iconUrl === "string") {
    const normalizedIconUrl = hs.iconUrl.trim();
    if (normalizedIconUrl) {
      const safeIconUrl = normalizedIconUrl.replace(/"/g, "\\\"");
      el.style.setProperty('--hotspot-icon', `url("${safeIconUrl}")`);
    }
  } else {
    // Default EVN-style double chevron arrow
    const arrow = document.createElement("div");
    arrow.className = "hotspot-arrow";
    arrow.innerHTML = "<span></span><span></span>";
    el.appendChild(arrow);
  }

  el.onclick = (e) => {
    e.stopPropagation();
    switchRoom(hs.target);
  };

  container.createHotspot(el, {
    yaw: yawRad,
    pitch: pitchRad
  });
});
```

**Step 2: Commit**
```bash
git add src/main.js
git commit -m "feat(hotspot): inject EVN-style chevron arrow into navigation hotspots"
```

---

### Task 3: Verification

**Chạy dev server:**
```bash
npm run dev
```

Mở `http://localhost:5173` và kiểm tra:
1. **Arrow shape:** Hotspot navigation hiển thị 2 chevron `>>` màu trắng
2. **Pulse animation:** Vòng tròn nền pulse sáng/mờ mỗi 2 giây
3. **Float animation:** Chevron lơ lửng lên/xuống nhẹ
4. **Hover:** Scale up + glow mạnh hơn khi hover
5. **Click:** Vẫn chuyển phòng đúng
6. **Custom icon:** Nếu hotspot có `iconUrl`, hiển thị icon đó thay vì chevron
