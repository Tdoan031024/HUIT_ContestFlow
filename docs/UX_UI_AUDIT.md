# HUIT ContestFlow — Audit nghiệp vụ và giao diện

**Ngày rà soát:** 09/11/2026
**Phạm vi:** giao diện Admin và Giám khảo, các luồng nghiệp vụ liên quan, responsive, khả năng truy cập và các API hỗ trợ.
**Trạng thái:** đã triển khai và rà soát local ngày 09/11/2026. Các phát hiện bên dưới được giữ làm baseline trước chỉnh sửa; trạng thái hiện tại nằm trong mục **Kết quả sau chỉnh sửa**.

## Kết luận

Đợt chỉnh sửa đã hoàn thành trên mã local: nghiệp vụ cuộc thi, quyền theo vai trò, workspace Admin/Giám khảo, trạng thái khởi tạo Admin và giao diện responsive đã được cập nhật. `npm run build` thành công; bộ E2E trên database cô lập đã qua toàn bộ assertion. Không có thay đổi nào được deploy hoặc push.

Đã chụp 210 ảnh responsive: 19 trạng thái workspace × 9 viewport (171 ảnh/metric) cùng 9 kích thước cho đăng nhập và setup đã khởi tạo (18 ảnh cuối). Trong 171 dòng metric workspace: 0 tràn ngang toàn trang, 0 còn loading, 0 phần tử bị trôi khỏi vùng cuộn hợp lệ. Bảng và điều hướng có vùng cuộn ngang được ghi riêng. Có 81 lượt thử route quản trị từ vai trò Giám khảo; tất cả quay về `/judge`, không hiện thao tác Admin.

Giao diện dùng hệ thống nhận diện HUIT sáng, xanh làm màu hành động, icon SVG thống nhất, thứ bậc chữ và khoảng cách gọn hơn; form, rubric, bảng, điều phối, dialog và queue Giám khảo đã được làm lại để ưu tiên tác vụ. Phát hiện khoảng trống phần đầu login mobile đã được sửa; header ở điện thoại dọc giảm từ khoảng 175px xuống 71px. Setup sau khởi tạo không còn form tạo Admin và có đường dẫn đăng nhập rõ.

## Kết quả sau chỉnh sửa

- **CF-B01–B09:** đã xử lý các lỗi vòng đời vòng/competition, khóa cấu hình kết quả, preflight assignment, hàng chờ Giám khảo, cách tính tiến độ, guard role và nhãn CTA theo quyền. Các luồng liên quan được kiểm tra trong E2E và kiểm tra route theo vai trò.
- **CF-V01–V08:** đã áp dụng visual system cho workspace; sửa login mobile, icon, helper, rubric, thao tác xác nhận và responsive. Baseline 19 trạng thái workspace được chụp đủ 9 viewport và có số đo ở `ux-ui-audit/evidence/responsive/metrics.json`.
- **Build/E2E:** build và toàn bộ E2E workflow trên schema local cô lập đã qua sau thay đổi CSS cuối. Schema thử nghiệm, fixture, log và server tạm đã được dọn.
- **Touch landscape:** metric cũ ghi input/select workspace cao 39px tại 844×390. Đã thêm rule landscape đặt control tối thiểu 44px và xác nhận rule được đóng gói trong CSS production. Trình duyệt đang mở vẫn phục vụ stylesheet cũ nên chưa đo lại 171 route-state sau rule này; không dùng metric cũ để khẳng định chiều cao mới đã được đo runtime.
- **Đăng nhập/setup:** đã chụp lại cả hai trạng thái ở đủ 9 viewport. Ảnh mới nhất nằm tại `ux-ui-audit/evidence/responsive/*-final.png`.
- **Rà soát điện thoại lần cuối:** dashboard Admin được chụp ở 320×568, 360×800 và 390×844; chi tiết cuộc thi, queue Giám khảo và phiếu chấm được rà ở 390×844. Workspace có thanh điều hướng dưới theo quyền; chi tiết cuộc thi dùng bộ chọn mục gọn; thanh lưu/nộp điểm nằm phía trên điều hướng dưới. Route `/judge/[entryId]` cũng hiện đúng ngữ cảnh “Chấm điểm”. Ảnh dashboard tại [320×568](./ux-ui-audit/evidence/responsive/admin-dashboard-mobile-current-320x568.png), [360×800](./ux-ui-audit/evidence/responsive/admin-dashboard-mobile-current-360x800.png), [390×844](./ux-ui-audit/evidence/responsive/admin-dashboard-mobile-390x844.png); ảnh luồng cuộc thi và giám khảo: [chi tiết cuộc thi](./ux-ui-audit/evidence/responsive/admin-competition-overview-mobile-current-390x844.png), [queue](./ux-ui-audit/evidence/responsive/judge-dashboard-mobile-current-390x844.png), [phiếu chấm](./ux-ui-audit/evidence/responsive/judge-score-mobile-current-390x844.png). Đây là ảnh ghép nhiều màn hình của screenshot runner; nhãn N nổi là chỉ báo môi trường Next.js development.
- **Dữ liệu và phạm vi kiểm tra:** `/api/dashboard`, `/api/judge/tasks` và `/api/auth/me` trả `200` trên localhost với dữ liệu local. Phiếu chấm được mở ở chế độ chỉ xem; không lưu hoặc nộp điểm. Session xem thử tạm đã xóa khỏi database sau khi chụp.
- **Giới hạn nghiệm thu:** chưa hoàn tất kiểm thử bằng screen reader thật, browser zoom 200%, bàn phím ảo trên thiết bị thật và xoay thiết bị khi đang nhập; tie-break `CRITERIA_PRIORITY` vẫn cần chủ sở hữu nghiệp vụ xác nhận. Các mục này không được đánh dấu pass.
- Bộ `assets/layout/check.mjs` của skill vẫn dừng với lỗi `r.sections is not iterable` trên cấu trúc App Router này. `shoot.mjs` dùng được để tạo ảnh; metric route được lấy từ phiên trình duyệt local đã đăng nhập.

## Cách rà soát và giới hạn

- Đọc route, component, API và schema, rồi kiểm tra bằng dữ liệu local; không truy cập database production.
- `/api/health` trả `200` với `database: ok`. E2E cô lập kiểm tra migration, auth/session revoke, vòng đời, preflight, ẩn danh, draft/submit, tính điểm, snapshot, publish/reopen, CSV và audit.
- Ma trận ảnh có 19 nhóm Admin/Judge ở đủ 9 viewport; `metrics.json` giữ 171 phép đo. Trạng thái đăng nhập và setup có thêm ảnh cuối cho đủ 9 viewport mỗi trạng thái.
- Skill checker không tương thích với cấu trúc App Router, nên kết quả thị giác/overflow được ghi từ ảnh, DOM và số đo trình duyệt. Bản metric giữ trước thay đổi 44px landscape được nêu rõ ở mục giới hạn phía trên.
- Các dữ liệu/tài khoản E2E nằm trong local database/schema cô lập; không đưa thông tin xác thực vào tài liệu.

## Yêu cầu responsive toàn hệ thống

Mọi route và trạng thái được liệt kê trong checklist phải được thiết kế và nghiệm thu ở cả ba nhóm thiết bị. Không chỉ co nhỏ layout desktop:

- **Web/desktop:** sidebar/header, vùng nội dung và bảng làm việc có đủ chỗ; nhiều cột chỉ dùng khi nội dung còn đọc được.
- **Tablet:** portrait và landscape đều có điều hướng rõ, toolbar/form không dồn chật, hai cột chỉ giữ lại khi từng cột còn đủ rộng; mọi nút thao tác vẫn chạm được.
- **Điện thoại:** ưu tiên một cột, CTA và trạng thái gần nội dung liên quan; không có tràn ngang toàn trang; bảng nghiệp vụ chuyển sang hàng/thẻ hoặc chỉ giữ scroll ngang khi có cue rõ và cột nhận dạng/hành động không biến mất.
- **Tương tác:** desktop kiểm tra chuột/bàn phím; tablet và điện thoại kiểm tra touch, xoay màn hình, bàn phím ảo, dialog và nội dung dài.

Các profile đầy đủ được định nghĩa trong [checklist responsive](./UX_UI_ACCEPTANCE_CHECKLIST.md#d-responsive-và-thị-giác). Một route chỉ được đánh dấu đạt khi vượt tất cả profile áp dụng cho ba nhóm thiết bị.

## Phạm vi màn hình

| Khu vực | Màn hình/luồng đã rà soát |
|---|---|
| Chung | Đăng nhập, khởi tạo Admin, dashboard, shell/navigation, trang kết quả |
| Admin | Danh sách/tạo cuộc thi; tổng quan; thí sinh/CSV; giám khảo; rubric; điều phối; trạng thái phiếu; khóa/công bố kết quả; nhật ký |
| Giám khảo | Dashboard; danh sách lượt được giao; phiếu chấm; kết quả đã công bố; kiểm tra truy cập route tạo cuộc thi |

## Phát hiện nghiệp vụ và quyền

> **Baseline trước chỉnh sửa:** bảng dưới đây ghi trạng thái ban đầu. Không đọc hướng xử lý bên dưới như lỗi còn tồn tại; kết quả xử lý và giới hạn kiểm chứng nằm trong mục **Kết quả sau chỉnh sửa**.

| ID | Mức | Phát hiện | Tác động và hướng xử lý |
|---|---|---|---|
| CF-B01 | **P1** | Kết thúc một phiên của một vòng đặt trạng thái toàn cuộc thi thành `COMPLETED`, kể cả khi còn các vòng khác. Trong `src/app/api/competitions/[id]/rounds/[roundId]/session/route.ts:87-88`, trạng thái cuộc thi được cập nhật theo trạng thái của riêng phiên. | Cuộc thi nhiều vòng có thể bị hiển thị đã hoàn tất quá sớm. Tính trạng thái cuộc thi từ trạng thái toàn bộ vòng hoặc tách trạng thái vận hành của vòng khỏi trạng thái cuộc thi. |
| CF-B02 | **P1** | `requiredJudgeCount` vẫn sửa được sau khi đã có phiếu/snapshot. UI giữ input mở ở `src/components/competition-workspace.tsx:174`; API chỉ xem aggregate/tie-break/rounding là policy bị khóa tại `src/app/api/competitions/[id]/rounds/[roundId]/route.ts:32-36`. Snapshot đang phát hành giữ `requiredCount` cũ. | Cấu hình vòng và kết quả đã chốt có thể bất đồng về số phiếu bắt buộc. Khóa số lượng sau mốc nghiệp vụ đã chọn; nếu cần thay đổi, yêu cầu quy trình sửa quy chế và tạo snapshot mới có audit. |
| CF-B03 | **P1** | Cấu hình “Công khai điểm từng giám khảo khi công bố kết quả” vẫn sửa được sau công bố. API đọc snapshot rồi dùng `round.publishScores` hiện tại để lọc chi tiết cho Giám khảo tại `src/app/api/competitions/[id]/results/route.ts:31-37`. | Đổi checkbox có thể làm lộ hoặc ẩn tên/điểm giám khảo trên snapshot đã phát hành mà không tạo lần công bố mới. Đóng băng chính sách hiển thị vào snapshot tại thời điểm publish hoặc yêu cầu quy trình công bố lại có audit. |
| CF-B04 | **P1** | Điều phối chỉ chặn bắt đầu khi không có lượt thi (`src/components/competition-workspace.tsx:470`); chưa có bước kiểm tra mọi lượt có đủ số giám khảo được phân công theo `requiredJudgeCount`. | Sự kiện có thể chạy với phân công thiếu rồi mới phát hiện thiếu phiếu lúc chốt. Thêm preflight trước khi bắt đầu và trước khi khóa; chỉ cho vượt khi Admin xác nhận ngoại lệ có lý do. |
| CF-B05 | **P1** | Phân công toàn vòng chỉ tạo task cho lượt hiện tại; API chọn `assignment.entryId ?? currentEntryId` ở `src/app/api/judge/tasks/route.ts:23`. Phiếu của phân công toàn vòng chỉ được bắt đầu khi đúng lượt đang live (`src/app/api/scores/[entryId]/route.ts:58-63`). Sau khi Admin chuyển lượt hoặc kết thúc, lượt nháp/thiếu có thể biến khỏi hàng chờ Giám khảo. | Giám khảo không có danh sách bền vững cho lượt đã nộp, nháp, đang chờ hoặc bị bỏ sót. Giữ queue theo toàn bộ phạm vi được giao, hiển thị trạng thái và hướng dẫn cách quay lại lượt qua điều phối. |
| CF-B06 | **P2** | Mô tả phân công nói “áp dụng cho toàn bộ lượt thi” tại `src/components/competition-workspace.tsx:342`, nhưng form cho chọn “Toàn vòng” hoặc từng entry tại dòng 353. | Admin có thể hiểu nhầm phạm vi. Sửa mô tả và hiển thị rõ loại phân công, số lượt áp dụng, tình trạng đủ/thiếu coverage. |
| CF-B07 | **P2** | Tiến độ từng cuộc thi trên dashboard dùng `entries × số bản ghi assignment` tại `src/app/(workspace)/page.tsx:36`. Khi có phân công theo entry, đây không phải số phiếu cần nộp; API dashboard tổng có denominator khác. | Hai chỉ số tiến độ trên cùng dashboard có thể lệch. Tính từ danh sách assignment đủ điều kiện cho từng entry và đối chiếu một hàm tổng hợp dùng chung. |
| CF-B08 | **P2** | Giám khảo truy cập trực tiếp `/competitions/new` vẫn nhìn thấy form; chỉ POST API mới trả 403. `/competitions` cũng render nút tạo mà không rẽ theo role. | Bề mặt giao diện hứa một thao tác mà vai trò không có quyền thực hiện. Guard trang/CTA theo role, đưa Giám khảo về khu vực phù hợp; giữ API authorization như hiện nay. |
| CF-B09 | **P2** | CTA kết quả dùng chữ “Mở quản lý kết quả” trong trang dùng chung (`src/app/(workspace)/results/page.tsx:19`), dù Giám khảo chỉ đọc snapshot đã công bố. | Nhãn hành động không đúng quyền và kỳ vọng. Dùng copy riêng cho Admin/Giám khảo và trạng thái read-only rõ ràng. |

## Đánh giá thị giác và thao tác

> Bảng sau ghi nhận giao diện **trước chỉnh sửa**. Các mục đã được xử lý theo kết quả ở phần đầu tài liệu; baseline được giữ lại để đối chiếu.

### Điểm đang làm tốt

- Logo trường và HUIT Media tạo nhận diện đúng ngữ cảnh; đăng nhập phân vai Admin/Giám khảo bằng copy rõ.
- Form có nhãn gắn với trường nhập, vùng mật khẩu có nút hiện/ẩn, trạng thái lỗi dùng `role="alert"`.
- Shell desktop có cấu trúc sidebar–header–content nhất quán; nội dung chính có phân cấp h1, mô tả, trạng thái và khu vực thao tác.
- Danh sách CSV có preview/lỗi trước khi nhập; hành động rút thí sinh và kết thúc phiên có xác nhận.
- Phiếu chấm có lưu nháp tự động, lưu thủ công, trạng thái đã lưu/chưa lưu, tổng điểm và khóa chỉnh sau khi nộp.

### Điểm cần thiết kế lại

| ID | Mức | Nhận xét |
|---|---|---|
| CF-V01 | **P1** | Dashboard vận hành nên ưu tiên “việc cần làm/thiếu gì/đang live vòng nào” thay vì bắt Admin suy ra từ nhiều KPI và card. Chưa có readiness/preflight và đường dẫn khắc phục ngay từ cảnh báo. |
| CF-V02 | **P2** | Desktop login tốt; ở 390px phần nội dung thương hiệu bị ẩn nhưng panel xanh vẫn chiếm khoảng 178px, tạo khoảng trống lớn trước form. Ảnh: `evidence/login-390.png`. |
| CF-V03 | **P2** | Workspace lặp lại mẫu `surface-card`/`round-card` hai cột ở nhiều trang; cần giảm cảm giác “dashboard template”, tăng phân cấp theo tác vụ, bảng vận hành và vùng trạng thái. Không áp quy tắc landing page vào công cụ nội bộ; ưu tiên tốc độ đọc và an toàn thao tác. |
| CF-V04 | **P2** | Điều hướng dùng glyph như `⌂`, `▦`, `◉`, `↗`; nét và kích thước không đồng nhất. Thay bằng một bộ icon SVG nhất quán, vẫn giữ nhãn chữ. |
| CF-V05 | **P2** | CSS có chữ phụ nhỏ (một số 9–11px như sidebar, account, helper/stat); cần tăng nội dung đọc lên tối thiểu 13px, dùng màu muted cho metadata và kiểm tra tương phản. |
| CF-V06 | **P2** | Các thao tác quan trọng dựa trên `window.prompt/confirm` (nhân bản, lưu trữ, mở lại phiếu, kết thúc phiên, nộp điểm). Cần dialog trong sản phẩm có nội dung, lý do bắt buộc, focus, lỗi và nút hành động có tên rõ. |
| CF-V07 | **P2** | Màn rubric hiện nhập tiêu chí trong các khối lặp và đặt xem trước ở cuối. Cần tối ưu luồng sửa nhanh, hiển thị tổng trọng số/trạng thái hợp lệ liên tục và làm rõ phiên bản đang chấm. |
| CF-V08 | **P1** | Chưa có ảnh kiểm chứng responsive cho các route workspace. CSS hiện có breakpoint chung và một số bảng dùng scroll ngang, nhưng điều đó không chứng minh từng flow phù hợp tablet/điện thoại. Cần nghiệm thu mọi route ở tất cả profile; bảng nghiệp vụ trên điện thoại phải giữ mã, tên, trạng thái và hành động chính hoặc có layout thay thế. |

### Ảnh đăng nhập và setup sau chỉnh sửa

| Viewport | Đăng nhập | Setup đã có Admin |
|---|---|---|
| 1440×900 | [Ảnh](./ux-ui-audit/evidence/responsive/guest-login-anonymous-1440x900-final.png) | [Ảnh](./ux-ui-audit/evidence/responsive/guest-setup-already-configured-1440x900-final.png) |
| 1024×768 | [Ảnh](./ux-ui-audit/evidence/responsive/guest-login-anonymous-1024x768-final.png) | [Ảnh](./ux-ui-audit/evidence/responsive/guest-setup-already-configured-1024x768-final.png) |
| 820×1180 | [Ảnh](./ux-ui-audit/evidence/responsive/guest-login-anonymous-820x1180-final.png) | [Ảnh](./ux-ui-audit/evidence/responsive/guest-setup-already-configured-820x1180-final.png) |
| 768×1024 | [Ảnh](./ux-ui-audit/evidence/responsive/guest-login-anonymous-768x1024-final.png) | [Ảnh](./ux-ui-audit/evidence/responsive/guest-setup-already-configured-768x1024-final.png) |
| 1180×820 | [Ảnh](./ux-ui-audit/evidence/responsive/guest-login-anonymous-1180x820-final.png) | [Ảnh](./ux-ui-audit/evidence/responsive/guest-setup-already-configured-1180x820-final.png) |
| 390×844 | [Ảnh](./ux-ui-audit/evidence/responsive/guest-login-anonymous-390x844-final.png) | [Ảnh](./ux-ui-audit/evidence/responsive/guest-setup-already-configured-390x844-final.png) |
| 360×800 | [Ảnh](./ux-ui-audit/evidence/responsive/guest-login-anonymous-360x800-final.png) | [Ảnh](./ux-ui-audit/evidence/responsive/guest-setup-already-configured-360x800-final.png) |
| 320×568 | [Ảnh](./ux-ui-audit/evidence/responsive/guest-login-anonymous-320x568-final.png) | [Ảnh](./ux-ui-audit/evidence/responsive/guest-setup-already-configured-320x568-final.png) |
| 844×390 | [Ảnh](./ux-ui-audit/evidence/responsive/guest-login-anonymous-844x390-final.png) | [Ảnh](./ux-ui-audit/evidence/responsive/guest-setup-already-configured-844x390-final.png) |

## Quyết định nghiệp vụ cần xác nhận trước production

Code đã dùng các mặc định trong kế hoạch và chưa deploy. Chủ sản phẩm nên xác nhận các quy tắc ảnh hưởng kết quả trước khi đưa ra production; riêng tie-break vẫn còn mơ hồ:

1. Cuộc thi chỉ `COMPLETED` khi mọi vòng bắt buộc đã hoàn tất hay Admin được phép đóng sớm?
2. Giám khảo phân công toàn vòng có chỉ chấm đúng lượt live không; cách mở lại lượt bị bỏ sót là gì?
3. Số phiếu yêu cầu có bất biến sau khi bắt đầu/chấm hay được điều chỉnh bằng quy trình có version?
4. Điểm và danh tính từng Giám khảo có được thay đổi chính sách hiển thị sau khi công bố không?
5. Phạm vi ẩn danh có bao gồm tên đề tài/sản phẩm có thể nhận diện thí sinh không?
6. `CRITERIA_PRIORITY` có phải quy chế phá hòa chính thức? Tài liệu triển khai cũ ngày 05/11 mô tả chưa có tie-break, trong khi giao diện/API hiện đã có.

## Không thuộc phạm vi

- Không push, không tạo release và không deploy; toàn bộ thay đổi hiện tại chỉ nằm local.
- Các lượt đăng nhập dùng để xác minh quyền chỉ chạy ở local; không dùng tài khoản/dữ liệu production.
- Bộ tài liệu trong `docs/` không nằm trong danh sách tệp đóng gói cPanel của `.github/workflows/ci-cd.yml` (`tar` liệt kê artifact cụ thể), nên tài liệu này không được đưa lên host.
