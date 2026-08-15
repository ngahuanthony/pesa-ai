import { useState, useEffect } from "react";
import { useGetMe } from "@workspace/api-client-react";
import { Wifi, CheckCircle2, Clock, AlertCircle, Phone } from "lucide-react";
import { Input } from "@/components/ui/input";

export function WhatsAppAccountTab() {
  const { data: me } = useGetMe();
  const businessId = me?.business?.id;

  const [status, setStatus]       = useState<any>(null);
  const [loading, setLoading]     = useState(true);
  const [phone, setPhone]         = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState("");
  const [success, setSuccess]     = useState(false);

  const load = async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/businesses/${businessId}/whatsapp/status`, { credentials: "include" });
      if (res.ok) setStatus(await res.json());
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [businessId]);

  const handleRequest = async () => {
    if (!phone.trim()) { setError("Please enter your WhatsApp Business phone number."); return; }
    setSubmitting(true); setError("");
    try {
      const res = await fetch(`/api/businesses/${businessId}/whatsapp/request`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      if (res.ok) { setSuccess(true); await load(); }
      else { const e = await res.json(); setError(e.error || "Failed to submit request."); }
    } finally { setSubmitting(false); }
  };

  if (loading) {
    return <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>;
  }

  // ── Connected ──────────────────────────────────────────────────────────────
  if (status?.connected) {
    return (
      <div className="flex flex-col items-center pt-8 pb-4 text-center space-y-6 max-w-md mx-auto">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <Wifi className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">WhatsApp Connected</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Your WhatsApp Business number is live and accepting customer messages.
          </p>
        </div>
        <div className="w-full rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-left space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span className="text-sm font-semibold text-emerald-700">Active &amp; Live</span>
          </div>
          {status.displayName && (
            <div className="text-sm text-emerald-700">
              <span className="font-medium">Display name: </span>{status.displayName}
            </div>
          )}
          {status.requestedPhone && (
            <div className="text-sm text-emerald-700">
              <span className="font-medium">Phone: </span>{status.requestedPhone}
            </div>
          )}
        </div>

        {/* Verify token — safe to show to vendor */}
        {status.verifyToken && (
          <div className="w-full rounded-xl border border-border bg-gray-50 p-4 text-left space-y-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Webhook Verify Token</p>
            <p className="text-xs font-mono text-gray-700 break-all">{status.verifyToken}</p>
            <p className="text-[11px] text-gray-400">Only the Pesa AI team needs this. Your account is already configured.</p>
          </div>
        )}
      </div>
    );
  }

  // ── Setup in progress ──────────────────────────────────────────────────────
  if (status?.requestedPhone) {
    return (
      <div className="flex flex-col items-center pt-8 pb-4 text-center space-y-6 max-w-md mx-auto">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <Wifi className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">WhatsApp Connection</h2>
          <p className="text-sm text-muted-foreground mt-1">Your request is being processed by our team.</p>
        </div>

        <div className="w-full rounded-xl border border-amber-200 bg-amber-50 p-5 text-left space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-600" />
            <span className="text-sm font-semibold text-amber-700">Setup in progress</span>
          </div>
          <p className="text-sm text-amber-800 leading-relaxed">
            We received your request for <strong>{status.requestedPhone}</strong>. Our team is
            connecting your WhatsApp Business number — this usually takes a few hours. We'll notify
            you once it's live.
          </p>
          <div className="flex items-start gap-2 mt-1">
            <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">
              Make sure your number is registered as a{" "}
              <strong className="font-semibold">WhatsApp Business</strong> account (not personal WhatsApp).
            </p>
          </div>
        </div>

        <button
          onClick={() => { setStatus((s: any) => ({ ...s, requestedPhone: null })); }}
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
        >
          Change phone number
        </button>
      </div>
    );
  }

  // ── Request form ───────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col items-center pt-8 pb-4 text-center space-y-6 max-w-md mx-auto">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <Wifi className="h-8 w-8 text-primary" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-foreground">Connect WhatsApp</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Enter your WhatsApp Business phone number. Our team will connect it to your shop — usually
          within a few hours.
        </p>
      </div>

      <div className="w-full space-y-4 text-left">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
            <Phone className="h-4 w-4 text-primary" />
            Your WhatsApp Business Number
          </label>
          <Input
            type="tel"
            value={phone}
            onChange={(e) => { setPhone(e.target.value); setError(""); }}
            placeholder="e.g. 0722 542 810"
            className="h-11"
          />
          <p className="text-xs text-muted-foreground">
            This must be a number registered as a <strong>WhatsApp Business</strong> account —
            not a personal WhatsApp number.
          </p>
        </div>

        {error && (
          <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
        )}

        <button
          onClick={handleRequest}
          disabled={submitting || !phone.trim()}
          className="w-full h-11 rounded-xl bg-primary text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {submitting ? "Submitting…" : "Request WhatsApp Connection"}
        </button>
      </div>

      <div className="w-full rounded-xl border border-border bg-gray-50 p-4 text-left space-y-1.5">
        <p className="text-xs font-semibold text-gray-600">What happens next?</p>
        <ul className="text-xs text-gray-500 space-y-1 list-disc list-inside">
          <li>Our team connects your number to Pesa AI via Meta Business Manager</li>
          <li>Customers can then WhatsApp your number to browse and buy from your shop</li>
          <li>You'll see orders arrive in real time in your Orders tab</li>
        </ul>
      </div>
    </div>
  );
}
