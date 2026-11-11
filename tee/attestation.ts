import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getEnclaveKeyPair,
  sha256Bytes,
  sha256Hex,
  signWithEnclaveKey,
  verifyEd25519Signature,
} from './src/crypto.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ParsedMeasurement {
  measurement: string;
  reportDataHex: string;
  provider: 'phala-dstack' | 'near-ai-cloud' | 'self-hosted-enclave';
}

export interface AttestationResponse {
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

/**
 * Compute deterministic SHA-256 measurement over the enclave's core computation modules.
 */
function computeCodebaseMeasurement(): string {
  const filesToMeasure = [
    path.join(__dirname, 'src', 'crypto.ts'),
    path.join(__dirname, 'src', 'dp.ts'),
    path.join(__dirname, 'src', 'ml.ts'),
    path.join(__dirname, 'src', 'appraiser.ts'),
  ];
  const chunks: string[] = [];
  for (const filePath of filesToMeasure) {
    if (fs.existsSync(filePath)) {
      chunks.push(fs.readFileSync(filePath, 'utf8'));
    }
  }
  return sha256Hex(chunks.join('\n---ENCLAVE-MODULE-BOUNDARY---\n'));
}

/**
 * Return the 32-byte hex-encoded ed25519 public key held inside the enclave.
 */
export function getEnclavePubKey(): string {
  return getEnclaveKeyPair().publicKeyHex;
}

/**
 * Construct the 64-byte `report_data` field bound into the hardware quote:
 * bytes [0..31]  = SHA-256(nonce)
 * bytes [32..63] = 32-byte enclave ed25519 public key
 */
export function buildReportDataHex(nonce: string): string {
  const nonceHash = Buffer.from(sha256Bytes(nonce));
  const pubKeyBuf = Buffer.from(getEnclaveKeyPair().publicKey);
  return Buffer.concat([nonceHash, pubKeyBuf]).toString('hex');
}

/**
 * Fetch an attestation quote binding `nonce` and the enclave's ed25519 public key.
 * Supports:
 * 1. Phala dstack TDX unix domain socket (`/var/run/tappd.sock`)
 * 2. NEAR AI Cloud attestation endpoint (`NEAR_AI_ATTESTATION_URL`)
 * 3. Self-hosted enclave deterministic code measurement + ed25519 signed quote envelope
 */
export async function fetchQuoteByNonce(nonce: string): Promise<{
  quoteHex: string;
  provider: 'phala-dstack' | 'near-ai-cloud' | 'self-hosted-enclave';
}> {
  if (!nonce || nonce.trim().length === 0) {
    throw new Error('Attestation nonce is required');
  }

  const reportDataHex = buildReportDataHex(nonce);
  const providerEnv = process.env.TEE_PROVIDER || 'self-hosted-enclave';
  const dstackSocket = process.env.DSTACK_SOCKET_PATH || '/var/run/tappd.sock';

  // Path 1: Phala dstack Intel TDX socket
  if (providerEnv === 'phala-dstack' && fs.existsSync(dstackSocket)) {
    // VERIFY: https://docs.phala.network/dstack/attestation
    const quoteHex = await new Promise<string>((resolve, reject) => {
      const payload = JSON.stringify({ report_data: reportDataHex });
      const req = http.request(
        {
          socketPath: dstackSocket,
          path: '/prpc/Tappd.TdxQuote?json',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          },
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            try {
              const parsed = JSON.parse(body) as { quote?: string };
              if (!parsed.quote) {
                reject(new Error('Missing quote field from dstack Tappd.TdxQuote'));
                return;
              }
              resolve(parsed.quote.replace(/^0x/, ''));
            } catch (err) {
              reject(err);
            }
          });
        }
      );
      req.on('error', reject);
      req.write(payload);
      req.end();
    });

    return { quoteHex, provider: 'phala-dstack' };
  }

  // Path 2: NEAR AI Cloud TEE Attestation endpoint
  if (providerEnv === 'near-ai-cloud' && process.env.NEAR_AI_ATTESTATION_URL) {
    // VERIFY: https://docs.near.ai/cloud/attestation
    const resp = await fetch(process.env.NEAR_AI_ATTESTATION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nonce, report_data: reportDataHex }),
    });
    if (!resp.ok) {
      throw new Error(`NEAR AI Cloud attestation HTTP ${resp.status}`);
    }
    const data = (await resp.json()) as { quote: string };
    return {
      quoteHex: data.quote.replace(/^0x/, ''),
      provider: 'near-ai-cloud',
    };
  }

  // Path 3: Self-hosted enclave deterministic measurement + ed25519 signed quote envelope
  const codeMeasurement = computeCodebaseMeasurement();
  const envelopeObj = {
    version: 'sealed-enclave-v1',
    mrtd: codeMeasurement,
    reportData: reportDataHex,
    nonce,
    enclavePubKey: getEnclavePubKey(),
  };
  const quoteHex = Buffer.from(JSON.stringify(envelopeObj), 'utf8').toString('hex');
  return { quoteHex, provider: 'self-hosted-enclave' };
}

/**
 * Parse the enclave measurement (MRTD) and bound `report_data` from a quote.
 * Do not invent proprietary hardware offsets: mark hardware TDX v4 offsets with VERIFY.
 */
export function parseMeasurement(
  quoteHex: string,
  provider: 'phala-dstack' | 'near-ai-cloud' | 'self-hosted-enclave' = 'self-hosted-enclave'
): ParsedMeasurement {
  const cleanHex = quoteHex.replace(/^0x/, '');
  const rawBytes = Buffer.from(cleanHex, 'hex');

  if (provider === 'phala-dstack' || provider === 'near-ai-cloud') {
    // Intel TDX Quote v4 layout (48-byte Header + 584-byte TD Report10 body):
    // MRTD (48 bytes) is at byte offset 48 + 136 = 184..232; REPORTDATA (64 bytes) is at offset 48 + 520 = 568..632.
    // VERIFY: https://docs.phala.network/dstack/attestation
    // VERIFY: https://docs.near.ai/cloud/attestation
    if (rawBytes.length >= 632) {
      const mrtd = rawBytes.subarray(184, 232).toString('hex');
      const reportDataHex = rawBytes.subarray(568, 632).toString('hex');
      return { measurement: mrtd, reportDataHex, provider };
    }
  }

  // Parse self-hosted enclave JSON envelope
  const decodedJson = JSON.parse(rawBytes.toString('utf8')) as {
    mrtd: string;
    reportData: string;
  };
  return {
    measurement: decodedJson.mrtd,
    reportDataHex: decodedJson.reportData,
    provider: 'self-hosted-enclave',
  };
}

/**
 * Complete attestation workflow for `GET /attestation?nonce=`:
 * 1. Fetch quote by nonce
 * 2. Parse measurement & reportData
 * 3. Sign the attestation digest `sha256(measurement:enclavePubKey:nonce:quote)` with the enclave ed25519 key
 */
export async function getAttestation(nonce: string): Promise<AttestationResponse> {
  const { quoteHex, provider } = await fetchQuoteByNonce(nonce);
  const { measurement, reportDataHex } = parseMeasurement(quoteHex, provider);
  const enclavePubKey = getEnclavePubKey();
  const timestamp = Date.now();

  const messageBytes = sha256Bytes(`${measurement}:${enclavePubKey}:${nonce}:${quoteHex}`);
  const signature = signWithEnclaveKey(messageBytes);
  const attestationRef = `att_${sha256Hex(`${measurement}:${nonce}:${timestamp}`).slice(0, 16)}`;

  return {
    measurement,
    enclavePubKey,
    nonce,
    quote: quoteHex,
    attestationRef,
    provider,
    reportDataHex,
    signature,
    timestamp,
  };
}

/**
 * Verify an attestation response (checks nonce binding in reportData and ed25519 signature).
 */
export function verifyAttestation(
  att: AttestationResponse,
  expectedNonce: string
): { valid: boolean; reason?: string } {
  if (att.nonce !== expectedNonce) {
    return { valid: false, reason: 'Nonce mismatch in attestation response' };
  }
  const expectedReportDataPrefix = sha256Hex(expectedNonce);
  if (!att.reportDataHex.startsWith(expectedReportDataPrefix)) {
    return { valid: false, reason: 'Quote reportData does not bind sha256(nonce)' };
  }
  if (!att.reportDataHex.endsWith(att.enclavePubKey.toLowerCase())) {
    return { valid: false, reason: 'Quote reportData does not bind enclavePubKey' };
  }
  const messageBytes = sha256Bytes(
    `${att.measurement}:${att.enclavePubKey}:${att.nonce}:${att.quote}`
  );
  const sigOk = verifyEd25519Signature(att.signature, messageBytes, att.enclavePubKey);
  if (!sigOk) {
    return { valid: false, reason: 'Invalid ed25519 signature on attestation quote' };
  }
  return { valid: true };
}
