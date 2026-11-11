import * as ed from '@noble/ed25519';

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, '').trim();
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function sha256BytesBrowser(data: string | Uint8Array): Promise<Uint8Array> {
  const input = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const buf = await crypto.subtle.digest('SHA-256', input as BufferSource);
  return new Uint8Array(buf);
}

export async function sha256HexBrowser(data: string | Uint8Array): Promise<string> {
  const bytes = await sha256BytesBrowser(data);
  return bytesToHex(bytes);
}

/**
 * Generate a fresh 16-byte cryptographic hex nonce in the browser.
 */
export function generateFreshNonceHex(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return bytesToHex(arr);
}

/**
 * Verify a TEE Remote Attestation response client-side using `@noble/ed25519`:
 * 1. Confirms `reportDataHex` binds `sha256(nonce)` in bytes [0..31]
 * 2. Confirms `reportDataHex` binds `enclavePubKey` in bytes [32..63]
 * 3. Verifies the 64-byte `ed25519` signature over `sha256("{measurement}:{enclavePubKey}:{nonce}:{quote}")`
 */
export async function verifyAttestationClientSide(
  att: {
    measurement: string;
    enclavePubKey: string;
    nonce: string;
    quote: string;
    reportDataHex: string;
    signature: string;
  },
  expectedNonce: string
): Promise<{
  valid: boolean;
  nonceBound: boolean;
  pubKeyBound: boolean;
  signatureValid: boolean;
  reason?: string;
}> {
  if (att.nonce !== expectedNonce) {
    return {
      valid: false,
      nonceBound: false,
      pubKeyBound: false,
      signatureValid: false,
      reason: 'Attestation nonce mismatch',
    };
  }

  const expectedNonceHash = await sha256HexBrowser(expectedNonce);
  const nonceBound = att.reportDataHex.toLowerCase().startsWith(expectedNonceHash.toLowerCase());
  const pubKeyBound = att.reportDataHex
    .toLowerCase()
    .endsWith(att.enclavePubKey.toLowerCase());

  const messageBytes = await sha256BytesBrowser(
    `${att.measurement}:${att.enclavePubKey}:${att.nonce}:${att.quote}`
  );
  let signatureValid = false;
  try {
    signatureValid = await ed.verifyAsync(
      hexToBytes(att.signature),
      messageBytes,
      hexToBytes(att.enclavePubKey)
    );
  } catch {
    signatureValid = false;
  }

  const valid = nonceBound && pubKeyBound && signatureValid;
  return {
    valid,
    nonceBound,
    pubKeyBound,
    signatureValid,
    reason: valid ? undefined : 'Failed cryptographic verification of attestation quote',
  };
}

/**
 * Verify the TEE enclave's `ed25519` signature over an appraisal report's canonical payload
 * client-side using `@noble/ed25519`.
 */
export async function verifyAppraisalSignatureClientSide(params: {
  listingId: string;
  taskHash: string;
  score: number;
  priceLow: number;
  priceHigh: number;
  attestationRef: string;
  teePubkey: string;
  teeSig: string;
}): Promise<{ valid: boolean; canonicalPayload: string; reportHashHex: string }> {
  const canonicalPayload = `${params.listingId}:${params.taskHash}:${params.score.toFixed(4)}:${params.priceLow.toFixed(2)}:${params.priceHigh.toFixed(2)}:${params.attestationRef}`;
  const reportHashBytes = await sha256BytesBrowser(canonicalPayload);
  const reportHashHex = bytesToHex(reportHashBytes);

  try {
    const valid = await ed.verifyAsync(
      hexToBytes(params.teeSig),
      reportHashBytes,
      hexToBytes(params.teePubkey)
    );
    return { valid, canonicalPayload, reportHashHex };
  } catch {
    return { valid: false, canonicalPayload, reportHashHex };
  }
}

/**
 * Client-side AES-256-GCM encryption to the TEE enclave's attested public key.
 * Derives the 256-bit key via `SHA-256(enclavePubKeyHex + ":" + ephemeralSaltHex)`
 * and encrypts with WebCrypto `AES-GCM` (128-bit auth tag appended), matching `/tee`'s `decryptSealedUpload`.
 */
export async function encryptCsvToEnclaveClientSide(
  plaintextCsv: string,
  enclavePubKeyHex: string
): Promise<{
  ciphertextBase64: string;
  ivHex: string;
  ephemeralSaltHex: string;
  datasetHashHex: string;
  byteLength: number;
}> {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ephemeralSalt = new Uint8Array(16);
  crypto.getRandomValues(ephemeralSalt);

  const ivHex = bytesToHex(iv);
  const ephemeralSaltHex = bytesToHex(ephemeralSalt);
  const datasetHashHex = await sha256HexBrowser(plaintextCsv);

  const rawKeyBytes = await sha256BytesBrowser(
    `${enclavePubKeyHex.toLowerCase()}:${ephemeralSaltHex}`
  );
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    rawKeyBytes as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const encodedPlaintext = new TextEncoder().encode(plaintextCsv);
  const encryptedBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, tagLength: 128 },
    cryptoKey,
    encodedPlaintext as BufferSource
  );

  const encryptedBytes = new Uint8Array(encryptedBuf);
  return {
    ciphertextBase64: bytesToBase64(encryptedBytes),
    ivHex,
    ephemeralSaltHex,
    datasetHashHex,
    byteLength: encryptedBytes.byteLength,
  };
}
