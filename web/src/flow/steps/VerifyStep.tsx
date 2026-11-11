import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { fetchAttestation } from '../../lib/api';
import { generateFreshNonceHex, verifyAttestationClientSide } from '../../lib/crypto';
import { Button, CheckLine, Hash, KV, Pill } from '../../ui/kit';
import type { VerifiedEnclave } from '../types';

export const VerifyStep: React.FC<{
  enclave: VerifiedEnclave | null;
  onVerified: (v: VerifiedEnclave | null) => void;
  onContinue: () => void;
}> = ({ enclave, onVerified, onContinue }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingNonce, setPendingNonce] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    const nonce = generateFreshNonceHex();
    setPendingNonce(nonce);
    try {
      const attestation = await fetchAttestation(nonce);
      const check = await verifyAttestationClientSide(attestation, nonce);
      onVerified({ attestation, check });
    } catch (err) {
      onVerified(null);
      setError(err instanceof Error ? err.message : 'Could not reach the secure vault');
    } finally {
      setLoading(false);
    }
  }, [onVerified]);

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!enclave) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const check = loading ? null : enclave?.check ?? null;
  const att = enclave?.attestation;

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-white">Security & Privacy Guarantee</div>
            <p className="mt-1 text-xs text-ink-300">
              Your browser just checked that our private vault is genuine and hasn&apos;t been tampered with.
            </p>
          </div>
          {loading ? (
            <Pill tone="muted">Checking security…</Pill>
          ) : enclave?.check.valid ? (
            <Pill tone="solid">Verified & Secure</Pill>
          ) : (
            <Pill>Check needed</Pill>
          )}
        </div>

        <div className="mt-5 space-y-3 border-t border-white/[0.08] pt-5">
          <CheckLine ok={check ? check.nonceBound : null} delay={0}>
            Live connection is fresh (not a replay)
          </CheckLine>
          <CheckLine ok={check ? check.pubKeyBound : null} delay={100}>
            Encryption key belongs to the secure vault
          </CheckLine>
          <CheckLine ok={check ? check.signatureValid : null} delay={200}>
            Digital signature verified in your browser
          </CheckLine>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl border border-white/30 px-4 py-3 text-xs text-ink-100">
            {error}. Make sure the backend is running on port 3001.
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={onContinue} disabled={!enclave?.check.valid || loading}>
            Done
          </Button>
          <Button
            variant="secondary"
            onClick={run}
            loading={loading}
            icon={<RefreshCw className="h-4 w-4" />}
          >
            Run check again
          </Button>
        </div>
      </div>

      {att && (
        <details className="group rounded-3xl border border-white/10 bg-white/[0.02] px-6 py-4">
          <summary className="cursor-pointer list-none text-xs font-medium text-ink-300 transition hover:text-white">
            View technical security certificate (TEE / ed25519)
          </summary>
          <div className="mt-4 divide-y divide-white/[0.06] border-t border-white/[0.06] pt-2">
            <KV k="Browser challenge (nonce)">
              <Hash value={att.nonce ?? pendingNonce ?? ''} head={10} tail={6} />
            </KV>
            <KV k="Vault code fingerprint (MRTD)">
              <Hash value={att.measurement} />
            </KV>
            <KV k="Vault public key (ed25519)">
              <Hash value={att.enclavePubKey} />
            </KV>
            <KV k="Signature">
              <Hash value={att.signature} />
            </KV>
            <KV k="Certificate ID">
              <span className="font-mono text-xs">{att.attestationRef}</span>
            </KV>
          </div>
        </details>
      )}
    </div>
  );
};
