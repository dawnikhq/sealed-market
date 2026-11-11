import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  DollarSign,
  FileUp,
  HelpCircle,
  Lock,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { Button, cx, Pill, SealMark } from '../ui/kit';

export const ONBOARDING_STORAGE_KEY = 'sealed_market_onboarding_v1';

interface GuideSlide {
  step: string;
  badge: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  points: { title: string; text: string }[];
  tip: string;
}

const SLIDES: GuideSlide[] = [
  {
    step: '1 of 4',
    badge: 'Welcome to Sealed Market',
    title: 'Sell answers, not your raw spreadsheet.',
    subtitle:
      'Normally, once you send someone a CSV spreadsheet, they can copy or share it forever. Here, your file stays locked inside a private vault — buyers only pay to ask questions about it.',
    icon: <Lock className="h-6 w-6" />,
    points: [
      {
        title: 'Your raw rows are never shared',
        text: 'Nobody can ever download, view, or copy individual rows from your spreadsheet.',
      },
      {
        title: 'Buyers pay per question',
        text: 'Buyers ask simple questions like averages, totals, or counts and get an instant answer.',
      },
      {
        title: 'Automatic fair payouts',
        text: 'Every time a question is answered, the payment is split automatically among the people who contributed the data.',
      },
    ],
    tip: 'You can use Sealed Market either to earn money from your own CSV files or to get answers from other people’s data.',
  },
  {
    step: '2 of 4',
    badge: 'For Data Owners (Selling)',
    title: 'How to list your own CSV file in 60 seconds.',
    subtitle:
      'You don’t need a crypto wallet or any technical setup to list a dataset. Just click "Sell your own data" on the main screen:',
    icon: <FileUp className="h-6 w-6" />,
    points: [
      {
        title: 'Step 1 · Enter your email (Free)',
        text: 'Enter your email address and a short name for your dataset. We create your payout profile automatically at zero cost.',
      },
      {
        title: 'Step 2 · Upload & lock your CSV in your browser',
        text: 'Pick any .csv spreadsheet from your computer and click "Lock & encrypt". It is scrambled right inside your browser before uploading.',
      },
      {
        title: 'Step 3 · Set your price per answer & publish',
        text: 'Choose how much to charge per question (for example, $4.00) and click Publish. Your dataset immediately goes live!',
      },
    ],
    tip: 'Make sure your CSV has at least 20 rows — our privacy guard requires at least 20 matching rows to answer any question.',
  },
  {
    step: '3 of 4',
    badge: 'For Buyers (Testing & Checkout)',
    title: 'Test data quality for free before you pay.',
    subtitle:
      'Never buy blind. Before you spend a single dollar, our private AI scores the dataset for your exact goal:',
    icon: <Sparkles className="h-6 w-6" />,
    points: [
      {
        title: '1 · Pick any dataset on the home screen',
        text: 'Click a dataset card and hit "Test quality for free" to move to Step 2.',
      },
      {
        title: '2 · Review the Free Quality Score',
        text: 'See how complete, unique, and up-to-date the records are, plus how much it improves prediction accuracy.',
      },
      {
        title: '3 · Quick Checkout with Money-Back Protection',
        text: 'Choose how many answers you need (1, 2, 3, or 5) and pay. Your money is held safely in escrow until your answers arrive.',
      },
    ],
    tip: 'If a dataset turns out to be low quality, our escrow protection automatically refunds 100% of your payment with zero fees.',
  },
  {
    step: '4 of 4',
    badge: 'Asking Questions & Completing Orders',
    title: 'Ask questions & release payment.',
    subtitle:
      'Once your pass is unlocked, you can ask questions and finalize your order with one click:',
    icon: <MessageSquare className="h-6 w-6" />,
    points: [
      {
        title: 'Ask averages, sums, counts, mins, or maxes',
        text: 'Pick what to calculate and any optional filter (e.g. Average of sales where weekend = 1).',
      },
      {
        title: 'Built-in individual privacy protection',
        text: 'If a question narrows down to fewer than 20 rows, it is automatically blocked so no single person can be identified.',
      },
      {
        title: 'Finish & pay contributors (or claim refund)',
        text: 'In Step 5, click "Finish & Pay Contributors" to release payment — or let the Auto-Buy Bot run the whole flow for you!',
      },
    ],
    tip: 'You can reopen this guide anytime by clicking "How it works" in the top navigation bar.',
  },
];

export const OnboardingModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onStartSelling: () => void;
}> = ({ open, onClose, onStartSelling }) => {
  const [index, setIndex] = useState(0);

  if (!open) return null;

  const slide = SLIDES[index];
  const isLast = index === SLIDES.length - 1;

  const finish = () => {
    try {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, 'seen');
    } catch {
      // ignore storage errors
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
      <div className="relative w-full max-w-2xl animate-scale-in overflow-hidden rounded-4xl border border-white/20 bg-ink-950 p-6 shadow-2xl sm:p-9">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <SealMark className="h-6 w-6 text-white" />
            <Pill tone="outline">{slide.badge}</Pill>
            <span className="font-mono text-xs text-ink-400">{slide.step}</span>
          </div>
          <button
            type="button"
            onClick={finish}
            className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 text-xs text-ink-300 transition hover:border-white/30 hover:text-white"
          >
            Skip guide <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Slide Body */}
        <div key={index} className="mt-6 animate-fade-up">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-black">
              {slide.icon}
            </div>
            <div>
              <h2 className="font-display text-3xl leading-tight tracking-tight text-white sm:text-4xl">
                {slide.title}
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-ink-300 sm:text-sm">
                {slide.subtitle}
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {slide.points.map((pt, i) => (
              <div
                key={pt.title}
                className="flex items-start gap-3.5 rounded-3xl border border-white/10 bg-white/[0.03] p-4"
              >
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white font-mono text-xs font-semibold text-black">
                  {i + 1}
                </span>
                <div>
                  <div className="text-sm font-medium text-white">{pt.title}</div>
                  <div className="mt-0.5 text-xs leading-relaxed text-ink-300">{pt.text}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 flex items-center gap-2.5 rounded-2xl bg-white/[0.04] px-4 py-3 text-xs text-ink-200">
            <ShieldCheck className="h-4 w-4 shrink-0 text-white" />
            <span>{slide.tip}</span>
          </div>
        </div>

        {/* Footer navigation */}
        <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-5">
          {/* Progress dots */}
          <div className="flex items-center gap-2">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Go to slide ${i + 1}`}
                className={cx(
                  'h-2 rounded-full transition-all duration-300',
                  i === index ? 'w-7 bg-white' : 'w-2 bg-white/25 hover:bg-white/50'
                )}
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {index > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                icon={<ArrowLeft className="h-3.5 w-3.5" />}
              >
                Back
              </Button>
            )}

            {!isLast ? (
              <Button
                size="sm"
                onClick={() => setIndex((i) => Math.min(SLIDES.length - 1, i + 1))}
                trailing={<ArrowRight className="h-3.5 w-3.5" />}
              >
                Next step
              </Button>
            ) : (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    finish();
                    onStartSelling();
                  }}
                  icon={<DollarSign className="h-3.5 w-3.5" />}
                >
                  Upload & Sell My Data
                </Button>
                <Button
                  size="sm"
                  onClick={finish}
                  icon={<Check className="h-3.5 w-3.5" />}
                >
                  Got it, let&apos;s start
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const GuideTriggerButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3.5 py-1.5 text-xs font-medium text-white transition hover:border-white/40 hover:bg-white/[0.08]"
  >
    <HelpCircle className="h-3.5 w-3.5" />
    <span>How it works</span>
  </button>
);
