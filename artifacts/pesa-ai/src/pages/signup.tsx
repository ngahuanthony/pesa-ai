import { PublicLayout } from "@/components/layout";
import { Link, useLocation } from "wouter";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";
import { useEffect, useState } from "react";
import { ShopQRCard } from "@/components/dashboard/shop-qr-card";

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

export default function SignupPage() {
  const { me } = useAuthRedirect(); const [, setLocation] = useLocation();
  const [step, setStep] = useState<"details" | "personal" | "shop" | "complete">("details"); const [busy, setBusy] = useState(false); const [resending, setResending] = useState<"personal" | "shop" | null>(null); const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [otp, setOtp] = useState(""); const [pendingId, setPendingId] = useState(""); const [personalPhone, setPersonalPhone] = useState(""); const [shopPhone, setShopPhone] = useState(""); const [smsPending, setSmsPending] = useState(false); const [numberHelpOpen, setNumberHelpOpen] = useState(false); const [numberConflictOpen, setNumberConflictOpen] = useState(false); const [signupComplete, setSignupComplete] = useState(false); const [createdShop, setCreatedShop] = useState<{ name: string; phone: string; slug: string } | null>(null); const [form, setForm] = useState({ businessName: "", merchantType: "retail", pesaAiNumber: "", personalPhone: "" });
  useEffect(() => { if (signupComplete) return; if (me?.authenticated && !me?.isAdmin) setLocation("/dashboard"); if (me?.isAdmin) setLocation("/admin"); }, [me, setLocation, signupComplete]);
  const update = (key: keyof typeof form) => (event: any) => setForm({ ...form, [key]: event.target.value }); const updatePhone = (key: "pesaAiNumber" | "personalPhone") => (event: any) => setForm({ ...form, [key]: formatPhoneInput(event.target.value) });
  const post = async (url: string, payload: any) => { const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, credentials: "include", body: JSON.stringify(payload) }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || "Something went wrong"); return body; };
  const createShop = async (event: any) => { event.preventDefault(); setError(""); setNotice(""); if (normalizePhoneForCompare(form.pesaAiNumber) === normalizePhoneForCompare(form.personalPhone) && normalizePhoneForCompare(form.pesaAiNumber)) { setError("Use two different numbers: one public Duka number and one private number for alerts."); return; } setBusy(true); try { const body = await post("/api/auth/signup", form); setPendingId(body.pendingSignupId); setPersonalPhone(form.personalPhone); setShopPhone(form.pesaAiNumber); setSmsPending(Boolean(body.smsPending)); setStep("personal"); } catch (err: any) { if (/already|whatsapp|number/i.test(err.message)) setNumberConflictOpen(true); setError(err.message); } finally { setBusy(false); } };
  const resend = async (channel: "personal" | "shop") => { setError(""); setNotice(""); setResending(channel); try { const body = await post("/api/auth/resend-signup-otp", { pendingSignupId: pendingId, channel }); setNotice(body.data?.message || "A new code has been sent."); } catch (err: any) { setError(err.message); } finally { setResending(null); } }; const verify = async (channel: "personal" | "shop", event: any) => { event.preventDefault(); setError(""); setBusy(true); try { const body = await post("/api/auth/verify-signup-otp", { pendingSignupId: pendingId, channel, code: otp }); setOtp(""); if (channel === "shop") { const business = body.data?.business; const name = business?.name || form.businessName; const slug = business?.publicShopSlug || business?.shopSlug || getShopSlug(name, business?.id); setCreatedShop({ name, phone: business?.pesaAiNumber || form.pesaAiNumber, slug }); setSignupComplete(true); setStep("complete"); } else if (body.cookie) setLocation("/dashboard"); else setStep("shop"); } catch (err: any) { setError(err.message); } finally { setBusy(false); } };
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
                    <option value="retail">Retail</option>
                    <option value="hotel">Hotel</option>
                    <option value="hospitality">Hospitality</option>
                    <option value="service">Service</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="flex flex-wrap items-center gap-2 text-sm font-semibold"><span>🏪</span><span>2. Duka Number (Public) — What customers will chat</span><span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">Needs NEW SIM</span></label>
                  <input type="tel" inputMode="tel" autoComplete="tel" value={form.pesaAiNumber} onChange={updatePhone("pesaAiNumber")} placeholder="07XX XX XX XX" className="mt-1 w-full rounded-xl border px-4 py-3.5 text-base" required />
                  <p className="mt-2 text-xs leading-relaxed text-slate-600">This is your shop's public number on poster and QR. It must be a new line never registered on WhatsApp.</p>
                  <button type="button" onClick={() => { setNumberConflictOpen(false); setNumberHelpOpen(true); }} className="mt-2 text-left text-xs font-semibold text-[#168447] underline underline-offset-4">Already using this number on WhatsApp? Click to fix in 2 mins →</button>
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
            <h2 className="text-xl font-extrabold text-foreground">Already use this on WhatsApp?</h2>
            <p className="mt-2 text-sm text-slate-600">Buy a new Safaricom or Airtel SIM, move your personal WhatsApp to it, then return and use the freed number as your public shop number.</p>
            <button type="button" onClick={() => setNumberHelpOpen(false)} className="mt-6 w-full rounded-xl bg-[#08b968] py-3.5 text-sm font-bold text-white">Got it — back to signup</button>
          </div>
        </div>
      )}
      {numberConflictOpen && (
        <div role="alertdialog" aria-modal="true" className="fixed inset-0 z-[110] flex items-end justify-center bg-black/40 p-0 md:items-center md:p-4">
          <div className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-2xl md:rounded-3xl">
            <h2 className="text-xl font-extrabold text-foreground">This number is already on WhatsApp.</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">Use a new number or open the guide to free this one.</p>
            <div className="mt-5 grid gap-3">
              <button type="button" onClick={() => { setNumberConflictOpen(false); setNumberHelpOpen(true); }} className="w-full rounded-xl bg-[#08b968] py-3.5 text-sm font-bold text-white">Yes, guide me</button>
              <button type="button" onClick={() => { setNumberConflictOpen(false); setForm({ ...form, pesaAiNumber: "" }); }} className="w-full rounded-xl border border-slate-200 py-3.5 text-sm font-semibold text-slate-700">I have another new number</button>
            </div>
          </div>
        </div>
      )}
    </PublicLayout>
  );
}
