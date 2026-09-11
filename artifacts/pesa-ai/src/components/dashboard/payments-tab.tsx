import { useEffect, useState } from "react";
import { useGetMe } from "@workspace/api-client-react";
import { CreditCard, CheckCircle2, ShieldCheck, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";

type Method = "till" | "paybill" | "paybill_account";
type MpesaStatus = { connected?: boolean; verified?: boolean; method?: Method | null; accountMode?: string; shortcodeMasked?: string | null };

export function PaymentsTab() {
  const { data: me } = useGetMe();
  const businessId = (me as any)?.business?.id || "";
  const [method, setMethod] = useState<Method>("till");
  const [tillNumber, setTillNumber] = useState("");
  const [paybillNumber, setPaybillNumber] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountMode, setAccountMode] = useState<"static" | "dynamic_customer_phone">("static");
  const [status, setStatus] = useState<MpesaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [deni, setDeni] = useState<any[]>([]);

  async function loadStatus() {
    if (!businessId) return;
    setLoading(true);
    try {
      const response = await fetch("/api/businesses/" + businessId + "/mpesa/status");
      const data = await response.json();
      setStatus(data);
      if (data.method) setMethod(data.method);
      if (data.accountMode) setAccountMode(data.accountMode);
    } finally { setLoading(false); }
  }

  async function loadDeni() {
    if (!businessId) return;
    const response = await fetch("/api/businesses/" + businessId + "/deni");
    if (response.ok) setDeni(await response.json());
  }

  useEffect(() => { void loadStatus(); void loadDeni(); }, [businessId]);

  async function save() {
    setMessage("");
    if (method === "till" && !tillNumber.trim()) return setMessage("Enter the Till Number first.");
    if (method !== "till" && !paybillNumber.trim()) return setMessage("Enter the Paybill Number first.");
    if (method === "paybill_account" && accountMode === "static" && !accountNumber.trim()) return setMessage("Enter the Account Number or choose customer phone accounts.");
    setSaving(true);
    try {
      const response = await fetch("/api/businesses/" + businessId + "/mpesa/connect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ method, tillNumber: method === "till" ? tillNumber.trim() : null, paybillNumber: method === "till" ? null : paybillNumber.trim(), accountNumber: method === "paybill_account" && accountMode === "static" ? accountNumber.trim() : null, accountMode }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save M-Pesa settings");
      setMessage("Saved. An administrator must verify the M-Pesa details before real payments can run.");
      await loadStatus();
    } catch (error: any) { setMessage(error.message || "Could not save M-Pesa settings"); }
    finally { setSaving(false); }
  }

  const activeLabel = method === "till" ? "Till" : method === "paybill_account" ? "Paybill + Account" : "Paybill";
  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-50"><CreditCard className="h-5 w-5 text-green-600" /></div><div><h2 className="text-xl font-bold text-foreground">M-Pesa payments</h2><p className="text-sm text-muted-foreground mt-1">Choose where customers should pay. Your payment credentials stay on the server.</p></div></div>
      {status?.connected && <div className="rounded-xl border border-border bg-muted/30 p-4 flex items-center justify-between gap-4"><div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-600" /><div><p className="text-sm font-semibold">{activeLabel} {status.shortcodeMasked || "configured"}</p><p className="text-xs text-muted-foreground">{status.verified ? "Verified for payments" : "Saved — waiting for admin verification"}</p></div></div>{status.verified && <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">Live</span>}</div>}
      <div className="space-y-3"><p className="text-sm font-semibold">Payment method</p><div className="grid gap-2 sm:grid-cols-3">{([ ["till", "Till", "Buy Goods"], ["paybill", "Paybill", "No account"], ["paybill_account", "Paybill + Account", "Account reference"] ] as const).map(([value, label, sub]) => <button key={value} type="button" onClick={() => setMethod(value)} className={"rounded-xl border p-3 text-left transition " + (method === value ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-primary/50")}><p className="text-sm font-semibold">{label}</p><p className="text-xs text-muted-foreground mt-1">{sub}</p></button>)}</div></div>
      {method === "till" ? <div><label className="text-sm font-medium">Till Number</label><Input className="mt-1.5" value={tillNumber} onChange={(e) => setTillNumber(e.target.value)} placeholder="e.g. 123456" inputMode="numeric" /><p className="text-xs text-muted-foreground mt-1.5">Shown to customers only in masked form in the dashboard.</p></div> : <div><label className="text-sm font-medium">Paybill Number</label><Input className="mt-1.5" value={paybillNumber} onChange={(e) => setPaybillNumber(e.target.value)} placeholder="e.g. 123456" inputMode="numeric" /></div>}
      {method === "paybill_account" && <div className="space-y-3 rounded-xl border border-border p-4"><div><label className="text-sm font-medium">Account Number</label><Input className="mt-1.5" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="e.g. shop name or account reference" disabled={accountMode === "dynamic_customer_phone"} /></div><label className="flex items-start gap-3 cursor-pointer"><input type="checkbox" className="mt-1 h-4 w-4" checked={accountMode === "dynamic_customer_phone"} onChange={(e) => setAccountMode(e.target.checked ? "dynamic_customer_phone" : "static")} /><span><span className="text-sm font-medium">Use customer phone as Account Number</span><span className="block text-xs text-muted-foreground mt-0.5">Each customer’s 254 number becomes their Paybill account reference.</span></span></label></div>}
      <div className="flex items-start gap-2 rounded-xl bg-blue-50 p-3 text-xs text-blue-800"><ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" /><p>Saving sets this payment method to unverified. An administrator must confirm that the Till or Paybill belongs to your shop before a real STK push is allowed.</p></div>
      {message && <p className="text-sm rounded-lg bg-muted px-3 py-2">{message}</p>}
      <div className="space-y-3 rounded-xl border border-border p-4"><div><h3 className="text-base font-semibold">Deni Book</h3><p className="text-xs text-muted-foreground mt-1">Credit requests from WhatsApp customers appear here after you approve them by replying DENI.</p></div>{deni.length === 0 ? <p className="text-sm text-muted-foreground">No Deni records yet.</p> : <div className="space-y-2">{deni.slice().reverse().slice(0, 8).map((entry) => <div key={entry.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2"><div><p className="text-sm font-medium">{entry.customerName || entry.customerPhone}</p><p className="text-xs text-muted-foreground">{entry.product || "Sale"} · {entry.status}</p></div><p className="text-sm font-semibold">KSh {Number(entry.amount).toLocaleString("en-KE")}</p></div>)}</div>}</div>
      <button type="button" onClick={save} disabled={saving || loading || !businessId} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{saving && <Loader2 className="h-4 w-4 animate-spin" />}{saving ? "Saving…" : "Save M-Pesa settings"}</button>
    </div>
  );
}
