const actionLabels: Record<string, string> = {
  COMPETITION_CREATED: 'Tạo cuộc thi', COMPETITION_UPDATED: 'Cập nhật cuộc thi', COMPETITION_ARCHIVED: 'Lưu trữ cuộc thi', COMPETITION_CLOSED_EARLY: 'Đóng sớm cuộc thi',
  ROUND_CREATED: 'Tạo vòng thi', ROUND_UPDATED: 'Cập nhật vòng thi',
  CONTESTANT_CREATED: 'Thêm thí sinh', CONTESTANT_UPDATED: 'Cập nhật hồ sơ thí sinh', CONTESTANT_WITHDRAWN: 'Rút thí sinh', CONTESTANTS_IMPORTED: 'Nhập danh sách thí sinh', ENTRY_CREATED: 'Đăng ký lượt thi', ENTRY_ORDER_UPDATED: 'Đổi thứ tự thi',
  JUDGE_ASSIGNED: 'Phân công giám khảo', JUDGE_UNASSIGNED: 'Thu hồi phân công giám khảo', JUDGE_PASSWORD_RESET: 'Đặt lại mật khẩu giám khảo',
  RUBRIC_VERSION_ACTIVATED: 'Tạo và kích hoạt phiên bản rubric',
  SESSION_START: 'Bắt đầu điều phối', SESSION_PAUSE: 'Tạm dừng điều phối', SESSION_RESUME: 'Tiếp tục điều phối', SESSION_SELECT: 'Chọn lượt thi', SESSION_NEXT: 'Chuyển sang lượt thi tiếp theo', SESSION_PREVIOUS: 'Quay lại lượt thi trước', SESSION_FINISH: 'Kết thúc điều phối',
  SCORE_SUBMITTED: 'Nộp phiếu chấm', SCORE_DRAFT_SAVED: 'Lưu bản nháp phiếu chấm', SCORE_REOPENED: 'Mở lại phiếu chấm',
  RESULTS_LOCKED: 'Khóa kết quả', RESULTS_PUBLISHED: 'Công bố kết quả',
};
const entityLabels: Record<string, string> = {
  Competition: 'Cuộc thi', CompetitionRound: 'Vòng thi', Contestant: 'Thí sinh', CompetitionEntry: 'Lượt thi',
  JudgeAssignment: 'Phân công giám khảo', RubricVersion: 'Phiên bản rubric', ScoreSheet: 'Phiếu chấm', ResultSnapshot: 'Bản kết quả',
};
const detailLabels: Record<string, string> = {
  count: 'Số hồ sơ', criteriaCount: 'Số tiêu chí', version: 'Phiên bản', previousVersion: 'Phiên bản trước', existingSheets: 'Phiếu đã tạo', missingAssignmentCount: 'Lượt thiếu phân công',
  entryCount: 'Số lượt thi', missingCount: 'Lượt còn thiếu phiếu', totalScore: 'Điểm tổng', reason: 'Lý do', state: 'Trạng thái phiên',
  anonymous: 'Ẩn danh thí sinh', requiredJudgeCount: 'Số phiếu yêu cầu', allowAdvanceWithGaps: 'Cho phép thiếu phiếu', publishScores: 'Công khai điểm giám khảo', aggregateMethod: 'Cách tổng hợp', tieBreakMethod: 'Xử lý đồng điểm', roundingPrecision: 'Chữ số làm tròn',
  status: 'Trạng thái',
};
const detailValues: Record<string, Record<string, string>> = {
  aggregateMethod: { AVERAGE: 'Trung bình cộng', MEDIAN: 'Trung vị' },
  tieBreakMethod: { TOTAL_SCORE: 'Đồng hạng khi bằng điểm tổng', CRITERIA_PRIORITY: 'Ưu tiên tiêu chí' },
  status: { DRAFT: 'Bản nháp', REGISTRATION: 'Mở đăng ký', READY: 'Sẵn sàng', LIVE: 'Đang diễn ra', COMPLETED: 'Hoàn tất', ARCHIVED: 'Lưu trữ' },
};

export function auditActionLabel(action: string) { return actionLabels[action] ?? 'Cập nhật dữ liệu'; }
export function auditEntityLabel(entityType: string) { return entityLabels[entityType] ?? 'Dữ liệu'; }

export function auditDetailRows(action: string, details: unknown) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return [] as { label: string; value: string }[];
  const values = details as Record<string, unknown>;
  if (action === 'ENTRY_ORDER_UPDATED' && Array.isArray(values.before) && Array.isArray(values.after)) {
    const before = new Map(values.before.map((item) => [String((item as Record<string, unknown>).entryId), item as Record<string, unknown>]));
    const after = new Map(values.after.map((item) => [String((item as Record<string, unknown>).entryId), item as Record<string, unknown>]));
    const changes = [...after.entries()].flatMap(([id, current]) => {
      const prior = before.get(id);
      return prior && prior.sequence !== current.sequence ? [`${current.entryCode}: ${prior.sequence} → ${current.sequence}`] : [];
    });
    return changes.length ? [{ label: 'Thay đổi thứ tự', value: changes.join(' · ') }] : [];
  }
  const rows: { label: string; value: string }[] = [];
  for (const [key, value] of Object.entries(values)) {
    if (['before', 'after', 'roundId', 'entryId', 'judgeId', 'currentEntryId'].includes(key) || value === null || value === undefined) continue;
    const label = detailLabels[key];
    if (!label) continue;
    if (typeof value === 'boolean') rows.push({ label, value: value ? 'Có' : 'Không' });
    else if (key === 'state') rows.push({ label, value: ({ IDLE: 'Chưa bắt đầu', LIVE: 'Đang diễn ra', PAUSED: 'Tạm dừng', COMPLETED: 'Đã kết thúc' } as Record<string, string>)[String(value)] ?? String(value) });
    else if (typeof value === 'number' || typeof value === 'string') rows.push({ label, value: detailValues[key]?.[String(value)] ?? String(value) });
    else if (Array.isArray(value) && key === 'details') rows.push({ label: 'Số tiêu chí cập nhật', value: String(value.length) });
  }
  if (Array.isArray(values.after) && action.startsWith('SCORE_')) rows.push({ label: 'Số tiêu chí lưu', value: String(values.after.length) });
  return rows;
}
