# Kế hoạch chỉnh sửa triệt để giao diện và nghiệp vụ ContestFlow

## Trạng thái triển khai

**Hoàn tất phần code và kiểm thử local ngày 09/11/2026; chưa push/deploy.** Các giai đoạn 1–7 đã được thực hiện trên ứng dụng và kiểm tra bằng build, E2E cô lập, kiểm tra quyền theo vai trò và ảnh responsive. Kết quả chi tiết nằm trong [audit](./UX_UI_AUDIT.md) và [checklist](./UX_UI_ACCEPTANCE_CHECKLIST.md).

Các giới hạn nghiệm thu còn mở: chủ sở hữu cần xác nhận quy tắc tie-break `CRITERIA_PRIORITY`; chưa kiểm tra screen reader thật, zoom trình duyệt 200%, bàn phím ảo/đổi hướng trên thiết bị thật. Metric workspace 171 dòng được tạo trước lần nâng control landscape từ 39px lên 44px; build cuối có rule này nhưng chưa tạo lại bộ metric workspace từ browser mới.

## Định hướng

**Visual thesis:** một workspace điều hành cuộc thi mang nhận diện HUIT: sáng, bình tĩnh, dễ quét, xanh HUIT làm màu hành động, màu trạng thái chỉ dùng để phân biệt nghĩa; giao diện dành cho công việc liên tục chứ không phải landing page.

**Content plan:** Admin nhìn thấy trạng thái và việc cần xử lý trước, sau đó đến thiết lập/chi tiết; Giám khảo nhìn thấy lượt được giao, thời hạn/trạng thái, tiến độ của mình và một phiếu chấm tập trung.

**Interaction thesis:** thao tác nghiệp vụ có xác nhận đúng mức; trạng thái lưu/nộp luôn nhìn thấy và thông báo cho công nghệ hỗ trợ; điều phối live cập nhật có version, không làm biến mất công việc chưa hoàn tất.

## Mục tiêu và cách hoàn thành

Thực hiện một đợt sửa đồng bộ: trước hết khóa các quy tắc nghiệp vụ làm lệch kết quả, sau đó thiết kế lại shell và từng vai trò trên cùng một hệ thống, cuối cùng kiểm tra toàn bộ route/viewport/luồng. Chỉ coi là xong khi tất cả P1 đã đóng, checklist đạt và không có lỗi chặn luồng Admin/Giám khảo. Không dừng ở việc làm đẹp dashboard.

## Mặc định đề xuất để khỏi lệch thiết kế

1. **Trạng thái cuộc thi:** kết thúc một vòng chỉ kết thúc vòng. Cuộc thi chuyển hoàn tất khi tất cả vòng bắt buộc hoàn tất; Admin có thao tác đóng sớm riêng, cần nêu rõ ảnh hưởng.
2. **Số phiếu yêu cầu:** khóa khi bắt đầu chấm hoặc khi có snapshot. Nếu đổi, yêu cầu lý do, ghi audit, hiển thị tác động và tạo snapshot phiên bản mới.
3. **Thông tin điểm Giám khảo:** snapshot lưu chính sách hiển thị lúc công bố. Muốn đổi công khai/ẩn chi tiết phải tạo lần công bố lại, audit rõ người và thời điểm.
4. **Phân công toàn vòng:** Giám khảo vẫn chấm theo lượt đang được Admin điều phối. Queue phải giữ đủ danh sách công việc: chưa tới lượt, đang chấm, nháp, đã nộp, thiếu/bị mở lại. Sau khi phiên dừng, mục chưa xong phải có hướng xử lý rõ, không biến mất.
5. **Sẵn sàng điều phối:** mỗi entry cần rubric đang kích hoạt và đủ số Giám khảo đủ điều kiện theo quy chế. Nếu cho phép ngoại lệ, Admin xem entry thiếu, nhập lý do và xác nhận từng lần.
6. **Ẩn danh:** mặc định ẩn tên thí sinh và đơn vị; tên đề tài chỉ hiển thị nếu chủ cuộc thi xác nhận không làm lộ danh tính. Cài đặt được giữ nhất quán trong danh sách, phiếu và kết quả.
7. **Role boundary:** route Admin không render thao tác Admin cho Giám khảo; API tiếp tục là lớp bảo vệ cuối cùng.

Các mục 1–6 cần người phụ trách nghiệp vụ xác nhận trước khi merge phần thay đổi dữ liệu. Nếu chọn khác mặc định, cập nhật acceptance checklist trước khi triển khai.

## Hướng nghệ thuật và hệ thống UI

- Giữ nhận diện logo HUIT/HUIT Media, nền sáng và xanh HUIT. Dùng một màu hành động chính; màu đỏ/hổ phách/xanh trạng thái chỉ cho ý nghĩa trạng thái, không trang trí.
- Tiếp tục dùng Be Vietnam Pro. Tạo thang chữ rõ: tiêu đề trang, tiêu đề nhóm, nội dung, metadata; nội dung đọc được tối thiểu 13px và helper không phụ thuộc màu nhạt.
- Chuẩn hóa 4–5 pattern: page header, toolbar/filter, list/table, form section, notice/state. Card chỉ bao nhóm việc có ranh giới thật; giảm card lồng card và màu nền lặp.
- Thay glyph navigation bằng một bộ icon SVG nhất quán. Luôn đi kèm chữ; icon đơn lẻ phải có accessible name.
- Không dùng motion trang trí trong màn chấm/điều phối. Dùng chuyển trạng thái nhẹ, có `prefers-reduced-motion`; nút, focus và hover phản hồi nhanh.

## Responsive là yêu cầu cho mọi route

Thiết kế riêng theo ba nhóm thiết bị. Mỗi route trong checklist phải được mở trực tiếp, chụp và rà soát ở desktop/web, tablet và điện thoại; pass ở một nhóm không thay thế cho nhóm còn lại.

- **Desktop/web (1440×900, 1024×768):** giữ thứ bậc trang, điều hướng đầy đủ, bố cục làm việc có thể quét nhanh; tránh kéo quá rộng bảng và form.
- **Tablet portrait (820×1180, 768×1024) và landscape (1180×820):** điều hướng phải dễ chạm; bố cục nhiều cột tự chuyển khi trường nội dung bị hẹp; toolbar không bị ngắt thành các nút rời khó hiểu.
- **Điện thoại portrait (390×844, 360×800, 320×568) và landscape (844×390):** một cột theo thứ tự tác vụ; menu và tab có cue; nội dung không tràn ngang; CTA chính, trạng thái và thông tin nhận diện entry luôn đi cùng nhau. Xử lý bàn phím ảo và vùng an toàn khi có action bar.
- **Bảng:** ưu tiên chuyển mỗi record thành hàng/thẻ mang theo mã, tên, trạng thái và action. Nếu giữ scroll ngang, phải báo cách vuốt, giữ header/cột nhận dạng cần thiết và kiểm tra không che nút.
- **Biểu mẫu và dialog:** input/select/textarea đủ rộng và không bị bàn phím che; dialog giới hạn chiều cao và cuộn bên trong; action không rơi ra ngoài viewport.
- **Touch và xoay:** touch target tối thiểu 44×44px; đổi portrait↔landscape không reset nội dung đang nhập, filter, điểm nháp hay trạng thái cuộn bất ngờ.
- **Trạng thái:** loading/error/empty/success/forbidden/conflict và dữ liệu dài đều phải được xem trên cả ba nhóm, không chỉ trang có dữ liệu ngắn.

Danh sách kích thước, route × thiết bị và cách chụp ảnh được cố định trong [checklist](./UX_UI_ACCEPTANCE_CHECKLIST.md#d-responsive-và-thị-giác). Không được đóng giai đoạn responsive nếu còn route nào thiếu ảnh desktop, tablet hoặc điện thoại.

## Luồng đích

### Admin

1. **Dashboard:** hàng đầu là việc cần làm: vòng đang live, thiếu phân công, thiếu phiếu, snapshot chờ công bố, kết quả đã công bố. Mỗi việc có đường đến đúng entry/round. KPI tiến độ dùng cùng một mẫu số với trang Phiếu điểm.
2. **Tạo cuộc thi:** form cơ bản, tạo vòng đầu tiên, chỉ dẫn bước tiếp theo và trạng thái ban đầu; cấm chuyển sang trạng thái không hợp lệ.
3. **Tổng quan cuộc thi:** tóm tắt thông tin, vòng và tình trạng từng vòng; action theo trạng thái; status không cho set tùy ý nếu chưa thỏa điều kiện.
4. **Thí sinh:** tìm/lọc, thêm/sửa/rút, đổi thứ tự, tái sử dụng hồ sơ, CSV preview với lỗi theo dòng; khóa đúng trường sau khi bắt đầu.
5. **Giám khảo:** phân công toàn vòng/theo entry với nhãn nhất quán; coverage matrix cho mỗi entry; tài khoản mới/tồn tại, reset password và trạng thái hoạt động rõ ràng.
6. **Rubric:** chỉnh tiêu chí, điểm, bước, trọng số, nhận xét bắt buộc; báo tổng trọng số/hợp lệ ngay; preview có dữ liệu mẫu rõ; lịch sử phiên bản và phiên bản đang gắn với phiếu.
7. **Điều phối:** preflight → bắt đầu → chọn lượt → pause/resume/next/previous → kết thúc vòng. Màn hình luôn nêu entry hiện tại, lượt trước/sau, tình trạng điểm và cảnh báo đồng thời. Kết thúc vòng không đóng toàn cuộc thi ngoài ý muốn.
8. **Phiếu điểm:** bảng entry × Giám khảo, trạng thái draft/submitted/missing/reopened; tiến độ trên đúng mẫu số; mở lại phiếu bằng dialog yêu cầu lý do, có audit.
9. **Kết quả:** xem preview trước khóa; thiếu phiếu nêu rõ entry/judge và hậu quả; xác nhận ngoại lệ có lý do; snapshot version, người khóa, thời gian, chính sách hiển thị; publish là hành động riêng; export chỉ theo quyền.
10. **Nhật ký:** thời gian, người, hành động, entry/round liên quan, lý do; lọc theo actor/action/round và phân trang; dữ liệu audit không mất khi archive.

### Giám khảo

1. **Dashboard/queue:** nhóm theo cuộc thi và vòng, trạng thái có nghĩa, số lượt cần chấm/đã nộp, mục đang live và mục chờ; không hiển thị việc ngoài phạm vi.
2. **Phiếu:** đầu trang có mã lượt, thông tin được phép xem, vòng và phiên bản rubric; từng tiêu chí có hướng dẫn, thang/bước, trọng số và nhận xét bắt buộc; tổng hiện tại và trạng thái autosave bám theo form.
3. **Nộp:** review các trường thiếu, hộp xác nhận nêu hậu quả, hiển thị receipt gồm thời điểm/trạng thái; sau nộp read-only trừ khi Admin mở lại.
4. **Lịch sử:** đã nộp, nháp, đang chờ, bị mở lại và không khả dụng có lý do. Sau khi phiên kết thúc, queue vẫn giải thích rõ việc còn thiếu và cách tiếp tục.
5. **Kết quả:** chỉ snapshot đã publish; copy read-only, không dùng từ “quản lý”; không lộ thông tin/điểm theo chính sách snapshot.

## Các giai đoạn thực hiện

### Giai đoạn 1 — Chốt mô hình nghiệp vụ

- Xác nhận 7 mặc định phía trên: trạng thái cuộc thi, ngưỡng phiếu, publish visibility, phạm vi assignment, preflight, anonymity và tie-break.
- Vẽ state transition cho competition, round/session, score sheet, snapshot; đánh dấu hành động nào được lặp lại, đảo ngược hoặc cần lý do.
- Chốt mẫu số cho mọi KPI và quy tắc assignment coverage.
- **Đạt khi:** mỗi trạng thái có điều kiện vào/ra; không còn policy mơ hồ ảnh hưởng điểm hoặc quyền xem.

### Giai đoạn 2 — Sửa tính đúng đắn và đường phục hồi

- Không đặt `competition.status=COMPLETED` khi chỉ kết thúc một vòng; thêm logic derived/explicit close.
- Khóa hoặc version hóa `requiredJudgeCount`; pin publish visibility vào snapshot; mọi thao tác đổi quy chế có audit.
- Tạo preflight cho rubric, entry, coverage assignment và session; gate start/lock theo policy đã chốt.
- Giữ queue Giám khảo qua toàn bộ trạng thái waiting/live/draft/submitted/reopened; thêm cách xử lý entry bị bỏ lỡ.
- Sửa denominator tiến độ, dùng cùng một hàm cho KPI toàn cục, từng competition và Phiếu điểm.
- **Đạt khi:** snapshot, cấu hình, queue, dashboard và nhật ký cho cùng một trạng thái nhất quán; coverage thiếu có đường xử lý.

### Giai đoạn 3 — Guard vai trò và điều hướng

- Guard `/competitions`, `/competitions/new` và mọi section theo `systemRole` ở giao diện; không render CTA Admin cho Judge.
- Trang kết quả dùng copy/CTA riêng cho Admin và Judge; page breadcrumb, active nav và tiêu đề phản ánh đúng màn.
- Thêm skip link, accessible name cho mọi icon-only control, focus visible, label tìm kiếm và thông báo cập nhật trạng thái.
- **Đạt khi:** mở trực tiếp mọi route không tạo ra form sai quyền; API vẫn trả đúng 401/403 cho kiểm tra âm.

### Giai đoạn 4 — Thiết kế lại workspace Admin

- Làm Dashboard thành bảng điều hành và queue việc cần xử lý, không lặp KPI sai.
- Gộp nav competition thành nhóm ngắn/dễ tìm; tên trang trạng thái rõ; ở mobile cho biết tab đang chọn.
- Làm lại coverage/assignment, readiness, rubric editor, live control và snapshot workflow theo luồng đích.
- Thay prompt/confirm bằng dialog có focus trap, keyboard, summary, lý do và trạng thái loading/error.
- Thêm lọc/phân trang cho danh sách dài; phản hồi empty/loading/error nhất quán.
- Với từng route Admin, triển khai và kiểm tra layout riêng cho desktop, tablet portrait/landscape và điện thoại portrait/landscape; gồm bảng dài, form nhiều trường, dialog, menu/tab và thông báo.
- **Đạt khi:** Admin hoàn thành vòng từ tạo cuộc thi đến công bố kết quả mà không phải đoán bước kế tiếp hay mở nhiều tab để tìm thiếu sót; mọi route qua toàn bộ profile responsive.

### Giai đoạn 5 — Thiết kế lại workspace Giám khảo

- Queue ưu tiên mục đang live/nháp/đến hạn; lịch sử và mục chờ không biến mất.
- Tối ưu phiếu cho chấm nhanh và chính xác; controls nhập điểm đủ cao, nhận xét theo tiêu chí, feedback autosave không nhấp nháy.
- Hộp review trước nộp và receipt; trạng thái read-only/reopen rõ.
- Rà riêng queue, phiếu và kết quả trên tablet portrait/landscape, điện thoại nhỏ và điện thoại landscape; action lưu/nộp luôn nhìn thấy, không bị bàn phím ảo hoặc dialog che.
- **Đạt khi:** một Giám khảo hiểu lượt nào cần chấm, có thể tiếp tục nháp sau điều phối, không thể sửa phiếu đã nộp và không xem dữ liệu ngoài quyền; mọi route qua toàn bộ profile responsive.

### Giai đoạn 6 — Visual polish, responsive, accessibility

- Áp cùng design tokens, icon set và pattern lên login/setup, dashboard, danh sách, forms, bảng, dialogs, notices và trạng thái.
- Sửa khoảng trống panel đăng nhập; tạo layout thiết kế riêng cho tablet và mobile ở mọi route, đặc biệt điều phối, phiếu điểm, rubric, bảng phân công và kết quả.
- Với từng route, rà nội dung thật ở desktop 1440×900 và 1024×768; tablet 820×1180, 768×1024 và 1180×820; phone 390×844, 360×800, 320×568 và 844×390. Dùng profile tương ứng trong checklist; không chỉ dựa vào media query hoặc ảnh dashboard.
- Chụp ảnh bằng chứng cho **từng route tại đủ cả 9 viewport** trong checklist, sau khi dữ liệu tải xong; lưu theo tên có vai trò, route, trạng thái và kích thước viewport để dễ đối chiếu. Không miễn profile nào vì route trông đơn giản hoặc dùng chung component.
- Kiểm tra contrast, focus, keyboard, screen reader names, zoom 200%, reduced motion và target chạm tối thiểu 44px.
- **Đạt khi:** mọi ô trong ma trận route × thiết bị của `UX_UI_ACCEPTANCE_CHECKLIST.md` đã pass và có ảnh bằng chứng; không còn text clipping, horizontal page overflow hay nút nằm ngoài màn ở bất kỳ profile nào.

### Giai đoạn 7 — Nghiệm thu toàn luồng

- Dùng dữ liệu local mô phỏng có vòng nhiều trạng thái và assignment toàn vòng/theo entry; xác nhận mọi role.
- Chạy route/API và workflow checks: CRUD, CSV preview, assignment coverage, live controls, draft/submit/reopen, lock/gap/publish, visibility, export, audit.
- Chụp ảnh mọi route và trạng thái chính tại từng profile responsive, đọc từng ảnh; kiểm tra console/network, touch, bàn phím ảo, xoay màn hình và accessibility.
- Rà soát build/E2E theo quy trình dự án khi đến bước triển khai thực hiện; không sử dụng database production làm test target.
- **Đạt khi:** toàn bộ P1 đóng; P2 đóng hoặc có quyết định chấp nhận; checklist ký xác nhận; không có bước còn pending trong luồng chấm và công bố.

## Phạm vi thay đổi dự kiến

- **UI:** `src/app/(workspace)/**`, `src/components/app-shell.tsx`, `competition-workspace.tsx`, `judge-workspace.tsx`, shared UI và CSS toàn cục.
- **Nghiệp vụ/API:** dashboard, competition lifecycle, round policy, assignments, judge tasks, scores, live session, result snapshots/publishing, audit.
- **Schema/migration:** chỉ nếu cần lưu policy/version publication hoặc trạng thái competition derived. Phải được rà soát migration, backup, rollback trước khi tạo.
- **Tài liệu:** cập nhật `README.md`/`docs/IMPLEMENTATION_PLAN.md` chỉ sau khi code mới được xác minh; không để hướng dẫn cũ nói khác hành vi mới.

## Phạm vi deploy

Đợt tài liệu này chỉ nằm trong `docs/`. Workflow cPanel hiện đóng gói các đường dẫn được liệt kê cụ thể và không đưa `docs/` vào artifact. Tài liệu không được đưa lên host. Kế hoạch này cũng không yêu cầu push/deploy.
