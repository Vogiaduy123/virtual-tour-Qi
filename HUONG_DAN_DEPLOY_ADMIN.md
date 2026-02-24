# Deploy phần Admin riêng (từ Git)

## 1) Chuẩn bị backend API
- Deploy backend Node.js trước (Render/Railway) để có domain, ví dụ: `https://virtual-tour-api.onrender.com`
- Đảm bảo backend chạy được các endpoint:
  - `/api/*`
  - `/uploads/*`
  - `/backend/tiles/*`

## 2) Cập nhật proxy cho admin
- Mở file `netlify.toml`
- Thay toàn bộ `https://YOUR_BACKEND_DOMAIN` thành domain backend thật của bạn.

## 3) Push cấu hình lên GitHub
```bash
git add netlify.toml HUONG_DAN_DEPLOY_ADMIN.md
git commit -m "Add admin-only deploy config for Netlify"
git push
```

## 4) Deploy admin riêng trên Netlify
- Đăng nhập Netlify, chọn **Add new site** -> **Import an existing project**
- Chọn đúng repo GitHub
- Netlify sẽ tự đọc `netlify.toml`:
  - Publish directory: `public`
- Bấm **Deploy site**

## 5) Truy cập admin
- Trang admin chính: `https://<ten-site-netlify>/admin.html`
- Các trang khác:
  - `/admin-rooms.html`
  - `/admin-upload.html`
  - `/admin-minimap.html`
  - `/admin-tour.html`

## Lưu ý
- Nếu backend chưa bật CORS, giữ cơ chế proxy như trên để tránh lỗi CORS.
- Khi đổi domain backend, chỉ cần sửa lại `netlify.toml` và redeploy.
