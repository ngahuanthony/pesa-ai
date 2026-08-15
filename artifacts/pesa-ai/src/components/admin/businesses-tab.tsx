import {
  useAdminListBusinesses,
  getAdminListBusinessesQueryKey,
  useAdminChargeSubscription,
  useAdminSuspendBusiness,
  useAdminUnsuspendBusiness,
  useAdminResetPassword,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Search, Ban, PlayCircle, CreditCard, Smartphone, MessageSquare,
  CheckCircle2, AlertCircle, KeyRound, Trash2, Eye, EyeOff, LockKeyhole,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface Props {
  onConfigureWhatsApp?: () => void;
}

// ── WhatsApp admin dialog ──────────────────────────────────────────────────
function WhatsAppDialog({ business, onClose }: { business: any; onClose: () => void }) {
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId,        setWabaId]        = useState("");
  const [accessToken,   setAccessToken]   = useState("");
  const [displayName,   setDisplayName]   = useState(business.name || "");
  const [waPhone,       setWaPhone]       = useState("");
  const [showToken,     setShowToken]     = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [status,        setStatus]        = useState<any>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const load = async () => {
    setLoadingStatus(true);
    try {
      const res = await fetch(`/api/admin/businesses/${business.id}/whatsapp`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        if (data.requestedPhone) setWaPhone(data.requestedPhone);
        if (data.wabaId)         setWabaId(data.wabaId);
        if (data.displayName)    setDisplayName(data.displayName);
      }
    } finally { setLoadingStatus(false); }
  };

  useEffect(() => { load(); }, []);

  const activate = async () => {
    if (!phoneNumberId || !wabaId || !accessToken) {
      toast({ title: "Required fields missing", description: "Phone Number ID, WABA ID and Access Token are all required.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/businesses/${business.id}/whatsapp`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumberId, wabaId, accessToken, displayName, waPhone }),
      });
      if (res.ok) {
        toast({ title: "WhatsApp activated!", description: `${business.name} is now connected to WhatsApp.` });
        qc.invalidateQueries({ queryKey: getAdminListBusinessesQueryKey() });
        onClose();
      } else {
        const err = await res.json();
        toast({ title: "Activation failed", description: err.error || "Unknown error", variant: "destructive" });
      }
    } finally { setSaving(false); }
  };

  const disconnect = async () => {
    if (!confirm(`Disconnect WhatsApp for ${business.name}? Incoming messages will stop being processed.`)) return;
    await fetch(`/api/admin/businesses/${business.id}/whatsapp`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneNumberId: null, accessToken: null }),
    });
    toast({ title: "WhatsApp disconnected" });
    qc.invalidateQueries({ queryKey: getAdminListBusinessesQueryKey() });
    onClose();
  };

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Connect WhatsApp</DialogTitle>
        <p className="text-sm text-muted-foreground">{business.name}</p>
      </DialogHeader>

      <div className="space-y-4 mt-1">
        {/* Status badge */}
        {loadingStatus ? (
          <p className="text-sm text-gray-400">Loading status…</p>
        ) : status?.connected ? (
          <div className="flex items-center justify-between rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <p className="text-sm font-semibold text-emerald-700">Connected &amp; Live</p>
            </div>
            <button onClick={disconnect} className="inline-flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700 font-medium">
              <Trash2 className="h-3.5 w-3.5" /> Disconnect
            </button>
          </div>
        ) : status?.requestedPhone ? (
          <div className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            <p className="text-sm text-amber-700 font-medium">Vendor requested: <strong>{status.requestedPhone}</strong></p>
          </div>
        ) : null}

        {/* Instruction note */}
        <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2.5 text-xs text-gray-500 leading-relaxed">
          Get these details from <strong className="text-gray-700">Meta Business Manager → WhatsApp → Phone Numbers</strong>.
          The access token must be a permanent System User token.
        </div>

        {/* Form */}
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Phone Number</label>
            <Input value={waPhone} onChange={(e) => setWaPhone(e.target.value)} placeholder="e.g. 0722542810" className="bg-gray-50 h-10" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Phone Number ID</label>
            <Input value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} placeholder="e.g. 1234567890" className="bg-gray-50 h-10" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">WABA ID</label>
            <Input value={wabaId} onChange={(e) => setWabaId(e.target.value)} placeholder="e.g. 0987654321" className="bg-gray-50 h-10" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Permanent Access Token</label>
            <div className="relative">
              <Input
                type={showToken ? "text" : "password"}
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder="EAAxxxxxxxxx..."
                className="bg-gray-50 h-10 pr-10"
              />
              <button type="button" onClick={() => setShowToken(!showToken)} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600">
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Display Name <span className="font-normal text-gray-400">(optional)</span></label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Digital Nation Accessories" className="bg-gray-50 h-10" />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 h-10 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={activate}
            disabled={saving || !phoneNumberId || !wabaId || !accessToken}
            className="flex-1 h-10 rounded-xl bg-primary text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
          >
            <CheckCircle2 className="h-4 w-4" />
            {saving ? "Activating…" : "Activate"}
          </button>
        </div>
      </div>
    </DialogContent>
  );
}

// ── Reset Password dialog ──────────────────────────────────────────────────
function ResetPasswordDialog({ business, onClose }: { business: any; onClose: () => void }) {
  const [newPassword, setNewPassword] = useState("");
  const [show, setShow]               = useState(false);
  const { toast } = useToast();
  const reset = useAdminResetPassword();

  const handleReset = async () => {
    if (newPassword.length < 8) {
      toast({ title: "Too short", description: "Password must be at least 8 characters.", variant: "destructive" });
      return;
    }
    reset.mutate({ businessId: business.id, data: { newPassword } }, {
      onSuccess: () => {
        toast({ title: "Password reset!", description: `${business.name} can now log in with the new password.` });
        onClose();
      },
      onError: (err: any) => {
        toast({ title: "Reset failed", description: err?.message || "Unknown error", variant: "destructive" });
      },
    });
  };

  return (
    <DialogContent className="max-w-sm">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <LockKeyhole className="h-4 w-4 text-primary" /> Reset Password
        </DialogTitle>
        <p className="text-sm text-muted-foreground">{business.name} · {(business as any).email}</p>
      </DialogHeader>

      <div className="space-y-4 mt-1">
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-700 leading-relaxed">
          This immediately replaces the owner's password. Share the new password with them securely.
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700">New Password</label>
          <div className="relative">
            <Input
              type={show ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min. 8 characters"
              className="pr-10"
              onKeyDown={(e) => e.key === "Enter" && handleReset()}
            />
            <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600">
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 h-10 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleReset}
            disabled={reset.isPending || newPassword.length < 8}
            className="flex-1 h-10 rounded-xl bg-primary text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
          >
            <LockKeyhole className="h-4 w-4" />
            {reset.isPending ? "Resetting…" : "Reset Password"}
          </button>
        </div>
      </div>
    </DialogContent>
  );
}

// ── M-Pesa admin dialog ────────────────────────────────────────────────────
function MpesaDialog({ business, onClose }: { business: any; onClose: () => void }) {
  const [consumerKey,    setConsumerKey]    = useState("");
  const [consumerSecret, setConsumerSecret] = useState("");
  const [passkey,        setPasskey]        = useState("");
  const [shortcode,      setShortcode]      = useState("");
  const [showSecret,     setShowSecret]     = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [mpesaStatus,    setMpesaStatus]    = useState<any>(null);
  const [loadingStatus,  setLoadingStatus]  = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const load = async () => {
    setLoadingStatus(true);
    try {
      const res = await fetch(`/api/admin/businesses/${business.id}/mpesa`, { credentials: "include" });
      if (res.ok) setMpesaStatus(await res.json());
    } finally { setLoadingStatus(false); }
  };

  // Load on first render
  useState(() => { load(); });

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/businesses/${business.id}/mpesa`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consumerKey, consumerSecret, passkey, shortcode }),
      });
      if (res.ok) {
        toast({ title: "M-Pesa credentials saved!" });
        setConsumerKey(""); setConsumerSecret(""); setPasskey(""); setShortcode("");
        load();
        qc.invalidateQueries({ queryKey: getAdminListBusinessesQueryKey() });
      } else {
        const err = await res.json();
        toast({ title: "Save failed", description: err.error || "Unknown error", variant: "destructive" });
      }
    } finally { setSaving(false); }
  };

  const disconnect = async () => {
    if (!confirm("Disconnect M-Pesa for this business? STK Push payments will stop working.")) return;
    const res = await fetch(`/api/admin/businesses/${business.id}/mpesa`, { method: "DELETE", credentials: "include" });
    if (res.ok) { toast({ title: "M-Pesa disconnected" }); load(); qc.invalidateQueries({ queryKey: getAdminListBusinessesQueryKey() }); }
  };

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>M-Pesa Setup — {business.name}</DialogTitle>
      </DialogHeader>

      <div className="space-y-5 mt-2">
        {/* Status */}
        {loadingStatus ? (
          <p className="text-sm text-gray-400">Checking status…</p>
        ) : mpesaStatus?.connected ? (
          <div className="flex items-center justify-between rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <div>
                <p className="text-sm font-semibold text-emerald-700">Connected</p>
                <p className="text-xs text-emerald-600">Shortcode: {mpesaStatus.shortcodeMasked}</p>
              </div>
            </div>
            <button onClick={disconnect} className="inline-flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700 font-medium">
              <Trash2 className="h-3.5 w-3.5" /> Disconnect
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            <p className="text-sm text-amber-700 font-medium">Not connected — enter Daraja credentials below</p>
          </div>
        )}

        {/* Info */}
        <p className="text-xs text-gray-500 leading-relaxed">
          Get these from <strong>developer.safaricom.co.ke</strong> under the business's Daraja app.
          All values are encrypted and never echoed back.
        </p>

        {/* Form */}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Shortcode (Paybill/Till)</label>
            <Input value={shortcode} onChange={(e) => setShortcode(e.target.value)} placeholder="e.g. 174379" className="bg-gray-50" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Consumer Key</label>
            <Input value={consumerKey} onChange={(e) => setConsumerKey(e.target.value)} placeholder="Daraja consumer key" className="bg-gray-50" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Consumer Secret</label>
            <div className="relative">
              <Input
                type={showSecret ? "text" : "password"}
                value={consumerSecret}
                onChange={(e) => setConsumerSecret(e.target.value)}
                placeholder="Daraja consumer secret"
                className="bg-gray-50 pr-10"
              />
              <button type="button" onClick={() => setShowSecret(!showSecret)} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600">
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Lipa na M-Pesa Passkey</label>
            <Input
              type="password"
              value={passkey}
              onChange={(e) => setPasskey(e.target.value)}
              placeholder="STK Push passkey"
              className="bg-gray-50"
            />
          </div>
        </div>

        <button
          onClick={save}
          disabled={saving || !consumerKey || !consumerSecret || !passkey || !shortcode}
          className="w-full h-10 rounded-xl bg-primary text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          <KeyRound className="h-4 w-4" />
          {saving ? "Saving…" : "Save M-Pesa Credentials"}
        </button>
      </div>
    </DialogContent>
  );
}

// ── Main tab ───────────────────────────────────────────────────────────────
export function AdminBusinessesTab({ onConfigureWhatsApp }: Props) {
  const { data: businesses, isLoading } = useAdminListBusinesses();
  const [search, setSearch]             = useState("");
  const [mpesaBusiness,    setMpesaBusiness]    = useState<any>(null);
  const [waBusiness,       setWaBusiness]       = useState<any>(null);
  const [resetBusiness,    setResetBusiness]    = useState<any>(null);

  const charge    = useAdminChargeSubscription();
  const suspend   = useAdminSuspendBusiness();
  const unsuspend = useAdminUnsuspendBusiness();
  const queryClient = useQueryClient();
  const { toast }   = useToast();

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

  const filtered = (businesses || []).filter((b) =>
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

  if (isLoading) return <div className="py-16 text-center text-gray-400 text-sm">Loading businesses…</div>;

  return (
    <>
      {/* WhatsApp Dialog */}
      <Dialog open={!!waBusiness} onOpenChange={(open) => !open && setWaBusiness(null)}>
        {waBusiness && <WhatsAppDialog business={waBusiness} onClose={() => setWaBusiness(null)} />}
      </Dialog>

      {/* M-Pesa Dialog */}
      <Dialog open={!!mpesaBusiness} onOpenChange={(open) => !open && setMpesaBusiness(null)}>
        {mpesaBusiness && <MpesaDialog business={mpesaBusiness} onClose={() => setMpesaBusiness(null)} />}
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={!!resetBusiness} onOpenChange={(open) => !open && setResetBusiness(null)}>
        {resetBusiness && <ResetPasswordDialog business={resetBusiness} onClose={() => setResetBusiness(null)} />}
      </Dialog>

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
          <div className="grid grid-cols-[2fr_1.4fr_1fr_0.7fr_1.8fr] border-b border-gray-200 bg-gray-50 px-4 py-2.5">
            {["BUSINESS", "PLAN & STATUS", "CONNECTIONS", "REPORTS", "ACTIONS"].map((h) => (
              <span key={h} className="text-[11px] font-semibold tracking-wide text-gray-500 uppercase">{h}</span>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="px-4 py-16 text-center text-gray-400 text-sm">No businesses found.</div>
          ) : (
            filtered.map((b, i) => {
              const isSuspended   = b.subscription.status === "suspended";
              const reportCount   = (b as any).openReportCount ?? 0;
              const productCount  = (b as any).productCount ?? 0;
              const orderCount    = (b as any).orderCount ?? 0;
              const waConnected   = !!(b as any).whatsappPhoneNumberId;
              const waPending     = !!(b as any).whatsappRequestedPhone && !waConnected;
              const joinedDate   = b.createdAt
                ? new Date(b.createdAt).toLocaleDateString("en-GB", { month: "short", year: "numeric" })
                : "";

              return (
                <div
                  key={b.id}
                  className={`grid grid-cols-[2fr_1.4fr_1fr_0.7fr_1.8fr] items-center px-4 py-4 ${
                    i < filtered.length - 1 ? "border-b border-gray-100" : ""
                  } hover:bg-gray-50/60 transition-colors`}
                >
                  {/* Business */}
                  <div>
                    <div className="font-semibold text-gray-900 text-sm">{b.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {(b as any).email || b.phone}{joinedDate ? ` • Joined ${joinedDate}` : ""}
                    </div>
                    <div className="text-[11px] text-gray-400 mt-0.5">{productCount} products · {orderCount} orders</div>
                  </div>

                  {/* Plan & Status */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {planBadge(b.subscription.plan)}
                    {statusBadge(b.subscription.status)}
                  </div>

                  {/* Connections */}
                  <div className="space-y-1.5">
                    <div className={`flex items-center gap-1.5 text-xs font-medium ${waConnected ? "text-emerald-600" : waPending ? "text-amber-600" : "text-gray-400"}`}>
                      <MessageSquare className="h-3.5 w-3.5" />
                      {waConnected ? "WhatsApp ✓" : waPending ? "WhatsApp ⏳ pending" : "WhatsApp —"}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-medium text-gray-400">
                      <Smartphone className="h-3.5 w-3.5" />
                      M-Pesa —
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
                  <div className="flex items-center gap-1 flex-wrap">
                    <button
                      onClick={() => setWaBusiness(b)}
                      title={waPending ? "Pending WhatsApp request — click to approve" : "Set up WhatsApp"}
                      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                        waConnected
                          ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                          : waPending
                          ? "border-amber-400 bg-amber-50 text-amber-700 hover:bg-amber-100 ring-1 ring-amber-300"
                          : "border-gray-200 text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      {waPending ? "Approve WA" : "WhatsApp"}
                    </button>

                    <button
                      onClick={() => setMpesaBusiness(b)}
                      title="Set up M-Pesa"
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                      <KeyRound className="h-3.5 w-3.5" /> M-Pesa
                    </button>

                    <button
                      onClick={() => setResetBusiness(b)}
                      title="Reset owner password"
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                      <LockKeyhole className="h-3.5 w-3.5" /> Reset PW
                    </button>

                    <button
                      onClick={() => handleCharge(b.id)}
                      disabled={charge.isPending}
                      title="Send subscription charge"
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
                    >
                      <CreditCard className="h-3.5 w-3.5" /> Charge
                    </button>

                    {isSuspended ? (
                      <button
                        onClick={() => handleUnsuspend(b.id)}
                        disabled={unsuspend.isPending}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-2 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-50"
                      >
                        <PlayCircle className="h-3.5 w-3.5" /> Restore
                      </button>
                    ) : (
                      <button
                        onClick={() => handleSuspend(b.id)}
                        disabled={suspend.isPending}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-50"
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
    </>
  );
}
