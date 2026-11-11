// VERIFY: https://docs.near.org/build/web3-apps/integrate-contracts
import { setupWalletSelector, type WalletSelector } from '@near-wallet-selector/core';
import { setupMyNearWallet } from '@near-wallet-selector/my-near-wallet';
// VERIFY: https://docs.near.org/tools/near-api-js/quick-reference
import { KeyPair, providers, transactions, utils } from 'near-api-js';

export const TEE_BASE_URL = import.meta.env.VITE_TEE_URL || '/tee-api';
export const NEAR_CONTRACT_ID = import.meta.env.VITE_NEAR_CONTRACT_ID || 'market.sealed.near';
export const NEAR_RPC_URL = import.meta.env.VITE_NEAR_RPC_URL || 'https://rpc.testnet.near.org';

export interface ViewPrice {
  name: string;
  price_usdc: number;
}

export interface Contributor {
  account: string;
  rows: number;
}

export interface ContributorShapley {
  account: string;
  rows: number;
  marginalUtility: number;
  weight: number;
  weightBps: number;
}

export interface AppraisalSubScores {
  completeness: number;
  nullRate: number;
  uniqueness: number;
  duplicateRate: number;
  freshness: number;
  maxDate: string;
  schemaFit: number;
  syntheticScore: number;
  syntheticFlag: boolean;
  utilityDelta: number;
  accuracyWithout: number;
  accuracyWith: number;
  aucWithout: number;
  aucWith: number;
}

export interface AttestationData {
  measurement: string;
  enclavePubKey: string;
  nonce: string;
  quote: string;
  attestationRef: string;
  provider: 'phala-dstack' | 'near-ai-cloud' | 'self-hosted-enclave';
  reportDataHex: string;
  signature: string;
  timestamp: number;
}

export interface AppraisalReport {
  appraisalId: string;
  listingId: string;
  datasetHash: string;
  taskSpec: string;
  taskHash: string;
  score: number;
  priceLow: number;
  priceHigh: number;
  subscores: AppraisalSubScores;
  holdoutEvaluation: {
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
  };
  shapleyContributors: ContributorShapley[];
  shapleyWeightsBps: number[];
  explanation: string;
  canonicalPayload: string;
  reportHash: string;
  teePubkey: string;
  teeSig: string;
  attestationRef: string;
  attestation: AttestationData;
  rowCount: number;
  createdAtMs: number;
}

export interface Listing {
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

export interface QuerySpec {
  op: 'AVG' | 'SUM' | 'COUNT' | 'MIN' | 'MAX' | 'MODEL_METRIC';
  column: string;
  filterColumn?: string;
  filterOp?: 'eq' | 'gt' | 'lt' | 'gte' | 'lte';
  filterValue?: string | number;
  epsilon: number;
}

export interface QueryLogRecord {
  id: string;
  token_id: string;
  listing_id: string;
  caller: string;
  query_spec?: QuerySpec;
  query_hash: string;
  noised_value?: number;
  epsilon_used: number;
  epsilon_remaining: number;
  answers_left: number;
  matched_rows_k?: number;
  result_hash: string;
  tee_sig?: string;
  timestamp_ms: number;
}

export interface ContributorPayout {
  account: string;
  weight_bps: number;
  amount_yocto: string;
  amount_usdc: number;
}

export interface SettlementRecord {
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

export interface SampleDataset {
  id: string;
  filename: string;
  title: string;
  csvText: string;
  contributors: Contributor[];
}

export interface AccessTokenRecord {
  token_id: string;
  owner_id: string;
  listing_id: string;
  escrow_id: string;
  answers_total: number;
  answers_left: number;
  issued_at_ms: number;
}

let selectorPromise: Promise<WalletSelector> | null = null;

/**
 * Initialize `@near-wallet-selector/core` with `@near-wallet-selector/my-near-wallet`.
 */
export async function getNearWalletSelector(): Promise<WalletSelector> {
  if (!selectorPromise) {
    // VERIFY: https://docs.near.org/build/web3-apps/integrate-contracts
    selectorPromise = setupWalletSelector({
      network: 'testnet',
      modules: [setupMyNearWallet()],
    });
  }
  return selectorPromise;
}

/**
 * Capture `account_id` / `all_keys` returned by MyNearWallet redirect callback before
 * `@near-js/wallet-account` strips them from `window.location.search`.
 */
export function consumeNearWalletCallback(): { accountId: string; publicKey: string } | null {
  if (typeof window === 'undefined') return null;
  try {
    const currentUrl = new URL(window.location.href);
    const urlAccountId = currentUrl.searchParams.get('account_id') || '';
    const urlAllKeys = (currentUrl.searchParams.get('all_keys') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const urlPublicKey = currentUrl.searchParams.get('public_key') || urlAllKeys[0] || '';

    if (urlAccountId) {
      localStorage.setItem('sealed_market_user_account', urlAccountId);
      if (urlPublicKey) {
        localStorage.setItem('sealed_market_user_pubkey', urlPublicKey);
      }
      localStorage.setItem('sealed_market_wallet_mode', 'my-near-wallet');
      currentUrl.searchParams.delete('account_id');
      currentUrl.searchParams.delete('public_key');
      currentUrl.searchParams.delete('all_keys');
      window.history.replaceState({}, document.title, currentUrl.toString());
      return { accountId: urlAccountId, publicKey: urlPublicKey };
    }

    const storedAuth = localStorage.getItem('near_app_wallet_auth_key');
    if (storedAuth) {
      const parsed = JSON.parse(storedAuth) as { accountId?: string; allKeys?: string[] };
      if (parsed?.accountId) {
        return {
          accountId: parsed.accountId,
          publicKey: Array.isArray(parsed.allKeys) && parsed.allKeys[0] ? parsed.allKeys[0] : '',
        };
      }
    }
  } catch {
    // ignore storage / URL errors
  }
  return null;
}

/**
 * Redirect to MyNearWallet (`testnet.mynearwallet.com` or `app.mynearwallet.com`) via
 * `@near-wallet-selector/my-near-wallet`. Uses `contractId: ''` unless live RPC contract is
 * enabled so `near-api-js` does not reject with `AccountDoesNotExist` before redirecting.
 */
export async function signInWithMyNearWallet(
  network: 'testnet' | 'mainnet' = 'testnet'
): Promise<void> {
  const callbackUrl = typeof window !== 'undefined' ? window.location.href : '';
  if (network === 'mainnet') {
    const loginUrl = new URL('/login/', 'https://app.mynearwallet.com');
    loginUrl.searchParams.set('success_url', callbackUrl);
    loginUrl.searchParams.set('failure_url', callbackUrl);
    window.location.assign(loginUrl.toString());
    return;
  }

  try {
    const sel = await getNearWalletSelector();
    const wallet = await sel.wallet('my-near-wallet');
    await (
      wallet as unknown as {
        signIn: (opts: {
          contractId: string;
          methodNames?: string[];
          successUrl?: string;
          failureUrl?: string;
        }) => Promise<void>;
      }
    ).signIn({
      contractId: import.meta.env.VITE_USE_LIVE_NEAR_RPC === 'true' ? NEAR_CONTRACT_ID : '',
      successUrl: callbackUrl,
      failureUrl: callbackUrl,
    });
  } catch {
    const loginUrl = new URL('/login/', 'https://testnet.mynearwallet.com');
    loginUrl.searchParams.set('success_url', callbackUrl);
    loginUrl.searchParams.set('failure_url', callbackUrl);
    window.location.assign(loginUrl.toString());
  }
}

/**
 * Sign out of `@near-wallet-selector/my-near-wallet` and clear stored wallet credentials.
 */
export async function signOutNearWallet(): Promise<void> {
  try {
    const sel = await getNearWalletSelector();
    const wallet = await sel.wallet('my-near-wallet');
    await wallet.signOut();
  } catch {
    // ignore if not signed in via selector
  }
  try {
    localStorage.removeItem('near_app_wallet_auth_key');
    localStorage.removeItem('sealed_market_user_account');
    localStorage.removeItem('sealed_market_user_pubkey');
    localStorage.removeItem('sealed_market_wallet_mode');
  } catch {
    // ignore
  }
}

/**
 * Generate a real NEAR Function-Call Access Key (`ed25519`) scoped to `market.sealed.near`
 * with method restrictions and spend allowance.
 */
export function generateAgentFunctionCallKey(params: {
  contractId: string;
  allowedMethods: string[];
  allowanceNear: string;
}): {
  publicKey: string;
  secretKey: string;
  allowanceYocto: string;
  permissionSummary: string;
} {
  const keyPair = KeyPair.fromRandom('ed25519');
  const allowanceYocto =
    utils.format.parseNearAmount(params.allowanceNear) || '5000000000000000000000000';
  // Construct real NEAR FunctionCall access key permission via near-api-js
  transactions.functionCallAccessKey(
    params.contractId,
    params.allowedMethods,
    BigInt(allowanceYocto)
  );

  return {
    publicKey: keyPair.getPublicKey().toString(),
    secretKey: keyPair.toString(),
    allowanceYocto,
    permissionSummary: `Receiver: ${params.contractId} | Methods: [${params.allowedMethods.join(', ')}] | Allowance: ${params.allowanceNear} NEAR`,
  };
}

/**
 * Call a view method on the NEAR smart contract via JSON-RPC (`near-api-js`),
 * falling back to the TEE enclave's synchronized state endpoint if the contract is not yet deployed on testnet.
 */
export async function callNearContractView<T>(
  methodName: string,
  args: Record<string, unknown> = {}
): Promise<T | null> {
  if (import.meta.env.VITE_USE_LIVE_NEAR_RPC !== 'true') {
    return null;
  }
  try {
    const provider = new providers.JsonRpcProvider({ url: NEAR_RPC_URL });
    const argsBase64 = btoa(JSON.stringify(args));
    const res = await provider.query({
      request_type: 'call_function',
      account_id: NEAR_CONTRACT_ID,
      method_name: methodName,
      args_base64: argsBase64,
      finality: 'optimistic',
    });
    const resultBytes = (res as unknown as { result: number[] }).result;
    const text = new TextDecoder().decode(new Uint8Array(resultBytes));
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function fetchAttestation(nonce: string): Promise<AttestationData> {
  const res = await fetch(`${TEE_BASE_URL}/attestation?nonce=${encodeURIComponent(nonce)}`);
  if (!res.ok) {
    throw new Error(`Attestation endpoint returned HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchListings(): Promise<Listing[]> {
  const onchain = await callNearContractView<Listing[]>('get_listings', {});
  const res = await fetch(`${TEE_BASE_URL}/listings`);
  if (!res.ok) {
    throw new Error(`Failed to fetch listings: HTTP ${res.status}`);
  }
  const teeListings = (await res.json()) as Listing[];
  return onchain && onchain.length > 0 ? onchain : teeListings;
}

export async function fetchSampleDatasets(): Promise<SampleDataset[]> {
  const res = await fetch(`${TEE_BASE_URL}/sample-datasets`);
  if (!res.ok) {
    throw new Error(`Failed to load sample datasets: HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchQueries(listingId?: string): Promise<QueryLogRecord[]> {
  const url = listingId
    ? `${TEE_BASE_URL}/queries?listingId=${encodeURIComponent(listingId)}`
    : `${TEE_BASE_URL}/queries`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch queries: HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchSettlements(listingId?: string): Promise<SettlementRecord[]> {
  const url = listingId
    ? `${TEE_BASE_URL}/settlements?listingId=${encodeURIComponent(listingId)}`
    : `${TEE_BASE_URL}/settlements`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch settlements: HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchTokens(ownerId?: string): Promise<AccessTokenRecord[]> {
  const url = ownerId
    ? `${TEE_BASE_URL}/tokens?ownerId=${encodeURIComponent(ownerId)}`
    : `${TEE_BASE_URL}/tokens`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch NEP-245 tokens: HTTP ${res.status}`);
  }
  return res.json();
}

export async function runPrivateAppraisal(params: {
  listingId: string;
  taskSpec: string;
  holdoutCsv?: string;
}): Promise<AppraisalReport> {
  const res = await fetch(`${TEE_BASE_URL}/appraise`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Appraisal failed' }));
    throw new Error(err.error || `Appraisal HTTP ${res.status}`);
  }
  return res.json();
}

export async function createGaslessNamedAccount(params: {
  email: string;
  desiredPrefix?: string;
  datasetSlug?: string;
}): Promise<{
  accountId: string;
  datasetSubaccountId: string;
  publicKey: string;
  metaTxHash: string;
  relayerSponsor: string;
  gasSponsoredNear: string;
}> {
  const res = await fetch(`${TEE_BASE_URL}/relayer/create-account`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    throw new Error(`Relayer HTTP ${res.status}`);
  }
  return res.json();
}

export async function uploadEncryptedDatasetAndPublish(params: {
  listingId?: string;
  title: string;
  description: string;
  sellerAccount: string;
  ciphertextBase64: string;
  ivHex: string;
  ephemeralSaltHex: string;
  views: ViewPrice[];
  epsilonBudget: number;
  contributors: Contributor[];
  taskSpec?: string;
}): Promise<{
  listing: Listing;
  appraisal: AppraisalReport;
  datasetHash: string;
}> {
  const res = await fetch(`${TEE_BASE_URL}/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(err.error || `Upload HTTP ${res.status}`);
  }
  return res.json();
}

export async function buyAnswersEscrow(params: {
  listingId: string;
  appraisalId?: string;
  answers: number;
  buyer: string;
  amountUsdc: number;
  sourceChain: string;
  intentTxHash: string;
}): Promise<{
  escrow: {
    id: string;
    listing_id: string;
    appraisal_id: string;
    buyer: string;
    amount_usdc: number;
    source_chain: string;
    intent_tx_hash: string;
    token_id: string;
    status: string;
  };
  token: AccessTokenRecord;
}> {
  const res = await fetch(`${TEE_BASE_URL}/buy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Buy failed' }));
    throw new Error(err.error || `Buy HTTP ${res.status}`);
  }
  return res.json();
}

export async function executeEnclaveQuery(params: {
  tokenId?: string;
  listingId?: string;
  caller: string;
  query: QuerySpec;
}): Promise<{
  queryId: string;
  listingId: string;
  tokenId: string;
  result: {
    op: string;
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
  };
  queryHash: string;
  resultHash: string;
  answersLeft: number;
  teePubkey: string;
  teeSig: string;
  deliveredWithinRange: boolean;
}> {
  const res = await fetch(`${TEE_BASE_URL}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Query failed' }));
    const errorObj = new Error(err.error || `Query HTTP ${res.status}`) as Error & {
      code?: string;
      details?: Record<string, unknown>;
    };
    errorObj.code = err.code;
    errorObj.details = err.details;
    throw errorObj;
  }
  return res.json();
}

export async function settleEscrowOnchain(params: {
  listingId: string;
  escrowId: string;
  deliveredWithinRange: boolean;
}): Promise<SettlementRecord> {
  const res = await fetch(`${TEE_BASE_URL}/settle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Settlement failed' }));
    throw new Error(err.error || `Settle HTTP ${res.status}`);
  }
  return res.json();
}


// ─── Operator console (/admin) ──────────────────────────────────────────────
// The admin password is never bundled into the frontend. It is verified by the TEE
// service against its `ADMIN_PASSWORD` env var and exchanged for a short-lived bearer token.

export interface AdminEscrowRecord {
  id: string;
  listing_id: string;
  appraisal_id: string;
  buyer: string;
  amount_usdc: number;
  source_chain: string;
  intent_tx_hash: string;
  token_id: string;
  status: 'Funded' | 'Released' | 'Refunded';
  created_at_ms: number;
}

export interface AdminOverview {
  enclavePubKey: string;
  listings: Listing[];
  escrows: AdminEscrowRecord[];
  tokens: AccessTokenRecord[];
  queries: QueryLogRecord[];
  settlements: SettlementRecord[];
  accounts: { accountId: string; emailHash: string; publicKey: string; createdAtMs: number }[];
  appraisalsCount: number;
}

export class UnauthorizedError extends Error {}

export async function adminLogin(password: string): Promise<{ token: string; expiresAtMs: number }> {
  const res = await fetch(`${TEE_BASE_URL}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (res.status === 401) throw new UnauthorizedError('Incorrect password');
  if (!res.ok) throw new Error(`Login failed: HTTP ${res.status}`);
  return res.json();
}

export async function adminLogout(token: string): Promise<void> {
  await fetch(`${TEE_BASE_URL}/admin/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => undefined);
}

export async function fetchAdminOverview(token: string): Promise<AdminOverview> {
  const res = await fetch(`${TEE_BASE_URL}/admin/overview`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new UnauthorizedError('Session expired');
  if (!res.ok) throw new Error(`Overview failed: HTTP ${res.status}`);
  return res.json();
}

export async function adminClearState(token: string): Promise<void> {
  const res = await fetch(`${TEE_BASE_URL}/admin/clear`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new UnauthorizedError('Session expired');
  if (!res.ok) throw new Error(`Clear failed: HTTP ${res.status}`);
}
