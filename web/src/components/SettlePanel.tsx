import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { settleEscrowOnchain, type SettlementRecord } from '../lib/api';
import { money, shortAccount } from '../store';
import type { AnswerRecord, AppraisalOutcome, Purchase } from '../types';
import { Bar, Button, CheckLine, CountUp, Hash, KV, Pill, useToast } from '../ui/kit';

/** Finish an order: contributors are paid, or the buyer is refunded if quality fell short. */
export const SettlePanel: React.FC<{
  listingId: string;
  appraisal: AppraisalOutcome;
  purchase: Purchase;
  answers: AnswerRecord[];
  settlement: SettlementRecord | null;
  onSettled: (s: SettlementRecord) => void;
}> = ({ listingId, appraisal, purchase, answers, settlement, onSettled }) => {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const scorePct = Math.round(appraisal.report.score * 100);
  // The service makes the final call; this is what the signed quality check predicts.
  const delivered = answers[0]?.deliveredWithinRange ?? appraisal.report.score >= 0.5;

  const settle = async () => {
    setBusy(true);
    try {
      const s = await settleEscrowOnchain({ listingId, escrowId: purchase.escrowId });
      onSettled(s);
      toast(
        s.outcome === 'RELEASED' ? 'Contributors paid' : 'Refund sent',
        s.outcome === 'RELEASED'
          ? `${money(s.total_amount_usdc - s.platform_fee_usdc)} split across ${s.payouts.length} contributor${s.payouts.length === 1 ? '' : 's'}.`
          : `${money(s.total_amount_usdc)} returned to ${s.buyer} with no fee.`,
        'success'
      );
    } catch (err) {
      toast('Could not finish the order', err instanceof Error ? err.message : 'Please try again', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!settlement) {
    return (
      <div className="surface p-5 sm:p-7">
        <div className="space-y-3">
          <CheckLine ok={appraisal.signatureValid}>Quality check signed by the vault</CheckLine>
          <CheckLine ok={answers.length > 0 ? true : null}>
            {answers.length > 0
              ? `${answers.length} answer${answers.length > 1 ? 's' : ''} delivered`
              : 'No answers asked yet (you can still finish)'}
          </CheckLine>
          <CheckLine ok={delivered}>
            Quality {scorePct}% is {delivered ? 'above' : 'below'} the guarantee
          </CheckLine>
        </div>
        <p className="mt-5 max-w-2xl text-sm leading-relaxed text-ink-300">
          {delivered
            ? `Finishing releases your ${money(purchase.amountUsdc)} from escrow: 95% is split among the people who contributed rows, by how much each improved the data, and 5% is the platform fee.`
            : `This dataset missed its quality guarantee, so finishing returns your full ${money(purchase.amountUsdc)} with no fee.`}
        </p>
        <Button size="lg" className="mt-5 w-full sm:w-auto" onClick={settle} loading={busy}>
          {delivered ? `Finish and pay contributors` : `Claim my ${money(purchase.amountUsdc)} refund`}
        </Button>
      </div>
    );
  }

  const released = settlement.outcome === 'RELEASED';
  return (
    <div className="surface animate-scale-in p-5 sm:p-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Pill tone="good">
            <Check className="h-3 w-3" strokeWidth={3} /> {released ? 'Contributors paid' : 'Refunded in full'}
          </Pill>
          <div className="mt-3 font-display text-5xl leading-none">
            {released ? 'Order complete.' : 'Money returned.'}
          </div>
          <div className="mt-2 text-sm text-ink-300">
            {released
              ? `${money(settlement.total_amount_usdc)} total · ${money(settlement.platform_fee_usdc)} platform fee (5%)`
              : `${money(settlement.total_amount_usdc)} back to ${settlement.buyer} · $0.00 fee`}
          </div>
        </div>
        <div className="sm:text-right">
          <div className="text-sm text-ink-400">{released ? 'Paid to contributors' : 'Returned to you'}</div>
          <CountUp
            value={settlement.total_amount_usdc - settlement.platform_fee_usdc}
            decimals={2}
            prefix="$"
            className="font-display text-5xl leading-none tabular-nums"
          />
        </div>
      </div>

      <div className="mt-6 border-t border-fg/10 pt-5">
        <div className="text-sm font-semibold">{released ? 'Payout split' : 'Refund'}</div>
        <div className="mt-3 space-y-3">
          {settlement.payouts.map((p, i) => (
            <div
              key={p.account}
              className="grid animate-fade-up grid-cols-[minmax(0,6.5rem)_1fr_auto] items-center gap-3 text-sm"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <span className="truncate font-mono text-ink-100" title={p.account}>
                {shortAccount(p.account)}
              </span>
              <Bar value={p.weight_bps / 10000} />
              <span className="text-right font-mono tabular-nums">
                +{money(p.amount_usdc)}{' '}
                <span className="text-ink-400">{(p.weight_bps / 100).toFixed(0)}%</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <details className="mt-5 rounded-xl border border-fg/10 px-4 py-3 text-sm">
        <summary className="cursor-pointer list-none font-medium text-ink-300 hover:text-fg">Show the receipt</summary>
        <div className="mt-2 divide-y divide-fg/[0.07]">
          <KV k="Receipt ID">
            <span className="font-mono text-xs">{settlement.id}</span>
          </KV>
          <KV k="Escrow ID">
            <span className="font-mono text-xs">{settlement.escrow_id}</span>
          </KV>
          <KV k="Settlement hash">
            <Hash value={settlement.tx_hash} />
          </KV>
        </div>
      </details>
    </div>
  );
};
