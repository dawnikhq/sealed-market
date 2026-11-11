import crypto from 'node:crypto';
import * as ed from '@noble/ed25519';

// Configure synchronous SHA-512 for @noble/ed25519 v2.x using Node's native OpenSSL crypto
ed.etc.sha512Sync = (...messages: Uint8Array[]): Uint8Array => {
  const hash = crypto.createHash('sha512');
  for (const m of messages) {
    hash.update(m);
  }
  return new Uint8Array(hash.digest());
};

// Default deterministic 32-byte enclave secret key (matches contract test key unless overridden via TEE_SECRET_KEY_HEX)
const DEFAULT_ENCLAVE_SECRET_HEX =
  '421199abcdef0123456789101112131415161718192021222324252627282930';

export interface EnclaveKeyPair {
  secretKey: Uint8Array;
  publicKey: Uint8Array;
  publicKeyHex: string;
}

let cachedKeyPair: EnclaveKeyPair | null = null;

export function getEnclaveKeyPair(): EnclaveKeyPair {
  if (cachedKeyPair) {
    return cachedKeyPair;
  }
  const secretHex = process.env.TEE_SECRET_KEY_HEX || DEFAULT_ENCLAVE_SECRET_HEX;
  const secretKey = Uint8Array.from(Buffer.from(secretHex, 'hex'));
  if (secretKey.length !== 32) {
    throw new Error('TEE_SECRET_KEY_HEX must be a 32-byte (64 hex chars) ed25519 seed');
  }
  const publicKey = ed.getPublicKey(secretKey);
  const publicKeyHex = Buffer.from(publicKey).toString('hex');
  cachedKeyPair = { secretKey, publicKey, publicKeyHex };
  return cachedKeyPair;
}

export function sha256Bytes(data: string | Uint8Array): Uint8Array {
  const hash = crypto.createHash('sha256');
  hash.update(typeof data === 'string' ? Buffer.from(data, 'utf8') : data);
  return new Uint8Array(hash.digest());
}

export function sha256Hex(data: string | Uint8Array): string {
  return Buffer.from(sha256Bytes(data)).toString('hex');
}

/**
 * Sign arbitrary message bytes with the enclave's ed25519 private key.
 * Returns a 64-byte signature encoded as 128 lowercase hex characters.
 */
export function signWithEnclaveKey(messageBytes: Uint8Array): string {
  const { secretKey } = getEnclaveKeyPair();
  const sig = ed.sign(messageBytes, secretKey);
  return Buffer.from(sig).toString('hex');
}

/**
 * Verify an ed25519 signature (hex) over messageBytes against a 32-byte public key (hex).
 */
export function verifyEd25519Signature(
  signatureHex: string,
  messageBytes: Uint8Array,
  publicKeyHex: string
): boolean {
  try {
    const sigBytes = Uint8Array.from(Buffer.from(signatureHex, 'hex'));
    const pubBytes = Uint8Array.from(Buffer.from(publicKeyHex, 'hex'));
    if (sigBytes.length !== 64 || pubBytes.length !== 32) {
      return false;
    }
    return ed.verify(sigBytes, messageBytes, pubBytes);
  } catch {
    return false;
  }
}

/**
 * Build the canonical appraisal payload string verified both client-side and onchain in `record_appraisal`.
 */
export function buildCanonicalAppraisalPayload(params: {
  listingId: string;
  taskHash: string;
  score: number;
  priceLow: number;
  priceHigh: number;
  attestationRef: string;
}): string {
  return `${params.listingId}:${params.taskHash}:${params.score.toFixed(4)}:${params.priceLow.toFixed(2)}:${params.priceHigh.toFixed(2)}:${params.attestationRef}`;
}

/**
 * Decrypt an AES-256-GCM sealed dataset payload uploaded by a seller who encrypted
 * their CSV client-side to the enclave's attested public key + ephemeral salt.
 */
export function decryptSealedUpload(params: {
  ciphertextBase64: string;
  ivHex: string;
  ephemeralSaltHex: string;
}): string {
  const { publicKeyHex } = getEnclaveKeyPair();
  // Derive the symmetric 256-bit wrapping key from the attested enclave pubkey and client ephemeral salt
  // using SHA-256(enclavePubKeyHex + ":" + ephemeralSaltHex) so WebCrypto in the browser and Node crypto match identically.
  const keyMaterial = sha256Bytes(`${publicKeyHex}:${params.ephemeralSaltHex}`);
  const iv = Buffer.from(params.ivHex, 'hex');
  const rawBuf = Buffer.from(params.ciphertextBase64, 'base64');
  if (rawBuf.length < 16) {
    throw new Error('Invalid AES-256-GCM ciphertext: missing 16-byte authentication tag');
  }
  const ciphertext = rawBuf.subarray(0, rawBuf.length - 16);
  const authTag = rawBuf.subarray(rawBuf.length - 16);

  const decipher = crypto.createDecipheriv('aes-256-gcm', keyMaterial, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Encrypt plaintext CSV to the enclave key (used by tests and CLI uploader; matches WebCrypto browser implementation).
 */
export function encryptForEnclave(plaintextCsv: string, enclavePubKeyHex?: string): {
  ciphertextBase64: string;
  ivHex: string;
  ephemeralSaltHex: string;
} {
  const pubHex = enclavePubKeyHex || getEnclaveKeyPair().publicKeyHex;
  const iv = crypto.randomBytes(12);
  const ephemeralSalt = crypto.randomBytes(16);
  const ivHex = iv.toString('hex');
  const ephemeralSaltHex = ephemeralSalt.toString('hex');

  const keyMaterial = sha256Bytes(`${pubHex}:${ephemeralSaltHex}`);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyMaterial, iv);
  const encrypted = Buffer.concat([cipher.update(plaintextCsv, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const combined = Buffer.concat([encrypted, authTag]);

  return {
    ciphertextBase64: combined.toString('base64'),
    ivHex,
    ephemeralSaltHex,
  };
}
