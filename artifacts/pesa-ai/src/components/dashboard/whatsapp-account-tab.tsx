import { useState, useEffect } from "react";
import { useGetMe } from "@workspace/api-client-react";
import { Wifi, CheckCircle2, Clock, AlertCircle, Phone, RefreshCw, Copy, Check, Pencil, X } from "lucide-react";
import { Input } from "@/components/ui/input";

export function WhatsAppAccountTab() {
  const { data: me } = useGetMe();
  const businessId = me?.business?.id;

  const [status, setStatus]           = useState<any>(null);
  const [loading, setLoading]         = useState(true);
  const [phone, setPhone]             = useState("");
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied]           = useState(false);
  const [editing, setEditing]         = useState(false);
  const [draft, setDraft]             = useState("");
  const [saving, setSaving]           = useState(false);

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
      if (res.ok) { await load(); }
      else { const e = await res.json(); setError(e.error || "Failed to submit request."); }
    } finally { setSubmitting(false); }
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const res = await fetch(`/api/businesses/${businessId}/welcome-message/regenerate`, {
        method: "POST", credentials: "include",
      });
      if (res.ok) {
        const { welcomeMessage } = await res.json();
        setStatus((s: any) => ({ ...s, welcomeMessage }));
        setDraft(welcomeMessage);
      }
    } finally { setRegenerating(false); }
  };

  const handleEdit = () => {
    setDraft(status?.welcomeMessage || "");
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/businesses/${businessId}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ welcomeMessage: draft }),
      });
      if (res.ok) {
        setStatus((s: any) => ({ ...s, welcomeMessage: draft }));
        setEditing(false);
      }
    } finally { setSaving(false); }
  };

  const handleCopy = () => {
    if (status?.welcomeMessage) {
      navigator.clipboard.writeText(status.welcomeMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>;
  }

  // ── Connected ──────────────────────────────────────────────────────────────
  if (status?.connected) {
    return (
      <div className="flex flex-col pt-6 pb-4 space-y-5 max-w-lg mx-auto">

        {/* Status card */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Wifi className="h-7 w-7 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">WhatsApp Connected</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Your shop is live and accepting customer messages.
            </p>
          </div>
        </div>

        {/* Active status */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
          <span className="text-sm font-semibold text-emerald-700">Active &amp; Live — accepting customer messages</span>
        </div>

        {/* How customers see you */}
        <div className="rounded-xl border border-border bg-white overflow-hidden">
          <div className="px-4 py-2.5 bg-gray-50 border-b border-border">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">How customers see you on WhatsApp</p>
          </div>
          {/* WhatsApp contact card preview */}
          <div className="p-4 flex items-center gap-4">
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary select-none">
              {(status.displayName || "?").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-base font-bold text-foreground leading-tight truncate">
                {status.displayName || "Your Business Name"}
              </p>
              {status.requestedPhone && (
                <a
                  href={`tel:${status.requestedPhone.replace(/\s/g, "")}`}
                  className="text-sm text-primary hover:underline mt-0.5 flex items-center gap-1"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {status.requestedPhone}
                </a>
              )}
              <p className="text-xs text-muted-foreground mt-0.5">WhatsApp Business</p>
            </div>
          </div>
          <div className="px-4 pb-3">
            <p className="text-xs text-muted-foreground">
              This is what customers see when they message or save your contact. The name is set by your WhatsApp Business registration — contact the Pesa AI team to update it.
            </p>
          </div>
        </div>

        {/* ── Welcome Message ── */}
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-foreground">🎉 Customer Welcome Message</p>
            <p className="text-xs text-muted-foreground">Sent automatically to every new customer who messages you.</p>
          </div>

          {editing ? (
            /* ── Edit mode ── */
            <div className="space-y-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={10}
                className="w-full rounded-xl border border-primary/40 bg-white px-3.5 py-3 text-sm text-gray-800 leading-relaxed font-[system-ui] resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <div className="flex items-center justify-between">
                <span className={`text-xs ${draft.length > 1000 ? "text-destructive" : "text-muted-foreground"}`}>
                  {draft.length} characters
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditing(false)}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-xs font-medium text-foreground hover:bg-gray-50 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" /> Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving || !draft.trim()}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    <Check className="h-3.5 w-3.5" />
                    {saving ? "Saving…" : "Save Message"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* ── Preview mode ── */
            <>
              {status.welcomeMessage ? (
                <div className="rounded-2xl border border-border bg-[#e9fbe9] p-4">
                  <div className="rounded-xl bg-white shadow-sm p-3.5 text-sm text-gray-800 leading-relaxed whitespace-pre-wrap font-[system-ui]">
                    {status.welcomeMessage}
                  </div>
                  <p className="text-[10px] text-gray-400 text-right mt-1.5 pr-1">WhatsApp preview</p>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-gray-50 p-4 text-center text-sm text-muted-foreground">
                  No welcome message yet. Click Regenerate to create one, or write your own.
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={handleEdit}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-xs font-medium text-foreground hover:bg-gray-50 transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
                <button
                  onClick={handleRegenerate}
                  disabled={regenerating}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-xs font-medium text-foreground hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${regenerating ? "animate-spin" : ""}`} />
                  {regenerating ? "Regenerating…" : "Regenerate"}
                </button>
                {status.welcomeMessage && (
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-xs font-medium text-foreground hover:bg-gray-50 transition-colors"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "Copied!" : "Copy"}
                  </button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                💡 Update your location and delivery areas in <strong>Settings</strong> to personalise the auto-generated message.
              </p>
            </>
          )}
        </div>

        {/* Verify token */}
        {status.verifyToken && (
          <div className="rounded-xl border border-border bg-gray-50 p-4 space-y-1">
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
            connecting your WhatsApp Business number — this usually takes a few minutes. We'll notify
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
          within a few minutes.
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
          <li>Your personalised welcome message is auto-generated from your shop details</li>
          <li>Customers can then WhatsApp your number to browse and buy from your shop</li>
          <li>You'll see orders arrive in real time in your Orders tab</li>
        </ul>
      </div>
    </div>
  );
}
