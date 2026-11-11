import React, { useMemo, useState } from 'react';
import { ArrowRight, Check, FileSpreadsheet, FileUp, Lock, Plus, Trash2 } from 'lucide-react';
import {
  createGaslessNamedAccount,
  uploadEncryptedDatasetAndPublish,
  type Contributor,
  type ViewPrice,
} from '../lib/api';
import { encryptCsvToEnclaveClientSide } from '../lib/crypto';
import { Button, cx, Hash, KV, Pill, useToast } from '../ui/kit';

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
  /** Signed-in account, if any: the email step is skipped and payouts go here. */
  signedInAccount?: string;
  onAccountCreated?: (accountId: string, publicKey: string) => void;
  onPublished: (listingId: string) => Promise<void>;
}> = ({ enclavePubKey, signedInAccount, onAccountCreated, onPublished }) => {
  const toast = useToast();
  const [sub, setSub] = useState<Sub>(signedInAccount ? 2 : 1);

  // 1 · real seller email & dataset slug (no pre-filled mock data)
  const [email, setEmail] = useState('');
  const [slug, setSlug] = useState('');
  const [account, setAccount] = useState<NamedAccount | null>(
    signedInAccount
      ? {
          accountId: signedInAccount,
          datasetSubaccountId: '',
          publicKey: '',
          metaTxHash: '',
          relayerSponsor: '',
          gasSponsoredNear: '',
        }
      : null
  );
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
      onAccountCreated?.(res.accountId, res.publicKey);
      setContributors([{ account: res.accountId, rows: preview.total || 1 }]);
      toast('Payout account ready', `${res.accountId} was created for free.`, 'success');
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
      toast('File encrypted in your browser', 'Only the vault can open it.', 'success');
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
    { n: 1, label: 'Your email', enabled: true },
    { n: 2, label: 'Upload and encrypt', enabled: Boolean(account) },
    { n: 3, label: 'Price and publish', enabled: Boolean(sealed) },
  ];

  return (
    <div className="surface p-5 sm:p-8">
      <div className="no-scrollbar -mx-5 flex items-center gap-2 overflow-x-auto border-b border-fg/10 px-5 pb-4 sm:mx-0 sm:px-0">
        {subs.map((st, i) => (
          <React.Fragment key={st.n}>
            <button
              type="button"
              disabled={!st.enabled}
              onClick={() => setSub(st.n)}
              className={cx(
                'flex h-10 shrink-0 items-center gap-2 rounded-full px-3.5 text-sm font-medium transition',
                sub === st.n
                  ? 'bg-fg text-card'
                  : st.enabled
                    ? 'border border-fg/15 text-ink-200 hover:border-fg/40'
                    : 'text-ink-500'
              )}
            >
              <span className="font-mono text-sm opacity-70">{st.n}</span> {st.label}
            </button>
            {i < subs.length - 1 && <span className="h-px w-4 shrink-0 bg-fg/15" />}
          </React.Fragment>
        ))}
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
          <p className="text-sm leading-relaxed text-ink-400 md:col-span-2">
            We create your payout account for free. No crypto wallet or fees needed.
          </p>
          <div className="md:col-span-2">
            <Button
              type="submit"
              loading={creating}
              disabled={!email.trim()}
              trailing={<ArrowRight className="h-4 w-4" />}
            >
              Continue with email
            </Button>
          </div>
        </form>
      )}

      {/* 2 — upload real CSV + lock */}
      {sub === 2 && (
        <div className="mt-6 animate-fade-up space-y-6">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-fg/25 bg-ink-900 p-8 text-center transition hover:border-fg/50 hover:bg-fg/[0.04]">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-fg text-card">
              {fileName ? <FileSpreadsheet className="h-6 w-6" /> : <FileUp className="h-6 w-6" />}
            </div>
            <div>
              <div className="text-sm font-medium text-fg">
                {fileName ? `Selected: ${fileName}` : 'Choose a CSV file'}
              </div>
              <div className="mt-1 text-sm text-ink-400">
                Needs a header row and at least 20 data rows. It is encrypted in your browser before upload.
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
            <div className="overflow-hidden rounded-3xl border border-fg/10">
              <div className="flex items-center justify-between border-b border-fg/10 px-5 py-3 text-sm">
                <span className="text-ink-300">
                  {sealed
                    ? 'Encrypted. Only the vault can read these rows now'
                    : 'Preview on your device only. Nothing is uploaded yet'}
                </span>
                <span className="font-mono text-ink-300">{preview.total} rows</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-sm">
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
                      <tr key={i} className="border-t border-fg/[0.05] text-ink-200">
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
              {sealed ? 'Encrypted. Encrypt again' : 'Encrypt file in browser'}
            </Button>
            {sealed && (
              <Button onClick={() => setSub(3)} trailing={<ArrowRight className="h-4 w-4" />}>
                Next: price and publish
              </Button>
            )}
          </div>

          {sealed && (
            <details className="rounded-2xl border border-fg/10 px-4 py-3 text-sm text-ink-400">
              <summary className="cursor-pointer list-none font-medium text-ink-300">
                View encryption details (AES-256-GCM)
              </summary>
              <div className="mt-3 grid gap-x-8 sm:grid-cols-2">
                <KV k="Encrypted size">
                  <span className="font-mono text-sm">{sealed.byteLength.toLocaleString()} bytes</span>
                </KV>
                <KV k="File fingerprint">
                  <Hash value={sealed.datasetHashHex} />
                </KV>
                {account && (
                  <KV k="Payout account">
                    <span className="font-mono text-sm">{account.accountId}</span>
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
              <span className="label">How many questions can ever be answered?</span>
              <span className="font-mono text-sm text-ink-200">about {Math.floor(epsilon / 0.5)} answers</span>
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
            <div className="mt-1 flex justify-between text-sm text-ink-500">
              <span>Fewer answers, stronger privacy</span>
              <span>More answers before the dataset retires</span>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <div className="flex items-center justify-between">
                <span className="label">Price per answer (USD)</span>
                <button
                  type="button"
                  className="text-ink-400 transition hover:text-fg"
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
                      className="field font-mono"
                      value={v.name}
                      onChange={(e) =>
                        setViews((all) => all.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                      }
                    />
                    <input
                      className="field w-24 shrink-0 font-mono"
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
                      className="px-2 text-ink-500 transition hover:text-fg disabled:opacity-30"
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
                <span className="label">Who contributed rows, and how many</span>
                <button
                  type="button"
                  className="text-ink-400 transition hover:text-fg"
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
                      className="field font-mono"
                      value={c.account}
                      onChange={(e) =>
                        setContributors((all) =>
                          all.map((x, j) => (j === i ? { ...x, account: e.target.value } : x))
                        )
                      }
                    />
                    <input
                      className="field w-20 shrink-0 font-mono"
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
                      className="px-2 text-ink-500 transition hover:text-fg disabled:opacity-30"
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
              Publish dataset
            </Button>
            <span className="text-sm text-ink-400">Contributors are paid by how useful their rows are.</span>
          </div>
        </div>
      )}
    </div>
  );
};
