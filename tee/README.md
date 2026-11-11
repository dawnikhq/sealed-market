# Sealed Market — TEE Appraiser & Differential Privacy Query Engine (`/tee`)

This service is the standalone confidential compute appraiser and differentially-private query engine for **Sealed Market**. It executes inside a Trusted Execution Environment (TEE) so that seller rows never leave the enclave in plaintext.

## Real Capabilities Performed Inside the Enclave

1. **Remote Attestation (`GET /attestation?nonce=<hex>`)**
   - Returns `{ measurement, enclavePubKey, nonce, quote, quoteFormat, signature, timestamp }` via the single [`attestation.ts`](./attestation.ts) adapter.
   - Binds the caller's fresh `nonce` and the enclave's `ed25519` public key into `report_data` (64 bytes: `sha256(nonce) || enclavePubKeyBytes`) inside the hardware quote.
2. **Client-to-Enclave Sealed Upload (`POST /upload`)**
   - Sellers encrypt their CSV client-side using AES-256-GCM with a key derived from the enclave's attested public key. The TEE decrypts and stores the dataset in enclave memory only.
3. **Private Dataset Appraisal (`POST /appraise`)**
   - Computes real quality sub-scores directly on the sealed rows:
     - **Completeness**: $1 - \text{nullRate}$ across all cells.
     - **Uniqueness**: $1 - \text{duplicateRate}$ using SHA-256 canonical row hashes.
     - **Freshness**: Exponential decay $\exp(-\Delta\text{days} / 180)$ from the dataset's maximum date vs reference date.
     - **Schema Fit**: Fraction of task-relevant numeric/target columns present with non-zero variance.
     - **Synthetic-Data Heuristic**: Column-level Shannon entropy $H(X) = -\sum p(x)\log_2 p(x)$ combined with adjacent repeat-pattern detection.
     - **Holdout Utility Delta (Try-Before-You-Buy)**: Trains an L2-regularized binary Logistic Regression model via batch gradient descent with feature z-score standardization on the seller's dataset and evaluates both **Accuracy** and **ROC-AUC** delta on the buyer's holdout CSV vs a prior baseline without the seller's data.
   - **Monte Carlo Shapley Split (Ghorbani & Zou, 2019)**: Samples $M$ random permutations of contributors, training the holdout logistic regression model on incremental coalitions $S \cup \{i\}$ to measure each contributor's marginal utility contribution $\phi_i$, normalized to basis points summing to `10000`.
   - **Cryptographic Signing**: Signs `sha256("{listing_id}:{task_hash}:{score:.4}:{price_low:.2}:{price_high:.2}:{attestation_ref}")` using `@noble/ed25519`. Verified both client-side and onchain via `near_sdk::env::ed25519_verify`.
4. **Differentially Private Query Engine (`POST /query`)**
   - Enforces a strict **$k$-anonymity guard ($k \ge 20$)**: any query whose predicate matches fewer than 20 rows is rejected (`400 K_ANONYMITY_VIOLATION`).
   - Enforces the per-listing **$\varepsilon$ privacy budget**: rejects queries when $\varepsilon_{\text{spent}} + \varepsilon_{\text{query}} > \varepsilon_{\text{budget}}$.
   - Adds **real Laplace noise** $\text{Lap}(\Delta f / \varepsilon)$ sampled from cryptographic randomness (`crypto.randomBytes`) scaled to query sensitivity $\Delta f$.

---

## Deployment Targets

### Option A: Phala Network `dstack` (Intel TDX CVM)
Phala `dstack` exposes `/var/run/tappd.sock` inside the confidential container for Intel TDX quote generation.
```bash
# Build and run inside a Phala dstack CVM with /var/run/tappd.sock mounted:
export TEE_PROVIDER="phala-dstack"
export DSTACK_SOCKET_PATH="/var/run/tappd.sock"
export PORT=3001
npm install
npm start
```

### Option B: NEAR AI Cloud TEE
> **VERIFY Confirmation (`// VERIFY: https://docs.near.ai/cloud/attestation`)**:
> Confirm whether NEAR AI Cloud TEE workers permit arbitrary Node.js/Python containers or restrict workloads to model inference endpoints. When deploying as a NEAR AI Cloud enclave container, set `TEE_PROVIDER="near-ai-cloud"` and `NEAR_AI_ATTESTATION_URL`:
```bash
export TEE_PROVIDER="near-ai-cloud"
export NEAR_AI_ATTESTATION_URL="http://127.0.0.1:8081/v1/attestation"
export PORT=3001
npm install
npm start
```

### Option C: Self-Hosted Intel TDX / AMD SEV-SNP Enclave (or Local Development)
When running on a self-hosted confidential VM with ConfigFS-TSM (`/sys/kernel/config/tsm/report`) or in local development, the service computes a deterministic SHA-256 code measurement over its own source files (`attestation.ts`, `src/appraiser.ts`, `src/dp.ts`, `src/ml.ts`, `src/crypto.ts`) and signs the attestation quote envelope with the enclave's `ed25519` key.
```bash
npm install
npm test
npm start
```
