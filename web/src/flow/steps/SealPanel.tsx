import React, { useMemo, useState } from 'react';
import { ArrowRight, Check, FileSpreadsheet, FileUp, Lock, Plus, Trash2 } from 'lucide-react';
import {
  createGaslessNamedAccount,
  uploadEncryptedDatasetAndPublish,
  type Contributor,
  type ViewPrice,
} from '../../lib/api';
import { encryptCsvToEnclaveClientSide } from '../../lib/crypto';
import { Button, cx, Hash, KV, Pill, useToast } from '../../ui/kit';

type Sub = 1 | 2 | 3;

interface NamedAccount {
  accountId: string;
  datasetSubaccountId: string;
  publicKey: string;
  metaTxHash: string;
  relayerSponsor: string;
  gasSponsoredNear: string;
}

interface Sealed {
  ciphertextBase64: string;
  ivHex: string;
  ephemeralSaltHex: string;
  datasetHashHex: string;
  byteLength: number;
}

function contributorsFromCsv(csv: string, fallbackAccount: string): Contributor[] {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [{ account: fallbackAccount, rows: 0 }];
  const headers = lines[0].split(',').map((h) => h.trim());
  const idx = headers.indexOf('contributor');
  if (idx < 0) return [{ account: fallbackAccount, rows: lines.length - 1 }];
  const counts = new Map<string, number>();
  for (const line of lines.slice(1)) {
    const acct = (line.split(',')[idx] || '').trim() || fallbackAccount;
    counts.set(acct, (counts.get(acct) || 0) + 1);
  }
  return Array.from(counts.entries()).map(([account, rows]) => ({ account, rows }));
}

export const SealPanel: React.FC<{
  enclavePubKey: string | null;
  onAccountCreated?: (accountId: string) => void;
  onPublished: (listingId: string) => Promise<void>;
}> = ({ enclavePubKey, onAccountCreated, onPublished }) => {
  const toast = useToast();
  const [sub, setSub] = useState<Sub>(1);

  // 1 · real seller email & dataset slug (no pre-filled mock data)
  const [email, setEmail] = useState('');
  const [slug, setSlug] = useState('');
  const [account, setAccount] = useState<NamedAccount | null>(null);
  const [creating, setCreating] = useState(false);

  // 2 · real user CSV file
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [sealed, setSealed] = useState<Sealed | null>(null);
  const [encrypting, setEncrypting] = useState(false);

  // 3 · real pricing & terms
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [views, setViews] = useState<ViewPrice[]>([{ name: 'standard_answer', price_usdc: 4.0 }]);
  const [epsilon, setEpsilon] = useState(3.0);
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [publishing, setPublishing] = useState(false);

  const onFile = async (file: File) => {
    const text = await file.text();
    setFileName(file.name);
    setCsvText(text);
    const cleanTitle = file.name.replace(/\.csv$/i, '').replace(/[_-]+/g, ' ');
    if (!title) setTitle(cleanTitle);
    if (!slug) {
      setSlug(
        file.name
          .replace(/\.csv$/i, '')
          .toLowerCase()
          .replace(/[^a-z0-9_]/g, '_')
          .slice(0, 24)
      );
    }
    setContributors(contributorsFromCsv(text, account?.accountId || 'seller.sealed.near'));
    setSealed(null);
  };

  const preview = useMemo(() => {
    const lines = csvText.trim().split(/\r?\n/).filter(Boolean);
    return {
      header: (lines[0] || '').split(',').filter(Boolean),
      rows: lines.slice(1, 6).map((l) => l.split(',')),
      total: Math.max(0, lines.length - 1),
    };
  }, [csvText]);

  const createAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setCreating(true);
    try {
      const res = await createGaslessNamedAccount({
        email: email.trim(),
        datasetSlug: slug.trim() || undefined,
      });
      setAccount(res);
      try {
        localStorage.setItem('sealed_market_user_account', res.accountId);
      } catch {
        // ignore storage errors
      }
      onAccountCreated?.(res.accountId);
      setContributors([{ account: res.accountId, rows: preview.total || 1 }]);
      toast('Seller account created', `Your account ${res.accountId} is ready.`, 'success');
      setSub(2);
    } catch (err) {
      toast('Could not create profile', err instanceof Error ? err.message : 'Failed', 'error');
    } finally {
      setCreating(false);
    }
  };

  const encrypt = async () => {
    if (!enclavePubKey) {
      toast('Security check still running', 'Wait a moment and try again.', 'error');
      return;
    }
    if (!csvText.trim() || preview.total === 0) {
      toast('Upload a CSV file first', 'Please select a CSV file with header and data rows.', 'error');
      return;
    }
    setEncrypting(true);
    try {
      const out = await encryptCsvToEnclaveClientSide(csvText, enclavePubKey);
      setSealed(out);
      setContributors(contributorsFromCsv(csvText, account?.accountId || 'seller.sealed.near'));
      toast('File locked in your browser', 'Nobody can ever view or download your raw rows.', 'success');
    } catch (err) {
      toast('Could not lock file', err instanceof Error ? err.message : 'Encryption error', 'error');
    } finally {
      setEncrypting(false);
    }
  };

  const publish = async () => {
    if (!sealed) return;
    setPublishing(true);
    try {
      const out = await uploadEncryptedDatasetAndPublish({
        listingId: slug.trim() || undefined,
        title: title.trim() || fileName || 'Encrypted Dataset',
        description:
          description.trim() ||
          `Encrypted CSV dataset (${preview.total} rows) locked to the private vault.`,
        sellerAccount: account?.accountId || 'seller.sealed.near',
        ciphertextBase64: sealed.ciphertextBase64,
        ivHex: sealed.ivHex,
        ephemeralSaltHex: sealed.ephemeralSaltHex,
        views,
        epsilonBudget: epsilon,
        contributors:
          contributors.length > 0
            ? contributors
            : [{ account: account?.accountId || 'seller.sealed.near', rows: preview.total }],
      });
      toast(
        'Dataset published!',
        `"${out.listing.title}" is now live with a ${Math.round(out.appraisal.score * 100)}% quality score.`,
        'success'
      );
      await onPublished(out.listing.id);
    } catch (err) {
      toast('Could not publish', err instanceof Error ? err.message : 'Upload error', 'error');
    } finally {
      setPublishing(false);
    }
  };

  const subs: { n: Sub; label: string; enabled: boolean }[] = [
    { n: 1, label: 'Your Email', enabled: true },
    { n: 2, label: 'Upload & Lock CSV', enabled: Boolean(account) },
    { n: 3, label: 'Set Price & Publish', enabled: Boolean(sealed) },
  ];

  return (
    <div className="surface p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-5">
        <div>
          <div className="eyebrow">List your dataset</div>
          <div className="mt-1 font-display text-3xl">Earn whenever someone asks a question</div>
          <p className="mt-1 text-xs text-ink-300">
            Buyers only get aggregate answers — your spreadsheet stays locked inside the private vault.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {subs.map((s, i) => (
            <React.Fragment key={s.n}>
              <button
                type="button"
                disabled={!s.enabled}
                onClick={() => setSub(s.n)}
                className={cx(
                  'rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-300',
                  sub === s.n
                    ? 'bg-white text-black'
                    : s.enabled
                      ? 'border border-white/15 text-ink-200 hover:bg-white/10'
                      : 'text-ink-600'
                )}
              >
                {s.n}. {s.label}
              </button>
              {i < subs.length - 1 && <span className="h-px w-4 bg-white/15" />}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* 1 — email */}
      {sub === 1 && (
        <form onSubmit={createAccount} className="mt-6 grid animate-fade-up gap-5 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="seal-email">Your email address</label>
            <input
              id="seal-email"
              className="field"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
            />
          </div>
          <div>
            <label className="label" htmlFor="seal-slug">Short ID for your dataset (optional)</label>
            <input
              id="seal-slug"
              className="field font-mono"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              placeholder="e.g. retail_demand_2026"
            />
          </div>
          <p className="text-xs leading-relaxed text-ink-400 md:col-span-2">
            We create your payout account automatically for free — no crypto wallet or transaction fees required.
          </p>
          <div className="md:col-span-2">
            <Button
              type="submit"
              loading={creating}
              disabled={!email.trim()}
              trailing={<ArrowRight className="h-4 w-4" />}
            >
              Continue with email (Free)
            </Button>
          </div>
        </form>
      )}

      {/* 2 — upload real CSV + lock */}
      {sub === 2 && (
        <div className="mt-6 animate-fade-up space-y-6">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-4xl border border-dashed border-white/25 bg-white/[0.02] p-8 text-center transition hover:border-white/50 hover:bg-white/[0.04]">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-black">
              {fileName ? <FileSpreadsheet className="h-6 w-6" /> : <FileUp className="h-6 w-6" />}
            </div>
            <div>
              <div className="text-sm font-medium text-white">
                {fileName ? `Selected: ${fileName}` : 'Click to upload a .CSV spreadsheet from your computer'}
              </div>
              <div className="mt-1 text-xs text-ink-400">
                Include a header row and at least 20 data rows. Your file is encrypted right inside your browser.
              </div>
            </div>
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
          </label>

          {preview.header.length > 0 && (
            <div className="overflow-hidden rounded-3xl border border-white/10">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-3 text-xs">
                <span className="text-ink-300">
                  {sealed
                    ? 'Locked — rows are now scrambled and unreadable'
                    : 'Local browser preview (never uploaded in plaintext)'}
                </span>
                <span className="font-mono text-ink-300">{preview.total} rows</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-[11px]">
                  <thead className="text-ink-400">
                    <tr>
                      {preview.header.map((h) => (
                        <th key={h} className="whitespace-nowrap px-4 py-2.5 font-normal">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className={cx('transition-all duration-700', sealed && 'blur-[4px] opacity-35')}>
                    {preview.rows.map((r, i) => (
                      <tr key={i} className="border-t border-white/[0.05] text-ink-200">
                        {r.map((c, j) => (
                          <td key={j} className="whitespace-nowrap px-4 py-2">
                            {c}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant={sealed ? 'secondary' : 'primary'}
              onClick={encrypt}
              loading={encrypting}
              disabled={!csvText.trim() || !enclavePubKey}
              icon={sealed ? <Check className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            >
              {sealed ? 'Locked in browser (Encrypt again)' : 'Lock & encrypt file in browser'}
            </Button>
            {sealed && (
              <Button onClick={() => setSub(3)} trailing={<ArrowRight className="h-4 w-4" />}>
                Next: Set price & publish
              </Button>
            )}
          </div>

          {sealed && (
            <details className="rounded-2xl border border-white/10 px-4 py-3 text-xs text-ink-400">
              <summary className="cursor-pointer list-none font-medium text-ink-300">
                View encryption details (AES-256-GCM)
              </summary>
              <div className="mt-3 grid gap-x-8 sm:grid-cols-2">
                <KV k="Encrypted size">
                  <span className="font-mono text-xs">{sealed.byteLength.toLocaleString()} bytes</span>
                </KV>
                <KV k="File fingerprint">
                  <Hash value={sealed.datasetHashHex} />
                </KV>
                {account && (
                  <KV k="Payout account">
                    <span className="font-mono text-xs">{account.accountId}</span>
                  </KV>
                )}
                <KV k="Locked to vault key">
                  <Hash value={enclavePubKey || ''} />
                </KV>
              </div>
            </details>
          )}
        </div>
      )}

      {/* 3 — price + publish */}
      {sub === 3 && (
        <div className="mt-6 animate-fade-up space-y-6">
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="label" htmlFor="seal-title">Dataset title</label>
              <input
                id="seal-title"
                className="field"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Q4 Regional Mobility & Weather Demand"
              />
            </div>
            <div>
              <label className="label" htmlFor="seal-desc">Short summary for buyers</label>
              <input
                id="seal-desc"
                className="field"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what columns and records are inside…"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <span className="label">Total question limit (Privacy budget: {epsilon.toFixed(1)})</span>
              <span className="font-mono text-xs text-ink-300">~{Math.round(epsilon / 0.5)} standard answers</span>
            </div>
            <input
              type="range"
              min={0.5}
              max={5}
              step={0.1}
              value={epsilon}
              onChange={(e) => setEpsilon(Number(e.target.value))}
              className="w-full"
            />
            <div className="mt-1 flex justify-between text-[11px] text-ink-500">
              <span>Stricter privacy (fewer total queries allowed)</span>
              <span>More queries allowed before dataset retires</span>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <div className="flex items-center justify-between">
                <span className="label">Question types & price ($ USD)</span>
                <button
                  type="button"
                  className="text-ink-400 transition hover:text-white"
                  onClick={() => setViews((v) => [...v, { name: `tier_${v.length + 1}`, price_usdc: 4 }])}
                  aria-label="Add price tier"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-2">
                {views.map((v, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      className="field font-mono text-xs"
                      value={v.name}
                      onChange={(e) =>
                        setViews((all) => all.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                      }
                    />
                    <input
                      className="field w-28 font-mono text-xs"
                      type="number"
                      step="0.5"
                      min="0.5"
                      value={v.price_usdc}
                      onChange={(e) =>
                        setViews((all) =>
                          all.map((x, j) => (j === i ? { ...x, price_usdc: Number(e.target.value) } : x))
                        )
                      }
                    />
                    <button
                      type="button"
                      className="px-2 text-ink-500 transition hover:text-white disabled:opacity-30"
                      disabled={views.length <= 1}
                      onClick={() => setViews((all) => all.filter((_, j) => j !== i))}
                      aria-label="Remove tier"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <span className="label">Who contributed rows (paid automatically)</span>
                <button
                  type="button"
                  className="text-ink-400 transition hover:text-white"
                  onClick={() =>
                    setContributors((c) => [
                      ...c,
                      { account: account?.accountId || 'contributor.sealed.near', rows: 10 },
                    ])
                  }
                  aria-label="Add contributor"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-2">
                {contributors.map((c, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      className="field font-mono text-xs"
                      value={c.account}
                      onChange={(e) =>
                        setContributors((all) =>
                          all.map((x, j) => (j === i ? { ...x, account: e.target.value } : x))
                        )
                      }
                    />
                    <input
                      className="field w-24 font-mono text-xs"
                      type="number"
                      min="1"
                      value={c.rows}
                      onChange={(e) =>
                        setContributors((all) =>
                          all.map((x, j) => (j === i ? { ...x, rows: Number(e.target.value) } : x))
                        )
                      }
                    />
                    <button
                      type="button"
                      className="px-2 text-ink-500 transition hover:text-white disabled:opacity-30"
                      disabled={contributors.length <= 1}
                      onClick={() => setContributors((all) => all.filter((_, j) => j !== i))}
                      aria-label="Remove contributor"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={publish}
              loading={publishing}
              disabled={!sealed}
              trailing={<ArrowRight className="h-4 w-4" />}
            >
              Publish encrypted dataset
            </Button>
            <Pill tone="muted">Every contributor is paid automatically by how useful their rows are</Pill>
          </div>
        </div>
      )}
    </div>
  );
};
