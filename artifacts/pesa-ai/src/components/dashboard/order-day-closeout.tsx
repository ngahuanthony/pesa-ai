import { Banknote, CheckCircle2, CircleDollarSign, CircleHelp, Clock3, CreditCard, ShoppingBag, Smartphone, XCircle } from "lucide-react";
import { summarizeOrderCloseout, type CloseoutOrder } from "@/lib/order-closeout";

const ORDER_TIME_ZONE = "Africa/Nairobi";
const amountFormatter = new Intl.NumberFormat("en-KE", { maximumFractionDigits: 2 });

function formatKes(value: number) {
  return `KSh ${amountFormatter.format(value)}`;
}

function formatCloseoutDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return new Intl.DateTimeFormat("en-KE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: ORDER_TIME_ZONE,
  }).format(date);
}

export function OrderDayCloseout({ orders }: { orders: readonly CloseoutOrder[] }) {
  const summary = summarizeOrderCloseout(orders);
  const metrics = [
    {
      label: "Orders received",
      value: summary.ordersReceived,
      detail: "Today",
      icon: ShoppingBag,
      tone: "bg-sky-50 text-sky-700",
      testId: "text-closeout-orders",
    },
    {
      label: "Sales collected",
      value: formatKes(summary.totalSales),
      detail: `${summary.paidOrderCount} paid order${summary.paidOrderCount === 1 ? "" : "s"} today`,
      icon: CircleDollarSign,
      tone: "bg-emerald-50 text-emerald-700",
      testId: "text-closeout-sales",
    },
    {
      label: "Served today",
      value: summary.servedToday,
      detail: "Served or completed",
      icon: CheckCircle2,
      tone: "bg-indigo-50 text-indigo-700",
      testId: "text-closeout-served",
    },
    {
      label: "Still open / unpaid",
      value: summary.openNow,
      detail: "Current orders not closed",
      icon: Clock3,
      tone: "bg-amber-50 text-amber-800",
      testId: "text-closeout-open",
    },
    {
      label: "Cancelled today",
      value: summary.cancelledToday,
      detail: "Cancellation updates today",
      icon: XCircle,
      tone: "bg-rose-50 text-rose-700",
      testId: "text-closeout-cancelled",
    },
  ];
  const paymentRows = [
    { label: "Cash", icon: Banknote, total: summary.payments.cash },
    { label: "Card", icon: CreditCard, total: summary.payments.card },
    { label: "M-Pesa", icon: Smartphone, total: summary.payments.mpesa },
    { label: "Other / unrecorded", icon: CircleHelp, total: summary.payments.other },
  ];

  return (
    <section
      aria-labelledby="orders-closeout-title"
      data-testid="section-order-closeout"
      className="mb-4 overflow-hidden rounded-2xl border border-border bg-white shadow-sm"
    >
      <div className="flex flex-col gap-2 border-b border-border bg-gradient-to-r from-primary/10 via-white to-emerald-50/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Daily closeout</p>
          <h2 id="orders-closeout-title" className="mt-1 text-lg font-bold text-foreground">End-of-day summary</h2>
          <p className="mt-0.5 text-xs text-muted-foreground" data-testid="text-closeout-date">
            {formatCloseoutDate(summary.date)} · East Africa Time
          </p>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-200 bg-white/90 px-3 py-1.5 text-[11px] font-semibold text-emerald-800">
          <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
          Updates with order activity
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 xl:grid-cols-5 sm:p-5">
        {metrics.map(({ label, value, detail, icon: Icon, tone, testId }) => (
          <div key={label} className="min-w-0 rounded-xl border border-border/80 bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone}`}>
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
            </div>
            <p className="mt-3 truncate text-xl font-extrabold tracking-tight text-foreground" data-testid={testId}>{value}</p>
            <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{detail}</p>
          </div>
        ))}
      </div>

      <div className="grid border-t border-border lg:grid-cols-[0.9fr_1.1fr]">
        <div className="border-b border-border p-4 lg:border-b-0 lg:border-r sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <CircleDollarSign className="h-4 w-4 text-emerald-700" aria-hidden="true" />
            <h3 className="text-sm font-bold text-foreground">Payment breakdown</h3>
          </div>
          <div className="space-y-2">
            {paymentRows.map(({ label, icon: Icon, total }) => (
              <div key={label} className="flex items-center justify-between gap-4 rounded-lg bg-muted/40 px-3 py-2" data-testid={`row-closeout-payment-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`}>
                <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{label}</span>
                  <span className="text-[10px]">({total.count})</span>
                </div>
                <span className="shrink-0 text-xs font-bold text-foreground">{formatKes(total.amount)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <ShoppingBag className="h-4 w-4 text-primary" aria-hidden="true" />
            <h3 className="text-sm font-bold text-foreground">Top items sold</h3>
            <span className="text-[10px] text-muted-foreground">by quantity</span>
          </div>
          {summary.topItems.length === 0 ? (
            <p className="rounded-lg bg-muted/40 px-3 py-4 text-xs text-muted-foreground" data-testid="text-closeout-no-items">
              No paid items recorded today yet.
            </p>
          ) : (
            <ol className="space-y-2">
              {summary.topItems.map((item, index) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-4 rounded-lg bg-muted/40 px-3 py-2"
                  data-testid={`row-closeout-top-item-${index + 1}`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-bold text-muted-foreground">{index + 1}</span>
                    <span className="truncate text-xs font-semibold text-foreground">{item.name}</span>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-bold text-foreground">{item.quantity} sold</p>
                    <p className="text-[10px] text-muted-foreground">{formatKes(item.revenue)}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      <div className="flex items-start gap-2 border-t border-border bg-slate-50/70 px-4 py-3 sm:px-5">
        <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="text-[10px] leading-4 text-muted-foreground">
          Sales and top items use payments recorded today. Served and cancellations use today’s status updates. “Still open / unpaid” includes all current unfinished orders.
        </p>
      </div>
    </section>
  );
}
