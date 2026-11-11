import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, FileUp, Sparkles } from 'lucide-react';
import { runPrivateAppraisal, type Listing } from '../../lib/api';
import { verifyAppraisalSignatureClientSide } from '../../lib/crypto';
import { Bar, Button, CheckLine, cx, Hash, KV, Pill, ScoreRing, useToast } from '../../ui/kit';
import type { AppraisalOutcome } from '../types';

export const TASK_PRESETS = [
  {
    id: 'demand',
    label: 'Predict weekend bike demand',
    taskSpec: 'Forecast weekend demand from temperature, precipitation, and wind speed',
  },
  {
    id: 'retention',
    label: 'Predict pass renewals',
    taskSpec: 'Predict high mobility pass utilization and retention from weather features',
  },
  {
    id: 'elasticity',
    label: 'See how weather affects rides',
    taskSpec: 'Measure average rental demand elasticity across precipitation and temperature regimes',
  },
];

const pct = (v: number) => `${(v * 100).toFixed(0)}%`;

export const AppraiseStep: React.FC<{
  listing: Listing;
  outcome: AppraisalOutcome | null;
  onAppraised: (o: AppraisalOutcome) => void;
  onBack: () => void;
  onContinue: () => void;
}> = ({ listing, outcome, onAppraised, onBack, onContinue }) => {
  const toast = useToast();
  const [taskSpec, setTaskSpec] = useState(TASK_PRESETS[0].taskSpec);
  const [holdoutCsv, setHoldoutCsv] = useState<string>('');
  const [holdoutName, setHoldoutName] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const run = async (customTask?: string) => {
    setRunning(true);
    try {
      const report = await runPrivateAppraisal({
        listingId: listing.id,
        taskSpec: customTask ?? taskSpec,
        holdoutCsv: holdoutCsv.trim() ? holdoutCsv : undefined,
      });
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
      onAppraised({ report, signatureValid: sig.valid, reportHashHex: sig.reportHashHex });
    } catch (err) {
      toast('Quality check failed', err instanceof Error ? err.message : 'Server error', 'error');
    } finally {
      setRunning(false);
    }
  };

  // Auto-run the free quality check when arriving on this step so the user immediately sees results
  const autoRanForId = useRef<string | null>(null);
  useEffect(() => {
    if ((!outcome || outcome.report.listingId !== listing.id) && autoRanForId.current !== listing.id) {
      autoRanForId.current = listing.id;
      run(taskSpec);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing.id]);

  const r = outcome?.report;
  const isGood = r ? r.score >= 0.5 : true;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-3xl tracking-tight sm:text-4xl">
            2. Free Quality Check: <span className="text-ink-300">{listing.title}</span>
          </h2>
          <p className="mt-1 text-sm text-ink-300">
            Tell us what you want to learn. Our private AI checks the dataset and scores how useful it is before you buy.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onBack} icon={<ArrowLeft className="h-4 w-4" />}>
          Change dataset
        </Button>
      </div>

      <div className="surface p-6 sm:p-7">
        <div className="text-xs font-medium text-ink-300">What are you trying to predict or answer?</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {TASK_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setTaskSpec(p.taskSpec);
                run(p.taskSpec);
              }}
              className={cx(
                'rounded-full border px-4 py-2 text-xs font-medium transition-all duration-300 ease-soft',
                taskSpec === p.taskSpec
                  ? 'border-white bg-white text-black'
                  : 'border-white/15 text-ink-200 hover:border-white/40'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            className="field flex-1"
            value={taskSpec}
            onChange={(e) => setTaskSpec(e.target.value)}
            placeholder="Describe what you want to predict…"
            aria-label="Your goal"
          />
          <Button onClick={() => run()} loading={running} icon={<Sparkles className="h-4 w-4" />}>
            {running ? 'Checking quality…' : 'Re-run check'}
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-ink-400">
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-ink-300 underline-offset-4 hover:text-white hover:underline">
            <FileUp className="h-3.5 w-3.5" />
            {holdoutName ? `Test file: ${holdoutName}` : 'Have your own test CSV? Upload it (optional)'}
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
              className="text-ink-400 hover:text-white"
              onClick={() => {
                setHoldoutCsv('');
                setHoldoutName(null);
              }}
            >
              (Reset)
            </button>
          )}
        </div>
      </div>

      {r && (
        <div key={r.appraisalId} className="grid animate-fade-up gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
          {/* Left: Overall Verdict Card */}
          <div className="surface flex flex-col items-center justify-between p-8 text-center">
            <Pill tone={isGood ? 'solid' : 'outline'}>
              {isGood ? 'Recommended · High Quality' : 'Low Quality · Protected by Refund'}
            </Pill>

            <div className="my-6">
              <ScoreRing score={r.score} size={168} stroke={7} label="quality score" />
            </div>

            <div>
              <div className="text-xs text-ink-400">Fair price per answer</div>
              <div className="mt-1 font-display text-4xl">
                ${r.priceLow.toFixed(2)} – ${r.priceHigh.toFixed(2)}
              </div>
              <p className="mt-3 max-w-sm text-xs leading-relaxed text-ink-300">{r.explanation}</p>
            </div>

            <div className="mt-6 w-full space-y-2.5 border-t border-white/[0.08] pt-5 text-left">
              <CheckLine ok={outcome!.signatureValid}>Verified by our secure vault</CheckLine>
              <CheckLine ok={!r.subscores.syntheticFlag}>
                {r.subscores.syntheticFlag
                  ? 'Warning: Looks like stale or copy-pasted data'
                  : 'Looks like genuine, real-world data'}
              </CheckLine>
            </div>
          </div>

          {/* Right: Plain-English Breakdown */}
          <div className="surface p-7">
            <div className="text-sm font-medium text-white">Health & Accuracy Breakdown</div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-3xl bg-white/[0.04] p-4">
                <div className="text-xs text-ink-400">Prediction accuracy</div>
                <div className="mt-1.5 font-mono text-xl text-white">
                  {pct(r.holdoutEvaluation.accuracyWithout)}{' '}
                  <span className="text-ink-500">→</span>{' '}
                  <span className="font-semibold">{pct(r.holdoutEvaluation.accuracyWith)}</span>
                </div>
                <div className="mt-1 text-[11px] text-ink-400">Before vs. after using this data</div>
              </div>
              <div className="rounded-3xl bg-white/[0.04] p-4">
                <div className="text-xs text-ink-400">Model confidence (AUC)</div>
                <div className="mt-1.5 font-mono text-xl text-white">
                  {r.holdoutEvaluation.aucWithout.toFixed(2)}{' '}
                  <span className="text-ink-500">→</span>{' '}
                  <span className="font-semibold">{r.holdoutEvaluation.aucWith.toFixed(2)}</span>
                </div>
                <div className="mt-1 text-[11px] text-ink-400">Tested on {r.holdoutEvaluation.holdoutRowsEvaluated} holdout rows</div>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {[
                {
                  k: 'Complete data (no missing values)',
                  v: r.subscores.completeness,
                  d: `${(100 - r.subscores.nullRate * 100).toFixed(0)}% filled`,
                },
                {
                  k: 'Unique rows (no duplicates)',
                  v: r.subscores.uniqueness,
                  d: `${(r.subscores.duplicateRate * 100).toFixed(0)}% duplicates`,
                },
                {
                  k: 'Up-to-date records',
                  v: r.subscores.freshness,
                  d: `Latest: ${r.subscores.maxDate}`,
                },
                {
                  k: 'Columns match your goal',
                  v: r.subscores.schemaFit,
                  d: `${r.holdoutEvaluation.featureCols.length} matching columns`,
                },
              ].map((row) => (
                <div key={row.k}>
                  <div className="mb-1.5 flex items-baseline justify-between text-xs">
                    <span className="text-ink-200">{row.k}</span>
                    <span className="font-mono text-ink-300">{row.d}</span>
                  </div>
                  <Bar value={row.v} />
                </div>
              ))}
            </div>

            <div className="mt-6 border-t border-white/[0.08] pt-5">
              <div className="text-xs font-medium text-ink-300">
                How your payment will be shared among contributors
              </div>
              <div className="mt-3 space-y-2">
                {r.shapleyContributors.map((c) => (
                  <div key={c.account} className="flex items-center gap-3 text-xs">
                    <span className="w-40 truncate font-mono text-ink-200">{c.account}</span>
                    <Bar value={c.weight} className="flex-1" />
                    <span className="w-12 text-right font-mono">{(c.weight * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>

            <details className="mt-5 rounded-2xl border border-white/10 px-4 py-2.5 text-xs text-ink-400">
              <summary className="cursor-pointer list-none font-medium text-ink-300">
                View cryptographic proof ({r.appraisalId})
              </summary>
              <div className="mt-2 divide-y divide-white/[0.06]">
                <KV k="Report hash"><Hash value={outcome!.reportHashHex} /></KV>
                <KV k="Vault signature (tee_sig)"><Hash value={r.teeSig} /></KV>
              </div>
            </details>
          </div>
        </div>
      )}

      {r && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-4xl border border-white/15 bg-white/[0.03] px-6 py-5">
          <div className="text-sm">
            {isGood ? (
              <>
                <span className="font-medium text-white">Looks great!</span>{' '}
                <span className="text-ink-300">
                  Unlock answers for ${((r.priceLow + r.priceHigh) / 2).toFixed(2)} each — backed by our money-back guarantee.
                </span>
              </>
            ) : (
              <>
                <span className="font-medium text-white">Low quality score ({Math.round(r.score * 100)}%).</span>{' '}
                <span className="text-ink-300">
                  If you continue, our refund protection will automatically return 100% of your payment.
                </span>
              </>
            )}
          </div>
          <Button onClick={onContinue} trailing={<ArrowRight className="h-4 w-4" />}>
            Continue to checkout
          </Button>
        </div>
      )}
    </div>
  );
};
