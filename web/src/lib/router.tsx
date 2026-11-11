import React, { useEffect, useState } from 'react';

/** Minimal path router. Vercel and Vite both serve index.html for every non-asset path. */
const listeners = new Set<() => void>();

export function currentPath(): string {
  return window.location.pathname.replace(/\/+$/, '') || '/';
}

export function navigate(to: string, opts: { replace?: boolean; keepScroll?: boolean } = {}): void {
  if (to !== window.location.pathname + window.location.search) {
    if (opts.replace) window.history.replaceState(null, '', to);
    else window.history.pushState(null, '', to);
  }
  listeners.forEach((fn) => fn());
  if (!opts.keepScroll) window.scrollTo({ top: 0 });
}

export function usePath(): string {
  const [path, setPath] = useState(currentPath);
  useEffect(() => {
    const update = () => setPath(currentPath());
    listeners.add(update);
    window.addEventListener('popstate', update);
    return () => {
      listeners.delete(update);
      window.removeEventListener('popstate', update);
    };
  }, []);
  return path;
}

export const Link: React.FC<React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }> = ({
  to,
  onClick,
  children,
  ...rest
}) => (
  <a
    href={to}
    onClick={(e) => {
      onClick?.(e);
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      navigate(to);
    }}
    {...rest}
  >
    {children}
  </a>
);
