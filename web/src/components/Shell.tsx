import React from 'react';
import { Bot, CircleHelp, Receipt, ShieldCheck, Store as StoreIcon, Tag, User, Wallet } from 'lucide-react';
import { Link, usePath } from '../lib/router';
import { shortAccount, useStore } from '../store';
import { cx, Modal, SealMark } from '../ui/kit';
import { AccountPanel } from './AccountPanel';
import { GuideModal } from './GuideModal';
import { VaultCheck } from './VaultCheck';
import { navigate } from '../lib/router';

const NAV = [
  { to: '/', label: 'Browse', icon: StoreIcon, match: (p: string) => p === '/' || p.startsWith('/d/') },
  { to: '/sell', label: 'Sell', icon: Tag, match: (p: string) => p.startsWith('/sell') },
  { to: '/orders', label: 'Orders', icon: Receipt, match: (p: string) => p.startsWith('/orders') },
  { to: '/auto-buy', label: 'Auto-buy', icon: Bot, match: (p: string) => p.startsWith('/auto-buy') },
];

export const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const path = usePath();
  const { account, enclave, orders, modal, openModal, setEnclave } = useStore();
  const openOrders = orders.filter((o) => !o.settlement).length;
  const verified = enclave?.check.valid;

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="sticky top-0 z-40 border-b border-fg/10 bg-card/90 backdrop-blur-md">
        <div className="container-page flex h-14 items-center justify-between gap-3 sm:h-16">
          <div className="flex min-w-0 items-center gap-8">
            <Link to="/" className="flex shrink-0 items-center gap-2.5" aria-label="Sealed Market home">
              <SealMark className="h-7 w-7" />
              <span className="text-[17px] font-semibold tracking-tight">Sealed Market</span>
            </Link>
            <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
              {NAV.map((n) => (
                <Link
                  key={n.to}
                  to={n.to}
                  className={cx(
                    'relative rounded-full px-3.5 py-2 text-sm font-medium transition',
                    n.match(path) ? 'bg-fg/[0.06] text-fg' : 'text-ink-300 hover:text-fg'
                  )}
                >
                  {n.label}
                  {n.to === '/orders' && openOrders > 0 && (
                    <span className="ml-1.5 rounded-full bg-fg px-1.5 py-0.5 text-[11px] font-semibold text-card">
                      {openOrders}
                    </span>
                  )}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => openModal('guide')}
              className="hidden h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-ink-300 transition hover:bg-fg/[0.06] hover:text-fg lg:inline-flex"
            >
              <CircleHelp className="h-4 w-4" /> How it works
            </button>
            <button
              type="button"
              onClick={() => openModal('vault')}
              title="Vault security check"
              className={cx(
                'inline-flex h-10 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition',
                verified
                  ? 'border-good/25 bg-good/[0.06] text-good hover:bg-good/10'
                  : 'border-fg/15 text-ink-300 hover:border-fg/40'
              )}
            >
              <ShieldCheck className="h-4 w-4" />
              <span className="hidden sm:inline">{verified ? 'Vault verified' : 'Checking vault'}</span>
            </button>
            <button
              type="button"
              onClick={() => openModal('account')}
              className={cx(
                'inline-flex h-10 max-w-[44vw] items-center gap-2 rounded-full px-3.5 text-sm font-medium transition sm:max-w-none sm:px-4',
                account
                  ? 'border border-fg/15 bg-card text-fg hover:border-fg/40'
                  : 'bg-fg text-card hover:bg-ink-100'
              )}
            >
              {account ? (
                <>
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-fg text-[11px] font-semibold uppercase text-card">
                    {account[0]}
                  </span>
                  <span className="truncate">{shortAccount(account)}</span>
                </>
              ) : (
                <>
                  <Wallet className="h-4 w-4 sm:hidden" />
                  <span>Sign in</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 pb-24 md:pb-0">{children}</main>

      <footer className="hidden border-t border-fg/10 bg-card md:block">
        <div className="container-page flex flex-wrap items-center justify-between gap-4 py-8 text-sm text-ink-400">
          <div className="flex items-center gap-2.5">
            <SealMark className="h-5 w-5 text-fg" />
            <span>Sealed Market. Sell answers, not spreadsheets.</span>
          </div>
          <div className="flex items-center gap-5">
            <button type="button" className="hover:text-fg" onClick={() => openModal('guide')}>
              How it works
            </button>
            <button type="button" className="hover:text-fg" onClick={() => openModal('vault')}>
              Security check
            </button>
            <span>Testnet preview. Sample data is fictional.</span>
          </div>
        </div>
      </footer>

      {/* Phone navigation */}
      <nav
        className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-fg/10 bg-card/95 backdrop-blur-md md:hidden"
        aria-label="Main"
      >
        <div className="grid grid-cols-5">
          {NAV.map((n) => {
            const active = n.match(path);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cx(
                  'relative flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium',
                  active ? 'text-fg' : 'text-ink-400'
                )}
              >
                <n.icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.2 : 1.7} />
                {n.label}
                {n.to === '/orders' && openOrders > 0 && (
                  <span className="absolute right-[calc(50%-20px)] top-2 h-2.5 w-2.5 rounded-full bg-fg ring-2 ring-card" />
                )}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => openModal('guide')}
            className="flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium text-ink-400"
          >
            <CircleHelp className="h-[22px] w-[22px]" strokeWidth={1.7} />
            Guide
          </button>
        </div>
      </nav>

      <GuideModal
        open={modal === 'guide'}
        onClose={() => openModal(null)}
        onStartSelling={() => navigate('/sell')}
      />

      <Modal
        open={modal === 'account'}
        onClose={() => openModal(null)}
        title={account ? 'Your account' : 'Sign in'}
        icon={<User className="h-5 w-5" />}
      >
        <AccountPanel onDone={() => openModal(null)} />
      </Modal>

      <Modal
        open={modal === 'vault'}
        onClose={() => openModal(null)}
        title="Vault security check"
        icon={<ShieldCheck className="h-5 w-5" />}
        wide
      >
        <VaultCheck enclave={enclave} onVerified={setEnclave} onContinue={() => openModal(null)} />
      </Modal>
    </div>
  );
};
