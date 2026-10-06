import { getGetBusinessAiUsageQueryKey, useGetBusinessAiUsage } from "@workspace/api-client-react";
import { Activity, Coins, Gauge } from "lucide-react";

const tokenFormat = new Intl.NumberFormat("en-KE");
const spendFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

function formatDate(date: string) {
  return new Date(`${date}T00:00:00.000Z`).toLocaleDateString("en-KE", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function AiUsageCard({ businessId }: { businessId: string }) {
  const { data, isLoading, isError } = useGetBusinessAiUsage(businessId, {
    query: {
      enabled: Boolean(businessId),
      queryKey: getGetBusinessAiUsageQueryKey(businessId),
      refetchInterval: 60_000,
    },
  });

  const spend = data?.estimatedSpendUsd == null
    ? data?.unpricedRequestCount
      ? "Unavailable"
      : "—"
    : spendFormat.format(data.estimatedSpendUsd);
  const recentDays = (data?.daily || []).slice(0, 7);

  return (
    <section
      aria-labelledby="ai-usage-title"
      className="rounded-xl border border-border bg-white p-5 shadow-sm"
      data-testid="ai-usage-card"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="ai-usage-title" className="font-semibold text-foreground">AI usage</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Last 30 days</p>
        </div>
        {data?.models?.length ? (
          <span className="max-w-full break-all rounded-full bg-muted px-2.5 py-1 text-[10px] text-muted-foreground">
            {data.models.join(", ")}
          </span>
        ) : null}
      </div>

      {isError ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Usage summary could not be loaded.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                <Activity className="h-4 w-4" />
                <span className="text-xs font-medium">AI calls</span>
              </div>
              <p className="text-xl font-bold text-foreground">
                {isLoading ? "—" : tokenFormat.format(data?.requestCount || 0)}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                <Gauge className="h-4 w-4" />
                <span className="text-xs font-medium">Reported tokens</span>
              </div>
              <p className="text-xl font-bold text-foreground">
                {isLoading ? "—" : tokenFormat.format(data?.totalTokens || 0)}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                <Coins className="h-4 w-4" />
                <span className="text-xs font-medium">Estimated spend</span>
              </div>
              <p className="text-xl font-bold text-foreground">{isLoading ? "—" : spend}</p>
            </div>
          </div>

          {recentDays.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[440px] text-left text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="pb-2 font-medium">Day</th>
                    <th className="pb-2 text-right font-medium">Calls</th>
                    <th className="pb-2 text-right font-medium">Tokens</th>
                    <th className="pb-2 text-right font-medium">Estimated spend</th>
                  </tr>
                </thead>
                <tbody>
                  {recentDays.map((day) => (
                    <tr key={day.date} className="border-t border-border/70">
                      <td className="py-2 text-foreground">{formatDate(day.date)}</td>
                      <td className="py-2 text-right text-foreground">{tokenFormat.format(day.requestCount)}</td>
                      <td className="py-2 text-right text-foreground">{tokenFormat.format(day.totalTokens)}</td>
                      <td className="py-2 text-right text-foreground">
                        {day.estimatedSpendUsd == null ? "Unavailable" : spendFormat.format(day.estimatedSpendUsd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            Spend is estimated from provider-reported tokens and configured rates. It is not an invoice and may differ from account billing.
            {data?.unpricedRequestCount
              ? ` ${data.unpricedRequestCount} call(s) could not be priced.`
              : ""}
          </p>
        </>
      )}
    </section>
  );
}
