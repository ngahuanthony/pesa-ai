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
  const [destination, setDestination] = useState<"mpesa" | "bank">("mpesa");
  const [bankName, setBankName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
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

  useEffect(() => {
    if (me?.business) {
      const business = me.business as any;
      setDestination(business.paymentMethod === "bank" ? "bank" : "mpesa");
      setBankName(business.bankName || "");
      setBankAccountNumber(business.bankAccountNumber || "");
      if (business.mpesaType) setMethod(business.mpesaType === "till" ? "till" : business.paybillAccountNumber ? "paybill_account" : "paybill");
      if (business.mpesaType === "till") setTillNumber(business.paybillNumber || "");
      else setPaybillNumber(business.paybillNumber || "");
      setAccountNumber(business.paybillAccountNumber || "");
    }
    void loadStatus(); void loadDeni();
  }, [businessId, me]);

  async function save() {
    setMessage("");
    if (destination === "bank") {
      if (!bankName.trim() || !bankAccountNumber.trim()) return setMessage("Enter your bank name and account number.");
      setSaving(true);
      try {
        const response = await fetch("/api/businesses/" + businessId, { method: "PUT", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ paymentMethod: "bank", bankName: bankName.trim(), bankAccountNumber: bankAccountNumber.trim() }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not save bank details");
        setMessage("Bank details saved. Bank transfers are not automatically verified by M-Pesa STK.");
      } catch (error: any) { setMessage(error.message || "Could not save bank details"); }
      finally { setSaving(false); }
      return;
    }
    if (method === "till" && !tillNumber.trim()) return setMessage("Enter the Till Number first.");
    if (method !== "till" && !paybillNumber.trim()) return setMessage("Enter the Paybill Number first.");
    if (method === "paybill_account" && accountMode === "static" && !accountNumber.trim()) return setMessage("Enter the Account Number or choose customer phone accounts.");
    setSaving(true);
    try {
      const response = await fetch("/api/businesses/" + businessId + "/mpesa/connect", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ method, tillNumber: method === "till" ? tillNumber.trim() : null, paybillNumber: method === "till" ? null : paybillNumber.trim(), accountNumber: method === "paybill_account" && accountMode === "static" ? accountNumber.trim() : null, accountMode }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save M-Pesa settings");
      const update = await fetch("/api/businesses/" + businessId, { method: "PUT", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ paymentMethod: "mpesa", mpesaType: method === "till" ? "till" : "paybill", paybillNumber: method === "till" ? tillNumber.trim() : paybillNumber.trim(), paybillAccountNumber: method === "paybill_account" ? accountNumber.trim() : null }) });
      if (!update.ok) throw new Error("Receiving details saved, but the payment method could not be updated");
      setMessage("Receiving details saved. Pesa SI will verify your account before STK payments are enabled.");
      await loadStatus();
    } catch (error: any) { setMessage(error.message || "Could not save M-Pesa settings"); }
    finally { setSaving(false); }
  }

  const activeLabel = method === "till" ? "Till" : method === "paybill_account" ? "Paybill + Account" : "Paybill";
  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-50"><CreditCard className="h-5 w-5 text-green-600" /></div><div><h2 className="text-xl font-bold text-foreground">Connect with M-Pesa / Bank</h2><p className="text-sm text-muted-foreground mt-1">Enter your payment details. Customer payments go directly to your own account; Pesa SI does not collect or hold them.</p></div></div>
      <div className="grid grid-cols-2 gap-2">{(["mpesa", "bank"] as const).map((value) => <button key={value} type="button" onClick={() => setDestination(value)} className={"rounded-xl border p-3 text-left text-sm font-semibold " + (destination === value ? "border-primary bg-primary/5" : "border-border")}>{value === "mpesa" ? "M-Pesa" : "Bank"}</button>)}</div>
      {destination === "mpesa" && <>
      {status?.connected && <div className="rounded-xl border border-border bg-muted/30 p-4 flex items-center justify-between gap-4"><div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-600" /><div><p className="text-sm font-semibold">{activeLabel} {status.shortcodeMasked || "configured"}</p><p className="text-xs text-muted-foreground">{status.verified ? "STK enabled — confirm with a test payment" : "Saved — waiting for Pesa SI verification"}</p></div></div>{status.verified && <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">Enabled</span>}</div>}
      <div className="space-y-3"><p className="text-sm font-semibold">Payment method</p><div className="grid gap-2 sm:grid-cols-3">{([ ["till", "Till", "Buy Goods"], ["paybill", "Paybill", "No account"], ["paybill_account", "Paybill + Account", "Account reference"] ] as const).map(([value, label, sub]) => <button key={value} type="button" onClick={() => setMethod(value)} className={"rounded-xl border p-3 text-left transition " + (method === value ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-primary/50")}><p className="text-sm font-semibold">{label}</p><p className="text-xs text-muted-foreground mt-1">{sub}</p></button>)}</div></div>
      {method === "till" ? <div><label className="text-sm font-medium">Till Number</label><Input className="mt-1.5" value={tillNumber} onChange={(e) => setTillNumber(e.target.value)} placeholder="e.g. 123456" inputMode="numeric" /><p className="text-xs text-muted-foreground mt-1.5">Shown to customers only in masked form in the dashboard.</p></div> : <div><label className="text-sm font-medium">Paybill Number</label><Input className="mt-1.5" value={paybillNumber} onChange={(e) => setPaybillNumber(e.target.value)} placeholder="e.g. 123456" inputMode="numeric" /></div>}
      {method === "paybill_account" && <div className="space-y-3 rounded-xl border border-border p-4"><div><label className="text-sm font-medium">Account Number</label><Input className="mt-1.5" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="e.g. shop name or account reference" disabled={accountMode === "dynamic_customer_phone"} /></div><label className="flex items-start gap-3 cursor-pointer"><input type="checkbox" className="mt-1 h-4 w-4" checked={accountMode === "dynamic_customer_phone"} onChange={(e) => setAccountMode(e.target.checked ? "dynamic_customer_phone" : "static")} /><span><span className="text-sm font-medium">Use customer phone as Account Number</span><span className="block text-xs text-muted-foreground mt-0.5">Each customer’s 254 number becomes their Paybill account reference.</span></span></label></div>}
      <div className="flex items-start gap-2 rounded-xl bg-blue-50 p-3 text-xs text-blue-800"><ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" /><p>Pesa SI handles the connection. Your Till or Paybill must be authorized by Safaricom and verified by our team before STK payments can run.</p></div>
      </>}
      {destination === "bank" && <div className="space-y-3 rounded-xl border border-border p-4"><div><label className="text-sm font-medium">Bank name</label><Input className="mt-1.5" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Your bank" /></div><div><label className="text-sm font-medium">Account number</label><Input className="mt-1.5" value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)} placeholder="Your receiving account number" /></div><p className="text-xs text-muted-foreground">Bank details are for direct transfer. Automatic bank payment confirmation is not connected.</p></div>}
      {message && <p className="text-sm rounded-lg bg-muted px-3 py-2">{message}</p>}
      <div className="space-y-3 rounded-xl border border-border p-4"><div><h3 className="text-base font-semibold">Deni Book</h3><p className="text-xs text-muted-foreground mt-1">Credit requests from WhatsApp customers appear here after you approve them by replying DENI.</p></div>{deni.length === 0 ? <p className="text-sm text-muted-foreground">No Deni records yet.</p> : <div className="space-y-2">{deni.slice().reverse().slice(0, 8).map((entry) => <div key={entry.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2"><div><p className="text-sm font-medium">{entry.customerName || entry.customerPhone}</p><p className="text-xs text-muted-foreground">{entry.product || "Sale"} · {entry.status}</p></div><p className="text-sm font-semibold">KSh {Number(entry.amount).toLocaleString("en-KE")}</p></div>)}</div>}</div>
      <button type="button" onClick={save} disabled={saving || loading || !businessId} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{saving && <Loader2 className="h-4 w-4 animate-spin" />}{saving ? "Saving…" : "Save payment details"}</button>
    </div>
  );
}
