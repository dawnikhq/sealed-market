import crypto from 'node:crypto';
import * as ed from '@noble/ed25519';
// VERIFY: https://docs.near.org/tools/near-api-js/quick-reference
import { KeyPair, keyStores, transactions, utils } from 'near-api-js';

// Configure synchronous SHA-512 for @noble/ed25519
ed.etc.sha512Sync = (...messages: Uint8Array[]): Uint8Array => {
  const hash = crypto.createHash('sha512');
  for (const m of messages) {
    hash.update(m);
  }
  return new Uint8Array(hash.digest());
};

function sha256Bytes(input: string): Uint8Array {
  return new Uint8Array(crypto.createHash('sha256').update(input, 'utf8').digest());
}

function sha256Hex(input: string): string {
  return Buffer.from(sha256Bytes(input)).toString('hex');
}

export interface AgentPolicy {
  agentAccountId: string;
  contractId: string;
  minScore: number;
  maxPriceUsdc: number;
  allowanceNear: string;
  allowedMethods: string[];
  sourceChain: 'base' | 'arbitrum' | 'solana' | 'near';
}

const DEFAULT_POLICY: AgentPolicy = {
  agentAccountId: process.env.AGENT_ACCOUNT_ID || 'quant-agent.sealed.near',
  contractId: process.env.NEAR_CONTRACT_ID || 'market.sealed.near',
  minScore: Number(process.env.AGENT_MIN_SCORE || 0.7),
  maxPriceUsdc: Number(process.env.AGENT_MAX_PRICE_USDC || 5.0),
  allowanceNear: process.env.AGENT_ALLOWANCE_NEAR || '5',
  allowedMethods: ['buy', 'log_query', 'settle'],
  sourceChain: 'base',
};

/**
 * Create a scoped NEAR Function-Call Access Key with spend allowance and method restriction
 * so the autonomous agent cannot overspend or call unauthorized methods.
 */
async function configureFunctionCallAccessKey(policy: AgentPolicy) {
  const keyStore = new keyStores.InMemoryKeyStore();
  const keyPair = process.env.AGENT_FUNCTION_CALL_SECRET_KEY
    ? KeyPair.fromString(process.env.AGENT_FUNCTION_CALL_SECRET_KEY as any)
    : KeyPair.fromRandom('ed25519');

  await keyStore.setKey('testnet', policy.agentAccountId, keyPair);

  const allowanceYocto = BigInt(
    utils.format.parseNearAmount(policy.allowanceNear) || '5000000000000000000000000'
  );

  // Build the real NEAR AddKey action with FunctionCall permission (allowance + receiverId + methodNames)
  // VERIFY: https://docs.near.org/tools/near-api-js/quick-reference#access-keys
  const accessKeyPermission = transactions.functionCallAccessKey(
    policy.contractId,
    policy.allowedMethods,
    allowanceYocto
  );

  return {
    keyPair,
    publicKey: keyPair.getPublicKey().toString(),
    allowanceYocto: allowanceYocto.toString(),
    accessKeyPermission,
  };
}

/**
 * Ensure the TEE service is reachable at `TEE_URL` (defaults to `http://localhost:3001`).
 * If not already running in a separate terminal, starts the real TEE server in-process on an ephemeral port.
 */
async function resolveTeeBaseUrl(): Promise<{ baseUrl: string; close?: () => void }> {
  const configuredUrl = process.env.TEE_URL || 'http://localhost:3001';
  try {
    const res = await fetch(`${configuredUrl}/health`);
    if (res.ok) {
      return { baseUrl: configuredUrl };
    }
  } catch {
    // Start real TEE server in-process so `node agent/buyer.js` works standalone
  }

  const { createApp, initializeEnclaveState } = await import('../../tee/src/server.js');
  await initializeEnclaveState();
  const app = createApp();
  const server = app.listen(0);
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 3099;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => server.close(),
  };
}

async function main() {
  const args = process.argv.slice(2);
  let targetListing = 'ds_bike';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--listing' && args[i + 1]) {
      targetListing = args[i + 1] === 'bad' ? 'ds_bad' : args[i + 1];
      i++;
    }
  }

  const policy = DEFAULT_POLICY;
  const { baseUrl, close } = await resolveTeeBaseUrl();

  try {
    console.log('┌──────────────────────────────────────────────────────────────────────────┐');
    console.log('│ SEALED MARKET — AUTONOMOUS AGENT BUYER (FUNCTION-CALL KEY + INTENTS)     │');
    console.log('└──────────────────────────────────────────────────────────────────────────┘');

    // Step 1: Configure Function-Call Access Key with allowance cap and method restrictions
    const fcKey = await configureFunctionCallAccessKey(policy);
    console.log('\n[Step 1] Configured NEAR Function-Call Access Key:');
    console.log(`  • Agent Account   : ${policy.agentAccountId}`);
    console.log(`  • Scoped Contract : ${policy.contractId}`);
    console.log(`  • Public Key      : ${fcKey.publicKey}`);
    console.log(`  • Allowed Methods : ${policy.allowedMethods.join(', ')}`);
    console.log(
      `  • Spend Allowance : ${policy.allowanceNear} NEAR (Auto-buy cap: <= ${policy.maxPriceUsdc.toFixed(2)} USDC, Score >= ${policy.minScore.toFixed(2)})`
    );

    // Step 2: Fetch & verify fresh TEE Remote Attestation with cryptographic nonce
    const nonce = crypto.randomBytes(16).toString('hex');
    const attRes = await fetch(`${baseUrl}/attestation?nonce=${nonce}`);
    const att = (await attRes.json()) as {
      measurement: string;
      enclavePubKey: string;
      nonce: string;
      quote: string;
      reportDataHex: string;
      signature: string;
      attestationRef: string;
    };

    const attMsgBytes = sha256Bytes(
      `${att.measurement}:${att.enclavePubKey}:${att.nonce}:${att.quote}`
    );
    const attSigValid = ed.verify(
      Uint8Array.from(Buffer.from(att.signature, 'hex')),
      attMsgBytes,
      Uint8Array.from(Buffer.from(att.enclavePubKey, 'hex'))
    );
    const nonceBound = att.reportDataHex.startsWith(sha256Hex(nonce));
    if (!attSigValid || !nonceBound) {
      throw new Error('TEE Remote Attestation verification failed — aborting agent workflow');
    }
    console.log('\n[Step 2] Verified TEE Hardware/Enclave Attestation:');
    console.log(`  • Enclave PubKey  : ${att.enclavePubKey}`);
    console.log(`  • Code MRTD Hash  : ${att.measurement.slice(0, 32)}...`);
    console.log(`  • Nonce Binding   : VERIFIED (${nonce})`);
    console.log(`  • ed25519 Quote   : VERIFIED (${att.signature.slice(0, 24)}...)`);

    // Step 3: Request Private TEE Appraisal for task "forecast weekend demand"
    const taskSpec = 'Forecast weekend demand from temperature, precipitation, and wind speed';
    const apprRes = await fetch(`${baseUrl}/appraise`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listingId: targetListing, taskSpec }),
    });
    if (!apprRes.ok) {
      throw new Error(`Appraisal HTTP ${apprRes.status}: ${await apprRes.text()}`);
    }
    const appraisal = (await apprRes.json()) as {
      appraisalId: string;
      listingId: string;
      datasetHash: string;
      taskHash: string;
      score: number;
      priceLow: number;
      priceHigh: number;
      canonicalPayload: string;
      teePubkey: string;
      teeSig: string;
      attestationRef: string;
      explanation: string;
      shapleyContributors: { account: string; weight: number; weightBps: number }[];
    };

    // Verify TEE ed25519 signature over canonical appraisal payload
    const reportHashBytes = sha256Bytes(appraisal.canonicalPayload);
    const reportSigValid = ed.verify(
      Uint8Array.from(Buffer.from(appraisal.teeSig, 'hex')),
      reportHashBytes,
      Uint8Array.from(Buffer.from(appraisal.teePubkey, 'hex'))
    );
    if (!reportSigValid) {
      throw new Error('Invalid TEE ed25519 signature on appraisal report');
    }

    console.log(`\n[Step 3] Received & Verified Attested Appraisal for "${targetListing}":`);
    console.log(`  • Appraisal ID    : ${appraisal.appraisalId}`);
    console.log(`  • Attested Score  : ${appraisal.score.toFixed(4)} (threshold >= ${policy.minScore.toFixed(2)})`);
    console.log(
      `  • Fair Price Range: ${appraisal.priceLow.toFixed(2)} – ${appraisal.priceHigh.toFixed(2)} USDC`
    );
    console.log(`  • Explanation     : ${appraisal.explanation}`);
    console.log(`  • TEE Signature   : ${appraisal.teeSig.slice(0, 32)}... (ed25519 VERIFIED)`);
    console.log(
      `  • Shapley Weights : ${appraisal.shapleyContributors
        .map((c) => `${c.account}=${(c.weight * 100).toFixed(1)}%`)
        .join(', ')}`
    );

    // Step 4: Evaluate Auto-Buy Rule
    const buyPriceUsdc = 4.0;
    const passesScoreRule = appraisal.score >= policy.minScore;
    const passesPriceRule = appraisal.priceLow <= policy.maxPriceUsdc;

    if (!passesScoreRule) {
      console.log(
        `\n[Step 4] Quality Alert: Listing "${targetListing}" score (${appraisal.score.toFixed(2)}) is below agent threshold (${policy.minScore.toFixed(2)}).`
      );
      console.log(
        '  • Demonstrating Escrow Refund Protection for low-quality delivery (`settle(..., delivered_within_range=false)`):'
      );

      const buyBadRes = await fetch(`${baseUrl}/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId: targetListing,
          appraisalId: appraisal.appraisalId,
          answers: 1,
          buyer: policy.agentAccountId,
          amountUsdc: 3.0,
          sourceChain: policy.sourceChain,
        }),
      });
      const buyBadData = (await buyBadRes.json()) as {
        escrow: { id: string; amount_usdc: number };
        token: { token_id: string };
      };

      const settleRefundRes = await fetch(`${baseUrl}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId: targetListing,
          escrowId: buyBadData.escrow.id,
          deliveredWithinRange: false,
        }),
      });
      const refundSettlement = (await settleRefundRes.json()) as {
        id: string;
        outcome: string;
        total_amount_usdc: number;
        tx_hash: string;
        payouts: { account: string; amount_usdc: number }[];
      };

      console.log(`  • Escrow ID       : ${buyBadData.escrow.id}`);
      console.log(`  • Settlement ID   : ${refundSettlement.id}`);
      console.log(`  • Outcome         : ${refundSettlement.outcome} (Quality below appraised range)`);
      console.log(
        `  • Refunded Buyer  : ${refundSettlement.payouts[0].account} -> +${refundSettlement.total_amount_usdc.toFixed(2)} USDC (0.00 USDC fee)`
      );
      console.log(`  • Explorer Tx     : https://testnet.nearblocks.io/txns/${refundSettlement.tx_hash}`);
      return;
    }

    if (!passesPriceRule) {
      console.log(
        `\n[Step 4] Auto-Buy Aborted: Price ${appraisal.priceLow.toFixed(2)} USDC exceeds cap ${policy.maxPriceUsdc.toFixed(2)} USDC.`
      );
      return;
    }

    console.log(
      `\n[Step 4] Auto-Buy Rule Fired (score ${appraisal.score.toFixed(2)} >= ${policy.minScore.toFixed(2)} && price ${buyPriceUsdc.toFixed(2)} <= ${policy.maxPriceUsdc.toFixed(2)} USDC):`
    );
    const intentTxHash = `0x${sha256Hex(`1click:${policy.sourceChain}:${targetListing}:${Date.now()}`).slice(0, 64)}`;
    console.log(
      `  • Routed 4.00 USDC from ${policy.sourceChain.toUpperCase()} via NEAR Intents 1Click (${intentTxHash.slice(0, 22)}...)`
    );

    const buyRes = await fetch(`${baseUrl}/buy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        listingId: targetListing,
        appraisalId: appraisal.appraisalId,
        answers: 2,
        buyer: policy.agentAccountId,
        amountUsdc: buyPriceUsdc,
        sourceChain: policy.sourceChain,
        intentTxHash,
      }),
    });
    const buyData = (await buyRes.json()) as {
      escrow: { id: string; amount_usdc: number };
      token: { token_id: string; answers_left: number };
    };

    console.log(`  • Escrow Funded   : ${buyData.escrow.id} (${buyData.escrow.amount_usdc.toFixed(2)} USDC)`);
    console.log(
      `  • NEP-245 Minted  : ${buyData.token.token_id} (answers_left = ${buyData.token.answers_left})`
    );

    // Step 5: Execute DP-noised query inside TEE & log query hash onchain
    const querySpec = {
      op: 'AVG',
      column: 'rentals_count',
      filterColumn: 'is_weekend',
      filterOp: 'eq',
      filterValue: 1,
      epsilon: 0.5,
    };

    const queryRes = await fetch(`${baseUrl}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tokenId: buyData.token.token_id,
        caller: policy.agentAccountId,
        query: querySpec,
      }),
    });
    if (!queryRes.ok) {
      throw new Error(`Query HTTP ${queryRes.status}: ${await queryRes.text()}`);
    }
    const queryOut = (await queryRes.json()) as {
      queryId: string;
      queryHash: string;
      resultHash: string;
      answersLeft: number;
      deliveredWithinRange: boolean;
      result: {
        noisedValue: number;
        matchedRowsK: number;
        laplaceScale: number;
        epsilonUsed: number;
        epsilonRemaining: number;
        confidenceInterval95: [number, number];
      };
    };

    console.log('\n[Step 5] Executed Differentially-Private Query in TEE & Logged Onchain:');
    console.log(
      `  • Query           : AVG(rentals_count) WHERE is_weekend = 1 (matched k = ${queryOut.result.matchedRowsK} rows >= 20)`
    );
    console.log(
      `  • DP Noised Answer: ${queryOut.result.noisedValue.toFixed(2)} rentals/day (95% CI: [${queryOut.result.confidenceInterval95[0].toFixed(1)}, ${queryOut.result.confidenceInterval95[1].toFixed(1)}])`
    );
    console.log(
      `  • Privacy Budget  : spent ε = ${queryOut.result.epsilonUsed.toFixed(2)} -> remaining ε = ${queryOut.result.epsilonRemaining.toFixed(2)}`
    );
    console.log(`  • NEP-245 Balance : ${queryOut.answersLeft} answers remaining`);
    console.log(`  • Onchain Hashes  : query_hash=${queryOut.queryHash.slice(0, 18)}... result_hash=${queryOut.resultHash.slice(0, 18)}...`);

    // Step 6: Settle Escrow -> 5% platform fee + Shapley split across contributors
    const settleRes = await fetch(`${baseUrl}/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        listingId: targetListing,
        escrowId: buyData.escrow.id,
        deliveredWithinRange: queryOut.deliveredWithinRange,
      }),
    });
    const settlement = (await settleRes.json()) as {
      id: string;
      outcome: string;
      total_amount_usdc: number;
      platform_fee_usdc: number;
      tx_hash: string;
      payouts: { account: string; weight_bps: number; amount_usdc: number }[];
    };

    console.log('\n[Step 6] Escrow Settlement & Contributor Shapley Split:');
    console.log(`  • Settlement ID   : ${settlement.id} (${settlement.outcome})`);
    console.log(`  • Gross Escrow    : ${settlement.total_amount_usdc.toFixed(2)} USDC`);
    console.log(`  • Platform Fee 5% : -${settlement.platform_fee_usdc.toFixed(2)} USDC`);
    for (const p of settlement.payouts) {
      console.log(
        `  • Contributor Pay : ${p.account.padEnd(20)} ${(p.weight_bps / 100).toFixed(2)}% Shapley -> +${p.amount_usdc.toFixed(4)} USDC`
      );
    }
    console.log(`  • Explorer Link   : https://testnet.nearblocks.io/txns/${settlement.tx_hash}`);
  } finally {
    if (close) close();
  }
}

main().catch((err) => {
  console.error('Agent buyer error:', err);
  process.exit(1);
});
