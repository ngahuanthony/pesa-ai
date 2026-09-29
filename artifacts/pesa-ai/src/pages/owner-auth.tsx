import { useAuth, useUser } from "@clerk/react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import { Link, useLocation } from "wouter";
import { PublicLayout } from "@/components/layout";
import { MERCHANT_TYPES } from "@/constants/merchant-types";

type ShopForm = {
  businessName: string;
  merchantType: string;
  pesaAiNumber: string;
};

type OwnerSetup = {
  pendingSignupId: string;
  provisioningUri: string;
  secret: string;
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
  const [step, setStep] = useState<"details" | "authenticator" | "recovery">("details");
  const [setup, setSetup] = useState<OwnerSetup | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [activation, setActivation] = useState<"active" | "waiting_for_meta">("waiting_for_meta");
  const [savedRecoveryCodes, setSavedRecoveryCodes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const email = user?.primaryEmailAddress?.emailAddress || "";

  useEffect(() => {
    if (!setup?.provisioningUri) return;
    let active = true;
    QRCode.toDataURL(setup.provisioningUri, {
      width: 220,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#0a4a3a", light: "#ffffff" },
    }).then((url) => { if (active) setQrDataUrl(url); })
      .catch(() => { if (active) setError("The authenticator QR code could not be generated. Use the setup key below instead."); });
    return () => { active = false; };
  }, [setup]);

  useEffect(() => {
    if (step !== "recovery" || !setup?.pendingSignupId || activation === "active") return;
    let active = true;
    let checking = false;
    const checkMeta = async () => {
      if (checking) return;
      checking = true;
      try {
        const response = await fetch(`/api/auth/pending-signups/${encodeURIComponent(setup.pendingSignupId)}`, { credentials: "include" });
        if (!response.ok) return;
        const status = await response.json();
        if (active && status.ownerSecurityVerified === true && status.metaVerified === true) {
          setActivation("active");
        }
      } catch {
        // Keep the shop in the inactive state if a status check cannot complete.
      } finally {
        checking = false;
      }
    };
    checkMeta();
    const timer = window.setInterval(checkMeta, 10000);
    return () => { active = false; window.clearInterval(timer); };
  }, [activation, setup, step]);

  const startSetup = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const body = await post("/api/auth/owner-signup/start", {
        businessName: form.businessName.trim(),
        merchantType: form.merchantType,
        pesaAiNumber: form.pesaAiNumber,
      });
      const uri = new URL(body.provisioningUri);
      setSetup({
        pendingSignupId: body.pendingSignupId,
        provisioningUri: body.provisioningUri,
        secret: uri.searchParams.get("secret") || "",
      });
      setStep("authenticator");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start secure owner setup.");
    } finally {
      setBusy(false);
    }
  };

  const verifyAuthenticator = async (event: FormEvent) => {
    event.preventDefault();
    if (!setup) return;
    setError("");
    setBusy(true);
    try {
      const body = await post("/api/auth/owner-signup/verify", {
        pendingSignupId: setup.pendingSignupId,
        code: code.trim(),
      });
      setRecoveryCodes(body.recoveryCodes || []);
      setActivation(body.activation === "active" ? "active" : "waiting_for_meta");
      setStep("recovery");
    } catch (err) {
      setError(err instanceof Error ? err.message : "That authenticator code could not be verified.");
    } finally {
      setBusy(false);
    }
  };

  const copyRecoveryCodes = async () => {
    try {
      await navigator.clipboard.writeText(recoveryCodes.join("\n"));
      setNotice("Recovery codes copied. Store them somewhere private and separate from your phone.");
    } catch {
      setNotice("Select and copy the recovery codes below, then store them somewhere private.");
    }
  };

  const downloadRecoveryCodes = () => {
    const file = new Blob([`Pesa SI recovery codes\nKeep these codes private. Each code works once.\n\n${recoveryCodes.join("\n")}\n`], { type: "text/plain" });
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "pesa-si-recovery-codes.txt";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const finish = () => setLocation("/dashboard");

  return (
    <PublicLayout>
      <main className="flex flex-1 items-center justify-center bg-[#f7faf8] px-4 py-10">
        <section className="w-full max-w-xl rounded-3xl border border-[#dcebe3] bg-white p-6 shadow-sm md:p-9">
          {!isLoaded ? (
            <div className="py-12 text-center text-sm text-slate-600">Checking your owner sign-in…</div>
          ) : !isSignedIn ? (
            <div className="py-8 text-center">
              <BrandHeading title="Create your Pesa SI shop" subtitle="Start with a verified owner identity, then secure it with an authenticator app." />
              <Link href="/sign-up" className="mt-7 block rounded-xl bg-[#0a4a3a] px-5 py-4 text-sm font-bold text-white">Continue with Google or verified email</Link>
              <p className="mt-5 text-sm text-slate-600">Already have an owner account? <Link href="/sign-in" className="font-semibold text-[#168447] underline">Sign in</Link></p>
              <p className="mt-5 text-xs leading-relaxed text-slate-500">Existing merchants can continue using their current WhatsApp or email-and-password login.</p>
            </div>
          ) : step === "details" ? (
            <>
              <BrandHeading title="Set up your Pesa SI shop" subtitle={`Owner identity verified${email ? ` as ${email}` : ""}. Add the shop details and its public Duka number.`} />
              <form onSubmit={startSetup} className="mt-7 space-y-5">
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
                  Your owner email proves your identity. An authenticator app is a separate required sign-in factor. Customer chat and public shop menus stay off until Meta confirms this Duka line.
                </div>
                {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                <button type="submit" disabled={busy} className="w-full rounded-xl bg-[#0a4a3a] py-4 text-sm font-bold text-white disabled:opacity-60">{busy ? "Preparing secure setup…" : "Continue to authenticator setup"}</button>
              </form>
            </>
          ) : step === "authenticator" && setup ? (
            <>
              <BrandHeading title="Add your authenticator app" subtitle="Scan the QR code in an authenticator app, then enter its current six-digit code to finish setup." />
              <div className="mt-6 grid gap-5 sm:grid-cols-[220px_1fr] sm:items-center">
                <div className="flex min-h-[220px] items-center justify-center rounded-2xl border bg-white p-3">
                  {qrDataUrl ? <img src={qrDataUrl} alt="Authenticator setup QR code" className="h-[220px] w-[220px]" /> : <span className="text-sm text-slate-500">Preparing QR code…</span>}
                </div>
                <div className="text-sm leading-relaxed text-slate-600">
                  <p className="font-bold text-slate-800">Can’t scan it?</p>
                  <p className="mt-1">Enter this setup key manually in your authenticator app:</p>
                  <code className="mt-3 block break-all rounded-xl bg-slate-100 p-3 font-mono text-xs text-slate-900">{setup.secret}</code>
                  <p className="mt-3 text-xs">Keep this key private. Anyone with it can generate your sign-in codes.</p>
                </div>
              </div>
              <form onSubmit={verifyAuthenticator} className="mt-6 space-y-4">
                <label className="block text-sm font-semibold text-slate-800" htmlFor="owner-totp-code">Authenticator code</label>
                <input id="owner-totp-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" className="w-full rounded-xl border px-4 py-3.5 text-center text-2xl tracking-[0.5em]" required />
                {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                <button type="submit" disabled={busy || code.length !== 6} className="w-full rounded-xl bg-[#0a4a3a] py-4 text-sm font-bold text-white disabled:opacity-60">{busy ? "Verifying…" : "Verify and secure my shop"}</button>
              </form>
            </>
          ) : (
            <>
              <BrandHeading title="Save your recovery codes" subtitle="These codes are shown once. Each can replace your authenticator code one time if you lose access to your device." />
              <div className={`mt-5 rounded-2xl border p-4 text-sm ${activation === "active" ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-amber-200 bg-amber-50 text-amber-950"}`}>
                {activation === "active"
                  ? "Owner security and Meta verification are complete. Customer messaging and the public shop can activate."
                  : "Owner security is complete. Your dashboard is available, but customer chats and public shop menus remain inactive until Meta confirms this exact Duka number as CONNECTED."}
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl border bg-slate-50 p-4 font-mono text-sm">
                {recoveryCodes.map((recoveryCode) => <code key={recoveryCode} className="rounded-lg bg-white px-2 py-2 text-center text-slate-900">{recoveryCode}</code>)}
              </div>
              {notice && <p role="status" className="mt-3 text-sm text-[#168447]">{notice}</p>}
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <button type="button" onClick={copyRecoveryCodes} className="flex-1 rounded-xl border border-[#0a4a3a]/20 px-4 py-3 text-sm font-bold text-[#0a4a3a]">Copy recovery codes</button>
                <button type="button" onClick={downloadRecoveryCodes} className="flex-1 rounded-xl border border-[#0a4a3a]/20 px-4 py-3 text-sm font-bold text-[#0a4a3a]">Download recovery codes</button>
              </div>
              <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl bg-[#f4fff7] p-4 text-sm leading-relaxed text-[#0a4a3a]">
                <input type="checkbox" checked={savedRecoveryCodes} onChange={(event) => setSavedRecoveryCodes(event.target.checked)} className="mt-0.5 accent-[#0a4a3a]" />
                <span>I have saved these recovery codes somewhere private.</span>
              </label>
              <button type="button" onClick={finish} disabled={!savedRecoveryCodes} className="mt-4 w-full rounded-xl bg-[#0a4a3a] py-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">Continue to my dashboard</button>
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
  const [challengeId, setChallengeId] = useState("");
  const [needsSignup, setNeedsSignup] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const startedFor = useRef("");

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user?.id || startedFor.current === user.id) return;
    startedFor.current = user.id;
    let active = true;
    post("/api/auth/owner-login/start", {}).then((body) => {
      if (!active) return;
      if (body.needsSignup) setNeedsSignup(true);
      else setChallengeId(body.challengeId || "");
    }).catch((err) => {
      if (active) setError(err instanceof Error ? err.message : "Could not start owner sign-in.");
    });
    return () => { active = false; };
  }, [isLoaded, isSignedIn, user?.id]);

  const verify = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await post("/api/auth/owner-login/verify", { challengeId, code: code.trim() });
      setLocation("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code could not be verified.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PublicLayout>
      <main className="flex flex-1 items-center justify-center bg-[#f7faf8] px-4 py-10">
        <section className="w-full max-w-md rounded-3xl border border-[#dcebe3] bg-white p-7 shadow-sm md:p-9">
          <BrandHeading title="Owner sign-in" subtitle="Sign in with your verified Google or email identity, then confirm it’s you with your authenticator app." />
          {!isLoaded ? <p className="mt-6 text-sm text-slate-600">Checking your sign-in…</p> : !isSignedIn ? (
            <div className="mt-6 space-y-4">
              <Link href="/sign-in" className="block rounded-xl bg-[#0a4a3a] px-5 py-4 text-center text-sm font-bold text-white">Continue with Google or verified email</Link>
              <p className="text-center text-sm text-slate-600">Existing merchants can use <Link href="/login" className="font-semibold text-[#168447] underline">their current login</Link>.</p>
            </div>
          ) : needsSignup ? (
            <div className="mt-6 rounded-2xl bg-[#f4fff7] p-4 text-sm leading-relaxed text-[#0a4a3a]">
              This owner identity is not linked to a Pesa SI shop yet. <Link href="/signup" className="font-bold underline">Create your shop</Link>.
            </div>
          ) : challengeId ? (
            <form onSubmit={verify} className="mt-6 space-y-4">
              <p className="text-sm text-slate-600">Enter the current code from your authenticator app, or use one saved recovery code.</p>
              <input autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} placeholder="Authenticator or recovery code" className="w-full rounded-xl border px-4 py-3.5 text-base" required />
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <button type="submit" disabled={busy || !code.trim()} className="w-full rounded-xl bg-[#0a4a3a] py-4 text-sm font-bold text-white disabled:opacity-60">{busy ? "Verifying…" : "Verify and sign in"}</button>
              <p className="text-xs leading-relaxed text-slate-500">Each recovery code works once. Keep the remaining codes stored securely.</p>
            </form>
          ) : (
            <p role={error ? "alert" : "status"} className={`mt-6 rounded-xl p-4 text-sm ${error ? "bg-red-50 text-red-800" : "bg-slate-50 text-slate-600"}`}>
              {error || "Preparing your authenticator challenge…"}
            </p>
          )}
        </section>
      </main>
    </PublicLayout>
  );
}