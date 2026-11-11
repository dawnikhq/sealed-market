import React, { useState } from 'react';
import { ArrowLeft, ArrowUpRight, Check, RotateCcw } from 'lucide-react';
import { settleEscrowOnchain, type Listing, type SettlementRecord } from '../../lib/api';
import { Bar, Button, CheckLine, CountUp, Hash, KV, Pill, useToast } from '../../ui/kit';
import type { AnswerRecord, AppraisalOutcome, Purchase } from '../types';

export const SettleStep: React.FC<{
  listing: Listing;
  appraisal: AppraisalOutcome;
  purchase: Purchase;
  answers: AnswerRecord[];
  settlement: SettlementRecord | null;
  onSettled: (s: SettlementRecord) => void;
  onBack: () => void;
  onRestart: () => void;
}> = ({ listing, appraisal, purchase, answers, settlement, onSettled, onBack, onRestart }) => {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const delivered = answers[0]?.deliveredWithinRange ?? appraisal.report.score >= 0.5;

  const settle = async () => {
    setBusy(true);
    try {
      const s = await settleEscrowOnchain({
        listingId: listing.id,
        escrowId: purchase.escrowId,
        deliveredWithinRange: delivered,
      });
      onSettled(s);
      toast(
        s.outcome === 'RELEASED' ? 'Payment distributed to contributors!' : 'Full refund sent back to you!',
        s.outcome === 'RELEASED'
          ? `$${(s.total_amount_usdc - s.platform_fee_usdc).toFixed(2)} shared fairly across ${s.payouts.length} contributors.`
          : `$${s.total_amount_usdc.toFixed(2)} returned to ${s.buyer} with $0 fee.`,
        'success'
      );
    } catch (err) {
      toast('Could not finalize order', err instanceof Error ? err.message : 'Error', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-3xl tracking-tight sm:text-4xl">
            5. Complete Order & Automatic Payout
          </h2>
          <p className="mt-1 text-sm text-ink-300">
            {delivered
              ? 'Your answers met the quality guarantee — release the payment so every data contributor gets their fair share.'
              : 'This dataset fell below the quality guarantee — claim a 100% automatic refund right now.'}
          </p>
        </div>
        {!settlement && (
          <Button variant="ghost" size="sm" onClick={onBack} icon={<ArrowLeft className="h-4 w-4" />}>
            Ask another question
          </Button>
        )}
      </div>

      {!settlement ? (
        <div className="surface p-7 sm:p-9">
          <div className="text-sm font-medium text-white">Order Summary & Buyer Protection Check</div>
          <div className="mt-5 space-y-3">
            <CheckLine ok={appraisal.signatureValid}>
              Quality check verified by the private vault
            </CheckLine>
            <CheckLine ok={answers.length > 0 || null}>
              {answers.length > 0
                ? `${answers.length} private answer${answers.length > 1 ? 's' : ''} delivered to you`
                : 'Ready to finalize order'}
            </CheckLine>
            <CheckLine ok={delivered}>
              Dataset quality ({Math.round(appraisal.report.score * 100)}%) is{' '}
              {delivered ? 'above the quality guarantee' : 'below the quality guarantee — eligible for 100% refund'}
            </CheckLine>
          </div>

          <p className="mt-6 max-w-2xl text-xs leading-relaxed text-ink-300">
            {delivered
              ? 'When you click Finish below, 95% of your payment is automatically split among the people who contributed rows (based on how much each person improved the data), and 5% goes to platform maintenance.'
              : 'Because this dataset failed the quality standard, clicking below returns 100% of your escrowed payment back to your account with zero fees.'}
          </p>

          <div className="mt-7">
            <Button size="lg" onClick={settle} loading={busy}>
              {delivered
                ? `Finish & Pay Contributors ($${purchase.amountUsdc.toFixed(2)})`
                : `Claim 100% Full Refund ($${purchase.amountUsdc.toFixed(2)})`}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="surface relative overflow-hidden p-7 sm:p-10">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div>
                <Pill tone="solid">
                  <Check className="h-3 w-3" strokeWidth={3} />{' '}
                  {settlement.outcome === 'RELEASED' ? 'Order Complete · Contributors Paid' : '100% Refunded to You'}
                </Pill>
                <div className="mt-4 font-display text-5xl leading-none sm:text-6xl">
                  {settlement.outcome === 'RELEASED' ? 'Thank you!' : 'Money refunded.'}
                </div>
                <div className="mt-3 text-sm text-ink-300">
                  {settlement.outcome === 'RELEASED'
                    ? `$${settlement.total_amount_usdc.toFixed(2)} total · $${settlement.platform_fee_usdc.toFixed(2)} platform fee (5%)`
                    : `$${settlement.total_amount_usdc.toFixed(2)} returned to ${settlement.buyer} · $0.00 fee`}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-ink-400">
                  {settlement.outcome === 'RELEASED' ? 'Paid to contributors' : 'Returned to you'}
                </div>
                <CountUp
                  value={settlement.total_amount_usdc - settlement.platform_fee_usdc}
                  decimals={2}
                  prefix="$"
                  className="font-display text-5xl tabular-nums"
                />
              </div>
            </div>

            <div className="mt-8 border-t border-white/[0.08] pt-6">
              <div className="text-xs font-medium text-ink-300">
                {settlement.outcome === 'RELEASED' ? 'Automatic payout split' : 'Refund recipient'}
              </div>
              <div className="mt-4 space-y-3">
                {settlement.payouts.map((p, i) => (
                  <div
                    key={p.account}
                    className="grid animate-fade-up grid-cols-[minmax(0,180px)_1fr_auto] items-center gap-4 text-sm"
                    style={{ animationDelay: `${i * 80}ms` }}
                  >
                    <span className="truncate font-mono text-xs text-ink-200">{p.account}</span>
                    <Bar value={p.weight_bps / 10000} />
                    <span className="w-36 text-right font-mono text-xs">
                      +${p.amount_usdc.toFixed(2)}{' '}
                      <span className="text-ink-500">({(p.weight_bps / 100).toFixed(0)}%)</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <details className="mt-6 rounded-2xl border border-white/10 px-4 py-2.5 text-xs text-ink-400">
              <summary className="cursor-pointer list-none font-medium text-ink-300">
                View onchain receipt ({settlement.id})
              </summary>
              <div className="mt-2 grid gap-x-10 sm:grid-cols-3">
                <KV k="Receipt ID"><span className="font-mono text-xs">{settlement.id}</span></KV>
                <KV k="Escrow ID"><span className="font-mono text-xs">{settlement.escrow_id}</span></KV>
                <KV k="Transaction"><Hash value={settlement.tx_hash} /></KV>
              </div>
            </details>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <Button onClick={onRestart} icon={<RotateCcw className="h-4 w-4" />}>
              Explore another dataset
            </Button>
            <a
              href={`https://testnet.nearblocks.io/txns/${settlement.tx_hash}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-full border border-white/15 px-5 text-sm text-white transition hover:border-white/40"
            >
              View transaction receipt <ArrowUpRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
};
