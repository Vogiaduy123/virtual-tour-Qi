# Thiết kế Tính năng Quản lý Phòng theo Thư mục (Tòa nhà)

## 1. Giới thiệu tổng quan
Mục tiêu là cải thiện cách tổ chức các phòng trong hệ thống Virtual Tour, từ việc lưu trữ toàn bộ ảnh vào một thư mục `uploads/` thành việc nhóm chúng theo các thư mục lớn tương ứng với từng "Tòa nhà" (Building) hoặc "Khu vực" do Admin định nghĩa.
Sự phân cấp này giúp hệ thống dễ quản lý, chuyên nghiệp và tránh nhầm lẫn khi quy mô ảnh lớn dần.

## 2. Mô hình Dữ liệu (Data Model)
- **Danh mục Tòa nhà (`data/buildings.json`)**: Là nguồn lưu trữ các danh mục tòa nhà/khu vực được tạo từ Admin (Vd: `[{ "id": "toa-a", "name": "Tòa A" }]`).
- **Chỉnh sửa thông tin phòng (`data/rooms.json`)**: Các phòng sẽ được bổ sung thêm thuộc tính `buildingId` để liên kết tới danh mục. Đối với các phòng chưa có thuộc tính này thì được định danh là nhánh "Chưa phân loại" (Uncategorized) để ngăn ngừa lỗi mất ảnh cũ.

## 3. Cấu trúc Lưu trữ tập tin (File System)
- Các file panorama tải lên sẽ được chuyển hướng thư mục theo Dropdown đã chọn ở giao diện: `uploads/{Building Name}/panorama_xxx.jpg`.
- Các thư mục chứa cắt lát hiển thị 3D (Tiles) cũng sẽ đi theo thư mục Tòa nhà: `backend/tiles/{Building Name}/xxx/`.
- Với các phòng "Chưa phân loại" cũ, các link ảnh hiện tại được giữ nguyên cho tới khi Admin gán chúng vào Tòa nhà tương ứng.

## 4. API (Backend)
- Xây dựng cụm API thao tác (CRUD) dành riêng cho Danh mục Tòa nhà:
  - `GET /api/buildings`
  - `POST /api/buildings`
  - `PUT /api/buildings/:id`
  - `DELETE /api/buildings/:id`
- Cập nhật Middleware (Ví dụ: `multer` diskStorage) trong API `POST /upload-panorama`: Nhận tham số liên quan đến `buildingName`/`buildingId` từ `req.body` để tạo đúng thư mục đích trước khi lưu.
- Cập nhật API chỉnh sửa thông tin phòng (`PATCH /rooms/:id`): Khi người dùng thay đổi gán 1 phòng cũ sang Tòa nhà mới, thực thi luồng chuyển dịch thư mục (Sử dụng module `fs` của NodeJS để cắt/dán ảnh và folder `tiles` sang vị trí mới, sau đó lưu lại đường dẫn mới vào `rooms.json`).

## 5. Giao diện (Frontend Admin)
- Thêm Tab Quản lý **Danh mục Tòa nhà** trên trang Admin.
- Tích hợp Dropdown list "Chọn Tòa nhà" hiển thị ở các Dialog (Thêm phòng, Chỉnh sửa phòng).
- Cập nhật bảng dữ liệu danh sách phòng, hiển thị tường minh Tên tòa nhà để quản lý trực quan. Thêm tính năng Lọc (Filter) danh sách phòng theo Tòa nhà.
