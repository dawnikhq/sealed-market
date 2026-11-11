import React, { useMemo, useState } from 'react';
import { Play, ShieldAlert, Sparkles } from 'lucide-react';
import { executeEnclaveQuery, type Listing, type QuerySpec } from '../lib/api';
import type { AnswerRecord, Purchase } from '../types';
import { Bar, Button, CountUp, Hash, KV, Pill, useToast } from '../ui/kit';

const ID_LIKE_COLS = new Set(['id', 'trip_batch_id', 'customer_id', 'date', 'city', 'region', 'contributor']);
type FilterOp = NonNullable<QuerySpec['filterOp']>;
const OPS: { v: FilterOp; l: string; s: string }[] = [
  { v: 'eq', l: 'equals', s: '=' },
  { v: 'gt', l: 'is greater than', s: '>' },
  { v: 'lt', l: 'is less than', s: '<' },
  { v: 'gte', l: 'is at least', s: '≥' },
  { v: 'lte', l: 'is at most', s: '≤' },
];

const OP_LABELS: Record<QuerySpec['op'], string> = {
  AVG: 'Average',
  SUM: 'Total',
  COUNT: 'Count of rows',
  MIN: 'Lowest value',
  MAX: 'Highest value',
  MODEL_METRIC: 'Model score',
};

const EPSILON_PER_ANSWER = 0.5;

interface Draft {
  op: QuerySpec['op'];
  column: string;
  filterCol: string;
  filterOp: FilterOp;
  filterVal: string;
}

function describe(d: Draft): string {
  const sym = OPS.find((o) => o.v === d.filterOp)?.s ?? d.filterOp;
  return `${OP_LABELS[d.op]} of ${d.column}${d.filterCol && d.filterVal ? ` where ${d.filterCol} ${sym} ${d.filterVal}` : ''}`;
}

/** Ask aggregate questions against a paid answer pass. */
export const AskPanel: React.FC<{
  listing: Listing;
  account: string;
  purchase: Purchase;
  answers: AnswerRecord[];
  closed: boolean;
  onAnswered: (a: AnswerRecord) => void;
}> = ({ listing, account, purchase, answers, closed, onAnswered }) => {
  const toast = useToast();
  const columns = useMemo(() => {
    const candidate = listing.schema.filter((c) => !ID_LIKE_COLS.has(c.toLowerCase()));
    return candidate.length ? candidate : listing.schema;
  }, [listing.schema]);

  const defaultCol = columns.includes('rentals_count') ? 'rentals_count' : columns[0] || listing.schema[0] || '';
  const [draft, setDraft] = useState<Draft>({
    op: 'AVG',
    column: defaultCol,
    filterCol: '',
    filterOp: 'eq',
    filterVal: '',
  });
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);

  const last = answers[0];
  const answersLeft = last ? last.answersLeft : purchase.token.answers_left;
  const epsBudget = listing.epsilon_budget;
  const epsRemaining = Math.max(0, epsBudget - listing.epsilon_spent);
  const canAsk = !closed && answersLeft > 0;

  const ask = async (d: Draft = draft) => {
    setDraft(d);
    setRunning(true);
    setError(null);
    const filtered = Boolean(d.filterCol && d.filterVal);
    try {
      const res = await executeEnclaveQuery({
        tokenId: purchase.token.token_id,
        listingId: listing.id,
        caller: account,
        query: {
          op: d.op,
          column: d.column,
          filterColumn: filtered ? d.filterCol : undefined,
          filterOp: filtered ? d.filterOp : undefined,
          filterValue: filtered ? d.filterVal : undefined,
          epsilon: EPSILON_PER_ANSWER,
        },
      });
      onAnswered({
        queryId: res.queryId,
        label: describe(d),
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
    } catch (err: unknown) {
      const e = err as Error & { code?: string };
      setError({ code: e.code || 'QUERY_REJECTED', message: e.message || 'The question could not be answered' });
      if (e.code !== 'K_ANONYMITY_VIOLATION') {
        toast('Question not answered', e.message, 'error');
      }
    } finally {
      setRunning(false);
    }
  };

  const privacyBlocked = error?.code === 'K_ANONYMITY_VIOLATION';

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="surface p-5 sm:p-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="q-op">
                Calculate the
              </label>
              <select
                id="q-op"
                className="field"
                value={draft.op}
                onChange={(e) => setDraft({ ...draft, op: e.target.value as QuerySpec['op'] })}
              >
                {(['AVG', 'SUM', 'COUNT', 'MIN', 'MAX'] as const).map((o) => (
                  <option key={o} value={o}>
                    {OP_LABELS[o]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="q-col">
                Of column
              </label>
              <select
                id="q-col"
                className="field font-mono"
                value={draft.column}
                onChange={(e) => setDraft({ ...draft, column: e.target.value })}
              >
                {listing.schema.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="q-fcol">
                Only where (optional)
              </label>
              <select
                id="q-fcol"
                className="field font-mono"
                value={draft.filterCol}
                onChange={(e) => setDraft({ ...draft, filterCol: e.target.value })}
              >
                <option value="">All rows</option>
                {listing.schema.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="q-fop">
                Condition
              </label>
              <select
                id="q-fop"
                className="field"
                disabled={!draft.filterCol}
                value={draft.filterOp}
                onChange={(e) => setDraft({ ...draft, filterOp: e.target.value as FilterOp })}
              >
                {OPS.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="q-fval">
                Value
              </label>
              <input
                id="q-fval"
                className="field font-mono"
                disabled={!draft.filterCol}
                value={draft.filterVal}
                onChange={(e) => setDraft({ ...draft, filterVal: e.target.value })}
                placeholder={draft.filterCol ? 'e.g. 1' : ''}
              />
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 border-t border-fg/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <Button
              size="lg"
              onClick={() => ask()}
              loading={running}
              disabled={!canAsk || !draft.column}
              icon={<Play className="h-4 w-4" />}
            >
              Get answer
            </Button>
            <span className="text-sm text-ink-300">{describe(draft)}</span>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={running || !canAsk}
              onClick={() => ask({ op: 'AVG', column: defaultCol, filterCol: '', filterOp: 'eq', filterVal: '' })}
              className="inline-flex h-10 items-center gap-1.5 rounded-full border border-fg/15 px-3.5 text-sm font-medium transition hover:border-fg/40 disabled:opacity-40"
            >
              <Sparkles className="h-4 w-4" /> Try: average of {defaultCol}
            </button>
            <button
              type="button"
              disabled={running || !canAsk}
              onClick={() =>
                ask({ op: 'AVG', column: defaultCol, filterCol: defaultCol, filterOp: 'gt', filterVal: '999999999' })
              }
              className="inline-flex h-10 items-center gap-1.5 rounded-full border border-dashed border-fg/30 px-3.5 text-sm text-ink-200 transition hover:border-fg/60 disabled:opacity-40"
            >
              <ShieldAlert className="h-4 w-4" /> Try a question that is too narrow
            </button>
          </div>

          {error && (
            <div className="mt-4 animate-scale-in rounded-2xl border border-fg/25 bg-ink-900 px-4 py-3.5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <ShieldAlert className="h-4 w-4" />
                {privacyBlocked ? 'Blocked to protect privacy' : 'Not answered'}
              </div>
              <div className="mt-1 text-sm leading-relaxed text-ink-300">
                {privacyBlocked
                  ? 'That question matches fewer than 20 rows, so answering it could single out one person. You were not charged an answer.'
                  : error.message}
              </div>
            </div>
          )}

          {!canAsk && (
            <p className="mt-4 text-sm text-ink-400">
              {closed
                ? 'This order is finished. Buy a new pass to ask more questions.'
                : 'You have used every answer in this pass.'}
            </p>
          )}
        </div>

        {/* Balance */}
        <div className="surface p-5 sm:p-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            <div className="rounded-2xl bg-ink-900 p-4">
              <div className="text-sm text-ink-400">Answers left</div>
              <div className="mt-1 font-display text-4xl leading-none tabular-nums">
                {answersLeft}
                <span className="text-xl text-ink-500"> / {purchase.token.answers_total}</span>
              </div>
            </div>
            <div className="rounded-2xl bg-ink-900 p-4">
              <div className="text-sm text-ink-400">Dataset privacy budget</div>
              <div className="mt-1 font-display text-4xl leading-none tabular-nums">
                {Math.round((epsRemaining / Math.max(0.1, epsBudget)) * 100)}%
              </div>
              <Bar value={epsBudget > 0 ? epsRemaining / epsBudget : 0} className="mt-3" />
            </div>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-ink-300">
            Each answer has a small, calibrated amount of random noise added (differential privacy). Trends stay
            accurate; single rows cannot be worked out.
          </p>
        </div>
      </div>

      {last && (
        <div key={last.queryId} className="surface animate-scale-in p-5 sm:p-7">
          <Pill tone="good">Answer, signed by the vault</Pill>
          <div className="mt-3 text-sm text-ink-300">{last.label}</div>
          <CountUp
            value={last.noisedValue}
            decimals={2}
            className="block font-display text-6xl leading-none tabular-nums sm:text-7xl"
          />
          <div className="mt-3 text-sm leading-relaxed text-ink-300">
            95% range{' '}
            <span className="font-mono text-fg">
              {last.confidenceInterval95[0].toFixed(1)} – {last.confidenceInterval95[1].toFixed(1)}
            </span>{' '}
            · from <span className="font-mono text-fg">{last.matchedRowsK}</span> matching rows
          </div>
          <details className="mt-5 rounded-xl border border-fg/10 px-4 py-3 text-sm">
            <summary className="cursor-pointer list-none font-medium text-ink-300 hover:text-fg">
              Show the signed receipt
            </summary>
            <div className="mt-2 divide-y divide-fg/[0.07]">
              <KV k="Query ID">
                <span className="font-mono text-xs">{last.queryId}</span>
              </KV>
              <KV k="Noise scale">
                <span className="font-mono text-xs">b = {last.laplaceScale.toFixed(2)}</span>
              </KV>
              <KV k="Result hash">
                <Hash value={last.resultHash} />
              </KV>
              <KV k="Vault signature">
                <Hash value={last.teeSig} />
              </KV>
            </div>
          </details>
        </div>
      )}

      {answers.length > 1 && (
        <div className="surface p-5 sm:p-6">
          <div className="text-base font-semibold">Earlier answers</div>
          <ul className="mt-2 divide-y divide-fg/[0.07]">
            {answers.slice(1).map((a) => (
              <li key={a.queryId} className="flex items-baseline justify-between gap-4 py-3 text-sm">
                <span className="min-w-0 text-ink-200">{a.label}</span>
                <span className="shrink-0 font-mono font-medium tabular-nums">{a.noisedValue.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
