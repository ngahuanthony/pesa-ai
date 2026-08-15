import { PublicLayout } from "@/components/layout";
import {
  CheckCircle2, MessageSquare, Zap, ArrowRight, Package,
  Phone, Check, Minus, ShoppingBag, Video, Sparkles, ScanLine,
} from "lucide-react";
import { Link } from "wouter";

// ── Pricing data ─────────────────────────────────────────────────────────────
const plans = [
  {
    name: "Starter",
    tagline: "Get your business online",
    price: "KSh 2,000",
    popular: false,
    badge: null,
    features: [
      "WhatsApp AI salesperson",
      "Up to 100 products",
      "10 inventory scans / month",
      "M-Pesa integration",
      "Order tracking",
      "1 staff account",
      "Basic analytics",
    ],
    cta: "Get started free",
    href: "/signup?plan=Starter",
  },
  {
    name: "Business",
    tagline: "Automate your inventory",
    price: "KSh 3,500",
    popular: true,
    badge: "MOST POPULAR",
    features: [
      "Everything in Starter",
      "Up to 1,000 products",
      "40 inventory scans / month",
      "Offers & promotions",
      "Customer follow-up",
      "3 staff accounts",
      "Advanced analytics",
    ],
    cta: "Start free trial",
    href: "/signup?plan=Business",
  },
  {
    name: "Pro",
    tagline: "Large, constantly changing catalogue",
    price: "KSh 6,000",
    popular: false,
    badge: null,
    features: [
      "Everything in Business",
      "Unlimited products",
      "100 inventory scans / month",
      "Multiple branches",
      "10+ staff accounts",
      "Automated campaigns",
      "Priority support",
    ],
    cta: "Get started",
    href: "/signup?plan=Pro",
  },
];

type TableRow = {
  label: string;
  starter: string | boolean;
  business: string | boolean;
  pro: string | boolean;
};

const tableRows: TableRow[] = [
  { label: "Monthly price",         starter: "KSh 2,000",    business: "KSh 3,500",    pro: "KSh 6,000" },
  { label: "Products",              starter: "100",           business: "1,000",         pro: "Unlimited" },
  { label: "Inventory scans / month", starter: "10",            business: "40",            pro: "100" },
  { label: "Staff accounts",        starter: "1",             business: "3",             pro: "10+" },
  { label: "AI salesperson",        starter: true,            business: true,            pro: true },
  { label: "M-Pesa integration",    starter: true,            business: true,            pro: true },
  { label: "Orders",                starter: true,            business: true,            pro: true },
  { label: "WhatsApp usage",        starter: "Usage-based",   business: "Usage-based",   pro: "Usage-based" },
  { label: "Offers & promotions",   starter: false,           business: true,            pro: true },
  { label: "Automated campaigns",   starter: false,           business: false,           pro: true },
  { label: "Multiple branches",     starter: false,           business: false,           pro: true },
];

function CellVal({ val, highlight }: { val: string | boolean; highlight?: boolean }) {
  if (val === true)  return <Check  className={`h-4 w-4 mx-auto ${highlight ? "text-green-400" : "text-green-500"}`} />;
  if (val === false) return <Minus  className="h-4 w-4 mx-auto text-white/30" />;
  return <span className={`text-sm ${highlight ? "text-green-400 font-semibold" : ""}`}>{val}</span>;
}

const testimonials = [
  {
    quote: "Since I added Pesa AI, I don't lose customers who text me at 11 PM. I wake up, pack the orders, and dispatch. It's magic.",
    name: "Grace Mutuku",
    role: "Boutique Owner, Toi Market",
    initials: "GM",
  },
  {
    quote: "Verifying M-Pesa messages manually was stressful. Now the AI checks the payment and confirms the order before I even look at my phone.",
    name: "Kevin Omondi",
    role: "Electronics Dealer, Luthuli Ave",
    initials: "KO",
  },
  {
    quote: "Customers like it because it replies instantly. I like it because it forces them to pay upfront before marking as confirmed.",
    name: "Fatuma Ali",
    role: "Food Delivery, Eastleigh",
    initials: "FA",
  },
];

// ── Phone mockup (CSS only) ───────────────────────────────────────────────────
function PhoneMockup() {
  return (
    <div className="relative mx-auto w-[280px]">
      {/* Phone frame */}
      <div className="relative rounded-[2.5rem] bg-[#1a1a2e] p-2 shadow-2xl ring-4 ring-[#1a1a2e]">
        {/* Screen */}
        <div className="rounded-[2rem] overflow-hidden bg-[#e5ddd5] min-h-[480px] flex flex-col">
          {/* WA header */}
          <div className="bg-[#075e54] px-4 py-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white font-bold text-sm flex-shrink-0">MG</div>
            <div>
              <p className="text-white font-semibold text-sm leading-none">Mercy's Groceries</p>
              <p className="text-white/70 text-[11px] mt-0.5">bot · usually replies instantly</p>
            </div>
          </div>

          {/* Chat messages */}
          <div className="flex-1 px-3 py-4 space-y-3">
            {/* Customer */}
            <div className="flex justify-start">
              <div className="bg-white rounded-2xl rounded-tl-sm px-3 py-2 max-w-[75%] shadow-sm">
                <p className="text-[12px] text-gray-800">Do you have the red shoes in size 39?</p>
                <p className="text-[9px] text-gray-400 mt-0.5 text-right">10:41</p>
              </div>
            </div>
            {/* Bot reply */}
            <div className="flex justify-end">
              <div className="bg-[#dcf8c6] rounded-2xl rounded-tr-sm px-3 py-2 max-w-[78%] shadow-sm">
                <p className="text-[12px] text-gray-800">Yes we do! They cost KSh 3,500. Should I pack them for you?</p>
                <p className="text-[9px] text-gray-400 mt-0.5 text-right">10:41 ✓✓</p>
              </div>
            </div>
            {/* Customer */}
            <div className="flex justify-start">
              <div className="bg-white rounded-2xl rounded-tl-sm px-3 py-2 max-w-[75%] shadow-sm">
                <p className="text-[12px] text-gray-800">Yes please. How do I pay?</p>
                <p className="text-[9px] text-gray-400 mt-0.5 text-right">10:42</p>
              </div>
            </div>
            {/* Bot with M-Pesa */}
            <div className="flex justify-end">
              <div className="bg-[#dcf8c6] rounded-2xl rounded-tr-sm px-3 py-2 max-w-[78%] shadow-sm">
                <p className="text-[12px] text-gray-800">Great! Pay KSh 3,500 to Till Number 123456. I'll confirm once received.</p>
                {/* M-Pesa card */}
                <div className="mt-2 bg-white rounded-xl px-2 py-1.5 flex items-center gap-2 border border-gray-100">
                  <div className="h-6 w-6 rounded-full bg-green-600 flex items-center justify-center flex-shrink-0">
                    <span className="text-[8px] text-white font-bold">M</span>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-gray-800">M-Pesa Express</p>
                    <p className="text-[9px] text-gray-400">Till: 123456</p>
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

      {/* Floating badge */}
      <div className="absolute -right-4 top-1/3 bg-white rounded-xl shadow-lg px-3 py-2">
        <p className="text-[11px] font-semibold text-gray-800">AI Responding</p>
        <p className="text-[10px] text-green-600">0 sec response time</p>
      </div>

      {/* Payment confirmed badge */}
      <div className="absolute -left-6 bottom-24 bg-white rounded-xl shadow-lg px-3 py-2 flex items-center gap-2">
        <div className="h-6 w-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
          <Check className="h-3.5 w-3.5 text-green-600" />
        </div>
        <div>
          <p className="text-[11px] font-semibold text-gray-800">Payment Confirmed</p>
          <p className="text-[10px] text-green-600">+ KSh 3,500</p>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <PublicLayout>
      {/* ── HERO ─────────────────────────────────────────────────── */}
      <section className="w-full py-14 md:py-20 lg:py-28 bg-[#f7f7f5]">
        <div className="container px-4 md:px-6 mx-auto max-w-6xl">
          <div className="grid gap-12 lg:grid-cols-2 items-center">
            {/* Left */}
            <div className="flex flex-col gap-6">
              <div className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-medium text-primary w-fit">
                <Zap className="mr-2 h-3.5 w-3.5" /> Built for Kenyan SMEs
              </div>
              <div>
                <h1 className="text-5xl font-extrabold tracking-tight leading-none sm:text-6xl xl:text-7xl text-foreground">
                  Your WhatsApp<br />shop.
                </h1>
                <h1 className="text-5xl font-extrabold tracking-tight leading-none sm:text-6xl xl:text-7xl text-primary">
                  Running itself.
                </h1>
              </div>
              <p className="max-w-[480px] text-base text-muted-foreground md:text-lg leading-relaxed">
                Add your products. Go live on WhatsApp. Your shop handles enquiries, takes orders, and collects M-Pesa payments — day or night.
              </p>
              <div className="flex flex-col gap-3 min-[400px]:flex-row">
                <Link
                  href="/signup"
                  className="inline-flex h-12 items-center justify-center rounded-full bg-primary px-7 text-sm font-semibold text-primary-foreground shadow-md transition-all hover:bg-primary/90 hover:shadow-lg gap-2"
                  data-testid="button-get-started"
                >
                  Get Started Free <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/login"
                  className="inline-flex h-12 items-center justify-center rounded-full border border-border bg-transparent px-7 text-sm font-medium text-foreground transition-colors hover:bg-foreground/5"
                >
                  Log in to dashboard
                </Link>
              </div>
              <p className="text-sm text-muted-foreground">
                <span className="inline-flex gap-1 items-center">
                  <span className="flex -space-x-1">
                    {["A","M","J"].map((l) => (
                      <span key={l} className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white ring-2 ring-white">{l}</span>
                    ))}
                  </span>
                  Trusted by 500+ Kenyan businesses
                </span>
              </p>
            </div>

            {/* Right: phone mockup */}
            <div className="flex justify-center lg:justify-end">
              <PhoneMockup />
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ─────────────────────────────────────────────── */}
      <section id="features" className="w-full py-16 md:py-20 bg-white">
        <div className="container px-4 md:px-6 mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Smart. Fast. Relentless.</h2>
            <p className="text-muted-foreground md:text-lg max-w-[560px] mx-auto mt-3">
              Your WhatsApp shop handles enquiries, takes orders, and collects M-Pesa payments — automatically, around the clock.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {[
              {
                Icon: MessageSquare,
                title: "24/7 Customer Service",
                desc: "Never miss a sale because you were asleep or busy. The AI answers questions instantly, in your brand's voice.",
              },
              {
                Icon: ShoppingBag,
                title: "Smart Order Taking",
                desc: "It knows your inventory. It calculates delivery fees. It takes the order and asks for the drop-off location automatically.",
              },
              {
                Icon: CheckCircle2,
                title: "M-Pesa Auto-Confirm",
                desc: "Stop verifying messages manually. When a customer pays via M-Pesa, the AI detects it and instantly confirms the order.",
              },
            ].map(({ Icon, title, desc }) => (
              <div key={title} className="flex flex-col items-start space-y-3 rounded-2xl border border-border bg-[#f9f9f7] p-7">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold">{title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── THREE STEPS ──────────────────────────────────────────── */}
      <section className="w-full py-16 md:py-20 bg-[#f7f7f5]">
        <div className="container px-4 md:px-6 mx-auto max-w-5xl">
          <div className="text-center mb-14">
            <h2 className="text-4xl font-extrabold tracking-tight sm:text-5xl text-foreground">Three steps to autopilot</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-10 max-w-3xl mx-auto">
            {[
              { n: "01", title: "Build your catalogue",   desc: "Add products manually — or point your phone at your shop and let AI do it in 60 seconds." },
              { n: "02", title: "Go live on WhatsApp",    desc: "Connect your number. Your shop starts chatting with customers like a pro." },
              { n: "03", title: "Watch the sales roll in", desc: "Customers order and pay via M-Pesa — all through WhatsApp, without you lifting a finger." },
            ].map(({ n, title, desc }) => (
              <div key={n} className="flex flex-col items-center text-center space-y-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-primary text-primary font-extrabold text-xl">
                  {n}
                </div>
                <h3 className="text-base font-extrabold text-foreground">{title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ─────────────────────────────────────────── */}
      <section className="w-full py-16 md:py-20 bg-white">
        <div className="container px-4 md:px-6 mx-auto max-w-6xl">
          <h2 className="text-3xl font-bold text-center mb-10">Trusted by the street</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map(({ quote, name, role, initials }) => (
              <div key={name} className="flex flex-col rounded-2xl bg-[#f9f9f7] p-6 space-y-4">
                <p className="text-muted-foreground text-sm leading-relaxed italic">"{quote}"</p>
                <div className="flex items-center gap-3 mt-auto pt-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary font-bold text-sm flex-shrink-0">
                    {initials}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{name}</p>
                    <p className="text-xs text-muted-foreground">{role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── VIDEO SCAN SHOWCASE ──────────────────────────────────── */}
      <section className="w-full py-16 md:py-24 bg-[#0d3d26] overflow-hidden">
        <div className="container px-4 md:px-6 mx-auto max-w-5xl">

          {/* Centred header */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 rounded-full border border-green-500/40 bg-green-500/15 px-3 py-1 text-sm font-semibold text-green-400 mb-5">
              <Video className="h-3.5 w-3.5" /> New — AI Inventory Scanning
            </div>
            <h2 className="text-4xl font-extrabold text-white sm:text-5xl leading-tight">
              Walk your shop once.<br />
              <span className="text-green-400">Your catalogue builds itself.</span>
            </h2>
            <p className="text-white/65 text-base mt-4 max-w-xl mx-auto leading-relaxed">
              Point your phone at your shelves and record a 60-second video. Our AI reads every product, price tag, and label — and adds them to your shop automatically. No typing. No spreadsheets. Ever.
            </p>
            {/* Free trial CTA — the hook */}
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center items-center">
              <Link
                href="/signup"
                className="inline-flex h-12 items-center justify-center rounded-full bg-green-500 text-white px-8 text-sm font-bold hover:bg-green-400 transition-all gap-2 shadow-lg shadow-green-900/40"
              >
                <Sparkles className="h-4 w-4" /> Try your first scan free
              </Link>
              <p className="text-white/40 text-sm">No credit card · Takes 2 minutes</p>
            </div>
          </div>

          {/* Three steps */}
          <div className="grid md:grid-cols-3 gap-4 mb-10">
            {[
              {
                icon: Video,
                n: "1",
                title: "Record",
                desc: "Walk through your shelves with your phone. 30–60 seconds is enough for a full shop.",
                color: "bg-blue-500/20 text-blue-300",
              },
              {
                icon: Sparkles,
                n: "2",
                title: "AI reads everything",
                desc: "Our vision model scans every frame — product names, prices, quantities, even handwritten tags.",
                color: "bg-yellow-400/20 text-yellow-300",
              },
              {
                icon: ScanLine,
                n: "3",
                title: "Products appear",
                desc: "Review the list, make any edits, and publish. Your WhatsApp shop now knows your full catalogue.",
                color: "bg-green-500/20 text-green-300",
              },
            ].map(({ icon: Icon, n, title, desc, color }) => (
              <div key={n} className="rounded-2xl bg-white/[0.06] border border-white/10 px-5 py-5 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${color} flex-shrink-0`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Step {n}</span>
                    <p className="text-sm font-bold text-white leading-none mt-0.5">{title}</p>
                  </div>
                </div>
                <p className="text-sm text-white/60 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>

          {/* What happens after the free scan — upgrade nudge */}
          <div className="rounded-2xl bg-white/[0.05] border border-white/10 px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center gap-5">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white mb-1">After your free scan</p>
              <p className="text-sm text-white/60">You'll see exactly how it works — then choose a plan that fits your shop size. Starter gets 10 scans/month. Business gets 40. No pressure, no auto-charges.</p>
            </div>
            <div className="flex-shrink-0 flex gap-2 text-sm font-semibold">
              <span className="rounded-full bg-white/10 border border-white/15 px-4 py-2 text-white/70">Starter · 10/mo</span>
              <span className="rounded-full bg-green-500/20 border border-green-500/30 px-4 py-2 text-green-300">Business · 40/mo</span>
              <span className="rounded-full bg-white/10 border border-white/15 px-4 py-2 text-white/70">Pro · 100/mo</span>
            </div>
          </div>

        </div>
      </section>

      {/* ── PRICING ──────────────────────────────────────────────── */}
      <section id="pricing" className="w-full py-16 md:py-24 bg-[#0d3d26]">
        <div className="container px-4 md:px-6 mx-auto max-w-5xl">
          {/* Header */}
          <div className="text-center mb-4">
            <h2 className="text-3xl font-bold text-white sm:text-4xl">Grow at your own pace</h2>
            <p className="text-white/70 mt-2 max-w-xl mx-auto">
              Start simple. Automate as you grow. Video Scans are included in Business &amp; Pro — priced around actual usage, not arbitrary limits.
            </p>
            <p className="text-white/40 text-sm mt-2">5-day free trial · No credit card required · WhatsApp usage billed separately by Meta</p>
          </div>

          {/* Plan cards */}
          <div className="grid md:grid-cols-3 gap-5 mt-10">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`relative flex flex-col rounded-2xl p-7 ${
                  plan.popular
                    ? "bg-white ring-2 ring-green-400 shadow-xl"
                    : "bg-white/10 text-white"
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-green-500 text-white px-4 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider">
                    MOST POPULAR
                  </div>
                )}
                <h3 className={`text-lg font-bold ${plan.popular ? "text-foreground" : "text-white"}`}>{plan.name}</h3>
                <p className={`text-sm mt-0.5 ${plan.popular ? "text-muted-foreground" : "text-white/60"}`}>{plan.tagline}</p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className={`text-4xl font-extrabold ${plan.popular ? "text-primary" : "text-white"}`}>{plan.price}</span>
                  <span className={`text-sm ${plan.popular ? "text-muted-foreground" : "text-white/60"}`}>/month</span>
                </div>
                <ul className="my-6 space-y-2.5 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className={`h-4 w-4 flex-shrink-0 ${plan.popular ? "text-primary" : "text-green-400"}`} />
                      <span className={plan.popular ? "text-foreground" : "text-white/80"}>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.href}
                  className={`w-full inline-flex h-11 items-center justify-center rounded-full text-sm font-semibold transition-all ${
                    plan.popular
                      ? "bg-primary text-white hover:bg-primary/90"
                      : "bg-white/10 text-white hover:bg-white/20 border border-white/20"
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
                <tr className="border-b border-white/20">
                  <th className="text-left py-3 text-white/60 font-medium w-1/2" />
                  <th className="text-center py-3 text-white font-semibold">Starter</th>
                  <th className="text-center py-3 text-green-400 font-semibold">Business</th>
                  <th className="text-center py-3 text-white font-semibold">Pro</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row, i) => (
                  <tr key={row.label} className={`border-b border-white/10 ${i % 2 === 0 ? "" : "bg-white/5"}`}>
                    <td className="py-3 px-1 text-white/70">{row.label}</td>
                    <td className="py-3 text-center text-white/80"><CellVal val={row.starter} /></td>
                    <td className="py-3 text-center text-white"><CellVal val={row.business} highlight /></td>
                    <td className="py-3 text-center text-white/80"><CellVal val={row.pro} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── CTA BANNER ───────────────────────────────────────────── */}
      <section className="w-full py-16 bg-primary">
        <div className="container px-4 md:px-6 mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold text-white sm:text-4xl">Ready to put your shop on autopilot?</h2>
          <p className="text-white/80 mt-3">Join hundreds of Kenyan businesses scaling faster with AI.</p>
          <Link
            href="/signup"
            className="mt-6 inline-flex h-12 items-center justify-center rounded-full bg-[#0d3d26] text-white px-8 text-sm font-semibold hover:bg-[#0d3d26]/90 transition-all"
          >
            Create your free shop
          </Link>
        </div>
      </section>

      {/* ── ABOUT ────────────────────────────────────────────────── */}
      <section id="about" className="w-full py-16 md:py-20 bg-[#f7f7f5]">
        <div className="container px-4 md:px-6 mx-auto max-w-5xl">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <span className="inline-block text-xs font-bold uppercase tracking-widest text-primary bg-primary/10 rounded-full px-3 py-1 mb-4">About Pesa AI</span>
              <h2 className="text-3xl font-bold text-foreground sm:text-4xl leading-tight">
                Automating how business is done in Africa.
              </h2>
              <p className="text-muted-foreground mt-4 leading-relaxed">
                Pesa AI is a product of <strong>Adplay Media LTD</strong> — a Kenyan technology company building the future of African commerce, one WhatsApp message at a time.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { stat: "500+", label: "Active businesses" },
                { stat: "24/7", label: "Always-on AI" },
                { stat: "5 min", label: "Setup time" },
                { stat: "Kenya 🇰🇪", label: "Built & backed" },
              ].map(({ stat, label }) => (
                <div key={label} className="bg-white rounded-2xl p-5 border border-border shadow-sm text-center">
                  <p className="text-3xl font-extrabold text-primary">{stat}</p>
                  <p className="text-sm text-muted-foreground mt-1">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CONTACT ──────────────────────────────────────────────── */}
      <section id="contact" className="w-full py-16 md:py-20 bg-white">
        <div className="container px-4 md:px-6 mx-auto max-w-4xl text-center">
          <h2 className="text-3xl font-bold text-foreground">Get in touch</h2>
          <p className="text-muted-foreground mt-3">Have a question or need help getting started? Our team is here for you.</p>
          <div className="grid sm:grid-cols-3 gap-5 mt-10">
            {[
              { icon: Phone, label: "Call us",     value: "+254 741 387 785", href: "tel:+254741387785" },
              { icon: MessageSquare, label: "WhatsApp", value: "+254 741 387 785", href: "https://wa.me/254741387785" },
              { icon: Package, label: "Email us",  value: "hello@pesaai.africa", href: "mailto:hello@pesaai.africa" },
            ].map(({ icon: Icon, label, value, href }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-[#f9f9f7] p-7 hover:shadow-md transition-shadow"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <p className="font-semibold text-foreground">{label}</p>
                <p className="text-sm text-muted-foreground">{value}</p>
              </a>
            ))}
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
