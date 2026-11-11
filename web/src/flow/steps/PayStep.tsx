import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ShieldCheck } from 'lucide-react';
import { buyAnswersEscrow, NEAR_CONTRACT_ID, type Listing } from '../../lib/api';
import {
  executeOneClickIntent,
  fetchOneClickQuote,
  SOURCE_CHAIN_ASSETS,
  type OneClickQuoteResponse,
  type SupportedSourceChain,
} from '../../lib/intents';
import { Button, CountUp, cx, Hash, KV, Pill, Segmented, Spinner, useToast } from '../../ui/kit';
import type { AppraisalOutcome, Purchase } from '../types';

type Stage = 'idle' | 'routing' | 'minting' | 'done';

export const PayStep: React.FC<{
  listing: Listing;
  appraisal: AppraisalOutcome;
  account: string;
  purchase: Purchase | null;
  onPurchased: (p: Purchase) => void;
  onBack: () => void;
  onContinue: () => void;
}> = ({ listing, appraisal, account, purchase, onPurchased, onBack, onContinue }) => {
  const toast = useToast();
  const [answers, setAnswers] = useState(2);
  const [chain, setChain] = useState<SupportedSourceChain>('base');
  const [quote, setQuote] = useState<OneClickQuoteResponse | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [stage, setStage] = useState<Stage>(purchase ? 'done' : 'idle');

  const unit = Number(((appraisal.report.priceLow + appraisal.report.priceHigh) / 2).toFixed(2));
  const total = Number((unit * answers).toFixed(2));

  useEffect(() => {
    if (purchase) return;
    let cancelled = false;
    setQuoting(true);
    const t = setTimeout(() => {
      fetchOneClickQuote({
        sourceChain: chain,
        amountUsdc: total,
        buyerAccount: account,
        recipientContract: NEAR_CONTRACT_ID,
      })
        .then((q) => !cancelled && setQuote(q))
        .finally(() => !cancelled && setQuoting(false));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [chain, total, account, purchase]);

  const pay = async () => {
    try {
      setStage('routing');
      const q =
        quote ||
        (await fetchOneClickQuote({
          sourceChain: chain,
          amountUsdc: total,
          buyerAccount: account,
          recipientContract: NEAR_CONTRACT_ID,
        }));
      const intent = await executeOneClickIntent({
        quote: q,
        sourceChain: chain,
        amountUsdc: total,
        buyerAccount: account,
        recipientContract: NEAR_CONTRACT_ID,
      });
      setStage('minting');
      const out = await buyAnswersEscrow({
        listingId: listing.id,
        appraisalId: appraisal.report.appraisalId,
        answers,
        buyer: account,
        amountUsdc: total,
        sourceChain: chain,
        intentTxHash: intent.intentTxHash,
      });
      setStage('done');
      const newPurchase: Purchase = {
        token: out.token,
        escrowId: out.escrow.id,
        intentTxHash: intent.intentTxHash,
        amountUsdc: total,
        unitPriceUsdc: unit,
        answers,
        sourceChain: chain,
        quote: q,
      };
      onPurchased(newPurchase);
      toast('Payment held safely in escrow', `You unlocked ${out.token.answers_left} answers!`, 'success');
    } catch (err) {
      setStage('idle');
      toast('Checkout failed', err instanceof Error ? err.message : 'Could not complete payment', 'error');
    }
  };

  const stages: { key: Stage; label: string }[] = [
    { key: 'routing', label: 'Connecting your payment network…' },
    { key: 'minting', label: 'Holding payment in safe escrow & unlocking your pass…' },
    { key: 'done', label: 'Ready to ask questions!' },
  ];
  const order: Stage[] = ['idle', 'routing', 'minting', 'done'];
  const stageIdx = order.indexOf(stage);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-3xl tracking-tight sm:text-4xl">
            3. Quick Checkout
          </h2>
          <p className="mt-1 text-sm text-ink-300">
            Pay only for the number of answers you need. Your money stays in safe protection until your answers arrive.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onBack} icon={<ArrowLeft className="h-4 w-4" />}>
          Back to quality check
        </Button>
      </div>

      {purchase ? (
        <div className="surface animate-scale-in p-7 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Pill tone="solid">
                <Check className="h-3 w-3" strokeWidth={3} /> Order Protected in Escrow
              </Pill>
              <div className="mt-3 font-display text-4xl">
                ${purchase.amountUsdc.toFixed(2)} <span className="text-ink-400">USDC</span>
              </div>
              <p className="mt-1 text-xs text-ink-300">
                You have <span className="font-semibold text-white">{purchase.answers} answers</span> ready to use on{' '}
                <span className="text-white">{listing.title}</span>.
              </p>
            </div>
            <Button size="lg" onClick={onContinue} trailing={<ArrowRight className="h-4 w-4" />}>
              Ask your questions now
            </Button>
          </div>

          <details className="mt-6 rounded-2xl border border-white/10 px-4 py-3 text-xs text-ink-400">
            <summary className="cursor-pointer list-none font-medium text-ink-300">
              View receipt & pass details ({purchase.token.token_id})
            </summary>
            <div className="mt-3 grid gap-x-10 sm:grid-cols-2">
              <KV k="Answer pass ID"><span className="font-mono text-xs">{purchase.token.token_id}</span></KV>
              <KV k="Escrow ID"><span className="font-mono text-xs">{purchase.escrowId}</span></KV>
              <KV k="Paid with"><span className="text-xs">{SOURCE_CHAIN_ASSETS[purchase.sourceChain].label}</span></KV>
              <KV k="Transaction"><Hash value={purchase.intentTxHash} /></KV>
            </div>
          </details>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <div className="surface p-7">
            <div className="label">How many answers do you want?</div>
            <Segmented
              value={answers}
              onChange={setAnswers}
              options={[1, 2, 3, 5].map((n) => ({
                value: n,
                label: `${n} answer${n > 1 ? 's' : ''} ($${(n * unit).toFixed(2)})`,
              }))}
            />

            <div className="label mt-7">Pay with (1-Click cross-chain checkout)</div>
            <Segmented
              value={chain}
              onChange={setChain}
              options={(Object.keys(SOURCE_CHAIN_ASSETS) as SupportedSourceChain[]).map((c) => ({
                value: c,
                label: SOURCE_CHAIN_ASSETS[c].label,
              }))}
            />

            <div className="mt-8 flex items-end justify-between gap-4 border-t border-white/[0.08] pt-6">
              <div>
                <div className="text-xs text-ink-400">
                  Total ({answers} × ${unit.toFixed(2)} per answer)
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <CountUp
                    value={total}
                    decimals={2}
                    duration={400}
                    prefix="$"
                    className="font-display text-5xl tabular-nums"
                  />
                  <span className="text-sm text-ink-400">USDC</span>
                </div>
              </div>
              <Button size="lg" onClick={pay} loading={stage !== 'idle'} disabled={quoting && !quote}>
                {stage === 'idle' ? `Pay $${total.toFixed(2)} & Unlock Answers` : 'Completing checkout…'}
              </Button>
            </div>

            {stage !== 'idle' && (
              <div className="mt-6 space-y-2.5 border-t border-white/[0.06] pt-4">
                {stages.map((s, i) => {
                  const done = stageIdx > i + 1 || (s.key === 'done' && stage === 'done');
                  const current = stageIdx === i + 1 && stage !== 'done';
                  return (
                    <div
                      key={s.key}
                      className="flex animate-fade-up items-center gap-3 text-xs"
                      style={{ animationDelay: `${i * 80}ms` }}
                    >
                      <span
                        className={cx(
                          'flex h-5 w-5 items-center justify-center rounded-full',
                          done ? 'bg-white text-black' : 'border border-white/20'
                        )}
                      >
                        {done ? <Check className="h-3 w-3" strokeWidth={3} /> : current ? <Spinner className="h-3 w-3" /> : null}
                      </span>
                      <span className={done || current ? 'text-white' : 'text-ink-500'}>{s.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="surface flex flex-col justify-between p-7">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-white">
                <ShieldCheck className="h-4 w-4" />
                <span>100% Money-Back Buyer Protection</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-ink-300">
                Your payment isn&apos;t sent to the seller right away. It&apos;s held in a neutral escrow account and only
                released once your answers are delivered at the promised quality — otherwise you get a full refund with
                zero fees.
              </p>

              <div className="mt-6 space-y-2 rounded-3xl bg-white/[0.03] p-4 text-xs">
                <div className="flex justify-between">
                  <span className="text-ink-400">Dataset</span>
                  <span className="font-medium text-white">{listing.title}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-400">Quality score</span>
                  <span className="font-mono text-white">{Math.round(appraisal.report.score * 100)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-400">Estimated arrival</span>
                  <span className="font-mono text-white">~{quote?.timeEstimateSeconds ?? 4} seconds</span>
                </div>
              </div>
            </div>

            <details className="mt-6 rounded-2xl border border-white/10 px-4 py-2.5 text-xs text-ink-400">
              <summary className="cursor-pointer list-none font-medium text-ink-300">
                View cross-chain quote details (NEAR Intents)
              </summary>
              <div className="mt-2 divide-y divide-white/[0.06]">
                <KV k="Quote ID"><span className="font-mono text-xs">{quote?.quoteId ?? '—'}</span></KV>
                <KV k="Deposit address"><Hash value={quote?.depositAddress ?? ''} /></KV>
                <KV k="Escrow contract"><span className="font-mono text-xs">{NEAR_CONTRACT_ID}</span></KV>
              </div>
            </details>
          </div>
        </div>
      )}
    </div>
  );
};
