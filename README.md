# Sealed Market — Attested Private Data Marketplace on NEAR

> **Sell answers, not raw spreadsheets.**
> A private AI appraiser scores datasets inside a Trusted Execution Environment (TEE) and releases only a signed quality report. Buyers (human or autonomous agent) test quality for free, pay per answer from any chain via **NEAR Intents (1Click)**, ask **Differentially-Private** aggregate questions, and settle automatically by a **Monte Carlo Shapley split** from onchain escrow (`market.sealed.near`) — or receive an automatic **100% refund** if data quality falls short.

---

## Table of Contents

1. [How It Works (Plain English Overview)](#how-it-works-plain-english-overview)
2. [`// VERIFY:` External Dependency Confirmations](#-verify-external-dependency-confirmations)
3. [Monorepo Architecture](#monorepo-architecture)
4. [Complete Feature Matrix (Everything in the Real App)](#complete-feature-matrix-everything-in-the-real-app)
5. [End-to-End User Flow in the Live Web App](#end-to-end-user-flow-in-the-live-web-app)
6. [Operator Console (`/admin`)](#operator-console-admin)
7. [Step-by-Step Local Run, Test & Deployment Guide](#step-by-step-local-run-test--deployment-guide)
8. [API Reference (`/tee` & Vercel `/tee-api`)](#api-reference-tee--vercel-tee-api)

---

## How It Works (Plain English Overview)

Normally, once you send someone a CSV spreadsheet, they can copy or share your raw file forever. **Sealed Market** solves both sides of the data trade:

- **For Data Owners (Sellers)**: You upload your `.csv` spreadsheet in your browser. Before it ever leaves your computer, your browser locks it with `AES-256-GCM` encryption bound to the private vault's public key. Buyers never download or view your individual rows — they only pay to ask aggregate questions (averages, sums, counts, mins, maxes).
- **For Data Buyers**: You never buy blind. Before spending a cent, you run a **Free Quality Check** inside the private vault to see how complete, unique, and up-to-date the dataset is, and how much it boosts prediction accuracy for your goal.
- **100% Buyer & Seller Protection**: Payments are held in escrow until your questions are answered. If the dataset meets the quality guarantee, 95% of the payment is distributed automatically across every data contributor based on their **Monte Carlo Shapley** contribution (with a 5% platform fee). If the dataset fails the quality guarantee, 100% of the payment is automatically refunded to the buyer with zero fee.

---

## ⚠️ `// VERIFY:` External Dependency Confirmations

Per strict engineering discipline, no external API shapes or hardware quote byte offsets are fabricated. External integration points are encapsulated behind single-file adapters with explicit `// VERIFY:` markers and official documentation URLs:

1. **A. NEAR AI Cloud TEE Custom-Code Execution & Hardware Quote Layout (`tee/attestation.ts`)**
   - **What to confirm**: Whether NEAR AI Cloud TEE worker containers permit arbitrary Node.js/Python statistical & ML runtimes or restrict enclaves to LLM inference endpoints, and the exact Intel TDX v4 quote byte offsets (`MRTD` at `184..232`, `REPORTDATA` at `568..632`).
   - **Adapter file**: [`tee/attestation.ts`](./tee/attestation.ts) (also documented in [`tee/README.md`](./tee/README.md))
   - **Official Docs**:
     - `// VERIFY: https://docs.near.ai/cloud/attestation`
     - `// VERIFY: https://docs.phala.network/dstack/attestation`

2. **B. NEAR Intents / 1Click Cross-Chain Swap & Escrow Deposit API (`web/src/lib/intents.ts`)**
   - **What to confirm**: The request/response schema for `POST https://1click.chaindefuser.com/v0/quote` (`OneClickQuoteRequest`) and `POST /v0/deposit/submit` (`OneClickSubmitDepositRequest`), plus the canonical NEP-141 `omft.near` asset identifiers for Base, Arbitrum, and Solana USDC.
   - **Adapter file**: [`web/src/lib/intents.ts`](./web/src/lib/intents.ts)
   - **Official Docs**:
     - `// VERIFY: https://docs.near-intents.org/near-intents/integration/distribution-channels/1click-api`

3. **NEAR SDK & Host Cryptography Markers (`contract/src/lib.rs`, `web/src/lib/api.ts`, `agent/src/buyer.ts`)**
   - `near_sdk::env::ed25519_verify` host function and NEP-245 Multi-Token standard interface (`// VERIFY: https://docs.near.org/build/smart-contracts/security/cryptography` and `https://nomicon.io/Standards/Tokens/MultiToken/Core`).

---

## Monorepo Architecture

```text
sealed-market/
├── contract/                 # Rust NEAR smart contract (`market.sealed.near`, near-sdk = 5.30.1)
│   ├── Cargo.toml
│   └── src/lib.rs            # Listings, ed25519 appraisal verify, NEP-245 tokens, Escrow, Shapley settle
├── tee/                      # Standalone TEE-deployable Appraiser & DP Query Engine (TypeScript)
│   ├── attestation.ts        # Single TEE attestation adapter (fetchQuoteByNonce, parseMeasurement)
│   ├── README.md             # Deployment targets: Phala dstack, NEAR AI Cloud, Self-Hosted CVM
│   └── src/
│       ├── crypto.ts         # @noble/ed25519 signing/verify + AES-256-GCM enclave unsealing
│       ├── dp.ts             # Laplace mechanism Lap(Δf/ε), epsilon budget, k >= 20 guard
│       ├── ml.ts             # L2 Logistic Regression (gradient descent), ROC-AUC, Monte Carlo Shapley
│       ├── appraiser.ts      # Nulls, SHA-256 dedup, freshness decay, Shannon entropy, signed report
│       ├── server.ts         # Express API (/attestation, /appraise, /query, /upload, /buy, /settle, /admin)
│       ├── seed.ts           # Optional CLI dataset seeder (`npm run seed`)
│       └── self-test.ts      # End-to-end cryptographic, ML, Shapley, and DP verification suite
├── api/                      # Vercel Serverless API bridge (`api/index.ts` -> mounts `/tee` Express app)
│   └── index.ts
├── web/                      # React + Vite + Tailwind CSS marketplace frontend (light, mobile-first)
│   └── src/
│       ├── App.tsx           # Path router: /, /d/:id, /orders, /orders/:id, /sell, /auto-buy, /admin
│       ├── store.tsx         # Catalogue, vault check, account, and orders (persisted in localStorage)
│       ├── pages/            # HomePage, ListingPage, OrdersPage (+ OrderPage), SellPage, AutoBuyPage
│       ├── components/       # Shell, ListingCard, QualityCheck, BuyBox, AskPanel, SettlePanel,
│       │                     # SealPanel, VaultCheck, GuideModal, AccountPanel
│       ├── lib/intents.ts    # NEAR Intents / 1Click quote + execute adapter
│       ├── lib/crypto.ts     # Browser @noble/ed25519 verify + WebCrypto AES-256-GCM sealing
│       ├── lib/api.ts        # @near-wallet-selector/core + near-api-js + TEE client
│       ├── lib/router.tsx    # Minimal history router
│       ├── ui/kit.tsx        # Design kit (Button, Pill, Modal, ScoreRing, CountUp, Bar, Toasts)
│       └── admin/            # Unlinked operator console (`/admin`, server-side HMAC password auth)
│           └── AdminApp.tsx
├── agent/                    # Autonomous Agent Buyer CLI (near-api-js Function-Call Access Key)
│   ├── buyer.js              # CLI entrypoint (`node agent/buyer.js` and `node agent/buyer.js --listing bad`)
│   ├── SKILL.md              # Agent capability specification
│   └── src/buyer.ts          # Capped key creation, attestation verify, auto-buy rule, DP query, settle
├── data/                     # CSV datasets for CLI self-tests & holdout evaluation
│   ├── ds_bike_rentals.csv
│   ├── ds_ecommerce_churn.csv
│   ├── ds_noisy_sensors.csv
│   └── holdout_weekend_demand.csv
└── tasks/
    └── demand.json           # Sample appraisal payload for `POST /appraise`
```

---

## Complete Feature Matrix (Everything in the Real App)

| Capability | Where It Runs | How It Works in the Real App |
| :--- | :--- | :--- |
| **How-it-works Guide** | `web/src/components/GuideModal.tsx` | A 4-slide walkthrough for sellers and buyers, opened from **How it works** (it does not open by itself). |
| **NEAR Wallet & Instant Gasless Auth** | `web/src/lib/api.ts` + `POST /relayer/create-account` | Click **Connect Wallet** in the header to sign in via **MyNearWallet** (`@near-wallet-selector/my-near-wallet` on Testnet or Mainnet), generate a 1-click **Instant Gasless NEAR Wallet** (`ed25519` keypair + `*.sealed.near` account via NEP-366 meta-tx relayer), or enter an existing `.near`/`.testnet` account. |
| **Client-Side Remote Attestation** | `web/src/lib/crypto.ts` + `tee/attestation.ts` | Generates a fresh 16-byte cryptographic nonce in the browser, binds `sha256(nonce)` and `enclavePubKey` into `report_data[0..64]`, and verifies the 64-byte `ed25519` quote signature client-side. |
| **Gasless Seller Account Creation** | `POST /relayer/create-account` | Provisions a `*.sealed.near` account and dataset revenue subaccount from the seller's email via a gasless NEP-366 meta-transaction relayer receipt. |
| **Browser `AES-256-GCM` CSV Encryption** | `web/src/lib/crypto.ts` + `tee/src/crypto.ts` | Encrypts the seller's uploaded `.csv` file in the browser using WebCrypto `AES-256-GCM` (`128-bit` auth tag) keyed to the enclave's attested public key before upload. |
| **Private TEE Appraisal & ML Holdout Lift** | `tee/src/appraiser.ts` + `tee/src/ml.ts` | Unseals CSV inside the enclave, measures completeness, SHA-256 row deduplication, freshness decay, Shannon entropy synthetic heuristic, L2 Logistic Regression accuracy/ROC-AUC delta, and signs the canonical report with `ed25519`. |
| **Monte Carlo Shapley Attribution** | `tee/src/ml.ts` | Computes each contributor's marginal predictive utility across random coalition permutations ($M = 24$), producing basis-point weights summing to `10000` (`100%`). |
| **Cross-Chain Payment via NEAR Intents** | `web/src/lib/intents.ts` + `POST /buy` | Requests a 1Click swap quote (`Base`, `Arbitrum`, `Solana`, or `NEAR` USDC), funds escrow on `market.sealed.near`, and mints a scoped **NEP-245** multi-token answer pass (`nep245:<listing>:<escrow>`). |
| **Differential Privacy & $k \ge 20$ Guard** | `tee/src/dp.ts` + `POST /query` | Executes `AVG`, `SUM`, `COUNT`, `MIN`, `MAX` queries with cryptographically sampled Laplace noise $\text{Lap}(\Delta f / \varepsilon)$, decrements $\varepsilon$ and pass credits, and blocks any subgroup query with $k < 20$ matching rows (`K_ANONYMITY_VIOLATION`). |
| **Automatic Shapley Payout or 100% Refund** | `POST /settle` + `contract/src/lib.rs` | If quality meets the appraised range, distributes 95% of escrow across contributors by Shapley weights (5% platform fee). If quality falls short, refunds 100% of escrow to the buyer with 0 fee. |
| **Autonomous AI Buyer Bot** | `web/src/pages/AutoBuyPage.tsx` + `agent/buyer.js` | Generates a real scoped NEAR Function-Call Access Key (`buy`, `log_query`, `settle`) and runs the full 6-step verify → appraise → Intents pay → DP query → settle/refund loop with zero clicks. |
| **Unlinked Operator Console (`/admin`)** | `web/src/admin/AdminApp.tsx` + `/admin/*` | Accessible only by typing `/admin` in the URL bar. Authenticates against `process.env.ADMIN_PASSWORD` on the server (never bundled in frontend code) to inspect telemetry, settle escrows, or clear state. |

---

## End-to-End User Flow in the Live Web App

The frontend is a light, monochrome marketplace laid out like a conventional web shop (browse grid, product page with a sticky purchase card, order page). It is built mobile-first: a bottom tab bar, bottom-sheet dialogs, 16px inputs and a sticky price bar on phones.

| Route | What it is |
| :--- | :--- |
| `/` | **Browse**: search, filter chips, sort, dataset cards (quality, price per answer, rows, seller), how-it-works, recent activity. |
| `/d/:id` | **Dataset page**: description, columns, the **free quality check** (signed score, fair price, health bars, payout split), privacy budget, and the purchase card (1, 2, 3 or 5 answers; Base, Arbitrum, Solana or NEAR). |
| `/orders/:id` | **Order page**: ask questions (`AVG`, `SUM`, `COUNT`, `MIN`, `MAX` with an optional filter), see the signed answer and 95% range, then **finish** to pay contributors or receive the refund. |
| `/orders` | **Orders**: your orders (kept in this browser, so they survive a reload) and the public activity log. |
| `/sell` | **Sell**: email (skipped when signed in) → choose a CSV and encrypt it in the browser → price, privacy budget, contributors → publish. |
| `/auto-buy` | **Auto-buy bot**: set minimum quality, maximum price and a key spend limit; watch the six-step run. |
| `/admin` | Operator console (not linked anywhere). |

1. **Browse** and open a dataset. Three fictional sample datasets are always listed (tagged *Sample*).
2. The **free quality check** shows the listing's latest signed report at once, after verifying its signature in the browser. Change the goal, or upload your own test CSV, to run it again.
3. **Pay** from the purchase card. The payment is held in escrow and an answer pass is issued.
4. **Ask** on the order page. A question matching fewer than 20 rows is blocked and does not use an answer.
5. **Finish the order.** The service, not the buyer, decides the outcome from the signed appraisal the order was bought against: 95% split to contributors and a 5% fee, or a 100% refund with no fee.
6. **How it works** (header, or *Guide* on a phone) opens the four-slide guide. It no longer opens by itself.

### What is simulated in this preview

- **Payments.** `web/src/lib/intents.ts` asks the 1Click API for a dry-run quote and falls back to a locally derived quote. No wallet signs anything and no funds move; payment and settlement hashes are derived locally and will not resolve on a block explorer.
- **Escrow and tokens.** The escrow ledger, answer passes and settlements live in the TEE service's state, mirroring the contract in `/contract`. The web app does not call a deployed contract.
- **Attestation.** The quote is signed by the service's own `ed25519` key (see the `// VERIFY:` section above); it is not a hardware quote.
- **Sample privacy budgets** refill every hour because the data is fictional. Uploaded listings never refill.

### Persistence on Vercel

Serverless instances do not share memory or `/tmp`, so an uploaded listing or an open order can vanish between requests. Set `KV_REST_API_URL` and `KV_REST_API_TOKEN` (Vercel KV / Upstash Redis REST) and the service reads its state before each request and writes it after each change. Without them, only the three sample listings are stable. Set `SEED_DEMO_DATA=false` to start with no listings.

---

## Operator Console (`/admin`)

- **URL**: Navigate directly to `/admin` (e.g., `http://localhost:5173/admin` or `<your-vercel-domain>/admin`). There are no links to `/admin` anywhere in the public UI.
- **Password Security**: No password is stored or referenced in the frontend bundle. Authentication is verified by the backend (`POST /admin/login`) using constant-time SHA-256 comparison against the `ADMIN_PASSWORD` environment variable.
  - If `ADMIN_PASSWORD` is not set in the environment when starting `/tee` locally, the server generates a random one-time password for that process and prints it only to the server terminal.
- **Operator Capabilities**:
  - View live counts and tables of all sealed listings, signed appraisals, funded/settled escrows, NEP-245 tokens, DP queries, settlements, and gasless accounts.
  - Manually trigger **Release** or **Refund** on any funded escrow.
  - Click **Clear state** to wipe orders, queries, settlements and uploaded listings. The sample listings are re-sealed.

---

## Step-by-Step Local Run, Test & Deployment Guide

### 1. Build & Test the NEAR Smart Contract (`/contract`)

Compile the Rust smart contract to `wasm32-unknown-unknown` and run the unit test suite (testing `list_dataset`, `record_appraisal` with real `ed25519_verify`, `buy` with NEP-245 minting, `log_query`, and `settle` with both Shapley split release and buyer refund):

```bash
cd contract
cargo test
cargo build --target wasm32-unknown-unknown --release
```

### 2. Run & Verify the TEE Appraiser Service (`/tee`)

Install dependencies, run the 6-part cryptographic/ML/DP self-test suite, and start the TEE server on port `3001`:

```bash
cd tee
npm install
npm test
ADMIN_PASSWORD="your-operator-password" npm start
```

Verify live attestation and appraisal from another terminal:

```bash
# 1. Fetch hardware/enclave quote bound to a fresh nonce:
curl "http://localhost:3001/attestation?nonce=deadbeef20261106"

# 2. Run private appraisal using tasks/demand.json:
curl -s -X POST http://localhost:3001/appraise \
  -H "Content-Type: application/json" \
  -d @tasks/demand.json | jq .
```

### 3. Run the Autonomous Agent Buyer CLI (`/agent`)

With `/tee` running on `http://localhost:3001`, run the autonomous agent buyer script (`node agent/buyer.js`):

```bash
# Path A: High-quality dataset (`ds_bike`) -> Auto-Buy, DP Query, and Shapley Split Release
node agent/buyer.js

# Path B: Low-quality dataset (`ds_bad`) -> Escrow Refund Protection (100% refund, 0 fee)
node agent/buyer.js --listing bad
```

### 4. Run the Frontend Web Application (`/web`)

```bash
cd web
npm install
npm run dev
```

Open `http://localhost:5173` for the public single-flow application, or `http://localhost:5173/admin` for the operator console.

---

## API Reference (`/tee` & Vercel `/tee-api`)

| Method & Path | Description |
| :--- | :--- |
| `GET /health` | Returns service status, enclave `ed25519` public key, and active store counts. |
| `GET /attestation?nonce=<hex>` | Generates an enclave quote binding `sha256(nonce)` and `enclavePubKey` in `report_data` and signs it with `ed25519`. |
| `POST /relayer/create-account` | Creates a gasless `*.sealed.near` seller account and dataset subaccount from an email address. |
| `POST /upload` | Decrypts client-sealed `AES-256-GCM` CSV ciphertext inside the enclave, runs an initial appraisal, and publishes the listing. |
| `GET /listings` | Lists all published datasets (metadata, schema, scores, privacy budget — never raw rows). |
| `POST /appraise` | Runs a private appraisal (`completeness`, `uniqueness`, `freshness`, holdout Logistic Regression lift, Monte Carlo Shapley weights) and returns a signed `AppraisalReport`. |
| `POST /buy` | Records cross-chain NEAR Intents escrow funding and mints a scoped NEP-245 answer entitlement token. |
| `POST /query` | Requires a funded answer pass (`tokenId`). Executes a Laplace-noised aggregate query (`AVG`, `SUM`, `COUNT`, `MIN`, `MAX`), enforcing $k \ge 20$ and $\varepsilon$ budget limits. |
| `POST /settle` | Settles an escrow. The service decides from the order's signed appraisal: 5% fee + Monte Carlo Shapley contributor split if quality met the guarantee, otherwise a 100% buyer refund. `deliveredWithinRange` is honoured only with an operator token. |
| `GET /queries` | Returns the audit log of executed DP queries (`query_hash`, `result_hash`, `tee_sig`, $\varepsilon$ spent). Answer values are not republished. |
| `GET /settlements` | Returns the audit log of completed escrow settlements and contributor payouts. |
| `POST /admin/login` | Verifies the operator password against `process.env.ADMIN_PASSWORD` and issues a signed HMAC bearer token. |
| `GET /admin/overview` | Returns full enclave telemetry for the `/admin` operator console (requires bearer token). |
| `POST /admin/clear` | Clears all listings, escrows, tokens, queries, and settlements (requires bearer token). |
