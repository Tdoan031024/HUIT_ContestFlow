# Hệ thống điểm danh sự kiện

## Phạm vi đã triển khai

- Admin tạo, cấu hình, mở, đóng, hoàn tất, lưu trữ và xóa sự kiện; từng sự kiện có liên kết công khai và mã QR.
- Người tham gia vào hàng đợi, giữ lượt bằng cookie HttpOnly, làm mới trang vẫn khôi phục trạng thái; chỉ lượt được cấp slot mới vào biểu mẫu.
- Xác minh thông tin, vị trí ở phía máy chủ, ảnh chụp từ camera và trường tùy chỉnh; bản ghi dùng khóa duy nhất và khóa idempotency.
- Admin tra cứu theo trang, xem ảnh riêng tư, xem lý do ngoại lệ, đọc nhật ký thao tác, theo dõi lượt chờ/lượt lỗi và xuất CSV UTF-8.

## Kiến trúc và giới hạn vận hành

Tính năng dùng Next.js Route Handlers, Prisma và MariaDB hiện có. Hàng đợi và slot song song được lưu trong MariaDB nên không cần Redis để chạy một triển khai ứng dụng; slot được claim có điều kiện và bản ghi có unique constraint để bảo vệ tính toàn vẹn. Rate limit cũng được lưu trong MariaDB. Đây là lựa chọn ít dịch vụ mới và dễ vận hành trong repo này.

Ảnh được lưu ở thư mục riêng tư theo `ATTENDANCE_STORAGE_DIR`, bên ngoài thư mục public. Mọi instance phải dùng cùng persistent volume. Cấu hình này chưa phù hợp cho nhiều instance không chia sẻ volume; trước khi scale ngang cần chuyển ảnh sang object storage dùng chung và cấu hình quyền riêng tư tương ứng.

Mặc định connection pool hiện giữ giới hạn 5 kết nối mỗi process để không làm thay đổi tải của ứng dụng ContestFlow hiện hữu. Con số này cần điều chỉnh theo giới hạn kết nối của MariaDB và số instance sau khi đo tải. Không thể cam kết 1.000–2.000 người đồng thời chỉ từ mã nguồn; phải chạy bài tải ở staging trên cấu hình gần production, theo dõi CPU/RAM, connection pool, truy vấn chậm, lỗi HTTP và latency.

Queue status được polling có backoff và jitter; vị trí chờ được hiển thị, nhưng không đưa ra ETA vì thời gian hoàn tất mỗi lượt chưa thể dự đoán tin cậy. GPS trên trình duyệt là tín hiệu chống gian lận, không phải bằng chứng chống giả mạo tuyệt đối.

## Cài đặt và migration

1. Cấu hình `DATABASE_URL`, `HCF_APP_BASE_URL` (URL HTTPS công khai khi triển khai), và `ATTENDANCE_STORAGE_DIR` thành một thư mục riêng tư có quyền đọc/ghi cho process Node.
2. Chạy `npm run db:generate` để sinh Prisma Client.
3. Chạy `npm run db:deploy` trong môi trường đích để áp dụng migration `20261126000000_event_attendance`.
4. Đảm bảo reverse proxy dùng HTTPS; ứng dụng cần HTTPS để camera và geolocation hoạt động trên điện thoại.
5. Sao lưu MariaDB và thư mục ảnh theo cùng một lịch; định kỳ diễn tập khôi phục cả hai.

Không đặt thư mục ảnh dưới `public/`, không phục vụ trực tiếp file ảnh qua static server và không sao chép secret vào log.

## Kiểm tra tải ở staging

`scripts/attendance-load.k6.js` mô phỏng 200, 1.000 rồi 2.000 VU tham gia hàng đợi và đọc trạng thái. Chỉ dùng một sự kiện thử nghiệm riêng, có `maxQueueSize` đủ lớn; không chạy trên sự kiện thật hoặc production.

```powershell
k6 run -e BASE_URL=https://staging.example.edu -e ATTENDANCE_CODE=<ma-su-kien-thu> scripts/attendance-load.k6.js
```

Bài này chỉ đo join/status của queue, chưa mô phỏng camera, upload ảnh hoặc submit đồng thời. Cần bổ sung các kịch bản riêng trước khi kết luận năng lực đầu-cuối. Mục tiêu khởi điểm của script là lỗi HTTP dưới 2%, p95 dưới 1,5 giây và p99 dưới 4 giây; lưu kết quả cùng cấu hình server/database để so sánh.

## Dữ liệu, quyền riêng tư và lưu trữ

Thông tin cá nhân, tọa độ, câu trả lời tùy chỉnh và ảnh chỉ được trả cho Admin đã đăng nhập; participant chỉ nhận thông tin công khai của sự kiện và trạng thái của cookie riêng. Ảnh phải được xóa cùng bản ghi hoặc khi xóa sự kiện. API cho phép xóa từng bản ghi và xóa sự kiện đã đóng.

Chủ sự kiện cần thông báo mục đích thu thập, thời hạn lưu và đầu mối liên hệ trước sự kiện. Chính sách vận hành mặc định đề xuất: rà soát, xuất báo cáo cần thiết, rồi xóa hồ sơ cá nhân/ảnh sau 90 ngày kể từ khi sự kiện hoàn tất; có thể giữ số liệu đã ẩn danh theo quy định của đơn vị. Việc xóa hiện do Admin thực hiện trong giao diện; chưa có tác vụ tự xóa theo lịch. Không được coi mốc 90 ngày là cấu hình tự động.

## Những việc cần trước khi công bố production

- Chạy migration và smoke test trên staging, sau đó chạy k6 trên phần cứng gần production.
- Xác nhận persistent volume, bản sao lưu/khôi phục ảnh, HTTPS, giới hạn pool và monitoring của hosting.
- Kiểm thử trực tiếp QR trên iOS/Android, quyền camera/GPS, tải lại trang, mất mạng, hàng đợi đầy và nhiều lượt đồng thời.
- Xây dựng lịch xóa dữ liệu tự động nếu đơn vị yêu cầu thực thi retention không phụ thuộc thao tác Admin.
