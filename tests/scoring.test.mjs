import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateJudgeScores, aggregateRequiredGateResults, evaluateScoreSheet, rubricCriterionSchema, weightedScore } from '../src/lib/scoring.ts';

const policy = { resultMinimum: 0, resultMaximum: 10 };
const criterion = (id, type, config, extra = {}) => ({ id, name: id, type, config, minimum: 0, maximum: 10, step: 1, weight: 1, required: true, commentRequired: false, ...extra });

test('Numeric 0–10 giữ đúng điểm quy đổi', () => {
  const result = evaluateScoreSheet([criterion('n10', 'NUMERIC', { minimum: 0, maximum: 10, step: 0.5 })], [{ criterionId: 'n10', value: 8 }], policy, 2);
  assert.equal(result.totalScore, 8);
  assert.equal(result.criteria[0].score, 8);
});

test('Numeric 0–100 chuẩn hóa đúng về thang kết quả 0–10', () => {
  const result = evaluateScoreSheet([criterion('n100', 'NUMERIC', { minimum: 0, maximum: 100, step: 1 })], [{ criterionId: 'n100', value: 80 }], policy, 2);
  assert.equal(result.totalScore, 8);
});

test('Thang 0–10 và 0–100 dùng chung điểm nền, trọng số chỉ áp dụng một lần', () => {
  const criteria = [
    criterion('a', 'NUMERIC', { minimum: 0, maximum: 10, step: 1 }, { weight: 3 }),
    criterion('b', 'NUMERIC', { minimum: 0, maximum: 100, step: 1 }, { weight: 1 }),
  ];
  const result = evaluateScoreSheet(criteria, [{ criterionId: 'a', value: 10 }, { criterionId: 'b', value: 0 }], policy, 2);
  assert.equal(result.totalScore, 7.5);
});

test('Rating Scale dùng giá trị mức được chọn và chuẩn hóa theo các mức', () => {
  const config = { options: [{ id: 'low', label: 'Chưa đạt', value: 0 }, { id: 'mid', label: 'Đạt', value: 5 }, { id: 'high', label: 'Xuất sắc', value: 10 }] };
  const result = evaluateScoreSheet([criterion('r', 'RATING', config)], [{ criterionId: 'r', value: 'mid' }], policy, 2);
  assert.equal(result.totalScore, 5);
  assert.equal(result.criteria[0].score, 5);
});

test('Pass/Fail bắt buộc đánh dấu kết quả nhưng không cộng vào điểm', () => {
  const criteria = [criterion('n', 'NUMERIC', { minimum: 0, maximum: 10, step: 1 }), criterion('gate', 'PASS_FAIL', { passLabel: 'Đạt', failLabel: 'Không đạt', requiredGate: true })];
  const result = evaluateScoreSheet(criteria, [{ criterionId: 'n', value: 8 }, { criterionId: 'gate', value: false }], policy, 2);
  assert.equal(result.totalScore, 8);
  assert.equal(result.outcome, 'FAIL');
  assert.equal(result.criteria[1].score, null);
});

test('Checklist tính tổng mục đã chọn theo tỷ lệ điểm', () => {
  const config = { mode: 'POINTS', items: [{ id: 'one', label: 'Yêu cầu A', points: 2 }, { id: 'two', label: 'Yêu cầu B', points: 2 }, { id: 'three', label: 'Yêu cầu C', points: 4 }] };
  const result = evaluateScoreSheet([criterion('check', 'CHECKLIST', config)], [{ criterionId: 'check', value: ['one', 'three'] }], policy, 2);
  assert.equal(result.totalScore, 7.5);
  assert.equal(result.criteria[0].score, 6);
});

test('Checklist chỉ ghi nhận hoàn thành không bị ép thành điểm số', () => {
  const config = { mode: 'COMPLETION', items: [{ id: 'one', label: 'Yêu cầu A', points: 0 }] };
  const result = evaluateScoreSheet([criterion('check', 'CHECKLIST', config)], [{ criterionId: 'check', value: ['one'] }], policy, 2);
  assert.equal(result.totalScore, null);
  assert.equal(result.outcome, 'PASS');
});

test('Bonus/Penalty được cộng sau điểm nền và giữ độ chính xác thập phân', () => {
  const criteria = [criterion('base', 'NUMERIC', { minimum: 0, maximum: 10, step: 0.05 }), criterion('penalty', 'BONUS_PENALTY', { minimum: -2, maximum: 2, step: 0.05 })];
  const result = evaluateScoreSheet(criteria, [{ criterionId: 'base', value: 8.35 }, { criterionId: 'penalty', value: -1.25 }], policy, 2);
  assert.equal(result.totalScore, 7.1);
});

test('Trung bình và trung vị giữa nhiều giám khảo vẫn đúng', () => {
  assert.equal(aggregateJudgeScores([8, 6, 10], 'AVERAGE'), 8);
  assert.equal(aggregateJudgeScores([2, 9, 5, 7], 'MEDIAN'), 6);
});

test('Một giám khảo đánh trượt điều kiện bắt buộc làm kết quả thí sinh không đạt', () => {
  assert.equal(aggregateRequiredGateResults(['PASS', 'PASS']), 'PASS');
  assert.equal(aggregateRequiredGateResults(['PASS', 'FAIL', 'PASS']), 'FAIL');
});

test('Phiếu numeric cũ giữ công thức trung bình có trọng số gốc', () => {
  const oldCriteria = [{ id: 'a', minimum: 0, maximum: 10, step: 1, weight: 1, commentRequired: false }, { id: 'b', minimum: 0, maximum: 100, step: 1, weight: 3, commentRequired: false }];
  const oldDetails = [{ criterionId: 'a', score: 8 }, { criterionId: 'b', score: 80 }];
  assert.equal(weightedScore(oldCriteria, oldDetails), 62);
  const legacy = oldCriteria.map((item) => criterion(item.id, 'NUMERIC', { minimum: item.minimum, maximum: item.maximum, step: item.step }, { weight: item.weight }));
  assert.equal(evaluateScoreSheet(legacy, oldDetails.map(({ criterionId, score }) => ({ criterionId, value: score })), { ...policy, legacyWeightedAverage: true }, 4).totalScore, 62);
});

test('Từ chối thiếu tiêu chí bắt buộc, sai thang, mức đánh giá lạ và checklist lặp', () => {
  const numeric = criterion('n', 'NUMERIC', { minimum: 0, maximum: 10, step: 0.5 });
  assert.match(evaluateScoreSheet([numeric], [], policy).error, /bắt buộc/);
  assert.match(evaluateScoreSheet([numeric], [{ criterionId: 'n', value: 11 }], policy).error, /không hợp lệ/);
  const rating = criterion('r', 'RATING', { options: [{ id: 'a', label: 'A', value: 0 }, { id: 'b', label: 'B', value: 1 }] });
  assert.match(evaluateScoreSheet([rating], [{ criterionId: 'r', value: 'unknown' }], policy).error, /không hợp lệ/);
  const checklist = criterion('c', 'CHECKLIST', { mode: 'COMPLETION', items: [{ id: 'a', label: 'A', points: 0 }] });
  assert.match(evaluateScoreSheet([checklist], [{ criterionId: 'c', value: ['a', 'a'] }], policy).error, /không hợp lệ/);
});

test('Giới hạn giá trị lưu trữ ở 4 chữ số thập phân', () => {
  assert.equal(rubricCriterionSchema.safeParse({ type: 'NUMERIC', config: { minimum: 0, maximum: 10, step: 0.00001 } }).success, false);
  const numeric = criterion('n', 'NUMERIC', { minimum: 0, maximum: 10, step: 0.0001 });
  assert.match(evaluateScoreSheet([numeric], [{ criterionId: 'n', value: 1.00001 }], policy).error, /không hợp lệ/);
});
