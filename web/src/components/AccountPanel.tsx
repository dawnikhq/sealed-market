import React, { useState } from 'react';
import { ExternalLink, LogOut, Mail } from 'lucide-react';
import { createGaslessNamedAccount, signInWithMyNearWallet } from '../lib/api';
import { useStore } from '../store';
import { Button, Hash, Pill, useToast } from '../ui/kit';

/** Sign-in options: email (free account, no wallet), MyNearWallet, or an existing account ID. */
export const AccountPanel: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const toast = useToast();
  const { account, accountPubKey, walletMode, signIn, signOut } = useStore();
  const [email, setEmail] = useState('');
  const [existing, setExisting] = useState('');
  const [busy, setBusy] = useState<'email' | 'testnet' | 'mainnet' | null>(null);

  const createFromEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = email.trim();
    if (!raw) return;
    setBusy('email');
    try {
      const res = await createGaslessNamedAccount({
        email: raw.includes('@') ? raw : `${raw}@sealed.near`,
        desiredPrefix: raw.split('@')[0],
      });
      signIn(res.accountId, 'gasless-relayer', res.publicKey);
      toast('You are signed in', `${res.accountId} was created for free.`, 'success');
      onDone();
    } catch (err) {
      toast('Could not create your account', err instanceof Error ? err.message : 'Please try again', 'error');
    } finally {
      setBusy(null);
    }
  };

  const connectWallet = async (network: 'testnet' | 'mainnet') => {
    setBusy(network);
    try {
      await signInWithMyNearWallet(network);
    } catch (err) {
      setBusy(null);
      toast('Could not open the wallet', err instanceof Error ? err.message : 'Redirect failed', 'error');
    }
  };

  const useExisting = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = existing.trim().toLowerCase();
    if (!clean) return;
    const id = clean.includes('.') ? clean : `${clean}.sealed.near`;
    signIn(id, 'custom-account');
    toast('Signed in', id, 'success');
    onDone();
  };

  if (account) {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-fg/10 bg-ink-900 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-fg text-sm font-semibold uppercase text-card">
              {account[0]}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-mono text-sm font-medium">{account}</div>
              {accountPubKey && (
                <div className="text-xs text-ink-400">
                  Key <Hash value={accountPubKey} head={10} tail={6} />
                </div>
              )}
            </div>
            <Pill tone="muted">
              {walletMode === 'my-near-wallet'
                ? 'MyNearWallet'
                : walletMode === 'gasless-relayer'
                  ? 'Email account'
                  : 'Account ID'}
            </Pill>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-ink-300">
          Purchases, answers and payouts use this account. Your orders are kept in this browser.
        </p>
        <Button
          variant="secondary"
          className="w-full"
          onClick={async () => {
            await signOut();
            toast('Signed out');
            onDone();
          }}
          icon={<LogOut className="h-4 w-4" />}
        >
          Sign out
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <form onSubmit={createFromEmail}>
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold" htmlFor="acct-email">
            Continue with email
          </label>
          <Pill tone="good">Free, no wallet needed</Pill>
        </div>
        <p className="mt-1 text-sm text-ink-300">
          We create a <span className="font-mono text-fg">.sealed.near</span> account for you and cover the fees.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            id="acct-email"
            className="field flex-1"
            type="text"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
          />
          <Button type="submit" loading={busy === 'email'} icon={<Mail className="h-4 w-4" />}>
            Continue
          </Button>
        </div>
      </form>

      <div className="flex items-center gap-3 text-xs text-ink-500">
        <span className="h-px flex-1 bg-fg/10" /> or <span className="h-px flex-1 bg-fg/10" />
      </div>

      <div>
        <div className="text-sm font-semibold">Connect a NEAR wallet</div>
        <p className="mt-1 text-sm text-ink-300">
          Opens MyNearWallet to approve, then brings you back here.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button
            variant="secondary"
            loading={busy === 'testnet'}
            onClick={() => connectWallet('testnet')}
            icon={<ExternalLink className="h-4 w-4" />}
          >
            MyNearWallet (Testnet)
          </Button>
          <Button
            variant="secondary"
            loading={busy === 'mainnet'}
            onClick={() => connectWallet('mainnet')}
            icon={<ExternalLink className="h-4 w-4" />}
          >
            MyNearWallet (Mainnet)
          </Button>
        </div>
      </div>

      <form onSubmit={useExisting}>
        <label className="text-sm font-semibold" htmlFor="acct-existing">
          Already have an account ID?
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            id="acct-existing"
            className="field flex-1 font-mono"
            autoCapitalize="none"
            autoCorrect="off"
            required
            value={existing}
            onChange={(e) => setExisting(e.target.value)}
            placeholder="yourname.near"
          />
          <Button type="submit" variant="secondary">
            Use this ID
          </Button>
        </div>
      </form>
    </div>
  );
};
