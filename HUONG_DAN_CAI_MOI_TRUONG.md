# HƯỚNG DẪN CÀI MÔI TRƯỜNG (MÁY MỚI)

Tài liệu này giúp bạn copy project `virtual-tour` sang máy khác và chạy được ngay.

## 1) Cài phần mềm cần thiết

### Bắt buộc
- **Node.js 20 LTS** (khuyến nghị), tối thiểu Node.js 18+  
  Tải tại: https://nodejs.org/en/download
- **npm** (đi kèm Node.js)

### Khuyến nghị
- **Git** (để pull/update code)  
  Tải tại: https://git-scm.com/downloads
- **VS Code** (để chỉnh sửa nhanh)  
  Tải tại: https://code.visualstudio.com/Download

### Chỉ cài khi gặp lỗi build package native (ví dụ `sharp`)
- **Microsoft Visual C++ Build Tools** (Windows)  
  Tải tại: https://visualstudio.microsoft.com/visual-cpp-build-tools/

---

## 2) Copy source code sang máy mới

Bạn có thể dùng 1 trong 2 cách:

### Cách A - qua Git
```bash
git clone <repo-url>
cd virtual-tour
```

### Cách B - copy trực tiếp thư mục
- Copy toàn bộ thư mục `virtual-tour`
- Nên giữ nguyên các thư mục dữ liệu để không mất nội dung cũ:
  - `data/`
  - `uploads/`
  - `backend/tiles/`

---

## 3) Cài dependency

Mở terminal tại thư mục project, chạy:

```bash
npm install
```

---

## 4) Tạo file `.env` (nếu dùng tính năng gửi mail)

Tạo file `.env` ở thư mục gốc project.

Ví dụ cấu hình:

```env
PORT=3000
UPLOAD_DIR=/var/www/uploads

# Chọn provider: resend | brevo | sendgrid | smtp
MAIL_PROVIDER=resend
MAIL_FROM=your_email@domain.com

# Dùng 1 trong 3 API key bên dưới tùy provider
RESEND_API_KEY=
BREVO_API_KEY=
SENDGRID_API_KEY=

# Nếu dùng SMTP thì điền thêm
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_SECURE=false
```

> Nếu không dùng gửi mail, vẫn chạy được project mà không cần điền đủ các biến mail.

### Quan trọng khi chạy trên server riêng
- Đặt `UPLOAD_DIR` vào thư mục bền vững, ví dụ: `/var/www/uploads`
- Không đặt vào thư mục tạm của container hoặc thư mục bị xoa khi deploy lại
- Đảm bảo user chạy Node.js có quyền ghi vào thư mục này

Ví dụ lệnh chuẩn trên Linux:

```bash
sudo mkdir -p /var/www/uploads/media
sudo chown -R www-data:www-data /var/www/uploads
sudo chmod -R 775 /var/www/uploads
```

> Nếu server dùng user khác (không phải `www-data`), thay đúng user/group đang chạy Node.js.

---

## 5) Chạy project

```bash
npm start
```

Hoặc:

```bash
node server.js
```

Khi chạy thành công, mở:
- User: `http://localhost:3000/`
- Admin: `http://localhost:3000/admin.html`

---

## 6) Kiểm tra nhanh sau khi chạy

- Mở `http://localhost:3000/` xem tour có hiển thị
- Mở `http://localhost:3000/admin-upload.html` kiểm tra trang upload
- Mở `http://localhost:3000/admin-api-config.html` kiểm tra cấu hình API

Kiểm tra upload có bền sau restart:
- Upload 1 file từ admin
- Xem URL file vừa upload có mở được (dạng `/uploads/...`)
- Restart service (PM2/systemd/Docker)
- Mở lại đúng URL đó, nếu vẫn thấy ảnh là cấu hình đúng

---

## 7) Lỗi thường gặp

### `npm install` lỗi liên quan `sharp`
- Cài **Microsoft Visual C++ Build Tools**
- Xóa cache và cài lại:

```bash
npm cache clean --force
npm install
```

### Chạy server báo cổng 3000 đã dùng
- Đổi cổng trong `.env`:

```env
PORT=3001
```

### Chạy `node server.js` bị lỗi ngay
- Kiểm tra đã chạy `npm install` chưa
- Kiểm tra phiên bản node: `node -v` (khuyến nghị 20 LTS)
- Kiểm tra file `.env` có ký tự lạ hoặc xuống dòng sai

### Upload xong nhưng reset/restart thì mất file
- Nguyên nhân thường gặp: đang lưu vào vùng đĩa tạm hoặc container không mount volume.
- Cách xử lý:
  - Đặt `UPLOAD_DIR=/var/www/uploads` trong `.env`
  - Tách thư mục upload ra ngoài thư mục source code deploy
  - Nếu chạy Docker, mount volume host: `-v /var/www/uploads:/var/www/uploads`

---

## 8) Checklist bàn giao máy mới

- [ ] Đã cài Node.js 20 LTS
- [ ] Đã copy đủ source + dữ liệu (`data`, `uploads`, `backend/tiles`)
- [ ] Đã chạy `npm install`
- [ ] Đã tạo `.env` (nếu cần gửi mail)
- [ ] Đã chạy `npm start` thành công
- [ ] Đã vào được trang user + admin
