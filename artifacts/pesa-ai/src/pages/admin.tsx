import { useState } from "react";
import { useGetMe, useLogout, useAdminLogin, useAdminGetStats } from "@workspace/api-client-react";
import { LogOut, ShieldCheck, Users, MessageSquare, BarChart3, AlertTriangle } from "lucide-react";
import { AdminBusinessesTab } from "@/components/admin/businesses-tab";
import { AdminReportsTab } from "@/components/admin/reports-tab";
import { AdminWhatsAppTab } from "@/components/admin/whatsapp-tab";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";

// ── Login ─────────────────────────────────────────────────────────────────
const adminLoginSchema = z.object({ password: z.string().min(1, "Password is required") });

function AdminLogin() {
  const adminLogin = useAdminLogin();

  const form = useForm<z.infer<typeof adminLoginSchema>>({
    resolver: zodResolver(adminLoginSchema),
    defaultValues: { password: "" },
  });

  const onSubmit = (data: z.infer<typeof adminLoginSchema>) => {
    adminLogin.mutate({ data }, {
      onSuccess: () => {
        // Hard reload so the new session cookie is picked up cleanly
        window.location.href = "/admin";
      },
    });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ background: "#080d1a" }}>
      <div className="flex flex-col items-center text-center mb-6 space-y-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-primary/60 bg-primary/10">
          <ShieldCheck className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">System Admin</h1>
        <p className="text-sm text-zinc-400">Secure access only</p>
      </div>
      <div className="w-full max-w-sm rounded-2xl p-6 space-y-4" style={{ background: "#111827" }}>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-zinc-300 text-sm">Admin Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" {...field} className="bg-zinc-950 border-zinc-700 text-zinc-100 focus-visible:ring-primary" />
                  </FormControl>
                  <FormMessage className="text-rose-400" />
                </FormItem>
              )}
            />
            {adminLogin.error && (
              <div className="text-sm text-rose-400 bg-rose-950/30 p-3 rounded-lg border border-rose-900">
                {adminLogin.error.message || "Invalid admin credentials"}
              </div>
            )}
            <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-white font-semibold" size="lg" disabled={adminLogin.isPending}>
              {adminLogin.isPending ? "Authenticating…" : "Authorize Access"}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
}

// ── Admin Shell ───────────────────────────────────────────────────────────
type Section = "businesses" | "whatsapp" | "reports";

function AdminShell() {
  const [section, setSection] = useState<Section>("businesses");
  const [clientsTab, setClientsTab] = useState<"clients" | "reports">("clients");
  const logout = useLogout();
  const { data: stats } = useAdminGetStats();
  const queryClient = useQueryClient();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() }); },
    });
  };

  const navItems: { key: Section; icon: typeof Users; label: string }[] = [
    { key: "businesses", icon: Users, label: "Businesses" },
    { key: "whatsapp", icon: MessageSquare, label: "WhatsApp" },
  ];

  return (
    <div className="flex min-h-screen">
      {/* ── Sidebar ── */}
      <aside className="flex flex-col w-44 flex-shrink-0" style={{ background: "#080d1a" }}>
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 py-5 border-b border-white/5">
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-primary/50 bg-primary/10 flex-shrink-0">
            <ShieldCheck className="h-4 w-4 text-primary" />
          </div>
          <span className="text-sm font-bold text-white">Pesa Admin</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 space-y-0.5">
          {navItems.map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => setSection(key)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                section === key
                  ? "bg-primary/15 text-primary"
                  : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
              }`}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {label}
            </button>
          ))}
        </nav>

        {/* Logout */}
        <div className="px-2 py-4 border-t border-white/5">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors"
          >
            <LogOut className="h-4 w-4 flex-shrink-0" />
            Log out
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 overflow-auto bg-white min-h-screen">
        {section === "businesses" && (
          <div className="p-8 max-w-6xl">
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">System Administration</h1>
            <p className="text-gray-500 mt-1 mb-6">Manage platform tenants and monitor abuse.</p>

            {/* Pill tabs */}
            <div className="flex gap-0 mb-6 w-fit border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setClientsTab("clients")}
                className={`px-5 py-2.5 text-sm font-medium transition-colors ${clientsTab === "clients" ? "bg-white text-gray-900 shadow-sm" : "bg-gray-50 text-gray-500 hover:text-gray-700"}`}
              >
                Clients ({stats?.totalBusinesses ?? "…"})
              </button>
              <button
                onClick={() => setClientsTab("reports")}
                className={`px-5 py-2.5 text-sm font-medium transition-colors ${clientsTab === "reports" ? "bg-white text-gray-900 shadow-sm" : "bg-gray-50 text-gray-500 hover:text-gray-700"}`}
              >
                Reports ({stats?.openReports ?? "…"})
              </button>
            </div>

            {clientsTab === "clients" && <AdminBusinessesTab onConfigureWhatsApp={() => setSection("whatsapp")} />}
            {clientsTab === "reports" && <AdminReportsTab />}
          </div>
        )}

        {section === "whatsapp" && (
          <div className="p-8 max-w-4xl">
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">WhatsApp Configuration</h1>
            <p className="text-gray-500 mt-1 mb-6">Set up Meta Cloud API credentials per business. Businesses never see this screen.</p>
            {/* Render whatsapp tab in dark card to preserve its look */}
            <div className="rounded-2xl p-6" style={{ background: "#0f172a" }}>
              <AdminWhatsAppTab />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ── Page entry ────────────────────────────────────────────────────────────
export default function AdminPage() {
  const { data: me, isLoading } = useGetMe();
  const [, setLocation] = useState<string>("");

  if (isLoading) {
    return <div className="min-h-screen text-zinc-400 flex items-center justify-center text-sm" style={{ background: "#080d1a" }}>Loading…</div>;
  }

  if (me?.authenticated && !me?.isAdmin) {
    window.location.href = "/dashboard";
    return null;
  }

  if (!me?.isAdmin) return <AdminLogin />;

  return <AdminShell />;
}
