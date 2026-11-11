import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  consumeNearWalletCallback,
  fetchAttestation,
  fetchListings,
  fetchQueries,
  fetchSettlements,
  getNearWalletSelector,
  signOutNearWallet,
  type Listing,
  type QueryLogRecord,
  type SettlementRecord,
} from './lib/api';
import { generateFreshNonceHex, verifyAttestationClientSide } from './lib/crypto';
import type { AnswerRecord, AppraisalOutcome, Purchase, VerifiedEnclave } from './types';
import { useToast } from './ui/kit';

/** One purchase, kept in this browser so an order survives a page reload. */
export interface Order {
  id: string; // escrow id
  listingId: string;
  listingTitle: string;
  buyer: string;
  purchase: Purchase;
  appraisal: AppraisalOutcome;
  answers: AnswerRecord[];
  settlement: SettlementRecord | null;
  createdAtMs: number;
}

export type WalletMode = '' | 'my-near-wallet' | 'gasless-relayer' | 'custom-account';
export type Modal = null | 'account' | 'vault' | 'guide';

interface Store {
  listings: Listing[];
  queries: QueryLogRecord[];
  settlements: SettlementRecord[];
  loading: boolean;
  backendError: string | null;
  reload: () => Promise<void>;

  enclave: VerifiedEnclave | null;
  setEnclave: (v: VerifiedEnclave | null) => void;

  account: string;
  accountPubKey: string;
  walletMode: WalletMode;
  /** Account used for purchases when nobody is signed in. */
  buyerAccount: string;
  signIn: (accountId: string, mode: WalletMode, publicKey?: string) => void;
  signOut: () => Promise<void>;

  orders: Order[];
  saveOrder: (order: Order) => void;
  updateOrder: (id: string, patch: (o: Order) => Order) => void;

  modal: Modal;
  openModal: (m: Modal) => void;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider is missing');
  return s;
}

const ORDERS_KEY = 'sealed_market_orders_v1';

function readLocal(key: string): string {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode); the app still works for the session.
  }
}

function readOrders(): Order[] {
  try {
    const raw = JSON.parse(readLocal(ORDERS_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const toast = useToast();
  const [listings, setListings] = useState<Listing[]>([]);
  const [queries, setQueries] = useState<QueryLogRecord[]>([]);
  const [settlements, setSettlements] = useState<SettlementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [enclave, setEnclave] = useState<VerifiedEnclave | null>(null);

  const [account, setAccount] = useState(() => readLocal('sealed_market_user_account'));
  const [accountPubKey, setAccountPubKey] = useState(() => readLocal('sealed_market_user_pubkey'));
  const [walletMode, setWalletMode] = useState<WalletMode>(
    () => readLocal('sealed_market_wallet_mode') as WalletMode
  );
  const [orders, setOrders] = useState<Order[]>(readOrders);
  // The guide never opens by itself: it used to cover the page on first visit and block scrolling.
  const [modal, setModal] = useState<Modal>(null);

  const reload = useCallback(async () => {
    try {
      const [l, q, s] = await Promise.all([fetchListings(), fetchQueries(), fetchSettlements()]);
      setListings(l);
      setQueries(q);
      setSettlements(s);
      setBackendError(null);
    } catch (err) {
      setBackendError(err instanceof Error ? err.message : 'Could not reach the service');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load the catalogue and check the vault's identity in the background.
  useEffect(() => {
    reload();
    const nonce = generateFreshNonceHex();
    fetchAttestation(nonce)
      .then(async (attestation) => {
        const check = await verifyAttestationClientSide(attestation, nonce);
        setEnclave({ attestation, check });
      })
      .catch(() => undefined);
  }, [reload]);

  const signIn = useCallback((accountId: string, mode: WalletMode, publicKey = '') => {
    setAccount(accountId);
    setAccountPubKey(publicKey);
    setWalletMode(mode);
    writeLocal('sealed_market_user_account', accountId);
    writeLocal('sealed_market_user_pubkey', publicKey);
    writeLocal('sealed_market_wallet_mode', mode);
  }, []);

  const signOut = useCallback(async () => {
    await signOutNearWallet().catch(() => undefined);
    setAccount('');
    setAccountPubKey('');
    setWalletMode('');
    writeLocal('sealed_market_user_account', '');
    writeLocal('sealed_market_user_pubkey', '');
    writeLocal('sealed_market_wallet_mode', '');
  }, []);

  // Pick up a MyNearWallet redirect, or an existing wallet-selector session.
  useEffect(() => {
    const fromRedirect = new URLSearchParams(window.location.search).has('account_id');
    const cb = consumeNearWalletCallback();
    if (cb) {
      signIn(cb.accountId, 'my-near-wallet', cb.publicKey || '');
      if (fromRedirect) toast('Wallet connected', `Signed in as ${cb.accountId}`, 'success');
      return;
    }
    getNearWalletSelector()
      .then((sel) => {
        const acct = sel.store.getState().accounts[0];
        if (acct) signIn(acct.accountId, 'my-near-wallet', acct.publicKey || '');
      })
      .catch(() => undefined);
  }, [signIn, toast]);

  const persistOrders = useCallback((next: Order[]) => {
    writeLocal(ORDERS_KEY, JSON.stringify(next.slice(0, 50)));
    return next;
  }, []);

  const saveOrder = useCallback(
    (order: Order) =>
      setOrders((prev) => persistOrders([order, ...prev.filter((o) => o.id !== order.id)])),
    [persistOrders]
  );

  const updateOrder = useCallback(
    (id: string, patch: (o: Order) => Order) =>
      setOrders((prev) => persistOrders(prev.map((o) => (o.id === id ? patch(o) : o)))),
    [persistOrders]
  );

  const openModal = useCallback((m: Modal) => {
    setModal(m);
  }, []);

  const value = useMemo<Store>(
    () => ({
      listings,
      queries,
      settlements,
      loading,
      backendError,
      reload,
      enclave,
      setEnclave,
      account,
      accountPubKey,
      walletMode,
      buyerAccount: account || 'guest.sealed.near',
      signIn,
      signOut,
      orders,
      saveOrder,
      updateOrder,
      modal,
      openModal,
    }),
    [
      listings,
      queries,
      settlements,
      loading,
      backendError,
      reload,
      enclave,
      account,
      accountPubKey,
      walletMode,
      signIn,
      signOut,
      orders,
      saveOrder,
      updateOrder,
      modal,
      openModal,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

/* ─── Shared formatting helpers ──────────────────────────────────────────── */

export function unitPrice(l: Pick<Listing, 'price_low' | 'price_high' | 'views'>): number {
  if (l.price_low != null && l.price_high != null) {
    return Number(((l.price_low + l.price_high) / 2).toFixed(2));
  }
  return l.views[0]?.price_usdc ?? 4;
}

export function money(v: number): string {
  return `$${v.toFixed(2)}`;
}

export function shortAccount(a: string): string {
  return a.replace(/\.sealed\.near$/, '');
}

export function timeAgo(ms: number): string {
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export function qualityTone(score: number | null): 'good' | 'bad' | 'none' {
  if (score == null) return 'none';
  return score >= 0.5 ? 'good' : 'bad';
}
