import { useEffect, useState } from "react";
import { useAdminListBusinesses, getAdminListBusinessesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, CheckCircle2, MessageSquare, Wifi } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import QRCode from "qrcode";

async function buildQrProfilePicture(businessName: string, phone: string): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 640;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create profile image");

  ctx.fillStyle = "#16a34a";
  ctx.fillRect(0, 0, 640, 640);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.font = "bold 38px Arial";
  const shortName = businessName.length > 28 ? `${businessName.slice(0, 27)}…` : businessName;
  ctx.fillText(shortName.toUpperCase(), 320, 105);

  const shopUrl = `https://wa.me/${phone}?text=${encodeURIComponent("Hi, I'd like to shop")}`;
  const qrDataUrl = await QRCode.toDataURL(shopUrl, {
    width: 320,
    margin: 2,
    color: { dark: "#111827", light: "#ffffff" },
  });
  const qrImage = new Image();
  qrImage.src = qrDataUrl;
  await new Promise<void>((resolve, reject) => {
    qrImage.onload = () => resolve();
    qrImage.onerror = () => reject(new Error("Could not generate QR image"));
  });

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.roundRect(130, 145, 380, 380, 28);
  ctx.fill();
  ctx.drawImage(qrImage, 160, 175, 320, 320);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 28px Arial";
  ctx.fillText("SCAN TO SHOP", 320, 575);
  return canvas.toDataURL("image/png");
}

export function AdminWhatsAppTab() {
  const { data: businesses, isLoading } = useAdminListBusinesses();
  const [selectedId, setSelectedId] = useState("");
  const [waPhone, setWaPhone] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [platformReady, setPlatformReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"connected" | "not_connected" | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    fetch("/api/admin/platform-defaults", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Could not load platform WhatsApp settings");
        const defaults = await res.json();
        setPhoneNumberId(defaults.phoneNumberId || "");
        setWabaId(defaults.wabaId || "");
        setPlatformReady(Boolean(defaults.hasToken && defaults.phoneNumberId && defaults.wabaId));
      })
      .catch(() => setPlatformReady(false));
  }, []);

  const loadBusiness = async (id: string) => {
    setSelectedId(id);
    const business = businesses?.find((item: any) => item.id === id);
    setDisplayName(business?.name || "");
    setWaPhone("");
    setVerifyToken("");
    setStatus(null);
    try {
      const res = await fetch(`/api/admin/businesses/${id}/whatsapp`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Could not load WhatsApp status");
      const data = await res.json();
      setWaPhone(data.requestedPhone || "");
      setVerifyToken(data.verifyToken || "");
      setStatus(data.connected ? "connected" : "not_connected");
    } catch {
      toast({
        title: "Could not load WhatsApp status",
        variant: "destructive",
      });
    }
  };

  const handleSave = async () => {
    const normalizedPhone = waPhone.replace(/\D/g, "");
    if (!selectedId || !/^\d{10,15}$/.test(normalizedPhone)) {
      toast({
        title: "Enter a valid WhatsApp number",
        description: "Use international format, for example 2547XXXXXXXX.",
        variant: "destructive",
      });
      return;
    }
    if (!platformReady) {
      toast({
        title: "Platform WhatsApp credentials are unavailable",
        description: "The production system token must be configured on the server.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const profileImageDataUrl = await buildQrProfilePicture(displayName.trim(), normalizedPhone);
      const res = await fetch(`/api/admin/businesses/${selectedId}/whatsapp`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumberId,
          wabaId,
          verifyToken,
          displayName: displayName.trim(),
          waPhone: normalizedPhone,
          profileImageDataUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not activate WhatsApp");
      setStatus(data.connected ? "connected" : "not_connected");
      toast({
        title: "WhatsApp connected",
        description: data.profilePictureUpdated
          ? "Connected and the QR profile picture was applied."
          : "Connected. Meta did not update the profile picture yet; click Update to retry.",
      });
      queryClient.invalidateQueries({ queryKey: getAdminListBusinessesQueryKey() });
    } catch (error) {
      toast({
        title: "Activation failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <p className="text-zinc-400 text-sm">Loading businesses…</p>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-bold text-zinc-100">Connect a business to WhatsApp</h2>
        <p className="text-sm text-zinc-400 mt-1">
          Pesa AI securely manages the Meta credentials and webhook. You only need the customer-facing number.
        </p>
      </div>

      <div
        className={`flex items-start gap-3 rounded-xl border p-4 ${
          platformReady
            ? "border-emerald-800 bg-emerald-950/30 text-emerald-300"
            : "border-rose-800 bg-rose-950/30 text-rose-300"
        }`}
      >
        {platformReady ? <CheckCircle2 className="h-5 w-5 mt-0.5" /> : <AlertCircle className="h-5 w-5 mt-0.5" />}
        <div>
          <p className="text-sm font-semibold">
            {platformReady ? "Production Meta connection is ready" : "Production Meta connection needs attention"}
          </p>
          <p className="text-xs opacity-80 mt-0.5">
            {platformReady
              ? "Phone Number ID, WABA ID, access token, and webhook are managed by the server."
              : "The server-managed Meta token or sender identifiers are missing."}
          </p>
        </div>
      </div>

      <div className="space-y-5 rounded-xl border border-zinc-700 bg-zinc-800/60 p-6">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-zinc-200">1. Select business</label>
          <Select value={selectedId} onValueChange={loadBusiness}>
            <SelectTrigger className="bg-zinc-900 border-zinc-600 text-zinc-100">
              <SelectValue placeholder="Choose a business…" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-800 border-zinc-700">
              {(businesses || []).map((business: any) => (
                <SelectItem key={business.id} value={business.id} className="text-zinc-100">
                  {business.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedId && (
          <>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-200">2. Dedicated WhatsApp number</label>
              <Input
                inputMode="tel"
                value={waPhone}
                onChange={(event) => setWaPhone(event.target.value)}
                placeholder="2547XXXXXXXX"
                className="bg-zinc-900 border-zinc-600 text-zinc-100 placeholder:text-zinc-500"
              />
              <p className="text-xs text-zinc-500">International format without +, spaces, or dashes.</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-200">3. Display name</label>
              <Input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="bg-zinc-900 border-zinc-600 text-zinc-100"
              />
            </div>

            {status && (
              <div className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm ${
                status === "connected"
                  ? "bg-emerald-950/40 text-emerald-300"
                  : "bg-amber-950/40 text-amber-300"
              }`}>
                {status === "connected"
                  ? <><CheckCircle2 className="h-4 w-4" /> Connected &amp; live</>
                  : <><MessageSquare className="h-4 w-4" /> Ready to activate</>}
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={saving || !platformReady || !displayName.trim()}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Wifi className="h-4 w-4" />
              {saving ? "Activating…" : status === "connected" ? "Update WhatsApp connection" : "Activate WhatsApp"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}