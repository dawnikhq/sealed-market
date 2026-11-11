import React, { useEffect, useState } from 'react';
import { ArrowRight, ChevronLeft, Columns3, Lock, Rows3, Users } from 'lucide-react';
import { BuyBox } from '../components/BuyBox';
import { ListingCover, QualityBadge } from '../components/ListingCard';
import { QualityCheck } from '../components/QualityCheck';
import { Link, navigate } from '../lib/router';
import { money, shortAccount, useStore } from '../store';
import type { AppraisalOutcome } from '../types';
import { Bar, Button, Pill, useMedia } from '../ui/kit';

export const ListingPage: React.FC<{ id: string }> = ({ id }) => {
  const { listings, loading, buyerAccount, orders, saveOrder, reload } = useStore();
  const listing = listings.find((l) => l.id === id) || null;
  const [appraisal, setAppraisal] = useState<AppraisalOutcome | null>(null);
  const desktop = useMedia('(min-width: 1024px)');

  useEffect(() => setAppraisal(null), [id]);

  if (loading) {
    return (
      <div className="container-page space-y-4 py-8">
        <div className="skeleton h-5 w-32" />
        <div className="skeleton h-12 w-3/4" />
        <div className="skeleton h-64 w-full" />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="container-page py-20 text-center">
        <h1 className="font-display text-4xl">This dataset isn’t listed</h1>
        <p className="mx-auto mt-2 max-w-md text-ink-300">
          It may have been removed, or the link is wrong. Uploaded listings can also disappear when the
          preview service restarts.
        </p>
        <div className="mt-6">
          <Link to="/">
            <Button>Browse datasets</Button>
          </Link>
        </div>
      </div>
    );
  }

  const openOrder = orders.find((o) => o.listingId === listing.id && !o.settlement);
  const report = appraisal?.report;
  const unit = report ? Number(((report.priceLow + report.priceHigh) / 2).toFixed(2)) : null;
  const epsLeft = Math.max(0, listing.epsilon_budget - listing.epsilon_spent);

  const buyBox = (
    <BuyBox
      listing={listing}
      appraisal={appraisal}
      account={buyerAccount}
      onPurchased={(purchase) => {
        saveOrder({
          id: purchase.escrowId,
          listingId: listing.id,
          listingTitle: listing.title,
          buyer: buyerAccount,
          purchase,
          appraisal: appraisal!,
          answers: [],
          settlement: null,
          createdAtMs: Date.now(),
        });
        reload();
        navigate(`/orders/${purchase.escrowId}`);
      }}
    />
  );

  return (
    <div className="container-page py-5 sm:py-8">
      <Link to="/" className="inline-flex h-10 items-center gap-1 text-sm font-medium text-ink-300 hover:text-fg">
        <ChevronLeft className="h-4 w-4" /> All datasets
      </Link>

      <div className="mt-2 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-8">
          {/* Header */}
          <header>
            <div className="flex flex-wrap items-center gap-2">
              {listing.is_sample && <Pill tone="muted">Sample dataset</Pill>}
              <Pill tone="muted">
                <Lock className="h-3 w-3" /> Rows sealed
              </Pill>
            </div>
            <h1 className="mt-3 font-display text-[2.1rem] leading-[1.05] tracking-tight sm:text-5xl">
              {listing.title}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-300">
              <QualityBadge score={report?.score ?? listing.latest_score} />
              <span>
                Sold by <span className="font-mono text-fg">{shortAccount(listing.seller_account)}</span>
              </span>
              {listing.freshness_date && <span>Updated {listing.freshness_date}</span>}
            </div>
          </header>

          <ListingCover listing={listing} className="h-44 rounded-2xl border border-fg/10 sm:h-56" />

          {openOrder && (
            <Link
              to={`/orders/${openOrder.id}`}
              className="flex items-center justify-between gap-4 rounded-2xl border border-fg/15 bg-card p-4 shadow-card transition hover:border-fg/40"
            >
              <div>
                <div className="font-semibold">You have an open order for this dataset</div>
                <div className="text-sm text-ink-300">
                  {openOrder.answers[0]?.answersLeft ?? openOrder.purchase.token.answers_left} answers left to
                  ask.
                </div>
              </div>
              <ArrowRight className="h-5 w-5 shrink-0" />
            </Link>
          )}

          {/* Buy box sits here on phones, in the side column on desktop */}
          {!desktop && buyBox}

          <section>
            <h2 className="text-xl font-semibold">About this dataset</h2>
            <p className="mt-2 text-base leading-relaxed text-ink-200">{listing.description}</p>
            <div className="mt-5 grid grid-cols-3 gap-3">
              {[
                { icon: Rows3, k: 'Rows', v: listing.row_count.toLocaleString() },
                { icon: Columns3, k: 'Columns', v: String(listing.schema.length) },
                { icon: Users, k: 'Contributors', v: String(listing.contributors.length) },
              ].map((s) => (
                <div key={s.k} className="rounded-2xl border border-fg/10 bg-card p-4">
                  <s.icon className="h-4 w-4 text-ink-400" />
                  <div className="mt-2 text-xl font-semibold tabular-nums">{s.v}</div>
                  <div className="text-sm text-ink-400">{s.k}</div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold">Columns you can ask about</h2>
            <p className="mt-1 text-sm text-ink-300">
              You can ask for an average, total, count, lowest or highest value of any column, with an optional
              filter. Individual rows are never shown.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {listing.schema.map((c) => (
                <span key={c} className="rounded-lg border border-fg/10 bg-card px-2.5 py-1.5 font-mono text-sm">
                  {c}
                </span>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold">Free quality check</h2>
            <p className="mb-4 mt-1 text-sm text-ink-300">
              Run inside the sealed vault. Only the signed score leaves it.
            </p>
            <QualityCheck
              listing={listing}
              outcome={appraisal}
              onAppraised={(o) => {
                setAppraisal(o);
                reload();
              }}
            />
          </section>

          <section className="surface p-5 sm:p-6">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-base font-semibold">Privacy budget</h2>
              <span className="font-mono text-sm text-ink-300">
                {epsLeft.toFixed(1)} of {listing.epsilon_budget.toFixed(1)} left
              </span>
            </div>
            <Bar value={listing.epsilon_budget > 0 ? epsLeft / listing.epsilon_budget : 0} className="mt-3" />
            <p className="mt-3 text-sm leading-relaxed text-ink-300">
              Every answer has a small amount of random noise added and uses 0.5 of this budget, so nobody can
              work out a single person’s row by asking many questions. When the budget is spent the dataset stops
              answering.
              {listing.is_sample && ' Sample datasets are fictional, so their budget refills every hour.'}
            </p>
          </section>
        </div>

        {desktop && (
          <aside>
            <div className="sticky top-24">{buyBox}</div>
          </aside>
        )}
      </div>

      {/* Phone: price and call to action stay in reach while reading */}
      <div className="pb-safe fixed inset-x-0 bottom-16 z-30 border-t border-fg/10 bg-card/95 backdrop-blur-md md:hidden">
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <div>
            <div className="text-lg font-semibold leading-tight tabular-nums">
              {unit != null ? money(unit) : '…'} <span className="text-sm font-normal text-ink-400">/ answer</span>
            </div>
            <div className="text-xs text-ink-400">Refund if quality falls short</div>
          </div>
          <Button
            onClick={() => document.getElementById('buy')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            Get answers
          </Button>
        </div>
      </div>
      <div className="h-20 md:hidden" />
    </div>
  );
};
