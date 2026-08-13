import { Link, useLocation } from "wouter";
import { SiWhatsapp } from "react-icons/si";
import { LayoutDashboard, Package, ShoppingCart, MessageSquare, CreditCard, Settings, LogOut } from "lucide-react";
import { useLogout, useGetMe } from "@workspace/api-client-react";

const NAV_ITEMS = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { label: "Products",  icon: Package,         href: "/dashboard/products" },
  { label: "Orders",    icon: ShoppingCart,    href: "/dashboard/orders" },
  { label: "Chat Tester", icon: MessageSquare, href: "/dashboard/chat" },
  { label: "Billing",   icon: CreditCard,      href: "/dashboard/billing" },
  { label: "Settings",  icon: Settings,        href: "/dashboard/settings" },
];

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { data: me } = useGetMe();
  const logout = useLogout();

  const handleLogout = () => {
    logout.mutate(undefined, { onSuccess: () => setLocation("/login") });
  };

  return (
    <div className="flex min-h-[100dvh] bg-[#f7f7f5]">
      {/* ── Sidebar ── */}
      <aside className="w-44 flex-shrink-0 flex flex-col bg-white border-r border-border">
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <SiWhatsapp className="h-4 w-4" />
          </div>
          <span className="text-base font-bold tracking-tight text-foreground">Pesa AI</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 space-y-0.5 mt-1">
          {NAV_ITEMS.map(({ label, icon: Icon, href }) => {
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
          })}
        </nav>

        {/* Bottom: user info + logout */}
        <div className="border-t border-border px-4 py-4 space-y-2">
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
