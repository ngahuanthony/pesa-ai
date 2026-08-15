import { PublicLayout } from "@/components/layout";
import {
  CheckCircle2, MessageSquare, Zap, ArrowRight, Package,
  Phone, Check, Minus, ShoppingBag, Video, Sparkles, ScanLine,
} from "lucide-react";
import { Link } from "wouter";

// ── Pricing data ──────────────────────────────────────────────────────────────
const plans = [
  {
    name: "Starter",
    tagline: "Get your business online",
    price: "KSh 2,000",
    popular: false,
    features: [
      "WhatsApp AI salesperson",
      "Up to 100 products",
      "10 inventory scans / month",
      "M-Pesa integration",
      "Order tracking",
      "1 staff account",
    ],
    cta: "Get started free",
    href: "/signup?plan=Starter",
  },
  {
    name: "Business",
    tagline: "Automate your inventory",
    price: "KSh 3,500",
    popular: true,
    features: [
      "Everything in Starter",
      "Up to 1,000 products",
      "40 inventory scans / month",
      "Offers & promotions",
      "Customer follow-up",
      "3 staff accounts",
    ],
    cta: "Start free trial",
    href: "/signup?plan=Business",
  },
  {
    name: "Pro",
    tagline: "Large, constantly changing catalogue",
    price: "KSh 6,000",
    popular: false,
    features: [
      "Everything in Business",
      "Unlimited products",
      "100 inventory scans / month",
      "Multiple branches",
      "10+ staff accounts",
      "Priority support",
    ],
    cta: "Get started",
    href: "/signup?plan=Pro",
  },
];

type TableRow = { label: string; starter: string | boolean; business: string | boolean; pro: string | boolean };
const tableRows: TableRow[] = [
  { label: "Monthly price",           starter: "KSh 2,000", business: "KSh 3,500", pro: "KSh 6,000" },
  { label: "Products",                starter: "100",       business: "1,000",      pro: "Unlimited" },
  { label: "Inventory scans / month", starter: "10",        business: "40",         pro: "100" },
  { label: "Staff accounts",          starter: "1",         business: "3",          pro: "10+" },
  { label: "AI salesperson",          starter: true,        business: true,         pro: true },
  { label: "M-Pesa integration",      starter: true,        business: true,         pro: true },
  { label: "Offers & promotions",     starter: false,       business: true,         pro: true },
  { label: "Automated campaigns",     starter: false,       business: false,        pro: true },
  { label: "Multiple branches",       starter: false,       business: false,        pro: true },
];

function CellVal({ val, highlight }: { val: string | boolean; highlight?: boolean }) {
  if (val === true)  return <Check  className={`h-4 w-4 mx-auto ${highlight ? "text-green-400" : "text-green-500"}`} />;
  if (val === false) return <Minus  className="h-4 w-4 mx-auto text-white/20" />;
  return <span className={`text-sm ${highlight ? "text-green-400 font-semibold" : ""}`}>{val}</span>;
}

// ── Phone mockup ──────────────────────────────────────────────────────────────
function PhoneMockup() {
  return (
    <div className="relative mx-auto w-[280px]">
      {/* Glow */}
      <div className="absolute inset-0 rounded-[2.5rem] bg-green-500/20 blur-3xl scale-110 -z-10" />

      {/* Frame */}
      <div className="relative rounded-[2.5rem] bg-[#111827] p-2 shadow-2xl ring-1 ring-white/10">
        <div className="rounded-[2rem] overflow-hidden bg-[#e5ddd5] min-h-[480px] flex flex-col">
          {/* WA header */}
          <div className="bg-[#075e54] px-4 py-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white font-bold text-sm flex-shrink-0">DN</div>
            <div>
              <p className="text-white font-semibold text-sm leading-none">Digital Nation Acc.</p>
              <p className="text-white/70 text-[11px] mt-0.5">AI · replies instantly</p>
            </div>
            {/* Live dot */}
            <div className="ml-auto flex items-center gap-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
              </span>
            </div>
          </div>

          {/* Chat */}
          <div className="flex-1 px-3 py-4 space-y-3">
            <div className="flex justify-start">
              <div className="bg-white rounded-2xl rounded-tl-sm px-3 py-2 max-w-[75%] shadow-sm">
                <p className="text-[12px] text-gray-800">Do you have the red shoes in size 39?</p>
                <p className="text-[9px] text-gray-400 mt-0.5 text-right">10:41</p>
              </div>
            </div>
            <div className="flex justify-end">
              <div className="bg-[#dcf8c6] rounded-2xl rounded-tr-sm px-3 py-2 max-w-[78%] shadow-sm">
                <p className="text-[12px] text-gray-800">Yes! KSh 3,500. Want me to pack them?</p>
                <p className="text-[9px] text-gray-400 mt-0.5 text-right">10:41 ✓✓</p>
              </div>
            </div>
            <div className="flex justify-start">
              <div className="bg-white rounded-2xl rounded-tl-sm px-3 py-2 max-w-[75%] shadow-sm">
                <p className="text-[12px] text-gray-800">Yes please, how do I pay?</p>
                <p className="text-[9px] text-gray-400 mt-0.5 text-right">10:42</p>
              </div>
            </div>
            <div className="flex justify-end">
              <div className="bg-[#dcf8c6] rounded-2xl rounded-tr-sm px-3 py-2 max-w-[78%] shadow-sm">
                <p className="text-[12px] text-gray-800">Send KSh 3,500 to Till 522522 — I'll confirm immediately.</p>
                <div className="mt-2 bg-white rounded-xl px-2 py-1.5 flex items-center gap-2 border border-gray-100">
                  <div className="h-6 w-6 rounded-full bg-green-600 flex items-center justify-center flex-shrink-0">
                    <span className="text-[8px] text-white font-bold">M</span>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-gray-800">M-Pesa Express</p>
                    <p className="text-[9px] text-gray-400">Till: 522522</p>
                  </div>
                </div>
                <p className="text-[9px] text-gray-400 mt-1 text-right">10:42 ✓✓</p>
              </div>
            </div>
          </div>

          {/* Input bar */}
          <div className="bg-[#f0f0f0] px-3 py-2 flex items-center gap-2">
            <div className="flex-1 bg-white rounded-full px-3 py-1.5">
              <span className="text-[11px] text-gray-400">Message</span>
            </div>
          </div>
        </div>
      </div>

      {/* Floating badges */}
      <div className="absolute -right-6 top-1/4 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl shadow-lg px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
          </span>
          <p className="text-[11px] font-semibold text-white">AI Online</p>
        </div>
        <p className="text-[10px] text-green-400 mt-0.5">0s response time</p>
      </div>

      <div className="absolute -left-8 bottom-28 bg-white rounded-xl shadow-xl px-3 py-2 flex items-center gap-2">
        <div className="h-7 w-7 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
          <Check className="h-3.5 w-3.5 text-green-600" />
        </div>
        <div>
          <p className="text-[11px] font-semibold text-gray-800">Payment Confirmed</p>
          <p className="text-[10px] text-green-600 font-medium">+ KSh 3,500</p>
        </div>
      </div>
    </div>
  );
}

// ── Landing page ──────────────────────────────────────────────────────────────
export default function LandingPage() {
  return (
    <PublicLayout>

      {/* ── HERO — dark, dramatic ─────────────────────────────────── */}
      <section className="relative w-full min-h-[92vh] flex items-center bg-gradient-to-br from-[#030d08] via-[#071a10] to-[#030d08] overflow-hidden">
        {/* Background grid */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(34,197,94,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(34,197,94,0.04)_1px,transparent_1px)] bg-[size:60px_60px]" />
        {/* Radial glow centre */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-green-500/5 blur-3xl pointer-events-none" />

        <div className="relative container px-4 md:px-6 mx-auto max-w-6xl py-20">
          <div className="grid gap-12 lg:grid-cols-2 items-center">

            {/* Left */}
            <div className="flex flex-col gap-7">
              {/* Live badge */}
              <div className="inline-flex items-center gap-2 rounded-full border border-green-500/30 bg-green-500/10 px-4 py-1.5 text-sm font-medium text-green-400 w-fit">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
                </span>
                Built for Kenyan businesses
              </div>

              {/* Headline */}
              <div>
                <h1 className="text-5xl font-extrabold tracking-tight leading-[1.1] sm:text-6xl xl:text-7xl text-white">
                  Your WhatsApp<br />shop —
                </h1>
                <h1 className="text-5xl font-extrabold tracking-tight leading-[1.1] sm:text-6xl xl:text-7xl mt-1">
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-300">
                    running itself.
                  </span>
                </h1>
              </div>

              <p className="max-w-[460px] text-base text-white/60 md:text-lg leading-relaxed">
                Customers text. The AI answers, takes orders, and collects M-Pesa — 24/7. No staff needed.
              </p>

              {/* Single CTA */}
              <div className="flex flex-col gap-3 min-[400px]:flex-row items-start">
                <Link
                  href="/signup"
                  className="inline-flex h-13 items-center justify-center rounded-full bg-green-500 px-8 text-base font-bold text-white shadow-lg shadow-green-500/25 transition-all hover:bg-green-400 hover:shadow-green-400/30 gap-2"
                  data-testid="button-get-started"
                >
                  Start free — 2 minutes <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              {/* Social proof */}
              <div className="flex items-center gap-3">
                <div className="flex -space-x-2">
                  {["A","M","J","K"].map((l) => (
                    <span key={l} className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-green-500/20 border border-green-500/30 text-[11px] font-bold text-green-400 ring-2 ring-[#071a10]">{l}</span>
                  ))}
                </div>
                <p className="text-sm text-white/40">500+ Kenyan shops already live</p>
              </div>
            </div>

            {/* Right: phone */}
            <div className="flex justify-center lg:justify-end">
              <PhoneMockup />
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS BAR ────────────────────────────────────────────── */}
      <div className="w-full bg-[#071a10] border-y border-white/5">
        <div className="container mx-auto max-w-4xl px-4 py-5 grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
          {[
            { val: "24/7",  label: "Always on" },
            { val: "0s",    label: "Response time" },
            { val: "5 min", label: "Setup time" },
            { val: "100%",  label: "M-Pesa goes to you" },
          ].map(({ val, label }) => (
            <div key={label}>
              <p className="text-2xl font-extrabold text-green-400">{val}</p>
              <p className="text-xs text-white/40 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── FEATURES — glassmorphism cards ───────────────────────── */}
      <section id="features" className="w-full py-20 md:py-24 bg-[#050f09]">
        <div className="container px-4 md:px-6 mx-auto max-w-6xl">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-white sm:text-4xl">One shop. Three superpowers.</h2>
            <p className="text-white/50 mt-3 max-w-md mx-auto">Everything your business needs to sell around the clock — built in.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {[
              {
                Icon: MessageSquare,
                title: "24/7 AI Salesperson",
                desc: "Never miss a sale. The AI handles every enquiry instantly, in your brand's voice — while you sleep.",
                accent: "from-blue-500/20 to-blue-500/5",
                iconBg: "bg-blue-500/15 text-blue-400",
              },
              {
                Icon: ShoppingBag,
                title: "Smart Order Taking",
                desc: "It knows your stock, calculates totals, collects delivery addresses, and places orders without you touching your phone.",
                accent: "from-purple-500/20 to-purple-500/5",
                iconBg: "bg-purple-500/15 text-purple-400",
              },
              {
                Icon: CheckCircle2,
                title: "M-Pesa Auto-Confirm",
                desc: "Customer pays. AI detects it. Order confirmed. No manual M-Pesa verification — ever again.",
                accent: "from-green-500/20 to-green-500/5",
                iconBg: "bg-green-500/15 text-green-400",
              },
            ].map(({ Icon, title, desc, accent, iconBg }) => (
              <div key={title} className={`relative rounded-2xl border border-white/8 bg-gradient-to-br ${accent} p-7 overflow-hidden`}>
                <div className="absolute inset-0 bg-white/[0.02]" />
                <div className="relative">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${iconBg} mb-5`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-bold text-white mb-2">{title}</h3>
                  <p className="text-white/55 text-sm leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── VIDEO SCAN — the hero feature ────────────────────────── */}
      <section className="w-full py-20 md:py-28 bg-[#0d3d26] overflow-hidden">
        <div className="container px-4 md:px-6 mx-auto max-w-5xl">
          {/* Header */}
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 rounded-full border border-green-400/30 bg-green-400/10 px-4 py-1.5 text-sm font-semibold text-green-300 mb-6">
              <Video className="h-3.5 w-3.5" /> AI Inventory Scanning — New
            </div>
            <h2 className="text-4xl font-extrabold text-white sm:text-5xl leading-tight">
              Walk your shop once.<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-300 to-emerald-200">
                Your catalogue builds itself.
              </span>
            </h2>
            <p className="text-white/60 text-base mt-5 max-w-lg mx-auto leading-relaxed">
              Record a 60-second video. Our AI reads every product, price tag, and label — and adds them to your shop automatically.
            </p>
            <Link
              href="/signup"
              className="mt-8 inline-flex h-12 items-center justify-center rounded-full bg-green-400 text-[#0d3d26] px-8 text-sm font-bold hover:bg-green-300 transition-all gap-2 shadow-lg shadow-green-900/50"
            >
              <Sparkles className="h-4 w-4" /> Try your first scan free
            </Link>
            <p className="text-white/30 text-xs mt-3">No credit card · Takes 2 minutes</p>
          </div>

          {/* Three steps */}
          <div className="grid md:grid-cols-3 gap-4 mb-8">
            {[
              { icon: Video,    n: "1", title: "Record",               desc: "Walk your shelves. 30–60 seconds is enough.",                             color: "bg-blue-500/20 text-blue-300" },
              { icon: Sparkles, n: "2", title: "AI reads everything",  desc: "Every product name, price, and quantity — detected automatically.",         color: "bg-yellow-400/20 text-yellow-300" },
              { icon: ScanLine, n: "3", title: "Catalogue ready",      desc: "Review, edit if needed, publish — your shop knows your full stock.",        color: "bg-green-400/20 text-green-300" },
            ].map(({ icon: Icon, n, title, desc, color }) => (
              <div key={n} className="rounded-2xl bg-white/[0.06] border border-white/10 px-5 py-5 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${color} flex-shrink-0`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-white/25 uppercase tracking-widest">Step {n}</span>
                    <p className="text-sm font-bold text-white leading-none mt-0.5">{title}</p>
                  </div>
                </div>
                <p className="text-sm text-white/55 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>

          {/* After the free scan — upgrade clarity */}
          <div className="rounded-2xl bg-white/[0.05] border border-white/10 px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center gap-5">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white mb-1">After your free scan</p>
              <p className="text-sm text-white/50">Choose a plan that fits your shop. No auto-charges — you decide when to upgrade.</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-semibold flex-shrink-0">
              <span className="rounded-full bg-white/8 border border-white/10 px-4 py-2 text-white/60">Starter · 10/mo</span>
              <span className="rounded-full bg-green-500/20 border border-green-500/30 px-4 py-2 text-green-300">Business · 40/mo</span>
              <span className="rounded-full bg-white/8 border border-white/10 px-4 py-2 text-white/60">Pro · 100/mo</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────── */}
      <section className="w-full py-20 bg-[#050f09]">
        <div className="container px-4 md:px-6 mx-auto max-w-4xl">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-white sm:text-4xl">Up in three steps</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { n: "01", title: "Build your catalogue",    desc: "Add products manually or record a 60-second video scan — AI does the rest.",       col: "text-blue-400" },
              { n: "02", title: "Connect WhatsApp",        desc: "Link your business number. Your AI starts chatting with customers immediately.",    col: "text-purple-400" },
              { n: "03", title: "Sales on autopilot",      desc: "Orders placed, M-Pesa collected, stock updated — without you lifting a finger.",   col: "text-green-400" },
            ].map(({ n, title, desc, col }) => (
              <div key={n} className="flex flex-col items-center text-center gap-4">
                <div className={`text-4xl font-extrabold ${col} opacity-60`}>{n}</div>
                <h3 className="text-base font-bold text-white">{title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ─────────────────────────────────────────── */}
      <section className="w-full py-20 bg-[#030d08]">
        <div className="container px-4 md:px-6 mx-auto max-w-6xl">
          <h2 className="text-2xl font-bold text-white text-center mb-10">Trusted by the street</h2>
          <div className="grid md:grid-cols-3 gap-5">
            {[
              { quote: "Since I added Pesa AI, I don't lose customers who text me at 11 PM. I wake up, pack the orders, and dispatch. It's magic.", name: "Grace Mutuku", role: "Boutique Owner, Toi Market", initials: "GM" },
              { quote: "Verifying M-Pesa messages manually was stressful. Now the AI checks the payment and confirms the order before I even look at my phone.", name: "Kevin Omondi", role: "Electronics Dealer, Luthuli Ave", initials: "KO" },
              { quote: "Customers like it because it replies instantly. I like it because it forces them to pay upfront before marking as confirmed.", name: "Fatuma Ali", role: "Food Delivery, Eastleigh", initials: "FA" },
            ].map(({ quote, name, role, initials }) => (
              <div key={name} className="flex flex-col rounded-2xl border border-white/8 bg-white/[0.03] p-6 gap-4">
                <p className="text-white/60 text-sm leading-relaxed italic flex-1">"{quote}"</p>
                <div className="flex items-center gap-3 pt-2 border-t border-white/8">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-500/15 text-green-400 font-bold text-sm flex-shrink-0">{initials}</div>
                  <div>
                    <p className="text-sm font-semibold text-white">{name}</p>
                    <p className="text-xs text-white/40">{role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ──────────────────────────────────────────────── */}
      <section id="pricing" className="w-full py-20 md:py-24 bg-[#050f09]">
        <div className="container px-4 md:px-6 mx-auto max-w-5xl">
          <div className="text-center mb-4">
            <h2 className="text-3xl font-bold text-white sm:text-4xl">Grow at your own pace</h2>
            <p className="text-white/50 mt-2 max-w-lg mx-auto">
              Start free. Upgrade when you're ready. Video scan quotas scale with your plan — priced on real usage, not arbitrary limits.
            </p>
            <p className="text-white/30 text-sm mt-2">5-day free trial · No credit card · WhatsApp usage billed separately by Meta</p>
          </div>

          {/* Cards */}
          <div className="grid md:grid-cols-3 gap-5 mt-10">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`relative flex flex-col rounded-2xl p-7 ${
                  plan.popular
                    ? "bg-green-500/10 border-2 border-green-500/50 shadow-xl shadow-green-900/20"
                    : "bg-white/[0.04] border border-white/10"
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-green-500 text-white px-4 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider">
                    MOST POPULAR
                  </div>
                )}
                <h3 className="text-base font-bold text-white">{plan.name}</h3>
                <p className="text-xs text-white/40 mt-0.5">{plan.tagline}</p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className={`text-4xl font-extrabold ${plan.popular ? "text-green-400" : "text-white"}`}>{plan.price}</span>
                  <span className="text-sm text-white/40">/month</span>
                </div>
                <ul className="my-6 space-y-2.5 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className={`h-4 w-4 flex-shrink-0 ${plan.popular ? "text-green-400" : "text-white/40"}`} />
                      <span className="text-white/75">{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.href}
                  className={`w-full inline-flex h-11 items-center justify-center rounded-full text-sm font-semibold transition-all ${
                    plan.popular
                      ? "bg-green-500 text-white hover:bg-green-400 shadow-md shadow-green-900/30"
                      : "bg-white/8 text-white hover:bg-white/12 border border-white/15"
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>

          {/* Comparison table */}
          <div className="mt-14 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-3 text-white/30 font-medium w-1/2" />
                  <th className="text-center py-3 text-white/60 font-semibold">Starter</th>
                  <th className="text-center py-3 text-green-400 font-semibold">Business</th>
                  <th className="text-center py-3 text-white/60 font-semibold">Pro</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row, i) => (
                  <tr key={row.label} className={`border-b border-white/5 ${i % 2 === 0 ? "" : "bg-white/[0.02]"}`}>
                    <td className="py-3 px-1 text-white/50">{row.label}</td>
                    <td className="py-3 text-center text-white/60"><CellVal val={row.starter} /></td>
                    <td className="py-3 text-center text-white"><CellVal val={row.business} highlight /></td>
                    <td className="py-3 text-center text-white/60"><CellVal val={row.pro} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── CTA BANNER ───────────────────────────────────────────── */}
      <section className="w-full py-20 bg-gradient-to-br from-[#030d08] via-[#0d3d26] to-[#030d08]">
        <div className="container px-4 md:px-6 mx-auto max-w-2xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-green-500/30 bg-green-500/10 px-4 py-1.5 text-sm text-green-400 font-medium mb-6">
            <Zap className="h-3.5 w-3.5" /> Ready to go
          </div>
          <h2 className="text-3xl font-extrabold text-white sm:text-4xl">Your shop. Running itself.</h2>
          <p className="text-white/50 mt-3">Join hundreds of Kenyan businesses selling around the clock with AI.</p>
          <Link
            href="/signup"
            className="mt-8 inline-flex h-13 items-center justify-center rounded-full bg-green-500 text-white px-10 text-base font-bold hover:bg-green-400 transition-all gap-2 shadow-lg shadow-green-900/40"
          >
            Create your free shop <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* ── ABOUT ────────────────────────────────────────────────── */}
      <section id="about" className="w-full py-16 md:py-20 bg-[#050f09]">
        <div className="container px-4 md:px-6 mx-auto max-w-5xl">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <span className="inline-block text-xs font-bold uppercase tracking-widest text-green-400 bg-green-400/10 rounded-full px-3 py-1 mb-4">About Pesa AI</span>
              <h2 className="text-3xl font-bold text-white sm:text-4xl leading-tight">
                Automating how business is done in Africa.
              </h2>
              <p className="text-white/50 mt-4 leading-relaxed">
                Pesa AI is a product of <strong className="text-white/80">Adplay Media LTD</strong> — a Kenyan technology company building the future of African commerce, one WhatsApp message at a time.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { stat: "500+", label: "Active businesses" },
                { stat: "24/7", label: "Always-on AI" },
                { stat: "5 min", label: "Setup time" },
                { stat: "Kenya 🇰🇪", label: "Built & backed" },
              ].map(({ stat, label }) => (
                <div key={label} className="bg-white/[0.04] border border-white/8 rounded-2xl p-5 text-center">
                  <p className="text-3xl font-extrabold text-green-400">{stat}</p>
                  <p className="text-sm text-white/40 mt-1">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CONTACT ──────────────────────────────────────────────── */}
      <section id="contact" className="w-full py-16 md:py-20 bg-[#030d08] border-t border-white/5">
        <div className="container px-4 md:px-6 mx-auto max-w-4xl text-center">
          <h2 className="text-2xl font-bold text-white">Get in touch</h2>
          <p className="text-white/40 mt-2">Our team is here for you.</p>
          <div className="grid sm:grid-cols-3 gap-5 mt-10">
            {[
              { icon: Phone,        label: "Call us",    value: "+254 741 387 785",    href: "tel:+254741387785" },
              { icon: MessageSquare,label: "WhatsApp",   value: "+254 741 387 785",    href: "https://wa.me/254741387785" },
              { icon: Package,      label: "Email",      value: "hello@pesaai.africa", href: "mailto:hello@pesaai.africa" },
            ].map(({ icon: Icon, label, value, href }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-7 hover:bg-white/[0.06] transition-colors"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-green-500/15 text-green-400">
                  <Icon className="h-5 w-5" />
                </div>
                <p className="font-semibold text-white">{label}</p>
                <p className="text-sm text-white/40">{value}</p>
              </a>
            ))}
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
