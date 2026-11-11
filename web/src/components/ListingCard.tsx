import React from 'react';
import { Lock, Star } from 'lucide-react';
import type { Listing } from '../lib/api';
import { Link } from '../lib/router';
import { money, shortAccount, unitPrice } from '../store';
import { cx } from '../ui/kit';

/**
 * Cover art for a dataset: its real column names, shown as a spreadsheet header with the
 * rows blanked out. The columns are public; the rows never are.
 */
export const ListingCover: React.FC<{ listing: Listing; className?: string }> = ({ listing, className }) => {
  const cols = listing.schema.slice(0, 5);
  return (
    <div
      className={cx(
        'relative overflow-hidden bg-gradient-to-br from-ink-850 to-ink-800',
        className
      )}
      aria-hidden
    >
      <div className="absolute inset-x-4 top-4 rounded-lg border border-fg/10 bg-card/80 shadow-card">
        <div className="flex gap-3 overflow-hidden border-b border-fg/10 px-3 py-2">
          {cols.map((c) => (
            <span key={c} className="shrink-0 font-mono text-[11px] text-ink-200">
              {c}
            </span>
          ))}
        </div>
        {[0, 1, 2, 3].map((r) => (
          <div key={r} className="flex gap-3 border-b border-fg/[0.05] px-3 py-2 last:border-0">
            {cols.map((c, i) => (
              <span
                key={c}
                className="h-2 shrink-0 rounded-full bg-fg/10"
                style={{ width: `${Math.max(24, c.length * 6.6 - ((r + i) % 3) * 8)}px` }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-ink-800 to-transparent" />
      <div className="absolute bottom-3 left-4 inline-flex items-center gap-1.5 rounded-full bg-fg px-2.5 py-1 text-xs font-medium text-card">
        <Lock className="h-3 w-3" /> Rows sealed
      </div>
    </div>
  );
};

export const QualityBadge: React.FC<{ score: number | null; className?: string }> = ({ score, className }) => {
  if (score == null) {
    return <span className={cx('text-sm text-ink-400', className)}>Not scored</span>;
  }
  const good = score >= 0.5;
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 text-sm font-semibold tabular-nums',
        good ? 'text-fg' : 'text-bad',
        className
      )}
    >
      <Star className={cx('h-3.5 w-3.5', good ? 'fill-fg' : 'fill-bad')} />
      {Math.round(score * 100)}%
      <span className="font-normal text-ink-400">quality</span>
    </span>
  );
};

export const ListingCard: React.FC<{ listing: Listing; index?: number }> = ({ listing, index = 0 }) => {
  const low = listing.latest_score != null && listing.latest_score < 0.5;
  return (
    <Link
      to={`/d/${listing.id}`}
      className="group flex animate-fade-up flex-col overflow-hidden rounded-2xl border border-fg/10 bg-card shadow-card transition duration-300 ease-soft hover:-translate-y-0.5 hover:border-fg/25 hover:shadow-lift"
      style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}
    >
      <div className="relative">
        <ListingCover listing={listing} className="h-40" />
        <div className="absolute right-3 top-3 flex gap-1.5">
          {listing.is_sample && (
            <span className="rounded-full bg-card/90 px-2.5 py-1 text-xs font-medium text-ink-200 shadow-card">
              Sample
            </span>
          )}
          {low && (
            <span className="rounded-full bg-bad px-2.5 py-1 text-xs font-medium text-white">Refund protected</span>
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center justify-between gap-3">
          <QualityBadge score={listing.latest_score} />
          <span className="truncate text-sm text-ink-400">by {shortAccount(listing.seller_account)}</span>
        </div>
        <h3 className="mt-2 line-clamp-2 text-base font-semibold leading-snug">{listing.title}</h3>
        <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-ink-300">{listing.description}</p>
        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          <div className="min-w-0 text-sm leading-snug text-ink-400">
            <div>{listing.row_count.toLocaleString()} rows</div>
            {listing.freshness_date && <div className="whitespace-nowrap">Updated {listing.freshness_date}</div>}
          </div>
          <div className="shrink-0 text-right">
            <span className="text-lg font-semibold tabular-nums">{money(unitPrice(listing))}</span>
            <span className="text-sm text-ink-400"> / answer</span>
          </div>
        </div>
      </div>
    </Link>
  );
};

export const ListingCardSkeleton: React.FC = () => (
  <div className="overflow-hidden rounded-2xl border border-fg/10 bg-card">
    <div className="skeleton h-40 rounded-none" />
    <div className="space-y-3 p-4">
      <div className="skeleton h-4 w-24" />
      <div className="skeleton h-5 w-4/5" />
      <div className="skeleton h-4 w-full" />
      <div className="skeleton h-6 w-28" />
    </div>
  </div>
);
