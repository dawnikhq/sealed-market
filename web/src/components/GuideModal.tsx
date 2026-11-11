import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  DollarSign,
  FileUp,
  Lock,
  MessageSquare,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Button, cx, Modal, SealMark } from '../ui/kit';

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
        text: 'Buyers never download, view, or copy individual rows from your spreadsheet.',
      },
      {
        title: 'Buyers pay per question',
        text: 'Buyers ask for averages, totals, or counts and get an answer in seconds.',
      },
      {
        title: 'Automatic fair payouts',
        text: 'When an order is finished, the payment is split automatically among the people who contributed the data.',
      },
    ],
    tip: 'You can use Sealed Market either to earn money from your own CSV files or to get answers from other people’s data.',
  },
  {
    step: '2 of 4',
    badge: 'For data owners',
    title: 'How to list your own CSV file in 60 seconds.',
    subtitle:
      'You don’t need a crypto wallet or any technical setup. Open the Sell tab and follow three steps:',
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
        text: 'Choose how much to charge per question (for example, $4.00) and publish. Your dataset goes live straight away.',
      },
    ],
    tip: 'Your CSV needs at least 20 rows. The privacy guard only answers questions that match 20 rows or more.',
  },
  {
    step: '3 of 4',
    badge: 'For buyers',
    title: 'Test data quality for free before you pay.',
    subtitle:
      'Never buy blind. Before you spend a single dollar, our private AI scores the dataset for your exact goal:',
    icon: <Sparkles className="h-6 w-6" />,
    points: [
      {
        title: '1 · Pick any dataset',
        text: 'Open any dataset. Its free quality check runs straight away, for the goal you choose.',
      },
      {
        title: '2 · Read the free quality score',
        text: 'See how complete, unique, and up-to-date the records are, plus how much it improves prediction accuracy.',
      },
      {
        title: '3 · Pay per answer, with money-back protection',
        text: 'Choose how many answers you need (1, 2, 3, or 5) and pay. Your money is held safely in escrow until your answers arrive.',
      },
    ],
    tip: 'If a dataset turns out to be low quality, our escrow protection automatically refunds 100% of your payment with zero fees.',
  },
  {
    step: '4 of 4',
    badge: 'Asking questions and finishing orders',
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
        text: 'When you are done, finish the order to pay the contributors. If the data missed its quality guarantee you are refunded in full. The Auto-buy bot can run the whole thing for you.',
      },
    ],
    tip: 'You can reopen this guide anytime from “How it works” (or “Guide” on a phone).',
  },
];

export const GuideModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onStartSelling: () => void;
}> = ({ open, onClose, onStartSelling }) => {
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index];
  const isLast = index === SLIDES.length - 1;

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      icon={<SealMark className="h-5 w-5" />}
      title={
        <>
          How it works <span className="ml-1 font-mono text-xs font-normal text-ink-400">{slide.step}</span>
        </>
      }
    >
      <div key={index} className="animate-fade-up">
        <div className="eyebrow">{slide.badge}</div>
        <h2 className="mt-2 font-display text-3xl leading-[1.1] tracking-tight sm:text-4xl">{slide.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-300">{slide.subtitle}</p>

        <div className="mt-5 space-y-2.5">
          {slide.points.map((pt, i) => (
            <div key={pt.title} className="flex items-start gap-3.5 rounded-2xl border border-fg/10 p-4">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-fg font-mono text-xs font-semibold text-card">
                {i + 1}
              </span>
              <div>
                <div className="text-sm font-semibold">{pt.title}</div>
                <div className="mt-0.5 text-sm leading-relaxed text-ink-300">{pt.text}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-start gap-2.5 rounded-2xl bg-ink-900 px-4 py-3 text-sm text-ink-200">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{slide.tip}</span>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Go to slide ${i + 1}`}
              className={cx(
                'h-2 rounded-full transition-all duration-300',
                i === index ? 'w-7 bg-fg' : 'w-2 bg-fg/20 hover:bg-fg/40'
              )}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {index > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIndex((i) => i - 1)}
              icon={<ArrowLeft className="h-4 w-4" />}
            >
              Back
            </Button>
          )}
          {!isLast ? (
            <Button size="sm" onClick={() => setIndex((i) => i + 1)} trailing={<ArrowRight className="h-4 w-4" />}>
              Next
            </Button>
          ) : (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  onClose();
                  onStartSelling();
                }}
                icon={<DollarSign className="h-4 w-4" />}
              >
                Sell my data
              </Button>
              <Button size="sm" onClick={onClose} icon={<Check className="h-4 w-4" />}>
                Start browsing
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
};
