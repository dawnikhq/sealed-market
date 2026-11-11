import React, { useMemo, useState } from 'react';
import { ArrowRight, BadgeCheck, Coins, RotateCcw, Search, ShieldCheck, Upload, X } from 'lucide-react';
import { ListingCard, ListingCardSkeleton } from '../components/ListingCard';
import { Link } from '../lib/router';
import { money, shortAccount, timeAgo, unitPrice, useStore } from '../store';
import { Button, cx } from '../ui/kit';

type Filter = 'all' | 'top' | 'budget' | 'community';
type Sort = 'quality' | 'price' | 'newest';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All datasets' },
  { id: 'top', label: 'Top quality' },
  { id: 'budget', label: 'Under $4 an answer' },
  { id: 'community', label: 'Community uploads' },
];

export const HomePage: React.FC = () => {
  const { listings, loading, backendError, reload, settlements, queries, openModal } = useStore();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('quality');

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = listings.filter((l) => {
      if (needle) {
        const hay = `${l.title} ${l.description} ${l.seller_account} ${l.schema.join(' ')}`.toLowerCase();
        if (!needle.split(/\s+/).every((w) => hay.includes(w))) return false;
      }
      if (filter === 'top') return (l.latest_score ?? 0) >= 0.8;
      if (filter === 'budget') return unitPrice(l) < 4;
      if (filter === 'community') return !l.is_sample;
      return true;
    });
    return out.sort((a, b) => {
      if (sort === 'price') return unitPrice(a) - unitPrice(b);
      if (sort === 'newest') return b.created_at_ms - a.created_at_ms;
      return (b.latest_score ?? -1) - (a.latest_score ?? -1);
    });
  }, [listings, q, filter, sort]);

  const activity = useMemo(() => {
    const items = [
      ...settlements.map((s) => ({
        key: s.id,
        ts: s.timestamp_ms,
        text:
          s.outcome === 'RELEASED'
            ? `${money(s.total_amount_usdc - s.platform_fee_usdc)} paid to ${s.payouts.length} contributor${s.payouts.length === 1 ? '' : 's'}`
            : `${money(s.total_amount_usdc)} refunded to ${shortAccount(s.buyer)}`,
        listingId: s.listing_id,
      })),
      ...queries.map((x) => ({
        key: x.id,
        ts: x.timestamp_ms,
        text: `${shortAccount(x.caller)} got an answer${x.query_spec ? ` (${x.query_spec.op.toLowerCase()} of ${x.query_spec.column})` : ''}`,
        listingId: x.listing_id,
      })),
    ];
    return items.sort((a, b) => b.ts - a.ts).slice(0, 6);
  }, [settlements, queries]);

  const titleOf = (id: string) => listings.find((l) => l.id === id)?.title ?? id;

  return (
    <>
      {/* Hero with search */}
      <section className="border-b border-fg/10 bg-card">
        <div className="container-page py-8 sm:py-14">
          <h1 className="max-w-3xl font-display text-[2.6rem] leading-[1.02] tracking-tight sm:text-6xl">
            Buy answers from private data.
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-300 sm:text-lg">
            Test any dataset for free, pay a few dollars per answer, and get your money back if the quality
            falls short. The rows stay sealed the whole time.
          </p>

          <div className="mt-6 flex max-w-2xl items-center gap-2 rounded-2xl border border-fg/15 bg-card p-1.5 shadow-card transition focus-within:border-fg focus-within:ring-2 focus-within:ring-fg/10">
            <Search className="ml-3 h-5 w-5 shrink-0 text-ink-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search datasets, columns or sellers"
              aria-label="Search datasets"
              className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-ink-500"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ('')}
                aria-label="Clear search"
                className="flex h-10 w-10 items-center justify-center rounded-xl text-ink-400 hover:bg-fg/[0.06] hover:text-fg"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <ul className="mt-6 flex flex-col gap-2.5 text-sm text-ink-200 sm:flex-row sm:flex-wrap sm:gap-x-7">
            <li className="flex items-center gap-2">
              <BadgeCheck className="h-4 w-4 shrink-0" /> Free quality check before you pay
            </li>
            <li className="flex items-center gap-2">
              <Coins className="h-4 w-4 shrink-0" /> Pay per answer, held in escrow
            </li>
            <li className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4 shrink-0" /> 100% refund if quality falls short
            </li>
          </ul>
          <button
            type="button"
            onClick={() => openModal('guide')}
            className="mt-5 inline-flex h-10 items-center gap-1.5 text-sm font-medium underline decoration-fg/30 underline-offset-4 hover:decoration-fg"
          >
            New here? See how it works <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      <section className="container-page py-6 sm:py-10">
        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={cx(
                  'h-10 shrink-0 rounded-full border px-4 text-sm font-medium transition',
                  filter === f.id
                    ? 'border-fg bg-fg text-card'
                    : 'border-fg/15 bg-card text-ink-200 hover:border-fg/40'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-ink-400">
              {loading ? 'Loading…' : `${shown.length} dataset${shown.length === 1 ? '' : 's'}`}
            </span>
            <select
              aria-label="Sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="field h-10 w-auto py-0 text-sm"
            >
              <option value="quality">Highest quality</option>
              <option value="price">Lowest price</option>
              <option value="newest">Newest</option>
            </select>
          </div>
        </div>

        {backendError && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-bad/30 bg-bad/[0.04] p-5">
            <div>
              <div className="font-semibold">We can’t reach the marketplace right now</div>
              <div className="mt-0.5 text-sm text-ink-300">{backendError}</div>
            </div>
            <Button size="sm" onClick={reload}>
              Try again
            </Button>
          </div>
        )}

        {/* Grid */}
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {loading
            ? [0, 1, 2].map((i) => <ListingCardSkeleton key={i} />)
            : shown.map((l, i) => <ListingCard key={l.id} listing={l} index={i} />)}
        </div>

        {!loading && shown.length === 0 && !backendError && (
          <div className="mt-2 rounded-2xl border border-dashed border-fg/20 bg-card p-10 text-center">
            <div className="text-lg font-semibold">
              {listings.length === 0 ? 'No datasets are listed yet' : 'Nothing matches that search'}
            </div>
            <p className="mx-auto mt-1 max-w-sm text-sm text-ink-300">
              {listings.length === 0
                ? 'Be the first seller. Listing a CSV takes about a minute.'
                : 'Try a different word, or clear the filters to see everything.'}
            </p>
            <div className="mt-5 flex justify-center gap-2">
              {listings.length > 0 && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQ('');
                    setFilter('all');
                  }}
                >
                  Clear filters
                </Button>
              )}
              <Link to="/sell">
                <Button>List a dataset</Button>
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* How it works */}
      <section className="border-y border-fg/10 bg-card">
        <div className="container-page py-10 sm:py-14">
          <h2 className="font-display text-3xl tracking-tight sm:text-4xl">How buying works</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {[
              {
                n: '1',
                t: 'Check the quality for free',
                d: 'Say what you want to predict. The dataset is tested inside a sealed vault and you get a signed score and a fair price.',
              },
              {
                n: '2',
                t: 'Pay per answer',
                d: 'Buy one to five answers with USDC from Base, Arbitrum, Solana or NEAR. Your payment waits in escrow.',
              },
              {
                n: '3',
                t: 'Ask, then settle',
                d: 'Ask for averages, totals and counts. Contributors are paid when you finish, or you are refunded if quality fell short.',
              },
            ].map((s) => (
              <div key={s.n} className="rounded-2xl border border-fg/10 p-5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-fg font-mono text-sm font-semibold text-card">
                  {s.n}
                </span>
                <div className="mt-4 text-lg font-semibold">{s.t}</div>
                <p className="mt-1 text-sm leading-relaxed text-ink-300">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container-page grid gap-5 py-10 sm:py-14 lg:grid-cols-[1.15fr_1fr]">
        {/* Seller call to action */}
        <div className="flex min-w-0 flex-col justify-between rounded-3xl bg-fg p-6 text-card sm:p-9">
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.16em] text-card/60">For data owners</div>
            <h2 className="mt-3 font-display text-4xl leading-[1.05] tracking-tight sm:text-5xl">
              Sell answers, not your spreadsheet.
            </h2>
            <p className="mt-3 max-w-md text-base leading-relaxed text-card/70">
              Your CSV is encrypted in your browser before it is uploaded. Buyers get totals and averages,
              never a row, and everyone who contributed is paid their share.
            </p>
          </div>
          <div className="mt-7 flex flex-wrap items-center gap-4">
            <Link to="/sell">
              <span className="inline-flex h-12 items-center gap-2 rounded-full bg-card px-6 text-[15px] font-medium text-fg transition hover:bg-ink-900">
                <Upload className="h-4 w-4" /> List a dataset
              </span>
            </Link>
            <span className="flex items-center gap-2 text-sm text-card/70">
              <ShieldCheck className="h-4 w-4" /> Free. No wallet needed.
            </span>
          </div>
        </div>

        {/* Recent activity */}
        <div className="surface min-w-0 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent activity</h2>
            <Link to="/orders" className="inline-flex items-center gap-1 text-sm font-medium text-ink-300 hover:text-fg">
              View all <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          {activity.length === 0 ? (
            <p className="mt-6 text-sm leading-relaxed text-ink-400">
              Nothing yet. Answers and payouts will show up here as orders are completed.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-fg/[0.07]">
              {activity.map((a) => (
                <li key={a.key} className="flex items-start justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{a.text}</div>
                    <div className="truncate text-sm text-ink-400">{titleOf(a.listingId)}</div>
                  </div>
                  <span className="shrink-0 text-sm text-ink-400">{timeAgo(a.ts)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
};
