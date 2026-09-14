import { useState } from "react";
import { Link } from "wouter";
import { PublicLayout } from "@/components/layout";
import { ShopDiscovery } from "@/components/shop-discovery";
import { SignupQRCard } from "@/components/signup-qr-card";

const plans = [
  { name: "Starter", price: 600, description: "A simple shop link that starts selling", features: ["Up to 100 products", "WhatsApp shop link", "Order notifications", "5-day free trial"], href: "/signup?plan=starter" },
  { name: "Business", price: 1000, description: "The full shop for growing vendors", features: ["Up to 1,000 products", "Voice and photo stock updates", "M-Pesa checkout", "Customer follow-up"], href: "/signup?plan=business", popular: true },
  { name: "Pro", price: 1500, description: "More control for busy catalogues", features: ["Unlimited products", "Multiple branches", "Staff accounts", "Priority support"], href: "/signup?plan=pro" },
];

function PhoneMockup() {
  return <div className="mx-auto w-full max-w-[310px] rounded-[2.5rem] bg-slate-900 p-2 shadow-2xl ring-1 ring-black/10"><div className="overflow-hidden rounded-[2rem] bg-[#efe7df]"><div className="flex items-center gap-3 bg-[#075e54] px-4 py-3 text-white"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-xs font-bold">DN</div><div><p className="text-sm font-semibold leading-none">Digital Nation Acc.</p><p className="mt-1 text-[11px] text-white/70">WhatsApp Shop</p></div></div><div className="space-y-3 p-4 text-xs"><div className="w-fit rounded-full bg-[#e9f8ed] px-2.5 py-1 text-[10px] font-medium text-[#0B6B3A]">✓ Verified Shop • Real photos • Stock live</div><div className="max-w-[85%] rounded-xl rounded-tl-none bg-white p-3 shadow-sm">Karibu Digital Nation Accessories 👋 What do you need today?</div><div className="ml-auto max-w-[88%] rounded-xl rounded-tr-none bg-[#dcf8c6] p-3 shadow-sm">Niaje! Mko na iPhone 16 Pro Max cover, charger na power bank?</div><div className="max-w-[88%] rounded-xl rounded-tl-none bg-white p-3 shadow-sm">Iko! Clear cover, 20W fast charger na 10,000mAh power bank. Unataka nikutumie options?</div><div className="rounded-xl border border-black/5 bg-white p-3 shadow-sm"><p className="font-semibold text-[#0a4a3a]">Popular picks today</p><div className="mt-2 space-y-2 text-slate-600"><div className="flex items-center justify-between gap-2"><span>📱 iPhone 16 Pro Max Cover</span><span className="font-semibold">KSh 800</span></div><div className="flex items-center justify-between gap-2"><span>⚡ 20W Fast Charger</span><span className="font-semibold">KSh 1,200</span></div><div className="flex items-center justify-between gap-2"><span>🔋 Power Bank 10,000mAh</span><span className="font-semibold">KSh 1,800</span></div></div><button className="mt-3 w-full rounded-lg bg-[#25D366] py-2 font-semibold text-white">Shop on WhatsApp</button></div><div className="max-w-[88%] rounded-xl rounded-tl-none bg-white p-3 shadow-sm"><p>✅ Order received! Asante sana. Tunatuma na rider. Pay on Paybill.</p><p className="mt-1 text-[10px] text-slate-400">✓✓ 10:42 AM</p></div></div></div></div>;
}

export default function LandingPage() {
  const [annual, setAnnual] = useState(false);
  return (
    <PublicLayout>
      <main className="min-h-screen bg-white text-[#0a4a3a]">
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-14 md:grid-cols-2 md:py-20">
          <div>
            <span className="rounded-full border border-[#25D366]/30 bg-[#f4fff7] px-3 py-1 text-xs font-medium">
              Not just another chat — a real shop that sells
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-[0.98] tracking-tight md:text-6xl">
              Your WhatsApp Shop sells while you sleep.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600">
              Create your shop in 15 seconds. Add stock by voice or photo, share one link, and receive orders on your personal WhatsApp. Your catalogue stays open 24/7.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="/signup" className="rounded-full bg-[#0a4a3a] px-7 py-3.5 text-sm font-bold text-white shadow-sm">
                Create Your WhatsApp Shop →
              </Link>
              <Link href="/login" className="rounded-full border border-[#0a4a3a]/20 px-6 py-3.5 text-sm font-semibold">
                Log in
              </Link>
            </div>
            <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold">
              <a href="#merchant-signup" className="text-[#168447] underline-offset-4 hover:underline">
                New merchant? Scan to sign up
              </a>
              <a href="#scan-shop" className="text-[#168447] underline-offset-4 hover:underline">
                Scan a shop QR
              </a>
              <a href="#find-shop" className="text-[#168447] underline-offset-4 hover:underline">
                Find a shop
              </a>
            </div>
            <p className="mt-3 text-xs text-slate-500">5-day free trial · No credit card · Money goes directly to your M-Pesa</p>
          </div>
          <PhoneMockup />
        </section>

        <section id="merchant-signup" className="bg-[#f7faf8] px-5 py-14">
          <div className="mx-auto grid max-w-6xl items-center gap-8 rounded-3xl border border-[#d9e8df] bg-white p-6 shadow-sm md:grid-cols-[1fr_auto] md:p-10">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#25a85a]">For new merchants</p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[#0a4a3a]">Start your WhatsApp Shop from your phone.</h2>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-600">
                Scan this QR code with your phone camera to open signup. Enter your shop name, add your new public Duka number, and keep your existing WhatsApp number private for order alerts.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Link href="/signup" className="rounded-full bg-[#0a4a3a] px-5 py-3 text-sm font-bold text-white">
                  Open signup directly →
                </Link>
                <span className="text-xs font-medium text-slate-500">No app download required</span>
              </div>
            </div>
            <SignupQRCard />
          </div>
        </section>

        <ShopDiscovery />

        <section id="features" className="bg-[#f7faf8] px-5 py-14">
          <div className="mx-auto max-w-6xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#25a85a]">How it works</p>
            <h2 className="mt-2 text-3xl font-extrabold">From stock to order without the busywork.</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border bg-white p-6">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0a4a3a] text-sm font-bold text-white">1</span>
                <h3 className="mt-4 font-bold">Create your shop</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">Choose your category and get a shareable WhatsApp shop link.</p>
              </div>
              <div className="rounded-2xl border bg-white p-6">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0a4a3a] text-sm font-bold text-white">2</span>
                <h3 className="mt-4 font-bold">Add stock in seconds</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">Say what came in, upload a photo, and keep your catalogue current.</p>
              </div>
              <div className="rounded-2xl border bg-white p-6">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0a4a3a] text-sm font-bold text-white">3</span>
                <h3 className="mt-4 font-bold">Share and sell</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">Customers browse, ask questions, and send orders through WhatsApp.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="about" className="bg-white px-5 py-16">
          <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-2 md:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#25a85a]">About Pesa AI</p>
              <h2 className="mt-2 text-3xl font-extrabold">Built for the way Kenyan shops actually sell.</h2>
            </div>
            <p className="text-base leading-relaxed text-slate-600">
              Pesa AI helps small businesses turn the WhatsApp conversations they already have into a simple, always-open shop. Your customers can ask, browse, and order while you keep control of your stock, payments, and personal WhatsApp.
            </p>
          </div>
        </section>

        <section id="contact" className="bg-[#f7faf8] px-5 py-14">
          <div className="mx-auto flex max-w-6xl flex-col justify-between gap-6 rounded-3xl border bg-white p-8 md:flex-row md:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#25a85a]">Need a hand?</p>
              <h2 className="mt-2 text-2xl font-extrabold">Talk to the WhatsApp Shop team.</h2>
              <p className="mt-2 text-sm text-slate-600">We can help you connect your new shop number and get your first products online.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <a href="tel:+254741387785" className="rounded-full border border-[#0a4a3a]/20 px-5 py-3 text-sm font-semibold">Call us on +254 741 387 785</a>
            </div>
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-6xl px-5 py-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#25a85a]">Simple pricing</p>
              <h2 className="mt-2 text-3xl font-extrabold">Start small. Grow when you are ready.</h2>
            </div>
            <button type="button" onClick={() => setAnnual(!annual)} className="rounded-full border px-4 py-2 text-xs font-semibold">
              {annual ? "Annual billing · 20% off" : "Switch to annual billing"}
            </button>
          </div>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {plans.map((plan) => {
              const price = annual ? Math.round(plan.price * 0.8) : plan.price;
              return (
                <div key={plan.name} className={plan.popular ? "relative rounded-2xl border border-[#25D366] p-6 shadow-lg" : "relative rounded-2xl border bg-white p-6"}>
                  {plan.popular && <span className="absolute -top-3 left-6 rounded-full bg-[#25D366] px-3 py-1 text-[11px] font-bold text-white">Most popular</span>}
                  <h3 className="text-lg font-bold">{plan.name}</h3>
                  <p className="mt-2 min-h-10 text-sm text-slate-500">{plan.description}</p>
                  <p className="mt-5 text-3xl font-extrabold">
                    KSh {price.toLocaleString()}<span className="text-sm font-normal text-slate-500"> / month</span>
                  </p>
                  <ul className="mt-5 space-y-2 text-sm text-slate-600">{plan.features.map((feature) => <li key={feature}>✓ {feature}</li>)}</ul>
                  <Link href={plan.href} className="mt-7 block rounded-full bg-[#0a4a3a] px-4 py-3 text-center text-sm font-bold text-white">Start free trial</Link>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </PublicLayout>
  );
}
