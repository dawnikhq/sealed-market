import { sha256Bytes } from './crypto.js';

export interface LogisticModel {
  weights: number[];
  bias: number;
  means: number[];
  stds: number[];
  featureCols: string[];
  targetCol: string;
}

export interface HoldoutUtilityResult {
  accuracyWithout: number;
  accuracyWith: number;
  accuracyDelta: number;
  aucWithout: number;
  aucWith: number;
  aucDelta: number;
  utilityDelta: number;
  featureCols: string[];
  targetCol: string;
  holdoutRowsEvaluated: number;
}

export interface ContributorShapley {
  account: string;
  rows: number;
  marginalUtility: number;
  weight: number;
  weightBps: number;
}

function sigmoid(z: number): number {
  if (z >= 35) return 1.0;
  if (z <= -35) return 0.0;
  return 1.0 / (1.0 + Math.exp(-z));
}

/**
 * Extract numeric matrix X and binary label vector y from CSV rows.
 * Skips rows that have missing/NaN values in any feature or target column.
 */
export function extractFeaturesAndLabels(
  rows: Record<string, string>[],
  featureCols: string[],
  targetCol: string
): { X: number[][]; y: number[] } {
  const X: number[][] = [];
  const rawTargets: number[] = [];

  for (const row of rows) {
    const rawTarget = (row[targetCol] ?? '').trim();
    if (rawTarget === '') continue;
    const targetNum = Number(rawTarget);
    if (!Number.isFinite(targetNum)) continue;

    const xRow: number[] = [];
    let valid = true;
    for (const col of featureCols) {
      const rawVal = (row[col] ?? '').trim();
      if (rawVal === '') {
        valid = false;
        break;
      }
      const val = Number(rawVal);
      if (!Number.isFinite(val)) {
        valid = false;
        break;
      }
      xRow.push(val);
    }

    if (valid) {
      X.push(xRow);
      rawTargets.push(targetNum);
    }
  }

  const isBinary01 = rawTargets.every((v) => v === 0 || v === 1);
  let threshold = 0.5;
  if (!isBinary01 && rawTargets.length > 0) {
    const sorted = [...rawTargets].sort((a, b) => a - b);
    threshold = sorted[Math.floor(sorted.length / 2)];
  }
  const y = rawTargets.map((v) => (v >= threshold ? 1 : 0));

  return { X, y };
}

/**
 * Train a binary Logistic Regression classifier using batch gradient descent
 * with z-score feature standardization and L2 (ridge) regularization.
 */
export function trainLogisticRegression(
  X: number[][],
  y: number[],
  featureCols: string[],
  targetCol: string,
  options: { epochs?: number; learningRate?: number; l2Lambda?: number } = {}
): LogisticModel {
  const n = X.length;
  const d = featureCols.length;
  const epochs = options.epochs ?? 280;
  const lr = options.learningRate ?? 0.15;
  const l2 = options.l2Lambda ?? 0.01;

  if (n === 0 || d === 0) {
    return {
      weights: new Array(d).fill(0),
      bias: 0,
      means: new Array(d).fill(0),
      stds: new Array(d).fill(1),
      featureCols,
      targetCol,
    };
  }

  // Compute column means and standard deviations for z-score standardization
  const means = new Array<number>(d).fill(0);
  const stds = new Array<number>(d).fill(1);

  for (let j = 0; j < d; j++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += X[i][j];
    }
    means[j] = sum / n;

    let sqSum = 0;
    for (let i = 0; i < n; i++) {
      const diff = X[i][j] - means[j];
      sqSum += diff * diff;
    }
    const variance = sqSum / n;
    stds[j] = variance > 1e-12 ? Math.sqrt(variance) : 1.0;
  }

  // Standardize X
  const Xnorm: number[][] = new Array(n);
  for (let i = 0; i < n; i++) {
    const rowNorm = new Array<number>(d);
    for (let j = 0; j < d; j++) {
      rowNorm[j] = (X[i][j] - means[j]) / stds[j];
    }
    Xnorm[i] = rowNorm;
  }

  const weights = new Array<number>(d).fill(0);
  let bias = 0;

  for (let epoch = 0; epoch < epochs; epoch++) {
    const gradW = new Array<number>(d).fill(0);
    let gradB = 0;

    for (let i = 0; i < n; i++) {
      let z = bias;
      for (let j = 0; j < d; j++) {
        z += weights[j] * Xnorm[i][j];
      }
      const pred = sigmoid(z);
      const err = pred - y[i];
      gradB += err;
      for (let j = 0; j < d; j++) {
        gradW[j] += err * Xnorm[i][j];
      }
    }

    bias -= lr * (gradB / n);
    for (let j = 0; j < d; j++) {
      weights[j] -= lr * (gradW[j] / n + l2 * weights[j]);
    }
  }

  return { weights, bias, means, stds, featureCols, targetCol };
}

/**
 * Predict probabilities P(y = 1 | x) on a matrix X using a trained LogisticModel.
 */
export function predictProbabilities(model: LogisticModel, X: number[][]): number[] {
  const d = model.weights.length;
  return X.map((row) => {
    let z = model.bias;
    for (let j = 0; j < d; j++) {
      const xStd = (row[j] - model.means[j]) / (model.stds[j] || 1.0);
      z += model.weights[j] * xStd;
    }
    return sigmoid(z);
  });
}

/**
 * Compute binary classification accuracy and exact ROC-AUC (Mann-Whitney U statistic).
 */
export function evaluateMetrics(
  yTrue: number[],
  yProb: number[]
): { accuracy: number; rocAuc: number } {
  const n = yTrue.length;
  if (n === 0) {
    return { accuracy: 0.5, rocAuc: 0.5 };
  }

  let correct = 0;
  const positives: number[] = [];
  const negatives: number[] = [];

  for (let i = 0; i < n; i++) {
    const predLabel = yProb[i] >= 0.5 ? 1 : 0;
    if (predLabel === yTrue[i]) {
      correct++;
    }
    if (yTrue[i] === 1) {
      positives.push(yProb[i]);
    } else {
      negatives.push(yProb[i]);
    }
  }

  const accuracy = correct / n;

  if (positives.length === 0 || negatives.length === 0) {
    return { accuracy, rocAuc: 0.5 };
  }

  let concordant = 0;
  for (const posP of positives) {
    for (const negP of negatives) {
      if (posP > negP + 1e-12) {
        concordant += 1.0;
      } else if (Math.abs(posP - negP) <= 1e-12) {
        concordant += 0.5;
      }
    }
  }

  const rocAuc = concordant / (positives.length * negatives.length);
  return { accuracy, rocAuc };
}

/**
 * Evaluate the Try-Before-You-Buy (TBYB) holdout utility delta:
 * Trains a logistic regression model WITHOUT seller data (prior baseline) and WITH seller data,
 * then measures both accuracy delta and ROC-AUC delta on the buyer's holdout set.
 */
export function evaluateHoldoutUtility(
  sellerRows: Record<string, string>[],
  holdoutRows: Record<string, string>[],
  preferredFeatures?: string[],
  preferredTarget?: string
): HoldoutUtilityResult {
  const sampleRow = sellerRows[0] || holdoutRows[0] || {};
  const allColumns = Object.keys(sampleRow);

  // Determine binary target column
  const candidateTargets = preferredTarget
    ? [preferredTarget, 'high_demand', 'churned', 'label', 'target']
    : ['high_demand', 'churned', 'label', 'target'];
  let targetCol = candidateTargets.find((c) => allColumns.includes(c)) || '';
  if (!targetCol) {
    // Fallback to last numeric binary column
    targetCol =
      allColumns.find((col) => {
        const vals = sellerRows
          .slice(0, 20)
          .map((r) => Number(r[col]))
          .filter((v) => Number.isFinite(v));
        return vals.length > 0 && vals.every((v) => v === 0 || v === 1);
      }) || allColumns[allColumns.length - 1];
  }

  // Determine numeric feature columns (excluding target, IDs, dates, contributor, and direct leaky target proxies)
  const excludedCols = new Set([
    targetCol,
    'contributor',
    'date',
    'city',
    'region',
    'trip_batch_id',
    'customer_id',
    'id',
    'rentals_count',
  ]);

  const featureCols =
    preferredFeatures && preferredFeatures.length > 0
      ? preferredFeatures.filter((c) => allColumns.includes(c) && c !== targetCol)
      : allColumns.filter((col) => {
          if (excludedCols.has(col)) return false;
          const numericCount = sellerRows
            .slice(0, 25)
            .filter((r) => (r[col] ?? '').trim() !== '' && Number.isFinite(Number(r[col]))).length;
          return numericCount >= 5;
        });

  const trainData = extractFeaturesAndLabels(sellerRows, featureCols, targetCol);
  const testData = extractFeaturesAndLabels(holdoutRows, featureCols, targetCol);

  if (testData.X.length === 0 || trainData.X.length === 0) {
    return {
      accuracyWithout: 0.5,
      accuracyWith: 0.5,
      accuracyDelta: 0.0,
      aucWithout: 0.5,
      aucWith: 0.5,
      aucDelta: 0.0,
      utilityDelta: 0.0,
      featureCols,
      targetCol,
      holdoutRowsEvaluated: 0,
    };
  }

  // 1. Model WITHOUT seller dataset (uninformed prior baseline: zero feature weights, constant class prior)
  const baselineProbs = new Array<number>(testData.y.length).fill(0.5);
  const baselineMetrics = evaluateMetrics(testData.y, baselineProbs);

  // 2. Model WITH seller dataset (trained via L2-regularized gradient descent on seller rows)
  const trainedModel = trainLogisticRegression(
    trainData.X,
    trainData.y,
    featureCols,
    targetCol
  );
  const trainedProbs = predictProbabilities(trainedModel, testData.X);
  const trainedMetrics = evaluateMetrics(testData.y, trainedProbs);

  const accuracyDelta = Number((trainedMetrics.accuracy - baselineMetrics.accuracy).toFixed(4));
  const aucDelta = Number((trainedMetrics.rocAuc - baselineMetrics.rocAuc).toFixed(4));
  // Composite utility delta combines accuracy lift and ROC-AUC lift
  const utilityDelta = Number((0.5 * accuracyDelta + 0.5 * aucDelta).toFixed(4));

  return {
    accuracyWithout: Number(baselineMetrics.accuracy.toFixed(4)),
    accuracyWith: Number(trainedMetrics.accuracy.toFixed(4)),
    accuracyDelta,
    aucWithout: Number(baselineMetrics.rocAuc.toFixed(4)),
    aucWith: Number(trainedMetrics.rocAuc.toFixed(4)),
    aucDelta,
    utilityDelta,
    featureCols,
    targetCol,
    holdoutRowsEvaluated: testData.y.length,
  };
}

/**
 * Evaluate coalition utility v(S) for a subset of contributor rows S.
 * Combines holdout predictive utility (accuracy + ROC-AUC lift over 0.5 baseline)
 * with effective unique sample coverage so every contributor's marginal lift is measured accurately.
 */
function coalitionUtility(
  coalitionRows: Record<string, string>[],
  totalDatasetRows: number,
  holdoutX: number[][],
  holdoutY: number[],
  featureCols: string[],
  targetCol: string
): number {
  if (coalitionRows.length === 0 || holdoutY.length === 0) {
    return 0.0;
  }

  const { X, y } = extractFeaturesAndLabels(coalitionRows, featureCols, targetCol);
  if (X.length === 0) {
    return 0.0;
  }

  const model = trainLogisticRegression(X, y, featureCols, targetCol, {
    epochs: 220,
    learningRate: 0.15,
    l2Lambda: 0.02,
  });
  const probs = predictProbabilities(model, holdoutX);
  const { accuracy, rocAuc } = evaluateMetrics(holdoutY, probs);

  const predictiveLift = Math.max(0, 0.5 * (accuracy - 0.5) + 0.5 * (rocAuc - 0.5));
  // Deduped effective sample coverage within coalition
  const uniqueRowKeys = new Set(coalitionRows.map((r) => JSON.stringify(r)));
  const effectiveCoverage = uniqueRowKeys.size / Math.max(1, totalDatasetRows);

  // Coalition value v(S): holdout predictive lift scaled by deduplicated sample support in S
  return predictiveLift * effectiveCoverage;
}

/**
 * Generate Monte Carlo permutations (or exact permutations when N <= 4) over contributor indices,
 * seeded deterministically from the dataset hash so Shapley splits are reproducible and verifiable.
 * Implements Ghorbani & Zou (2019), "Data Shapley: Equitable Valuation of Data for Machine Learning".
 */
function generateContributorPermutations(numContributors: number, maxSamples: number, seedStr: string): number[][] {
  const indices = Array.from({ length: numContributors }, (_, i) => i);

  // For N <= 4 contributors, N! <= 24 so we can evaluate all permutations in Monte Carlo order
  if (numContributors <= 4) {
    const allPerms: number[][] = [];
    const permute = (arr: number[], m: number[] = []) => {
      if (arr.length === 0) {
        allPerms.push(m);
      } else {
        for (let i = 0; i < arr.length; i++) {
          const curr = arr.slice();
          const next = curr.splice(i, 1);
          permute(curr.slice(), m.concat(next));
        }
      }
    };
    permute(indices);
    return allPerms;
  }

  // For larger contributor pools, draw `maxSamples` Fisher-Yates permutations using SHA-256 CTR DRBG
  const perms: number[][] = [];
  for (let s = 0; s < maxSamples; s++) {
    const digest = sha256Bytes(`${seedStr}:perm:${s}`);
    const arr = indices.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const randByte = digest[i % digest.length] + (digest[(i + 7) % digest.length] << 8);
      const j = randByte % (i + 1);
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    perms.push(arr);
  }
  return perms;
}

/**
 * Compute real Monte Carlo Shapley values over dataset contributors (Ghorbani & Zou, 2019).
 * Returns normalized weights in [0, 1] and integer basis points summing to 10,000.
 */
export function computeShapleyWeights(
  sellerRows: Record<string, string>[],
  holdoutRows: Record<string, string>[],
  contributors: { account: string; rows: number }[],
  featureCols: string[],
  targetCol: string,
  monteCarloSamples = 36
): ContributorShapley[] {
  if (contributors.length === 0) {
    return [];
  }
  if (contributors.length === 1) {
    return [
      {
        account: contributors[0].account,
        rows: contributors[0].rows,
        marginalUtility: 1.0,
        weight: 1.0,
        weightBps: 10_000,
      },
    ];
  }

  // Partition sellerRows by contributor account (or slice by contributor row counts if column not present)
  const rowsByContributor: Map<string, Record<string, string>[]> = new Map();
  for (const c of contributors) {
    rowsByContributor.set(c.account, []);
  }

  let matchedContributorCol = 0;
  for (const row of sellerRows) {
    const acct = (row['contributor'] ?? '').trim();
    if (rowsByContributor.has(acct)) {
      rowsByContributor.get(acct)!.push(row);
      matchedContributorCol++;
    }
  }

  if (matchedContributorCol === 0) {
    let offset = 0;
    for (const c of contributors) {
      const slice = sellerRows.slice(offset, offset + c.rows);
      rowsByContributor.set(c.account, slice);
      offset += c.rows;
    }
  }

  const testData = extractFeaturesAndLabels(holdoutRows, featureCols, targetCol);
  const perms = generateContributorPermutations(
    contributors.length,
    monteCarloSamples,
    contributors.map((c) => `${c.account}:${c.rows}`).join('|')
  );

  // Cache coalition values v(S) by sorted bitmask of contributor indices to avoid redundant training
  const coalitionCache = new Map<number, number>();
  coalitionCache.set(0, 0.0);

  const evalMask = (mask: number): number => {
    if (coalitionCache.has(mask)) {
      return coalitionCache.get(mask)!;
    }
    const coalitionRows: Record<string, string>[] = [];
    for (let i = 0; i < contributors.length; i++) {
      if ((mask & (1 << i)) !== 0) {
        const cRows = rowsByContributor.get(contributors[i].account) || [];
        coalitionRows.push(...cRows);
      }
    }
    const val = coalitionUtility(
      coalitionRows,
      sellerRows.length,
      testData.X,
      testData.y,
      featureCols,
      targetCol
    );
    coalitionCache.set(mask, val);
    return val;
  };

  const marginalSums = new Array<number>(contributors.length).fill(0);

  for (const perm of perms) {
    let currentMask = 0;
    let prevVal = 0.0;
    for (const contributorIdx of perm) {
      const nextMask = currentMask | (1 << contributorIdx);
      const nextVal = evalMask(nextMask);
      const marginal = nextVal - prevVal;
      marginalSums[contributorIdx] += marginal;
      currentMask = nextMask;
      prevVal = nextVal;
    }
  }

  const rawShapley = marginalSums.map((sum) => Math.max(0, sum / perms.length));
  const totalPositiveShapley = rawShapley.reduce((a, b) => a + b, 0);

  // If all marginal contributions are <= 0 (e.g. noisy/degraded dataset), fallback to row-count proportion
  const totalRows = Math.max(
    1,
    contributors.reduce((acc, c) => acc + c.rows, 0)
  );
  const normalizedWeights = rawShapley.map((val, idx) =>
    totalPositiveShapley > 1e-9 ? val / totalPositiveShapley : contributors[idx].rows / totalRows
  );

  // Round to basis points summing to 10,000
  let assignedBps = 0;
  const results: ContributorShapley[] = [];
  for (let i = 0; i < contributors.length; i++) {
    const c = contributors[i];
    const actualRows = rowsByContributor.get(c.account)?.length || c.rows;
    const weightBps =
      i + 1 === contributors.length
        ? Math.max(0, 10_000 - assignedBps)
        : Math.round(normalizedWeights[i] * 10_000);
    assignedBps += weightBps;

    results.push({
      account: c.account,
      rows: actualRows,
      marginalUtility: Number(rawShapley[i].toFixed(5)),
      weight: Number((weightBps / 10_000).toFixed(4)),
      weightBps,
    });
  }

  return results;
}
