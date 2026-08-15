import { PublicLayout } from "@/components/layout";
import { useSignup } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useLocation } from "wouter";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";
import { useEffect, useState } from "react";
import { ShieldCheck, ArrowRight } from "lucide-react";

const signupSchema = z.object({
  // Business Basics
  businessName: z.string().min(2, "Business name is required"),
  category: z.string().min(1, "Please select a category"),
  fullName: z.string().min(2, "Your full name is required"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  // Payment
  paymentMethod: z.enum(["mpesa", "bank"]),
  paybillNumber: z.string().optional(),
  // Trust & Verification (all optional)
  buildingName: z.string().optional(),
  stallNumber: z.string().optional(),
  publicPhone: z.string().optional(),
  nationalId: z.string().optional(),
  // Plan
  plan: z.enum(["Starter", "Business", "Pro"]),
});

const CATEGORIES = [
  "Retail & Fashion",
  "Electronics & Gadgets",
  "Beauty & Cosmetics",
  "Food & Beverages",
  "Home & Furniture",
  "Agriculture & Produce",
  "Services",
  "Other",
];

export default function SignupPage() {
  const { me } = useAuthRedirect();
  const [, setLocation] = useLocation();
  const signup = useSignup();

  useEffect(() => {
    if (me?.authenticated && !me?.isAdmin) setLocation("/dashboard");
    if (me?.isAdmin) setLocation("/admin");
  }, [me, setLocation]);

  const searchParams = new URLSearchParams(window.location.search);
  const defaultPlan = (searchParams.get("plan") as "Starter" | "Business" | "Pro") || "Business";

  const form = useForm<z.infer<typeof signupSchema>>({
    resolver: zodResolver(signupSchema) as any,
    defaultValues: {
      businessName: "",
      category: "",
      fullName: "",
      email: "",
      password: "",
      paymentMethod: "mpesa",
      paybillNumber: "",
      buildingName: "",
      stallNumber: "",
      publicPhone: "",
      nationalId: "",
      plan: defaultPlan,
    },
  });

  const paymentMethod = form.watch("paymentMethod");

  const onSubmit = (data: z.infer<typeof signupSchema>) => {
    signup.mutate({
      data: {
        businessName: data.businessName,
        category: data.category,
        email: data.email,
        password: data.password,
        paybillNumber: data.paymentMethod === "mpesa" ? data.paybillNumber : undefined,
        fullName: data.fullName,
        buildingName: data.buildingName,
        stallNumber: data.stallNumber,
        publicPhone: data.publicPhone,
        nationalId: data.nationalId,
        plan: data.plan,
        consent: true,
      } as any,
    }, {
      onSuccess: () => setLocation("/dashboard"),
    });
  };

  const selectedPlan = form.watch("plan");

  const PLANS = [
    {
      name: "Starter" as const,
      price: "KSh 2,000",
      features: ["WhatsApp AI salesperson", "100 products", "Stock & orders"],
      popular: false,
    },
    {
      name: "Business" as const,
      price: "KSh 3,000",
      features: ["Everything in Starter", "1,000 products", "AI sales assistant"],
      popular: true,
    },
    {
      name: "Pro" as const,
      price: "KSh 6,000",
      features: ["Everything in Business", "Unlimited products", "Advanced AI"],
      popular: false,
    },
  ];

  return (
    <PublicLayout>
      <div className="flex-1 flex items-start justify-center py-10 px-4 bg-[#f7f7f5]">
        <div className="w-full max-w-3xl">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-extrabold text-foreground">Create your WhatsApp Shop</h1>
            <p className="text-muted-foreground mt-2">5-day free trial · No credit card required</p>
          </div>

          {/* Plan selection cards */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {PLANS.map((plan) => {
              const isSelected = selectedPlan === plan.name;
              return (
                <button
                  key={plan.name}
                  type="button"
                  onClick={() => form.setValue("plan", plan.name)}
                  className={`relative text-left rounded-xl border-2 p-4 transition-all cursor-pointer ${
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border bg-white hover:border-primary/40"
                  }`}
                >
                  {plan.popular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-semibold px-3 py-0.5 rounded-full">
                      POPULAR
                    </span>
                  )}
                  <div className="mb-2">
                    <p className="font-semibold text-foreground">{plan.name}</p>
                    <p className="text-primary font-bold">
                      {plan.price}<span className="text-sm font-normal text-muted-foreground">/mo</span>
                    </p>
                  </div>
                  <ul className="space-y-1">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="text-primary">✓</span> {f}
                      </li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>

          {/* Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-border p-8 space-y-8">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

                {/* ── Section 1: Business Basics ── */}
                <div className="space-y-5">
                  <div>
                    <h2 className="text-base font-extrabold text-foreground">Business Basics</h2>
                    <hr className="mt-2 border-border" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="businessName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Business Name</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. Ndovu Tech Store" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Category</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select a category" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {CATEGORIES.map((c) => (
                                <SelectItem key={c} value={c}>{c}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="fullName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Your Full Name</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. Jane Doe" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email Address</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="you@example.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem className="md:col-span-2">
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="••••••••" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* ── Section 2: Payment Reception ── */}
                <div className="space-y-5">
                  <div>
                    <h2 className="text-base font-extrabold text-foreground">Payment Reception</h2>
                    <hr className="mt-2 border-border" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    How will customers pay you? Money goes <strong className="text-foreground">directly to you</strong> — we never hold your funds.
                  </p>

                  {/* Payment method radio cards */}
                  <FormField
                    control={form.control}
                    name="paymentMethod"
                    render={({ field }) => (
                      <FormItem>
                        <div className="grid grid-cols-2 gap-3">
                          {/* M-Pesa */}
                          <button
                            type="button"
                            onClick={() => field.onChange("mpesa")}
                            className={`flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-all ${
                              field.value === "mpesa"
                                ? "border-primary bg-primary/5"
                                : "border-border bg-white hover:border-primary/40"
                            }`}
                          >
                            <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                              field.value === "mpesa" ? "border-primary" : "border-muted-foreground/40"
                            }`}>
                              {field.value === "mpesa" && (
                                <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                              )}
                            </span>
                            <div>
                              <p className="font-semibold text-sm text-foreground">M-Pesa</p>
                              <p className="text-xs text-muted-foreground">Till or Paybill number</p>
                            </div>
                          </button>
                          {/* Bank Account */}
                          <button
                            type="button"
                            onClick={() => field.onChange("bank")}
                            className={`flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-all ${
                              field.value === "bank"
                                ? "border-primary bg-primary/5"
                                : "border-border bg-white hover:border-primary/40"
                            }`}
                          >
                            <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                              field.value === "bank" ? "border-primary" : "border-muted-foreground/40"
                            }`}>
                              {field.value === "bank" && (
                                <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                              )}
                            </span>
                            <div>
                              <p className="font-semibold text-sm text-foreground">Bank Account</p>
                              <p className="text-xs text-muted-foreground">Receive via bank transfer</p>
                            </div>
                          </button>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* M-Pesa number (conditional) */}
                  {paymentMethod === "mpesa" && (
                    <FormField
                      control={form.control}
                      name="paybillNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Your M-Pesa Till / Paybill Number</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. 5557890 or 123456" {...field} />
                          </FormControl>
                          <FormDescription className="text-xs text-muted-foreground">
                            Customers will pay to this number. Enter a Till Number or Paybill Number.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>

                {/* ── Section 3: Trust & Verification ── */}
                <div className="space-y-5">
                  <div>
                    <h2 className="text-base font-extrabold text-foreground">
                      Trust &amp; Verification <span className="text-sm font-normal text-muted-foreground">(Optional)</span>
                    </h2>
                    <hr className="mt-2 border-border" />
                  </div>

                  {/* Info box */}
                  <div className="flex gap-3 rounded-xl bg-primary/5 border border-primary/20 p-4">
                    <ShieldCheck className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      These details help us verify real businesses and protect customers from fraud. Physical shop details are shown to customers. Your National ID / KRA PIN is stored securely and <strong className="text-foreground">never shared or displayed</strong> — it exists solely as a deterrent against scammers.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="buildingName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Building / Mall Name</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. Imenti House" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="stallNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Shop / Stall Number</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. Stall 42B" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="publicPhone"
                      render={({ field }) => (
                        <FormItem className="md:col-span-2">
                          <FormLabel>Public Business Phone</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. 0712 345 678" {...field} />
                          </FormControl>
                          <FormDescription className="text-xs text-muted-foreground">
                            Displayed to customers for calls
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="nationalId"
                      render={({ field }) => (
                        <FormItem className="md:col-span-2">
                          <FormLabel className="flex items-center gap-1.5">
                            <ShieldCheck className="h-4 w-4 text-primary" />
                            National ID Number or KRA PIN
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. 12345678 or A123456789B" {...field} />
                          </FormControl>
                          <FormDescription className="text-xs text-muted-foreground">
                            🔒 Stored encrypted. Never displayed, never shared. Used only to verify real business owners and deter fraud.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Error */}
                {signup.error && (
                  <div className="text-sm font-medium text-destructive bg-destructive/10 p-3 rounded-md">
                    {signup.error.message || "An error occurred. Please try again."}
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={signup.isPending}
                  className="w-full inline-flex h-13 items-center justify-center gap-2 rounded-xl bg-primary px-6 py-4 text-base font-semibold text-white shadow transition-all hover:bg-primary/90 disabled:opacity-60"
                >
                  {signup.isPending ? "Creating your shop…" : <>Create Account <ArrowRight className="h-5 w-5" /></>}
                </button>
              </form>
            </Form>
          </div>

          {/* Bottom link */}
          <p className="text-center text-sm text-muted-foreground mt-6">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-primary hover:underline">
              Log in instead
            </Link>
          </p>
        </div>
      </div>
    </PublicLayout>
  );
}
