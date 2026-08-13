import {
  useAdminListBusinesses,
  getAdminListBusinessesQueryKey,
  useAdminChargeSubscription,
  useAdminSuspendBusiness,
  useAdminUnsuspendBusiness,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Ban, PlayCircle, CreditCard, Smartphone, MessageSquare, CheckCircle2, AlertCircle } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface Props {
  onConfigureWhatsApp: () => void;
}

export function AdminBusinessesTab({ onConfigureWhatsApp }: Props) {
  const { data: businesses, isLoading } = useAdminListBusinesses();
  const [search, setSearch] = useState("");

  const charge    = useAdminChargeSubscription();
  const suspend   = useAdminSuspendBusiness();
  const unsuspend = useAdminUnsuspendBusiness();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleSuspend = (id: string) => {
    if (!confirm("Suspend this business? They will lose access.")) return;
    suspend.mutate({ businessId: id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getAdminListBusinessesQueryKey() });
        toast({ title: "Business suspended" });
      },
    });
  };

  const handleUnsuspend = (id: string) => {
    unsuspend.mutate({ businessId: id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getAdminListBusinessesQueryKey() });
        toast({ title: "Business restored" });
      },
    });
  };

  const handleCharge = (id: string) => {
    charge.mutate({ businessId: id, data: {} }, {
      onSuccess: () => toast({ title: "M-Pesa charge prompt sent" }),
    });
  };

  const filtered = (businesses || []).filter(
    (b) =>
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      b.phone.includes(search) ||
      (b as any).email?.toLowerCase().includes(search.toLowerCase()),
  );

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      active:    "bg-emerald-100 text-emerald-700",
      trialing:  "bg-blue-100 text-blue-700",
      suspended: "bg-rose-100 text-rose-700",
      past_due:  "bg-amber-100 text-amber-700",
    };
    return (
      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${map[status] ?? "bg-gray-100 text-gray-700"}`}>
        {status.replace("_", " ")}
      </span>
    );
  };

  const planBadge = (plan: string) => (
    <span className="inline-flex items-center rounded border border-gray-300 px-2 py-0.5 text-xs font-medium text-gray-700 capitalize">
      {plan}
    </span>
  );

  if (isLoading) {
    return <div className="py-16 text-center text-gray-400 text-sm">Loading businesses…</div>;
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative w-72">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search businesses…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-10 bg-white border-gray-200 text-gray-900 placeholder:text-gray-400 focus-visible:ring-primary"
        />
      </div>

      {/* Table */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[2fr_1.4fr_1fr_0.7fr_1.6fr] border-b border-gray-200 bg-gray-50 px-4 py-2.5">
          {["BUSINESS", "PLAN & STATUS", "METRICS", "REPORTS", "ACTIONS"].map((h) => (
            <span key={h} className="text-[11px] font-semibold tracking-wide text-gray-500 uppercase">{h}</span>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="px-4 py-16 text-center text-gray-400 text-sm">No businesses found.</div>
        ) : (
          filtered.map((b, i) => {
            const isSuspended = b.subscription.status === "suspended";
            const reportCount  = (b as any).openReportCount ?? 0;
            const productCount = (b as any).productCount ?? 0;
            const orderCount   = (b as any).orderCount ?? 0;
            const waConnected  = !!(b as any).whatsappPhoneNumberId;
            const joinedDate   = b.createdAt ? new Date(b.createdAt).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : "";

            return (
              <div
                key={b.id}
                className={`grid grid-cols-[2fr_1.4fr_1fr_0.7fr_1.6fr] items-center px-4 py-4 ${i < filtered.length - 1 ? "border-b border-gray-100" : ""} hover:bg-gray-50/60 transition-colors`}
              >
                {/* Business */}
                <div>
                  <div className="font-semibold text-gray-900 text-sm">{b.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{(b as any).email || b.phone}{joinedDate ? ` • Joined ${joinedDate}` : ""}</div>
                </div>

                {/* Plan & Status */}
                <div className="flex items-center gap-2 flex-wrap">
                  {planBadge(b.subscription.plan)}
                  {statusBadge(b.subscription.status)}
                </div>

                {/* Metrics */}
                <div className="space-y-1">
                  <div className="text-xs text-gray-600">{productCount} prods</div>
                  <div className="text-xs text-gray-600">{orderCount} orders</div>
                  <div className={`flex items-center gap-1 text-xs ${waConnected ? "text-emerald-600" : "text-gray-400"}`}>
                    <Smartphone className="h-3 w-3" />
                    {waConnected ? "WA connected" : "WA pending"}
                  </div>
                </div>

                {/* Reports */}
                <div>
                  {reportCount > 0 ? (
                    <span className="flex items-center gap-1 text-xs text-rose-600 font-medium">
                      <AlertCircle className="h-3.5 w-3.5" /> {reportCount}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Clean
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* WhatsApp config */}
                  <button
                    onClick={onConfigureWhatsApp}
                    title="Configure WhatsApp"
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-800 transition-colors"
                  >
                    <MessageSquare className="h-3.5 w-3.5" /> WhatsApp
                  </button>

                  {/* Charge */}
                  <button
                    onClick={() => handleCharge(b.id)}
                    disabled={charge.isPending}
                    title="Send M-Pesa charge"
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-800 transition-colors disabled:opacity-50"
                  >
                    <CreditCard className="h-3.5 w-3.5" /> Charge
                  </button>

                  {/* Suspend / Restore */}
                  {isSuspended ? (
                    <button
                      onClick={() => handleUnsuspend(b.id)}
                      disabled={unsuspend.isPending}
                      className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-50"
                    >
                      <PlayCircle className="h-3.5 w-3.5" /> Restore
                    </button>
                  ) : (
                    <button
                      onClick={() => handleSuspend(b.id)}
                      disabled={suspend.isPending}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-50"
                    >
                      <Ban className="h-3.5 w-3.5" /> Suspend
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
