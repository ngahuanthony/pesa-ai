import { useGetMe, useUpdateBusiness, getGetMeQueryKey } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Store, Bot, CreditCard, CheckCircle2, Headphones } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CATEGORIES = [
  "Retail & Fashion",
  "Electronics & Gadgets",
  "Mobile Phone Accessories",
  "Computers & Laptops",
  "Beauty & Cosmetics",
  "Food & Beverages",
  "Home & Furniture",
  "Agriculture & Produce",
  "Services",
  "Other",
];

const BANKS = [
  "KCB Bank",
  "Equity Bank",
  "Co-operative Bank",
  "NCBA Bank",
  "Absa Bank Kenya",
  "Standard Chartered",
  "I&M Bank",
  "Diamond Trust Bank (DTB)",
  "Family Bank",
  "Stanbic Bank",
  "Prime Bank",
  "Sidian Bank",
  "Gulf African Bank",
  "HF Group",
  "Faulu Bank",
  "Postbank",
  "Other",
];

function Section({
  icon: Icon, title, sub, children,
}: {
  icon: React.ElementType; title: string; sub: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-border rounded-2xl p-6 space-y-5">
      <div className="flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground leading-tight">{title}</h3>
          <p className="text-xs text-muted-foreground">{sub}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function SaveButton({ onClick, isPending, label = "Save Changes" }: { onClick: () => void; isPending: boolean; label?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={isPending}
      className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60 transition-colors"
    >
      {isPending ? "Saving…" : label}
    </button>
  );
}

export function SettingsTab() {
  const { data: me } = useGetMe();
  const business   = (me as any)?.business;
  const businessId = business?.id || "";

  const updateBiz   = useUpdateBusiness();
  const queryClient = useQueryClient();
  const { toast }   = useToast();

  /* ── state ── */
  const [bizName,    setBizName]   = useState("");
  const [ownerName,  setOwnerName] = useState("");
  const [category,   setCategory]  = useState("");

  const [personaName,         setPersonaName]         = useState("");
  const [personaInstructions, setPersonaInstructions] = useState("");

  const [buildingName, setBuildingName] = useState("");
  const [shopNumber,   setShopNumber]   = useState("");
  const [publicPhone,  setPublicPhone]  = useState("");

  const [paymentMethod,    setPaymentMethod]    = useState<"mpesa" | "bank">("mpesa");
  const [paybillNumber,    setPaybillNumber]    = useState("");
  const [bankName,         setBankName]         = useState("");
  const [bankAccountNumber,setBankAccountNumber]= useState("");

  const initRef = useRef<string | null>(null);
  useEffect(() => {
    if (business && initRef.current !== business.id) {
      setBizName(business.name || "");
      setOwnerName(business.ownerName || "");
      setCategory(business.category || "");
      setPersonaName(business.personaName || "");
      setPersonaInstructions(business.personaInstructions || "");
      setBuildingName(business.buildingName || "");
      setShopNumber(business.shopNumber || "");
      setPublicPhone(business.publicPhone || "");
      setPaymentMethod(business.paymentMethod || "mpesa");
      setPaybillNumber(business.paybillNumber || "");
      setBankName(business.bankName || "");
      setBankAccountNumber(business.bankAccountNumber || "");
      initRef.current = business.id;
    }
  }, [business]);

  const refetch = () => queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });

  const saveProfile = () =>
    updateBiz.mutate({ id: businessId, data: { name: bizName, ownerName, category } as any }, {
      onSuccess: () => { refetch(); toast({ title: "Profile saved!" }); },
    });

  const savePersona = () =>
    updateBiz.mutate({ id: businessId, data: { personaName, personaInstructions } as any }, {
      onSuccess: () => { refetch(); toast({ title: "Assistant updated!" }); },
    });

  const saveShop = () =>
    updateBiz.mutate({ id: businessId, data: { buildingName, shopNumber, publicPhone } as any }, {
      onSuccess: () => { refetch(); toast({ title: "Location saved!" }); },
    });

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
      onSuccess: () => { refetch(); toast({ title: "Payment details saved!" }); },
    });
  };

  /* ── WhatsApp status banner ── */
  const waConnected = !!(business?.whatsappPhoneNumberId);

  return (
    <div className="space-y-5 max-w-2xl">

      {/* Managed-by-team banner */}
      <div className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-5 py-4">
        <Headphones className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
        <p className="text-sm text-foreground leading-relaxed">
          Your WhatsApp connection and payment gateway are <strong>managed by the Pesa AI team</strong> — you don't need to touch any of that.
          Just fill in your shop details below and we handle the rest.
        </p>
      </div>

      {/* WhatsApp status pill — read-only */}
      <div className={`flex items-center gap-2.5 rounded-xl px-4 py-3 border ${
        waConnected ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"
      }`}>
        <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${waConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-400"}`} />
        <div>
          <p className={`text-sm font-semibold ${waConnected ? "text-emerald-700" : "text-amber-700"}`}>
            WhatsApp Shop: {waConnected ? "Connected & Live" : "Pending Connection"}
          </p>
          <p className={`text-xs ${waConnected ? "text-emerald-600" : "text-amber-600"}`}>
            {waConnected
              ? "Your assistant is live and handling customer messages."
              : "Our team will connect your WhatsApp number — usually within 24 hours of signup."}
          </p>
        </div>
      </div>

      {/* 1. Shop Info */}
      <Section icon={Store} title="Shop Info" sub="Your business name and what you sell.">
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Business Name</label>
            <Input value={bizName} onChange={(e) => setBizName(e.target.value)} placeholder="e.g. Digital Nation Accessories" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Owner Name</label>
            <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Your full name" />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Category</label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-full"><SelectValue placeholder="What type of business?" /></SelectTrigger>
            <SelectContent className="max-h-52 overflow-y-auto">
              {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <SaveButton onClick={saveProfile} isPending={updateBiz.isPending} />
      </Section>

      {/* 2. Your Location */}
      <Section icon={Store} title="Your Location" sub="Optional — shows customers where to find your physical shop.">
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Building / Mall</label>
            <Input value={buildingName} onChange={(e) => setBuildingName(e.target.value)} placeholder="e.g. Westgate Shopping Mall" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Shop / Stall Number</label>
            <Input value={shopNumber} onChange={(e) => setShopNumber(e.target.value)} placeholder="e.g. Ground Floor, G14" />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Public Phone Number</label>
          <Input value={publicPhone} onChange={(e) => setPublicPhone(e.target.value)} placeholder="e.g. 0722 542 810" type="tel" />
        </div>
        <SaveButton onClick={saveShop} isPending={updateBiz.isPending} label="Save Location" />
      </Section>

      {/* 3. Your Assistant */}
      <Section icon={Bot} title="Your Assistant" sub="Give your WhatsApp assistant a name and personality that fits your brand.">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Assistant Name</label>
          <Input value={personaName} onChange={(e) => setPersonaName(e.target.value)} placeholder="e.g. Aisha, Digital AI, ShopBot" />
          <p className="text-xs text-muted-foreground">This is the name customers see when they chat with your WhatsApp shop.</p>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">
            Personality <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <textarea
            rows={4}
            value={personaInstructions}
            onChange={(e) => setPersonaInstructions(e.target.value)}
            placeholder="e.g. Be friendly and speak like a helpful Nairobi shopkeeper. Use casual Swahili greetings like 'Sasa!' occasionally."
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
          />
          <p className="text-xs text-muted-foreground">Tell the assistant how to speak to customers — tone, language, anything special about your shop.</p>
        </div>
        <SaveButton onClick={savePersona} isPending={updateBiz.isPending} label="Save Assistant" />
      </Section>

      {/* 4. How You Get Paid */}
      <Section icon={CreditCard} title="How You Get Paid" sub="Tell us where to send customer payments. Money goes directly to your account.">
        <div className="grid grid-cols-2 gap-3">
          {(["mpesa", "bank"] as const).map((method) => (
            <button
              key={method}
              type="button"
              onClick={() => setPaymentMethod(method)}
              className={`flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-colors ${
                paymentMethod === method ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40"
              }`}
            >
              <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                paymentMethod === method ? "border-primary" : "border-muted-foreground/50"
              }`}>
                {paymentMethod === method && <span className="h-2 w-2 rounded-full bg-primary" />}
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">{method === "mpesa" ? "M-Pesa" : "Bank Account"}</p>
                <p className="text-xs text-muted-foreground">{method === "mpesa" ? "Till or Paybill number" : "Receive via bank transfer"}</p>
              </div>
            </button>
          ))}
        </div>

        {paymentMethod === "mpesa" && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Your Till or Paybill Number</label>
            <Input value={paybillNumber} onChange={(e) => setPaybillNumber(e.target.value)} placeholder="e.g. 522522" />
            <p className="text-xs text-muted-foreground">Customers pay to this number. You keep 100% — we never deduct from orders.</p>
          </div>
        )}

        {paymentMethod === "bank" && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Your Bank</label>
              <Select value={bankName} onValueChange={setBankName}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select your bank…" /></SelectTrigger>
                <SelectContent className="max-h-52 overflow-y-auto">{BANKS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Account Number</label>
              <Input value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)} placeholder="e.g. 0123456789" />
            </div>
          </div>
        )}

        <SaveButton onClick={savePayment} isPending={updateBiz.isPending} label="Save Payment Details" />
      </Section>

      {/* Help footer */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
        <CheckCircle2 className="h-3.5 w-3.5 text-primary flex-shrink-0" />
        Need help? WhatsApp us at <strong className="text-foreground">+254 700 000 000</strong> and our team will sort it out.
      </div>

    </div>
  );
}
