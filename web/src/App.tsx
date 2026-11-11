import React from 'react';
import { AdminApp } from './admin/AdminApp';
import { Shell } from './components/Shell';
import { Link, usePath } from './lib/router';
import { AutoBuyPage } from './pages/AutoBuyPage';
import { HomePage } from './pages/HomePage';
import { ListingPage } from './pages/ListingPage';
import { OrderPage, OrdersPage } from './pages/OrdersPage';
import { SellPage } from './pages/SellPage';
import { StoreProvider } from './store';
import { Button, ToastProvider } from './ui/kit';

/**
 * Routes:
 *  /             browse datasets
 *  /d/:id        dataset page: free quality check and purchase
 *  /orders       my orders and market activity
 *  /orders/:id   one order: ask questions, then finish
 *  /sell         list a dataset
 *  /auto-buy     budget-capped buying bot
 *  /admin        operator console (not linked anywhere; password checked server-side)
 */
const Routes: React.FC<{ path: string }> = ({ path }) => {
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts.length === 0) return <HomePage />;
  if (parts[0] === 'd' && parts[1]) return <ListingPage id={parts[1]} />;
  if (parts[0] === 'orders') return parts[1] ? <OrderPage id={parts[1]} /> : <OrdersPage />;
  if (parts[0] === 'sell') return <SellPage />;
  if (parts[0] === 'auto-buy') return <AutoBuyPage />;
  return (
    <div className="container-page py-20 text-center">
      <h1 className="font-display text-5xl">Page not found</h1>
      <p className="mt-2 text-ink-300">That link doesn’t go anywhere.</p>
      <div className="mt-6">
        <Link to="/">
          <Button>Browse datasets</Button>
        </Link>
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  const path = usePath();
  if (path === '/admin' || path.startsWith('/admin/')) {
    return (
      <ToastProvider>
        <AdminApp />
      </ToastProvider>
    );
  }
  return (
    <ToastProvider>
      <StoreProvider>
        <Shell>
          <Routes path={path} />
        </Shell>
      </StoreProvider>
    </ToastProvider>
  );
};
