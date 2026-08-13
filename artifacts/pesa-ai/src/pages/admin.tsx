import { Link, useLocation } from "wouter";
import { useGetMe, useLogout, useAdminLogin } from "@workspace/api-client-react";
import { LogOut, LayoutDashboard, Building2, AlertTriangle, ShieldCheck } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminOverviewTab } from "@/components/admin/overview-tab";
import { AdminBusinessesTab } from "@/components/admin/businesses-tab";
import { AdminReportsTab } from "@/components/admin/reports-tab";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data: me } = useGetMe();
  const logout = useLogout();
  const [, setLocation] = useLocation();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        setLocation("/");
      }
    });
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-zinc-950 text-zinc-50 font-sans">
      <header className="sticky top-0 z-50 w-full border-b border-zinc-800 bg-zinc-900 shadow-sm">
        <div className="container mx-auto px-4 md:px-6 flex h-14 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-100 text-zinc-900 font-bold text-xs">
              A
            </div>
            <span className="text-sm font-semibold tracking-wide text-zinc-100 uppercase">Adplay Media — Pesa AI Admin</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-zinc-400">Admin Session</span>
            <button 
              onClick={handleLogout}
              className="inline-flex h-8 items-center justify-center rounded-md px-3 text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
            >
              <LogOut className="h-3.5 w-3.5 mr-2" />
              Sign Out
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 flex flex-col p-4 md:p-6 lg:p-8 bg-zinc-950">
        <div className="container mx-auto w-full max-w-7xl">
          {children}
        </div>
      </main>
    </div>
  );
}

const adminLoginSchema = z.object({
  password: z.string().min(1, "Password is required"),
});

export default function AdminPage() {
  const { data: me, isLoading } = useGetMe();
  const adminLogin = useAdminLogin();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const form = useForm<z.infer<typeof adminLoginSchema>>({
    resolver: zodResolver(adminLoginSchema),
    defaultValues: { password: "" },
  });

  if (isLoading) return <div className="min-h-screen bg-zinc-950 text-zinc-50 flex items-center justify-center">Loading...</div>;

  // If they are a normal user (not admin), boot them to dashboard
  if (me?.authenticated && !me?.isAdmin) {
    setLocation("/dashboard");
    return null;
  }

  // If not authenticated as admin, show admin login
  if (!me?.isAdmin) {
    const onSubmit = (data: z.infer<typeof adminLoginSchema>) => {
      adminLogin.mutate({ data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        }
      });
    };

    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-50 flex items-center justify-center p-4 font-sans">
        <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 p-8 rounded-2xl shadow-2xl">
          <div className="flex flex-col items-center space-y-3 text-center mb-8">
            <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-100 mb-2 border border-zinc-700">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">System Access</h1>
            <p className="text-zinc-400 text-sm">Adplay Media Internal Staff Only</p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-zinc-300">Admin Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} className="bg-zinc-950 border-zinc-700 text-zinc-100 focus-visible:ring-zinc-600" />
                    </FormControl>
                    <FormMessage className="text-rose-400" />
                  </FormItem>
                )}
              />

              {adminLogin.error && (
                <div className="text-sm font-medium text-rose-400 bg-rose-950/30 p-3 rounded-md border border-rose-900">
                  {adminLogin.error.message || "Invalid admin credentials"}
                </div>
              )}

              <Button type="submit" className="w-full bg-zinc-100 text-zinc-900 hover:bg-zinc-200" size="lg" disabled={adminLogin.isPending}>
                {adminLogin.isPending ? "Authenticating..." : "Authorize"}
              </Button>
            </form>
          </Form>
        </div>
      </div>
    );
  }

  // They are admin, show the dashboard
  return (
    <AdminLayout>
      <div className="flex flex-col space-y-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Operations Control</h1>
          <p className="text-sm text-zinc-400">Platform-wide metrics, business management, and support requests.</p>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="flex flex-wrap w-full md:w-auto h-auto justify-start border-b border-zinc-800 bg-transparent p-0 gap-1 mb-6">
            <TabsTrigger value="overview" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 data-[state=active]:border-zinc-700 border border-transparent rounded-t-lg rounded-b-none px-4 py-2 text-sm text-zinc-400">
              <LayoutDashboard className="w-4 h-4 mr-2" /> Overview
            </TabsTrigger>
            <TabsTrigger value="businesses" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 data-[state=active]:border-zinc-700 border border-transparent rounded-t-lg rounded-b-none px-4 py-2 text-sm text-zinc-400">
              <Building2 className="w-4 h-4 mr-2" /> Businesses
            </TabsTrigger>
            <TabsTrigger value="reports" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 data-[state=active]:border-zinc-700 border border-transparent rounded-t-lg rounded-b-none px-4 py-2 text-sm text-zinc-400">
              <AlertTriangle className="w-4 h-4 mr-2" /> Reports
            </TabsTrigger>
          </TabsList>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl p-4 md:p-6 min-h-[500px] text-zinc-100">
            <TabsContent value="overview" className="m-0 focus-visible:outline-none">
              <AdminOverviewTab />
            </TabsContent>
            <TabsContent value="businesses" className="m-0 focus-visible:outline-none">
              <AdminBusinessesTab />
            </TabsContent>
            <TabsContent value="reports" className="m-0 focus-visible:outline-none">
              <AdminReportsTab />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
