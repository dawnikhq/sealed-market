import React, { useEffect, useState } from 'react';
import { Check, KeyRound, Play, X } from 'lucide-react';
import {
  buyAnswersEscrow,
  executeEnclaveQuery,
  fetchAttestation,
  generateAgentFunctionCallKey,
  NEAR_CONTRACT_ID,
  runPrivateAppraisal,
  settleEscrowOnchain,
} from '../lib/api';
import {
  generateFreshNonceHex,
  verifyAppraisalSignatureClientSide,
  verifyAttestationClientSide,
} from '../lib/crypto';
import {
  executeOneClickIntent,
  fetchOneClickQuote,
  SOURCE_CHAIN_ASSETS,
  type SupportedSourceChain,
} from '../lib/intents';
import { money, shortAccount, useStore } from '../store';
import { Button, cx, Hash, useToast } from '../ui/kit';

interface LogLine {
  num: number;
  title: string;
  detail: string;
  hash?: string;
  ok: boolean;
}

const METHODS = ['buy', 'log_query', 'settle'];
const PLAN = [
  'Create a spending key with a hard limit',
  'Check the vault is genuine',
  'Run the free quality check',
  'Pay into escrow if your rules pass',
  'Ask one question',
  'Settle: pay contributors or take the refund',
];

/** A budget-capped bot that runs the whole purchase with no clicks. */
export const AutoBuyPage: React.FC = () => {
  const toast = useToast();
  const { listings, account, reload } = useStore();
  const [targetId, setTargetId] = useState('');
  const [allowanceNear, setAllowanceNear] = useState('5');
  const [minScore, setMinScore] = useState(70);
  const [maxPrice, setMaxPrice] = useState(5);
  const [chain, setChain] = useState<SupportedSourceChain>('base');
  const [key, setKey] = useState(() =>
    generateAgentFunctionCallKey({ contractId: NEAR_CONTRACT_ID, allowedMethods: METHODS, allowanceNear: '5' })
  );
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<LogLine[]>([]);

  useEffect(() => {
    if (!targetId && listings.length > 0) setTargetId(listings[0].id);
  }, [listings, targetId]);

  const run = async () => {
    const target = listings.find((l) => l.id === targetId);
    if (!target) return;
    const bot = account || 'agent.sealed.near';
    const minScoreRule = minScore / 100;
    setRunning(true);
    setLogs([]);
    const log = (line: LogLine) => setLogs((prev) => [...prev, line]);

    try {
      const k = generateAgentFunctionCallKey({
        contractId: NEAR_CONTRACT_ID,
        allowedMethods: METHODS,
        allowanceNear: allowanceNear || '5',
      });
      setKey(k);
      log({
        num: 1,
        title: 'Created a spending key',
        detail: `${shortAccount(bot)} can only buy, ask and settle, up to ${allowanceNear || '5'} NEAR.`,
        hash: k.publicKey,
        ok: true,
      });

      const nonce = generateFreshNonceHex();
      const att = await fetchAttestation(nonce);
      const attCheck = await verifyAttestationClientSide(att, nonce);
      if (!attCheck.valid) throw new Error('The vault failed its security check');
      log({
        num: 2,
        title: 'Vault verified',
        detail: 'Fresh challenge answered and signature checked in this browser.',
        hash: att.signature,
        ok: true,
      });

      const rep = await runPrivateAppraisal({
        listingId: target.id,
        taskSpec: 'Evaluate predictive utility and data quality across all columns',
      });
      const sig = await verifyAppraisalSignatureClientSide({
        listingId: rep.listingId,
        taskHash: rep.taskHash,
        score: rep.score,
        priceLow: rep.priceLow,
        priceHigh: rep.priceHigh,
        attestationRef: rep.attestationRef,
        teePubkey: rep.teePubkey,
        teeSig: rep.teeSig,
      });
      if (!sig.valid) throw new Error('The quality report signature is not valid');

      const price = Number(((rep.priceLow + rep.priceHigh) / 2).toFixed(2));
      const passesQuality = rep.score >= minScoreRule;
      log({
        num: 3,
        title: `Quality ${Math.round(rep.score * 100)}%, price ${money(price)} per answer`,
        detail: `Your rules: at least ${minScore}% quality, at most ${money(maxPrice)}.`,
        hash: rep.teeSig,
        ok: passesQuality && price <= maxPrice,
      });

      if (!passesQuality) {
        log({
          num: 4,
          title: 'Did not buy: quality is below your minimum',
          detail: 'Nothing was spent.',
          ok: false,
        });
        return;
      }
      if (price > maxPrice) {
        log({
          num: 4,
          title: 'Did not buy: price is above your maximum',
          detail: `${money(price)} is more than ${money(maxPrice)}. Nothing was spent.`,
          ok: false,
        });
        return;
      }

      const payArgs = { sourceChain: chain, amountUsdc: price, buyerAccount: bot };
      const quote = await fetchOneClickQuote(payArgs);
      const intent = await executeOneClickIntent({ quote, ...payArgs });
      const bought = await buyAnswersEscrow({
        listingId: target.id,
        appraisalId: rep.appraisalId,
        answers: 1,
        buyer: bot,
        amountUsdc: price,
        sourceChain: chain,
        intentTxHash: intent.intentTxHash,
      });
      log({
        num: 4,
        title: `Paid ${money(price)} into escrow`,
        detail: `From ${SOURCE_CHAIN_ASSETS[chain].label}. Answer pass issued.`,
        hash: intent.intentTxHash,
        ok: true,
      });

      const column = target.schema.find((c) => c !== 'contributor') || target.schema[0] || 'id';
      const answer = await executeEnclaveQuery({
        tokenId: bought.token.token_id,
        listingId: target.id,
        caller: bot,
        query: { op: 'COUNT', column, epsilon: 0.5 },
      });
      log({
        num: 5,
        title: `Answer received: about ${answer.result.noisedValue.toFixed(1)} rows`,
        detail: `Count of ${column} across ${answer.result.matchedRowsK} rows. No rows were shown.`,
        hash: answer.resultHash,
        ok: true,
      });

      const settled = await settleEscrowOnchain({ listingId: target.id, escrowId: bought.escrow.id });
      log({
        num: 6,
        title:
          settled.outcome === 'RELEASED'
            ? 'Settled: contributors paid'
            : `Settled: ${money(settled.total_amount_usdc)} refunded`,
        detail: settled.payouts.map((p) => `${shortAccount(p.account)} +${money(p.amount_usdc)}`).join(' · '),
        hash: settled.tx_hash,
        ok: true,
      });
      toast('Auto-buy finished', `Order ${bought.escrow.id} is settled.`, 'success');
    } catch (err) {
      toast('The bot stopped', err instanceof Error ? err.message : 'Something went wrong', 'error');
    } finally {
      setRunning(false);
      reload();
    }
  };

  return (
    <div className="container-page py-6 sm:py-10">
      <div className="max-w-3xl">
        <h1 className="font-display text-4xl leading-[1.05] tracking-tight sm:text-6xl">
          Let a bot buy within your rules.
        </h1>
        <p className="mt-3 text-base leading-relaxed text-ink-300 sm:text-lg">
          Set a minimum quality and a maximum price. The bot checks the dataset, buys one answer if your rules
          pass, and settles the order. Its key cannot spend more than the limit you set.
        </p>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="surface p-5 sm:p-6">
          <div className="text-base font-semibold">Rules</div>
          <div className="mt-4 space-y-4">
            <div>
              <label className="label" htmlFor="bot-ds">
                Dataset
              </label>
              <select
                id="bot-ds"
                className="field"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                disabled={listings.length === 0}
              >
                {listings.length === 0 ? (
                  <option value="">No datasets listed yet</option>
                ) : (
                  listings.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.title}
                    </option>
                  ))
                )}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="bot-score">
                  Minimum quality (%)
                </label>
                <input
                  id="bot-score"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={100}
                  step={5}
                  className="field font-mono"
                  value={minScore}
                  onChange={(e) => setMinScore(Math.max(0, Math.min(100, Number(e.target.value))))}
                />
              </div>
              <div>
                <label className="label" htmlFor="bot-price">
                  Maximum price ($)
                </label>
                <input
                  id="bot-price"
                  type="number"
                  inputMode="decimal"
                  min={1}
                  step={0.5}
                  className="field font-mono"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="label" htmlFor="bot-cap">
                  Key spend limit (NEAR)
                </label>
                <input
                  id="bot-cap"
                  inputMode="decimal"
                  className="field font-mono"
                  value={allowanceNear}
                  onChange={(e) => setAllowanceNear(e.target.value.replace(/[^0-9.]/g, ''))}
                />
              </div>
              <div>
                <label className="label" htmlFor="bot-chain">
                  Pay from
                </label>
                <select
                  id="bot-chain"
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
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-ink-900 px-4 py-3 text-sm">
              <span className="flex min-w-0 items-center gap-2 text-ink-300">
                <KeyRound className="h-4 w-4 shrink-0" />
                <Hash value={key.publicKey} head={12} tail={6} />
              </span>
              <span className="shrink-0 text-ink-400">buy · ask · settle only</span>
            </div>
            <Button
              size="lg"
              className="w-full"
              onClick={run}
              loading={running}
              disabled={!targetId}
              icon={<Play className="h-4 w-4" />}
            >
              {running ? 'Running…' : 'Run auto-buy'}
            </Button>
          </div>
        </div>

        <div className="surface p-5 sm:p-6">
          <div className="text-base font-semibold">Activity</div>
          <ol className="mt-4 space-y-2.5">
            {PLAN.map((planned, i) => {
              const line = logs.find((l) => l.num === i + 1);
              const pending = !line;
              const active = running && pending && logs.length === i;
              return (
                <li
                  key={planned}
                  className={cx(
                    'flex items-start gap-3 rounded-2xl border p-3.5 transition',
                    line ? 'animate-fade-up border-fg/15 bg-card' : 'border-transparent bg-ink-900',
                    active && 'border-fg/30'
                  )}
                >
                  <span
                    className={cx(
                      'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-xs',
                      line?.ok
                        ? 'bg-fg text-card'
                        : line
                          ? 'bg-bad text-white'
                          : 'border border-fg/20 text-ink-400'
                    )}
                  >
                    {line?.ok ? (
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    ) : line ? (
                      <X className="h-3.5 w-3.5" strokeWidth={3} />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className={cx('text-sm font-medium', pending && 'text-ink-400')}>
                      {line ? line.title : planned}
                    </div>
                    {line && <p className="mt-0.5 text-sm text-ink-300">{line.detail}</p>}
                    {line?.hash && <Hash value={line.hash} head={10} tail={6} className="mt-1" />}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
};
