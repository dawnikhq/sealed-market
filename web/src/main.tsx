import './polyfills/buffer';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-black p-6 text-white">
          <div className="w-full max-w-xl rounded-4xl border border-white/15 p-8">
            <div className="eyebrow">Something broke</div>
            <h1 className="mt-3 font-display text-4xl">The interface hit an error.</h1>
            <pre className="mt-6 max-h-72 overflow-auto whitespace-pre-wrap rounded-2xl bg-white/[0.04] p-4 font-mono text-xs text-ink-300">
              {this.state.error.stack || this.state.error.message}
            </pre>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-6 h-11 rounded-full bg-white px-6 text-sm font-medium text-black"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>
);
