import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Bot,
  Check,
  ExternalLink,
  KeyRound,
  Lock,
  LogOut,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wallet,
  X,
} from 'lucide-react';
import {
  buyAnswersEscrow,
  consumeNearWalletCallback,
  createGaslessNamedAccount,
  executeEnclaveQuery,
  fetchAttestation,
  fetchListings,
  fetchQueries,
  fetchSettlements,
  generateAgentFunctionCallKey,
  getNearWalletSelector,
  NEAR_CONTRACT_ID,
  runPrivateAppraisal,
  settleEscrowOnchain,
  signInWithMyNearWallet,
  signOutNearWallet,
  type Listing,
  type QueryLogRecord,
  type SettlementRecord,
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
import { Button, cx, Hash, Pill, SealMark, Spinner, useToast } from '../ui/kit';
import { GuideTriggerButton, OnboardingModal, ONBOARDING_STORAGE_KEY } from './OnboardingModal';
import { AppraiseStep } from './steps/AppraiseStep';
import { AskStep } from './steps/AskStep';
import { DatasetStep } from './steps/DatasetStep';
import { PayStep } from './steps/PayStep';
import { SettleStep } from './steps/SettleStep';
import { VerifyStep } from './steps/VerifyStep';
import type { AnswerRecord, AppraisalOutcome, Purchase, VerifiedEnclave } from './types';

type ActiveStage = 1 | 2 | 3 | 4 | 5;

interface AgentStepLog {
  id: string;
  num: number;
  title: string;
  detail: string;
  hash?: string;
  ok: boolean;
}

export const Flow: React.FC = () => {
  const toast = useToast();

  // Remote state (real backend data only)
  const [listings, setListings] = useState<Listing[]>([]);
  const [queries, setQueries] = useState<QueryLogRecord[]>([]);
  const [settlements, setSettlements] = useState<SettlementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [backendError, setBackendError] = useState<string | null>(null);

  // Connected user account (from NEAR Wallet or created via email in Seller flow)
  const [account, setAccount] = useState<string>(() => {
    try {
      return localStorage.getItem('sealed_market_user_account') || '';
    } catch {
      return '';
    }
  });
  const [accountPubKey, setAccountPubKey] = useState<string>(() => {
    try {
      return localStorage.getItem('sealed_market_user_pubkey') || '';
    } catch {
      return '';
    }
  });
  const [walletMode, setWalletMode] = useState<string>(() => {
    try {
      return localStorage.getItem('sealed_market_wallet_mode') || '';
    } catch {
      return '';
    }
  });
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [accountInput, setAccountInput] = useState('');
  const [gaslessInput, setGaslessInput] = useState('');
  const [connectingWallet, setConnectingWallet] = useState<'testnet' | 'mainnet' | 'gasless' | null>(
    null
  );

  // Onboarding guide modal (auto-opens on first landing for a brand-new user)
  const [showGuide, setShowGuide] = useState<boolean>(() => {
    try {
      return localStorage.getItem(ONBOARDING_STORAGE_KEY) !== 'seen';
    } catch {
      return true;
    }
  });

  // Seller form toggle inside Step 1
  const [sealingOpen, setSealingOpen] = useState(false);

  // Focused 5-step Web2 wizard state
  const [stage, setStage] = useState<ActiveStage>(1);
  const [enclave, setEnclave] = useState<VerifiedEnclave | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [appraisal, setAppraisal] = useState<AppraisalOutcome | null>(null);
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [settlement, setSettlement] = useState<SettlementRecord | null>(null);

  // Modals / drawers
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [showBotDrawer, setShowBotDrawer] = useState(false);

  // Auto-Buy Bot state
  const [botTargetId, setBotTargetId] = useState<string>('');
  const [allowanceNear, setAllowanceNear] = useState('5');
  const [minScoreRule, setMinScoreRule] = useState(0.7);
  const [maxPriceRule, setMaxPriceRule] = useState(5.0);
  const [agentChain, setAgentChain] = useState<SupportedSourceChain>('base');
  const [agentKey, setAgentKey] = useState(() =>
    generateAgentFunctionCallKey({
      contractId: NEAR_CONTRACT_ID,
      allowedMethods: ['buy', 'log_query', 'settle'],
      allowanceNear: '5',
    })
  );
  const [runningAgent, setRunningAgent] = useState(false);
  const [agentLogs, setAgentLogs] = useState<AgentStepLog[]>([]);

  const loadAll = useCallback(async () => {
    try {
      setBackendError(null);
      const [l, q, s] = await Promise.all([fetchListings(), fetchQueries(), fetchSettlements()]);
      setListings(l);
      setQueries(q);
      setSettlements(s);
      if (l.length > 0) {
        setSelectedId((prev) => (prev && l.some((x) => x.id === prev) ? prev : l[0].id));
        setBotTargetId((prev) => (prev && l.some((x) => x.id === prev) ? prev : l[0].id));
      } else {
        setSelectedId(null);
        setBotTargetId('');
      }
    } catch (err) {
      setBackendError(
        err instanceof Error ? err.message : 'Could not connect to the backend service'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // Automatically verify the secure vault in the background on load
  useEffect(() => {
    loadAll();
    const nonce = generateFreshNonceHex();
    fetchAttestation(nonce)
      .then(async (att) => {
        const check = await verifyAttestationClientSide(att, nonce);
        setEnclave({ attestation: att, check });
      })
      .catch(() => undefined);
  }, [loadAll]);

  useEffect(() => {
    const callbackResult = consumeNearWalletCallback();
    if (callbackResult) {
      setAccount(callbackResult.accountId);
      if (callbackResult.publicKey) setAccountPubKey(callbackResult.publicKey);
      setWalletMode('my-near-wallet');
      toast('NEAR Wallet connected', `Signed in as ${callbackResult.accountId}`, 'success');
      return;
    }

    getNearWalletSelector()
      .then((sel) => {
        const st = sel.store.getState();
        if (st.accounts.length > 0) {
          const walletAcct = st.accounts[0].accountId;
          const pubKey = st.accounts[0].publicKey || '';
          setAccount(walletAcct);
          if (pubKey) setAccountPubKey(pubKey);
          setWalletMode('my-near-wallet');
          try {
            localStorage.setItem('sealed_market_user_account', walletAcct);
            if (pubKey) localStorage.setItem('sealed_market_user_pubkey', pubKey);
            localStorage.setItem('sealed_market_wallet_mode', 'my-near-wallet');
          } catch {
            // ignore
          }
        }
      })
      .catch(() => undefined);
  }, [toast]);

  const connectNearWallet = async (network: 'testnet' | 'mainnet' = 'testnet') => {
    setConnectingWallet(network);
    try {
      await signInWithMyNearWallet(network);
    } catch (err) {
      setConnectingWallet(null);
      toast(
        'Could not open NEAR Wallet',
        err instanceof Error ? err.message : 'Wallet redirect failed',
        'error'
      );
    }
  };

  const handleCreateGaslessWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = gaslessInput.trim();
    if (!raw) return;
    setConnectingWallet('gasless');
    try {
      const res = await createGaslessNamedAccount({
        email: raw.includes('@') ? raw : `${raw}@sealed.near`,
        desiredPrefix: raw.split('@')[0],
      });
      setAccount(res.accountId);
      setAccountPubKey(res.publicKey);
      setWalletMode('gasless-relayer');
      try {
        localStorage.setItem('sealed_market_user_account', res.accountId);
        localStorage.setItem('sealed_market_user_pubkey', res.publicKey);
        localStorage.setItem('sealed_market_wallet_mode', 'gasless-relayer');
      } catch {
        // ignore
      }
      setGaslessInput('');
      setShowAccountModal(false);
      toast(
        'Gasless NEAR Wallet created',
        `${res.accountId} (${res.gasSponsoredNear} NEAR gas sponsored)`,
        'success'
      );
    } catch (err) {
      toast(
        'Could not create wallet',
        err instanceof Error ? err.message : 'Relayer error',
        'error'
      );
    } finally {
      setConnectingWallet(null);
    }
  };

  const handleDisconnectWallet = async () => {
    await signOutNearWallet();
    setAccount('');
    setAccountPubKey('');
    setWalletMode('');
    setAccountInput('');
    setShowAccountModal(false);
    toast('Wallet disconnected', 'You have signed out of your NEAR account');
  };

  const saveCustomAccount = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = accountInput.trim().toLowerCase();
    if (!clean) return;
    const formatted = clean.includes('.') ? clean : `${clean}.sealed.near`;
    setAccount(formatted);
    setWalletMode('custom-account');
    try {
      localStorage.setItem('sealed_market_user_account', formatted);
      localStorage.setItem('sealed_market_wallet_mode', 'custom-account');
    } catch {
      // ignore
    }
    setShowAccountModal(false);
    toast('Account connected', `Signed in as ${formatted}`, 'success');
  };

  const selectedListing = listings.find((l) => l.id === selectedId) || null;
  const effectiveAccount = account || 'buyer.sealed.near';

  const canVisit = (target: ActiveStage): boolean => {
    if (target === 1) return true;
    if (target === 2) return Boolean(selectedListing);
    if (target === 3) return Boolean(appraisal && appraisal.report.listingId === selectedListing?.id);
    if (target === 4 || target === 5)
      return Boolean(purchase && purchase.token.listing_id === selectedListing?.id);
    return false;
  };

  const isCompleted = (target: ActiveStage): boolean => {
    if (target === 1) return stage > 1 && Boolean(selectedListing);
    if (target === 2) return Boolean(appraisal && appraisal.report.listingId === selectedListing?.id);
    if (target === 3) return Boolean(purchase && purchase.token.listing_id === selectedListing?.id);
    if (target === 4) return answers.length > 0;
    if (target === 5) return Boolean(settlement);
    return false;
  };

  const handleSelectDataset = (id: string) => {
    setSelectedId(id);
    if (appraisal && appraisal.report.listingId !== id) {
      setAppraisal(null);
      setPurchase(null);
      setAnswers([]);
      setSettlement(null);
    }
  };

  const handleRestart = () => {
    setAppraisal(null);
    setPurchase(null);
    setAnswers([]);
    setSettlement(null);
    setStage(1);
    loadAll();
  };

  const regenerateAgentKey = () => {
    const next = generateAgentFunctionCallKey({
      contractId: NEAR_CONTRACT_ID,
      allowedMethods: ['buy', 'log_query', 'settle'],
      allowanceNear,
    });
    setAgentKey(next);
    toast('New bot spending key created', next.publicKey);
  };

  const runAgentLoop = async () => {
    const targetListing = listings.find((l) => l.id === botTargetId) || listings[0];
    if (!targetListing) {
      toast('No dataset listed yet', 'Upload and publish a dataset first so the bot has something to test.', 'error');
      return;
    }
    const targetId = targetListing.id;
    const botAcct = account || 'agent.sealed.near';

    setRunningAgent(true);
    setAgentLogs([]);
    const pushLog = (entry: Omit<AgentStepLog, 'id'>) => {
      setAgentLogs((prev) => [...prev, { ...entry, id: `${entry.num}_${Date.now()}_${Math.random()}` }]);
    };

    try {
      const key = generateAgentFunctionCallKey({
        contractId: NEAR_CONTRACT_ID,
        allowedMethods: ['buy', 'log_query', 'settle'],
        allowanceNear,
      });
      setAgentKey(key);
      pushLog({
        num: 1,
        title: 'Created spending-limit key for the bot',
        detail: `Bot (${botAcct}) can only buy, ask questions, and settle up to ${allowanceNear} NEAR.`,
        hash: key.publicKey,
        ok: true,
      });

      const nonce = generateFreshNonceHex();
      const att = await fetchAttestation(nonce);
      const attCheck = await verifyAttestationClientSide(att, nonce);
      if (!attCheck.valid) throw new Error('Vault security check failed');
      pushLog({
        num: 2,
        title: 'Verified that the private vault is genuine',
        detail: `Security fingerprint ${att.measurement.slice(0, 14)}… verified in browser.`,
        hash: att.signature,
        ok: true,
      });

      const rep = await runPrivateAppraisal({
        listingId: targetId,
        taskSpec: 'Evaluate predictive utility and data quality across all columns',
      });
      const sigOk = await verifyAppraisalSignatureClientSide({
        listingId: rep.listingId,
        taskHash: rep.taskHash,
        score: rep.score,
        priceLow: rep.priceLow,
        priceHigh: rep.priceHigh,
        attestationRef: rep.attestationRef,
        teePubkey: rep.teePubkey,
        teeSig: rep.teeSig,
      });
      if (!sigOk.valid) throw new Error('Quality report signature invalid');

      const passesQuality = rep.score >= minScoreRule;
      pushLog({
        num: 3,
        title: `Checked "${targetListing.title}" quality: ${Math.round(rep.score * 100)}%`,
        detail: `Bot requires at least ${Math.round(minScoreRule * 100)}% quality · Fair price $${rep.priceLow.toFixed(2)}–$${rep.priceHigh.toFixed(2)}`,
        hash: rep.teeSig,
        ok: passesQuality,
      });

      if (!passesQuality) {
        const refundAmount = Number(((rep.priceLow + rep.priceHigh) / 2).toFixed(2));
        const qBad = await fetchOneClickQuote({
          sourceChain: agentChain,
          amountUsdc: refundAmount,
          buyerAccount: botAcct,
        });
        const intentBad = await executeOneClickIntent({
          quote: qBad,
          sourceChain: agentChain,
          amountUsdc: refundAmount,
          buyerAccount: botAcct,
        });
        const buyBad = await buyAnswersEscrow({
          listingId: targetId,
          appraisalId: rep.appraisalId,
          answers: 1,
          buyer: botAcct,
          amountUsdc: refundAmount,
          sourceChain: agentChain,
          intentTxHash: intentBad.intentTxHash,
        });
        const refund = await settleEscrowOnchain({
          listingId: targetId,
          escrowId: buyBad.escrow.id,
          deliveredWithinRange: false,
        });
        pushLog({
          num: 4,
          title: `Automatic Refund Triggered ($${refund.total_amount_usdc.toFixed(2)} returned)`,
          detail: `Quality (${Math.round(rep.score * 100)}%) was below ${Math.round(minScoreRule * 100)}% → 100% refunded to ${botAcct} with $0 fee.`,
          hash: refund.tx_hash,
          ok: true,
        });
        await loadAll();
        toast('Bot got a 100% refund!', `+$${refund.total_amount_usdc.toFixed(2)} returned because quality was below threshold.`, 'success');
        return;
      }

      if (rep.priceLow > maxPriceRule) {
        pushLog({
          num: 4,
          title: 'Purchase skipped: Price is above bot budget',
          detail: `Dataset price $${rep.priceLow.toFixed(2)} is higher than max budget $${maxPriceRule.toFixed(2)}.`,
          ok: false,
        });
        return;
      }

      const amountUsdc = Number(((rep.priceLow + rep.priceHigh) / 2).toFixed(2));
      const quote = await fetchOneClickQuote({
        sourceChain: agentChain,
        amountUsdc,
        buyerAccount: botAcct,
      });
      const intent = await executeOneClickIntent({
        quote,
        sourceChain: agentChain,
        amountUsdc,
        buyerAccount: botAcct,
      });
      const bought = await buyAnswersEscrow({
        listingId: targetId,
        appraisalId: rep.appraisalId,
        answers: 1,
        buyer: botAcct,
        amountUsdc,
        sourceChain: agentChain,
        intentTxHash: intent.intentTxHash,
      });
      pushLog({
        num: 4,
        title: `Paid $${amountUsdc.toFixed(2)} into safe escrow & unlocked pass`,
        detail: `Paid from ${SOURCE_CHAIN_ASSETS[agentChain].label} → Pass ${bought.token.token_id}`,
        hash: intent.intentTxHash,
        ok: true,
      });

      const queryColumn = targetListing.schema[0] || 'id';
      const qOut = await executeEnclaveQuery({
        tokenId: bought.token.token_id,
        listingId: targetId,
        caller: botAcct,
        query: {
          op: 'COUNT',
          column: queryColumn,
          epsilon: 0.5,
        },
      });
      pushLog({
        num: 5,
        title: `Got private answer: ~${qOut.result.noisedValue.toFixed(1)} matching records`,
        detail: `Calculated across ${qOut.result.matchedRowsK} rows while keeping raw records hidden.`,
        hash: qOut.resultHash,
        ok: true,
      });

      const settled = await settleEscrowOnchain({
        listingId: targetId,
        escrowId: bought.escrow.id,
        deliveredWithinRange: true,
      });
      pushLog({
        num: 6,
        title: `Order complete: Paid contributors automatically`,
        detail: settled.payouts.map((p) => `${p.account}: +$${p.amount_usdc.toFixed(2)}`).join(' · '),
        hash: settled.tx_hash,
        ok: true,
      });

      await loadAll();
      toast('Auto-Buy Bot finished!', `Bought answer and paid ${settled.payouts.length} contributor(s).`, 'success');
    } catch (err) {
      toast('Bot stopped', err instanceof Error ? err.message : 'Error', 'error');
    } finally {
      setRunningAgent(false);
    }
  };

  const steps: { n: ActiveStage; label: string; sub: string }[] = [
    {
      n: 1,
      label: '1. Choose Data',
      sub: selectedListing ? selectedListing.title.slice(0, 18) : 'Upload or select',
    },
    {
      n: 2,
      label: '2. Free Quality Check',
      sub: appraisal ? `${Math.round(appraisal.report.score * 100)}% score` : 'Test first',
    },
    {
      n: 3,
      label: '3. Checkout',
      sub: purchase ? `$${purchase.amountUsdc.toFixed(2)} paid` : '100% protected',
    },
    {
      n: 4,
      label: '4. Ask Questions',
      sub: answers.length ? `${answers.length} answered` : 'Get insights',
    },
    {
      n: 5,
      label: '5. Finish Order',
      sub: settlement ? settlement.outcome : 'Payout / Refund',
    },
  ];

  return (
    <div className="backdrop-grain relative min-h-screen bg-black text-white">
      {/* Subtle monochrome curves in background */}
      <div className="pointer-events-none fixed inset-x-0 top-0 -z-0 flex justify-center overflow-hidden opacity-25">
        <svg width="1200" height="520" viewBox="0 0 1200 520" fill="none" className="animate-drift">
          <ellipse cx="600" cy="60" rx="560" ry="240" stroke="white" strokeOpacity="0.22" />
          <ellipse cx="600" cy="60" rx="410" ry="175" stroke="white" strokeOpacity="0.15" />
          <ellipse cx="600" cy="60" rx="260" ry="110" stroke="white" strokeOpacity="0.1" />
        </svg>
      </div>

      {/* Clean Web2 Navigation Header */}
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-black/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <button
            type="button"
            onClick={() => setStage(1)}
            className="flex items-center gap-3 text-left"
          >
            <SealMark className="h-7 w-7 text-white" />
            <div>
              <div className="text-sm font-semibold tracking-tight">Sealed Market</div>
              <div className="text-[11px] text-ink-400">Buy answers, not raw spreadsheets</div>
            </div>
          </button>

          <div className="flex flex-wrap items-center gap-2">
            {/* Step-by-step Onboarding Guide trigger */}
            <GuideTriggerButton onClick={() => setShowGuide(true)} />

            {/* Auto-Buy Bot toggle */}
            <button
              type="button"
              onClick={() => setShowBotDrawer((v) => !v)}
              className={cx(
                'inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all duration-300',
                showBotDrawer
                  ? 'border-white bg-white text-black'
                  : 'border-white/15 bg-white/[0.04] text-white hover:border-white/40'
              )}
            >
              <Bot className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Auto-Buy Bot</span>
            </button>

            {/* Security lock pill */}
            <button
              type="button"
              onClick={() => setShowSecurityModal(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3.5 py-1.5 text-xs text-ink-100 transition hover:border-white/40 hover:text-white"
              title="Click to view security verification"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-white" />
              <span className="hidden md:inline">Private Vault</span>
              <span className="rounded-full bg-white px-1.5 py-0.5 font-mono text-[10px] font-medium text-black">
                {enclave?.check.valid ? 'Verified' : 'Checking'}
              </span>
            </button>

            {/* User account / NEAR Wallet button */}
            <button
              type="button"
              onClick={() => {
                setAccountInput(account);
                setShowAccountModal(true);
              }}
              className={cx(
                'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs transition',
                account
                  ? 'border-white/30 bg-white/[0.08] text-white hover:border-white/60'
                  : 'border-white bg-white font-medium text-black hover:bg-ink-100'
              )}
            >
              {account ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-white" />
                  <span className="font-mono">{account.replace('.sealed.near', '')}</span>
                </>
              ) : (
                <>
                  <Wallet className="h-3.5 w-3.5" />
                  <span>Connect Wallet</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-5 pb-28 pt-10 sm:px-8">
        {/* Compact, friendly Hero */}
        <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.03] px-3 py-1 text-[11px] text-ink-200">
              <Lock className="h-3 w-3" />
              100% Privacy-Protected Data Store
            </div>
            <h1 className="mt-3 font-display text-4xl leading-tight tracking-tight sm:text-6xl">
              Get instant answers from private data.
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-ink-300 sm:text-base">
              Upload your own CSV to earn per question, or test any listed dataset for free and pay only a few dollars
              per answer — backed by an automatic money-back guarantee.
            </p>
          </div>
        </div>

        {/* Optional Auto-Buy Bot Drawer */}
        {showBotDrawer && (
          <div className="mb-10 animate-scale-in rounded-4xl border border-white/25 bg-white/[0.04] p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-5">
              <div>
                <Pill tone="solid">Autonomous AI Buyer</Pill>
                <h2 className="mt-2 font-display text-3xl">Let a budget-capped bot shop for you</h2>
                <p className="mt-1 max-w-2xl text-xs text-ink-300">
                  Set your minimum quality score and max price. The bot checks the selected dataset, pays, asks a
                  question, and automatically claims a 100% refund if quality falls below your threshold.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={runAgentLoop}
                  loading={runningAgent}
                  disabled={listings.length === 0}
                  icon={<Play className="h-4 w-4" />}
                >
                  Run Auto-Buy Bot
                </Button>
                <button
                  type="button"
                  onClick={() => setShowBotDrawer(false)}
                  className="rounded-full p-2 text-ink-400 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.3fr]">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-ink-300">Bot rules & spending limit</span>
                  <button
                    type="button"
                    onClick={regenerateAgentKey}
                    className="inline-flex items-center gap-1 text-xs text-ink-300 hover:text-white"
                  >
                    <KeyRound className="h-3.5 w-3.5" /> New key
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="label" htmlFor="bot-ds">Dataset to evaluate</label>
                    <select
                      id="bot-ds"
                      className="field text-xs"
                      value={botTargetId}
                      onChange={(e) => setBotTargetId(e.target.value)}
                      disabled={listings.length === 0}
                    >
                      {listings.length === 0 ? (
                        <option value="">No datasets published yet — list one first</option>
                      ) : (
                        listings.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.title} ({l.id})
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="bot-score">Min quality (0–1)</label>
                    <input
                      id="bot-score"
                      type="number"
                      step="0.05"
                      min="0"
                      max="1"
                      className="field font-mono text-xs"
                      value={minScoreRule}
                      onChange={(e) => setMinScoreRule(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="bot-price">Max price ($ USD)</label>
                    <input
                      id="bot-price"
                      type="number"
                      step="0.5"
                      min="1"
                      className="field font-mono text-xs"
                      value={maxPriceRule}
                      onChange={(e) => setMaxPriceRule(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="bot-cap">Spend limit (NEAR)</label>
                    <input
                      id="bot-cap"
                      className="field font-mono text-xs"
                      value={allowanceNear}
                      onChange={(e) => setAllowanceNear(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="bot-chain">Pay from</label>
                    <select
                      id="bot-chain"
                      className="field text-xs"
                      value={agentChain}
                      onChange={(e) => setAgentChain(e.target.value as SupportedSourceChain)}
                    >
                      {(Object.keys(SOURCE_CHAIN_ASSETS) as SupportedSourceChain[]).map((c) => (
                        <option key={c} value={c}>
                          {SOURCE_CHAIN_ASSETS[c].label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="rounded-2xl bg-black/40 px-4 py-2.5 text-xs text-ink-400">
                  Scoped key: <Hash value={agentKey.publicKey} head={10} tail={6} />
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-black/50 p-5">
                <div className="text-xs font-medium text-ink-300">Live Bot Activity</div>
                {agentLogs.length === 0 ? (
                  <div className="mt-6 py-8 text-center text-xs text-ink-400">
                    {listings.length === 0
                      ? 'List a dataset first, then click "Run Auto-Buy Bot" to watch it test, buy, and settle.'
                      : 'Click "Run Auto-Buy Bot" above to watch the bot test, buy, and settle in real time.'}
                  </div>
                ) : (
                  <div className="mt-3 space-y-2.5">
                    {agentLogs.map((step) => (
                      <div key={step.id} className="flex animate-fade-up items-start gap-3 rounded-2xl bg-white/[0.04] p-3">
                        <span
                          className={cx(
                            'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px]',
                            step.ok ? 'bg-white text-black' : 'border border-white/40 text-white'
                          )}
                        >
                          {step.num}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-white">{step.title}</span>
                            {step.hash && <Hash value={step.hash} head={6} tail={4} />}
                          </div>
                          <p className="mt-0.5 text-[11px] text-ink-300">{step.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {backendError && (
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-4xl border border-white/40 bg-white/[0.03] p-6 text-sm">
            <div>
              <div className="font-medium">Backend service isn&apos;t reachable</div>
              <div className="mt-1 text-xs text-ink-300">{backendError}</div>
            </div>
            <Button size="sm" onClick={loadAll}>
              Try again
            </Button>
          </div>
        )}

        {/* Horizontal 5-Step Progress Bar */}
        <div className="mb-8 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {steps.map((s) => {
            const active = stage === s.n;
            const done = isCompleted(s.n);
            const enabled = canVisit(s.n);
            return (
              <button
                key={s.n}
                type="button"
                disabled={!enabled}
                onClick={() => enabled && setStage(s.n)}
                className={cx(
                  'flex flex-col justify-between rounded-3xl border px-4 py-3 text-left transition-all duration-300 ease-soft',
                  active
                    ? 'border-white bg-white text-black shadow-[0_0_0_4px_rgba(255,255,255,0.08)]'
                    : done
                      ? 'border-white/25 bg-white/[0.05] text-white hover:border-white/50'
                      : enabled
                        ? 'border-white/10 bg-white/[0.02] text-ink-200 hover:border-white/30'
                        : 'cursor-not-allowed border-white/[0.06] bg-white/[0.01] text-ink-600'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">{s.label}</span>
                  {done && !active && (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white text-black">
                      <Check className="h-2.5 w-2.5" strokeWidth={3} />
                    </span>
                  )}
                </div>
                <span
                  className={cx(
                    'mt-1 truncate font-mono text-[11px]',
                    active ? 'text-black/70' : 'text-ink-400'
                  )}
                >
                  {s.sub}
                </span>
              </button>
            );
          })}
        </div>

        {/* Active Step Workspace */}
        {loading ? (
          <div className="flex h-64 items-center justify-center gap-3 text-sm text-ink-400">
            <Spinner /> Loading marketplace…
          </div>
        ) : (
          <div key={stage} className="animate-fade-up">
            {stage === 1 && (
              <DatasetStep
                listings={listings}
                selectedId={selectedId}
                onSelect={handleSelectDataset}
                onContinue={() => setStage(2)}
                enclavePubKey={enclave?.attestation.enclavePubKey ?? null}
                sealing={sealingOpen}
                onToggleSealing={setSealingOpen}
                onOpenGuide={() => setShowGuide(true)}
                onAccountCreated={(acct) => setAccount(acct)}
                onPublished={async (newId) => {
                  await loadAll();
                  setSelectedId(newId);
                  setStage(2);
                }}
              />
            )}

            {stage === 2 && selectedListing && (
              <AppraiseStep
                listing={selectedListing}
                outcome={appraisal}
                onAppraised={(o) => {
                  setAppraisal(o);
                  loadAll();
                }}
                onBack={() => setStage(1)}
                onContinue={() => setStage(3)}
              />
            )}

            {stage === 3 && selectedListing && appraisal && (
              <PayStep
                listing={selectedListing}
                appraisal={appraisal}
                account={effectiveAccount}
                purchase={purchase}
                onPurchased={(p) => {
                  setPurchase(p);
                  loadAll();
                  setStage(4);
                }}
                onBack={() => setStage(2)}
                onContinue={() => setStage(4)}
              />
            )}

            {stage === 4 && selectedListing && purchase && (
              <AskStep
                listing={selectedListing}
                account={effectiveAccount}
                purchase={purchase}
                answers={answers}
                onAnswered={(a) => {
                  setAnswers((prev) => [a, ...prev]);
                  loadAll();
                }}
                onBack={() => setStage(3)}
                onContinue={() => setStage(5)}
              />
            )}

            {stage === 5 && selectedListing && appraisal && purchase && (
              <SettleStep
                listing={selectedListing}
                appraisal={appraisal}
                purchase={purchase}
                answers={answers}
                settlement={settlement}
                onSettled={(s) => {
                  setSettlement(s);
                  loadAll();
                }}
                onBack={() => setStage(4)}
                onRestart={handleRestart}
              />
            )}
          </div>
        )}

        {/* Live Receipts & Activity Feed */}
        <section className="mt-20 space-y-5 border-t border-white/10 pt-14">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="font-display text-2xl tracking-tight">Recent Purchases & Answers</h3>
              <p className="text-xs text-ink-400">
                Real-time receipt log showing completed orders and private answers.
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={loadAll}
              icon={<RefreshCw className="h-3.5 w-3.5" />}
            >
              Refresh
            </Button>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="surface p-6">
              <div className="flex items-center justify-between text-xs font-medium text-ink-300">
                <span>Completed Orders ({settlements.length})</span>
                <Activity className="h-4 w-4 text-ink-400" />
              </div>
              {settlements.length === 0 ? (
                <div className="mt-6 rounded-3xl border border-dashed border-white/10 p-6 text-center text-xs text-ink-400">
                  No completed orders yet. Complete an order in Step 5 to see contributor payout receipts here.
                </div>
              ) : (
                <div className="mt-4 space-y-2.5">
                  {settlements.slice(0, 5).map((s) => (
                    <div key={s.id} className="rounded-3xl border border-white/10 bg-white/[0.02] p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Pill tone={s.outcome === 'RELEASED' ? 'solid' : 'outline'}>
                            {s.outcome === 'RELEASED' ? 'Paid Contributors' : 'Refunded Buyer'}
                          </Pill>
                          <span className="font-mono text-xs text-ink-200">{s.listing_id}</span>
                        </div>
                        <span className="font-mono text-xs font-medium text-white">
                          ${s.total_amount_usdc.toFixed(2)}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-400">
                        {s.payouts.map((p) => (
                          <span key={p.account} className="font-mono">
                            {p.account.replace('.sealed.near', '')}: +${p.amount_usdc.toFixed(2)} (
                            {(p.weight_bps / 100).toFixed(0)}%)
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="surface p-6">
              <div className="flex items-center justify-between text-xs font-medium text-ink-300">
                <span>Questions Answered ({queries.length})</span>
                <span className="text-ink-400">Raw rows never shared</span>
              </div>
              {queries.length === 0 ? (
                <div className="mt-6 rounded-3xl border border-dashed border-white/10 p-6 text-center text-xs text-ink-400">
                  No questions asked yet. Unlock a pass in Step 3 and ask a question in Step 4.
                </div>
              ) : (
                <div className="mt-4 space-y-2.5">
                  {queries.slice(0, 5).map((q) => (
                    <div key={q.id} className="rounded-3xl border border-white/10 bg-white/[0.02] p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs text-white">{q.listing_id}</span>
                        <span className="font-mono text-xs text-ink-300">
                          Answer: {q.noised_value != null ? q.noised_value.toFixed(1) : '—'}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between text-[11px] text-ink-400">
                        <span className="font-mono">
                          {q.query_spec
                            ? `${q.query_spec.op}(${q.query_spec.column})`
                            : 'Aggregate query'}
                        </span>
                        <Hash value={q.result_hash} head={8} tail={6} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* First-Time User Onboarding Guide Modal */}
      <OnboardingModal
        open={showGuide}
        onClose={() => setShowGuide(false)}
        onStartSelling={() => {
          setStage(1);
          setSealingOpen(true);
        }}
      />

      {/* Account Sign-In / NEAR Wallet Modal */}
      {showAccountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="w-full max-w-lg animate-scale-in rounded-4xl border border-white/15 bg-ink-950 p-6 sm:p-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-white" />
                <span className="text-base font-medium">Connect NEAR Wallet</span>
              </div>
              <button
                type="button"
                onClick={() => setShowAccountModal(false)}
                className="rounded-full p-2 text-ink-400 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-xs text-ink-300">
              Sign in with MyNearWallet, mint an instant gasless NEAR account in 1 click, or enter an existing
              NEAR account ID.
            </p>

            {/* Active connected account status */}
            {account && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-white/25 bg-white/[0.05] px-4 py-3.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-white" />
                    <span className="truncate font-mono text-xs font-medium text-white">{account}</span>
                    {walletMode && (
                      <Pill tone="outline">
                        {walletMode === 'my-near-wallet'
                          ? 'MyNearWallet'
                          : walletMode === 'gasless-relayer'
                            ? 'Gasless Key'
                            : 'Connected'}
                      </Pill>
                    )}
                  </div>
                  {accountPubKey && (
                    <div className="mt-1 text-[11px] text-ink-400">
                      Key: <Hash value={accountPubKey} head={10} tail={6} />
                    </div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDisconnectWallet}
                  icon={<LogOut className="h-3.5 w-3.5" />}
                >
                  Disconnect
                </Button>
              </div>
            )}

            {/* Option 1: Official MyNearWallet Web Redirect */}
            <div className="mt-5 rounded-3xl border border-white/12 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-white">1. Connect MyNearWallet (Browser Redirect)</span>
                <Pill tone="outline">@near-wallet-selector</Pill>
              </div>
              <p className="mt-1 text-[11px] text-ink-400">
                Redirects to official MyNearWallet to authorize your account and returns you right back here.
              </p>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button
                  size="sm"
                  loading={connectingWallet === 'testnet'}
                  onClick={() => connectNearWallet('testnet')}
                  icon={<ExternalLink className="h-3.5 w-3.5" />}
                >
                  MyNearWallet (Testnet)
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={connectingWallet === 'mainnet'}
                  onClick={() => connectNearWallet('mainnet')}
                  icon={<ExternalLink className="h-3.5 w-3.5" />}
                >
                  MyNearWallet (Mainnet)
                </Button>
              </div>
            </div>

            {/* Option 2: Instant 1-Click Gasless NEAR Wallet (Relayer) */}
            <form
              onSubmit={handleCreateGaslessWallet}
              className="mt-3 rounded-3xl border border-white/12 bg-white/[0.03] p-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-white">
                  2. Create Instant Gasless NEAR Wallet (No Redirect)
                </span>
                <Pill tone="solid">Instant</Pill>
              </div>
              <p className="mt-1 text-[11px] text-ink-400">
                Don&apos;t have a NEAR wallet extension? Enter your email or handle to generate an Ed25519 keypair and
                a free <span className="font-mono text-white">.sealed.near</span> account immediately.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  className="field flex-1 text-xs"
                  required
                  value={gaslessInput}
                  onChange={(e) => setGaslessInput(e.target.value)}
                  placeholder="you@company.com or username"
                />
                <Button
                  type="submit"
                  size="sm"
                  loading={connectingWallet === 'gasless'}
                  icon={<Sparkles className="h-3.5 w-3.5" />}
                >
                  Create Free Wallet
                </Button>
              </div>
            </form>

            {/* Option 3: Existing Account ID */}
            <form onSubmit={saveCustomAccount} className="mt-3 rounded-3xl border border-white/10 bg-white/[0.015] p-4">
              <label className="text-xs font-medium text-ink-200" htmlFor="acct-in">
                3. Or enter an existing NEAR Account ID
              </label>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <input
                  id="acct-in"
                  className="field flex-1 font-mono text-xs"
                  required
                  value={accountInput}
                  onChange={(e) => setAccountInput(e.target.value)}
                  placeholder="yourname.near or yourname.testnet"
                />
                <Button type="submit" variant="secondary" size="sm">
                  Use Account ID
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Security Certificate Modal */}
      {showSecurityModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="w-full max-w-2xl animate-scale-in rounded-4xl border border-white/15 bg-ink-950 p-6 sm:p-8">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" />
                <span className="text-base font-medium">Private Vault Security Check</span>
              </div>
              <button
                type="button"
                onClick={() => setShowSecurityModal(false)}
                className="rounded-full p-2 text-ink-400 transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <VerifyStep
              enclave={enclave}
              onVerified={setEnclave}
              onContinue={() => setShowSecurityModal(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
};
