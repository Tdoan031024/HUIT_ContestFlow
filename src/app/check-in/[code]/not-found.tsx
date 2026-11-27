export default function CheckInNotFound() {
  return (
    <div className="attendance-public-shell">
      <header className="attendance-public-header">
        <strong className="attendance-public-brand">HUIT ContestFlow</strong>
        <span>Điểm danh</span>
      </header>
      <main className="attendance-public-main">
        <h1>Không tìm thấy sự kiện</h1>
        <p>Hãy kiểm tra lại đường dẫn hoặc quét lại mã QR do Ban tổ chức cung cấp.</p>
        <p>Nếu vẫn gặp lỗi, hãy liên hệ Ban tổ chức để lấy đường dẫn điểm danh.</p>
      </main>
    </div>
  );
}
