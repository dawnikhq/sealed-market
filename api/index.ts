import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp, initializeEnclaveState } from '../tee/src/server.js';

let appPromise: Promise<ReturnType<typeof createApp>> | null = null;

async function getExpressApp() {
  if (!appPromise) {
    appPromise = initializeEnclaveState().then(() => createApp());
  }
  return appPromise;
}

export default async function handler(req: IncomingMessage & { url?: string }, res: ServerResponse) {
  const app = await getExpressApp();
  const rawUrl = req.url || '/';
  const parsed = new URL(rawUrl, 'http://localhost');
  const rewrittenSubpath = parsed.searchParams.get('__path');
  if (rewrittenSubpath !== null) {
    parsed.searchParams.delete('__path');
    const qs = parsed.searchParams.toString();
    req.url = `/${rewrittenSubpath.replace(/^\/+/, '')}${qs ? `?${qs}` : ''}`;
  } else {
    req.url =
      rawUrl
        .replace(/^\/tee-api(?=\/|$|\?)/, '')
        .replace(/^\/api(?=\/|$|\?)/, '') || '/';
  }
  return app(req as any, res as any);
}
