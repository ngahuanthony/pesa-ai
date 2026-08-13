import { PublicLayout } from "@/components/layout";
import { useLogin } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useLocation } from "wouter";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";
import { useEffect } from "react";
import { Store } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export default function LoginPage() {
  const { me } = useAuthRedirect();
  const [, setLocation] = useLocation();
  const login = useLogin();

  useEffect(() => {
    if (me?.authenticated && !me?.isAdmin) setLocation("/dashboard");
    if (me?.isAdmin) setLocation("/admin");
  }, [me, setLocation]);

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = (data: z.infer<typeof loginSchema>) => {
    login.mutate({ data }, {
      onSuccess: () => setLocation("/dashboard"),
    });
  };

  return (
    <PublicLayout>
      <div className="flex-1 flex items-center justify-center py-12 px-4 bg-[#f7f7f5]">
        <div className="w-full max-w-md bg-white rounded-2xl border border-border p-8 shadow-sm">

          {/* Header */}
          <div className="flex flex-col items-center text-center mb-7 space-y-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Store className="h-6 w-6" />
            </div>
            <h1 className="text-3xl font-extrabold text-foreground">Welcome back</h1>
            <p className="text-sm text-muted-foreground">Log in to manage your WhatsApp shop</p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              {/* Email */}
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

              {/* Password with Forgot password? inline */}
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>Password</FormLabel>
                      <Link href="/forgot-password" className="text-xs text-primary hover:underline">
                        Forgot password?
                      </Link>
                    </div>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {login.error && (
                <div className="text-sm font-medium text-destructive bg-destructive/10 p-3 rounded-md">
                  {login.error.message || "Invalid credentials"}
                </div>
              )}

              <button
                type="submit"
                disabled={login.isPending}
                className="w-full inline-flex h-12 items-center justify-center rounded-xl bg-primary text-white font-semibold text-sm shadow transition-all hover:bg-primary/90 disabled:opacity-60"
              >
                {login.isPending ? "Logging in…" : "Log in"}
              </button>
            </form>
          </Form>

          {/* Bottom link */}
          <p className="text-center text-sm text-muted-foreground mt-6">
            Don't have an account?{" "}
            <Link href="/signup" className="font-semibold text-primary hover:underline">
              Sign up for free
            </Link>
          </p>
        </div>
      </div>
    </PublicLayout>
  );
}
