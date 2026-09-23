import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowUpRight,
  Banknote,
  CircleAlert,
  CircleCheck,
  MessageCircle,
  ShoppingBag,
  Smartphone,
  Users,
} from "lucide-react";

type GrowthSummary = {
  activeMerchants: number;
  totalBusinesses: number;
  usageRate: number;
  totalTransactionValue: number;
  paidOrders: number;
  customerMessages: number;
  customerConversations: number;
  mpesaValue: number;
  mpesaTransactions: number;
  connectedMerchants: number;
  trend: { date: string; transactionValue: number }[];
  recommendations: { priority: "high" | "medium" | "low"; title: string; detail: string }[];
  merchants: {
    id: string;
    name: string;
    whatsappConnected: boolean;
    plan: string;
    customerMessages: number;
    orders: number;
    paidOrders: number;
    transactionValue: number;
  }[];
};

const kes = (value: number) => `KES ${Math.round(Number(value || 0)).toLocaleString("en-KE")}`;
const number = (value: number) => Math.round(Number(value || 0)).toLocaleString("en-KE");

export function AdminOverviewTab() {
  const [days, setDays] = useState(30);
  const { data, isLoading, isError } = useQuery<GrowthSummary>({
    queryKey: ["admin-growth-summary", days],
    queryFn: async () => {
      const response = await fetch(`/api/admin/growth-summary?days=${days}`, { credentials: "include" });
      if (!response.ok) throw new Error("Could not load growth summary");
      return response.json();
    },
  });

  if (isLoading) return <div className="py-16 text-center text-gray-500 text-sm">Building growth summary…</div>;
  if (isError || !data) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
        We could not load the growth summary. Refresh the page and try again.
      </div>
    );
  }

  const latestTrend = data.trend.slice(-14);
  const maxTrendValue = Math.max(...latestTrend.map((day) => day.transactionValue), 1);

  const Metric = ({
    label,
    value,
    detail,
    icon: Icon,
    tone,
  }: {
    label: string;
    value: string;
    detail: string;
    icon: typeof Activity;
    tone: string;
  }) => (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-gray-900">{value}</p>
        </div>
        <div className={`rounded-xl p-2.5 ${tone}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-2 text-xs text-gray-500">{detail}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">Growth summary</h2>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            A practical view of merchant adoption, customer activity, and paid transaction volume.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          Period
          <select
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 font-medium text-gray-800 outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Active merchants"
          value={`${number(data.activeMerchants)} / ${number(data.totalBusinesses)}`}
          detail={`${data.usageRate.toFixed(0)}% of merchants had customer activity`}
          icon={Users}
          tone="bg-blue-50 text-blue-700"
        />
        <Metric
          label="Transaction value"
          value={kes(data.totalTransactionValue)}
          detail={`${number(data.paidOrders)} paid or fulfilled orders`}
          icon={Banknote}
          tone="bg-emerald-50 text-emerald-700"
        />
        <Metric
          label="Customer activity"
          value={number(data.customerMessages)}
          detail={`${number(data.customerConversations)} customer conversations`}
          icon={MessageCircle}
          tone="bg-violet-50 text-violet-700"
        />
        <Metric
          label="M-Pesa volume"
          value={kes(data.mpesaValue)}
          detail={`${number(data.mpesaTransactions)} M-Pesa orders`}
          icon={Smartphone}
          tone="bg-amber-50 text-amber-700"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-gray-900">What to do next</h3>
              <p className="mt-1 text-xs text-gray-500">Recommendations based on this reporting period.</p>
            </div>
            <ArrowUpRight className="h-5 w-5 text-primary" />
          </div>
          <div className="mt-4 space-y-3">
            {data.recommendations.map((recommendation, index) => (
              <div key={`${recommendation.title}-${index}`} className="flex gap-3 rounded-xl border border-gray-100 bg-gray-50/70 p-3.5">
                {recommendation.priority === "high" ? (
                  <CircleAlert className="mt-0.5 h-5 w-5 flex-shrink-0 text-rose-500" />
                ) : recommendation.priority === "medium" ? (
                  <Activity className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" />
                ) : (
                  <CircleCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-500" />
                )}
                <div>
                  <p className="text-sm font-semibold text-gray-900">{recommendation.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-gray-600">{recommendation.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-gray-900">Transaction trend</h3>
              <p className="mt-1 text-xs text-gray-500">Paid or fulfilled order value, latest 14 days.</p>
            </div>
            <ShoppingBag className="h-5 w-5 text-primary" />
          </div>
          <div className="mt-5 space-y-2.5">
            {latestTrend.map((day) => (
              <div key={day.date} className="grid grid-cols-[72px_1fr_88px] items-center gap-2 text-xs">
                <span className="text-gray-500">{new Date(`${day.date}T00:00:00+03:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</span>
                <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${Math.max((day.transactionValue / maxTrendValue) * 100, day.transactionValue ? 4 : 0)}%` }}
                  />
                </div>
                <span className="text-right font-medium text-gray-700">{kes(day.transactionValue)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-2 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-center">
          <div>
            <h3 className="font-semibold text-gray-900">Merchant performance</h3>
            <p className="mt-1 text-xs text-gray-500">Top merchants ranked by paid transaction value.</p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Connected: {number(data.connectedMerchants)}
          </span>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            <div className="grid grid-cols-[2fr_0.8fr_0.8fr_0.8fr_1.2fr] gap-4 border-b border-gray-100 bg-gray-50 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              <span>Merchant</span><span>Messages</span><span>Orders</span><span>Paid</span><span className="text-right">Value</span>
            </div>
            {data.merchants.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-gray-500">No merchant activity in this period.</div>
            ) : (
              data.merchants.map((merchant, index) => (
                <div key={merchant.id} className="grid grid-cols-[2fr_0.8fr_0.8fr_0.8fr_1.2fr] items-center gap-4 border-b border-gray-100 px-5 py-3.5 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{index + 1}</span>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{merchant.name}</p>
                      <p className="text-[11px] text-gray-500">{merchant.whatsappConnected ? "WhatsApp connected" : "WhatsApp not connected"} · {merchant.plan.replace("_", " ")}</p>
                    </div>
                  </div>
                  <span className="text-sm text-gray-700">{number(merchant.customerMessages)}</span>
                  <span className="text-sm text-gray-700">{number(merchant.orders)}</span>
                  <span className="text-sm text-gray-700">{number(merchant.paidOrders)}</span>
                  <span className="text-right text-sm font-semibold text-gray-900">{kes(merchant.transactionValue)}</span>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-gray-100 px-5 py-3 text-[11px] text-gray-500">
          <CircleAlert className="h-3.5 w-3.5" />
          Transaction value includes only paid or fulfilled orders; pending orders are shown separately in the summary data.
        </div>
      </section>
    </div>
  );
}