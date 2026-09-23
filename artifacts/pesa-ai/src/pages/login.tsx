import { PublicLayout } from "@/components/layout";
import { Link, useLocation } from "wouter";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";
import { useEffect, useState } from "react";
import { BRAND_NAME } from "@/constants/brand";

const maskPhone = (value: string) => value.length > 6 ? value.slice(0, 4) + "***" + value.slice(-3) : value;

type LoginMode = "password" | "whatsapp";
type OtpStep = "phone" | "otp";

export default function LoginPage() {
  const { me } = useAuthRedirect();
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<LoginMode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<OtpStep>("phone");
  const [serviceWindow, setServiceWindow] = useState<{ required: boolean; link: string; message: string }>({ required: false, link: "", message: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (me?.authenticated && !me?.isAdmin) setLocation("/dashboard");
    if (me?.isAdmin) setLocation("/admin");
  }, [me, setLocation]);

  const loginWithPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Email or password is incorrect");
      setLocation("/dashboard");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const requestOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ personalPhone: phone }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not send your code");
      setServiceWindow({ required: Boolean(body.serviceWindowRequired), link: body.whatsappLink || "", message: body.message || "" });
      setStep("otp");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ personalPhone: phone, code: otp }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "That code is not correct");
      setLocation("/dashboard");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (nextMode: LoginMode) => {
    setMode(nextMode);
    setError("");
    setStep("phone");
    setOtp("");
    setServiceWindow({ required: false, link: "", message: "" });
  };

  return (
    <PublicLayout>
      <div className="flex flex-1 items-center justify-center bg-[#f7faf8] px-4 py-12">
        <div className="w-full max-w-md rounded-3xl border bg-white p-8 shadow-sm">
           <h1 className="text-3xl font-extrabold text-foreground">Log in to {BRAND_NAME}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === "password" ? "Use your existing account email and password." : "Receive a one-time code on your personal WhatsApp."}
          </p>

          <div className="mt-6 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
            <button type="button" onClick={() => switchMode("password")} className={`rounded-lg px-3 py-2 text-sm font-semibold ${mode === "password" ? "bg-white text-[#0a4a3a] shadow-sm" : "text-slate-500"}`}>Email & password</button>
            <button type="button" onClick={() => switchMode("whatsapp")} className={`rounded-lg px-3 py-2 text-sm font-semibold ${mode === "whatsapp" ? "bg-white text-[#0a4a3a] shadow-sm" : "text-slate-500"}`}>WhatsApp code</button>
          </div>

          {mode === "password" ? (
            <form onSubmit={loginWithPassword} className="mt-7 space-y-5">
              <div>
                <label className="text-sm font-semibold">Email address</label>
                <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className="mt-1 w-full rounded-xl border px-4 py-3.5 text-base" required />
              </div>
              <div>
                <label className="text-sm font-semibold">Password</label>
                <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your password" className="mt-1 w-full rounded-xl border px-4 py-3.5 text-base" required />
              </div>
              {error && <div className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
              <button type="submit" disabled={busy} className="w-full rounded-xl bg-[#0a4a3a] py-3.5 text-sm font-bold text-white disabled:opacity-60">{busy ? "Logging in…" : "Log in"}</button>
            </form>
          ) : step === "phone" ? (
            <form onSubmit={requestOtp} className="mt-7 space-y-5">
              <div>
                <label className="text-sm font-semibold">Your Personal WhatsApp</label>
                <input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="07XX XX XX XX" className="mt-1 w-full rounded-xl border px-4 py-3.5 text-base" required />
              </div>
              {error && <div className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
              <button type="submit" disabled={busy} className="w-full rounded-xl bg-[#0a4a3a] py-3.5 text-sm font-bold text-white disabled:opacity-60">{busy ? "Sending code…" : "Send me a code"}</button>
               <p className="text-xs text-slate-500">WhatsApp code delivery depends on Meta approving the {BRAND_NAME} authentication template.</p>
            </form>
          ) : (
            <form onSubmit={verifyOtp} className="mt-7 space-y-5">
              {serviceWindow.required ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
                  <p>{serviceWindow.message}</p>
                  <a href={serviceWindow.link} target="_blank" rel="noreferrer" className="mt-3 block rounded-xl bg-[#25D366] px-4 py-3 text-center font-bold text-white">Open WhatsApp and send LOGIN</a>
                  <p className="mt-3 text-xs text-emerald-800">Return here after the code arrives.</p>
                </div>
              ) : (
                <p className="text-sm text-slate-600">Enter the six-digit code sent to {maskPhone(phone)}.</p>
              )}
              <input inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" className="w-full rounded-xl border px-4 py-3.5 text-center text-2xl tracking-[0.5em]" required />
              {error && <div className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
              <button type="submit" disabled={busy || otp.length !== 6} className="w-full rounded-xl bg-[#0a4a3a] py-3.5 text-sm font-bold text-white disabled:opacity-60">{busy ? "Checking code…" : "Log in"}</button>
              <button type="button" onClick={() => { setStep("phone"); setOtp(""); setError(""); setServiceWindow({ required: false, link: "", message: "" }); }} className="w-full text-sm font-semibold text-primary underline">Use a different number</button>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-muted-foreground">New here? <Link href="/signup" className="font-semibold text-primary underline">Create your shop</Link></p>
        </div>
      </div>
    </PublicLayout>
  );
}
