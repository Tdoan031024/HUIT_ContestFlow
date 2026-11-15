import { z } from 'zod';

export const criterionTypes = ['NUMERIC', 'RATING', 'PASS_FAIL', 'CHECKLIST', 'BONUS_PENALTY'] as const;
export type CriterionType = (typeof criterionTypes)[number];

const safeDecimalSchema = z.number().finite().refine((value) => isSafeScoreDecimal(value));
const numericConfig = z.object({ minimum: safeDecimalSchema, maximum: safeDecimalSchema, step: safeDecimalSchema.positive() }).strict();
const ratingConfig = z.object({ options: z.array(z.object({ id: z.string().min(1).max(80), label: z.string().trim().min(1).max(120), value: safeDecimalSchema }).strict()).min(2).max(20) }).strict();
const passFailConfig = z.object({ passLabel: z.string().trim().min(1).max(80), failLabel: z.string().trim().min(1).max(80), requiredGate: z.boolean() }).strict();
const checklistConfig = z.object({ mode: z.enum(['POINTS', 'COMPLETION']), items: z.array(z.object({ id: z.string().min(1).max(80), label: z.string().trim().min(1).max(160), points: safeDecimalSchema.nonnegative() }).strict()).min(1).max(40) }).strict();
const bonusPenaltyConfig = z.object({ minimum: safeDecimalSchema, maximum: safeDecimalSchema, step: safeDecimalSchema.positive() }).strict();

export const rubricCriterionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('NUMERIC'), config: numericConfig }),
  z.object({ type: z.literal('RATING'), config: ratingConfig }),
  z.object({ type: z.literal('PASS_FAIL'), config: passFailConfig }),
  z.object({ type: z.literal('CHECKLIST'), config: checklistConfig }),
  z.object({ type: z.literal('BONUS_PENALTY'), config: bonusPenaltyConfig }),
]);

export type ScoringConfig = {
  resultMinimum: number;
  resultMaximum: number;
  legacyWeightedAverage?: boolean;
  passFailAggregation?: 'ANY_FAIL';
};
export type ConfiguredCriterion = {
  id: string;
  name: string;
  type: CriterionType;
  config: unknown;
  minimum: number;
  maximum: number;
  step: number;
  weight: number;
  required: boolean;
  commentRequired: boolean;
};
export type ScoreInput = { criterionId: string; value: unknown; comment?: string | null };
export type CriterionResult = { criterionId: string; value: unknown; score: number | null; outcome: 'PASS' | 'FAIL' | null };
export type ScoreEvaluation = { totalScore: number | null; outcome: 'PASS' | 'FAIL'; criteria: CriterionResult[]; error: string | null };

const SCALE = BigInt(1000000);
const MAX_DECIMAL = 99_999_999.9999;

export function isSafeScoreDecimal(value: number) {
  const scaled = value * 10000;
  return Number.isFinite(value) && Math.abs(value) <= MAX_DECIMAL && Math.abs(scaled - Math.round(scaled)) <= Number.EPSILON * Math.max(1, Math.abs(scaled)) * 4;
}

function toScaled(value: number | string): bigint | null {
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  const source = String(value).trim();
  const match = /^([+-]?)(\d+)(?:\.(\d*))?$/.exec(source);
  if (!match) return null;
  const sign = match[1] === '-' ? -BigInt(1) : BigInt(1);
  const whole = BigInt(match[2]);
  const fraction = match[3] ?? '';
  const kept = fraction.slice(0, 6).padEnd(6, '0');
  let result = whole * SCALE + BigInt(kept || '0');
  if (fraction.length > 6 && Number(fraction[6]) >= 5) result += BigInt(1);
  return result * sign;
}

function divideRounded(numerator: bigint, denominator: bigint) {
  if (denominator === BigInt(0)) return null;
  const negative = (numerator < BigInt(0)) !== (denominator < BigInt(0));
  const n = numerator < BigInt(0) ? -numerator : numerator;
  const d = denominator < BigInt(0) ? -denominator : denominator;
  const quotient = (n + d / BigInt(2)) / d;
  return negative ? -quotient : quotient;
}

function toNumber(value: bigint | null) {
  return value === null ? null : Number(value) / Number(SCALE);
}

function rounded(value: bigint | null, precision: number) {
  if (value === null) return null;
  const places = Math.min(4, Math.max(0, Math.trunc(precision)));
  const factor = BigInt(10) ** BigInt(6 - places);
  const result = divideRounded(value, factor);
  return result === null ? null : Number(result) / Number(BigInt(10) ** BigInt(places));
}

function numericValue(value: unknown) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  return toScaled(value);
}

function ratio(value: bigint, minimum: bigint, maximum: bigint) {
  if (maximum <= minimum) return null;
  return divideRounded((value - minimum) * SCALE, maximum - minimum);
}

function onStep(value: bigint, minimum: bigint, step: bigint) {
  if (step <= BigInt(0)) return false;
  return (value - minimum) % step === BigInt(0);
}

function normalizedScore(criterion: ConfiguredCriterion, value: unknown): { ratio: bigint | null; score: number | null; outcome: 'PASS' | 'FAIL' | null; error: string | null } {
  const invalid = () => ({ ratio: null, score: null, outcome: null, error: `Giá trị của “${criterion.name}” không hợp lệ.` });
  if (criterion.type === 'NUMERIC' || criterion.type === 'BONUS_PENALTY') {
    const config = (criterion.type === 'NUMERIC' ? numericConfig : bonusPenaltyConfig).safeParse(criterion.config);
    const numeric = numericValue(value);
    if (!config.success || numeric === null || typeof value !== 'number' || !isSafeScoreDecimal(value)) return invalid();
    const minimum = toScaled(config.data.minimum)!; const maximum = toScaled(config.data.maximum)!; const step = toScaled(config.data.step)!;
    if (maximum <= minimum || numeric < minimum || numeric > maximum || !onStep(numeric, minimum, step)) return invalid();
    const score = toNumber(numeric)!;
    return { ratio: criterion.type === 'NUMERIC' ? ratio(numeric, minimum, maximum) : null, score, outcome: null, error: null };
  }
  if (criterion.type === 'RATING') {
    const config = ratingConfig.safeParse(criterion.config);
    if (!config.success || typeof value !== 'string') return invalid();
    const selected = config.data.options.find((option) => option.id === value);
    const values = config.data.options.map((option) => toScaled(option.value)!);
    if (!selected) return invalid();
    const score = toScaled(selected.value)!;
    const minimum = values.reduce((a, b) => a < b ? a : b); const maximum = values.reduce((a, b) => a > b ? a : b);
    return { ratio: ratio(score, minimum, maximum), score: toNumber(score), outcome: null, error: null };
  }
  if (criterion.type === 'PASS_FAIL') {
    const config = passFailConfig.safeParse(criterion.config);
    if (!config.success || typeof value !== 'boolean') return invalid();
    return { ratio: null, score: null, outcome: value ? 'PASS' : 'FAIL', error: null };
  }
  const config = checklistConfig.safeParse(criterion.config);
  if (!config.success || !Array.isArray(value) || value.some((id) => typeof id !== 'string') || new Set(value).size !== value.length) return invalid();
  const selected = new Set(value as string[]);
  if ([...selected].some((id) => !config.data.items.some((item) => item.id === id))) return invalid();
  if (config.data.mode === 'COMPLETION') return { ratio: null, score: null, outcome: null, error: null };
  const total = config.data.items.reduce((sum, item) => sum + toScaled(item.points)!, BigInt(0));
  if (total <= BigInt(0)) return invalid();
  const points = config.data.items.reduce((sum, item) => selected.has(item.id) ? sum + toScaled(item.points)! : sum, BigInt(0));
  return { ratio: divideRounded(points * SCALE, total), score: toNumber(points), outcome: null, error: null };
}

export function evaluateScoreSheet(
  criteria: ConfiguredCriterion[],
  details: ScoreInput[],
  policy: ScoringConfig,
  precision = 4,
  submitting = true,
): ScoreEvaluation {
  const byId = new Map(criteria.map((criterion) => [criterion.id, criterion]));
  const values = new Map<string, ScoreInput>();
  for (const detail of details) {
    if (!byId.has(detail.criterionId) || values.has(detail.criterionId)) return { totalScore: null, outcome: 'PASS', criteria: [], error: 'Danh sách giá trị có tiêu chí không hợp lệ hoặc bị lặp.' };
    values.set(detail.criterionId, detail);
  }
  if (submitting && criteria.some((criterion) => criterion.required && !values.has(criterion.id))) {
    return { totalScore: null, outcome: 'PASS', criteria: [], error: 'Cần hoàn thành tất cả tiêu chí bắt buộc trước khi nộp phiếu.' };
  }

  const results: CriterionResult[] = [];
  let weightedRatio = BigInt(0); let weightTotal = BigInt(0); let bonusTotal = BigInt(0); let failedGate = false;
  for (const criterion of criteria) {
    const detail = values.get(criterion.id);
    if (!detail) continue;
    if (submitting && criterion.commentRequired && !detail.comment?.trim()) return { totalScore: null, outcome: 'PASS', criteria: [], error: `Cần nhập nhận xét cho “${criterion.name}”.` };
    const result = normalizedScore(criterion, detail.value);
    if (result.error) return { totalScore: null, outcome: 'PASS', criteria: [], error: result.error };
    results.push({ criterionId: criterion.id, value: detail.value, score: result.score, outcome: result.outcome });
    if (criterion.type === 'PASS_FAIL' && (criterion.config as z.infer<typeof passFailConfig>).requiredGate && result.outcome === 'FAIL') failedGate = true;
    if (criterion.type === 'BONUS_PENALTY' && result.score !== null) bonusTotal += toScaled(result.score)!;
    if (result.ratio !== null && ['NUMERIC', 'RATING', 'CHECKLIST'].includes(criterion.type)) {
      const weight = toScaled(criterion.weight);
      if (weight === null || weight <= BigInt(0)) return { totalScore: null, outcome: 'PASS', criteria: [], error: `Hệ số của “${criterion.name}” không hợp lệ.` };
      weightedRatio += result.ratio * weight;
      weightTotal += weight;
    }
  }

  let total: bigint | null = null;
  if (policy.legacyWeightedAverage) {
    let numerator = BigInt(0); let denominator = BigInt(0);
    for (const criterion of criteria) {
      if (!['NUMERIC', 'RATING', 'CHECKLIST'].includes(criterion.type)) continue;
      const value = results.find((item) => item.criterionId === criterion.id)?.score;
      if (value === undefined || value === null) continue;
      const weight = toScaled(criterion.weight);
      const scaledValue = toScaled(value);
      if (weight === null || scaledValue === null || weight <= BigInt(0)) continue;
      numerator += scaledValue * weight; denominator += weight;
    }
    total = divideRounded(numerator, denominator);
  } else if (weightTotal > BigInt(0)) {
    const weighted = divideRounded(weightedRatio, weightTotal);
    const resultMin = toScaled(policy.resultMinimum); const resultMax = toScaled(policy.resultMaximum);
    if (weighted !== null && resultMin !== null && resultMax !== null && resultMax > resultMin) {
      total = resultMin + divideRounded((resultMax - resultMin) * weighted, SCALE)! + bonusTotal;
      total = total < resultMin ? resultMin : total > resultMax ? resultMax : total;
    }
  }
  return { totalScore: rounded(total, precision), outcome: failedGate ? 'FAIL' : 'PASS', criteria: results, error: null };
}

export function aggregateJudgeScores(scores: number[], method: 'AVERAGE' | 'MEDIAN') {
  const valid = scores.filter(Number.isFinite);
  if (!valid.length) return null;
  const values = valid.map(toScaled);
  if (values.some((value) => value === null)) return null;
  if (method === 'MEDIAN') {
    const sorted = values as bigint[];
    sorted.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
    const middle = Math.floor(sorted.length / 2);
    const value = sorted.length % 2 ? sorted[middle] : divideRounded(sorted[middle - 1] + sorted[middle], BigInt(2))!;
    return toNumber(value);
  }
  const sum = (values as bigint[]).reduce((total, value) => total + value, BigInt(0));
  return toNumber(divideRounded(sum, BigInt(valid.length)));
}

/** A required gate fails the contestant when any submitted judge records a fail. */
export function aggregateRequiredGateResults(outcomes: Array<'PASS' | 'FAIL' | null | undefined>) {
  return outcomes.some((outcome) => outcome === 'FAIL') ? 'FAIL' : 'PASS';
}

export function weightedScore(criteria: { id: string; minimum: number; maximum: number; step: number; weight: number; commentRequired: boolean }[], details: { criterionId: string; score: number; comment?: string | null }[]) {
  const dynamic: ConfiguredCriterion[] = criteria.map((criterion) => ({
    ...criterion, name: criterion.id, type: 'NUMERIC', config: { minimum: criterion.minimum, maximum: criterion.maximum, step: criterion.step }, required: true,
  }));
  return evaluateScoreSheet(dynamic, details.map((item) => ({ ...item, value: item.score })), { resultMinimum: 0, resultMaximum: 10, legacyWeightedAverage: true }, 4).totalScore;
}

export function roundScore(value: number, precision: number) {
  const scaled = toScaled(value);
  return rounded(scaled, precision) ?? 0;
}
