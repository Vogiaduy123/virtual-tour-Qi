# Hướng dẫn xem RTSP realtime qua WebRTC (WHEP)

## 1) Cấu hình đã tạo sẵn
- File cấu hình gateway: `mediamtx.yml`
- Script chạy nhanh Windows: `start-webrtc-gateway.ps1`
- Camera trong `data/sensors.json` sẽ dùng URL WHEP local:
  - `http://127.0.0.1:8889/cam101/whep`

## 2) Cách chạy gateway
Trong PowerShell tại thư mục project:

```powershell
./start-webrtc-gateway.ps1
```

Script sẽ ưu tiên Docker nếu có, nếu không thì dùng binary `mediamtx` nếu đã cài.

## 3) Link stream dùng được
- **WHEP URL:** `http://127.0.0.1:8889/cam101/whep`
- **Dạng rút gọn trong admin:** `webrtc://127.0.0.1:8889/cam101`

## 4) Nếu truy cập từ máy khác trong LAN
Thay `127.0.0.1` bằng IP máy chạy MediaMTX, ví dụ:
- `http://192.168.1.50:8889/cam101/whep`

## 5) Lưu ý
- Nếu web tour chạy HTTPS, nên đặt gateway chạy HTTPS tương ứng để tránh mixed content.
- Cần mở firewall cho cổng `8889` trên máy chạy gateway.
