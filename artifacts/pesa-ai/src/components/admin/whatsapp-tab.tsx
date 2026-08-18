import { useState } from "react";
import { useAdminListBusinesses, getAdminListBusinessesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Copy, RefreshCw, CheckCircle2, AlertCircle, ExternalLink, Wifi } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const WEBHOOK_URL = "https://pesaai.africa/webhook/whatsapp";

export function AdminWhatsAppTab() {
  const { data: businesses, isLoading } = useAdminListBusinesses();
  const [selectedId, setSelectedId] = useState<string>("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [accessToken, setAccessToken]     = useState("");
  const [verifyToken, setVerifyToken]     = useState("");
  const [waPhone, setWaPhone]             = useState("");
  const [saving, setSaving]               = useState(false);
  const [status, setStatus]               = useState<"connected" | "not_connected" | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const loadBusiness = async (id: string) => {
    setSelectedId(id);
    setPhoneNumberId("");
    setAccessToken("");
    setWaPhone("");
    setStatus(null);
    try {
      const res = await fetch(`/api/admin/businesses/${id}/whatsapp`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setPhoneNumberId(data.phoneNumberId || "");
        setVerifyToken(data.verifyToken || "");
        setWaPhone(data.requestedPhone || "");
        setStatus(data.connected ? "connected" : "not_connected");
      }
    } catch { /* ignore */ }
  };

  const handleSave = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/businesses/${selectedId}/whatsapp`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumberId, accessToken: accessToken || undefined, verifyToken, waPhone: waPhone || undefined }),
      });
      if (res.ok) {
        const data = await res.json();
        setStatus(data.connected ? "connected" : "not_connected");
        setAccessToken(""); // clear — never echo tokens back
        toast({ title: "WhatsApp settings saved!" });
        qc.invalidateQueries({ queryKey: getAdminListBusinessesQueryKey() });
      } else {
        const err = await res.json();
        toast({ title: "Save failed", description: err.error || "Unknown error", variant: "destructive" });
      }
    } finally {
      setSaving(false);
    }
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied!" });
  };

  const regenerateToken = () => {
    const words = ["savanna", "baobab", "safari", "jambo", "pesa", "simba", "karibu", "rafiki"];
    setVerifyToken(words[Math.floor(Math.random() * words.length)] + Math.floor(Math.random() * 9000 + 1000));
  };

  const selectedBusiness = businesses?.find((b: any) => b.id === selectedId);

  if (isLoading) return <p className="text-zinc-400 text-sm">Loading businesses…</p>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-bold text-zinc-100">WhatsApp API Configuration</h2>
        <p className="text-sm text-zinc-400 mt-0.5">Configure Meta Cloud API credentials for each business. Businesses see a simple connect screen — all technical setup lives here.</p>
      </div>

      {/* Business selector */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-zinc-300">Select Business</label>
        <Select value={selectedId} onValueChange={loadBusiness}>
          <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100">
            <SelectValue placeholder="Choose a business…" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-800 border-zinc-700">
            {(businesses || []).map((b: any) => (
              <SelectItem key={b.id} value={b.id} className="text-zinc-100">
                {b.name} <span className="text-zinc-400 ml-2 text-xs">{b.phone}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedId && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-800/60 overflow-hidden">

          {/* Status banner */}
          {status && (
            <div className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b border-zinc-700 ${status === "connected" ? "text-emerald-400" : "text-amber-400"}`}>
              {status === "connected"
                ? <><CheckCircle2 className="h-4 w-4" /> Connected &amp; active — WhatsApp messages are being handled</>
                : <><AlertCircle className="h-4 w-4" /> Not connected yet — complete the steps below and save</>
              }
            </div>
          )}

          <div className="p-6 space-y-8">

            {/* Step 1 */}
            <div className="flex gap-4">
              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary text-white text-xs font-bold mt-0.5">1</div>
              <div className="space-y-2 flex-1">
                <h3 className="font-semibold text-zinc-100">Create a Meta Developer App</h3>
                <p className="text-sm text-zinc-400">Go to Meta for Developers, create a free account, then create a new app and choose <strong className="text-zinc-200">WhatsApp Business Platform</strong>.</p>
                <a
                  href="https://developers.facebook.com/apps"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-600 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Open Meta Developers
                </a>
              </div>
            </div>

            <div className="border-t border-zinc-700" />

            {/* Step 2 */}
            <div className="flex gap-4">
              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary text-white text-xs font-bold mt-0.5">2</div>
              <div className="space-y-4 flex-1">
                <div>
                  <h3 className="font-semibold text-zinc-100">Enter Phone Number ID &amp; Access Token</h3>
                  <p className="text-sm text-zinc-400 mt-1">In your Meta app, go to <strong className="text-zinc-200">WhatsApp → Getting Started</strong>. You'll see the Phone Number ID and a temporary access token. For permanent use, create a System User token under <strong className="text-zinc-200">Business Settings → System Users</strong>.</p>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-300">Phone Number ID</label>
                    <Input
                      value={phoneNumberId}
                      onChange={(e) => setPhoneNumberId(e.target.value)}
                      placeholder="e.g. 123456789012345"
                      className="bg-zinc-900 border-zinc-600 text-zinc-100 placeholder:text-zinc-500"
                    />
                    <p className="text-[10px] text-zinc-500">Found in WhatsApp → Getting Started</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-300">Access Token</label>
                    <Input
                      type="password"
                      value={accessToken}
                      onChange={(e) => setAccessToken(e.target.value)}
                      placeholder={selectedBusiness?.whatsappPhoneNumberId ? "••••••• (leave blank to keep current)" : "Paste token here"}
                      className="bg-zinc-900 border-zinc-600 text-zinc-100 placeholder:text-zinc-500"
                    />
                    <p className="text-[10px] text-zinc-500">Create a permanent System User token</p>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-xs font-medium text-zinc-300">WhatsApp Business Phone Number <span className="text-zinc-500">(what customers message)</span></label>
                    <Input
                      value={waPhone}
                      onChange={(e) => setWaPhone(e.target.value)}
                      placeholder="e.g. 15556733757 or 254722000000"
                      className="bg-zinc-900 border-zinc-600 text-zinc-100 placeholder:text-zinc-500"
                    />
                    <p className="text-[10px] text-zinc-500">International format, no + or spaces. Used for the shop QR code and share link.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-zinc-700" />

            {/* Step 3 */}
            <div className="flex gap-4">
              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary text-white text-xs font-bold mt-0.5">3</div>
              <div className="space-y-4 flex-1">
                <div>
                  <h3 className="font-semibold text-zinc-100">Set up the Webhook</h3>
                  <p className="text-sm text-zinc-400 mt-1">In Meta, go to <strong className="text-zinc-200">WhatsApp → Configuration → Webhook</strong> and enter the details below. Subscribe to the <strong className="text-zinc-200">messages</strong> field.</p>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-300">Webhook URL <span className="text-zinc-500">(copy and paste into Meta)</span></label>
                    <div className="flex gap-2">
                      <Input
                        readOnly
                        value={WEBHOOK_URL}
                        className="bg-zinc-900 border-zinc-600 text-zinc-400 font-mono text-xs"
                      />
                      <button onClick={() => copy(WEBHOOK_URL)} className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-zinc-600 hover:bg-zinc-700 transition-colors">
                        <Copy className="h-4 w-4 text-zinc-300" />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-300">Verify Token <span className="text-zinc-500">(your secret — paste this into Meta too)</span></label>
                    <div className="flex gap-2">
                      <Input
                        value={verifyToken}
                        onChange={(e) => setVerifyToken(e.target.value)}
                        placeholder="Create any secret word or phrase"
                        className="bg-zinc-900 border-zinc-600 text-zinc-100 placeholder:text-zinc-500"
                      />
                      <button onClick={regenerateToken} title="Generate token" className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-zinc-600 hover:bg-zinc-700 transition-colors">
                        <RefreshCw className="h-4 w-4 text-zinc-300" />
                      </button>
                    </div>
                    <p className="text-[10px] text-zinc-500">You choose this — it can be any word or phrase. Enter the same value in both Pesa AI and Meta.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Save button */}
            <div className="pt-2 border-t border-zinc-700">
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60 transition-colors"
              >
                <Wifi className="h-4 w-4" />
                {saving ? "Saving…" : "Save All Settings"}
              </button>
            </div>

          </div>
        </div>
      )}

      {!selectedId && (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-zinc-700 rounded-xl">
          <Wifi className="h-8 w-8 text-zinc-600 mb-3" />
          <p className="text-zinc-400 text-sm">Select a business above to configure its WhatsApp connection</p>
        </div>
      )}
    </div>
  );
}
