import React from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { AskPanel } from '../components/AskPanel';
import { SettlePanel } from '../components/SettlePanel';
import { SOURCE_CHAIN_ASSETS } from '../lib/intents';
import { Link } from '../lib/router';
import { money, shortAccount, timeAgo, useStore, type Order } from '../store';
import { Button, cx, Hash, KV, Pill } from '../ui/kit';

function orderStatus(o: Order): { label: string; tone: 'solid' | 'good' | 'muted' } {
  if (o.settlement) {
    return { label: o.settlement.outcome === 'RELEASED' ? 'Complete' : 'Refunded', tone: 'good' };
  }
  const left = o.answers[0]?.answersLeft ?? o.purchase.token.answers_left;
  return left > 0 ? { label: `${left} answers left`, tone: 'solid' } : { label: 'Ready to finish', tone: 'solid' };
}

/** A single order: ask questions, then finish. */
export const OrderPage: React.FC<{ id: string }> = ({ id }) => {
  const { orders, listings, loading, updateOrder, reload } = useStore();
  const order = orders.find((o) => o.id === id);

  if (!order) {
    return (
      <div className="container-page py-20 text-center">
        <h1 className="font-display text-4xl">Order not found</h1>
        <p className="mx-auto mt-2 max-w-md text-ink-300">
          Orders are kept in the browser you bought them with. Open this page there, or start a new order.
        </p>
        <div className="mt-6">
          <Link to="/orders">
            <Button>My orders</Button>
          </Link>
        </div>
      </div>
    );
  }

  const listing = listings.find((l) => l.id === order.listingId) || null;
  const status = orderStatus(order);
  const step = order.settlement ? 3 : order.answers.length > 0 ? 2 : 1;

  return (
    <div className="container-page py-5 sm:py-8">
      <Link to="/orders" className="inline-flex h-10 items-center gap-1 text-sm font-medium text-ink-300 hover:text-fg">
        <ChevronLeft className="h-4 w-4" /> My orders
      </Link>

      <header className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={status.tone}>{status.label}</Pill>
            <span className="font-mono text-sm text-ink-400">Order {order.id}</span>
          </div>
          <h1 className="mt-2 font-display text-[2rem] leading-[1.05] tracking-tight sm:text-5xl">
            {order.listingTitle}
          </h1>
          <div className="mt-2 text-sm text-ink-300">
            {money(order.purchase.amountUsdc)} USDC in escrow · {order.purchase.answers} answer
            {order.purchase.answers > 1 ? 's' : ''} · bought {timeAgo(order.createdAtMs)}
          </div>
        </div>
        <Link
          to={`/d/${order.listingId}`}
          className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-ink-300 hover:text-fg"
        >
          View dataset <ArrowRight className="h-4 w-4" />
        </Link>
      </header>

      {/* Progress */}
      <ol className="mt-6 grid grid-cols-3 gap-2 text-sm">
        {['Paid into escrow', 'Ask your questions', 'Finish the order'].map((label, i) => {
          const n = i + 1;
          const done = n < step || (n === 3 && Boolean(order.settlement)) || n === 1;
          const current = n === step && !done;
          return (
            <li
              key={label}
              className={cx(
                'rounded-xl border px-3 py-2.5',
                done ? 'border-fg bg-fg text-card' : current ? 'border-fg bg-card' : 'border-fg/10 bg-card text-ink-400'
              )}
            >
              <div className="font-mono text-xs opacity-70">Step {n}</div>
              <div className="font-medium leading-snug">{label}</div>
            </li>
          );
        })}
      </ol>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">Ask your questions</h2>
        <p className="mb-4 mt-1 text-sm text-ink-300">
          Averages, totals and counts. You get the answer; the rows stay sealed.
        </p>
        {listing ? (
          <AskPanel
            listing={listing}
            account={order.buyer}
            purchase={order.purchase}
            answers={order.answers}
            closed={Boolean(order.settlement)}
            onAnswered={(a) => {
              updateOrder(order.id, (o) => ({ ...o, answers: [a, ...o.answers] }));
              reload();
            }}
          />
        ) : (
          <div className="surface p-6 text-sm text-ink-300">
            {loading
              ? 'Loading the dataset…'
              : 'This dataset is no longer listed, so new questions can’t be asked. You can still finish the order below.'}
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">{order.settlement ? 'Receipt' : 'Finish the order'}</h2>
        <p className="mb-4 mt-1 text-sm text-ink-300">
          {order.settlement
            ? 'This order is settled.'
            : 'When you have what you need, finish to release the payment from escrow.'}
        </p>
        <SettlePanel
          listingId={order.listingId}
          appraisal={order.appraisal}
          purchase={order.purchase}
          answers={order.answers}
          settlement={order.settlement}
          onSettled={(s) => {
            updateOrder(order.id, (o) => ({ ...o, settlement: s }));
            reload();
          }}
        />
        {order.settlement && (
          <div className="mt-4">
            <Link to="/">
              <Button variant="secondary">Browse more datasets</Button>
            </Link>
          </div>
        )}
      </section>

      <details className="mt-8 rounded-2xl border border-fg/10 bg-card px-5 py-4 text-sm">
        <summary className="cursor-pointer list-none font-medium text-ink-300 hover:text-fg">
          Payment and pass details
        </summary>
        <div className="mt-2 divide-y divide-fg/[0.07]">
          <KV k="Answer pass">
            <span className="break-all font-mono text-xs">{order.purchase.token.token_id}</span>
          </KV>
          <KV k="Paid with">{SOURCE_CHAIN_ASSETS[order.purchase.sourceChain].label}</KV>
          <KV k="Buyer account">
            <span className="font-mono text-xs">{order.buyer}</span>
          </KV>
          <KV k="Payment reference">
            <Hash value={order.purchase.intentTxHash} />
          </KV>
        </div>
      </details>
    </div>
  );
};

/** My orders, plus the public activity log. */
export const OrdersPage: React.FC = () => {
  const { orders, settlements, queries, listings, reload } = useStore();
  const titleOf = (id: string) => listings.find((l) => l.id === id)?.title ?? id;

  return (
    <div className="container-page py-6 sm:py-10">
      <h1 className="font-display text-4xl tracking-tight sm:text-5xl">Orders</h1>
      <p className="mt-2 text-ink-300">Your purchases in this browser, and what is happening across the market.</p>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">My orders</h2>
        {orders.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-fg/20 bg-card p-8 text-center">
            <div className="text-lg font-semibold">No orders yet</div>
            <p className="mx-auto mt-1 max-w-sm text-sm text-ink-300">
              Pick a dataset, check its quality for free, and buy your first answer.
            </p>
            <div className="mt-5">
              <Link to="/">
                <Button>Browse datasets</Button>
              </Link>
            </div>
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {orders.map((o) => {
              const st = orderStatus(o);
              return (
                <li key={o.id}>
                  <Link
                    to={`/orders/${o.id}`}
                    className="flex items-center gap-4 rounded-2xl border border-fg/10 bg-card p-4 shadow-card transition hover:border-fg/30"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Pill tone={st.tone}>{st.label}</Pill>
                        <span className="text-sm text-ink-400">{timeAgo(o.createdAtMs)}</span>
                      </div>
                      <div className="mt-1.5 truncate font-semibold">{o.listingTitle}</div>
                      <div className="text-sm text-ink-300">
                        {money(o.purchase.amountUsdc)} · {o.answers.length} of {o.purchase.answers} answers used
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-ink-400" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-12">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold">Market activity</h2>
          <Button variant="secondary" size="sm" onClick={reload} icon={<RefreshCw className="h-4 w-4" />}>
            Refresh
          </Button>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="surface min-w-0 p-5">
            <div className="text-sm font-semibold">Settled orders ({settlements.length})</div>
            {settlements.length === 0 ? (
              <p className="mt-4 text-sm text-ink-400">No orders have been settled yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-fg/[0.07]">
                {settlements.slice(0, 8).map((s) => (
                  <li key={s.id} className="py-3">
                    <div className="flex items-center justify-between gap-3">
                      <Pill tone={s.outcome === 'RELEASED' ? 'good' : 'muted'}>
                        {s.outcome === 'RELEASED' ? 'Contributors paid' : 'Buyer refunded'}
                      </Pill>
                      <span className="font-mono text-sm font-medium tabular-nums">
                        {money(s.total_amount_usdc)}
                      </span>
                    </div>
                    <div className="mt-1.5 truncate text-sm">{titleOf(s.listing_id)}</div>
                    <div className="mt-0.5 text-sm text-ink-400">
                      {s.payouts.map((p) => `${shortAccount(p.account)} +${money(p.amount_usdc)}`).join(' · ')}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="surface min-w-0 p-5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold">Questions answered ({queries.length})</span>
              <span className="text-ink-400">Rows never shared</span>
            </div>
            {queries.length === 0 ? (
              <p className="mt-4 text-sm text-ink-400">No questions have been asked yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-fg/[0.07]">
                {queries.slice(0, 8).map((x) => (
                  <li key={x.id} className="py-3">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-mono">
                        {x.query_spec ? `${x.query_spec.op}(${x.query_spec.column})` : 'Aggregate'}
                      </span>
                      <span className="text-ink-400">{timeAgo(x.timestamp_ms)}</span>
                    </div>
                    <div className="mt-1 truncate text-sm text-ink-300">{titleOf(x.listing_id)}</div>
                    <div className="mt-0.5 text-sm text-ink-400">
                      Signed result <Hash value={x.result_hash} head={8} tail={6} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
