import crypto from 'node:crypto';

export const MIN_K_ANONYMITY = 20;

export class PrivacyGuardError extends Error {
  public readonly code: 'K_ANONYMITY_VIOLATION' | 'EPSILON_BUDGET_EXHAUSTED' | 'INVALID_QUERY';
  public readonly details: Record<string, unknown>;

  constructor(
    code: 'K_ANONYMITY_VIOLATION' | 'EPSILON_BUDGET_EXHAUSTED' | 'INVALID_QUERY',
    message: string,
    details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'PrivacyGuardError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Sample from a continuous Uniform(0, 1) distribution using 48 bits of cryptographic entropy
 * from `crypto.randomBytes(6)`. Never uses `Math.random()`.
 */
export function cryptoUniform01(): number {
  const buf = crypto.randomBytes(6);
  const intVal =
    buf[0] * 0x10000000000 +
    buf[1] * 0x100000000 +
    buf[2] * 0x1000000 +
    buf[3] * 0x10000 +
    buf[4] * 0x100 +
    buf[5];
  // Strictly inside (0, 1) to avoid log(0)
  return (intVal + 0.5) / 0x1000000000000;
}

/**
 * Sample from Laplace(0, scale) where `scale = sensitivity / epsilon`.
 * Uses inverse transform sampling:
 *   U = Uniform(0, 1) - 0.5
 *   X = -scale * sign(U) * ln(1 - 2 * |U|)
 */
export function sampleLaplace(scale: number): number {
  if (scale <= 0) {
    return 0;
  }
  const u = cryptoUniform01() - 0.5;
  const sign = u < 0 ? -1 : 1;
  const absU = Math.min(Math.abs(u), 0.499999999999);
  return -scale * sign * Math.log(1 - 2 * absU);
}

export type AggregateOp = 'AVG' | 'SUM' | 'COUNT' | 'MIN' | 'MAX' | 'MODEL_METRIC';

export interface QuerySpec {
  op: AggregateOp;
  column: string;
  filterColumn?: string;
  filterOp?: 'eq' | 'gt' | 'lt' | 'gte' | 'lte';
  filterValue?: string | number;
  epsilon: number;
}

export interface DpQueryResult {
  op: AggregateOp;
  column: string;
  matchedRowsK: number;
  rawAggregateHidden: boolean;
  noisedValue: number;
  laplaceScale: number;
  sensitivity: number;
  noiseAdded: number;
  epsilonUsed: number;
  epsilonRemaining: number;
  confidenceInterval95: [number, number];
}

/**
 * Filter rows by an optional predicate (`filterColumn`, `filterOp`, `filterValue`).
 */
export function filterRows(
  rows: Record<string, string>[],
  spec: Pick<QuerySpec, 'filterColumn' | 'filterOp' | 'filterValue'>
): Record<string, string>[] {
  if (!spec.filterColumn || spec.filterValue === undefined || spec.filterValue === '') {
    return rows;
  }
  const col = spec.filterColumn;
  const op = spec.filterOp || 'eq';
  const targetStr = String(spec.filterValue).trim();
  const targetNum = Number(targetStr);
  const isTargetNumeric = !Number.isNaN(targetNum) && targetStr !== '';

  return rows.filter((row) => {
    const cell = (row[col] ?? '').trim();
    if (cell === '') return false;
    const cellNum = Number(cell);
    const bothNumeric = isTargetNumeric && !Number.isNaN(cellNum);

    switch (op) {
      case 'eq':
        return bothNumeric ? cellNum === targetNum : cell.toLowerCase() === targetStr.toLowerCase();
      case 'gt':
        return bothNumeric && cellNum > targetNum;
      case 'gte':
        return bothNumeric && cellNum >= targetNum;
      case 'lt':
        return bothNumeric && cellNum < targetNum;
      case 'lte':
        return bothNumeric && cellNum <= targetNum;
      default:
        return cell === targetStr;
    }
  });
}

/**
 * Execute a differentially-private aggregate query inside the TEE enclave.
 * Enforces:
 * 1. `epsilon > 0` and `epsilon <= epsilonRemaining`
 * 2. `k >= 20` matched rows (k-anonymity guard)
 * 3. Sensitivity-calibrated Laplace mechanism
 */
export function executeDpQuery(
  allRows: Record<string, string>[],
  spec: QuerySpec,
  epsilonBudget: number,
  epsilonSpent: number
): DpQueryResult {
  if (!Number.isFinite(spec.epsilon) || spec.epsilon <= 0 || spec.epsilon > 5.0) {
    throw new PrivacyGuardError(
      'INVALID_QUERY',
      `Query epsilon must be within (0, 5.0]; received ${spec.epsilon}`
    );
  }

  const epsilonRemainingBefore = Math.max(0, epsilonBudget - epsilonSpent);
  if (spec.epsilon > epsilonRemainingBefore + 1e-9) {
    throw new PrivacyGuardError(
      'EPSILON_BUDGET_EXHAUSTED',
      `Differential privacy budget exhausted: requested ε=${spec.epsilon.toFixed(2)}, but only ε=${epsilonRemainingBefore.toFixed(2)} remains of ${epsilonBudget.toFixed(2)} budget.`,
      {
        epsilonRequested: spec.epsilon,
        epsilonRemaining: epsilonRemainingBefore,
        epsilonBudget,
      }
    );
  }

  const matched = filterRows(allRows, spec);
  const k = matched.length;

  if (k < MIN_K_ANONYMITY) {
    throw new PrivacyGuardError(
      'K_ANONYMITY_VIOLATION',
      `k-anonymity guard rejected query: matched group has k=${k} rows, which is below the minimum required threshold of k=${MIN_K_ANONYMITY} rows.`,
      {
        matchedRowsK: k,
        minRequiredK: MIN_K_ANONYMITY,
        filterColumn: spec.filterColumn,
        filterOp: spec.filterOp,
        filterValue: spec.filterValue,
      }
    );
  }

  const numericValues: number[] = [];
  for (const r of matched) {
    const v = Number(r[spec.column]);
    if (Number.isFinite(v) && (r[spec.column] ?? '').trim() !== '') {
      numericValues.push(v);
    }
  }

  if (spec.op !== 'COUNT' && numericValues.length < MIN_K_ANONYMITY) {
    throw new PrivacyGuardError(
      'K_ANONYMITY_VIOLATION',
      `k-anonymity guard rejected query on column "${spec.column}": only ${numericValues.length} non-null numeric values matched (minimum required is ${MIN_K_ANONYMITY}).`,
      { matchedRowsK: numericValues.length, minRequiredK: MIN_K_ANONYMITY }
    );
  }

  let trueVal = 0;
  let sensitivity = 1.0;

  if (spec.op === 'COUNT') {
    trueVal = k;
    sensitivity = 1.0; // Adding/removing 1 record changes COUNT by at most 1
  } else {
    const minVal = Math.min(...numericValues);
    const maxVal = Math.max(...numericValues);
    const span = Math.max(1e-6, maxVal - minVal);
    const sumVal = numericValues.reduce((acc, v) => acc + v, 0);

    switch (spec.op) {
      case 'SUM':
        trueVal = sumVal;
        sensitivity = Math.max(Math.abs(maxVal), Math.abs(minVal), 1.0);
        break;
      case 'AVG':
        trueVal = sumVal / numericValues.length;
        sensitivity = span / numericValues.length;
        break;
      case 'MIN':
        trueVal = minVal;
        sensitivity = span / Math.sqrt(numericValues.length);
        break;
      case 'MAX':
        trueVal = maxVal;
        sensitivity = span / Math.sqrt(numericValues.length);
        break;
      case 'MODEL_METRIC':
        trueVal = sumVal / numericValues.length;
        sensitivity = 1.0 / numericValues.length;
        break;
    }
  }

  const laplaceScale = sensitivity / spec.epsilon;
  const noise = sampleLaplace(laplaceScale);
  const noisedValue = Number((trueVal + noise).toFixed(4));
  const epsilonRemaining = Number(Math.max(0, epsilonRemainingBefore - spec.epsilon).toFixed(4));

  // 95% confidence interval of Laplace(0, b) is +/- b * ln(20) ≈ +/- 2.9957 * b
  const halfWidth = 2.99573227 * laplaceScale;
  const ciLow = Number((noisedValue - halfWidth).toFixed(4));
  const ciHigh = Number((noisedValue + halfWidth).toFixed(4));

  return {
    op: spec.op,
    column: spec.column,
    matchedRowsK: k,
    rawAggregateHidden: true,
    noisedValue,
    laplaceScale: Number(laplaceScale.toFixed(6)),
    sensitivity: Number(sensitivity.toFixed(6)),
    noiseAdded: Number(noise.toFixed(4)),
    epsilonUsed: spec.epsilon,
    epsilonRemaining,
    confidenceInterval95: [ciLow, ciHigh],
  };
}
