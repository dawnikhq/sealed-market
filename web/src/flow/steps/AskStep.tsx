import React, { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Play, ShieldAlert, Sparkles } from 'lucide-react';
import { executeEnclaveQuery, type Listing, type QuerySpec } from '../../lib/api';
import { Bar, Button, CountUp, Hash, KV, Pill, useToast } from '../../ui/kit';
import type { AnswerRecord, Purchase } from '../types';

const ID_LIKE_COLS = new Set(['id', 'trip_batch_id', 'customer_id', 'date', 'city', 'region', 'contributor']);
type FilterOp = NonNullable<QuerySpec['filterOp']>;
const OPS: { v: FilterOp; l: string }[] = [
  { v: 'eq', l: 'equals (=)' },
  { v: 'gt', l: 'greater than (>)' },
  { v: 'lt', l: 'less than (<)' },
  { v: 'gte', l: 'at least (≥)' },
  { v: 'lte', l: 'at most (≤)' },
];

const OP_LABELS: Record<QuerySpec['op'], string> = {
  AVG: 'Average',
  SUM: 'Total sum',
  COUNT: 'Count of rows',
  MIN: 'Lowest value',
  MAX: 'Highest value',
  MODEL_METRIC: 'Model score',
};

export const AskStep: React.FC<{
  listing: Listing;
  account: string;
  purchase: Purchase;
  answers: AnswerRecord[];
  onAnswered: (a: AnswerRecord) => void;
  onBack: () => void;
  onContinue: () => void;
}> = ({ listing, account, purchase, answers, onAnswered, onBack, onContinue }) => {
  const toast = useToast();
  const columns = useMemo(() => {
    const candidate = listing.schema.filter((c) => !ID_LIKE_COLS.has(c.toLowerCase()));
    return candidate.length ? candidate : listing.schema;
  }, [listing.schema]);

  const defaultCol = columns.includes('rentals_count') ? 'rentals_count' : columns[0] || listing.schema[0] || '';
  const [op, setOp] = useState<QuerySpec['op']>('AVG');
  const [column, setColumn] = useState(defaultCol);
  const [filterCol, setFilterCol] = useState('');
  const [filterOp, setFilterOp] = useState<FilterOp>('eq');
  const [filterVal, setFilterVal] = useState('');
  const [epsilon, setEpsilon] = useState(0.5);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);

  const last = answers[0];
  const answersLeft = last ? last.answersLeft : purchase.token.answers_left;
  const epsRemaining = last ? last.epsilonRemaining : Math.max(0, listing.epsilon_budget - listing.epsilon_spent);
  const epsBudget = listing.epsilon_budget;

  const describe = () =>
    `${OP_LABELS[op]} of ${column}${filterCol && filterVal ? ` where ${filterCol} ${filterOp} ${filterVal}` : ''}`;

  const runQueryWith = async (override?: {
    op: QuerySpec['op'];
    column: string;
    filterCol: string;
    filterOp: FilterOp;
    filterVal: string;
  }) => {
    const qOp = override?.op ?? op;
    const qCol = override?.column ?? column;
    const qFCol = override?.filterCol ?? filterCol;
    const qFOp = override?.filterOp ?? filterOp;
    const qFVal = override?.filterVal ?? filterVal;

    setRunning(true);
    setError(null);
    const label = `${OP_LABELS[qOp]} of ${qCol}${qFCol && qFVal ? ` where ${qFCol} ${qFOp} ${qFVal}` : ''}`;
    try {
      const res = await executeEnclaveQuery({
        tokenId: purchase.token.token_id,
        listingId: listing.id,
        caller: account,
        query: {
          op: qOp,
          column: qCol,
          filterColumn: qFCol && qFVal ? qFCol : undefined,
          filterOp: qFCol && qFVal ? qFOp : undefined,
          filterValue: qFCol && qFVal ? qFVal : undefined,
          epsilon,
        },
      });
      onAnswered({
        queryId: res.queryId,
        label,
        noisedValue: res.result.noisedValue,
        matchedRowsK: res.result.matchedRowsK,
        laplaceScale: res.result.laplaceScale,
        sensitivity: res.result.sensitivity,
        epsilonUsed: res.result.epsilonUsed,
        epsilonRemaining: res.result.epsilonRemaining,
        confidenceInterval95: res.result.confidenceInterval95,
        queryHash: res.queryHash,
        resultHash: res.resultHash,
        teeSig: res.teeSig,
        answersLeft: res.answersLeft,
        deliveredWithinRange: res.deliveredWithinRange,
        timestampMs: Date.now(),
      });
      toast('Answer ready!', `Calculated across ${res.result.matchedRowsK} matching records.`, 'success');
    } catch (err: unknown) {
      const e = err as Error & { code?: string };
      setError({ code: e.code || 'QUERY_REJECTED', message: e.message || 'Blocked for privacy protection' });
      toast(
        e.code === 'K_ANONYMITY_VIOLATION'
          ? 'Blocked: Too few people in that group (< 20)'
          : 'Question blocked by privacy guard',
        e.message,
        'error'
      );
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-3xl tracking-tight sm:text-4xl">
            4. Ask Questions About the Data
          </h2>
          <p className="mt-1 text-sm text-ink-300">
            Ask for averages, totals, or counts. You get instant answers while individual rows stay completely private.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onBack} icon={<ArrowLeft className="h-4 w-4" />}>
          Back to order
        </Button>
      </div>

      {/* Dynamic One-Click Quick Try Buttons */}
      <div className="flex flex-wrap items-center gap-2.5 rounded-3xl border border-white/10 bg-white/[0.03] px-5 py-3.5">
        <span className="text-xs font-medium text-ink-300">Quick actions:</span>
        <button
          type="button"
          disabled={running || !defaultCol}
          onClick={() => {
            setOp('AVG');
            setColumn(defaultCol);
            setFilterCol('');
            setFilterVal('');
            runQueryWith({
              op: 'AVG',
              column: defaultCol,
              filterCol: '',
              filterOp: 'eq',
              filterVal: '',
            });
          }}
          className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-medium text-black transition hover:opacity-90"
        >
          <Sparkles className="h-3.5 w-3.5" /> Calculate average of {defaultCol}
        </button>
        <button
          type="button"
          disabled={running || !defaultCol}
          onClick={() => {
            setOp('AVG');
            setColumn(defaultCol);
            setFilterCol(defaultCol);
            setFilterOp('gt');
            setFilterVal('999999999');
            runQueryWith({
              op: 'AVG',
              column: defaultCol,
              filterCol: defaultCol,
              filterOp: 'gt',
              filterVal: '999999999',
            });
          }}
          className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-white/30 px-3.5 py-1.5 text-xs text-ink-200 transition hover:border-white/60 hover:text-white"
        >
          <ShieldAlert className="h-3.5 w-3.5" /> Test privacy block (group smaller than 20 rows)
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="surface p-7">
          <div className="text-sm font-medium text-white">Build your question</div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="q-op">What to calculate</label>
              <select
                id="q-op"
                className="field"
                value={op}
                onChange={(e) => setOp(e.target.value as QuerySpec['op'])}
              >
                {(['AVG', 'SUM', 'COUNT', 'MIN', 'MAX'] as const).map((o) => (
                  <option key={o} value={o}>
                    {OP_LABELS[o]} ({o})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="q-col">Which column</label>
              <select
                id="q-col"
                className="field font-mono"
                value={column}
                onChange={(e) => setColumn(e.target.value)}
              >
                {listing.schema.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="q-fcol">Filter by column (optional)</label>
              <select
                id="q-fcol"
                className="field font-mono"
                value={filterCol}
                onChange={(e) => setFilterCol(e.target.value)}
              >
                <option value="">All rows (no filter)</option>
                {listing.schema.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="q-fop">Condition</label>
              <select
                id="q-fop"
                className="field"
                disabled={!filterCol}
                value={filterOp}
                onChange={(e) => setFilterOp(e.target.value as FilterOp)}
              >
                {OPS.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="q-fval">Value</label>
              <input
                id="q-fval"
                className="field font-mono"
                disabled={!filterCol}
                value={filterVal}
                onChange={(e) => setFilterVal(e.target.value)}
                placeholder={filterCol ? 'Enter value…' : '—'}
              />
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] pt-5">
            <Button
              onClick={() => runQueryWith()}
              loading={running}
              disabled={answersLeft <= 0 || !column}
              icon={<Play className="h-4 w-4" />}
            >
              Get answer
            </Button>
            <span className="text-xs text-ink-400">{describe()}</span>
          </div>

          {error && (
            <div className="mt-5 animate-scale-in rounded-3xl border border-white/40 bg-white/[0.03] px-5 py-4">
              <div className="text-xs font-semibold text-white">
                Privacy Protection Triggered ({error.code})
              </div>
              <div className="mt-1 text-xs leading-relaxed text-ink-300">
                {error.message} — To prevent anyone from singling out an individual person&apos;s row, questions that match
                fewer than 20 records are automatically blocked, and your answer credit is not charged.
              </div>
            </div>
          )}
        </div>

        {/* Right: Remaining credits & privacy meter */}
        <div className="surface flex flex-col justify-between p-7">
          <div>
            <div className="text-sm font-medium text-white">Your Pass Balance</div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-3xl bg-white/[0.04] p-4">
                <div className="text-xs text-ink-400">Answers remaining</div>
                <div className="mt-1 font-display text-4xl">
                  {answersLeft}
                  <span className="text-lg text-ink-500"> / {purchase.token.answers_total}</span>
                </div>
              </div>
              <div className="rounded-3xl bg-white/[0.04] p-4">
                <div className="text-xs text-ink-400">Dataset privacy left</div>
                <div className="mt-1 font-display text-4xl">
                  {Math.round((epsRemaining / Math.max(0.1, epsBudget)) * 100)}%
                </div>
              </div>
            </div>
            <div className="mt-4">
              <Bar value={epsBudget > 0 ? epsRemaining / epsBudget : 0} />
              <div className="mt-2 flex justify-between text-[11px] text-ink-400">
                <span>Privacy budget remaining: {epsRemaining.toFixed(2)} / {epsBudget.toFixed(1)}</span>
                <span>Each answer uses {epsilon.toFixed(1)}</span>
              </div>
            </div>
          </div>

          <p className="mt-6 text-xs leading-relaxed text-ink-400">
            How privacy works: Every answer includes a tiny, mathematically calibrated amount of random fuzz (Differential
            Privacy) so the overall trend is accurate while individual rows remain impossible to reverse-engineer.
          </p>
        </div>
      </div>

      {/* Latest Answer Card */}
      {last && (
        <div key={last.queryId} className="surface animate-scale-in p-7 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <Pill tone="solid">Verified Answer</Pill>
              <div className="mt-3 text-xs text-ink-300">{last.label}</div>
              <div className="mt-1 flex items-baseline gap-3">
                <CountUp
                  value={last.noisedValue}
                  decimals={2}
                  className="font-display text-6xl tabular-nums sm:text-7xl"
                />
              </div>
              <div className="mt-2 text-xs text-ink-300">
                95% confidence range: <span className="font-mono text-white">{last.confidenceInterval95[0].toFixed(1)} – {last.confidenceInterval95[1].toFixed(1)}</span> · Calculated from{' '}
                <span className="font-mono text-white">{last.matchedRowsK} matching records</span>
              </div>
            </div>

            <Button size="lg" onClick={onContinue} trailing={<ArrowRight className="h-4 w-4" />}>
              Finish & Complete Order
            </Button>
          </div>

          <details className="mt-6 rounded-2xl border border-white/10 px-4 py-2.5 text-xs text-ink-400">
            <summary className="cursor-pointer list-none font-medium text-ink-300">
              View privacy & signature receipt ({last.queryId})
            </summary>
            <div className="mt-2 grid gap-x-10 sm:grid-cols-3">
              <KV k="Privacy noise scale"><span className="font-mono text-xs">b = {last.laplaceScale.toFixed(2)}</span></KV>
              <KV k="Result hash"><Hash value={last.resultHash} /></KV>
              <KV k="Vault signature"><Hash value={last.teeSig} /></KV>
            </div>
          </details>
        </div>
      )}

      {!last && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-4xl border border-white/15 bg-white/[0.03] px-6 py-5">
          <div className="text-sm text-ink-300">
            Click <span className="font-medium text-white">Get answer</span> above to run your first question, or skip straight to completing your order.
          </div>
          <Button variant="secondary" onClick={onContinue} trailing={<ArrowRight className="h-4 w-4" />}>
            Complete order
          </Button>
        </div>
      )}
    </div>
  );
};
