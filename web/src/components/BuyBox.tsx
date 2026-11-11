import React, { useEffect, useState } from 'react';
import { Check, Lock, ShieldCheck } from 'lucide-react';
import { buyAnswersEscrow, NEAR_CONTRACT_ID, type Listing } from '../lib/api';
import {
  executeOneClickIntent,
  fetchOneClickQuote,
  SOURCE_CHAIN_ASSETS,
  type OneClickQuoteResponse,
  type SupportedSourceChain,
} from '../lib/intents';
import { money } from '../store';
import type { AppraisalOutcome, Purchase } from '../types';
import { Button, cx, Hash, KV, Spinner, useToast } from '../ui/kit';

type Stage = 'idle' | 'routing' | 'minting';
const QUANTITIES = [1, 2, 3, 5];

/** The purchase card on a dataset page: quantity, payment network, total, pay. */
export const BuyBox: React.FC<{
  listing: Listing;
  appraisal: AppraisalOutcome | null;
  account: string;
  onPurchased: (p: Purchase) => void;
}> = ({ listing, appraisal, account, onPurchased }) => {
  const toast = useToast();
  const [answers, setAnswers] = useState(2);
  const [chain, setChain] = useState<SupportedSourceChain>('base');
  const [quote, setQuote] = useState<OneClickQuoteResponse | null>(null);
  const [stage, setStage] = useState<Stage>('idle');

  const report = appraisal?.report ?? null;
  const unit = report ? Number(((report.priceLow + report.priceHigh) / 2).toFixed(2)) : null;
  const total = unit != null ? Number((unit * answers).toFixed(2)) : null;
  const good = report ? report.score >= 0.5 : true;
  const epsLeft = Math.max(0, listing.epsilon_budget - listing.epsilon_spent);
  const answersAvailable = Math.floor(epsLeft / 0.5 + 1e-9);
  const soldOut = answersAvailable <= 0;

  useEffect(() => {
    if (total == null) return;
    let cancelled = false;
    setQuote(null);
    const t = setTimeout(() => {
      fetchOneClickQuote({
        sourceChain: chain,
        amountUsdc: total,
        buyerAccount: account,
        recipientContract: NEAR_CONTRACT_ID,
      })
        .then((q) => !cancelled && setQuote(q))
        .catch(() => undefined);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [chain, total, account]);

  const pay = async () => {
    if (!report || unit == null || total == null) return;
    try {
      setStage('routing');
      const args = {
        sourceChain: chain,
        amountUsdc: total,
        buyerAccount: account,
        recipientContract: NEAR_CONTRACT_ID,
      };
      const q = quote || (await fetchOneClickQuote(args));
      const intent = await executeOneClickIntent({ quote: q, ...args });
      setStage('minting');
      const out = await buyAnswersEscrow({
        listingId: listing.id,
        appraisalId: report.appraisalId,
        answers,
        buyer: account,
        amountUsdc: total,
        sourceChain: chain,
        intentTxHash: intent.intentTxHash,
      });
      toast('Payment is in escrow', `${out.token.answers_left} answers unlocked.`, 'success');
      onPurchased({
        token: out.token,
        escrowId: out.escrow.id,
        intentTxHash: intent.intentTxHash,
        amountUsdc: total,
        unitPriceUsdc: unit,
        answers,
        sourceChain: chain,
        quote: q,
      });
    } catch (err) {
      toast('Checkout failed', err instanceof Error ? err.message : 'Could not complete payment', 'error');
    } finally {
      setStage('idle');
    }
  };

  return (
    <div id="buy" className="surface scroll-mt-24 p-5 sm:p-6">
      <div className="flex items-baseline gap-1.5">
        {unit != null ? (
          <span className="font-display text-5xl leading-none tabular-nums">{money(unit)}</span>
        ) : (
          <span className="skeleton inline-block h-11 w-28" />
        )}
        <span className="text-base text-ink-400">per answer</span>
      </div>
      <p className="mt-1.5 text-sm text-ink-300">
        The midpoint of the fair price range from the free quality check.
      </p>

      <div className="mt-5">
        <div className="label">How many answers?</div>
        <div className="grid grid-cols-4 gap-2">
          {QUANTITIES.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setAnswers(n)}
              disabled={n > Math.max(1, answersAvailable)}
              className={cx(
                'h-12 rounded-xl border text-base font-semibold tabular-nums transition disabled:cursor-not-allowed disabled:opacity-35',
                answers === n ? 'border-fg bg-fg text-card' : 'border-fg/15 hover:border-fg/40'
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <label className="label" htmlFor="buy-chain">
          Pay with
        </label>
        <select
          id="buy-chain"
          className="field"
          value={chain}
          onChange={(e) => setChain(e.target.value as SupportedSourceChain)}
        >
          {(Object.keys(SOURCE_CHAIN_ASSETS) as SupportedSourceChain[]).map((c) => (
            <option key={c} value={c}>
              {SOURCE_CHAIN_ASSETS[c].label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-5 space-y-2 border-t border-fg/10 pt-4 text-sm">
        <div className="flex justify-between text-ink-300">
          <span>
            {answers} answer{answers > 1 ? 's' : ''} × {unit != null ? money(unit) : '…'}
          </span>
          <span className="tabular-nums">{total != null ? money(total) : '…'}</span>
        </div>
        <div className="flex justify-between text-ink-300">
          <span>Buyer fee</span>
          <span>$0.00</span>
        </div>
        <div className="flex items-baseline justify-between pt-1 text-base font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{total != null ? `${money(total)} USDC` : '…'}</span>
        </div>
      </div>

      <Button
        size="lg"
        className="mt-4 w-full"
        onClick={pay}
        loading={stage !== 'idle'}
        disabled={!report || soldOut}
        icon={<Lock className="h-4 w-4" />}
      >
        {soldOut
          ? 'Privacy budget used up'
          : stage === 'routing'
            ? 'Routing your payment…'
            : stage === 'minting'
              ? 'Placing it in escrow…'
              : total != null
                ? `Pay ${money(total)} and unlock answers`
                : 'Checking quality…'}
      </Button>

      {stage !== 'idle' && (
        <div className="mt-3 space-y-2 text-sm">
          {[
            { key: 'routing', label: 'Routing payment from your network' },
            { key: 'minting', label: 'Holding it in escrow and issuing your answer pass' },
          ].map((s, i) => {
            const done = stage === 'minting' && i === 0;
            const current = stage === s.key;
            return (
              <div key={s.key} className="flex items-center gap-2.5">
                <span
                  className={cx(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                    done ? 'bg-fg text-card' : 'border border-fg/20'
                  )}
                >
                  {done ? <Check className="h-3 w-3" strokeWidth={3} /> : current ? <Spinner className="h-3 w-3" /> : null}
                </span>
                <span className={done || current ? 'text-fg' : 'text-ink-500'}>{s.label}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-ink-900 p-3.5 text-sm leading-relaxed text-ink-200">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          {good ? (
            <>
              <b className="font-semibold text-fg">Money-back protection.</b> Your payment waits in escrow and is
              refunded in full if the data misses its quality guarantee.
            </>
          ) : (
            <>
              <b className="font-semibold text-fg">This dataset is below the quality guarantee.</b> If you buy, the
              order settles as a 100% refund with no fee.
            </>
          )}
        </span>
      </div>

      <p className="mt-3 text-center text-sm text-ink-400">
        {soldOut
          ? listing.is_sample
            ? 'This sample’s budget refills within the hour.'
            : 'This dataset has answered all the questions its privacy budget allows.'
          : `${answersAvailable} answer${answersAvailable === 1 ? '' : 's'} left in this dataset’s privacy budget`}
      </p>

      <p className="mt-1 text-center text-xs text-ink-400">Testnet preview: payments are simulated and no real funds move.</p>

      <details className="mt-3 rounded-xl border border-fg/10 px-4 py-3 text-sm">
        <summary className="cursor-pointer list-none font-medium text-ink-300 hover:text-fg">
          Payment route details
        </summary>
        <div className="mt-2 divide-y divide-fg/[0.07]">
          <KV k="Arrives in">
            <span className="font-mono text-xs">~{quote?.timeEstimateSeconds ?? 4} seconds</span>
          </KV>
          <KV k="Quote ID">
            <span className="font-mono text-xs">{quote?.quoteId ?? '…'}</span>
          </KV>
          <KV k="Deposit address">
            <Hash value={quote?.depositAddress ?? ''} />
          </KV>
          <KV k="Escrow contract">
            <span className="font-mono text-xs">{NEAR_CONTRACT_ID}</span>
          </KV>
        </div>
      </details>
    </div>
  );
};
