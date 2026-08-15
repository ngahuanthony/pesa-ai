import { Link, useLocation } from "wouter";
import { SiWhatsapp } from "react-icons/si";
import {
  LayoutDashboard, Package, ShoppingCart, MessageSquare,
  CreditCard, Settings, LogOut, Wifi, Phone, ChevronDown,
} from "lucide-react";
import { useLogout, useGetMe } from "@workspace/api-client-react";
import { useState } from "react";

const WA_SUB_ITEMS = [
  { label: "Phone Number",    href: "/dashboard/whatsapp" },
  { label: "WABA ID",         href: "/dashboard/whatsapp" },
  { label: "Messaging Config",href: "/dashboard/whatsapp" },
];

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { data: me } = useGetMe();
  const logout = useLogout();

  const waActive = location.startsWith("/dashboard/whatsapp");
  const [waOpen, setWaOpen] = useState(waActive);

  const handleLogout = () => {
    logout.mutate(undefined, { onSuccess: () => setLocation("/login") });
  };

  const navLink = (href: string, label: string, Icon: React.ElementType) => {
    const isActive = href === "/dashboard"
      ? location === "/dashboard"
      : location.startsWith(href);
    return (
      <Link
        key={href}
        href={href}
        className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
          isActive
            ? "bg-primary text-white"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        <Icon className="h-4 w-4 flex-shrink-0" />
        {label}
      </Link>
    );
  };

  return (
    <div className="flex min-h-[100dvh] bg-[#f7f7f5]">
      {/* ── Sidebar ── */}
      <aside className="w-48 flex-shrink-0 flex flex-col bg-white border-r border-border">
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <SiWhatsapp className="h-4 w-4" />
          </div>
          <div>
            <span className="text-base font-bold tracking-tight text-foreground">Pesa AI</span>
            <p className="text-[10px] text-muted-foreground leading-none mt-0.5">Vendor Dashboard</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 space-y-0.5 mt-1">
          {navLink("/dashboard", "Dashboard", LayoutDashboard)}

          {/* ── WhatsApp Account (expandable) ── */}
          <div>
            <button
              onClick={() => { setWaOpen((o) => !o); if (!waActive) setLocation("/dashboard/whatsapp"); }}
              className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                waActive
                  ? "bg-primary text-white"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Wifi className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1 text-left">WhatsApp Account</span>
              <ChevronDown className={`h-3.5 w-3.5 flex-shrink-0 transition-transform ${waOpen ? "rotate-180" : ""}`} />
            </button>

            {(waOpen || waActive) && (
              <div className="mt-0.5 ml-4 border-l-2 border-primary/20 pl-2 space-y-0.5">
                {WA_SUB_ITEMS.map(({ label, href }) => (
                  <Link
                    key={label}
                    href={href}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <Phone className="h-3 w-3 flex-shrink-0 text-primary/60" />
                    {label}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {navLink("/dashboard/products",  "Products",    Package)}
          {navLink("/dashboard/orders",    "Orders",      ShoppingCart)}
          {navLink("/dashboard/chat",      "Chat Tester", MessageSquare)}
          {navLink("/dashboard/billing",   "Billing",     CreditCard)}
          {navLink("/dashboard/settings",  "Settings",    Settings)}
        </nav>

        {/* Bottom: user info + logout */}
        <div className="border-t border-border px-4 py-4 space-y-1.5">
          <p className="text-xs font-semibold text-foreground truncate">{me?.business?.name || "My Shop"}</p>
          <p className="text-[11px] text-muted-foreground truncate">{me?.account?.email || ""}</p>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-xs font-medium text-red-500 hover:text-red-600 transition-colors mt-1"
          >
            <LogOut className="h-3.5 w-3.5" />
            Log out
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-auto p-8">
        {children}
      </main>
    </div>
  );
}
