import React from 'react';
import { Coins, EyeOff, Lock } from 'lucide-react';
import { ListingCard } from '../components/ListingCard';
import { SealPanel } from '../components/SealPanel';
import { navigate } from '../lib/router';
import { useStore } from '../store';

export const SellPage: React.FC = () => {
  const { enclave, account, signIn, listings, reload } = useStore();
  const mine = account ? listings.filter((l) => l.seller_account === account) : [];

  return (
    <div className="container-page py-6 sm:py-10">
      <div className="max-w-3xl">
        <h1 className="font-display text-4xl leading-[1.05] tracking-tight sm:text-6xl">
          Sell answers, not your spreadsheet.
        </h1>
        <p className="mt-3 text-base leading-relaxed text-ink-300 sm:text-lg">
          List a CSV in about a minute. Buyers pay per question and only ever receive totals and averages.
        </p>
      </div>

      <ul className="mt-6 grid gap-3 sm:grid-cols-3">
        {[
          { icon: Lock, t: 'Encrypted before upload', d: 'Your browser locks the file to the vault’s key.' },
          { icon: EyeOff, t: 'Rows are never shown', d: 'Buyers get aggregate answers with privacy noise.' },
          { icon: Coins, t: 'Everyone is paid', d: '95% of each order is split among contributors.' },
        ].map((b) => (
          <li key={b.t} className="flex items-start gap-3 rounded-2xl border border-fg/10 bg-card p-4">
            <b.icon className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <div className="font-semibold">{b.t}</div>
              <div className="text-sm text-ink-300">{b.d}</div>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-6">
        <SealPanel
          key={account || 'anon'}
          enclavePubKey={enclave?.attestation.enclavePubKey ?? null}
          signedInAccount={account || undefined}
          onAccountCreated={(id, publicKey) => signIn(id, 'gasless-relayer', publicKey)}
          onPublished={async (listingId) => {
            await reload();
            navigate(`/d/${listingId}`);
          }}
        />
      </div>

      {mine.length > 0 && (
        <section className="mt-12">
          <h2 className="text-xl font-semibold">Your listings</h2>
          <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {mine.map((l, i) => (
              <ListingCard key={l.id} listing={l} index={i} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
