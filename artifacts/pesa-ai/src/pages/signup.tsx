import { PublicLayout } from "@/components/layout";
import { useSignup } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";
import { useEffect } from "react";

const signupSchema = z.object({
  businessName: z.string().min(2, "Business name is required"),
  category: z.string().min(1, "Category is required"),
  businessPhone: z.string().min(9, "Valid phone number required"),
  paybillNumber: z.string().optional(),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  plan: z.enum(["Starter", "Business", "Pro"]),
  consent: z.literal(true, {
    errorMap: () => ({ message: "You must agree to the terms" }),
  }),
});

export default function SignupPage() {
  const { me } = useAuthRedirect();
  const [location, setLocation] = useLocation();
  const signup = useSignup();

  // Redirect if already authenticated
  useEffect(() => {
    if (me?.authenticated && !me?.isAdmin) setLocation("/dashboard");
    if (me?.isAdmin) setLocation("/admin");
  }, [me, setLocation]);

  // Get plan from URL query if available
  const searchParams = new URLSearchParams(window.location.search);
  const defaultPlan = (searchParams.get("plan") as "Starter" | "Business" | "Pro") || "Business";

  const form = useForm<z.infer<typeof signupSchema>>({
    resolver: zodResolver(signupSchema) as any,
    defaultValues: {
      businessName: "",
      category: "",
      businessPhone: "",
      paybillNumber: "",
      email: "",
      password: "",
      plan: defaultPlan,
      consent: false as any,
    },
  });

  const onSubmit = (data: z.infer<typeof signupSchema>) => {
    signup.mutate({ data }, {
      onSuccess: () => {
        setLocation("/dashboard");
      }
    });
  };

  return (
    <PublicLayout>
      <div className="flex-1 flex items-center justify-center py-12 px-4 bg-muted/30">
        <div className="w-full max-w-xl space-y-6 bg-card border border-border p-8 rounded-2xl shadow-xl">
          <div className="flex flex-col space-y-2 text-center mb-6">
            <h1 className="text-3xl font-bold tracking-tight">Create your account</h1>
            <p className="text-muted-foreground text-sm">
              Start automating your WhatsApp sales today
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="businessName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Business Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Acme Ltd" {...field} />
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
                            <SelectValue placeholder="Select industry" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Retail & Fashion">Retail & Fashion</SelectItem>
                          <SelectItem value="Electronics & Gadgets">Electronics & Gadgets</SelectItem>
                          <SelectItem value="Beauty & Cosmetics">Beauty & Cosmetics</SelectItem>
                          <SelectItem value="Food & Beverages">Food & Beverages</SelectItem>
                          <SelectItem value="Home & Furniture">Home & Furniture</SelectItem>
                          <SelectItem value="Services">Services</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="businessPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>WhatsApp Phone Number</FormLabel>
                      <FormControl>
                        <Input placeholder="254700000000" {...field} />
                      </FormControl>
                      <FormDescription className="text-xs">Your main WhatsApp Business number</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="paybillNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>M-Pesa Paybill / Till (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="123456" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
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
                
                <FormField
                  control={form.control}
                  name="plan"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Subscription Plan</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select plan" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Starter">Starter (KES 2,999/mo)</SelectItem>
                          <SelectItem value="Business">Business (KES 4,999/mo)</SelectItem>
                          <SelectItem value="Pro">Pro (KES 9,999/mo)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="consent"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 p-4 border rounded-md bg-muted/50">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>
                        I agree to the terms and conditions
                      </FormLabel>
                      <FormDescription>
                        By signing up, you agree to Pesa AI's Terms of Service and Privacy Policy.
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />

              {signup.error && (
                <div className="text-sm font-medium text-destructive bg-destructive/10 p-3 rounded-md">
                  {signup.error.message || "An error occurred during signup"}
                </div>
              )}

              <Button type="submit" className="w-full" size="lg" disabled={signup.isPending}>
                {signup.isPending ? "Creating account..." : "Sign Up"}
              </Button>
            </form>
          </Form>

          <div className="text-center text-sm text-muted-foreground mt-4">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-primary hover:underline">
              Log in
            </Link>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
