import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Check, Copy, Loader2, X } from 'lucide-react';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/* ─── Button ─────────────────────────────────────────────────────────────── */

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

export const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    loading?: boolean;
    icon?: React.ReactNode;
    trailing?: React.ReactNode;
  }
> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  trailing,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}) => {
  const base =
    'group relative inline-flex select-none items-center justify-center gap-2 rounded-full font-medium transition-all duration-300 ease-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/60 focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98]';
  const sizes: Record<ButtonSize, string> = {
    sm: 'h-10 px-4 text-sm',
    md: 'h-11 px-5 text-sm',
    lg: 'h-12 px-6 text-[15px]',
  };
  const variants: Record<ButtonVariant, string> = {
    primary:
      'bg-fg text-card hover:bg-ink-100 hover:shadow-md',
    secondary:
      'border border-fg/15 bg-fg/[0.03] text-fg hover:border-fg/40 hover:bg-fg/[0.07]',
    ghost: 'text-ink-300 hover:bg-fg/[0.06] hover:text-fg',
  };
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cx(base, sizes[size], variants[variant], className)}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
      {trailing && !loading && (
        <span className="transition-transform duration-300 ease-soft group-hover:translate-x-0.5">
          {trailing}
        </span>
      )}
    </button>
  );
};

/* ─── Surfaces & atoms ───────────────────────────────────────────────────── */

export const Pill: React.FC<{
  children: React.ReactNode;
  tone?: 'solid' | 'outline' | 'muted' | 'good' | 'bad';
  className?: string;
  dot?: boolean;
}> = ({ children, tone = 'outline', className, dot }) => (
  <span
    className={cx(
      'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium',
      tone === 'solid' && 'bg-fg text-card',
      tone === 'outline' && 'border border-fg/15 text-ink-100',
      tone === 'muted' && 'bg-fg/[0.06] text-ink-300',
      tone === 'good' && 'bg-good/10 text-good',
      tone === 'bad' && 'bg-bad/10 text-bad',
      className
    )}
  >
    {dot && (
      <span
        className={cx(
          'h-1.5 w-1.5 rounded-full',
          tone === 'solid' ? 'bg-card' : 'bg-fg animate-breathe'
        )}
      />
    )}
    {children}
  </span>
);

export const Spinner: React.FC<{ className?: string }> = ({ className }) => (
  <Loader2 className={cx('h-4 w-4 animate-spin', className)} />
);

export function shortHash(hash: string, head = 8, tail = 6): string {
  if (!hash) return '—';
  if (hash.length <= head + tail + 1) return hash;
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

export const Hash: React.FC<{
  value: string;
  head?: number;
  tail?: number;
  className?: string;
}> = ({ value, head = 8, tail = 6, className }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={value}
      onClick={() => {
        navigator.clipboard?.writeText(value).catch(() => undefined);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className={cx(
        'group inline-flex max-w-full items-center gap-1.5 rounded-full font-mono text-[12px] text-ink-200 transition-colors hover:text-fg',
        className
      )}
    >
      <span className="truncate">{shortHash(value, head, tail)}</span>
      {copied ? (
        <Check className="h-3 w-3 shrink-0" />
      ) : (
        <Copy className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
      )}
    </button>
  );
};

export const KV: React.FC<{ k: string; children: React.ReactNode; className?: string }> = ({
  k,
  children,
  className,
}) => (
  <div className={cx('flex items-center justify-between gap-4 py-2.5 text-sm', className)}>
    <span className="text-ink-400">{k}</span>
    <span className="min-w-0 text-right text-fg">{children}</span>
  </div>
);

export const CheckLine: React.FC<{ ok: boolean | null; children: React.ReactNode; delay?: number }> = ({
  ok,
  children,
  delay = 0,
}) => (
  <div
    className="flex animate-fade-up items-center gap-3 text-sm"
    style={{ animationDelay: `${delay}ms` }}
  >
    <span
      className={cx(
        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-all duration-500 ease-soft',
        ok === null && 'border border-fg/15',
        ok === true && 'bg-fg text-card',
        ok === false && 'border border-fg/40 text-fg'
      )}
    >
      {ok === null ? (
        <Spinner className="h-3 w-3 text-ink-400" />
      ) : ok ? (
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      ) : (
        <X className="h-3.5 w-3.5" strokeWidth={3} />
      )}
    </span>
    <span className={ok === false ? 'text-fg line-through decoration-fg/40' : 'text-ink-100'}>
      {children}
    </span>
  </div>
);

/* ─── Segmented control ──────────────────────────────────────────────────── */

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: React.ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicator, setIndicator] = useState<{ left: number; width: number }>({ left: 0, width: 0 });
  const activeIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  );

  useEffect(() => {
    const el = refs.current[activeIndex];
    if (el) setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
  }, [activeIndex, options.length]);

  return (
    <div
      className={cx(
        'relative inline-flex flex-wrap rounded-full border border-fg/10 bg-fg/[0.03] p-1',
        className
      )}
    >
      <span
        className="absolute bottom-1 top-1 rounded-full bg-fg transition-all duration-500 ease-soft"
        style={{ left: indicator.left, width: indicator.width }}
      />
      {options.map((o, i) => (
        <button
          key={String(o.value)}
          ref={(el) => (refs.current[i] = el)}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            'relative z-10 rounded-full px-4 py-2 text-xs font-medium transition-colors duration-300',
            o.value === value ? 'text-card' : 'text-ink-300 hover:text-fg'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ─── Score ring (animated) ──────────────────────────────────────────────── */

export const ScoreRing: React.FC<{
  score: number | null;
  size?: number;
  stroke?: number;
  label?: string;
}> = ({ score, size = 120, stroke = 6, label }) => {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(score ?? 0));
    return () => cancelAnimationFrame(id);
  }, [score]);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, shown));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="currentColor" strokeOpacity={0.1} strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: 'stroke-dashoffset 1.4s cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <CountUp
          value={(score ?? 0) * 100}
          decimals={0}
          suffix="%"
          className="font-mono font-medium tabular-nums text-fg"
          style={{ fontSize: Math.max(12, size * 0.22) }}
        />
        {label && size >= 90 && (
          <span className="mt-0.5 text-[11px] uppercase tracking-[0.18em] text-ink-400">{label}</span>
        )}
      </div>
    </div>
  );
};

export const CountUp: React.FC<{
  value: number;
  decimals?: number;
  duration?: number;
  className?: string;
  style?: React.CSSProperties;
  prefix?: string;
  suffix?: string;
}> = ({ value, decimals = 0, duration = 1100, className, style, prefix = '', suffix = '' }) => {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    const from = fromRef.current;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 4);
      const v = from + (value - from) * eased;
      setDisplay(v);
      if (t < 1) frame = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);
  return (
    <span className={className} style={style}>
      {prefix}
      {display.toFixed(decimals)}
      {suffix}
    </span>
  );
};

/* ─── Bars & meters ──────────────────────────────────────────────────────── */

export const Bar: React.FC<{ value: number; className?: string; muted?: boolean }> = ({
  value,
  className,
  muted,
}) => {
  const [w, setW] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setW(Math.max(0, Math.min(1, value))));
    return () => cancelAnimationFrame(id);
  }, [value]);
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-fg/[0.08]', className)}>
      <div
        className={cx('h-full rounded-full', muted ? 'bg-fg/40' : 'bg-fg')}
        style={{ width: `${w * 100}%`, transition: 'width 1.2s cubic-bezier(0.22, 1, 0.36, 1)' }}
      />
    </div>
  );
};

/* ─── Reveal on scroll ───────────────────────────────────────────────────── */

export const Reveal: React.FC<{
  children: React.ReactNode;
  className?: string;
  delay?: number;
  as?: 'div' | 'section';
  id?: string;
}> = ({ children, className, delay = 0, as = 'div', id }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setVisible(true);
            io.disconnect();
          }
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const Tag = as as 'div';
  return (
    <Tag
      id={id}
      ref={ref}
      className={cx('reveal', visible && 'is-visible', className)}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
};

/* ─── Toasts ─────────────────────────────────────────────────────────────── */

type ToastTone = 'default' | 'success' | 'error';
interface ToastItem {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
}

const ToastCtx = createContext<(title: string, description?: string, tone?: ToastTone) => void>(
  () => undefined
);

export const useToast = () => useContext(ToastCtx);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((title: string, description?: string, tone: ToastTone = 'default') => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setItems((prev) => [...prev.slice(-3), { id, title, description, tone }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-24 left-1/2 z-[100] md:bottom-6 flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={cx(
              'pointer-events-auto flex animate-fade-up items-start gap-3 rounded-3xl px-5 py-4 shadow-2xl backdrop-blur-xl',
              t.tone === 'success' && 'bg-fg text-card',
              t.tone === 'default' && 'border border-fg/15 bg-card text-fg',
              t.tone === 'error' && 'border border-bad/40 bg-card text-fg'
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{t.title}</div>
              {t.description && (
                <div
                  className={cx(
                    'mt-0.5 break-words text-xs leading-relaxed',
                    t.tone === 'success' ? 'text-card/60' : 'text-ink-300'
                  )}
                >
                  {t.description}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
              className="mt-0.5 opacity-50 transition-opacity hover:opacity-100"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
};

export function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [query]);
  return matches;
}

/* ─── Modal: bottom sheet on phones, centred dialog on larger screens ────── */

export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  icon?: React.ReactNode;
  wide?: boolean;
  children: React.ReactNode;
}> = ({ open, onClose, title, icon, wide, children }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex animate-fade-in items-end justify-center bg-neutral-900/50 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={cx(
          'pb-safe flex max-h-[92dvh] w-full animate-sheet-up flex-col overflow-hidden rounded-t-3xl bg-card shadow-lift sm:animate-scale-in sm:rounded-3xl',
          wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-fg/10 px-5 py-4">
          <div className="flex min-w-0 items-center gap-2.5 text-base font-semibold">
            {icon}
            <span className="truncate">{title}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 flex h-10 w-10 items-center justify-center rounded-full text-ink-300 transition hover:bg-fg/[0.06] hover:text-fg"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">{children}</div>
      </div>
    </div>
  );
};

/* ─── Brand mark ─────────────────────────────────────────────────────────── */

export const SealMark: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 32 32" className={className} fill="none" aria-hidden>
    <circle cx="16" cy="16" r="15" stroke="currentColor" strokeWidth="1.5" />
    <path
      d="M9 18.5c2.2 2.6 4.6 3.9 7 3.9s4.8-1.3 7-3.9M9 13.5c2.2-2.6 4.6-3.9 7-3.9s4.8 1.3 7 3.9"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <circle cx="16" cy="16" r="2.25" fill="currentColor" />
  </svg>
);
