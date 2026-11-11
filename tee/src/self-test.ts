import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAttestation, verifyAttestation } from '../attestation.js';
import { appraiseDataset, parseCsv } from './appraiser.js';
import { sha256Bytes, verifyEd25519Signature } from './crypto.js';
import { executeDpQuery, PrivacyGuardError } from './dp.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '..', '..', 'data');

async function runSelfTests() {
  console.log('=== Sealed Market TEE Enclave Verification Suite ===\n');

  // 1. Test Remote Attestation + ed25519 Signature
  const nonce = 'deadbeefcafe20261106';
  const att = await getAttestation(nonce);
  const check = verifyAttestation(att, nonce);
  assert.equal(check.valid, true, `Attestation verification failed: ${check.reason}`);
  console.log('[PASS] 1. Attestation quote & ed25519 signature verified:', {
    enclavePubKey: att.enclavePubKey,
    measurement: att.measurement.slice(0, 24) + '...',
    attestationRef: att.attestationRef,
  });

  // 2. Test Real Appraisal on `ds_bike_rentals.csv`
  const bikeCsv = fs.readFileSync(path.join(DATA_DIR, 'ds_bike_rentals.csv'), 'utf8');
  const holdoutCsv = fs.readFileSync(path.join(DATA_DIR, 'holdout_weekend_demand.csv'), 'utf8');

  const bikeReport = await appraiseDataset({
    listingId: 'ds_bike',
    sellerCsvText: bikeCsv,
    holdoutCsvText: holdoutCsv,
    taskSpec: 'Forecast weekend demand from temperature, precipitation, and wind speed',
    sellerMaxPriceUsdc: 4.5,
    contributors: [
      { account: 'maya.sealed.near', rows: 60 },
      { account: 'kofi.sealed.near', rows: 36 },
      { account: 'amina.sealed.near', rows: 24 },
    ],
  });

  assert.ok(bikeReport.score >= 0.75, `Expected ds_bike score >= 0.75, got ${bikeReport.score}`);
  assert.ok(
    bikeReport.holdoutEvaluation.accuracyDelta > 0.25,
    `Expected positive holdout accuracy delta > 0.25, got ${bikeReport.holdoutEvaluation.accuracyDelta}`
  );
  const sigValid = verifyEd25519Signature(
    bikeReport.teeSig,
    sha256Bytes(bikeReport.canonicalPayload),
    bikeReport.teePubkey
  );
  assert.equal(sigValid, true, 'Appraisal report ed25519 signature failed verification');
  assert.equal(
    bikeReport.shapleyWeightsBps.reduce((a, b) => a + b, 0),
    10_000,
    'Shapley weights must sum to 10000 bps'
  );

  console.log('[PASS] 2. ds_bike Appraisal + Holdout Logistic Regression + Monte Carlo Shapley:', {
    score: bikeReport.score,
    accuracyWithout: bikeReport.subscores.accuracyWithout,
    accuracyWith: bikeReport.subscores.accuracyWith,
    aucWith: bikeReport.subscores.aucWith,
    shapleySplit: bikeReport.shapleyContributors.map(
      (c) => `${c.account}: ${(c.weight * 100).toFixed(1)}%`
    ),
    explanation: bikeReport.explanation,
  });

  // 3. Test Real Appraisal on `ds_noisy_sensors.csv` (low quality dataset)
  const badCsv = fs.readFileSync(path.join(DATA_DIR, 'ds_noisy_sensors.csv'), 'utf8');
  const badReport = await appraiseDataset({
    listingId: 'ds_bad',
    sellerCsvText: badCsv,
    holdoutCsvText: holdoutCsv,
    taskSpec: 'Forecast weekend demand from temperature, precipitation, and wind speed',
    sellerMaxPriceUsdc: 3.5,
    contributors: [
      { account: 'stale_bot.sealed.near', rows: 20 },
      { account: 'spam_node.sealed.near', rows: 20 },
    ],
  });
  assert.ok(badReport.score < 0.5, `Expected ds_bad score < 0.5, got ${badReport.score}`);
  console.log('[PASS] 3. ds_bad Low-Quality Detection:', {
    score: badReport.score,
    duplicateRate: badReport.subscores.duplicateRate,
    nullRate: badReport.subscores.nullRate,
    freshness: badReport.subscores.freshness,
    syntheticFlag: badReport.subscores.syntheticFlag,
  });

  // 4. Test Differential Privacy Laplace Query + k-Anonymity Guard + Budget Enforcement
  const { rows: bikeRows } = parseCsv(bikeCsv);
  const dpRes = executeDpQuery(
    bikeRows,
    {
      op: 'AVG',
      column: 'rentals_count',
      filterColumn: 'is_weekend',
      filterOp: 'eq',
      filterValue: 1,
      epsilon: 0.5,
    },
    2.0,
    0.0
  );
  assert.ok(dpRes.matchedRowsK >= 20, 'Expected matchedRowsK >= 20');
  assert.equal(dpRes.epsilonRemaining, 1.5);
  console.log('[PASS] 4. Differential Privacy Laplace Query:', dpRes);

  // 5. Verify k < 20 Anonymity Guard Rejection
  let kGuardTriggered = false;
  try {
    executeDpQuery(
      bikeRows,
      {
        op: 'AVG',
        column: 'rentals_count',
        filterColumn: 'temp_c',
        filterOp: 'gt',
        filterValue: 30.8, // Matches < 20 rows
        epsilon: 0.5,
      },
      2.0,
      0.5
    );
  } catch (err) {
    if (err instanceof PrivacyGuardError && err.code === 'K_ANONYMITY_VIOLATION') {
      kGuardTriggered = true;
    }
  }
  assert.equal(kGuardTriggered, true, 'Expected k < 20 guard to reject small subgroup query');
  console.log('[PASS] 5. k < 20 Anonymity Guard enforced.');

  // 6. Verify Epsilon Budget Exhaustion Guard
  let budgetGuardTriggered = false;
  try {
    executeDpQuery(
      bikeRows,
      {
        op: 'COUNT',
        column: 'rentals_count',
        epsilon: 1.0,
      },
      2.0,
      1.5 // Only 0.5 remaining
    );
  } catch (err) {
    if (err instanceof PrivacyGuardError && err.code === 'EPSILON_BUDGET_EXHAUSTED') {
      budgetGuardTriggered = true;
    }
  }
  assert.equal(budgetGuardTriggered, true, 'Expected epsilon budget exhaustion guard to fire');
  console.log('[PASS] 6. Epsilon Budget Exhaustion Guard enforced.\n');
  console.log('All TEE enclave self-tests passed!');
}

runSelfTests().catch((err) => {
  console.error('Self-test failed:', err);
  process.exit(1);
});
