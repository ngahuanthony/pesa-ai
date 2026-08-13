import { useGetMe, useUpdateBusiness, getGetMeQueryKey, useConnectMpesa, useDisconnectMpesa, useGetMpesaStatus, getGetMpesaStatusQueryKey } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ExternalLink, CheckCircle2, AlertCircle, Copy, Link as LinkIcon, Unlink, Store, Bot, CreditCard } from "lucide-react";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CATEGORIES = [
  "Retail & Fashion",
  "Electronics & Gadgets",
  "Beauty & Cosmetics",
  "Food & Beverages",
  "Home & Furniture",
  "Agriculture & Produce",
  "Services",
  "Other",
];

const mpesaSchema = z.object({
  consumerKey:    z.string().min(1, "Consumer Key required"),
  consumerSecret: z.string().min(1, "Consumer Secret required"),
  passkey:        z.string().min(1, "Passkey required"),
  shortcode:      z.string().min(1, "Shortcode required"),
});

/* ── small reusable section card ── */
function Section({ icon: Icon, title, sub, children }: { icon: React.ElementType; title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-border rounded-2xl p-6 space-y-5">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <div>
          <h3 className="text-sm font-semibold text-foreground leading-tight">{title}</h3>
          <p className="text-xs text-muted-foreground">{sub}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

export function SettingsTab() {
  const { data: me } = useGetMe();
  const business = (me as any)?.business;
  const businessId = business?.id || "";

  const updateBiz = useUpdateBusiness();
  const connectMpesa = useConnectMpesa();
  const disconnectMpesa = useDisconnectMpesa();
  const { data: mpesaStatus, isLoading: isMpesaLoading } = useGetMpesaStatus(businessId, { query: { enabled: !!businessId, queryKey: getGetMpesaStatusQueryKey(businessId) } });

  const queryClient = useQueryClient();
  const { toast } = useToast();

  /* ── Business Profile state ── */
  const [bizName, setBizName]   = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [category, setCategory] = useState("");

  /* ── AI Persona state ── */
  const [personaName, setPersonaName]         = useState("");
  const [personaInstructions, setPersonaInstructions] = useState("");

  /* ── Payment & Trust state ── */
  const [paymentMethod, setPaymentMethod] = useState<"mpesa" | "bank">("mpesa");
  const [paybillNumber, setPaybillNumber] = useState("");
  const [bankName, setBankName]           = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");

  /* ── Physical Shop state ── */
  const [buildingName, setBuildingName] = useState("");
  const [shopNumber, setShopNumber]     = useState("");
  const [publicPhone, setPublicPhone]   = useState("");

  /* ── WhatsApp state ── */
  const [whatsappPhone, setWhatsappPhone] = useState("");

  const initRef = useRef<string | null>(null);
  useEffect(() => {
    if (business && initRef.current !== business.id) {
      setBizName(business.name || "");
      setOwnerName((business as any).ownerName || "");
      setCategory(business.category || "");
      setPersonaName(business.personaName || "");
      setPersonaInstructions((business as any).personaInstructions || "");
      setPaymentMethod(((business as any).paymentMethod as "mpesa" | "bank") || "mpesa");
      setPaybillNumber(business.paybillNumber || "");
      setBankName((business as any).bankName || "");
      setBankAccountNumber((business as any).bankAccountNumber || "");
      setBuildingName((business as any).buildingName || "");
      setShopNumber((business as any).shopNumber || "");
      setPublicPhone((business as any).publicPhone || "");
      setWhatsappPhone((business as any).whatsappPhone || "");
      initRef.current = business.id;
    }
  }, [business]);

  const refetch = () => queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });

  const saveProfile = () => {
    updateBiz.mutate({ id: businessId, data: { name: bizName, ownerName, category } as any }, {
      onSuccess: () => { refetch(); toast({ title: "Business profile saved!" }); }
    });
  };

  const savePersona = () => {
    updateBiz.mutate({ id: businessId, data: { personaName, personaInstructions } as any }, {
      onSuccess: () => { refetch(); toast({ title: "AI Persona saved!" }); }
    });
  };

  const savePayment = () => {
    const data: any = { paymentMethod };
    if (paymentMethod === "mpesa") {
      data.paybillNumber = paybillNumber;
      data.bankName = null;
      data.bankAccountNumber = null;
    } else {
      data.bankName = bankName;
      data.bankAccountNumber = bankAccountNumber;
      data.paybillNumber = null;
    }
    updateBiz.mutate({ id: businessId, data }, {
      onSuccess: () => { refetch(); toast({ title: "Payment settings saved!" }); }
    });
  };

  const saveShop = () => {
    updateBiz.mutate({ id: businessId, data: { buildingName, shopNumber, publicPhone } as any }, {
      onSuccess: () => { refetch(); toast({ title: "Shop details saved!" }); }
    });
  };

  const saveWhatsApp = () => {
    updateBiz.mutate({ id: businessId, data: { whatsappPhone } as any }, {
      onSuccess: () => { refetch(); toast({ title: "WhatsApp number submitted! Our team will connect it shortly." }); }
    });
  };

  return (
    <div className="space-y-5 max-w-3xl">

      {/* ── 1. Business Profile ── */}
      <Section icon={Store} title="Business Profile" sub="Update your public facing business details.">
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Business Name</label>
            <Input value={bizName} onChange={(e) => setBizName(e.target.value)} placeholder="Your shop name" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Owner Name</label>
            <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Your full name" />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Category</label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a category" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <button
          onClick={saveProfile}
          disabled={updateBiz.isPending}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {updateBiz.isPending ? "Saving…" : "Save Changes"}
        </button>
      </Section>

      {/* ── 2. AI Persona ── */}
      <Section icon={Bot} title="AI Persona" sub="How your AI assistant presents itself to customers.">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Assistant Name</label>
          <Input value={personaName} onChange={(e) => setPersonaName(e.target.value)} placeholder="e.g. Digital AI" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Persona Instructions <span className="text-muted-foreground font-normal">(Optional)</span></label>
          <textarea
            rows={4}
            value={personaInstructions}
            onChange={(e) => setPersonaInstructions(e.target.value)}
            placeholder="e.g. Speak like a friendly Nairobi shopkeeper, use 'sasa' occasionally."
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
          />
          <p className="text-xs text-muted-foreground">Give the AI specific instructions on tone and style.</p>
        </div>
        <button
          onClick={savePersona}
          disabled={updateBiz.isPending}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {updateBiz.isPending ? "Saving…" : "Save Persona"}
        </button>
      </Section>

      {/* ── 3. Physical Shop Details (Optional) ── */}
      <Section icon={Store} title="Physical Shop Details" sub="Helps customers trust you are a real business.">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-xs text-muted-foreground italic">(Optional)</span>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Building / Mall Name</label>
            <Input value={buildingName} onChange={(e) => setBuildingName(e.target.value)} placeholder="e.g. Midtown Business Centre" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Shop / Stall Number</label>
            <Input value={shopNumber} onChange={(e) => setShopNumber(e.target.value)} placeholder="e.g. F25 - First Floor" />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Public Business Phone</label>
          <Input value={publicPhone} onChange={(e) => setPublicPhone(e.target.value)} placeholder="e.g. 0722542810" />
        </div>
        <button
          onClick={saveShop}
          disabled={updateBiz.isPending}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {updateBiz.isPending ? "Saving…" : "Save Shop Details"}
        </button>
      </Section>

      {/* ── 4. WhatsApp Connection (simplified for businesses) ── */}
      <Section icon={CheckCircle2} title="WhatsApp Connection" sub="Connect your WhatsApp Business number so the AI can chat with customers automatically.">
        {/* Info box */}
        <div className="flex gap-3 rounded-xl bg-primary/8 border border-primary/20 p-4">
          <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
          <p className="text-sm text-foreground">
            Once connected, every message sent to your WhatsApp business number is automatically handled by your AI assistant — it greets customers, shows your products, and takes orders, 24/7.
          </p>
        </div>

        {/* Status */}
        {business?.whatsappPhoneNumberId ? (
          <div className="flex items-center gap-2 rounded-xl bg-primary/10 border border-primary/20 px-4 py-3">
            <span className="h-2.5 w-2.5 rounded-full bg-primary animate-pulse flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-primary">Connected &amp; Active</p>
              <p className="text-xs text-muted-foreground">Your WhatsApp shop is live and handling customer messages.</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
            <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-700">Not connected yet</p>
              <p className="text-xs text-amber-600">Enter your WhatsApp number below and our team will connect it for you.</p>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Your WhatsApp Business Number</label>
          <Input
            value={whatsappPhone}
            onChange={(e) => setWhatsappPhone(e.target.value)}
            placeholder="e.g. 0712 345 678"
            type="tel"
          />
          <p className="text-xs text-muted-foreground">The phone number customers will message. Our team will complete the technical setup.</p>
        </div>

        <button
          onClick={saveWhatsApp}
          disabled={updateBiz.isPending}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {updateBiz.isPending ? "Submitting…" : "Connect WhatsApp"}
        </button>
      </Section>

      {/* ── 4. Payment & Trust ── */}
      <Section icon={CreditCard} title="Payment & Trust" sub="Setup how customers pay you. Money goes directly to your account — we never hold funds.">
        <div>
          <p className="text-sm font-medium text-foreground mb-3">Payment Method</p>
          <div className="grid grid-cols-2 gap-3">
            {/* M-Pesa card */}
            <button
              type="button"
              onClick={() => setPaymentMethod("mpesa")}
              className={`flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-colors ${
                paymentMethod === "mpesa"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground/40"
              }`}
            >
              <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                paymentMethod === "mpesa" ? "border-primary" : "border-muted-foreground/50"
              }`}>
                {paymentMethod === "mpesa" && <span className="h-2 w-2 rounded-full bg-primary" />}
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">M-Pesa</p>
                <p className="text-xs text-muted-foreground">Till or Paybill number</p>
              </div>
            </button>

            {/* Bank Account card */}
            <button
              type="button"
              onClick={() => setPaymentMethod("bank")}
              className={`flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-colors ${
                paymentMethod === "bank"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground/40"
              }`}
            >
              <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                paymentMethod === "bank" ? "border-primary" : "border-muted-foreground/50"
              }`}>
                {paymentMethod === "bank" && <span className="h-2 w-2 rounded-full bg-primary" />}
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">Bank Account</p>
                <p className="text-xs text-muted-foreground">Receive via bank transfer</p>
              </div>
            </button>
          </div>
        </div>

        {/* M-Pesa fields */}
        {paymentMethod === "mpesa" && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Till or Paybill Number</label>
            <Input
              value={paybillNumber}
              onChange={(e) => setPaybillNumber(e.target.value)}
              placeholder="e.g. 522522"
            />
          </div>
        )}

        {/* Bank fields */}
        {paymentMethod === "bank" && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Select Your Bank</label>
              <Select value={bankName} onValueChange={setBankName}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose your bank..." />
                </SelectTrigger>
                <SelectContent>
                  {["KCB Bank", "Equity Bank", "Co-operative Bank", "NCBA Bank", "Absa Bank Kenya",
                    "Standard Chartered", "Diamond Trust Bank", "Family Bank", "I&M Bank",
                    "Stanbic Bank", "Sidian Bank", "Prime Bank", "Gulf African Bank",
                    "HFC Bank", "Faulu Bank"].map((b) => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Your Account Number</label>
              <Input
                value={bankAccountNumber}
                onChange={(e) => setBankAccountNumber(e.target.value)}
                placeholder="e.g. 0123456789"
              />
            </div>
          </div>
        )}

        <button
          onClick={savePayment}
          disabled={updateBiz.isPending}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {updateBiz.isPending ? "Saving…" : "Save Payment Settings"}
        </button>
      </Section>

    </div>
  );
}
