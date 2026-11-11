import React from 'react';
import { ToastProvider } from './ui/kit';
import { Flow } from './flow/Flow';
import { AdminApp } from './admin/AdminApp';

/**
 * Two surfaces, no visible link between them:
 *  - `/`       → the single guided marketplace flow
 *  - `/admin`  → operator console (only reachable by typing the URL; password-gated server-side)
 */
export const App: React.FC = () => {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  const isAdmin = path === '/admin' || path.startsWith('/admin/');
  return <ToastProvider>{isAdmin ? <AdminApp /> : <Flow />}</ToastProvider>;
};
