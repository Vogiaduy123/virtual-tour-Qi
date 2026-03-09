# Deploy phần Admin riêng (từ Git)

## 1) Chuẩn bị backend API
- Deploy backend Node.js trước (Render/Railway) để có domain, ví dụ: `https://virtual-tour.onrender.com`
- Đảm bảo backend chạy được các endpoint:
  - `/api/*`
  - `/uploads/*`
  - `/backend/tiles/*`

### Cấu hình biến môi trường (bắt buộc)
- File `.env` đang được ignore bởi git nên **không được push lên repo**.
- Dùng file mẫu `.env.example` để tạo `.env` khi chạy local.
- Trên môi trường deploy (Render/Railway), vào phần **Environment Variables** và khai báo:
  - `MAIL_PROVIDER` = `resend` (khuyến nghị) hoặc `brevo` / `sendgrid`
  - `MAIL_FROM`
  - API key tương ứng một trong các lựa chọn:
    - `RESEND_API_KEY`
    - `BREVO_API_KEY`
    - `SENDGRID_API_KEY`

### Tùy chọn cũ (SMTP)
- Chỉ dùng khi thật cần thiết. Nếu dùng SMTP thì khai báo:
  - `SMTP_HOST`
  - `SMTP_PORT`
  - `SMTP_USER`
  - `SMTP_PASS`
  - `SMTP_SECURE`
  - `MAIL_FROM`

## 2) Cấu hình domain backend cho admin
- Mở file `public/admin-runtime-config.js`
- Sửa thành:

```js
window.ADMIN_API_BASE_URL = "https://virtual-tour.onrender.com";
```

- Chỉ cần sửa 1 dòng này khi đổi backend.

## 3) Push cấu hình lên GitHub
```bash
git add public/admin-runtime-config.js netlify.toml HUONG_DAN_DEPLOY_ADMIN.md
git commit -m "Configure admin-only deployment"
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
- Backend hiện đã dùng `cors()` nên admin deploy khác domain vẫn gọi API được.
- Khi đổi domain backend, chỉ cần sửa lại `public/admin-runtime-config.js` và redeploy.
