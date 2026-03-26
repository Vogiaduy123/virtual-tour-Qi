# Virtual Tour (virtual-tour-Qi)

Dự án Virtual Tour cho phép xem và quản lý không gian 360 độ, bao gồm hotspot, minimap, kịch bản tour tự động và hỗ trợ xem camera RTSP realtime qua WebRTC.

## 1. Yêu cầu môi trường & Cài đặt
- **Node.js**: Phiên bản 20 LTS (tối thiểu 18+)
- **Hệ điều hành**: Windows/Linux/macOS đều được.

### Cách cài đặt mới (Clone project)
```bash
git clone <repo-url>
cd virtual-tour
npm install
```

### Cấu hình môi trường (Không bắt buộc nếu chỉ chạy local cơ bản)
Tạo file `.env` ở thư mục gốc (có thể copy từ `.env.example` nếu có) và cấu hình:
```env
PORT=3000
UPLOAD_DIR=/var/www/uploads # Cần thiết nếu deploy trên server riêng để tránh mất file khi deploy lại

# Cấu hình gửi mail (chỉ cần khi dùng mail, nếu không có thể bỏ qua)
MAIL_PROVIDER=resend # resend | brevo | sendgrid | smtp
MAIL_FROM=your_email@domain.com
# Các key tương ứng: RESEND_API_KEY, BREVO_API_KEY, SENDGRID_API_KEY, SMTP_*
```

## 2. Hướng dẫn sử dụng & Chạy dự án
### Khởi động Server
Tại thư mục project, chạy lệnh:
```bash
npm start
# hoặc: node server.js
```
- Màn hình người dùng (User View): `http://localhost:3000/`
- Bảng điều khiển (Admin Dashboard): `http://localhost:3000/admin.html`

### Luồng thao tác trên Admin Dashboard
1. **Upload Panorama (`/admin-upload.html`)**: Nhập tên phòng, chọn tầng và bấm Upload & Generate Tiles.
2. **Quản lý Phòng (`/admin-rooms.html`)**: Kiểm tra phòng đã tạo và thiết lập các hotspot (chuyển cảnh, web, 3d, video).
3. **Chỉnh Minimap (`/admin-minimap.html`)**: Chọn tầng, upload ảnh minimap, đặt vị trí phòng trên bản đồ và lưu lại.
4. **Chỉnh Kịch bản Tour (`/admin-tour.html`)**: Đặt tên kịch bản, cấu hình thời gian xoay camera và thêm các điểm dừng tự động.

### Các thư mục dữ liệu hệ thống
- **Dữ liệu JSON**: `data/` (chứa `rooms.json`, `minimap.json`, `tour-scenario.json`, `sensors.json`, `api-config.json`)
- **Ảnh gốc tải lên**: `uploads/`
- **Ảnh Tile đã xử lý**: `backend/tiles/`

## 3. Xem Camera RTSP Realtime qua WebRTC (WHEP)
Dự án có khả năng tích hợp luồng camera RTSP sử dụng gateway MediaMTX.
- **Cấu hình Gateway**: `mediamtx.yml`
- **Chạy Gateway (Bật PowerShell tại thư mục project)**:
  ```powershell
  ./start-webrtc-gateway.ps1
  ```
  *(Script ưu tiên dùng Docker, nếu không sẽ dùng binary mediamtx đã cài).*
- **URL Stream minh họa**:
  - WHEP URL: `http://127.0.0.1:8889/cam101/whep`
  - Rút gọn trong Admin: `webrtc://127.0.0.1:8889/cam101`
- **Lưu ý**: Nếu host chạy IP khác (LAN) thay `127.0.0.1` bằng IP tương ứng, và đảm bảo mở port firewall `8889`. Nếu web chạy HTTPS, gateway cũng cần bật HTTPS.

## 4. Deploy Backend & Admin riêng (Từ Git)
Nếu bạn muốn deploy API riêng biệt (ví dụ Render/Railway) và phần frontend Admin trên dịch vụ tĩnh như Netlify:

1. **Chuẩn bị Backend API:** (Ví dụ domain `https://virtual-tour.onrender.com`). Đảm bảo cấu hình Environment Variables (như email keys) trên hosting server.
2. **Cấu hình Domain Backend cho Frontend Admin:**
   Mở file `public/admin-runtime-config.js` và cập nhật biến `ADMIN_API_BASE_URL`:
   ```javascript
   window.ADMIN_API_BASE_URL = "https://virtual-tour.onrender.com";
   ```
3. **Deploy Admin trên Netlify:**
   - Commit file và push thay đổi lên repo.
   - Trỏ Netlify vào repo này, file `netlify.toml` đã được thiết lập sẵn với publish directory là `public`.

## 5. Xử lý Lỗi thường gặp
- **`npm install` báo lỗi `sharp` (Windows)**: Cần cài *Microsoft Visual C++ Build Tools*, sau đó xóa bộ nhớ tạm `npm cache clean --force` rồi cài lại `npm install`.
- **Cổng 3000 đang được sử dụng**: Cập nhật `PORT` trong tệp `.env` thành cổng khác (VD: `3001`), hoặc tắt quá trình đang sử dụng (PowerShell):
  ```powershell
  Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  ```
- **Mất file Upload sau khi Restart server**: Do container hoặc Cloud không giữ ổ đĩa. Cấu hình biến `UPLOAD_DIR` vào thư mục lưu trữ ngoài (ví dụ `UPLOAD_DIR=/var/www/uploads`) và mount các volume Docker thích hợp.
