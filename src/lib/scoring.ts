export type CriterionInput = { id: string; minimum: number; maximum: number; step: number; weight: number; commentRequired: boolean };
export type ScoreInput = { criterionId: string; score: number; comment?: string | null };

export function validateScoreInput(criteria: CriterionInput[], details: ScoreInput[], submitting: boolean) {
  const byId = new Map(criteria.map((criterion) => [criterion.id, criterion]));
  const seen = new Set<string>();
  for (const detail of details) {
    const criterion = byId.get(detail.criterionId);
    if (!criterion || seen.has(detail.criterionId)) return 'Danh sách điểm có tiêu chí không hợp lệ hoặc bị lặp.';
    seen.add(detail.criterionId);
    if (!Number.isFinite(detail.score) || detail.score < criterion.minimum || detail.score > criterion.maximum) {
      return `Điểm nằm ngoài thang của tiêu chí đã chọn.`;
    }
    const steps = (detail.score - criterion.minimum) / criterion.step;
    if (Math.abs(steps - Math.round(steps)) > 1e-7) return 'Điểm không đúng bước điểm của rubric.';
    if (submitting && criterion.commentRequired && !detail.comment?.trim()) return 'Cần nhập nhận xét cho tiêu chí bắt buộc.';
  }
  if (submitting && (criteria.length === 0 || criteria.some((criterion) => !seen.has(criterion.id)))) {
    return 'Cần chấm đủ tất cả tiêu chí trước khi nộp phiếu.';
  }
  return null;
}

export function weightedScore(criteria: CriterionInput[], details: ScoreInput[]) {
  const byId = new Map(details.map((detail) => [detail.criterionId, detail.score]));
  const available = criteria.filter((criterion) => byId.has(criterion.id));
  const totalWeight = available.reduce((sum, criterion) => sum + criterion.weight, 0);
  if (!totalWeight) return null;
  const total = available.reduce((sum, criterion) => sum + byId.get(criterion.id)! * criterion.weight, 0) / totalWeight;
  return Math.round(total * 10000) / 10000;
}

export function aggregateJudgeScores(scores: number[], method: 'AVERAGE' | 'MEDIAN') {
  if (!scores.length) return null;
  if (method === 'MEDIAN') {
    const sorted = [...scores].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    const value = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    return Math.round(value * 10000) / 10000;
  }
  return Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10000) / 10000;
}
