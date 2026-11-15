# YÊU CẦU THIẾT KẾ UI/UX — HUIT CONTESTFLOW

**Responsive Web — Mobile First**

> Bản yêu cầu nghiệp vụ cho Designer. Những điểm chưa có quyết định trong sản phẩm được đánh dấu CẦN XÁC NHẬN.
>
> Quy trình: Review nghiệp vụ → duyệt phạm vi → wireframe Mobile → UI responsive → prototype → handoff Developer.

| Thông tin | Nội dung |
|---|---|
| Tên dự án | HUIT ContestFlow |
| PM phụ trách | Product Owner / PM ContestFlow — CẦN GHI TÊN |
| Người review/phê duyệt | Đại diện ban tổ chức — CẦN GHI TÊN |
| Phiên bản | v1.5 |
| Ngày cập nhật | 12/11/2026 |
| Phạm vi | MVP hiện có — responsive cho Admin và Giám khảo |
| Trạng thái | Draft v1.5 — phân biệt Figma/browser QA, duyệt nút Hủy và quy tắc nộp khi đang lưu; chờ review lại |

## 1. Tổng quan sản phẩm

- **Sản phẩm:** Ứng dụng web nội bộ quản lý cuộc thi nhiều vòng, phân công giám khảo, điều phối, chấm theo rubric, tổng hợp và công bố kết quả.
- **Vấn đề:** Ban tổ chức cần dữ liệu và tiến độ chấm tập trung, giảm tổng hợp thủ công, kiểm soát việc thiếu phiếu và lưu lại lịch sử tác vụ ảnh hưởng kết quả.
- **Mục tiêu:** Admin chuẩn bị/vận hành cuộc thi; Giám khảo tìm đúng lượt, chấm và nộp dễ dàng; hệ thống tổng hợp theo chính sách đã cấu hình. KPI định lượng chưa được cung cấp.
- **Người dùng:** Admin/ban tổ chức và Giám khảo được cấp tài khoản.
- **Thiết bị:** Ưu tiên Mobile cho giám khảo tại sự kiện; sau đó Tablet và Desktop cho các tác vụ quản trị.
- **Trong phạm vi MVP:** đăng nhập, cuộc thi/vòng, thí sinh, tài khoản và phân công giám khảo, rubric, điều phối live, phiếu chấm, kết quả, CSV và audit.
- **Ngoài phạm vi hiện tại:** tài khoản tự phục vụ cho thí sinh, đăng ký công khai, chấm offline, ứng dụng native và kết quả công khai không cần đăng nhập. Cần xác nhận nếu có kế hoạch phase sau.
- **Ngôn ngữ:** Tiếng Việt.

## 2. Vai trò và phân quyền

| Vai trò | Mục tiêu | Được phép | Hạn chế |
|---|---|---|---|
| Admin | Chuẩn bị, điều phối, giám sát | Quản lý cuộc thi/vòng/thí sinh; CSV; tạo tài khoản và phân công; cấu hình rubric; điều phối; theo dõi phiếu; mở lại có lý do; khóa/công bố; xuất CSV; xem audit | Không bỏ qua điều kiện khóa kết quả; một số thao tác cần lý do và được ghi audit |
| Giám khảo | Chấm lượt được giao | Xem công việc được giao; nhập điểm/nhận xét; lưu nháp; nộp; xem phiếu của mình; xem kết quả đã công bố của cuộc thi được phân công | Không quản lý cấu hình/phân công; không xem lượt ngoài phạm vi; không sửa phiếu đã nộp nếu Admin chưa mở lại |

- Menu và hành động thay đổi theo vai trò. Sau đăng nhập, Giám khảo được điều hướng thẳng đến /judge (Danh sách Chấm thi); Dashboard / vẫn mở được từ menu Tổng quan.
- Quyền phải được bảo vệ ở API, không chỉ ẩn nút.
- Thông tin định danh thí sinh bị ẩn theo cấu hình vòng thi.
- Điểm riêng từng Giám khảo chỉ hiển thị nếu vòng cho phép công bố.

## 3. Quy trình nghiệp vụ

### WF-01 — Chuẩn bị cuộc thi (Admin)
1. Tạo cuộc thi, nhập tên/mô tả/đơn vị/địa điểm/hình thức/thời gian.
2. Tạo vòng và cấu hình ẩn danh, số phiếu tối thiểu, cách tổng hợp, độ chính xác, tie-break, công bố điểm riêng, cho phép thiếu phiếu.
3. Thêm thí sinh thủ công hoặc qua CSV; tạo lượt, mã dự thi, thứ tự; sắp xếp trước khi bắt đầu.
4. Tạo/chọn tài khoản Giám khảo và phân công theo vòng hoặc lượt.
5. Tạo rubric gồm tiêu chí, hướng dẫn, min/max, bước điểm, trọng số và yêu cầu nhận xét; xem trước/kích hoạt.
- **Thành công:** Vòng có lượt thi, rubric và phân công sẵn sàng.
- **Lỗi:** dữ liệu thiếu/sai/trùng, CSV không hợp lệ, ngày không hợp lệ, hoặc sửa cấu hình đã bị khóa.

### WF-02 — Giám khảo chấm và nộp phiếu
1. Mở Chấm thi, xem danh sách theo thứ tự và trạng thái.
2. Mở lượt được giao; xem mã và thông tin thí sinh theo cài đặt ẩn danh.
3. Nhập điểm từng tiêu chí, nhận xét bắt buộc nếu có.
4. Lưu nháp lên máy chủ; có thể tiếp tục nháp khi lượt live đã chuyển.
5. Nộp phiếu; phiếu đã nộp chuyển chỉ đọc.
- **Ngoại lệ:** thiếu điểm/nhận xét, điểm ngoài thang/sai bước, chưa đến lượt, mất mạng, rubric chưa kích hoạt, phiếu đã nộp hoặc kết quả đã khóa.
- **Kết thúc:** phiếu DRAFT, SUBMITTED, REOPENED hoặc chỉ đọc theo trạng thái.

### WF-03 — Điều phối vòng thi (Admin)
1. Kiểm tra lượt thi, rubric và độ bao phủ phân công.
2. Bắt đầu phiên; chọn/chuyển lượt hiện tại; tạm dừng/tiếp tục.
3. Theo dõi tiến độ; kết thúc phiên.
- **Ngoại lệ:** thiếu lượt/rubric/phân công, lệnh cũ do trạng thái vừa đổi, vòng đã hoàn tất.
- Nếu cho phép thiếu phân công, Admin phải nhập lý do tối thiểu 10 ký tự.

### WF-04 — Khóa và công bố kết quả (Admin)
1. Theo dõi phiếu đủ/thiếu theo lượt và giám khảo.
2. Kết thúc phiên, xử lý bản nháp/phiếu mở lại và kiểm tra điểm.
3. Khóa kết quả tạo snapshot phiên bản; công bố snapshot; tải CSV.
- **Điều kiện:** phiên đã kết thúc, không còn nháp/phiếu mở lại, vòng có thí sinh và đủ số phiếu tối thiểu. Thiếu phiếu chỉ được chốt nếu chính sách cho phép và Admin nêu lý do.
- **Kết quả:** Snapshot được giữ theo phiên bản; Giám khảo chỉ xem sau khi công bố.

### WF-05 — Mở lại phiếu
Admin chọn phiếu và nhập lý do tối thiểu 10 ký tự. Phiếu SUBMITTED có thể được mở lại. Trường hợp DRAFT chỉ hợp lệ khi vòng đã có snapshot trước đó: đây là bản nháp phát sinh trong đợt chỉnh sửa sau khi Admin mở lại phiếu SUBMITTED; snapshot cũ vẫn được giữ trong lịch sử trong lúc chờ hoàn tất đợt sửa. Đây không phải bản nháp “lọt qua” điều kiện khóa: WF-04 vẫn chặn tạo snapshot phiên bản kế tiếp khi còn DRAFT/REOPENED. Hệ thống đặt phiếu thành REOPENED, xóa submittedAt, giữ reopenedReason, đặt vòng về READY và phiên về PAUSED (tăng version). Admin tiếp tục/điều phối lại phiên, Giám khảo sửa và nộp; sau khi phiên kết thúc Admin khóa snapshot phiên bản mới. Không thể mở lại sau khi cuộc thi đã đóng sớm.

## 4. Sitemap, User Flow và đặc tả 14 màn hình

### 4.1 Sitemap theo vai trò

- **Khu vực dùng chung**
  - Đăng nhập → đăng xuất.
  - Khởi tạo Admin lần đầu là luồng thiết lập vận hành, không phải màn hình sử dụng thường xuyên.
- **Admin**
  - Tổng quan → Danh sách cuộc thi → Tổng quan cuộc thi.
  - Tổng quan cuộc thi → Thí sinh/lượt thi; Vòng và rubric; Phân công giám khảo; Điều phối; Theo dõi phiếu; Kết quả; Nhật ký.
  - Phân công giám khảo → tạo tài khoản mới hoặc chọn tài khoản hiện có → gán theo vòng/lượt.
  - Điều phối → kết thúc phiên → Theo dõi phiếu/Kết quả → khóa snapshot → công bố hoặc xuất CSV.
  - Kết quả/Theo dõi phiếu → mở lại phiếu có lý do → Giám khảo chấm lại → khóa snapshot phiên bản mới.
- **Giám khảo**
  - Đăng nhập → Danh sách Chấm thi (/judge) → Phiếu chấm → Phiếu đã nộp (chỉ đọc). Dashboard (/) là mục điều hướng tùy chọn, không phải đích chuyển mặc định sau đăng nhập.
  - Danh sách Chấm thi → Kết quả đã công bố trong cuộc thi được phân công.
  - Lượt chờ điều phối không cho bắt đầu; lượt đang live hoặc phân công riêng mới mở theo chính sách.

### 4.2 User Flow

**Admin — tạo đến công bố:** Tổng quan → tạo cuộc thi → tạo vòng → thêm thí sinh/lượt → tạo rubric và kích hoạt → tạo/chọn Giám khảo, phân công → preflight → bắt đầu/điều phối → theo dõi đủ phiếu → kết thúc phiên → khóa kết quả → công bố → xuất CSV/audit.

**Admin — xử lý ngoại lệ:** Theo dõi phiếu → chọn phiếu/lượt thiếu → nếu sửa phiếu đã nộp thì nhập lý do mở lại → Giám khảo sửa/nộp → kiểm tra lại coverage → khóa snapshot mới. Nếu cho phép thiếu phân công/phiếu thì nhập lý do theo quy định.

**Giám khảo — chấm:** Đăng nhập → Chấm thi → lọc/nhận diện lượt hợp lệ → mở lượt → nhập điểm/nhận xét → tự lưu sau mỗi thay đổi (có thể bấm Lưu nháp để lưu ngay) → kiểm tra tổng điểm → xác nhận nộp → phiếu chỉ đọc. Nếu mất mạng, báo rõ dữ liệu chưa được lưu và cho thử lại; không giả định đã nộp.

### 4.3 Danh sách màn hình

| Mã | Màn hình | Vai trò | Mục tiêu | Ưu tiên |
|---|---|---|---|---|
| SCR-01 | Đăng nhập | Admin, Giám khảo | Xác thực tài khoản | Cao |
| SCR-02 | Tổng quan theo vai trò | Admin, Giám khảo | Công việc và tiến độ | Cao |
| SCR-03 | Danh sách cuộc thi | Admin | Tìm, tạo, mở cuộc thi | Cao |
| SCR-04 | Tổng quan cuộc thi | Admin | Trung tâm điều hướng của một cuộc thi | Cao |
| SCR-05 | Thí sinh và lượt thi | Admin | Quản lý roster, mã và thứ tự | Cao |
| SCR-06 | Vòng thi và rubric | Admin | Chính sách vòng và bộ tiêu chí | Cao |
| SCR-07 | Phân công Giám khảo | Admin | Chọn/tạo Giám khảo, gán phạm vi chấm | Cao |
| SCR-08 | Điều phối trực tiếp | Admin | Bắt đầu và điều khiển lượt live | Cao |
| SCR-09 | Danh sách Chấm thi | Giám khảo | Tìm lượt và trạng thái công việc | Cao nhất |
| SCR-10 | Phiếu chấm | Giám khảo | Nhập điểm, lưu nháp, nộp | Cao nhất |
| SCR-11 | Theo dõi phiếu | Admin | Kiểm tra coverage và trạng thái phiếu | Cao |
| SCR-12 | Kết quả vòng thi | Admin, Giám khảo được phân công | Khóa/công bố hoặc xem snapshot | Cao |
| SCR-13 | Nhật ký hoạt động | Admin | Truy vết thao tác | Trung bình |
| SCR-14 | Tạo/quản lý tài khoản Giám khảo | Admin | Tạo, đặt lại mật khẩu, thu hồi session | Trung bình |

### 4.4 Đặc tả từng màn hình

#### SCR-01 — Đăng nhập
- **Vai trò/mục tiêu:** Admin, Giám khảo; vào đúng workspace theo role.
- **Dữ liệu:** username/email, password, tùy chọn giữ đăng nhập trên thiết bị.
- **Chức năng/thao tác:** nhập thông tin, hiện/ẩn mật khẩu, đăng nhập; liên kết tới thiết lập ban đầu chỉ khi hệ thống chưa có Admin.
- **Điều hướng/quy tắc:** Admin → Tổng quan; Giám khảo → Chấm thi. Tài khoản inactive không được vào.
- **Validation/ngoại lệ:** thiếu trường, sai thông tin, session hết hạn, lỗi máy chủ.
- **Trạng thái:** idle, submitting, lỗi xác thực, khóa/vô hiệu hóa, success.
- **Responsive:** Mobile 390/360/320 một cột, bàn phím không che submit; Tablet/desktop form gọn, không kéo giãn quá rộng.

#### SCR-02 — Tổng quan theo vai trò
- **Vai trò/mục tiêu:** Admin xem việc cần xử lý và tiến độ; Giám khảo biết việc tiếp theo.
- **Dữ liệu:** số cuộc thi/thí sinh/giám khảo hoặc số lượt được giao/phiếu đã nộp; tiến độ; hoạt động gần đây; danh sách cuộc thi/phân công.
- **Chức năng/thao tác:** mở cuộc thi, tiếp tục chấm, xem kết quả, tạo cuộc thi nếu Admin.
- **Điều hướng:** Admin đăng nhập → Dashboard (/); Giám khảo đăng nhập → Danh sách Chấm thi (/judge). Cả hai có thể mở Dashboard từ menu.
- **Quy tắc/validation:** production phải hiển thị dữ liệu thực theo role; Figma/prototype có thể dùng dữ liệu demo đại diện, hợp lệ theo nghiệp vụ và được ghi nhãn demo.
- **Trạng thái:** loading, empty riêng cho từng role, error/retry, populated. Dashboard Giám khảo là trang điều hướng thứ cấp; không thay thế landing page Chấm thi.
- **Responsive:** Mobile xếp ưu tiên hành động trước, không lặp KPI; Tablet 2 cột khi đủ chỗ; Desktop dashboard có vùng tiến độ và danh sách.

#### SCR-03 — Danh sách cuộc thi
- **Vai trò/mục tiêu:** Admin quản lý các cuộc thi không lưu trữ.
- **Dữ liệu:** tên, đơn vị, thời gian, hình thức, trạng thái, số vòng/thí sinh/tiến độ.
- **Chức năng/thao tác:** tìm/lọc/sắp xếp, tạo mới (biến thể form thuộc SCR-03), mở chi tiết, nhân bản, lưu trữ.
- **Điều hướng:** mở một dòng → SCR-04; tạo mới → form tạo cuộc thi; Hủy quay lại danh sách. Thành công tạo chuyển đến SCR-04 của cuộc thi mới.
- **Quy tắc/ngoại lệ:** không thao tác cuộc thi khi không có quyền; xác nhận trước lưu trữ/nhân bản; cảnh báo khi hành động ảnh hưởng dữ liệu.
- **Trạng thái:** loading, empty, search no-result, error, populated; form create idle, validation, submitting, server error, success.
- **Responsive:** Mobile card/list có trạng thái và CTA; bộ lọc trong sheet; form tạo xếp một cột và giữ Hủy/Tạo dễ chạm; Tablet list rộng hơn; Desktop bảng có cột và thao tác hàng, form giới hạn chiều rộng, không cuộn ngang trang.

**Biến thể form Tạo cuộc thi (SCR-03):**

| Trường | Bắt buộc | Quy tắc/validation |
|---|---|---|
| Tên cuộc thi | Có | Trim khoảng trắng; 3–180 ký tự. |
| Mô tả | Không | Tối đa 5.000 ký tự. |
| Đơn vị tổ chức | Không | Tối đa 180 ký tự. |
| Địa điểm/đường dẫn | Không | Tối đa 240 ký tự; nhãn gợi ý thay đổi theo hình thức. |
| Hình thức | Có giá trị mặc định | Trực tiếp / Trực tuyến / Kết hợp; mặc định Trực tiếp. |
| Tên vòng thi đầu tiên | Có trên form | Mặc định “Vòng sơ khảo”; 2–160 ký tự. API có giá trị mặc định nếu trường bị bỏ qua. |
| Ngày bắt đầu, ngày kết thúc | Không | Ngày kết thúc phải bằng hoặc sau ngày bắt đầu; chấp nhận bỏ trống. |

Nút **Tạo cuộc thi** gửi form; trạng thái đang gửi khóa thao tác gửi lặp. **Hủy** quay về SCR-03. Lỗi validation hiển thị cạnh trường hoặc ở đầu form kèm giữ nguyên dữ liệu; lỗi máy chủ hiển thị thông báo và cho thử lại. Thành công tạo cuộc thi, vòng đầu tiên, rubric mặc định và phiên điều phối, rồi chuyển đến SCR-04. Đây là biến thể/form của SCR-03, không cộng thành SCR thứ 15.

#### SCR-04 — Tổng quan cuộc thi
- **Vai trò/mục tiêu:** Admin nắm trạng thái cuộc thi và vào các phân hệ.
- **Dữ liệu:** tên, mô tả, đơn vị, địa điểm/hình thức, thời gian, trạng thái, vòng, thí sinh, phân công, phiếu và cảnh báo.
- **Chức năng/thao tác:** xem và sửa thông tin cuộc thi (biến thể form trong SCR-04), nhân bản/lưu trữ/đóng sớm theo quyền; điều hướng đến SCR-05–08, SCR-11–13.
- **Form sửa thông tin:** các trường Tên cuộc thi (bắt buộc, 3–180 ký tự), Mô tả (tùy chọn, tối đa 5.000), Đơn vị tổ chức (tùy chọn, tối đa 180), Địa điểm/đường dẫn (tùy chọn, tối đa 240), Hình thức (Trực tiếp/Trực tuyến/Kết hợp), Ngày bắt đầu và Ngày kết thúc (tùy chọn; kết thúc không được trước bắt đầu). Không sửa tên vòng đầu tiên tại đây; vòng được quản lý trong khu vực vòng/rubric.
- **Thao tác form:** **Lưu thay đổi** gửi cập nhật và báo thành công/lỗi. Đề xuất bổ sung **Hủy** để bỏ thay đổi chưa lưu và khôi phục dữ liệu đang có; đây là cải tiến giao diện chưa có trong UI hiện tại, cần PM duyệt theo Q-11 trước khi prototype được chốt. Khi đang lưu, khóa thao tác gửi lặp. Lỗi validation chỉ rõ trường; lỗi quyền giữ màn ở chế độ xem và giải thích cách quay lại.
- **Quyền/trạng thái không cho sửa:** hiện tại API cho Admin sửa thông tin ở mọi trạng thái cuộc thi, kể cả COMPLETED/ARCHIVED; người không phải Admin nhận 403 và chỉ có quyền xem theo membership. Không có quy tắc khóa sửa theo trạng thái trong code hiện tại. Designer cần thể hiện read-only/access-denied khi không có quyền; không tự dựng khóa theo trạng thái trước khi PM/Developer chốt Q-10. Đóng sớm vẫn yêu cầu lý do 10–2.000 ký tự.
- **Trạng thái:** loading, not found, access denied/read-only, form idle/dirty, saving/saved, validation/server error, empty setup, ready, live, completed, archived.
- **Responsive:** Mobile thông tin tổng quan trên đầu, các mục thành danh sách điều hướng; form xếp một cột với Lưu và Hủy (nếu Q-11 được duyệt) dễ chạm; Tablet chia khối; Desktop dùng sidebar/tab nội bộ và form giới hạn chiều rộng.

#### SCR-05 — Thí sinh và lượt thi
- **Vai trò/mục tiêu:** Admin quản lý hồ sơ thí sinh và entries theo vòng.
- **Dữ liệu:** tên, đơn vị, email/phone/note nếu có, mã dự thi, tiêu đề lượt, vòng, sequence và trạng thái.
- **Chức năng/thao tác:** tạo/sửa/đưa vào vòng, đổi thứ tự, lọc/tìm, nhập CSV, xem preview và xác nhận.
- **Điều hướng:** từ SCR-04; chọn entry có thể mở chi tiết/chấm trạng thái.
- **Validation/ngoại lệ:** tên bắt buộc; email đúng định dạng; mã lượt duy nhất trong vòng; CSV tối đa 1 MB/500 dòng; lỗi theo dòng; dữ liệu bị khóa khi vòng có điểm/đã bắt đầu.
- **Trạng thái:** empty, loading, validation, preview, import error, import success, locked.
- **Responsive:** Mobile card/list và form từng bước; reorder qua điều khiển lên/xuống thay kéo khó; Tablet/desktop table; CSV mobile qua file picker nhưng tối ưu cho màn hình lớn.

#### SCR-06 — Vòng thi và rubric
- **Vai trò/mục tiêu:** Admin định nghĩa cách chấm cho từng vòng.
- **Dữ liệu:** tên/thứ tự/trạng thái; ẩn danh; số Giám khảo yêu cầu; cho thiếu phiếu; aggregate; tie-break; độ chính xác; publishScores; tiêu chí min/max/step/weight/commentRequired.
- **Chức năng/thao tác:** thêm/sửa/sắp xếp vòng; tạo rubric/version; thêm/sửa/sắp xếp tiêu chí; preview và kích hoạt.
- **Điều hướng:** SCR-04 → danh sách vòng → chi tiết vòng/rubric.
- **Validation/ngoại lệ:** tên bắt buộc; min ≤ max; step > 0; weight hợp lệ; sequence duy nhất; không thay đổi rubric version đã được phiếu sử dụng.
- **Trạng thái:** chưa có vòng/rubric, editing, preview, active, locked, validation/error.
- **Responsive:** Mobile accordion/stepper, mỗi criterion một khối; không bảng nhiều cột; Tablet form 2 cột; Desktop có danh sách tiêu chí và preview cạnh nhau.

#### SCR-07 — Phân công Giám khảo
- **Vai trò/mục tiêu:** Admin đảm bảo từng lượt có coverage cần thiết.
- **Dữ liệu:** tên/username/email tùy có, tài khoản active, vòng, entry hoặc phạm vi cả vòng, thời điểm phân công, số Giám khảo yêu cầu/thực có.
- **Chức năng/thao tác:** tìm/chọn tài khoản, tạo mới qua SCR-14, gán/gỡ phân công, xem thiếu coverage.
- **Điều hướng:** SCR-04 → phân công; tạo tài khoản mới quay lại màn này sau khi lưu.
- **Validation/ngoại lệ:** không gán user inactive; không gán trùng phạm vi; cảnh báo lượt thiếu; xác nhận gỡ phân công sau khi có phiếu.
- **Trạng thái:** no judges, no assignment, incomplete coverage, complete, loading, error, locked.
- **Responsive:** Mobile chọn vòng rồi chọn lượt/giám khảo theo bước; từng assignment thành card; Tablet 2-pane; Desktop bảng ma trận có filter.

#### SCR-08 — Điều phối trực tiếp
- **Vai trò/mục tiêu:** Admin vận hành phiên của một vòng.
- **Dữ liệu:** tên vòng, state/version, lượt hiện tại và kế tiếp, tổng entry active, coverage, tiến độ phiếu.
- **Chức năng/thao tác:** start, previous/next/select, pause/resume, finish; refresh trạng thái.
- **Điều hướng:** SCR-04/SCR-06 → live; kết thúc → SCR-11/SCR-12.
- **Validation/ngoại lệ:** phải có entry, rubric active; thiếu coverage bị chặn hoặc yêu cầu lý do nếu policy cho phép; stale version cần tải lại; không finish từ IDLE/COMPLETED.
- **Trạng thái:** IDLE, LIVE, PAUSED, COMPLETED, preflight warning, stale state, error.
- **Responsive:** Mobile một hành động chính mỗi lần, entry hiện tại nổi bật, nút lớn; Tablet/desktop có danh sách lượt và bảng tiến độ cạnh nhau.

#### SCR-09 — Danh sách Chấm thi
- **Vai trò/mục tiêu:** Giám khảo tìm đúng lượt được giao và biết có thể bắt đầu hay cần chờ.
- **Dữ liệu:** cuộc thi, vòng, entryCode, tên/đơn vị nếu không ẩn danh, round sequence, trạng thái task, draft/submission/score và thông báo.
- **Chức năng/thao tác:** tìm/lọc theo cuộc thi/vòng/trạng thái, mở lượt hợp lệ, tiếp tục nháp, xem phiếu đã nộp.
- **Điều hướng:** mặc định sau login; mở entry → SCR-10; kết quả → SCR-12.
- **Quy tắc/ngoại lệ:** lượt unassigned không xuất hiện; WAITING không mở; DRAFT/REOPENED tiếp tục được; LOCKED/UNAVAILABLE chỉ đọc.
- **Trạng thái:** no assignments, waiting, live, ready, draft, submitted, locked, unavailable, error.
- **Responsive:** Mobile là màn hình chính sau đăng nhập; card 1 cột, trạng thái bằng chữ, filter gọn; Tablet/Desktop có thể list 2 pane + detail preview.

#### SCR-10 — Phiếu chấm
- **Vai trò/mục tiêu:** Giám khảo nhập đánh giá có kiểm soát.
- **Dữ liệu:** entry/round/anonymous info, rubric version, tiêu chí và hướng dẫn, thang điểm, trọng số, nhận xét, tổng điểm, trạng thái lưu.
- **Chức năng/thao tác:** nhập điểm/nhận xét; tự lưu nháp lên máy chủ sau khoảng 900 ms kể từ thay đổi; nút **Lưu nháp** là thao tác lưu thủ công ngay, dùng cùng cơ chế lưu nháp để người dùng chủ động xác nhận/lưu trước khi rời trang; retry khi lỗi; xem tổng điểm; nộp; xem phiếu chỉ đọc.
- **Điều hướng:** SCR-09 → phiếu; submit → confirmation/receipt rồi SCR-09 hoặc view read-only.
- **Validation/ngoại lệ:** điểm nằm trong range và khớp step; criterion thuộc active/pinned rubric; bắt buộc comment; không sửa SUBMITTED trừ khi REOPENED; không lưu nếu chưa được điều phối (ngoại trừ draft đang tiếp tục).
- **Trạng thái:** loading rubric, saving/saved, unsaved/error/offline, validation, ready to submit, submitted, locked/read-only. Khi autosave lỗi, giữ dữ liệu đang nhập, hiện lỗi và cho thử lại; nút Lưu nháp vẫn khả dụng khi có thể gửi yêu cầu.
- **Nộp khi đang lưu:** chỉ xem là nộp thành công sau khi máy chủ xác nhận yêu cầu submit. Nếu autosave đang chạy hoặc còn debounce, tuần tự hóa/hủy đúng yêu cầu lưu cũ để không ghi đè phiếu đã nộp; chỉ chuyển trạng thái/điều hướng sau phản hồi thành công. Nếu yêu cầu lỗi, giữ nguyên điểm/nhận xét trên form, thông báo chưa nộp và cho thử lại. Chiến lược serialize/cancel request cần PM/Developer chốt theo Q-12.
- **Responsive:** Mobile một cột, bàn phím số, sticky footer có tổng điểm + trạng thái lưu + Lưu nháp + Nộp phiếu nhưng không che trường; khi lưu đang diễn ra, trạng thái và khả năng nộp phải rõ. Tablet chia phần thông tin/rubric khi đủ chiều rộng; Desktop form và tổng điểm/tiến độ song song. Autosave là mặc định; Lưu nháp là nút lưu ngay dự phòng/chủ động, không phải cơ chế lưu thứ hai.

#### SCR-11 — Theo dõi phiếu
- **Vai trò/mục tiêu:** Admin nhận biết đủ điều kiện khóa chưa.
- **Dữ liệu:** entry, mã/tên theo ẩn danh, required count, submitted count, từng Judge, trạng thái phiếu, tổng điểm.
- **Chức năng/thao tác:** chọn vòng, lọc đủ/thiếu/nháp/đã nộp, mở phiếu, reopen với lý do, đi tới kết quả.
- **Điều hướng:** SCR-04/SCR-08 → theo dõi; chọn phiếu → chi tiết/reopen; đủ điều kiện → SCR-12.
- **Validation/ngoại lệ:** phiếu SUBMITTED có thể mở lại; phiếu DRAFT chỉ có thể mở lại nếu snapshot cũ đã tồn tại, thường là bản nháp trong đợt chỉnh sửa được khởi tạo bằng thao tác mở lại phiếu đã nộp. Đây không cho phép bỏ qua điều kiện khóa phiên bản mới: DRAFT/REOPENED vẫn chặn khóa tiếp. Reason bắt buộc 10–2.000 ký tự; không mở lại nếu cuộc thi đã đóng sớm. Khi thành công phiếu=REOPENED, vòng=READY, phiên=PAUSED; snapshot cũ vẫn xem trong lịch sử.
- **Trạng thái:** complete, missing, draft, reopened, locked, no entries, error.
- **Responsive:** Mobile summary theo entry, chi tiết Judge mở dạng disclosure; Tablet list + detail; Desktop bảng ma trận có filter/export.

#### SCR-12 — Kết quả vòng thi
- **Vai trò/mục tiêu:** Admin kiểm tra, khóa/công bố; Giám khảo xem snapshot đã công bố.
- **Dữ liệu:** rank, mã, thí sinh/ẩn danh, điểm tổng, số phiếu/required count, điểm theo tiêu chí/Judge theo policy, snapshot version/lockedAt.
- **Chức năng/thao tác:** Admin xem preview, lock, nhập lý do ngoại lệ nếu thiếu phiếu, publish, export CSV; Judge chỉ xem.
- **Điều hướng:** SCR-11 → kết quả; publish → cùng trang ở trạng thái công bố; Judge từ menu/chi tiết cuộc thi.
- **Validation/ngoại lệ:** phải finish session; không còn draft/reopened; entry có đủ phiếu, hoặc exception được bật và có lý do; publish chỉ sau lock.
- **Trạng thái:** no result, blocked with missing list, locked private, published, new snapshot version.
- **Responsive:** Mobile leaderboard thành list/card có hạng/điểm, chi tiết mở theo entry; Tablet list; Desktop bảng có sort và export controls.

#### SCR-13 — Nhật ký hoạt động
- **Vai trò/mục tiêu:** Admin truy vết thao tác nghiệp vụ.
- **Dữ liệu:** thời gian, actor, action, entity type/id, competition, details.
- **Chức năng/thao tác:** lọc theo action/actor/thời gian, mở chi tiết event.
- **Điều hướng:** SCR-04 → Nhật ký; quay lại entity nếu có link.
- **Quy tắc/ngoại lệ:** read-only; không expose secrets/passwords; event đã ghi không chỉnh sửa.
- **Trạng thái:** loading, no events, filtered-empty, error, populated.
- **Responsive:** Mobile từng event thành timeline/card; Tablet list; Desktop bảng + panel chi tiết.

#### SCR-14 — Tạo/quản lý tài khoản Giám khảo
- **Vai trò/mục tiêu:** Admin tạo tài khoản lúc phân công hoặc cập nhật/reset tài khoản.
- **Dữ liệu:** full name, username, email nếu có, active state; không hiển thị password hash.
- **Chức năng/thao tác:** tạo tài khoản Giám khảo với mật khẩu ban đầu hoặc chọn tài khoản hiện có trong luồng phân công; reset mật khẩu và thu hồi các session cũ từ assignment.
- **Điều hướng:** đây là dialog/drawer thuộc luồng SCR-07, không phải khu vực user-management độc lập; lưu xong quay lại đúng bước/phạm vi phân công đang thao tác.
- **Validation/ngoại lệ:** username/email unique nếu cung cấp; password theo chính sách hiện hành; reset phải thu hồi session cũ; chỉ Admin.
- **Trạng thái/biến thể:** tạo tài khoản mới; chọn tài khoản hiện có; cập nhật/reset mật khẩu; validation; success; username/email trùng; forbidden; error. Thiết kế theo ngữ cảnh SCR-07 và giữ dữ liệu/phạm vi phân công đang chọn khi đóng hoặc quay lại.
- **Responsive:** Mobile full-screen sheet/form; Tablet dialog; Desktop side panel/modal, focus vào thao tác hiện tại.

## 5. Dữ liệu và quy tắc nghiệp vụ

- **Đối tượng:** User, Competition, Round, Contestant, Entry, JudgeAssignment, RubricVersion/Criterion, ScoreSheet/Detail, LiveSession, ResultSnapshot, AuditEvent.
- **Cuộc thi:** tên, slug, mô tả, đơn vị, địa điểm, hình thức onsite/online/hybrid, thời gian, trạng thái.
- **Rubric:** tiêu chí có mô tả, min/max, step, weight, thứ tự và cờ commentRequired.
- **Phiếu:** duy nhất cho mỗi cặp lượt/Giám khảo; lưu trạng thái, phiên bản rubric, tổng điểm, thời điểm nộp, lý do mở lại và điểm/bình luận từng tiêu chí.
- **Trạng thái cuộc thi:** DRAFT, REGISTRATION, READY, LIVE, COMPLETED, ARCHIVED. Vòng: DRAFT, READY, LIVE, COMPLETED. Phiên: IDLE, LIVE, PAUSED, COMPLETED. Phiếu: DRAFT, SUBMITTED, REOPENED.
- **Trạng thái lượt:** ACTIVE, WITHDRAWN, DISQUALIFIED, ADVANCED, ELIMINATED.
- **Validation:** điểm thuộc tiêu chí, trong khoảng min/max và đúng step; nhận xét bắt buộc cần có trước khi nộp.
- **Tính điểm:** Điểm mỗi Giám khảo là trung bình có trọng số, chuẩn hóa theo tổng trọng số. Điểm giữa Giám khảo là trung bình cộng hoặc trung vị; làm tròn theo cấu hình vòng. Xếp hạng mặc định theo điểm tổng; cấu hình tie-break theo ưu tiên tiêu chí có thể áp dụng.
- **Khóa kết quả:** phiên đã kết thúc, không còn nháp/phiếu mở lại, có thí sinh và đủ số phiếu; ngoại lệ thiếu phiếu yêu cầu lý do. Snapshot có phiên bản và không bị xóa khi mở lại phiếu.
- **Quyền xem:** Admin xem dữ liệu cuộc thi; Giám khảo chỉ xem nhiệm vụ được giao và kết quả đã công bố của cuộc thi mình được phân công. Điểm từng Giám khảo phụ thuộc cấu hình công bố.
- **CSV:** nhập thí sinh tối đa 1 MB và 500 dòng theo phạm vi MVP; có preview và báo lỗi. Xuất kết quả gồm điểm tổng, điểm theo Giám khảo/tiêu chí và số phiếu.
- **Mạng/audit:** Lưu nháp cần máy chủ, chưa có chấm offline. Điều phối, mở lại, khóa/công bố cần ghi audit.

## 6. Tương tác và trạng thái UI

| Tình huống | Hành vi cần thiết kế |
|---|---|
| Autosave/lưu nháp thành công | Tự lưu sau khoảng 900 ms kể từ thay đổi; nút “Lưu nháp” gửi lưu ngay. Cả hai cùng lưu DRAFT; hiện “Đã lưu”/thời điểm và ở lại phiếu |
| Đang lưu/mất mạng | Hiện rõ trạng thái chưa lưu; giữ nội dung nhập nếu có thể; có thử lại |
| Nộp khi lưu nháp đang chờ/chạy | Không gửi hai lần ghi đồng thời; xử lý request đang chạy, gửi bản mới nhất để nộp và chỉ báo thành công khi server xác nhận |
| Nộp thành công | Chỉ sau response thành công mới chuyển phiếu sang chỉ đọc/điều hướng và cập nhật tiến độ |
| Nộp thất bại | Ở lại form, giữ điểm/nhận xét, nói rõ phiếu chưa được nộp và cho thử lại |
| Thiếu điểm/nhận xét | Báo ngay tại tiêu chí tương ứng |
| Lượt đang chờ | Giải thích cần Admin điều phối |
| Phiếu bị khóa | Chỉ đọc và hướng dẫn liên hệ Admin |
| Mở lại phiếu | Yêu cầu lý do và xác nhận; giữ snapshot trước |
| Khóa khi thiếu phiếu | Nêu lượt thiếu; yêu cầu lý do nếu chính sách cho phép ngoại lệ |
| Công bố | Nêu vòng/snapshot được công bố; cập nhật quyền xem sau thành công |
| Danh sách rỗng | Nêu nguyên nhân và CTA theo vai trò |
| Không đủ quyền | Ẩn tác vụ không hợp lệ; nếu mở URL trực tiếp, giải thích và cho quay lại |
| Xóa/lưu trữ | Xác nhận đối tượng và hậu quả; phân biệt lưu trữ với xóa |

- Bao gồm default, loading, empty, error, success, validation, disabled, read-only và permission denied ở nơi phù hợp.
- **Đề xuất thiết kế Q-04:** Có hộp thoại xác nhận trước khi nộp phiếu vì thao tác này khóa phiếu; PM duyệt trước khi prototype được chốt.

## 7. Phạm vi Responsive Web — Mobile First

### 7.1 Kích thước và nguyên tắc

| Thiết bị | Frame | Vai trò trong thiết kế |
|---|---:|---|
| Mobile chuẩn | 390 × 844 px | Bắt đầu thiết kế tại đây, ưu tiên luồng chấm của Giám khảo |
| Mobile nhỏ | 360 × 800 và 320 × 568 px | Kiểm tra nội dung dài, bàn phím, sticky actions và tràn ngang |
| Tablet | 768 × 1024 px | Thiết kế chuyển tiếp, có thể dùng panel đôi khi nội dung cho phép |
| Desktop | 1440 × 900 px | Không gian quản trị, bảng và nhiều cột |

**Phạm vi đề xuất cho bản thiết kế (chờ reviewer duyệt):** cả 14 màn hình có layout Mobile, Tablet và Desktop. Không có màn hình chỉ thiết kế Desktop. Các màn hình cấu hình/bảng ưu tiên tác vụ chính trên Mobile; nhập dữ liệu hàng loạt có thể thuận tiện hơn trên Tablet/Desktop nhưng không được làm mất chức năng.

### 7.2 Ma trận Responsive theo màn hình

| Mã | Mobile | Tablet | Desktop |
|---|---|---|---|
| SCR-01 Đăng nhập | Một cột, form vừa màn hình, bàn phím không che nút | Form căn giữa, chiều rộng giới hạn | Form gọn, không kéo rộng |
| SCR-02 Tổng quan | Tách biến thể Admin/Giám khảo; ưu tiên việc cần làm theo vai trò; KPI gọn; list một cột | Lưới 2 cột khi đủ chỗ, nội dung theo vai trò | Vùng tiến độ + danh sách/hoạt động theo vai trò |
| SCR-03 Danh sách cuộc thi | Cards, search/filter trong sheet, không bảng ngang; form tạo một cột | Bảng gọn hoặc list có cột phụ; form giới hạn chiều rộng | Bảng có sort/filter và actions; form giới hạn chiều rộng |
| SCR-04 Tổng quan cuộc thi | Thông tin cốt lõi trước, các khu vực thành list; form sửa một cột | Các section 2 cột; form theo lưới khi đủ chỗ | Sidebar/tab và nhiều panel; form giới hạn chiều rộng |
| SCR-05 Thí sinh/lượt thi | Cards, form tuần tự, reorder bằng nút, CSV qua file picker | Bảng có scroll trong vùng giới hạn | Table, bulk actions và preview CSV |
| SCR-06 Vòng/rubric | Stepper/accordion, mỗi criterion thành khối | Form và preview có thể song song | Editor rubric và preview cạnh nhau |
| SCR-07 Phân công | Chọn vòng/lượt/giám khảo theo bước; assignment thành cards | List + detail panel | Ma trận phân công và filter |
| SCR-08 Điều phối | Lượt hiện tại và nút điều khiển lớn; trạng thái luôn thấy | Điều khiển + queue | Live control + queue/progress cạnh nhau |
| SCR-09 Danh sách Chấm thi | Màn vào chính; list 1 cột; trạng thái/CTA rõ | List + preview | Queue nhiều cột hoặc list/detail |
| SCR-10 Phiếu chấm | Một cột; numeric input; dock không che field | Form + summary khi đủ chỗ | Form + panel tổng điểm/tiến độ |
| SCR-11 Theo dõi phiếu | Summary theo entry; mở detail theo Judge | List + detail | Bảng ma trận, filter và thao tác |
| SCR-12 Kết quả | Ranking cards; detail theo entry; actions xếp gọn | List/bảng gọn + detail | Bảng xếp hạng, filter/export/publish |
| SCR-13 Nhật ký | Timeline/cards, filter trong sheet | List + detail | Bảng audit + panel chi tiết |
| SCR-14 Tài khoản Giám khảo | Full-screen sheet/form, field dễ nhập; biến thể tạo/chọn/reset | Dialog/form theo tác vụ | Side panel/modal, giữ ngữ cảnh phân công; biến thể tạo/chọn/reset |

### 7.3 Yêu cầu Mobile First và responsive

- Mỗi layout được thiết kế từ 390 px rồi mở rộng; không dùng bản Desktop thu nhỏ làm thiết kế Mobile.
- Màn hình cần cuộn dọc; không cuộn ngang toàn trang. Bảng đổi thành card/list hoặc có vùng cuộn ngang được giới hạn, kèm cột định danh cố định nếu cần.
- Vùng chạm mục tiêu tối thiểu khoảng 44 × 44 px; màu trạng thái đi cùng nhãn chữ; focus/keyboard navigation vẫn rõ.
- Bàn phím số không che điểm đang nhập hoặc trạng thái lưu; sticky footer có tổng điểm, trạng thái lưu và hai hành động Lưu nháp/Nộp phiếu, không che nội dung cuối và tính safe area.
- **Designer:** kiểm tra layout/Auto Layout của đủ 14 screen family ở 320 px trong Figma; không bắt buộc tạo frame riêng cho mỗi biến thể nếu có thể thu hẹp frame và xác minh constraints. Cho phép nội dung xếp thêm dòng nhưng không ẩn CTA, điểm, hạng hoặc trạng thái cần để ra quyết định.
- **Developer/QA:** sau khi giao diện được lập trình, kiểm tra trình duyệt thực tế ở 320 px cho 14 screen family/biến thể theo checklist; xác nhận không cuộn ngang toàn trang, không bị cắt nội dung/CTA, và ghi lỗi cùng bằng chứng. Figma review không thay thế browser QA; browser QA không phải deliverable trước khi có bản code.
- Kiểm tra tên tiếng Việt dài, tên cuộc thi dài, nhiều tiêu chí, số lượng phiếu lớn và error messages.
- Định hướng tác vụ theo thiết bị: Giám khảo hoàn tất toàn bộ luồng chấm trên Mobile; Admin thao tác kiểm tra/điều phối trên Mobile, cấu hình và nhập lô thuận tiện hơn trên Tablet/Desktop.
- **Offline:** Không hỗ trợ chấm khi mất mạng; phải biểu đạt rõ draft chưa lưu và có retry.
- **Trình duyệt mục tiêu đề xuất:** Chrome Android, Safari iOS, Chrome/Edge desktop phiên bản hiện hành. CẦN Developer xác nhận phiên bản tối thiểu trước khi phát hành.
## 8. Định hướng hình ảnh

- **Phong cách:** Công cụ vận hành cuộc thi chuyên nghiệp, rõ ràng, dễ quét và ít gây nhầm lẫn.
- **Màu tham chiếu hiện tại:** navy #102F48, xanh hành động #0B659B, nền #F3F6F8, chữ #152B3B; màu trạng thái xanh lá/amber/đỏ dùng nhất quán. Designer có thể đề xuất tinh chỉnh và cần kiểm tra tương phản.
- **Font hiện tại:** Be Vietnam Pro.
- **Brand:** Dùng logo/asset HUIT ContestFlow hiện có; không tự vẽ lại logo.
- **Dark Mode:** Chưa có trong MVP; chưa yêu cầu thiết kế.
- **Bố cục:** phân cấp bằng typography/spacing/trạng thái; tránh lặp chỉ số và dashboard mosaic.
- **Tham chiếu:** giao diện hiện tại và docs/ux-ui-audit/evidence/responsive; dùng để hiểu vấn đề, không phải mẫu phải sao chép.
- **Thuật ngữ:** cuộc thi, vòng thi, lượt thi, phiếu chấm, tiêu chí/rubric, khóa kết quả, công bố.

## 9. Phạm vi thiết kế và bàn giao Designer

**Phạm vi bắt buộc:** thiết kế đầy đủ cả 14 màn hình trên Mobile, Tablet và Desktop theo ma trận mục 7. Mỗi màn hình phải có layout thích ứng tại cả ba nhóm thiết bị; chỉ ưu tiên theo thứ tự dưới đây, không loại màn hình nào khỏi phạm vi responsive.

**Ưu tiên Wireframe Mobile trước:**
1. P1: SCR-09 Danh sách Chấm thi và SCR-10 Phiếu chấm — duyệt trước vì là luồng chính của Giám khảo.
2. P2: SCR-02 Tổng quan, SCR-08 Điều phối, SCR-11 Theo dõi phiếu, SCR-12 Kết quả.
3. P3: SCR-01 Đăng nhập, SCR-03 Danh sách cuộc thi, SCR-04 Tổng quan cuộc thi, SCR-05 Thí sinh, SCR-06 Vòng/rubric, SCR-07 Phân công, SCR-13 Nhật ký, SCR-14 Tài khoản.

**Sau khi wireframe Mobile được review:** hoàn thiện UI cho tất cả 14 màn hình tại Mobile, Tablet và Desktop. Designer xác minh Auto Layout ở 320 px trong Figma cho đủ 14 screen family; không cần thêm frame riêng cho từng nhóm nếu có thể kiểm tra trực tiếp constraints. Developer/QA kiểm tra trên browser thực tế sau triển khai, ghi bằng chứng và lỗi. 360 px là kích thước kiểm tra bổ sung cho flow ưu tiên SCR-01/09/10/12.

**Quy tắc đếm và biến thể Figma:** 14 mã SCR là 14 nhóm màn hình/ngữ cảnh nghiệp vụ, không phải giới hạn mỗi breakpoint chỉ có đúng 14 frame. Designer tạo các frame/variant cần thiết để thể hiện khác biệt vai trò, trạng thái và ngữ cảnh; không nhân bản frame nếu chỉ đổi nội dung không làm đổi bố cục hoặc hành vi.

| Nhóm | Biến thể tối thiểu cần bàn giao |
|---|---|
| SCR-02 Tổng quan | Admin và Giám khảo: điều hướng, KPI, nội dung và CTA theo quyền/mục tiêu riêng; đủ trạng thái dữ liệu rỗng/lỗi phù hợp. |
| SCR-03 Tạo cuộc thi | Form với required/optional, length limits, date validation, idle/submitting/error/success, Hủy; dữ liệu giữ lại khi có lỗi. |
| SCR-04 Sửa cuộc thi | Form nạp dữ liệu hiện tại, dirty/saving/saved/error, Lưu; Hủy là cải tiến UX đề xuất, cần Q-11; read-only/access denied; không giả định khóa theo trạng thái khi Q-10 chưa duyệt. |
| SCR-10 Phiếu chấm | Đang chấm/chưa lưu; đang lưu/đã lưu; lỗi lưu/mất mạng; xác nhận nộp; submit trong lúc autosave chờ/chạy theo quyết định Q-12; đã nộp chỉ đọc; snapshot khóa; DRAFT/REOPENED trong đợt sửa sau khi mở lại. |
| SCR-11 Theo dõi phiếu | Snapshot chưa có; đã khóa; có bản nháp/phiếu mở lại chặn khóa phiên bản mới; mở dialog lý do; trạng thái phiên sau mở lại. |
| SCR-14 Tài khoản Giám khảo | Tạo tài khoản; chọn tài khoản hiện có; cập nhật/reset mật khẩu; validation/trùng; thành công/lỗi. Luôn thể hiện như dialog/sheet/panel gắn với SCR-07 và đường quay lại giữ ngữ cảnh. |

SCR-14 là overlay/form trong SCR-07, không phải trang độc lập thứ mười lăm. Ở mỗi breakpoint, prototype phải cho thấy cách mở, đóng/quay lại, giữ dữ liệu phân công và focus; thiết kế riêng kích thước overlay theo quy tắc mục 7.

- [x] Sitemap và user flow nghiệp vụ ở dạng văn bản trong brief.
- [ ] Designer dựng sơ đồ sitemap và flow trực quan trong Figma cùng giai đoạn Wireframe; cần có nhánh điều kiện, lỗi, retry, quay lại và đích đến.
- [ ] Wireframe Mobile cho cả 14 màn hình; review P1 trước, sau đó P2/P3.
- [ ] UI Responsive cho đủ 14 màn hình tại Mobile/Tablet/Desktop.
- [ ] Design system: màu, typography, spacing, button, input, form, trạng thái, navigation, dialog, list/table.
- [ ] Prototype các flow Admin và Giám khảo, gồm ngoại lệ/reopen.
- [ ] UI states gồm mất mạng, thiếu phiếu, chờ điều phối, chỉ đọc và permission denied.
- [ ] Figma handoff: frame/page đặt tên rõ, component dùng lại, breakpoint và behavior được ghi chú.
- [ ] Figma có các biến thể theo vai trò/trạng thái/ngữ cảnh tối thiểu ở trên; 14 SCR được hiểu là screen family, còn SCR-14 là dialog/sheet/panel con của SCR-07.
- [ ] Kiểm tra accessibility và Mobile 320 px.
## 10. Trạng thái quyết định và câu hỏi Q-01 đến Q-12

**Quy ước:** “Đã xác nhận theo code” mô tả hành vi hiện tại; “Đề xuất chờ PM” là quyết định UI/sản phẩm chưa được duyệt; “Chờ PM/Dev” là dữ kiện cần người phụ trách cung cấp. Tài liệu v1.5 vẫn là Draft cho tới khi review lại.

| ID | Nội dung | Quyết định/định hướng | Trạng thái |
|---|---|---|---|
| Q-01 | Tên PM và người duyệt | Vai trò dự án: Product Owner/PM ContestFlow; reviewer: đại diện ban tổ chức. Tên cá nhân không có trong yêu cầu/repository, không tự gán. | Chờ PM ghi tên; không cản wireframe |
| Q-02 | KPI đánh giá thiết kế | Đề xuất đo task success cho flow Giám khảo nộp phiếu và Admin điều phối/khóa; ghi thời gian hoàn tất, lỗi validation/lưu. Mục tiêu prototype đề xuất: ≥90% người tham gia hoàn tất flow không cần trợ giúp, 0 lỗi blocker về quyền hoặc mất dữ liệu. | Đề xuất chờ PM duyệt trước usability test |
| Q-03 | Đăng ký thí sinh/kết quả công khai phase sau | Trong MVP không có portal đăng ký thí sinh hay bảng kết quả công khai; yêu cầu phase sau được xử lý như phạm vi riêng. | Đã xác nhận theo scope hiện tại |
| Q-04 | Xác nhận trước khi nộp phiếu | Đề xuất một hộp thoại xác nhận cuối, nêu rõ phiếu sẽ khóa; cho phép quay lại hoặc nộp. Sau nộp chỉ Admin được mở lại bằng lý do. | Đề xuất chờ PM duyệt |
| Q-05 | Trình duyệt/OS tối thiểu | Layout design target: Chrome Android, Safari iOS, Chrome/Edge desktop hiện hành; frame 320/360/390/768/1440 px. Phiên bản tối thiểu do Developer xác nhận trước implementation. | Design target đã nêu; version floor chờ Dev |
| Q-06 | Responsive cho Admin Mobile | Đủ 14 màn hình trên Mobile/Tablet/Desktop; Designer kiểm tra constraints ở Figma 320 px, Developer/QA kiểm tra browser thực tế sau triển khai; không bắt buộc tạo 14 frame riêng. Sáu màn hình SCR-02/08/09/10/11/12 ưu tiên UI trước; SCR-09/10 là P1 wireframe. | Phạm vi v1.5 đã cập nhật theo review; chờ reviewer duyệt lại |
| Q-07 | Ai xem kết quả và điểm riêng | Admin xem dữ liệu quản lý; Giám khảo chỉ xem kết quả sau publish trong cuộc thi được phân công; điểm từng Judge chỉ xuất hiện nếu publishScores bật. Không public unauthenticated results trong MVP. | Đã xác nhận theo code |
| Q-08 | Logo/brand guideline | Dùng assets hiện có: mark CF, logo HUIT, palette và Be Vietnam Pro trong app. Không thấy brand book độc lập trong repository; không tự dựng logo mới. | Assets hiện tại đã xác minh; brand book không có trong repo |
| Q-09 | DRAFT khi vòng đã có snapshot | Có thể phát sinh trong đợt chỉnh sửa sau khi Admin mở lại phiếu SUBMITTED: snapshot cũ được giữ; khi Giám khảo lưu nháp, phiếu trở về DRAFT. Đây là trạng thái trong lúc chờ snapshot phiên bản kế tiếp, không phải phiếu lọt qua điều kiện khóa; API vẫn chặn khóa nếu còn DRAFT/REOPENED. Designer thể hiện snapshot cũ + tiến độ chỉnh sửa mới, Admin có thể mở lại DRAFT này bằng lý do. | Đã xác nhận theo code; PM/Dev xác nhận đây là wording nghiệp vụ mong muốn trước khi duyệt cuối |
| Q-10 | Có khóa sửa cuộc thi theo trạng thái không | API hiện cho Admin cập nhật các trường cuộc thi ở mọi trạng thái; không có chặn theo trạng thái trong PATCH. Đề nghị PM/Developer xác nhận có cần read-only khi COMPLETED/ARCHIVED hay không; cho đến khi chốt, thiết kế theo quyền hiện tại và không mô phỏng khóa theo state. | Chờ PM/Developer; luồng Admin có thể wireframe theo hành vi hiện tại |
| Q-11 | Bổ sung nút Hủy ở form sửa | UI hiện có nút Lưu thay đổi nhưng chưa có Hủy riêng. Đề xuất thêm Hủy để bỏ nội dung chưa lưu/khôi phục dữ liệu máy chủ; cần thống nhất hành vi khi form dirty (hủy ngay hay hỏi xác nhận). | Cải tiến UX đề xuất; chờ PM duyệt |
| Q-12 | Nộp phiếu khi autosave đang chờ/chạy | API submit hiện gửi toàn bộ điểm/nhận xét và chỉ có phản hồi thành công sau khi máy chủ ghi nhận; UI chỉ hiện receipt/điều hướng sau response. Tuy vậy, debounce autosave chưa được tuần tự hóa/hủy rõ với submit. Đề xuất: khi xác nhận nộp, hủy debounce chưa gửi; nếu autosave đã gửi request thì chờ request đó kết thúc, sau đó gửi bản mới nhất qua submit như lần ghi cuối. Khóa submit lặp; chỉ báo thành công/điều hướng sau response submit. Nếu lỗi, ở lại form, giữ nội dung, báo chưa nộp và cho thử lại. | Chờ PM/Developer xác nhận quy tắc và thứ tự request |

**Điều kiện phê duyệt:** PM điền Q-01 và duyệt Q-02/Q-04/Q-09/Q-10/Q-11/Q-12; Developer chốt version floor Q-05 và xác nhận Q-10/Q-12; reviewer duyệt phạm vi responsive Q-06 và toàn bộ acceptance criteria.

## 11. Tiêu chí nghiệm thu thiết kế (Design Acceptance Criteria)

- [ ] Sitemap và flow trực quan trong Figma do Designer tạo từ sitemap/flow văn bản mục 4; hiển thị nhánh điều kiện, lỗi, retry, back path và màn hình đích.
- [ ] Đủ 14 màn hình SCR-01–SCR-14, mỗi màn có layout Mobile 390 px, Tablet 768 px và Desktop 1440 px.
- [ ] SCR-02 có frame Admin và Giám khảo riêng khi cấu trúc/CTA khác vai trò; SCR-14 được bàn giao dưới dạng overlay theo các tác vụ tạo/chọn/reset, không dựng thành trang độc lập.
- [ ] Làm Mobile First: duyệt wireframe SCR-09 và SCR-10 trước; sau đó hoàn thành SCR-02/08/11/12; cuối cùng hoàn thiện SCR-01/03/04/05/06/07/13/14.
- [ ] Hoàn thiện UI, không chỉ wireframe, cho đủ 14 màn hình ở cả ba nhóm thiết bị; các nhóm ưu tiên chỉ xác định thứ tự, không thu hẹp phạm vi.
- [ ] Designer kiểm tra constraints/Auto Layout trong Figma ở 320 px cho đủ 14 screen family và biến thể role/state/form/overlay; không bắt buộc tạo frame riêng cho từng nhóm.
- [ ] Developer/QA kiểm tra browser thực tế ở 320 px sau implementation cho đủ 14 screen family/biến thể; frame 360 px cho SCR-01/09/10/12 phục vụ review flow ưu tiên. Không cuộn ngang toàn trang, không che CTA/điểm/trạng thái; ghi ngoại lệ và bằng chứng.
- [ ] Prototype được hai flow chính và các nhánh ngoại lệ: thiếu rubric/assignment, chờ lượt, mất mạng, thiếu phiếu, reopen, khóa và publish.
- [ ] UI states gồm loading, empty, error/retry, validation, success, disabled, read-only, permission denied, WAITING/LIVE/LOCKED và unsaved.
- [ ] Điểm, ẩn danh, phân quyền, status sau reopen, published visibility và điều kiện khóa khớp nghiệp vụ mục 3/5/10.
- [ ] Form rubric/phiếu biểu đạt min/max/step/weight/commentRequired; lỗi nằm cạnh field/criterion cần sửa.
- [ ] Tap target tối thiểu 44 × 44 px; tương phản, focus, label nút icon, safe area và bàn phím mobile được thể hiện.
- [ ] Dùng dữ liệu mẫu đại diện, hợp lệ theo nghiệp vụ và ghi nhãn rõ là “Dữ liệu demo” trong Figma/prototype; bao gồm tên dài, danh sách lớn (ví dụ 100 thí sinh), phiếu thiếu và tiến độ khác nhau. Không dùng Lorem ipsum hoặc nội dung ngoài ngữ cảnh. Khi triển khai production, dữ liệu lấy từ nguồn thật.
- [ ] Form tạo/sửa cuộc thi thể hiện trường bắt buộc/tùy chọn, giới hạn ký tự, kiểm tra ngày, lưu, validation, đang lưu/lỗi/thành công và chế độ chỉ xem khi không có quyền. Nút Hủy ở form sửa chỉ được đưa vào prototype sau khi PM duyệt Q-11; nếu được duyệt, xác định rõ discard/reset và cảnh báo dữ liệu chưa lưu.
- [ ] Nộp phiếu không hiện thành công hoặc điều hướng trước phản hồi server; state lưu đang chạy, lỗi, giữ nội dung và retry khớp quyết định Q-12.
- [ ] Component, page/frame/layer có tên rõ; handoff ghi breakpoint, sticky/dock, validation, quyền và tương tác.
- [ ] PM/reviewer duyệt prototype trước UI handoff; tài liệu không được đánh dấu Approved trước chữ ký/approval.

## 12. Tài liệu tham chiếu và đối chiếu mã nguồn

| Tài liệu/nguồn | Điều đã đối chiếu hoặc dùng làm tham chiếu |
|---|---|
| README.md | Hai role, luồng MVP, dashboard/competition/judging/results, account và CSV |
| docs/IMPLEMENTATION_PLAN.md | Quy tắc tổng hợp điểm, giới hạn nghiệp vụ và trạng thái MVP |
| prisma/schema.prisma | Models/enums cho competition, round, entry, assignment, rubric, score, snapshot, audit |
| docs/UX_UI_AUDIT.md, docs/UX_UI_ACCEPTANCE_CHECKLIST.md, docs/UX_UI_REDESIGN_PLAN.md | Phát hiện UX, checklist và định hướng redesign |
| docs/ux-ui-audit/evidence/responsive/judge-dashboard-mobile-current-390x844.png | Hiện trạng Dashboard Giám khảo |
| docs/ux-ui-audit/evidence/responsive/judge-judge-queue-reopened-390x844.png | Hiện trạng danh sách Chấm thi |
| docs/ux-ui-audit/evidence/responsive/judge-judge-entry-reopened-390x844.png | Hiện trạng phiếu chấm |
| docs/ux-ui-audit/evidence/responsive/admin-live-populated-390x844.png | Hiện trạng điều phối mobile |
| docs/ux-ui-audit/evidence/responsive/admin-competition-overview-populated-390x844.png | Hiện trạng tổng quan cuộc thi mobile |
| src/components/auth-form.tsx, src/app/api/auth/login/route.ts | Đăng nhập: Giám khảo được điều hướng tới /judge; Admin tới / |
| src/components/judge-workspace.tsx | Autosave sau debounce khoảng 900 ms; submit gửi nội dung phiếu và UI chỉ xử lý thành công sau response. Debounce chưa được tuần tự hóa/hủy rõ khi submit; theo dõi quyết định Q-12 |
| src/app/api/scores/[entryId]/route.ts | Phân quyền, validate và lưu/nộp score sheet |
| src/app/api/competitions/[id]/duplicate/route.ts | Endpoint nhân bản cấu hình cuộc thi/rubric |
| src/app/api/competitions/[id]/close-early/route.ts | Đóng sớm có lý do, hoàn tất vòng/session và ghi audit |
| src/app/api/competitions/[id]/results/route.ts | Reopen, trạng thái READY/PAUSED, snapshot, lock/publish |
| src/app/api/competitions/route.ts | Trường, validation và khởi tạo dữ liệu mặc định khi tạo cuộc thi |
| src/app/api/competitions/[id]/route.ts | Validation cập nhật cuộc thi và quyền sửa theo role; không chặn theo status hiện tại |
| src/app/(workspace)/competitions/new/page.tsx, src/components/competition-workspace.tsx | Form tạo và sửa cuộc thi hiện hành; form sửa hiện có nút lưu nhưng chưa có nút Hủy riêng; brief yêu cầu Designer thể hiện thao tác Hủy/discard |
| src/app/api/competitions/[id]/judges/[assignmentId]/route.ts | Reset password và xóa các session đăng nhập hiện có |
| src/app/globals.css, src/components/app-shell.tsx | Font, palette, logo/brand mark và điều hướng role hiện hành |

**Kết quả đối chiếu phạm vi MVP:** Nhân bản, đóng sớm, mở lại phiếu, reset mật khẩu/thu hồi session và autosave có implementation trong source được dẫn ở trên. Chi tiết hành vi trên giao diện phải theo các điều kiện route/API; không thiết kế trạng thái không có trong source nếu chưa có product decision.

## 13. Review và phê duyệt

### 13.1 Checklist reviewer

- [x] Sitemap/user flow, 14 screen specifications, breakpoint matrix, form tạo/sửa cuộc thi và acceptance criteria được cập nhật theo review.
- [x] Đã đối chiếu với source các chức năng nhân bản, đóng sớm, reopen, reset session, autosave và login routing.
- [ ] PM điền Q-01, duyệt Q-02/Q-04/Q-11; PM/Developer xác nhận Q-09/Q-10/Q-12.
- [ ] Developer chốt browser/OS version floor ở Q-05.
- [ ] Developer xác nhận thứ tự save/submit và xử lý request đang chờ ở Q-12.
- [ ] Reviewer duyệt phạm vi 14 màn hình tại cả ba nhóm thiết bị và tiêu chí responsive QA 320 px.
- [ ] Designer dựng sơ đồ flow trực quan, wireframe Mobile và trình review trước khi UI.
- [ ] Tài liệu được phê duyệt và cập nhật ngày/người ký.

### 13.2 Kết quả review

| Hạng mục | Thông tin |
|---|---|
| Người review | CẦN PM ghi tên |
| Ngày review | 12/11/2026 — cập nhật v1.5 theo góp ý |
| Kết luận | Đủ để bắt đầu wireframe Mobile First; chưa phê duyệt UI đầy đủ |
| Hạng mục còn cần xác nhận | Q-01, Q-02, Q-04, Q-05, Q-06, wording Q-09, Q-10, Q-11, Q-12 |
| Phiên bản được duyệt | Chưa có |
| Ngày bàn giao Designer | Wireframe có thể bắt đầu; UI handoff sau phê duyệt |

### 13.3 Mốc làm việc

1. **Mốc 1 — Wireframe:** Designer bắt đầu SCR-09 và SCR-10 trên Mobile; đánh dấu Q-02/Q-04/Q-05/Q-09/Q-10/Q-11/Q-12 là quyết định chờ duyệt. Dựng sitemap/flow trực quan và trình PM.
2. **Mốc 2 — Responsive UI:** sau khi duyệt wireframe/phạm vi, hoàn thiện đủ 14 màn hình lần lượt Mobile → Tablet → Desktop.
3. **Mốc 3 — Handoff:** PM/reviewer kiểm tra acceptance criteria, quyền và status; Developer xác nhận browser floor; sau đó phê duyệt Figma UI để triển khai.


