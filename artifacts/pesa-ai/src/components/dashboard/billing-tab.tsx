import {
  useGetMe, useGetSubscription, getGetSubscriptionQueryKey,
  useChangeSubscriptionPlan, useChargeSubscription,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, Zap, CheckCircle2, Smartphone, Calendar } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";

interface Plan {
  id: string;
  name: string;
  priceKES: number;
  features: string[];
  highlighted?: boolean;
}

const PLANS: Plan[] = [
  {
    id: "Starter",
    name: "Starter",
    priceKES: 2_999,
    features: ["Up to 50 products", "AI handles customer chats", "Order tracking", "WhatsApp shop link"],
  },
  {
    id: "Business",
    name: "Business",
    priceKES: 4_999,
    features: ["Up to 500 products", "M-Pesa payment prompts", "Basic sales analytics", "Priority support"],
    highlighted: true,
  },
  {
    id: "Pro",
    name: "Pro",
    priceKES: 9_999,
    features: ["Unlimited products", "Advanced analytics", "Multiple staff accounts", "Custom AI persona"],
  },
];

export function BillingTab() {
  const { data: me } = useGetMe();
  const businessId = me?.business?.id || "";

  const { data: sub, isLoading } = useGetSubscription(businessId, {
    query: { enabled: !!businessId, queryKey: getGetSubscriptionQueryKey(businessId) },
  });

  const changePlan   = useChangeSubscriptionPlan();
  const charge       = useChargeSubscription();
  const queryClient  = useQueryClient();
  const { toast }    = useToast();

  const [phone, setPhone] = useState(me?.business?.phone || "");

  const handlePlanChange = (planId: string) => {
    if (!confirm(`Switch to the ${planId} plan?`)) return;
    changePlan.mutate({ businessId, data: { plan: planId } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSubscriptionQueryKey(businessId) });
        toast({ title: `Switched to ${planId} plan` });
      },
    });
  };

  const handleCharge = () => {
    if (!phone) return;
    charge.mutate({ businessId, data: { phone } }, {
      onSuccess: () => toast({ title: "M-Pesa prompt sent — check your phone to confirm" }),
    });
  };

  if (isLoading) return <div className="py-16 text-center text-muted-foreground text-sm">Loading billing…</div>;

  const statusBadge = (s: string) => {
    const map: Record<string, string> = { active: "bg-emerald-100 text-emerald-700", trialing: "bg-blue-100 text-blue-700", suspended: "bg-rose-100 text-rose-700", past_due: "bg-amber-100 text-amber-700" };
    return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${map[s] ?? "bg-muted text-muted-foreground"}`}>{s.replace("_", " ")}</span>;
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h2 className="text-xl font-bold text-foreground">Billing & Plan</h2>
        <p className="text-sm text-muted-foreground">Manage your subscription and pay your monthly bill.</p>
      </div>

      {/* Current plan + payment */}
      <div className="grid sm:grid-cols-2 gap-4">
        {/* Current plan card */}
        <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Current Plan</p>
              <p className="text-2xl font-bold text-foreground mt-1">{sub?.plan || "—"}</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Zap className="h-5 w-5 text-primary" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {statusBadge(sub?.status || "active")}
            <span className="text-sm text-muted-foreground">KES {sub?.priceKES?.toLocaleString()} / month</span>
          </div>
          {sub?.currentPeriodEnd && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              Next billing: {new Date(sub.currentPeriodEnd).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
            </div>
          )}
        </div>

        {/* Pay via M-Pesa */}
        <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pay via M-Pesa</p>
              <p className="text-sm text-muted-foreground mt-1">We'll send a prompt to your phone — just confirm to pay.</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Smartphone className="h-5 w-5 text-primary" />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Your M-Pesa phone number</label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 0712 345 678" />
          </div>
          <button
            onClick={handleCharge}
            disabled={charge.isPending || !phone}
            className="w-full h-10 rounded-xl bg-primary text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
          >
            <CreditCard className="h-4 w-4" />
            {charge.isPending ? "Sending prompt…" : "Pay Now"}
          </button>
        </div>
      </div>

      {/* Plan comparison */}
      <div>
        <h3 className="text-base font-bold text-foreground mb-4">All Plans</h3>
        <div className="grid sm:grid-cols-3 gap-4">
          {PLANS.map((plan) => {
            const isCurrent = sub?.plan === plan.id;
            return (
              <div
                key={plan.id}
                className={`rounded-2xl border p-5 flex flex-col gap-4 transition-all ${
                  isCurrent
                    ? "border-primary shadow-sm ring-1 ring-primary/20 bg-card"
                    : plan.highlighted
                    ? "border-border bg-card"
                    : "border-border bg-muted/30"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-bold text-foreground">{plan.name}</p>
                    {isCurrent && <span className="text-[10px] font-bold bg-primary text-white rounded-full px-2 py-0.5 uppercase tracking-wide">Current</span>}
                    {plan.highlighted && !isCurrent && <span className="text-[10px] font-bold bg-primary/10 text-primary rounded-full px-2 py-0.5 uppercase tracking-wide">Popular</span>}
                  </div>
                  <p className="text-xl font-bold text-foreground">KES {plan.priceKES.toLocaleString()}<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
                </div>

                <ul className="space-y-2 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>

                {!isCurrent && (
                  <button
                    onClick={() => handlePlanChange(plan.id)}
                    disabled={changePlan.isPending}
                    className={`w-full h-9 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60 ${
                      plan.highlighted
                        ? "bg-primary text-white hover:bg-primary/90"
                        : "border border-border text-foreground hover:bg-muted"
                    }`}
                  >
                    {(sub?.priceKES ?? 0) < plan.priceKES ? "Upgrade" : "Downgrade"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
