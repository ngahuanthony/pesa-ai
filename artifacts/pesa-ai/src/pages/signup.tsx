import { PublicLayout } from "@/components/layout";
import { Link, useLocation } from "wouter";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";
import { useEffect, useState } from "react";
import { ShopQRCard } from "@/components/dashboard/shop-qr-card";
import { MERCHANT_TYPES, displayMerchantType } from "@/constants/merchant-types";

const formatPhoneInput = (value: string) => {
  const digits = value.replace(/\D/g, "");
  const local = digits.startsWith("254") ? "0" + digits.slice(3) : digits.startsWith("0") ? digits : digits ? "0" + digits : "";
  const limited = local.slice(0, 10);
  return [limited.slice(0, 4), limited.slice(4, 7), limited.slice(7, 10)].filter(Boolean).join(" ");
};
const normalizePhoneForCompare = (value: string) => {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("0")) return "254" + digits.slice(1);
  return digits;
};
const maskPhone = (value: string) => { const digits = value.replace(/\D/g, ""); return digits.length >= 4 ? digits.slice(0, 4) + " XX XX XX" : "07XX XX XX XX"; };
const slugifyShopName = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "shop";
const getShopSlug = (name: string, businessId?: string) => { const base = slugifyShopName(name); const suffix = String(businessId || "").replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase(); return `${base}${suffix ? `-${suffix}` : ""}`; };
const getInitialSignupForm = () => {
  const initial = { businessName: "", merchantType: "retail", pesaAiNumber: "", personalPhone: "" };
  try {
    const saved = sessionStorage.getItem("pesa_setup_prefill");
    sessionStorage.removeItem("pesa_setup_prefill");
    if (!saved) return initial;
    const prefill = JSON.parse(saved);
    return {
      businessName: typeof prefill.businessName === "string" ? prefill.businessName : initial.businessName,
      merchantType: displayMerchantType(prefill.merchantType),
      pesaAiNumber: typeof prefill.pesaAiNumber === "string" ? formatPhoneInput(prefill.pesaAiNumber) : initial.pesaAiNumber,
      personalPhone: typeof prefill.personalPhone === "string" ? formatPhoneInput(prefill.personalPhone) : initial.personalPhone,
    };
  } catch {
    sessionStorage.removeItem("pesa_setup_prefill");
    return initial;
  }
};

export default function SignupPage() {
  const { me } = useAuthRedirect(); const [, setLocation] = useLocation();
  const [step, setStep] = useState<"details" | "personal" | "shop" | "complete">("details"); const [busy, setBusy] = useState(false); const [resending, setResending] = useState<"personal" | "shop" | null>(null); const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [otp, setOtp] = useState(""); const [pendingId, setPendingId] = useState(""); const [personalPhone, setPersonalPhone] = useState(""); const [shopPhone, setShopPhone] = useState(""); const [smsPending, setSmsPending] = useState(false); const [numberHelpOpen, setNumberHelpOpen] = useState(false); const [signupComplete, setSignupComplete] = useState(false); const [createdShop, setCreatedShop] = useState<{ name: string; phone: string; slug: string } | null>(null); const [form, setForm] = useState(getInitialSignupForm);
  useEffect(() => { if (signupComplete) return; if (me?.authenticated && !me?.isAdmin) setLocation("/dashboard"); if (me?.isAdmin) setLocation("/admin"); }, [me, setLocation, signupComplete]);
  const update = (key: keyof typeof form) => (event: any) => setForm({ ...form, [key]: event.target.value }); const updatePhone = (key: "pesaAiNumber" | "personalPhone") => (event: any) => setForm({ ...form, [key]: formatPhoneInput(event.target.value) });
  const post = async (url: string, payload: any) => { const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, credentials: "include", body: JSON.stringify(payload) }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || "Something went wrong"); return body; };
  const createShop = async (event: any) => { event.preventDefault(); setError(""); setNotice(""); if (normalizePhoneForCompare(form.pesaAiNumber) === normalizePhoneForCompare(form.personalPhone) && normalizePhoneForCompare(form.pesaAiNumber)) { setError("Use two different numbers: one public Duka number and one private number for alerts."); return; } setBusy(true); try { const body = await post("/api/auth/signup", form); setPendingId(body.pendingSignupId); setPersonalPhone(form.personalPhone); setShopPhone(form.pesaAiNumber); setSmsPending(Boolean(body.smsPending)); setStep(body.next === "shop" ? "shop" : "personal"); } catch (err: any) { setError(err.message); } finally { setBusy(false); } };
  const resend = async (channel: "personal" | "shop") => { setError(""); setNotice(""); setResending(channel); try { const body = await post("/api/auth/resend-signup-otp", { pendingSignupId: pendingId, channel }); setNotice(body.message || "A new code has been sent."); } catch (err: any) { setError(err.message); } finally { setResending(null); } };
  const verify = async (channel: "personal" | "shop", event: any) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const body = await post("/api/auth/verify-signup-otp", { pendingSignupId: pendingId, channel, code: otp });
      setOtp("");
      if (body.business) {
        const business = body.business;
        const name = business.name || form.businessName;
        const slug = business.publicShopSlug || business.shopSlug || getShopSlug(name, business.id);
        setCreatedShop({ name, phone: business.pesaAiNumber || form.pesaAiNumber, slug });
        setSignupComplete(true);
        setStep("complete");
      } else {
        setStep(body.next === "shop" ? "shop" : "personal");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <PublicLayout>
      <div className="flex flex-1 items-center justify-center bg-[#f7faf8] px-4 py-10">
        <div className="w-full max-w-xl rounded-3xl border bg-white p-6 shadow-sm md:p-9">
          <div className="mb-6 rounded-2xl bg-[#f7faf8] p-4">
            <div className="flex items-center justify-between text-xs font-bold text-slate-500">
              <span className={step === "details" ? "text-[#0a4a3a]" : "text-[#25a85a]"}>1. Shop details</span>
              <span className={step === "personal" ? "text-[#0a4a3a]" : step === "details" ? "text-slate-400" : "text-[#25a85a]"}>2. Verify WhatsApp</span>
              <span className={step === "shop" ? "text-[#0a4a3a]" : step === "complete" ? "text-[#25a85a]" : "text-slate-400"}>3. Open shop</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white">
              <div className="h-full rounded-full bg-[#25D366] transition-all" style={{ width: step === "details" ? "33%" : step === "personal" ? "66%" : "100%" }} />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {step === "details" ? "About 1 minute · We will send two verification codes." : step === "personal" ? "First, confirm your personal WhatsApp." : step === "shop" ? "One last code to open your shop." : "Your shop is ready to share."}
            </p>
          </div>

          {step === "details" && (
            <>
              <div className="mb-7">
                <div className="mb-5 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-xl text-white">✓</div>
                  <span className="text-xl font-bold text-foreground">WhatsApp Shop</span>
                </div>
                <h1 className="text-3xl font-extrabold leading-tight text-foreground">Create your WhatsApp Shop in 15 seconds</h1>
                <p className="mt-2 text-sm text-muted-foreground">Three details now. Add products after your shop is open.</p>
              </div>
              <form onSubmit={createShop} className="space-y-5">
                <div>
                  <label className="text-sm font-semibold">1. Shop Name / Business Name</label>
                  <input value={form.businessName} onChange={update("businessName")} placeholder="Digital Nation Accessories" className="mt-1 w-full rounded-xl border px-4 py-3.5 text-base" required />
                </div>
                <div>
                  <label className="text-sm font-semibold">Business Type</label>
                  <select value={form.merchantType} onChange={update("merchantType")} className="mt-1 w-full rounded-xl border px-4 py-3.5 text-base" required>
                    {MERCHANT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="flex flex-wrap items-center gap-2 text-sm font-semibold"><span>🏪</span><span>2. Duka Number (Public) — What customers will chat</span><span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">Needs NEW SIM</span></label>
                  <input type="tel" inputMode="tel" autoComplete="tel" value={form.pesaAiNumber} onChange={updatePhone("pesaAiNumber")} placeholder="07XX XX XX XX" className="mt-1 w-full rounded-xl border px-4 py-3.5 text-base" required />
                  <p className="mt-2 text-xs leading-relaxed text-slate-600">This is your shop's public number on poster and QR. It must be a new line never registered on WhatsApp.</p>
                  <button type="button" onClick={() => setNumberHelpOpen(true)} className="mt-2 text-left text-xs font-semibold text-[#168447] underline underline-offset-4">Already using this number on WhatsApp? See how to prepare a Meta-ready line →</button>
                </div>
                <div>
                  <label className="flex flex-wrap items-center gap-2 text-sm font-semibold"><span>👤</span><span>3. Your Number (Private) — For order alerts</span><span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">Your existing WhatsApp</span></label>
                  <input type="tel" inputMode="tel" autoComplete="tel" value={form.personalPhone} onChange={updatePhone("personalPhone")} placeholder="07XX XX XX XX" className="mt-1 w-full rounded-xl border px-4 py-3.5 text-base" required />
                  <p className="mt-2 text-xs leading-relaxed text-slate-600">Your current WhatsApp where order alerts and login code arrive.</p>
                </div>
                <div className="rounded-2xl border border-[#cfe8d8] bg-[#f4fff7] p-4">
                  <h2 className="text-sm font-extrabold text-[#0a4a3a]">You need 2 numbers</h2>
                  <p className="mt-2 text-xs leading-relaxed text-slate-600">🏪 Duka Number = Public (customers see) · 👤 Your Number = Private (you get alerts)</p>
                </div>
                {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                <button type="submit" disabled={busy} className="w-full rounded-xl bg-[#08b968] py-4 text-base font-extrabold text-white disabled:opacity-60">{busy ? "Creating your shop…" : "Create my WhatsApp Shop — Free for 5 days"}</button>
              </form>
              <p className="mt-5 text-center text-sm text-slate-600">Not ready to verify yet? <Link href="/setup" className="font-bold text-[#168447] underline underline-offset-4">Use setup-only draft</Link></p>
            </>
          )}

          {step === "personal" && (
            <form onSubmit={(event) => verify("personal", event)} className="space-y-5 py-8 text-center">
              <h1 className="text-2xl font-extrabold text-foreground">Confirm your personal WhatsApp</h1>
              <p className="text-sm text-slate-600">We sent a code to {maskPhone(personalPhone)}. Enter it to prove you own the order-alert number.</p>
              <input inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" className="mx-auto block w-full max-w-xs rounded-xl border px-4 py-3.5 text-center text-2xl tracking-[0.5em]" required />
              <div className="flex items-center justify-between gap-3 text-xs text-slate-500"><span>Didn’t receive it?</span><button type="button" onClick={() => resend("personal")} disabled={resending !== null} className="font-bold text-[#168447] underline underline-offset-4 disabled:opacity-50">{resending === "personal" ? "Sending…" : "Resend code"}</button></div>
              {notice && <p role="status" className="rounded-lg bg-[#f0fff4] p-2 text-left text-xs text-[#168447]">{notice}</p>}
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <button type="submit" disabled={busy || otp.length !== 6} className="w-full rounded-xl bg-[#08b968] py-4 text-base font-extrabold text-white disabled:opacity-60">{busy ? "Verifying…" : "Verify personal WhatsApp"}</button>
              <p className="text-xs text-muted-foreground">Your code expires in 5 minutes.</p>
            </form>
          )}

          {step === "shop" && (
            <form onSubmit={(event) => verify("shop", event)} className="space-y-5 py-8 text-center">
              <h1 className="text-2xl font-extrabold text-foreground">Confirm your new shop number</h1>
              <p className="text-sm text-slate-600">Enter the SMS code sent to {maskPhone(shopPhone)} to reserve it for {form.businessName}.</p>
              {smsPending && <div className="rounded-xl bg-amber-100 p-3 text-left text-sm text-amber-950">The shop-number SMS is still pending. Once it arrives, enter the six-digit code here.</div>}
              <input inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" className="mx-auto block w-full max-w-xs rounded-xl border px-4 py-3.5 text-center text-2xl tracking-[0.5em]" required />
              <div className="flex items-center justify-between gap-3 text-xs text-slate-500"><span>SMS not here yet?</span><button type="button" onClick={() => resend("shop")} disabled={resending !== null} className="font-bold text-[#168447] underline underline-offset-4 disabled:opacity-50">{resending === "shop" ? "Sending…" : "Resend SMS"}</button></div>
              {notice && <p role="status" className="rounded-lg bg-[#f0fff4] p-2 text-left text-xs text-[#168447]">{notice}</p>}
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <button type="submit" disabled={busy || otp.length !== 6} className="w-full rounded-xl bg-[#08b968] py-4 text-base font-extrabold text-white disabled:opacity-60">{busy ? "Creating your shop…" : "Verify and open my shop"}</button>
            </form>
          )}

          {step === "complete" && createdShop && (
            <div className="space-y-6 py-6 text-center">
              <div><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#25D366] text-2xl font-black text-white">✓</div><h1 className="mt-4 text-2xl font-extrabold text-foreground">Your shop is ready to share</h1><p className="mt-2 text-sm leading-relaxed text-slate-600">Scan this QR code to open your public shop. Download it for your counter, packaging, or WhatsApp status.</p></div>
              <ShopQRCard businessName={createdShop.name} phone={createdShop.phone} shopSlug={createdShop.slug} />
              <a href={`/shop/${encodeURIComponent(createdShop.slug)}`} target="_blank" rel="noreferrer" className="block rounded-xl border border-[#0a4a3a]/20 px-4 py-3 text-sm font-bold text-[#0a4a3a]">Open my shop link</a>
              <button type="button" onClick={() => setLocation("/dashboard")} className="w-full rounded-xl bg-[#0a4a3a] py-3.5 text-sm font-bold text-white">Go to dashboard</button>
            </div>
          )}
        </div>
      </div>
      {numberHelpOpen && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[100] bg-black/40" onClick={() => setNumberHelpOpen(false)}>
          <div className="fixed bottom-0 left-0 right-0 max-h-[85vh] overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl md:bottom-1/2 md:left-1/2 md:right-auto md:w-[min(92vw,520px)] md:translate-x-[-50%] md:translate-y-[50%] md:rounded-3xl" onClick={(event) => event.stopPropagation()}>
            <h2 className="text-xl font-extrabold text-foreground">Prepare a line for Meta</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">Meta needs a separate line for your public Duka number. Do not move your personal WhatsApp to this line.</p>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-left text-sm leading-relaxed text-slate-700">
              <li>Get a dedicated Safaricom or Airtel SIM for the shop.</li>
              <li>Register the line in the business owner’s name and keep the SIM active.</li>
              <li>Make sure the line can receive SMS and phone calls for Meta verification.</li>
              <li>Do not register this line on WhatsApp or WhatsApp Business before setup.</li>
              <li>Enter the number here and complete the SMS verification when prompted.</li>
            </ol>
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-left text-xs leading-relaxed text-amber-950">
              <p className="font-bold">If the line is already on WhatsApp</p>
              <p className="mt-1">The safer option is WhatsApp → Settings → Account → Change number, then move your personal account to your private line. If you no longer need that WhatsApp account, back up anything important first, then use Settings → Account → Delete my account. Uninstalling the app or turning off notifications does not free the number.</p>
              <p className="mt-2 font-semibold">After changing or deleting the account, do not register this number on WhatsApp again. Keep the SIM active in a phone that can receive SMS or calls, then enter the number here and complete verification so Meta can use it for your public shop.</p>
            </div>
            <p className="mt-4 rounded-xl bg-[#f4fff7] p-3 text-left text-xs leading-relaxed text-[#0a4a3a]">Keep your existing WhatsApp number in the private number field for order alerts and login codes.</p>
            <button type="button" onClick={() => setNumberHelpOpen(false)} className="mt-6 w-full rounded-xl bg-[#08b968] py-3.5 text-sm font-bold text-white">Got it — back to signup</button>
          </div>
        </div>
      )}
    </PublicLayout>
  );
}
