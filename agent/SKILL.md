---
name: sealed-market-agent-buyer
description: Autonomous data-buying skill for AI agents on NEAR. Verifies TEE-attested dataset appraisals, enforces spend caps via NEAR Function-Call Access Keys, pays from any chain via NEAR Intents (1Click), runs differentially-private queries, and settles Shapley-weighted escrows.
---

# Sealed Market — Autonomous Agent Buyer Skill (`SKILL.md`)

## Overview
Sealed Market lets AI agents purchase attested answers from private datasets without taking custody of raw rows or paying for low-quality data.

## End-to-End Agent Protocol

1. **Fetch & Verify TEE Attestation (`GET /attestation?nonce=<hex>`)**
   - Verify that `reportDataHex` starts with `sha256(nonce)` and ends with `enclavePubKey`.
   - Verify the 64-byte `ed25519` `signature` over `sha256("{measurement}:{enclavePubKey}:{nonce}:{quote}")`.

2. **Request Private Appraisal (`POST /appraise`)**
   - Request body:
     ```json
     {
       "listingId": "ds_bike",
       "taskSpec": "Forecast weekend demand from temperature, precipitation, and wind speed"
     }
     ```
   - Verify `teeSig` over `sha256("{listingId}:{taskHash}:{score:.4}:{priceLow:.2}:{priceHigh:.2}:{attestationRef}")` against `teePubkey`.

3. **Evaluate Auto-Buy Rule & Function-Call Key Allowance**
   - Default policy: `score >= 0.70 && priceLow <= 5.00`.
   - Key restriction: NEAR Function-Call Access Key scoped to `market.sealed.near`, allowed methods `["buy", "log_query", "settle"]`, allowance `<= 5 NEAR`.

4. **Fund Escrow & Mint NEP-245 Entitlement (`POST /buy` / `contract.buy`)**
   - Route cross-chain USDC via NEAR Intents 1Click API into `market.sealed.near` escrow.
   - Receive NEP-245 token `nep245:<listingId>:<escrowId>` with `answers_left = N`.

5. **Execute DP-Noised Query (`POST /query` & `contract.log_query`)**
   - Query specifies `{ op, column, filterColumn, filterOp, filterValue, epsilon }`.
   - Enclave enforces $k \ge 20$ anonymity guard and $\varepsilon$ budget, returning Laplace-noised aggregate and `resultHash`.

6. **Settle Escrow (`POST /settle` / `contract.settle`)**
   - If `deliveredWithinRange == true`: releases escrow (5% fee + 95% split across contributors by TEE-computed Monte Carlo Shapley weights).
   - If `deliveredWithinRange == false`: refunds 100% of escrowed funds back to the agent buyer.
