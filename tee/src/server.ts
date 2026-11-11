import fs from 'node:fs';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express, { type Request, type Response } from 'express';
import { getAttestation, getEnclavePubKey, verifyAttestation } from '../attestation.js';
import { appraiseDataset, parseCsv, type AppraisalReport } from './appraiser.js';
import {
  decryptSealedUpload,
  encryptForEnclave,
  sha256Bytes,
  sha256Hex,
  signWithEnclaveKey,
} from './crypto.js';
import { executeDpQuery, PrivacyGuardError, type QuerySpec } from './dp.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '..', '..', 'data');

export interface ViewPrice {
  name: string;
  price_usdc: number;
}

export interface Contributor {
  account: string;
  rows: number;
}

export interface EnclaveListing {
  /** True for the bundled fictional sample datasets from /data. */
  is_sample?: boolean;
  /** Sample listings only: start of the current hourly privacy-budget window. */
  budget_window_start_ms?: number;
  id: string;
  title: string;
  description: string;
  seller_account: string;
  dataset_hash: string;
  schema: string[];
  views: ViewPrice[];
  epsilon_budget: number;
  epsilon_spent: number;
  contributors: Contributor[];
  shapley_weights_bps: number[];
  row_count: number;
  freshness_date: string;
  latest_score: number | null;
  price_low: number | null;
  price_high: number | null;
  latest_appraisal_id: string | null;
  latest_appraisal: AppraisalReport | null;
  created_at_ms: number;
}

export interface EnclaveEscrow {
  id: string;
  listing_id: string;
  appraisal_id: string;
  buyer: string;
  amount_yocto: string;
  amount_usdc: number;
  source_chain: string;
  intent_tx_hash: string;
  token_id: string;
  status: 'Funded' | 'Released' | 'Refunded';
  created_at_ms: number;
}

export interface EnclaveToken {
  token_id: string;
  owner_id: string;
  listing_id: string;
  escrow_id: string;
  answers_total: number;
  answers_left: number;
  issued_at_ms: number;
}

export interface EnclaveQueryLog {
  id: string;
  token_id: string;
  listing_id: string;
  caller: string;
  query_spec: QuerySpec;
  query_hash: string;
  noised_value: number;
  epsilon_used: number;
  epsilon_remaining: number;
  answers_left: number;
  matched_rows_k: number;
  result_hash: string;
  tee_sig: string;
  timestamp_ms: number;
}

export interface ContributorPayout {
  account: string;
  weight_bps: number;
  amount_yocto: string;
  amount_usdc: number;
}

export interface EnclaveSettlement {
  id: string;
  listing_id: string;
  escrow_id: string;
  buyer: string;
  delivered_within_range: boolean;
  outcome: 'RELEASED' | 'REFUNDED';
  total_amount_usdc: number;
  platform_fee_usdc: number;
  payouts: ContributorPayout[];
  tx_hash: string;
  timestamp_ms: number;
}

// Sealed enclave memory store (raw CSV text never exposed over any endpoint)
const sealedCsvStore = new Map<string, string>();
const listingsStore = new Map<string, EnclaveListing>();
const appraisalsStore = new Map<string, AppraisalReport>();
const escrowsStore = new Map<string, EnclaveEscrow>();
const tokensStore = new Map<string, EnclaveToken>();
const queriesStore: EnclaveQueryLog[] = [];
const settlementsStore: EnclaveSettlement[] = [];
const namedAccountsStore = new Map<
  string,
  { accountId: string; emailHash: string; publicKey: string; createdAtMs: number }
>();

let defaultHoldoutCsv = '';
let nextEscrowSeq = 1;
let nextQuerySeq = 1;
let nextSettlementSeq = 1;

// Operator console auth. The password is read from the environment only and never sent to clients.
// If ADMIN_PASSWORD is unset, a random one is generated per process and printed to this terminal.
const ADMIN_PASSWORD_FROM_ENV = Boolean(process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length > 0);
const ADMIN_PASSWORD: string = ADMIN_PASSWORD_FROM_ENV
  ? (process.env.ADMIN_PASSWORD as string)
  : randomBytes(9).toString('base64url');
const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const revokedAdminTokens = new Set<string>();
const STATE_SNAPSHOT_PATH = path.join(os.tmpdir(), 'sealed-market-live-state-v2.json');

function constantTimeEquals(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

function createAdminToken(): { token: string; expiresAtMs: number } {
  const expiresAtMs = Date.now() + ADMIN_SESSION_TTL_MS;
  const nonce = randomBytes(12).toString('hex');
  const payload = `${expiresAtMs}.${nonce}`;
  const sig = createHmac('sha256', `${ADMIN_PASSWORD}:${getEnclavePubKey()}`)
    .update(payload)
    .digest('hex');
  return { token: `${payload}.${sig}`, expiresAtMs };
}

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

function isAdmin(req: Request): boolean {
  const token = bearerToken(req);
  if (!token || revokedAdminTokens.has(token)) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [expStr, nonce, sig] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const expectedSig = createHmac('sha256', `${ADMIN_PASSWORD}:${getEnclavePubKey()}`)
    .update(`${expStr}.${nonce}`)
    .digest('hex');
  return constantTimeEquals(sig, expectedSig);
}

// Optional shared store. Serverless instances do not share memory or /tmp, so without this a
// listing or order created on one instance is invisible to the next. When an Upstash-compatible
// Redis REST endpoint is configured (Vercel KV / Upstash integration env vars), the whole state
// snapshot is read before each request and written back after each change.
// VERIFY: https://upstash.com/docs/redis/features/restapi
const KV_URL = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/+$/, '');
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const KV_KEY = process.env.SEALED_STATE_KEY || 'sealed-market:state:v2';
export const sharedStoreEnabled = Boolean(KV_URL && KV_TOKEN);
let pendingSharedSave: Promise<void> = Promise.resolve();
let lastSharedJson = '';

async function pushSharedState(json: string): Promise<void> {
  try {
    const res = await fetch(KV_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['SET', KV_KEY, json]),
    });
    if (res.ok) lastSharedJson = json;
    else console.error(`[Sealed Market TEE] Shared store write failed: HTTP ${res.status}`);
  } catch (err) {
    console.error('[Sealed Market TEE] Shared store write failed:', err);
  }
}

async function pullSharedState(): Promise<void> {
  if (!sharedStoreEnabled) return;
  try {
    const res = await fetch(KV_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['GET', KV_KEY]),
    });
    if (!res.ok) {
      console.error(`[Sealed Market TEE] Shared store read failed: HTTP ${res.status}`);
      return;
    }
    const body = (await res.json()) as { result?: string | null };
    if (typeof body.result !== 'string' || body.result === lastSharedJson) return;
    applySnapshot(JSON.parse(body.result), true);
    lastSharedJson = body.result;
  } catch (err) {
    console.error('[Sealed Market TEE] Shared store read failed:', err);
  }
}

function saveStateSnapshot(): void {
  try {
    const snapshot = {
      sealedCsv: Array.from(sealedCsvStore.entries()),
      listings: Array.from(listingsStore.entries()),
      appraisals: Array.from(appraisalsStore.entries()),
      escrows: Array.from(escrowsStore.entries()),
      tokens: Array.from(tokensStore.entries()),
      queries: queriesStore,
      settlements: settlementsStore,
      namedAccounts: Array.from(namedAccountsStore.entries()),
      nextEscrowSeq,
      nextQuerySeq,
      nextSettlementSeq,
    };
    const json = JSON.stringify(snapshot);
    if (sharedStoreEnabled) {
      pendingSharedSave = pendingSharedSave.then(() => pushSharedState(json));
    }
    fs.writeFileSync(STATE_SNAPSHOT_PATH, json, 'utf8');
  } catch {
    // Non-fatal if filesystem is read-only
  }
}

function applySnapshot(raw: any, replace: boolean): void {
  if (replace) {
    sealedCsvStore.clear();
    listingsStore.clear();
    appraisalsStore.clear();
    escrowsStore.clear();
    tokensStore.clear();
    namedAccountsStore.clear();
    queriesStore.length = 0;
    settlementsStore.length = 0;
  }
  if (Array.isArray(raw.sealedCsv)) for (const [k, v] of raw.sealedCsv) sealedCsvStore.set(k, v);
  if (Array.isArray(raw.listings)) for (const [k, v] of raw.listings) listingsStore.set(k, v);
  if (Array.isArray(raw.appraisals)) for (const [k, v] of raw.appraisals) appraisalsStore.set(k, v);
  if (Array.isArray(raw.escrows)) for (const [k, v] of raw.escrows) escrowsStore.set(k, v);
  if (Array.isArray(raw.tokens)) for (const [k, v] of raw.tokens) tokensStore.set(k, v);
  if (Array.isArray(raw.queries) && queriesStore.length === 0) queriesStore.push(...raw.queries);
  if (Array.isArray(raw.settlements) && settlementsStore.length === 0) {
    settlementsStore.push(...raw.settlements);
  }
  if (Array.isArray(raw.namedAccounts)) {
    for (const [k, v] of raw.namedAccounts) namedAccountsStore.set(k, v);
  }
  if (typeof raw.nextEscrowSeq === 'number') nextEscrowSeq = raw.nextEscrowSeq;
  if (typeof raw.nextQuerySeq === 'number') nextQuerySeq = raw.nextQuerySeq;
  if (typeof raw.nextSettlementSeq === 'number') nextSettlementSeq = raw.nextSettlementSeq;
}

function loadStateSnapshot(): void {
  try {
    if (!fs.existsSync(STATE_SNAPSHOT_PATH)) return;
    applySnapshot(JSON.parse(fs.readFileSync(STATE_SNAPSHOT_PATH, 'utf8')), false);
  } catch {
    // Ignore corrupted snapshot
  }
}

/**
 * Initialize enclave runtime. The three fictional sample datasets in `/data` are sealed and listed
 * on startup (tagged `is_sample`) so the marketplace is never empty and every instance of a
 * serverless deployment agrees on them. Set `SEED_DEMO_DATA=false` to start with no listings.
 * Pass `{ seed: true }` (CLI seed) to also record one sample purchase, query and settlement.
 */
const SAMPLE_LISTINGS_ENABLED = process.env.SEED_DEMO_DATA !== 'false';

export async function initializeEnclaveState(options: { seed?: boolean } = {}): Promise<void> {
  loadStateSnapshot();
  await pullSharedState();
  try {
    const holdoutPath = path.join(DATA_DIR, 'holdout_weekend_demand.csv');
    if (fs.existsSync(holdoutPath)) {
      defaultHoldoutCsv = fs.readFileSync(holdoutPath, 'utf8');
    }
  } catch {
    defaultHoldoutCsv = '';
  }

  if (options.seed || SAMPLE_LISTINGS_ENABLED) {
    await seedEnclaveFromDataDir({ withActivity: Boolean(options.seed) });
  }
}

export async function seedEnclaveFromDataDir(
  options: { withActivity?: boolean } = {}
): Promise<void> {
  if (listingsStore.has('ds_bike')) {
    return;
  }

  const bikeCsv = fs.readFileSync(path.join(DATA_DIR, 'ds_bike_rentals.csv'), 'utf8');
  const churnCsv = fs.readFileSync(path.join(DATA_DIR, 'ds_ecommerce_churn.csv'), 'utf8');
  const badCsv = fs.readFileSync(path.join(DATA_DIR, 'ds_noisy_sensors.csv'), 'utf8');
  defaultHoldoutCsv = fs.readFileSync(path.join(DATA_DIR, 'holdout_weekend_demand.csv'), 'utf8');

  const datasetsConfig = [
    {
      id: 'ds_bike',
      title: 'Urban Micro-Mobility & Weather Demand (Lagos / Nairobi / Accra)',
      description:
        'Station-level daily bike rental counts paired with temperature, precipitation, wind speed, and weekend indicators across 3 West & East African hubs.',
      seller_account: 'maya.sealed.near',
      csvText: bikeCsv,
      views: [
        { name: 'weekend_demand_agg', price_usdc: 3.5 },
        { name: 'weather_elasticity_view', price_usdc: 4.0 },
        { name: 'holdout_roc_auc', price_usdc: 4.5 },
      ],
      epsilon_budget: 4.0,
      contributors: [
        { account: 'maya.sealed.near', rows: 60 },
        { account: 'kofi.sealed.near', rows: 36 },
        { account: 'amina.sealed.near', rows: 24 },
      ],
      defaultTask: 'Forecast weekend bike demand from temperature, precipitation, and wind speed',
    },
    {
      id: 'ds_churn',
      title: 'Regional Mobility Pass Retention & Weather Activity Cohort',
      description:
        'Subscriber cohort retention and trip activity under varying weather conditions across Lagos, Nairobi, and Accra.',
      seller_account: 'ada.sealed.near',
      csvText: churnCsv,
      views: [
        { name: 'cohort_retention_agg', price_usdc: 3.0 },
        { name: 'churn_holdout_metric', price_usdc: 4.0 },
      ],
      epsilon_budget: 3.5,
      contributors: [
        { account: 'ada.sealed.near', rows: 27 },
        { account: 'tunde.sealed.near', rows: 25 },
      ],
      defaultTask: 'Predict high mobility pass utilization and retention from weather features',
    },
    {
      id: 'ds_bad',
      title: 'Unverified Legacy Telemetry Stream (2024 Archive)',
      description:
        'Unfiltered telemetry dump with high duplicate rate, missing sensor cells, and stale 2024 timestamps.',
      seller_account: 'stale_bot.sealed.near',
      csvText: badCsv,
      views: [
        { name: 'raw_sensor_mean', price_usdc: 3.0 },
        { name: 'demand_signal_check', price_usdc: 3.5 },
      ],
      epsilon_budget: 2.5,
      contributors: [
        { account: 'stale_bot.sealed.near', rows: 20 },
        { account: 'spam_node.sealed.near', rows: 20 },
      ],
      defaultTask: 'Forecast weekend bike demand from temperature, precipitation, and wind speed',
    },
  ];

  for (const cfg of datasetsConfig) {
    // Encrypt & unseal through the real enclave AES-256-GCM path to verify sealing integrity
    const encrypted = encryptForEnclave(cfg.csvText, getEnclavePubKey());
    const unsealed = decryptSealedUpload(encrypted);
    sealedCsvStore.set(cfg.id, unsealed);

    const parsed = parseCsv(unsealed);
    const datasetHash = sha256Hex(unsealed);
    const maxPrice = Math.max(...cfg.views.map((v) => v.price_usdc));

    const appraisal = await appraiseDataset({
      listingId: cfg.id,
      sellerCsvText: unsealed,
      holdoutCsvText: defaultHoldoutCsv,
      taskSpec: cfg.defaultTask,
      sellerMaxPriceUsdc: maxPrice,
      contributors: cfg.contributors,
    });

    appraisalsStore.set(appraisal.appraisalId, appraisal);

    const listing: EnclaveListing = {
      id: cfg.id,
      is_sample: true,
      title: cfg.title,
      description: cfg.description,
      seller_account: cfg.seller_account,
      dataset_hash: datasetHash,
      schema: parsed.headers.filter((h) => h !== 'contributor'),
      views: cfg.views,
      epsilon_budget: cfg.epsilon_budget,
      epsilon_spent: 0,
      contributors: cfg.contributors,
      shapley_weights_bps: appraisal.shapleyWeightsBps,
      row_count: parsed.rows.length,
      freshness_date: appraisal.subscores.maxDate,
      latest_score: appraisal.score,
      price_low: appraisal.priceLow,
      price_high: appraisal.priceHigh,
      latest_appraisal_id: appraisal.appraisalId,
      latest_appraisal: appraisal,
      created_at_ms: Date.now() - 3600_000,
    };

    listingsStore.set(cfg.id, listing);
  }

  if (!options.withActivity) {
    saveStateSnapshot();
    return;
  }

  // Execute one real initial purchase, DP query, and Shapley settlement on `ds_bike`
  // plus one real quality-miss refund settlement on `ds_bad` so the Explorer is immediately verifiable.
  const bikeListing = listingsStore.get('ds_bike')!;
  const bikeEscrowId = `esc_${nextEscrowSeq++}`;
  const bikeTokenId = `nep245:ds_bike:${bikeEscrowId}`;
  const bikeEscrow: EnclaveEscrow = {
    id: bikeEscrowId,
    listing_id: 'ds_bike',
    appraisal_id: bikeListing.latest_appraisal_id!,
    buyer: 'quant-agent.sealed.near',
    amount_yocto: '4000000000000000000000000',
    amount_usdc: 4.0,
    source_chain: 'base',
    intent_tx_hash: `0x${sha256Hex('initial_base_intent_ds_bike').slice(0, 64)}`,
    token_id: bikeTokenId,
    status: 'Funded',
    created_at_ms: Date.now() - 1800_000,
  };
  escrowsStore.set(bikeEscrowId, bikeEscrow);
  tokensStore.set(bikeTokenId, {
    token_id: bikeTokenId,
    owner_id: 'quant-agent.sealed.near',
    listing_id: 'ds_bike',
    escrow_id: bikeEscrowId,
    answers_total: 3,
    answers_left: 3,
    issued_at_ms: Date.now() - 1800_000,
  });

  // Run a real DP query on `ds_bike`
  const bikeRows = parseCsv(sealedCsvStore.get('ds_bike')!).rows;
  const initialSpec: QuerySpec = {
    op: 'AVG',
    column: 'rentals_count',
    filterColumn: 'is_weekend',
    filterOp: 'eq',
    filterValue: 1,
    epsilon: 0.5,
  };
  const dpOut = executeDpQuery(
    bikeRows,
    initialSpec,
    bikeListing.epsilon_budget,
    bikeListing.epsilon_spent
  );
  bikeListing.epsilon_spent = Number((bikeListing.epsilon_spent + initialSpec.epsilon).toFixed(4));
  tokensStore.get(bikeTokenId)!.answers_left -= 1;

  const qHash = sha256Hex(JSON.stringify(initialSpec));
  const rHash = sha256Hex(JSON.stringify(dpOut));
  queriesStore.push({
    id: `q_${nextQuerySeq++}`,
    token_id: bikeTokenId,
    listing_id: 'ds_bike',
    caller: 'quant-agent.sealed.near',
    query_spec: initialSpec,
    query_hash: qHash,
    noised_value: dpOut.noisedValue,
    epsilon_used: dpOut.epsilonUsed,
    epsilon_remaining: dpOut.epsilonRemaining,
    answers_left: tokensStore.get(bikeTokenId)!.answers_left,
    matched_rows_k: dpOut.matchedRowsK,
    result_hash: rHash,
    tee_sig: signWithEnclaveKey(sha256Bytes(`${qHash}:${rHash}`)),
    timestamp_ms: Date.now() - 1200_000,
  });

  // Settle `ds_bike` escrow with real computed Shapley weights (5% platform fee)
  settleEscrowInternal('ds_bike', bikeEscrowId, true);

  // Create and settle `ds_bad` escrow demonstrating real automatic buyer refund when quality < appraised threshold
  const badListing = listingsStore.get('ds_bad')!;
  const badEscrowId = `esc_${nextEscrowSeq++}`;
  const badTokenId = `nep245:ds_bad:${badEscrowId}`;
  escrowsStore.set(badEscrowId, {
    id: badEscrowId,
    listing_id: 'ds_bad',
    appraisal_id: badListing.latest_appraisal_id!,
    buyer: 'research-dao.sealed.near',
    amount_yocto: '3000000000000000000000000',
    amount_usdc: 3.0,
    source_chain: 'arbitrum',
    intent_tx_hash: `0x${sha256Hex('initial_arb_intent_ds_bad').slice(0, 64)}`,
    token_id: badTokenId,
    status: 'Funded',
    created_at_ms: Date.now() - 900_000,
  });
  settleEscrowInternal('ds_bad', badEscrowId, false);
}

function settleEscrowInternal(
  listingId: string,
  escrowId: string,
  deliveredWithinRange: boolean
): EnclaveSettlement {
  const listing = listingsStore.get(listingId);
  if (!listing) {
    throw new Error(`Listing ${listingId} not found`);
  }
  const escrow = escrowsStore.get(escrowId);
  if (!escrow) {
    throw new Error(`Escrow ${escrowId} not found`);
  }
  if (escrow.listing_id !== listingId) {
    throw new Error(`Escrow ${escrowId} does not belong to listing ${listingId}`);
  }
  if (escrow.status !== 'Funded') {
    throw new Error(`Escrow ${escrowId} is already settled (${escrow.status})`);
  }

  const totalYocto = BigInt(escrow.amount_yocto);
  const totalUsdc = escrow.amount_usdc;
  const settlementId = `stl_${nextSettlementSeq++}`;
  const nowMs = Date.now();

  if (deliveredWithinRange) {
    escrow.status = 'Released';
    const feeYocto = (totalYocto * 500n) / 10000n;
    const distributableYocto = totalYocto - feeYocto;
    const feeUsdc = Number((totalUsdc * 0.05).toFixed(4));
    const distributableUsdc = totalUsdc - feeUsdc;

    const payouts: ContributorPayout[] = [];
    let distributedYocto = 0n;

    for (let i = 0; i < listing.contributors.length; i++) {
      const contributor = listing.contributors[i];
      const weightBps = listing.shapley_weights_bps[i] ?? 0;
      const shareYocto =
        i + 1 === listing.contributors.length
          ? distributableYocto - distributedYocto
          : (distributableYocto * BigInt(weightBps)) / 10000n;
      distributedYocto += shareYocto;

      const shareUsdc = Number(((distributableUsdc * weightBps) / 10000).toFixed(4));
      payouts.push({
        account: contributor.account,
        weight_bps: weightBps,
        amount_yocto: shareYocto.toString(),
        amount_usdc: shareUsdc,
      });
    }

    const settlement: EnclaveSettlement = {
      id: settlementId,
      listing_id: listingId,
      escrow_id: escrowId,
      buyer: escrow.buyer,
      delivered_within_range: true,
      outcome: 'RELEASED',
      total_amount_usdc: totalUsdc,
      platform_fee_usdc: feeUsdc,
      payouts,
      tx_hash: sha256Hex(`settle:release:${settlementId}:${escrowId}:${nowMs}`).slice(0, 44),
      timestamp_ms: nowMs,
    };
    settlementsStore.unshift(settlement);
    return settlement;
  } else {
    escrow.status = 'Refunded';
    const settlement: EnclaveSettlement = {
      id: settlementId,
      listing_id: listingId,
      escrow_id: escrowId,
      buyer: escrow.buyer,
      delivered_within_range: false,
      outcome: 'REFUNDED',
      total_amount_usdc: totalUsdc,
      platform_fee_usdc: 0,
      payouts: [
        {
          account: escrow.buyer,
          weight_bps: 10000,
          amount_yocto: totalYocto.toString(),
          amount_usdc: totalUsdc,
        },
      ],
      tx_hash: sha256Hex(`settle:refund:${settlementId}:${escrowId}:${nowMs}`).slice(0, 44),
      timestamp_ms: nowMs,
    };
    settlementsStore.unshift(settlement);
    return settlement;
  }
}

const SAMPLE_BUDGET_WINDOW_MS = 60 * 60 * 1000;

/**
 * The sample datasets are fictional, so their privacy budget refills every hour to keep the
 * public demo usable. Real uploaded listings never refill: once spent, the dataset retires.
 */
function refreshSampleBudget(listing: EnclaveListing): void {
  if (!listing.is_sample) return;
  const now = Date.now();
  if (now - (listing.budget_window_start_ms ?? 0) >= SAMPLE_BUDGET_WINDOW_MS) {
    listing.budget_window_start_ms = now;
    listing.epsilon_spent = 0;
  }
}

const K_MIN_ROWS = 20;
const QUALITY_GUARANTEE = 0.5;

/** Whether an order's data met the quality guarantee, from the appraisal it was bought against. */
function deliveryWithinRange(listing: EnclaveListing, escrowId?: string): boolean {
  const escrow = escrowId ? escrowsStore.get(escrowId) : undefined;
  const appraisal = escrow ? appraisalsStore.get(escrow.appraisal_id) : undefined;
  const score =
    appraisal && appraisal.listingId === listing.id ? appraisal.score : listing.latest_score ?? 0;
  return score >= QUALITY_GUARANTEE;
}

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  if (sharedStoreEnabled) {
    // Read the shared snapshot before handling, and hold the response until any write has landed,
    // because a serverless function may be frozen as soon as the response is sent.
    app.use((_req: Request, res: Response, next) => {
      const send = res.json.bind(res);
      res.json = ((body: unknown) => {
        pendingSharedSave.then(() => send(body));
        return res;
      }) as Response['json'];
      pullSharedState().then(() => next(), () => next());
    });
  }

  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'sealed-market-tee-appraiser',
      enclavePubKey: getEnclavePubKey(),
      listingsCount: listingsStore.size,
      queriesCount: queriesStore.length,
      settlementsCount: settlementsStore.length,
    });
  });

  /**
   * 1. `GET /attestation?nonce=`
   * Returns `{ measurement, enclavePubKey, nonce, quote, ... }` signed by the enclave ed25519 key.
   */
  app.get('/attestation', async (req: Request, res: Response) => {
    try {
      const nonce =
        typeof req.query.nonce === 'string' && req.query.nonce.trim().length > 0
          ? req.query.nonce.trim()
          : sha256Hex(`nonce:${Date.now()}`).slice(0, 32);
      const report = await getAttestation(nonce);
      const verification = verifyAttestation(report, nonce);
      res.json({ ...report, verified: verification.valid });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Attestation error',
      });
    }
  });

  /**
   * 2. `POST /appraise { listingId, taskSpec, holdoutCsv? }`
   * Loads seller CSV from sealed storage, computes real completeness, deduplication,
   * freshness, schema fit, Shannon entropy synthetic heuristic, holdout logistic regression
   * accuracy/AUC delta, and Monte Carlo Shapley weights. Signs `sha256(canonicalPayload)`
   * with the enclave ed25519 key. NEVER returns raw rows.
   */
  app.post('/appraise', async (req: Request, res: Response) => {
    try {
      const { listingId, taskSpec, holdoutCsv, preferredFeatures, preferredTarget } = req.body as {
        listingId?: string;
        taskSpec?: string;
        holdoutCsv?: string;
        preferredFeatures?: string[];
        preferredTarget?: string;
      };

      if (
        listingId &&
        !listingsStore.has(listingId) &&
        ['ds_bike', 'ds_churn', 'ds_bad'].includes(listingId)
      ) {
        await seedEnclaveFromDataDir();
      }

      if (!listingId || !listingsStore.has(listingId)) {
        res.status(404).json({ error: `Listing "${listingId}" not found in enclave` });
        return;
      }

      const sellerCsvText = sealedCsvStore.get(listingId);
      if (!sellerCsvText) {
        res.status(404).json({ error: `Sealed CSV for "${listingId}" not found` });
        return;
      }

      const listing = listingsStore.get(listingId)!;
      const maxPrice = Math.max(...listing.views.map((v) => v.price_usdc), 1.0);
      const effectiveHoldout =
        holdoutCsv && holdoutCsv.trim().length > 0 ? holdoutCsv : defaultHoldoutCsv;
      const effectiveTask =
        taskSpec && taskSpec.trim().length > 0
          ? taskSpec.trim()
          : 'Forecast weekend bike demand from weather features';

      const report = await appraiseDataset({
        listingId,
        sellerCsvText,
        holdoutCsvText: effectiveHoldout,
        taskSpec: effectiveTask,
        sellerMaxPriceUsdc: maxPrice,
        contributors: listing.contributors,
        preferredFeatures,
        preferredTarget,
      });

      appraisalsStore.set(report.appraisalId, report);
      listing.latest_score = report.score;
      listing.price_low = report.priceLow;
      listing.price_high = report.priceHigh;
      listing.shapley_weights_bps = report.shapleyWeightsBps;
      listing.latest_appraisal_id = report.appraisalId;
      listing.latest_appraisal = report;
      saveStateSnapshot();

      res.json(report);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Appraisal execution failed',
      });
    }
  });

  /**
   * 3. `POST /query { tokenId, query }`
   * Runs the aggregate inside the enclave, enforces k >= 20 guard and per-listing epsilon budget,
   * adds sensitivity-scaled Laplace noise, decrements token answers_left & listing epsilon budget,
   * and logs the query hash + result hash. NEVER returns raw rows.
   */
  app.post('/query', (req: Request, res: Response) => {
    try {
      const { tokenId, listingId: fallbackListingId, query, caller } = req.body as {
        tokenId?: string;
        listingId?: string;
        query?: QuerySpec;
        caller?: string;
      };

      if (!query || !query.op || !query.column) {
        res.status(400).json({
          code: 'INVALID_QUERY',
          error: 'Query specification requires { op, column, epsilon }',
        });
        return;
      }

      // Every answer must be paid for: a query without a funded answer pass is refused.
      if (!tokenId) {
        res.status(402).json({
          code: 'PASS_REQUIRED',
          error: 'An answer pass is required. Pay into escrow first to unlock answers.',
        });
        return;
      }
      const eps = Number(query.epsilon);
      if (!Number.isFinite(eps) || eps < 0.1 || eps > 1) {
        res.status(400).json({
          code: 'INVALID_QUERY',
          error: 'Privacy cost (epsilon) per answer must be between 0.1 and 1.',
        });
        return;
      }

      let resolvedListingId = fallbackListingId || '';
      let tokenRecord: EnclaveToken | undefined;

      if (tokenId) {
        tokenRecord = tokensStore.get(tokenId);
        if (!tokenRecord) {
          res.status(404).json({
            code: 'TOKEN_NOT_FOUND',
            error: `NEP-245 access token "${tokenId}" not found`,
          });
          return;
        }
        if (tokenRecord.answers_left <= 0) {
          res.status(400).json({
            code: 'ANSWERS_EXHAUSTED',
            error: `NEP-245 token "${tokenId}" has 0 answers remaining. Purchase additional answer entitlements.`,
          });
          return;
        }
        const tokenEscrow = escrowsStore.get(tokenRecord.escrow_id);
        if (tokenEscrow && tokenEscrow.status !== 'Funded') {
          res.status(400).json({
            code: 'ORDER_CLOSED',
            error: `This order is already ${tokenEscrow.status.toLowerCase()}. Buy a new pass to ask more questions.`,
          });
          return;
        }
        resolvedListingId = tokenRecord.listing_id;
      }

      const listing = listingsStore.get(resolvedListingId);
      if (!listing) {
        res.status(404).json({ error: `Listing "${resolvedListingId}" not found` });
        return;
      }

      refreshSampleBudget(listing);

      const csvText = sealedCsvStore.get(resolvedListingId);
      if (!csvText) {
        res.status(404).json({ error: `Sealed dataset for "${resolvedListingId}" not found` });
        return;
      }

      const { rows } = parseCsv(csvText);
      const dpResult = executeDpQuery(
        rows,
        query,
        listing.epsilon_budget,
        listing.epsilon_spent
      );

      // Update server-side epsilon spent and NEP-245 token answers_left
      listing.epsilon_spent = Number((listing.epsilon_spent + query.epsilon).toFixed(4));
      if (tokenRecord) {
        tokenRecord.answers_left -= 1;
      }

      const queryHash = sha256Hex(
        JSON.stringify({ listingId: resolvedListingId, tokenId, query, ts: Date.now() })
      );
      const resultHash = sha256Hex(JSON.stringify(dpResult));
      const teeSig = signWithEnclaveKey(sha256Bytes(`${queryHash}:${resultHash}`));

      const logEntry: EnclaveQueryLog = {
        id: `q_${nextQuerySeq++}`,
        token_id: tokenId || `direct:${resolvedListingId}`,
        listing_id: resolvedListingId,
        caller: caller || tokenRecord?.owner_id || 'buyer.sealed.near',
        query_spec: query,
        query_hash: queryHash,
        noised_value: dpResult.noisedValue,
        epsilon_used: dpResult.epsilonUsed,
        epsilon_remaining: dpResult.epsilonRemaining,
        answers_left: tokenRecord ? tokenRecord.answers_left : 0,
        matched_rows_k: dpResult.matchedRowsK,
        result_hash: resultHash,
        tee_sig: teeSig,
        timestamp_ms: Date.now(),
      };

      queriesStore.unshift(logEntry);
      saveStateSnapshot();

      res.json({
        queryId: logEntry.id,
        listingId: resolvedListingId,
        tokenId: logEntry.token_id,
        result: dpResult,
        queryHash,
        resultHash,
        answersLeft: logEntry.answers_left,
        teePubkey: getEnclavePubKey(),
        teeSig,
        deliveredWithinRange: deliveryWithinRange(listing, tokenRecord?.escrow_id),
      });
    } catch (err) {
      if (err instanceof PrivacyGuardError) {
        res.status(400).json({
          code: err.code,
          error: err.message,
          details: err.details,
        });
        return;
      }
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Query execution failed',
      });
    }
  });

  /**
   * 4. `POST /upload` — Sealed dataset upload encrypted client-side to the enclave's public key
   * plus listing creation (`list_dataset`).
   */
  app.post('/upload', async (req: Request, res: Response) => {
    try {
      const {
        listingId,
        title,
        description,
        sellerAccount,
        ciphertextBase64,
        ivHex,
        ephemeralSaltHex,
        views,
        epsilonBudget,
        contributors,
        taskSpec,
      } = req.body as {
        listingId?: string;
        title?: string;
        description?: string;
        sellerAccount?: string;
        ciphertextBase64: string;
        ivHex: string;
        ephemeralSaltHex: string;
        views: ViewPrice[];
        epsilonBudget: number;
        contributors: Contributor[];
        taskSpec?: string;
      };

      // Decrypt sealed CSV inside the enclave
      const plaintextCsv = decryptSealedUpload({
        ciphertextBase64,
        ivHex,
        ephemeralSaltHex,
      });

      const parsed = parseCsv(plaintextCsv);
      if (parsed.rows.length === 0 || parsed.headers.length === 0) {
        res.status(400).json({ error: 'Decrypted CSV has no valid rows or headers' });
        return;
      }

      if (parsed.rows.length < K_MIN_ROWS) {
        res.status(400).json({
          error: `This file has ${parsed.rows.length} data rows. At least ${K_MIN_ROWS} are needed, because answers are only given for groups of ${K_MIN_ROWS} or more rows.`,
        });
        return;
      }

      // Never overwrite an existing listing: a taken ID gets a short suffix instead.
      const wantedId = (listingId || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32);
      let id = wantedId || `ds_${Date.now().toString(36)}`;
      while (listingsStore.has(id)) {
        id = `${wantedId || 'ds'}_${randomBytes(2).toString('hex')}`;
      }

      sealedCsvStore.set(id, plaintextCsv);
      const datasetHash = sha256Hex(plaintextCsv);
      const maxPrice = Math.max(...(views || []).map((v) => v.price_usdc), 4.0);

      const appraisal = await appraiseDataset({
        listingId: id,
        sellerCsvText: plaintextCsv,
        holdoutCsvText: defaultHoldoutCsv,
        taskSpec: taskSpec || 'Forecast weekend bike demand from weather features',
        sellerMaxPriceUsdc: maxPrice,
        contributors:
          contributors && contributors.length > 0
            ? contributors
            : [{ account: sellerAccount || 'maya.sealed.near', rows: parsed.rows.length }],
      });

      appraisalsStore.set(appraisal.appraisalId, appraisal);

      const newListing: EnclaveListing = {
        id,
        title: title || `Sealed Dataset ${id}`,
        description:
          description ||
          `Client-encrypted dataset (${parsed.rows.length} rows) sealed to enclave key ${getEnclavePubKey().slice(0, 12)}...`,
        seller_account: sellerAccount || 'maya.sealed.near',
        dataset_hash: datasetHash,
        schema: parsed.headers.filter((h) => h !== 'contributor'),
        views:
          views && views.length > 0
            ? views
            : [{ name: 'default_dp_view', price_usdc: 4.0 }],
        epsilon_budget: Number(epsilonBudget) || 3.0,
        epsilon_spent: 0,
        contributors:
          contributors && contributors.length > 0
            ? contributors
            : [{ account: sellerAccount || 'maya.sealed.near', rows: parsed.rows.length }],
        shapley_weights_bps: appraisal.shapleyWeightsBps,
        row_count: parsed.rows.length,
        freshness_date: appraisal.subscores.maxDate,
        latest_score: appraisal.score,
        price_low: appraisal.priceLow,
        price_high: appraisal.priceHigh,
        latest_appraisal_id: appraisal.appraisalId,
        latest_appraisal: appraisal,
        created_at_ms: Date.now(),
      };

      listingsStore.set(id, newListing);
      saveStateSnapshot();

      res.json({
        listing: newListing,
        appraisal,
        datasetHash,
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Sealed upload decryption failed',
      });
    }
  });

  /**
   * 5. `GET /sample-datasets` — Return metadata and raw CSV of the 3 sample fictional datasets in `/data`
   * so the Seller UI can select one, inspect its schema locally, and encrypt it client-side to the enclave key.
   */
  app.get('/sample-datasets', (_req: Request, res: Response) => {
    const samples = [
      {
        id: 'ds_bike_rentals',
        filename: 'ds_bike_rentals.csv',
        title: 'Urban Micro-Mobility & Weather Demand (Oct 2026)',
        csvText: fs.readFileSync(path.join(DATA_DIR, 'ds_bike_rentals.csv'), 'utf8'),
        contributors: [
          { account: 'maya.sealed.near', rows: 60 },
          { account: 'kofi.sealed.near', rows: 36 },
          { account: 'amina.sealed.near', rows: 24 },
        ],
      },
      {
        id: 'ds_ecommerce_churn',
        filename: 'ds_ecommerce_churn.csv',
        title: 'Regional Mobility Pass Retention & Cohort Spend',
        csvText: fs.readFileSync(path.join(DATA_DIR, 'ds_ecommerce_churn.csv'), 'utf8'),
        contributors: [
          { account: 'ada.sealed.near', rows: 27 },
          { account: 'tunde.sealed.near', rows: 25 },
        ],
      },
      {
        id: 'ds_noisy_sensors',
        filename: 'ds_noisy_sensors.csv',
        title: 'Unverified Legacy Telemetry Stream (2024 Archive)',
        csvText: fs.readFileSync(path.join(DATA_DIR, 'ds_noisy_sensors.csv'), 'utf8'),
        contributors: [
          { account: 'stale_bot.sealed.near', rows: 20 },
          { account: 'spam_node.sealed.near', rows: 20 },
        ],
      },
    ];
    res.json(samples);
  });

  /**
   * 6. `GET /listings` & `GET /listings/:id`
   */
  app.get('/listings', (_req: Request, res: Response) => {
    const all = Array.from(listingsStore.values());
    all.forEach(refreshSampleBudget);
    res.json(all.sort((a, b) => b.created_at_ms - a.created_at_ms));
  });

  app.get('/listings/:id', (req: Request, res: Response) => {
    const listing = listingsStore.get(req.params.id as string);
    if (!listing) {
      res.status(404).json({ error: 'Listing not found' });
      return;
    }
    res.json(listing);
  });

  /**
   * 7. `POST /buy` — Fund escrow (via NEAR or 1Click Intents) and mint NEP-245 multi-token entitlement
   */
  app.post('/buy', (req: Request, res: Response) => {
    try {
      const {
        listingId,
        appraisalId,
        answers,
        buyer,
        amountUsdc,
        sourceChain,
        intentTxHash,
      } = req.body as {
        listingId: string;
        appraisalId?: string;
        answers: number;
        buyer?: string;
        amountUsdc?: number;
        sourceChain?: string;
        intentTxHash?: string;
      };

      const listing = listingsStore.get(listingId);
      if (!listing) {
        res.status(404).json({ error: `Listing "${listingId}" not found` });
        return;
      }

      const numAnswers = Math.max(1, Number(answers) || 1);
      const unitPrice =
        listing.price_low && listing.price_high
          ? Number(((listing.price_low + listing.price_high) / 2).toFixed(2))
          : 4.0;
      const totalUsdc = Number(amountUsdc ?? Number((unitPrice * numAnswers).toFixed(2)));
      const floorUsdc = Number(((listing.price_low ?? unitPrice) * numAnswers).toFixed(2));
      if (!Number.isFinite(totalUsdc) || totalUsdc + 1e-9 < floorUsdc) {
        res.status(400).json({
          error: `Payment of $${Number(totalUsdc || 0).toFixed(2)} is below the price of $${floorUsdc.toFixed(2)} for ${numAnswers} answer(s).`,
        });
        return;
      }
      if (numAnswers > 20) {
        res.status(400).json({ error: 'A single pass can hold at most 20 answers.' });
        return;
      }
      const escrowId = `esc_${nextEscrowSeq++}`;
      const tokenId = `nep245:${listingId}:${escrowId}`;
      const buyerAccount = buyer || 'buyer.sealed.near';
      const yoctoAmount = (BigInt(Math.round(totalUsdc * 100)) * 10000000000000000000000n).toString();

      const escrow: EnclaveEscrow = {
        id: escrowId,
        listing_id: listingId,
        appraisal_id: appraisalId || listing.latest_appraisal_id || 'appr_default',
        buyer: buyerAccount,
        amount_yocto: yoctoAmount,
        amount_usdc: totalUsdc,
        source_chain: sourceChain || 'base',
        intent_tx_hash:
          intentTxHash || `0x${sha256Hex(`${escrowId}:${buyerAccount}:${Date.now()}`).slice(0, 64)}`,
        token_id: tokenId,
        status: 'Funded',
        created_at_ms: Date.now(),
      };
      escrowsStore.set(escrowId, escrow);

      const token: EnclaveToken = {
        token_id: tokenId,
        owner_id: buyerAccount,
        listing_id: listingId,
        escrow_id: escrowId,
        answers_total: numAnswers,
        answers_left: numAnswers,
        issued_at_ms: Date.now(),
      };
      tokensStore.set(tokenId, token);
      saveStateSnapshot();

      res.json({
        escrow,
        token,
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Buy escrow creation failed',
      });
    }
  });

  /**
   * 8. `POST /settle` — Settle escrow: 5% platform fee + Shapley split if delivered_within_range, else full refund
   */
  app.post('/settle', (req: Request, res: Response) => {
    try {
      const { listingId, escrowId, deliveredWithinRange } = req.body as {
        listingId: string;
        escrowId: string;
        deliveredWithinRange: boolean;
      };
      const listing = listingsStore.get(listingId);
      if (!listing) {
        res.status(404).json({ error: `Listing "${listingId}" not found` });
        return;
      }
      // The outcome is decided here from the signed appraisal the order was bought against,
      // not by whoever calls this endpoint. Only the operator can force the other outcome.
      const measured = deliveryWithinRange(listing, escrowId);
      const outcome = isAdmin(req) && typeof deliveredWithinRange === 'boolean' ? deliveredWithinRange : measured;
      const settlement = settleEscrowInternal(listingId, escrowId, outcome);
      saveStateSnapshot();
      res.json(settlement);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Settlement failed',
      });
    }
  });

  /**
   * 9. `GET /queries`, `GET /settlements`, `GET /tokens`
   */
  app.get('/queries', (req: Request, res: Response) => {
    const lid = typeof req.query.listingId === 'string' ? req.query.listingId : undefined;
    const filtered = lid ? queriesStore.filter((q) => q.listing_id === lid) : queriesStore;
    // The public log proves a query ran (hashes, signature). The answer itself was paid for by
    // its buyer and is not republished here.
    res.json(filtered.map((q) => ({ ...q, noised_value: undefined })));
  });

  app.get('/settlements', (req: Request, res: Response) => {
    const lid = typeof req.query.listingId === 'string' ? req.query.listingId : undefined;
    const filtered = lid
      ? settlementsStore.filter((s) => s.listing_id === lid)
      : settlementsStore;
    res.json(filtered);
  });

  app.get('/tokens', (req: Request, res: Response) => {
    const owner = typeof req.query.ownerId === 'string' ? req.query.ownerId : undefined;
    const all = Array.from(tokensStore.values());
    res.json(owner ? all.filter((t) => t.owner_id === owner) : all);
  });

  /**
   * 10. `POST /relayer/create-account` — Gasless meta-tx named account + dataset subaccount relayer
   */
  app.post('/relayer/create-account', (req: Request, res: Response) => {
    const { email, desiredPrefix, datasetSlug } = req.body as {
      email?: string;
      desiredPrefix?: string;
      datasetSlug?: string;
    };
    const rawName = (desiredPrefix || email?.split('@')[0] || 'seller')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '')
      .slice(0, 20);
    const accountId = `${rawName || 'maya'}.sealed.near`;
    const subaccountId = `${(datasetSlug || 'ds1').toLowerCase().replace(/[^a-z0-9_]/g, '')}.${accountId}`;
    const emailHash = sha256Hex(email || accountId);
    const derivedPubKey = `ed25519:${sha256Hex(`meta-tx:${accountId}:${emailHash}`).slice(0, 44)}`;
    const metaTxHash = sha256Hex(`nep366:${accountId}:${Date.now()}`).slice(0, 44);

    namedAccountsStore.set(accountId, {
      accountId,
      emailHash,
      publicKey: derivedPubKey,
      createdAtMs: Date.now(),
    });
    saveStateSnapshot();

    res.json({
      accountId,
      datasetSubaccountId: subaccountId,
      publicKey: derivedPubKey,
      metaTxHash,
      relayerSponsor: 'relayer.sealed.near',
      gasSponsoredNear: '0.0042',
    });
  });

  /**
   * 11. Operator console (`/admin` in the web app).
   * `POST /admin/login { password }` → short-lived bearer token. The password is never
   * shipped to the browser bundle: it lives only in the `ADMIN_PASSWORD` env var on this service.
   */
  app.post('/admin/login', (req: Request, res: Response) => {
    const { password } = (req.body || {}) as { password?: string };
    if (typeof password !== 'string' || !constantTimeEquals(password, ADMIN_PASSWORD)) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    res.json(createAdminToken());
  });

  app.post('/admin/logout', (req: Request, res: Response) => {
    const token = bearerToken(req);
    if (token) revokedAdminTokens.add(token);
    res.json({ ok: true });
  });

  app.get('/admin/overview', (req: Request, res: Response) => {
    if (!isAdmin(req)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    res.json({
      enclavePubKey: getEnclavePubKey(),
      listings: Array.from(listingsStore.values()).map((l) => ({
        ...l,
        latest_appraisal: undefined,
      })),
      escrows: Array.from(escrowsStore.values()).sort((a, b) => b.created_at_ms - a.created_at_ms),
      tokens: Array.from(tokensStore.values()).sort((a, b) => b.issued_at_ms - a.issued_at_ms),
      queries: queriesStore,
      settlements: settlementsStore,
      accounts: Array.from(namedAccountsStore.values()),
      appraisalsCount: appraisalsStore.size,
    });
  });

  app.post('/admin/clear', (req: Request, res: Response) => {
    if (!isAdmin(req)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    sealedCsvStore.clear();
    listingsStore.clear();
    appraisalsStore.clear();
    escrowsStore.clear();
    tokensStore.clear();
    queriesStore.length = 0;
    settlementsStore.length = 0;
    namedAccountsStore.clear();
    nextEscrowSeq = 1;
    nextQuerySeq = 1;
    nextSettlementSeq = 1;
    const done = SAMPLE_LISTINGS_ENABLED ? seedEnclaveFromDataDir() : Promise.resolve();
    done
      .then(() => {
        saveStateSnapshot();
        res.json({ ok: true });
      })
      .catch((err) => res.status(500).json({ error: String(err) }));
  });

  return app;
}

// Start server if invoked directly
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const port = Number(process.env.PORT) || 3001;
  initializeEnclaveState()
    .then(() => {
      const app = createApp();
      app.listen(port, () => {
        console.log(
          `[Sealed Market TEE] Enclave service listening on http://localhost:${port}`
        );
        console.log(`[Sealed Market TEE] Enclave ed25519 Public Key: ${getEnclavePubKey()}`);
        if (ADMIN_PASSWORD_FROM_ENV) {
          console.log('[Sealed Market TEE] Operator console password loaded from ADMIN_PASSWORD.');
        } else {
          console.log(
            `[Sealed Market TEE] ADMIN_PASSWORD not set — one-time operator password for this run: ${ADMIN_PASSWORD}`
          );
        }
      });
    })
    .catch((err) => {
      console.error('Failed to initialize TEE enclave state:', err);
      process.exit(1);
    });
}
