import React from 'react';
import { ArrowRight, Check, FileUp, HelpCircle, Plus, Sparkles } from 'lucide-react';
import type { Listing } from '../../lib/api';
import { Button, cx, Pill, ScoreRing } from '../../ui/kit';
import { SealPanel } from './SealPanel';

export const DatasetStep: React.FC<{
  listings: Listing[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onContinue: () => void;
  enclavePubKey: string | null;
  sealing: boolean;
  onToggleSealing: (open: boolean) => void;
  onOpenGuide: () => void;
  onAccountCreated: (accountId: string) => void;
  onPublished: (listingId: string) => Promise<void>;
}> = ({
  listings,
  selectedId,
  onSelect,
  onContinue,
  enclavePubKey,
  sealing,
  onToggleSealing,
  onOpenGuide,
  onAccountCreated,
  onPublished,
}) => {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-3xl tracking-tight sm:text-4xl">
            1. {listings.length > 0 ? 'Pick a dataset — or list your own' : 'List your first dataset'}
          </h2>
          <p className="mt-1 text-sm text-ink-300">
            {listings.length > 0
              ? 'Select any dataset below to run a Free Quality Check, or upload your own CSV spreadsheet.'
              : 'No datasets have been listed yet. Upload a CSV spreadsheet to encrypt it in your browser and publish it.'}
          </p>
        </div>
        <Button
          variant={sealing ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => onToggleSealing(!sealing)}
          icon={<Plus className={cx('h-4 w-4 transition-transform', sealing && 'rotate-45')} />}
        >
          {sealing ? 'Close seller form' : 'Sell your own data'}
        </Button>
      </div>

      {sealing && (
        <div className="animate-scale-in">
          <SealPanel
            enclavePubKey={enclavePubKey}
            onAccountCreated={onAccountCreated}
            onPublished={async (id) => {
              await onPublished(id);
              onToggleSealing(false);
            }}
          />
        </div>
      )}

      {listings.length === 0 && !sealing ? (
        <div className="surface flex flex-col items-center justify-center p-10 text-center sm:p-14">
          <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-white text-black">
            <FileUp className="h-6 w-6" />
          </div>
          <h3 className="mt-5 font-display text-3xl">The marketplace is ready for your data.</h3>
          <p className="mt-2 max-w-md text-xs leading-relaxed text-ink-300 sm:text-sm">
            Upload any CSV spreadsheet from your computer. Your browser locks the file before uploading so buyers can
            only pay to ask aggregate questions about it.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Button
              size="lg"
              onClick={() => onToggleSealing(true)}
              icon={<Plus className="h-4 w-4" />}
            >
              Upload & List Your First Dataset
            </Button>
            <Button
              size="lg"
              variant="secondary"
              onClick={onOpenGuide}
              icon={<HelpCircle className="h-4 w-4" />}
            >
              How it works (Step-by-step guide)
            </Button>
          </div>
        </div>
      ) : (
        listings.length > 0 && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {listings.map((l, i) => {
                const active = l.id === selectedId;
                const scorePct = l.latest_score != null ? Math.round(l.latest_score * 100) : null;
                const lowQuality = l.latest_score != null && l.latest_score < 0.5;
                const avgPrice =
                  l.price_low != null && l.price_high != null
                    ? `$${((l.price_low + l.price_high) / 2).toFixed(2)}`
                    : '$4.00';

                return (
                  <div
                    key={l.id}
                    onClick={() => onSelect(l.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(l.id)}
                    className={cx(
                      'group relative flex cursor-pointer animate-fade-up flex-col justify-between rounded-4xl border p-6 text-left transition-all duration-500 ease-soft',
                      active
                        ? 'border-white bg-white/[0.07] shadow-[0_0_0_6px_rgba(255,255,255,0.06)]'
                        : 'border-white/10 bg-white/[0.025] hover:-translate-y-1 hover:border-white/35'
                    )}
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Pill tone={active ? 'solid' : 'muted'}>
                              {scorePct != null ? `${scorePct}% quality` : 'Unscored'}
                            </Pill>
                            {lowQuality && <Pill tone="outline">Refund eligible</Pill>}
                          </div>
                          <div className="mt-3 text-base font-medium leading-snug text-white">
                            {l.title}
                          </div>
                        </div>
                        <ScoreRing score={l.latest_score} size={52} stroke={3} />
                      </div>

                      <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-ink-300">
                        {l.description}
                      </p>
                    </div>

                    <div className="mt-6">
                      <div className="grid grid-cols-3 gap-2 border-t border-white/[0.08] pt-4 text-xs">
                        <div>
                          <div className="text-ink-400">Per answer</div>
                          <div className="mt-0.5 font-mono text-sm font-medium text-white">
                            {avgPrice}
                          </div>
                        </div>
                        <div>
                          <div className="text-ink-400">Size</div>
                          <div className="mt-0.5 font-mono text-white">{l.row_count} rows</div>
                        </div>
                        <div>
                          <div className="text-ink-400">Updated</div>
                          <div className="mt-0.5 font-mono text-white">
                            {l.freshness_date || '—'}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-3.5 text-xs">
                        <span className="text-ink-400">
                          By {l.contributors.length} contributor
                          {l.contributors.length === 1 ? '' : 's'}
                        </span>
                        <span
                          className={cx(
                            'inline-flex items-center gap-1.5 font-medium transition-colors',
                            active ? 'text-white' : 'text-ink-300 group-hover:text-white'
                          )}
                        >
                          {active ? (
                            <>
                              <Check className="h-3.5 w-3.5" strokeWidth={3} /> Selected
                            </>
                          ) : (
                            'Select'
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 rounded-4xl border border-white/15 bg-white/[0.03] px-6 py-5">
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5 text-white" />
                <div className="text-sm">
                  <span className="font-medium text-white">Next up: Free Quality Check.</span>{' '}
                  <span className="text-ink-300">
                    See how well this dataset answers your goal before spending a cent.
                  </span>
                </div>
              </div>
              <Button
                onClick={onContinue}
                disabled={!selectedId}
                trailing={<ArrowRight className="h-4 w-4" />}
              >
                Test quality for free
              </Button>
            </div>
          </>
        )
      )}
    </div>
  );
};
