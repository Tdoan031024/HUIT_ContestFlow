# ContestFlow — Checklist nghiệm thu UX/UI

Checklist này ghi kết quả triển khai local ngày 09/11/2026. Route/state được kiểm tra có ảnh ở 9 viewport; giới hạn chưa kiểm tra thật được giữ trống. Build cuối đã bổ sung control 44px cho điện thoại ngang, nhưng bộ metric workspace chưa được chụp lại từ stylesheet mới.

## A. Quy chế và tính đúng đắn

- [x] Kết thúc một vòng không đặt toàn cuộc thi `COMPLETED` khi còn vòng bắt buộc chưa hoàn tất; E2E đã kiểm tra.
- [ ] Điều kiện đóng sớm toàn cuộc thi hiển thị xác nhận/hậu quả, yêu cầu lý do và ghi audit.
- [x] `requiredJudgeCount` không thể thay sau khi đã có điểm; E2E xác nhận API trả conflict.
- [ ] Chính sách công khai điểm/tên Giám khảo được pin vào snapshot lúc publish và không đổi âm thầm khi sửa policy.
- [ ] Dashboard, trang Phiếu điểm, card từng cuộc thi dùng cùng một cách tính số phiếu kỳ vọng.
- [ ] Preflight cho biết rubric, entry và coverage theo từng entry; ngoại lệ thiếu người/phiếu yêu cầu xác nhận và audit.
- [ ] Assignment theo vòng và theo entry được mô tả giống nhau giữa form, danh sách, API và queue.
- [ ] Giám khảo có thể thấy trạng thái chờ/nháp/đã nộp/mở lại và không mất task khi Admin chuyển lượt/kết thúc phiên.
- [x] Fixture E2E xác nhận ẩn danh và ẩn điểm Giám khảo trong snapshot đã công bố.
- [ ] Tie-break được xác nhận với quy chế cuộc thi và mô tả giống thuật toán/API.

## B. Quyền theo vai trò

### Admin

- [ ] Dashboard có việc cần làm và link đúng competition/round/entry.
- [ ] Tạo, sửa, archive, nhân bản có thông báo và state transition hợp lệ.
- [ ] Quản lý thí sinh thủ công, tái sử dụng hồ sơ, CSV preview/lỗi/trùng/xác nhận/rút.
- [ ] Phân công Giám khảo; coverage hiển thị đúng số cần/đủ/thiếu theo entry.
- [ ] Tạo/chỉnh rubric, xem trước, version lock và policy lock đúng mốc.
- [ ] Preflight trước khi bắt đầu; live start/pause/resume/select/previous/next/finish có trạng thái và chặn lệnh không hợp lệ.
- [ ] Theo dõi draft/submitted/missing/reopened; mở lại phiếu bằng dialog có lý do.
- [ ] Xem preview tổng hợp, xử lý thiếu phiếu, khóa snapshot, publish, xem lại version và tải CSV.
- [ ] Nhật ký thể hiện actor/action/round/entry/reason; thao tác thành công/thất bại không tạo log gây hiểu nhầm.

### Giám khảo

- [x] Không thấy thao tác Admin; 81 lượt thử route quản trị từ vai trò Giám khảo đều về `/judge` trên 9 viewport.
- [ ] Không xem cuộc thi/entry ngoài assignment.
- [ ] Chỉ thấy điểm/danh tính theo cấu hình ẩn danh và snapshot policy.
- [ ] Queue hiển thị việc đang live, chờ, nháp, đã nộp, mở lại và không khả dụng.
- [ ] Phiếu có hướng dẫn/thang/bước/weight/comment requirements; validation nêu rõ criterion thiếu/sai.
- [ ] Autosave/manual save hiển thị trạng thái bền vững, lỗi mạng có cách khôi phục.
- [ ] Nộp phiếu xác nhận nội dung/hậu quả; sau nộp chỉ đọc, Admin mở lại có lý do mới sửa được.
- [ ] Kết quả chỉ có snapshot đã công bố và CTA/copy ở chế độ đọc.

## C. Ma trận route

Mỗi ô thiết bị chỉ được đánh dấu khi route đó đã được mở, dùng và chụp ở **tất cả kích thước** trong nhóm tại mục D. Áp dụng cho cả trang có dữ liệu, rỗng, loading, lỗi và quyền bị từ chối phù hợp với route.

| Route/màn | Admin | Giám khảo | Desktop/web | Tablet | Điện thoại |
|---|---|---|---:|---:|---:|
| `/login` | Đăng nhập | Đăng nhập | [x] | [x] | [x] |
| `/setup` | Khởi tạo/đã khởi tạo | Không áp dụng hoặc chuyển đăng nhập | [x] | [x] | [x] |
| `/` dashboard | Admin workspace | Judge workspace | [x] | [x] | [x] |
| `/competitions` | Danh sách/tạo | Danh sách được phép, không CTA tạo | [x] | [x] | [x] |
| `/competitions/new` | Form tạo | Chặn/điều hướng, không render form | [x] | [x] | [x] |
| `/competitions/[id]` overview | Tổng quan vòng | Chặn/đọc theo quyền đã chốt | [x] | [x] | [x] |
| `/competitions/[id]/contestants` | Danh sách/form/CSV | Chặn/điều hướng | [x] | [x] | [x] |
| `/competitions/[id]/judges` | Phân công/coverage | Chặn/điều hướng | [x] | [x] | [x] |
| `/competitions/[id]/rubric` | Soạn/xem rubric | Chặn/điều hướng | [x] | [x] | [x] |
| `/competitions/[id]/live` | Điều phối/preflight | Chặn/điều hướng | [x] | [x] | [x] |
| `/competitions/[id]/scores` | Tình trạng phiếu | Chặn/điều hướng | [x] | [x] | [x] |
| `/competitions/[id]/results` | Preview/khóa/publish | Snapshot đã công bố, chỉ đọc | [x] | [x] | [x] |
| `/competitions/[id]/activity` | Audit/filter | Chặn/điều hướng | [x] | [x] | [x] |
| `/results` | Toàn bộ kết quả được phép | Chỉ snapshot đã công bố | [x] | [x] | [x] |
| `/judge` | Chặn/điều hướng | Queue đầy đủ | [x] | [x] | [x] |
| `/judge/[entryId]` | Chặn/điều hướng | Phiếu entry được giao | [x] | [x] | [x] |

## D. Responsive và thị giác

- [x] **Desktop/web:** 1440×900 và 1024×768.
- [x] **Tablet portrait:** 820×1180 và 768×1024.
- [x] **Tablet landscape:** 1180×820.
- [x] **Điện thoại portrait:** 390×844, 360×800 và 320×568.
- [x] **Điện thoại landscape:** 844×390.
- [x] Tổng cộng có 9 viewport; từng nhóm route/state trong ma trận C có ảnh ở đủ 9 kích thước.
- [x] Có 210 ảnh trong evidence/responsive; 171 metric workspace không còn loading/tràn ngang/toàn trang hoặc phần tử trôi khỏi vùng cuộn hợp lệ.
- [x] Dashboard, danh sách/thí sinh, phân công, rubric, điều phối, phiếu điểm và kết quả được chụp ở trạng thái populated; E2E đã chạy các workflow chính.
- [x] Không có horizontal overflow toàn trang trong 171 dòng metric. Bảng và navigation có vùng cuộn riêng, được ghi trong `metrics.json`.
- [x] Desktop: sidebar/header không lấn content; bố cục workspace được chụp ở hai độ phân giải desktop.
- [x] Tablet và điện thoại: navigation, toolbar và nội dung co giãn theo breakpoint; queue và form được chụp ở portrait/landscape.
- [x] Bổ sung rà 390×844 với dữ liệu local: dashboard Admin, chi tiết cuộc thi, queue Giám khảo và phiếu chấm; xác nhận menu dưới theo vai trò, bộ chọn mục cuộc thi và dock lưu/nộp điểm.
- [x] Dashboard Admin được chụp lại ở 320×568 và 360×800; menu vẫn đủ nhãn, thống kê và nội dung xếp một cột/2 cột theo chiều rộng, không thấy tràn ngang.
- [x] Route phiếu chấm Giám khảo hiển thị ngữ cảnh “Chấm điểm” ở header mobile.
- [ ] Form: bàn phím ảo không che input đang nhập hoặc nút lưu/nộp; lỗi validation cuộn đúng trường; dialog vừa chiều cao và cuộn được.
- [ ] Xoay tablet/điện thoại portrait↔landscape không làm mất draft, điểm, filter hoặc lựa chọn vòng.
- [ ] Touch target tối thiểu 44×44px trên mọi form landscape: build cuối đã đặt input/select/button tối thiểu 44px ở 844×390; metric workspace 39px cũ chưa được chụp lại từ browser mới. Portrait pass trong metric.
- [ ] Chữ và helper đọc được; contrast đạt; không cắt thông tin cần ra quyết định.
- [ ] Loading/error/empty/success/forbidden/stale/conflict/offline có thông báo và hành động phù hợp trên từng loại viewport.
- [ ] Dialog có focus order, giữ/restores focus, Escape và submit an toàn trên web; modal/bottom sheet đủ thao tác bằng touch.
- [ ] `prefers-reduced-motion`, zoom 200% và kiểm tra screen reader thật. Keyboard focus/login, accessible names và thứ tự focus đã kiểm tra một phần; chưa đánh dấu pass tổng thể.

## E. Luồng E2E bắt buộc

- [x] Admin tạo cuộc thi, vòng, rubric và entry; preflight phát hiện thiếu điều kiện trước khi bắt đầu.
- [x] Admin hoàn thành vòng; trạng thái competition theo vòng còn lại được kiểm tra trong E2E.
- [x] Giám khảo xem task được giao, mở phiếu, lưu nháp, chấm và nộp.
- [x] Preflight phát hiện thiếu assignment/phiếu theo fixture; luồng ngoại lệ có guard.
- [x] Admin mở lại phiếu; Giám khảo cập nhật/nộp lại; audit được kiểm tra.
- [x] Admin khóa snapshot và publish; Judge chỉ xem kết quả đã công bố.
- [x] Snapshot đã publish chỉ trả danh tính/chi tiết điểm theo policy đang gắn; E2E xác nhận dữ liệu ẩn không bị gửi cho Judge.
- [ ] Đổi publish policy sau snapshot mà vẫn giữ dữ liệu lịch sử không lộ chi tiết cũ âm thầm.
- [ ] Chủ sản phẩm xác nhận tie-break và quy tắc đồng hạng/làm tròn.
- [x] CSV, khóa `requiredJudgeCount`, phiên bản snapshot và tổng điểm sau mở lại đã qua E2E.
- [x] Session version conflict trả 409 cho lệnh cũ, không chấp nhận lệnh stale lặp lại.
- [x] Route/state workspace có ảnh cho đủ 9 profile sau khi dữ liệu tải xong.
- [ ] Chưa hoàn tất rà console/network của mọi route sau thay đổi cuối.
- [ ] Thực hiện luồng tạo→điều phối→chấm→công bố tối thiểu ở desktop, tablet touch và phone touch; xác nhận behavior và dữ liệu không đổi theo viewport.

## F. Cổng kết thúc

- [x] Các P1 baseline trong `UX_UI_AUDIT.md` đã được xử lý và workflow chính qua E2E.
- [ ] Không còn lỗi chặn ở route/API, quyền, scoring, publication, dữ liệu và accessibility.
- [x] Các P2 baseline về copy, navigation và dashboard đã được xử lý; tie-break nghiệp vụ được ghi ở audit như quyết định chờ xác nhận.
- [x] Tài liệu audit, kế hoạch và checklist phản ánh hành vi/giới hạn mới.
- [x] Tệp `docs/` không có trong artifact deploy cPanel; thay đổi này vẫn local-only.
- [x] Ma trận C có đủ ảnh cho ba nhóm thiết bị. Chú ý metric được tạo trước rule touch landscape cuối, nên chưa khẳng định kích thước chạm mới qua browser runtime.
