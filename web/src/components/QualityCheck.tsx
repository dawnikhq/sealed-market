import React, { useEffect, useRef, useState } from 'react';
import { FileUp, RefreshCw } from 'lucide-react';
import { runPrivateAppraisal, type AppraisalReport, type ContributorShapley, type Listing } from '../lib/api';
import { verifyAppraisalSignatureClientSide } from '../lib/crypto';
import { shortAccount } from '../store';
import type { AppraisalOutcome } from '../types';
import { Bar, Button, CheckLine, cx, Hash, KV, Pill, ScoreRing, useToast } from '../ui/kit';

const SAMPLE_GOALS = [
  {
    label: 'Predict weekend demand',
    taskSpec: 'Forecast weekend demand from temperature, precipitation, and wind speed',
  },
  {
    label: 'Predict pass renewals',
    taskSpec: 'Predict high mobility pass utilization and retention from weather features',
  },
  {
    label: 'See how weather affects rides',
    taskSpec: 'Measure average rental demand elasticity across precipitation and temperature regimes',
  },
];

const pct = (v: number) => `${(v * 100).toFixed(0)}%`;

async function verify(report: AppraisalReport): Promise<AppraisalOutcome> {
  const sig = await verifyAppraisalSignatureClientSide({
    listingId: report.listingId,
    taskHash: report.taskHash,
    score: report.score,
    priceLow: report.priceLow,
    priceHigh: report.priceHigh,
    attestationRef: report.attestationRef,
    teePubkey: report.teePubkey,
    teeSig: report.teeSig,
  });
  return { report, signatureValid: sig.valid, reportHashHex: sig.reportHashHex };
}

/**
 * The free quality check. Shows the listing's latest signed report straight away (after checking
 * its signature in the browser) and lets the buyer re-run it for their own goal or test file.
 */
export const QualityCheck: React.FC<{
  listing: Listing;
  outcome: AppraisalOutcome | null;
  onAppraised: (o: AppraisalOutcome) => void;
}> = ({ listing, outcome, onAppraised }) => {
  const toast = useToast();
  const [taskSpec, setTaskSpec] = useState(listing.latest_appraisal?.taskSpec || SAMPLE_GOALS[0].taskSpec);
  const [holdoutCsv, setHoldoutCsv] = useState('');
  const [holdoutName, setHoldoutName] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const run = async (task = taskSpec) => {
    setRunning(true);
    try {
      const report = await runPrivateAppraisal({
        listingId: listing.id,
        taskSpec: task,
        holdoutCsv: holdoutCsv.trim() ? holdoutCsv : undefined,
      });
      onAppraised(await verify(report));
    } catch (err) {
      toast('Quality check failed', err instanceof Error ? err.message : 'Please try again', 'error');
    } finally {
      setRunning(false);
    }
  };

  // First view: reuse the listing's latest signed report; only run a new check if there is none.
  const startedFor = useRef<string | null>(null);
  useEffect(() => {
    if (startedFor.current === listing.id) return;
    if (outcome && outcome.report.listingId === listing.id) return;
    startedFor.current = listing.id;
    if (listing.latest_appraisal) {
      verify(listing.latest_appraisal)
        .then(onAppraised)
        .catch(() => run());
    } else {
      run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing.id]);

  const r = outcome && outcome.report.listingId === listing.id ? outcome.report : null;
  const good = r ? r.score >= 0.5 : true;

  return (
    <div className="space-y-4">
      <div className="surface p-5 sm:p-6">
        <label className="text-sm font-semibold" htmlFor="qc-goal">
          What do you want to predict or answer?
        </label>
        <p className="mt-0.5 text-sm text-ink-300">
          The score below is for this goal. Change it and the dataset is tested again, free.
        </p>
        {listing.is_sample && (
          <div className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5 sm:mx-0 sm:flex-wrap sm:px-0">
            {SAMPLE_GOALS.map((g) => (
              <button
                key={g.label}
                type="button"
                disabled={running}
                onClick={() => {
                  setTaskSpec(g.taskSpec);
                  run(g.taskSpec);
                }}
                className={cx(
                  'h-10 shrink-0 rounded-full border px-4 text-sm font-medium transition',
                  taskSpec === g.taskSpec
                    ? 'border-fg bg-fg text-card'
                    : 'border-fg/15 text-ink-200 hover:border-fg/40'
                )}
              >
                {g.label}
              </button>
            ))}
          </div>
        )}
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            id="qc-goal"
            className="field flex-1"
            value={taskSpec}
            onChange={(e) => setTaskSpec(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && run()}
            placeholder="Describe what you want to predict"
          />
          <Button
            variant="secondary"
            onClick={() => run()}
            loading={running}
            icon={<RefreshCw className="h-4 w-4" />}
          >
            {running ? 'Checking…' : 'Run check'}
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-ink-300 underline-offset-4 hover:text-fg hover:underline">
            <FileUp className="h-4 w-4" />
            {holdoutName ? `Test file: ${holdoutName}` : 'Test against your own CSV (optional)'}
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setHoldoutCsv(await f.text());
                setHoldoutName(f.name);
              }}
            />
          </label>
          {holdoutName && (
            <button
              type="button"
              className="text-ink-400 hover:text-fg"
              onClick={() => {
                setHoldoutCsv('');
                setHoldoutName(null);
              }}
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {!r && (
        <div className="surface p-6">
          <div className="flex items-center gap-5">
            <div className="skeleton h-24 w-24 shrink-0 rounded-full" />
            <div className="flex-1 space-y-3">
              <div className="skeleton h-5 w-40" />
              <div className="skeleton h-4 w-full" />
              <div className="skeleton h-4 w-2/3" />
            </div>
          </div>
        </div>
      )}

      {r && (
        <div key={r.appraisalId} className={cx('space-y-4 transition-opacity', running && 'opacity-50')}>
          {/* Verdict */}
          <div className="surface animate-fade-up p-5 sm:p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className={cx('mx-auto shrink-0 sm:mx-0', good ? 'text-fg' : 'text-bad')}>
                <ScoreRing score={r.score} size={132} stroke={8} label="quality" />
              </div>
              <div className="min-w-0 flex-1 text-center sm:text-left">
                <Pill tone={good ? 'good' : 'bad'}>
                  {good ? 'Meets the quality guarantee' : 'Below the quality guarantee'}
                </Pill>
                <div className="mt-2 text-sm text-ink-400">Fair price per answer</div>
                <div className="font-display text-4xl leading-tight tabular-nums">
                  ${r.priceLow.toFixed(2)} – ${r.priceHigh.toFixed(2)}
                </div>
                <p className="mt-2 text-sm leading-relaxed text-ink-300">{r.explanation}</p>
              </div>
            </div>
            <div className="mt-5 grid gap-2.5 border-t border-fg/10 pt-4 sm:grid-cols-2">
              <CheckLine ok={outcome!.signatureValid}>Report signed by the vault, checked in your browser</CheckLine>
              <CheckLine ok={!r.subscores.syntheticFlag}>
                {r.subscores.syntheticFlag ? 'Looks stale or copy-pasted' : 'Looks like genuine data'}
              </CheckLine>
            </div>
          </div>

          {/* Breakdown */}
          <div className="surface animate-fade-up p-5 sm:p-6">
            <div className="text-base font-semibold">What the check measured</div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-ink-900 p-4">
                <div className="text-sm text-ink-400">Prediction accuracy</div>
                <div className="mt-1 font-mono text-lg tabular-nums sm:text-xl">
                  {pct(r.holdoutEvaluation.accuracyWithout)} <span className="text-ink-500">→</span>{' '}
                  <span className="font-semibold">{pct(r.holdoutEvaluation.accuracyWith)}</span>
                </div>
                <div className="mt-1 text-xs text-ink-400">Without vs. with this data</div>
              </div>
              <div className="rounded-2xl bg-ink-900 p-4">
                <div className="text-sm text-ink-400">Model confidence (AUC)</div>
                <div className="mt-1 font-mono text-lg tabular-nums sm:text-xl">
                  {r.holdoutEvaluation.aucWithout.toFixed(2)} <span className="text-ink-500">→</span>{' '}
                  <span className="font-semibold">{r.holdoutEvaluation.aucWith.toFixed(2)}</span>
                </div>
                <div className="mt-1 text-xs text-ink-400">
                  On {r.holdoutEvaluation.holdoutRowsEvaluated} held-out rows
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {[
                {
                  k: 'Complete data',
                  v: r.subscores.completeness,
                  d: `${(100 - r.subscores.nullRate * 100).toFixed(0)}% filled`,
                },
                {
                  k: 'Unique rows',
                  v: r.subscores.uniqueness,
                  d: `${(r.subscores.duplicateRate * 100).toFixed(0)}% duplicates`,
                },
                { k: 'Up to date', v: r.subscores.freshness, d: `Latest ${r.subscores.maxDate || 'unknown'}` },
                {
                  k: 'Columns match your goal',
                  v: r.subscores.schemaFit,
                  d: `${r.holdoutEvaluation.featureCols.length} matching`,
                },
              ].map((row) => (
                <div key={row.k}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-ink-100">{row.k}</span>
                    <span className="font-mono text-ink-300">{row.d}</span>
                  </div>
                  <Bar value={row.v} />
                </div>
              ))}
            </div>
          </div>

          {/* Payout split */}
          <div className="surface animate-fade-up p-5 sm:p-6">
            <div className="text-base font-semibold">Who gets paid</div>
            <p className="mt-0.5 text-sm text-ink-300">
              95% of each order is split by how much each contributor’s rows improved the result. 5% is the
              platform fee.
            </p>
            <div className="mt-4 space-y-3">
              {r.shapleyContributors.map((c: ContributorShapley) => (
                <div key={c.account} className="grid grid-cols-[minmax(0,7.5rem)_1fr_3rem] items-center gap-3 text-sm">
                  <span className="truncate font-mono text-ink-100" title={c.account}>
                    {shortAccount(c.account)}
                  </span>
                  <Bar value={c.weight} />
                  <span className="text-right font-mono tabular-nums">{(c.weight * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
            <details className="mt-5 rounded-xl border border-fg/10 px-4 py-3 text-sm">
              <summary className="cursor-pointer list-none font-medium text-ink-300 hover:text-fg">
                Show the signed proof
              </summary>
              <div className="mt-2 divide-y divide-fg/[0.07]">
                <KV k="Report ID">
                  <span className="font-mono text-xs">{r.appraisalId}</span>
                </KV>
                <KV k="Report hash">
                  <Hash value={outcome!.reportHashHex} />
                </KV>
                <KV k="Vault signature">
                  <Hash value={r.teeSig} />
                </KV>
              </div>
            </details>
          </div>
        </div>
      )}
    </div>
  );
};
