import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Lock, LogOut, RefreshCw, Trash2 } from 'lucide-react';
import {
  adminClearState,
  adminLogin,
  adminLogout,
  fetchAdminOverview,
  settleEscrowOnchain,
  UnauthorizedError,
  type AdminOverview,
} from '../lib/api';
import { Button, Hash, KV, Pill, SealMark, Spinner, useToast } from '../ui/kit';

const SESSION_KEY = 'sealed_market_admin_token';

export const AdminApp: React.FC = () => {
  const toast = useToast();
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem(SESSION_KEY));
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(false);

  const loadOverview = useCallback(
    async (activeToken: string) => {
      setLoading(true);
      try {
        const data = await fetchAdminOverview(activeToken);
        setOverview(data);
      } catch (err) {
        if (err instanceof UnauthorizedError) {
          sessionStorage.removeItem(SESSION_KEY);
          setToken(null);
          setOverview(null);
        } else {
          toast('Failed to load overview', err instanceof Error ? err.message : 'Error', 'error');
        }
      } finally {
        setLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    if (token) {
      loadOverview(token);
    }
  }, [token, loadOverview]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setAuthError(null);
    try {
      const res = await adminLogin(password);
      sessionStorage.setItem(SESSION_KEY, res.token);
      setToken(res.token);
      setPassword('');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    if (token) await adminLogout(token);
    sessionStorage.removeItem(SESSION_KEY);
    setToken(null);
    setOverview(null);
  };

  const handleForceSettle = async (listingId: string, escrowId: string, release: boolean) => {
    if (!token) return;
    try {
      const s = await settleEscrowOnchain(
        { listingId, escrowId, deliveredWithinRange: release },
        token
      );
      toast(`Escrow ${s.outcome}`, `${escrowId} settled as ${s.id}`, 'success');
      await loadOverview(token);
    } catch (err) {
      toast('Settlement error', err instanceof Error ? err.message : 'Failed', 'error');
    }
  };

  const handleClearAll = async () => {
    if (!token) return;
    try {
      await adminClearState(token);
      toast('Enclave state cleared', 'Orders, queries, settlements and uploaded listings were wiped. Sample listings were re-sealed.', 'success');
      await loadOverview(token);
    } catch (err) {
      toast('Clear failed', err instanceof Error ? err.message : 'Failed', 'error');
    }
  };

  if (!token) {
    return (
      <div className="backdrop-grain flex min-h-screen items-center justify-center bg-card px-5 text-fg">
        <form
          onSubmit={handleLogin}
          className="surface w-full max-w-md animate-scale-in p-8 sm:p-10"
        >
          <div className="flex items-center justify-between">
            <SealMark className="h-7 w-7 text-fg" />
            <Pill tone="outline">
              <Lock className="h-3 w-3" /> /admin
            </Pill>
          </div>
          <h1 className="mt-6 font-display text-4xl tracking-tight">Operator console.</h1>
          <p className="mt-2 text-xs leading-relaxed text-ink-400">
            Enter the operator password configured on the TEE service (<code className="font-mono">ADMIN_PASSWORD</code>).
          </p>

          <div className="mt-6">
            <label className="label" htmlFor="admin-pw">
              Password
            </label>
            <input
              id="admin-pw"
              type="password"
              autoFocus
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field font-mono"
              placeholder="••••••••••••"
            />
          </div>

          {authError && (
            <div className="mt-4 rounded-2xl border border-fg/40 px-4 py-2.5 text-xs text-fg">
              {authError}
            </div>
          )}

          <div className="mt-6 flex items-center justify-between gap-3">
            <Button type="submit" loading={submitting} className="w-full">
              Unlock console
            </Button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="backdrop-grain min-h-screen bg-card text-fg">
      <header className="sticky top-0 z-30 border-b border-fg/10 bg-neutral-900/50 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <SealMark className="h-6 w-6" />
            <span className="text-sm font-medium">Sealed Market · Operator Console</span>
            <Pill tone="solid">Authenticated</Pill>
          </div>
          <div className="flex items-center gap-2.5">
            <a
              href="/"
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-fg/15 px-4 text-xs text-ink-200 transition hover:border-fg/40 hover:text-fg"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Public flow
            </a>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => loadOverview(token)}
              icon={<RefreshCw className="h-3.5 w-3.5" />}
            >
              Refresh
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleClearAll}
              icon={<Trash2 className="h-3.5 w-3.5" />}
            >
              Clear state
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleLogout}
              icon={<LogOut className="h-3.5 w-3.5" />}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-6 py-12">
        {loading && !overview ? (
          <div className="flex h-48 items-center justify-center gap-3 text-sm text-ink-400">
            <Spinner /> Loading enclave telemetry…
          </div>
        ) : (
          overview && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {[
                  { k: 'Sealed listings', v: overview.listings.length },
                  { k: 'Appraisals signed', v: overview.appraisalsCount },
                  { k: 'Escrows', v: overview.escrows.length },
                  { k: 'DP queries', v: overview.queries.length },
                  { k: 'Settlements', v: overview.settlements.length },
                ].map((m) => (
                  <div key={m.k} className="surface p-6">
                    <div className="eyebrow">{m.k}</div>
                    <div className="mt-2 font-display text-4xl tabular-nums">{m.v}</div>
                  </div>
                ))}
              </div>

              <div className="surface p-7">
                <div className="eyebrow">Enclave identity</div>
                <div className="mt-3">
                  <KV k="ed25519 public key">
                    <Hash value={overview.enclavePubKey} head={16} tail={12} />
                  </KV>
                </div>
              </div>

              <div className="surface p-7">
                <div className="eyebrow">Escrows ({overview.escrows.length})</div>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-fg/10 text-ink-400">
                      <tr>
                        <th className="py-2.5 pr-4">Escrow</th>
                        <th className="py-2.5 pr-4">Listing</th>
                        <th className="py-2.5 pr-4">Buyer</th>
                        <th className="py-2.5 pr-4">Amount</th>
                        <th className="py-2.5 pr-4">Status</th>
                        <th className="py-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-fg/[0.06] font-mono">
                      {overview.escrows.map((e) => (
                        <tr key={e.id}>
                          <td className="py-3 pr-4 text-fg">{e.id}</td>
                          <td className="py-3 pr-4 text-ink-200">{e.listing_id}</td>
                          <td className="py-3 pr-4 text-ink-300">{e.buyer}</td>
                          <td className="py-3 pr-4 text-fg">{e.amount_usdc.toFixed(2)} USDC</td>
                          <td className="py-3 pr-4">
                            <Pill tone={e.status === 'Funded' ? 'solid' : 'outline'}>{e.status}</Pill>
                          </td>
                          <td className="py-3 text-right">
                            {e.status === 'Funded' ? (
                              <div className="inline-flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleForceSettle(e.listing_id, e.id, true)}
                                  className="rounded-full bg-fg px-3 py-1 font-sans text-xs font-medium text-card"
                                >
                                  Release
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleForceSettle(e.listing_id, e.id, false)}
                                  className="rounded-full border border-fg/25 px-3 py-1 font-sans text-xs text-fg"
                                >
                                  Refund
                                </button>
                              </div>
                            ) : (
                              <span className="text-ink-500">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="surface p-7">
                  <div className="eyebrow">Listings & privacy budgets</div>
                  <div className="mt-4 space-y-3">
                    {overview.listings.map((l) => (
                      <div key={l.id} className="rounded-3xl border border-fg/10 p-4 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-fg">{l.id}</span>
                          <span className="font-mono text-ink-300">
                            score {l.latest_score?.toFixed(2) ?? '—'} · ε {l.epsilon_spent.toFixed(2)}/{l.epsilon_budget.toFixed(2)}
                          </span>
                        </div>
                        <div className="mt-1 text-ink-400">{l.title}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="surface p-7">
                  <div className="eyebrow">Gasless accounts ({overview.accounts.length})</div>
                  <div className="mt-4 space-y-2.5">
                    {overview.accounts.length === 0 ? (
                      <div className="text-xs text-ink-500">No NEP-366 accounts provisioned yet in this session.</div>
                    ) : (
                      overview.accounts.map((a) => (
                        <div key={a.accountId} className="flex items-center justify-between rounded-2xl border border-fg/10 px-4 py-2.5 text-xs">
                          <span className="font-mono text-fg">{a.accountId}</span>
                          <Hash value={a.publicKey} head={10} tail={6} />
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </>
          )
        )}
      </main>
    </div>
  );
};
