# HUIT ContestFlow — Trạng thái hoàn thiện MVP

Cập nhật ngày 05/11/2026. Phạm vi MVP là một ứng dụng Next.js full-stack, một tiến trình Node.js và MySQL; gồm hai vai trò Admin và Giám khảo. Không tạo tài khoản hoặc dữ liệu demo trên màn hình thật.

## Phần đã hoàn thành

| Giai đoạn | Trạng thái | Kết quả bàn giao |
|---|---|---|
| 0. Môi trường và quy tắc | Hoàn tất cho môi trường phát triển | MySQL cô lập; số phiếu yêu cầu, trung bình/trung vị, ẩn danh, cho phép thiếu phiếu, quyền xem điểm và mở lại phiếu cấu hình theo vòng. |
| 1. Mô hình và migration | Hoàn tất | Schema Prisma, ràng buộc dữ liệu và hai migration; có thể triển khai bằng `npm run db:deploy`. |
| 2. Đăng nhập và phân quyền | Hoàn tất | Khởi tạo Admin một lần, mật khẩu scrypt, session HttpOnly, phân quyền ở Route Handler, tài khoản Judge; Admin có thể đặt lại mật khẩu Judge và thu hồi session cũ. |
| 3. Quản lý cuộc thi | Hoàn tất | Tạo, sửa, lưu trữ và nhân bản cuộc thi; lưu thời gian, đơn vị, địa điểm, hình thức; tạo và cấu hình vòng thi. Nhân bản chỉ sao chép cấu hình và rubric. |
| 4. Thí sinh và phân công | Hoàn tất | CRUD hồ sơ/tham gia vòng, CSV tối đa 500 dòng, mã và thứ tự tự cấp; phân công Judge theo vòng hoặc lượt thi. |
| 5. Rubric Builder | Hoàn tất cho MVP | Tiêu chí, hướng dẫn, thang điểm, bước điểm, trọng số, nhận xét bắt buộc, xem trước và phiên bản bất biến sau khi có phiếu. |
| 6. Điều phối và chấm điểm | Hoàn tất cho MVP | Bắt đầu, tạm dừng, tiếp tục, chọn/chuyển lượt, kết thúc; trạng thái được kiểm soát bằng version để từ chối lệnh cũ; Judge lưu nháp phía máy chủ và nộp phiếu độc lập. |
| 7. Tổng hợp và công bố | Hoàn tất cho MVP | Tính điểm có trọng số, trung bình/trung vị giữa Judge, đồng hạng khi bằng điểm, chặn khóa nếu thiếu phiếu theo quy tắc, snapshot bất biến, mở lại có lý do và công bố. |
| 8. Audit và báo cáo | Hoàn tất cho MVP | Audit các thao tác nghiệp vụ chính; CSV gồm điểm tổng, điểm từng Judge, điểm từng tiêu chí và tình trạng đủ/thiếu phiếu. Judge chỉ xem snapshot đã công bố trong cuộc thi được phân công. |
| 9. Kiểm tra và vận hành | Hoàn tất ở môi trường local | Production build, E2E trên MySQL, health check, backup và restore rehearsal trên database riêng. |

## Kết quả kiểm tra

- `npm run build`: thành công, gồm kiểm tra TypeScript và tạo production build.
- `npx prisma migrate status`: schema MySQL khớp với các migration.
- `npm run test:e2e`: toàn bộ workflow pass; script dọn tài khoản và dữ liệu kiểm thử sau khi chạy.
- `GET /api/health`: trả `status: ok`, `database: ok`.
- Backup/restore rehearsal ngày 05/11/2026: khôi phục thành công 17 bảng vào database scratch riêng rồi xóa database scratch.
- Responsive: đã kiểm tra trực quan màn hình đăng nhập tại 390×844, 768×1024 và 1440×900; CSS workspace có các breakpoint dùng chung.

## Quy tắc và giới hạn đã chọn cho MVP

- Điểm của mỗi Judge là trung bình có trọng số của tiêu chí; tổng trọng số được chuẩn hóa. Giữa các Judge dùng trung bình cộng hoặc trung vị.
- Khi điểm tổng bằng nhau, thí sinh đồng hạng. Chưa áp dụng tiêu chí phụ để phá hòa vì đề xuất nghiệp vụ chưa nêu thứ tự ưu tiên.
- Điều phối và chấm điểm cần kết nối mạng; bản nháp được tự lưu lên máy chủ. Chưa có hàng đợi lưu điểm hoàn toàn offline.
- Rubric hiện dùng danh sách tiêu chí phẳng; chưa có nhóm tiêu chí hoặc công thức tự định nghĩa ngoài trung bình có trọng số.
- Cập nhật trực tiếp dùng polling mỗi 5 giây để giữ một tiến trình Node.js; chưa dùng WebSocket.

## Phần cần môi trường ngoài trước khi phát hành production

Source đã có hướng dẫn triển khai cho một Node.js app và MySQL, nhưng chưa thể phát hành lên hosting vì workspace chưa có host/domain, quyền truy cập, cấu hình TLS hoặc database production. Trước khi mở production cần đặt các biến môi trường bảo mật, chạy migration trên database đích, cấu hình HTTPS, chọn nơi lưu backup có kiểm soát truy cập và diễn tập restore trên database staging.

Không chạy `npm run test:e2e` trên production: bài kiểm thử khởi tạo Admin đầu tiên trên database trống và tạo/xóa dữ liệu tạm.
