# Kế hoạch Refactor `main.js` sử dụng Vite Bundler

## Bối cảnh (Context)
Hiện tại, logic điều khiển chính của Virtual Tour nằm toàn bộ trong file `public/main.js` với dung lượng lớn (>3400 dòng). Sự cồng kềnh này gây khó khăn trong bảo trì, phát triển tính năng mới và tối ưu hóa hiệu năng tải trang.

## Mục tiêu (Goals)
- Chuyển đổi mã nguồn frontend sang cấu trúc Module (ESM).
- Sử dụng **Vite** làm công cụ đóng gói (bundler) để hỗ trợ quá trình phát triển (HMR) và xây dựng bản Production tối ưu (minification, code splitting).
- Chia nhỏ `main.js` thành các module chức năng độc lập theo hướng OOP / Functional đễ dễ dàng quản lý.

## Thiết kế Kiến trúc (Architecture Design)

### 1. Công cụ (Tools)
- **Vite:** Xử lý module phân giải, dev server nhanh, và roll-up bundle cho production.

### 2. Cấu trúc thư mục mới đề xuất
```text
virtual-tour/
├── src/
│   ├── index.html       (Entry HTML point)
│   ├── style.css
│   ├── main.js          (Entry JS point)
│   ├── core/
│   │   ├── api.js       
│   │   ├── viewer.js
│   │   └── scenes.js
│   ├── features/
│   │   ├── minimap.js
│   │   ├── sensors.js
│   │   └── mail.js      
│   └── ui/
│       └── utils.js     
```

### 3. Quy trình Triển khai (Implementation Steps)

#### Giai đoạn 1: Thiết lập Vite (Setup Vite)
Chuyển `index.html`, `main.js`, `style.css` vào `src/`.
Cập nhật `vite.config.js` để có proxy chuyển tiếp các API request (`/api`, `/events`, `/uploads`) sang port của Express backend.

#### Giai đoạn 2 & 3: Tách module cơ bản & Tính năng
Tách dần logic cơ bản (API, Viewer) và tính năng (Minimap, Mail, v.v...) sang các module riêng rẽ, import lại vào `main.js`.

#### Giai đoạn 4: Cập nhật Backend
Cập nhật `server.js` cấu hình phục vụ thư mục `dist/` do Vite build ra thay vì `public/`.
