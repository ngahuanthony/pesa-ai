import { useAuth, useUser } from "@clerk/react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { PublicLayout } from "@/components/layout";
import { MERCHANT_TYPES } from "@/constants/merchant-types";

type ShopForm = {
  businessName: string;
  merchantType: string;
  pesaAiNumber: string;
};

const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, "");
  const local = digits.startsWith("254") ? `0${digits.slice(3)}` : digits.startsWith("0") ? digits : digits ? `0${digits}` : "";
  const limited = local.slice(0, 10);
  return [limited.slice(0, 4), limited.slice(4, 7), limited.slice(7, 10)].filter(Boolean).join(" ");
};

function initialShopForm(): ShopForm {
  const initial = { businessName: "", merchantType: "retail", pesaAiNumber: "" };
  try {
    const saved = sessionStorage.getItem("pesa_setup_prefill");
    sessionStorage.removeItem("pesa_setup_prefill");
    if (!saved) return initial;
    const prefill = JSON.parse(saved);
    return {
      businessName: typeof prefill.businessName === "string" ? prefill.businessName : initial.businessName,
      merchantType: typeof prefill.merchantType === "string" ? prefill.merchantType : initial.merchantType,
      pesaAiNumber: typeof prefill.pesaAiNumber === "string" ? formatPhone(prefill.pesaAiNumber) : initial.pesaAiNumber,
    };
  } catch {
    sessionStorage.removeItem("pesa_setup_prefill");
    return initial;
  }
}

async function post(url: string, payload: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Something went wrong. Please try again.");
  return body;
}

export function OwnerSignupPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const [, setLocation] = useLocation();
  const [form, setForm] = useState<ShopForm>(initialShopForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const email = user?.primaryEmailAddress?.emailAddress || "";

  const createShop = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await post("/api/auth/owner-signup/start", {
        businessName: form.businessName.trim(),
        merchantType: form.merchantType,
        pesaAiNumber: form.pesaAiNumber,
      });
      setLocation("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create your shop.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PublicLayout>
      <main className="flex flex-1 items-center justify-center bg-[#f7faf8] px-4 py-10">
        <section className="w-full max-w-xl rounded-3xl border border-[#dcebe3] bg-white p-6 shadow-sm md:p-9">
          {!isLoaded ? (
            <div className="py-12 text-center text-sm text-slate-600">Checking your owner sign-in…</div>
          ) : !isSignedIn ? (
            <div className="py-8 text-center">
              <BrandHeading title="Create your Pesa SI shop" subtitle="Start with your verified email or Google account. No authenticator app is required." />
              <Link href="/sign-up" className="mt-7 block rounded-xl bg-[#0a4a3a] px-5 py-4 text-sm font-bold text-white">Continue with Google or verified email</Link>
              <p className="mt-5 text-sm text-slate-600">Already have an owner account? <Link href="/sign-in" className="font-semibold text-[#168447] underline">Sign in</Link></p>
              <p className="mt-5 text-xs leading-relaxed text-slate-500">Existing merchants can continue using their current login.</p>
            </div>
          ) : (
            <>
              <BrandHeading title="Set up your Pesa SI shop" subtitle={`Owner identity verified${email ? ` as ${email}` : ""}. Add the shop details and its public Duka number.`} />
              <form onSubmit={createShop} className="mt-7 space-y-5">
                <div>
                  <label className="text-sm font-semibold text-slate-800">Shop name</label>
                  <input value={form.businessName} onChange={(event) => setForm({ ...form, businessName: event.target.value })} maxLength={100} placeholder="Skyview Opal Hotel" className="mt-1 w-full rounded-xl border px-4 py-3.5 text-base" required />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-800">Business type</label>
                  <select value={form.merchantType} onChange={(event) => setForm({ ...form, merchantType: event.target.value })} className="mt-1 w-full rounded-xl border bg-white px-4 py-3.5 text-base" required>
                    {MERCHANT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-800">Public Duka number</label>
                  <input type="tel" inputMode="tel" autoComplete="tel" value={form.pesaAiNumber} onChange={(event) => setForm({ ...form, pesaAiNumber: formatPhone(event.target.value) })} placeholder="07XX XXX XXX" className="mt-1 w-full rounded-xl border px-4 py-3.5 text-base" required />
                  <p className="mt-2 text-xs leading-relaxed text-slate-600">This is the number customers will see. Meta must separately confirm this exact line as CONNECTED; it does not need to be on WhatsApp.</p>
                </div>
                <div className="rounded-2xl border border-[#cfe8d8] bg-[#f4fff7] p-4 text-sm leading-relaxed text-[#0a4a3a]">
                  Your verified email is enough to create your owner account. You can use the dashboard while Meta confirms this exact Duka number as CONNECTED. Customer chat and the public shop QR stay off until then.
                </div>
                {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                <button type="submit" disabled={busy} className="w-full rounded-xl bg-[#0a4a3a] py-4 text-sm font-bold text-white disabled:opacity-60">{busy ? "Creating your shop…" : "Create shop and go to dashboard"}</button>
              </form>
            </>
          )}
        </section>
      </main>
    </PublicLayout>
  );
}

function BrandHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
        <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" className="h-10 w-auto" />
      </div>
      <h1 className="text-2xl font-extrabold leading-tight text-[#0a4a3a] md:text-3xl">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{subtitle}</p>
    </div>
  );
}

export function OwnerLoginPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const [, setLocation] = useLocation();
  const [needsSignup, setNeedsSignup] = useState(false);
  const [error, setError] = useState("");
  const startedFor = useRef("");

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user?.id || startedFor.current === user.id) return;
    startedFor.current = user.id;
    let active = true;
    post("/api/auth/owner-login/start", {}).then((body) => {
      if (!active) return;
      if (body.needsSignup) setNeedsSignup(true);
      else setLocation("/dashboard");
    }).catch((err) => {
      if (active) setError(err instanceof Error ? err.message : "Could not start owner sign-in.");
    });
    return () => { active = false; };
  }, [isLoaded, isSignedIn, user?.id, setLocation]);

  return (
    <PublicLayout>
      <main className="flex flex-1 items-center justify-center bg-[#f7faf8] px-4 py-10">
        <section className="w-full max-w-md rounded-3xl border border-[#dcebe3] bg-white p-7 shadow-sm md:p-9">
          <BrandHeading title="Owner sign-in" subtitle="Sign in with your verified Google or email account. No separate authenticator is needed." />
          {!isLoaded ? <p className="mt-6 text-sm text-slate-600">Checking your sign-in…</p> : !isSignedIn ? (
            <div className="mt-6 space-y-4">
              <Link href="/sign-in" className="block rounded-xl bg-[#0a4a3a] px-5 py-4 text-center text-sm font-bold text-white">Continue with Google or verified email</Link>
              <p className="text-center text-sm text-slate-600">Existing merchants can use <Link href="/login" className="font-semibold text-[#168447] underline">their current login</Link>.</p>
            </div>
          ) : needsSignup ? (
            <div className="mt-6 rounded-2xl bg-[#f4fff7] p-4 text-sm leading-relaxed text-[#0a4a3a]">
              This owner identity is not linked to a Pesa SI shop yet. <Link href="/signup" className="font-bold underline">Create your shop</Link>.
            </div>
          ) : (
            <p role={error ? "alert" : "status"} className={`mt-6 rounded-xl p-4 text-sm ${error ? "bg-red-50 text-red-800" : "bg-slate-50 text-slate-600"}`}>
              {error || "Opening your dashboard…"}
            </p>
          )}
        </section>
      </main>
    </PublicLayout>
  );
}