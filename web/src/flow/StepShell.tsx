import React from 'react';
import { Check, Lock } from 'lucide-react';
import { cx, Reveal } from '../ui/kit';

export type StepState = 'locked' | 'active' | 'done';

export const StepShell: React.FC<{
  n: number;
  title: string;
  kicker: string;
  description: React.ReactNode;
  state: StepState;
  lockedHint: string;
  isLast?: boolean;
  aside?: React.ReactNode;
  children: React.ReactNode;
}> = ({ n, title, kicker, description, state, lockedHint, isLast, aside, children }) => {
  const locked = state === 'locked';
  return (
    <section id={`step-${n}`} className="relative scroll-mt-28 pb-24 pl-12 sm:pl-20">
      {/* Rail */}
      <div className="absolute left-0 top-0 flex h-full flex-col items-center sm:left-3">
        <div
          className={cx(
            'relative flex h-9 w-9 items-center justify-center rounded-full font-mono text-xs transition-all duration-700 ease-soft',
            state === 'done' && 'bg-white text-black',
            state === 'active' && 'border border-white bg-black text-white',
            locked && 'border border-white/15 text-ink-500'
          )}
        >
          {state === 'active' && (
            <span className="absolute inset-0 -z-10 animate-breathe rounded-full bg-white/20 blur-md" />
          )}
          {state === 'done' ? <Check className="h-4 w-4" strokeWidth={3} /> : String(n).padStart(2, '0')}
        </div>
        {!isLast && (
          <div className="relative mt-3 w-px flex-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="absolute inset-x-0 top-0 bg-white transition-all duration-1000 ease-soft"
              style={{ height: state === 'done' ? '100%' : '0%' }}
            />
          </div>
        )}
      </div>

      <Reveal>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <div className="eyebrow">{kicker}</div>
            <h2
              className={cx(
                'mt-2 font-display text-4xl leading-[1.05] tracking-tight transition-colors duration-500 sm:text-5xl',
                locked ? 'text-ink-500' : 'text-white'
              )}
            >
              {title}
            </h2>
            <p className={cx('mt-3 text-[15px] leading-relaxed', locked ? 'text-ink-600' : 'text-ink-300')}>
              {description}
            </p>
          </div>
          {!locked && aside}
        </div>
      </Reveal>

      <div className="mt-8">
        {locked ? (
          <div className="flex items-center gap-3 rounded-4xl border border-dashed border-white/10 px-6 py-8 text-sm text-ink-500">
            <Lock className="h-4 w-4" />
            {lockedHint}
          </div>
        ) : (
          <div className="animate-fade-up">{children}</div>
        )}
      </div>
    </section>
  );
};
