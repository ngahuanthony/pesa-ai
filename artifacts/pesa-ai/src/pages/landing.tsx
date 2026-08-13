import { PublicLayout } from "@/components/layout";
import { CheckCircle2, MessageSquare, TrendingUp, Zap, ArrowRight, Package } from "lucide-react";
import { Link } from "wouter";
// @ts-ignore
import heroImg from "@assets/generated_images/hero-market-illustration.jpg";

export default function LandingPage() {
  return (
    <PublicLayout>
      <div className="flex-1">
        {/* Hero Section */}
        <section className="w-full py-12 md:py-20 lg:py-28 bg-[#f7f7f5] relative overflow-hidden">
          <div className="container px-4 md:px-6 relative z-10 mx-auto max-w-6xl">
            <div className="grid gap-8 lg:grid-cols-2 lg:gap-16 items-center">
              {/* Left: Copy */}
              <div className="flex flex-col justify-center space-y-6">
                {/* Badge */}
                <div className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-medium text-primary w-fit">
                  <Zap className="mr-2 h-3.5 w-3.5" /> Built for Kenyan SMEs
                </div>

                {/* Headline */}
                <div className="space-y-0">
                  <h1 className="text-5xl font-extrabold tracking-tight leading-none sm:text-6xl xl:text-7xl text-foreground">
                    Your WhatsApp<br />shop.
                  </h1>
                  <h1 className="text-5xl font-extrabold tracking-tight leading-none sm:text-6xl xl:text-7xl text-primary">
                    Running itself.
                  </h1>
                </div>

                {/* Subtext */}
                <p className="max-w-[480px] text-base text-muted-foreground md:text-lg leading-relaxed">
                  Add your products. Go live on WhatsApp. Your shop handles enquiries, takes orders, and collects M-Pesa payments — day or night.
                </p>

                {/* CTAs */}
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
                    data-testid="link-login-dashboard"
                  >
                    Log in to dashboard
                  </Link>
                </div>
              </div>

              {/* Right: Hero illustration with chat bubble overlays */}
              <div className="relative mx-auto w-full max-w-[540px] lg:max-w-none">
                <div className="relative rounded-2xl overflow-hidden shadow-2xl">
                  <img
                    src={heroImg}
                    alt="Kenyan businesswoman running her WhatsApp shop with AI"
                    className="object-cover w-full h-full"
                  />

                  {/* Customer chat bubble — top left */}
                  <div className="absolute top-4 left-4 max-w-[200px] bg-white rounded-2xl rounded-tl-sm px-4 py-3 shadow-lg">
                    <p className="text-xs font-medium text-gray-900 leading-snug">Do you have the red shoes in size 39?</p>
                    <p className="text-[10px] text-gray-400 mt-1">Customer • 12:02 PM</p>
                  </div>

                  {/* AI reply bubble — bottom right */}
                  <div className="absolute bottom-4 right-4 max-w-[220px] bg-primary rounded-2xl rounded-br-sm px-4 py-3 shadow-lg">
                    <p className="text-xs font-medium text-white leading-snug">Yes we do! They cost KSh 3,500. Should I pack them for you?</p>
                    <p className="text-[10px] text-primary-foreground/70 mt-1">Pesa AI • 12:02 PM</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="w-full py-14 md:py-20 bg-card border-y border-border">
          <div className="container px-4 md:px-6 mx-auto max-w-6xl">
            <div className="flex flex-col items-center justify-center space-y-4 text-center mb-10">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Smart. Fast. Relentless.</h2>
              <p className="text-muted-foreground md:text-lg max-w-[600px]">
                Your WhatsApp shop handles enquiries, takes orders, and collects M-Pesa payments — automatically, around the clock.
              </p>
            </div>
            <div className="mx-auto grid max-w-5xl items-stretch gap-6 lg:grid-cols-3">
              <div className="flex flex-col items-center space-y-4 rounded-2xl border border-border bg-background p-7 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <MessageSquare className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold">24/7 Responses</h3>
                <p className="text-center text-muted-foreground text-sm">
                  Customers get instant answers, day or night. Your shop never sleeps — no salary, no sick days.
                </p>
              </div>
              <div className="flex flex-col items-center space-y-4 rounded-2xl border border-border bg-background p-7 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <TrendingUp className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold">Order Taking</h3>
                <p className="text-center text-muted-foreground text-sm">
                  Turns casual chats into structured orders. Tracks stock, handles the cart, and confirms delivery details.
                </p>
              </div>
              <div className="flex flex-col items-center space-y-4 rounded-2xl border border-border bg-background p-7 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold">M-Pesa Integration</h3>
                <p className="text-center text-muted-foreground text-sm">
                  Seamlessly push M-Pesa STK push prompts right in WhatsApp — no customer ever needs to leave the chat.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="w-full py-14 md:py-20 bg-background">
          <div className="container px-4 md:px-6 mx-auto max-w-6xl">
            <div className="text-center mb-14">
              <h2 className="text-4xl font-extrabold tracking-tight sm:text-5xl text-foreground">How it works</h2>
              <p className="text-muted-foreground md:text-base mt-3 max-w-[480px] mx-auto">
                Set up your shop in minutes and watch it run itself.
              </p>
            </div>
            <div className="grid gap-10 md:grid-cols-3 max-w-4xl mx-auto">
              {/* Step 1 */}
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[#f5efd6] shadow-sm">
                  <Package className="h-9 w-9 text-[#5c4a1e]" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-foreground">Step 1: Add your products</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed mt-2">
                    Upload your inventory with names and prices. Your shop instantly learns your catalog.
                  </p>
                </div>
              </div>
              {/* Step 2 */}
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary shadow-sm">
                  <MessageSquare className="h-9 w-9 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-foreground">Step 2: Go live on WhatsApp</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed mt-2">
                    Connect your number. Your shop starts chatting with customers like a pro.
                  </p>
                </div>
              </div>
              {/* Step 3 */}
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[#e6f4ea] shadow-sm">
                  <TrendingUp className="h-9 w-9 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-foreground">Step 3: Watch the sales roll in</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed mt-2">
                    Customers order and pay via M-Pesa — all through WhatsApp, without you lifting a finger.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section className="w-full py-14 md:py-20 bg-[#f7f7f5]">
          <div className="container px-4 md:px-6 mx-auto max-w-6xl">
            <div className="flex flex-col items-center justify-center space-y-3 text-center mb-12">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Simple, transparent pricing</h2>
              <p className="text-muted-foreground md:text-lg max-w-[480px]">
                Start free, upgrade when you are ready to scale.
              </p>
            </div>
            <div className="grid max-w-5xl mx-auto gap-6 lg:grid-cols-3 lg:gap-8">
              {/* Starter */}
              <div className="flex flex-col rounded-2xl border border-border bg-white p-7 shadow-sm">
                <h3 className="text-xl font-bold">Starter</h3>
                <div className="mt-3 flex items-baseline">
                  <span className="text-4xl font-extrabold">KES 2,999</span>
                  <span className="ml-1 text-base font-medium text-muted-foreground">/mo</span>
                </div>
                <ul className="my-7 space-y-3 flex-1 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" /> Instant WhatsApp responses</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" /> Up to 50 products</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" /> Order management dashboard</li>
                  <li className="flex items-center gap-2 opacity-40"><CheckCircle2 className="h-4 w-4 flex-shrink-0" /> M-Pesa auto-prompts</li>
                </ul>
                <Link href="/signup?plan=Starter" className="w-full inline-flex h-11 items-center justify-center rounded-full border border-border bg-transparent px-4 text-sm font-medium transition-colors hover:bg-foreground/5" data-testid="button-starter">
                  Get started
                </Link>
              </div>

              {/* Business (Popular) */}
              <div className="flex flex-col rounded-2xl border-2 border-primary bg-white p-7 shadow-lg relative">
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-primary text-white px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                  Most Popular
                </div>
                <h3 className="text-xl font-bold mt-2">Business</h3>
                <div className="mt-3 flex items-baseline">
                  <span className="text-4xl font-extrabold text-primary">KES 4,999</span>
                  <span className="ml-1 text-base font-medium text-muted-foreground">/mo</span>
                </div>
                <ul className="my-7 space-y-3 flex-1 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2 font-medium text-foreground"><CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" /> Everything in Starter</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" /> Up to 500 products</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" /> M-Pesa automated prompts</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" /> Smart product matching</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" /> Sales analytics</li>
                </ul>
                <Link href="/signup?plan=Business" className="w-full inline-flex h-11 items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-white shadow transition-all hover:bg-primary/90" data-testid="button-business">
                  Get started
                </Link>
              </div>

              {/* Pro */}
              <div className="flex flex-col rounded-2xl border border-border bg-white p-7 shadow-sm">
                <h3 className="text-xl font-bold">Pro</h3>
                <div className="mt-3 flex items-baseline">
                  <span className="text-4xl font-extrabold">KES 9,999</span>
                  <span className="ml-1 text-base font-medium text-muted-foreground">/mo</span>
                </div>
                <ul className="my-7 space-y-3 flex-1 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2 font-medium text-foreground"><CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" /> Everything in Business</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" /> Unlimited products</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" /> Advanced analytics</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" /> Priority support</li>
                </ul>
                <Link href="/signup?plan=Pro" className="w-full inline-flex h-11 items-center justify-center rounded-full border border-border bg-transparent px-4 text-sm font-medium transition-colors hover:bg-foreground/5" data-testid="button-pro">
                  Get started
                </Link>
              </div>
            </div>

            {/* CTA below pricing */}
            <div className="text-center mt-12">
              <Link href="/signup" className="inline-flex h-13 items-center justify-center rounded-full bg-primary px-10 py-3.5 text-base font-semibold text-white shadow-md transition-all hover:bg-primary/90 hover:shadow-lg gap-2" data-testid="button-cta-final">
                Start Your Free Trial <ArrowRight className="h-5 w-5" />
              </Link>
              <p className="text-sm text-muted-foreground mt-3">14-day free trial · No credit card required</p>
            </div>
          </div>
        </section>
      </div>
    </PublicLayout>
  );
}
