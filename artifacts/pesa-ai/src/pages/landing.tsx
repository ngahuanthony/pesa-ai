import { PublicLayout } from "@/components/layout";
import { CheckCircle2, MessageSquare, TrendingUp, Zap } from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { Link } from "wouter";
// @ts-ignore
import heroImg from "@assets/generated_images/hero-businesswoman.jpg";
// @ts-ignore
import mockupImg from "@assets/generated_images/whatsapp-mockup.jpg";

export default function LandingPage() {
  return (
    <PublicLayout>
      <div className="flex-1">
        {/* Hero Section */}
        <section className="w-full py-12 md:py-24 lg:py-32 xl:py-48 bg-background relative overflow-hidden">
          <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_top_right,rgba(37,211,102,0.1),transparent_40%)] pointer-events-none" />
          <div className="container px-4 md:px-6 relative z-10 mx-auto">
            <div className="grid gap-6 lg:grid-cols-[1fr_1fr] lg:gap-12 xl:grid-cols-[1.2fr_1fr] items-center">
              <div className="flex flex-col justify-center space-y-8">
                <div className="space-y-4">
                  <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                    <Zap className="mr-2 h-4 w-4" /> Built for Kenyan Hustle
                  </div>
                  <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl xl:text-6xl/none text-foreground">
                    Your AI Sales Assistant on <span className="text-primary flex items-center gap-2 mt-2"><SiWhatsapp className="h-10 w-10 md:h-12 md:w-12"/> WhatsApp.</span>
                  </h1>
                  <p className="max-w-[600px] text-lg text-muted-foreground md:text-xl">
                    Never miss a customer inquiry again. Pesa AI responds instantly, takes orders, and closes sales 24/7 on WhatsApp while you focus on running your business.
                  </p>
                </div>
                <div className="flex flex-col gap-3 min-[400px]:flex-row">
                  <Link href="/signup" className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90">
                    Start Your Free Trial
                  </Link>
                  <Link href="/login" className="inline-flex h-12 items-center justify-center rounded-md border border-input bg-background px-8 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground">
                    Log In
                  </Link>
                </div>
              </div>
              <div className="relative mx-auto flex w-full max-w-[500px] items-center justify-center lg:max-w-none">
                <div className="relative aspect-[4/3] w-full rounded-2xl overflow-hidden shadow-2xl">
                  {heroImg ? (
                    <img src={heroImg} alt="Kenyan businesswoman using WhatsApp" className="object-cover w-full h-full" />
                  ) : (
                    <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground">Loading image...</div>
                  )}
                  <div className="absolute -bottom-6 -left-6 md:-left-10 w-48 md:w-64 rounded-xl shadow-xl overflow-hidden border border-border">
                    {mockupImg ? (
                      <img src={mockupImg} alt="WhatsApp AI Mockup" className="object-cover w-full h-full" />
                    ) : (
                      <div className="aspect-[9/16] bg-background"></div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="w-full py-12 md:py-24 bg-card border-y border-border">
          <div className="container px-4 md:px-6 mx-auto">
            <div className="flex flex-col items-center justify-center space-y-4 text-center">
              <div className="space-y-2 max-w-[800px]">
                <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Smart. Fast. Relentless.</h2>
                <p className="text-muted-foreground md:text-lg">
                  Pesa AI knows your products, understands your customers, and handles the chat from hello to M-Pesa payment.
                </p>
              </div>
            </div>
            <div className="mx-auto grid max-w-5xl items-center gap-6 py-12 lg:grid-cols-3">
              <div className="flex flex-col items-center space-y-4 rounded-xl border border-border bg-background p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <MessageSquare className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold">24/7 Responses</h3>
                <p className="text-center text-muted-foreground text-sm">
                  Customers want answers now. Your AI persona replies instantly, day or night.
                </p>
              </div>
              <div className="flex flex-col items-center space-y-4 rounded-xl border border-border bg-background p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <TrendingUp className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold">Order Taking</h3>
                <p className="text-center text-muted-foreground text-sm">
                  Turns casual chats into structured orders. Tracks stock and handles the cart.
                </p>
              </div>
              <div className="flex flex-col items-center space-y-4 rounded-xl border border-border bg-background p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold">M-Pesa Integration</h3>
                <p className="text-center text-muted-foreground text-sm">
                  Seamlessly push M-Pesa payment prompts to close the deal right in WhatsApp.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section className="w-full py-12 md:py-24 bg-background">
          <div className="container px-4 md:px-6 mx-auto">
            <div className="flex flex-col items-center justify-center space-y-4 text-center mb-12">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Simple, Transparent Pricing</h2>
              <p className="text-muted-foreground md:text-lg max-w-[600px]">
                Invest in a tool that pays for itself on day one.
              </p>
            </div>
            <div className="grid max-w-5xl mx-auto gap-6 lg:grid-cols-3 lg:gap-8">
              {/* Starter */}
              <div className="flex flex-col rounded-2xl border border-border bg-card p-6 shadow-sm">
                <div className="mb-4">
                  <h3 className="text-2xl font-bold">Starter</h3>
                  <div className="mt-4 flex items-baseline text-4xl font-extrabold">
                    KES 2,999
                    <span className="ml-1 text-xl font-medium text-muted-foreground">/mo</span>
                  </div>
                </div>
                <ul className="mb-8 space-y-3 flex-1 text-sm text-muted-foreground">
                  <li className="flex items-center"><CheckCircle2 className="mr-2 h-4 w-4 text-primary" /> Basic AI WhatsApp responses</li>
                  <li className="flex items-center"><CheckCircle2 className="mr-2 h-4 w-4 text-primary" /> Up to 50 products</li>
                  <li className="flex items-center"><CheckCircle2 className="mr-2 h-4 w-4 text-primary" /> Order management dashboard</li>
                  <li className="flex items-center text-muted"><CheckCircle2 className="mr-2 h-4 w-4 text-muted-foreground" /> M-Pesa automated prompts (Locked)</li>
                </ul>
                <Link href="/signup?plan=Starter" className="mt-auto w-full inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground">
                  Choose Starter
                </Link>
              </div>
              
              {/* Business (Popular) */}
              <div className="flex flex-col rounded-2xl border-2 border-primary bg-card p-6 shadow-md relative">
                <div className="absolute top-0 right-1/2 translate-x-1/2 -translate-y-1/2 bg-primary text-primary-foreground px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                  MOST POPULAR
                </div>
                <div className="mb-4 mt-2">
                  <h3 className="text-2xl font-bold">Business</h3>
                  <div className="mt-4 flex items-baseline text-4xl font-extrabold text-primary">
                    KES 4,999
                    <span className="ml-1 text-xl font-medium text-muted-foreground">/mo</span>
                  </div>
                </div>
                <ul className="mb-8 space-y-3 flex-1 text-sm text-muted-foreground">
                  <li className="flex items-center font-medium text-foreground"><CheckCircle2 className="mr-2 h-4 w-4 text-primary" /> Everything in Starter</li>
                  <li className="flex items-center"><CheckCircle2 className="mr-2 h-4 w-4 text-primary" /> Advanced AI context</li>
                  <li className="flex items-center"><CheckCircle2 className="mr-2 h-4 w-4 text-primary" /> Up to 500 products</li>
                  <li className="flex items-center"><CheckCircle2 className="mr-2 h-4 w-4 text-primary" /> M-Pesa automated payment prompts</li>
                  <li className="flex items-center"><CheckCircle2 className="mr-2 h-4 w-4 text-primary" /> Basic Analytics</li>
                </ul>
                <Link href="/signup?plan=Business" className="mt-auto w-full inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90">
                  Choose Business
                </Link>
              </div>

              {/* Pro */}
              <div className="flex flex-col rounded-2xl border border-border bg-card p-6 shadow-sm">
                <div className="mb-4">
                  <h3 className="text-2xl font-bold">Pro</h3>
                  <div className="mt-4 flex items-baseline text-4xl font-extrabold">
                    KES 9,999
                    <span className="ml-1 text-xl font-medium text-muted-foreground">/mo</span>
                  </div>
                </div>
                <ul className="mb-8 space-y-3 flex-1 text-sm text-muted-foreground">
                  <li className="flex items-center font-medium text-foreground"><CheckCircle2 className="mr-2 h-4 w-4 text-primary" /> Everything in Business</li>
                  <li className="flex items-center"><CheckCircle2 className="mr-2 h-4 w-4 text-primary" /> Unlimited products</li>
                  <li className="flex items-center"><CheckCircle2 className="mr-2 h-4 w-4 text-primary" /> Advanced Analytics</li>
                  <li className="flex items-center"><CheckCircle2 className="mr-2 h-4 w-4 text-primary" /> Priority support</li>
                </ul>
                <Link href="/signup?plan=Pro" className="mt-auto w-full inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground">
                  Choose Pro
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </PublicLayout>
  );
}
