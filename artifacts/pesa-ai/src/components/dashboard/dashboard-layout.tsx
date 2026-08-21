import { Link, useLocation } from "wouter";
import { SiWhatsapp } from "react-icons/si";
import {
  LayoutDashboard, Package, ShoppingCart, MessageSquare,
  Settings, LogOut, Phone, ChevronDown, User, Tag,
  Users, CreditCard, Layers, ScanLine, BarChart2,
  Menu, X,
} from "lucide-react";
import { useLogout, useGetMe } from "@workspace/api-client-react";
import { useState } from "react";

const WA_SUB_ITEMS = [
  { label: "Phone Number",     href: "/dashboard/whatsapp" },
  { label: "WABA ID",          href: "/dashboard/whatsapp" },
  { label: "Messaging Config", href: "/dashboard/whatsapp" },
];

const STOCK_SUB_ITEMS = [
  { label: "Stock In",   href: "/dashboard/stock/in" },
  { label: "Quick Sale", href: "/dashboard/stock/sale" },
  { label: "Stock Take", href: "/dashboard/stock/take" },
  { label: "History",    href: "/dashboard/stock/history" },
];

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { data: me } = useGetMe();
  const logout = useLogout();

  const waActive    = location.startsWith("/dashboard/whatsapp");
  const stockActive = location.startsWith("/dashboard/stock");

  const [waOpen,    setWaOpen]    = useState(waActive);
  const [stockOpen, setStockOpen] = useState(stockActive);
  const [mobileOpen, setMobileOpen] = useState(false);

  const closeMobile = () => setMobileOpen(false);

  const handleLogout = () => {
    logout.mutate(undefined, { onSuccess: () => setLocation("/login") });
  };

  const isActive = (href: string) =>
    href === "/dashboard"
      ? location === "/dashboard"
      : location.startsWith(href);

  const navLink = (href: string, label: string, Icon: React.ElementType) => (
    <Link
      key={href}
      href={href}
      onClick={closeMobile}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        isActive(href)
          ? "bg-primary text-white"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      {label}
    </Link>
  );

  const expandable = (
    label: string,
    Icon: React.ElementType,
    active: boolean,
    open: boolean,
    toggle: () => void,
    primaryHref: string,
    subItems: { label: string; href: string }[]
  ) => (
    <div>
      <button
        onClick={() => { toggle(); if (!active) { setLocation(primaryHref); closeMobile(); } }}
        className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          active
            ? "bg-primary text-white"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        <Icon className="h-4 w-4 flex-shrink-0" />
        <span className="flex-1 text-left">{label}</span>
        <ChevronDown className={`h-3.5 w-3.5 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {(open || active) && (
        <div className="mt-0.5 ml-4 border-l-2 border-primary/20 pl-2 space-y-0.5">
          {subItems.map(({ label: sub, href }) => (
            <Link
              key={sub}
              href={href}
              onClick={closeMobile}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                location === href
                  ? "text-primary font-semibold"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {sub}
            </Link>
          ))}
        </div>
      )}
    </div>
  );

  const businessName  = (me as any)?.business?.name  || "My Shop";
  const accountEmail  = (me as any)?.account?.email  || "";
  const initials      = businessName.slice(0, 2).toUpperCase();

  const sidebar = (
    <aside className={`
      fixed sm:relative inset-y-0 left-0 z-50
      flex flex-col w-52 flex-shrink-0
      bg-white border-r border-border
      transition-transform duration-250 ease-in-out
      ${mobileOpen ? "translate-x-0" : "-translate-x-full sm:translate-x-0"}
    `}>
      {/* Logo */}
      <div className="flex items-center justify-between gap-2 px-4 py-4 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm flex-shrink-0">
            <SiWhatsapp className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <span className="text-sm font-bold tracking-tight text-foreground">Pesa AI</span>
            <p className="text-[10px] text-muted-foreground leading-none mt-0.5">Vendor Dashboard</p>
          </div>
        </div>
        {/* Close button — mobile only */}
        <button
          onClick={closeMobile}
          className="sm:hidden p-1.5 rounded-lg hover:bg-muted text-muted-foreground flex-shrink-0"
          aria-label="Close menu"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {navLink("/dashboard", "Dashboard", LayoutDashboard)}

        {/* BUSINESS section */}
        <p className="px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
          Business
        </p>

        {navLink("/dashboard/profile",   "Business Profile", User)}

        {expandable(
          "WhatsApp Account", Phone,
          waActive, waOpen, () => setWaOpen((o) => !o),
          "/dashboard/whatsapp", WA_SUB_ITEMS
        )}

        {navLink("/dashboard/products",   "Products",  Package)}
        {navLink("/dashboard/video-scan", "Stock Scanner", ScanLine)}

        {expandable(
          "Stock", Layers,
          stockActive, stockOpen, () => setStockOpen((o) => !o),
          "/dashboard/stock/in", STOCK_SUB_ITEMS
        )}

        {navLink("/dashboard/prices",    "Prices",    Tag)}
        {navLink("/dashboard/customers", "Customers", Users)}
        {navLink("/dashboard/orders",    "Orders",    ShoppingCart)}
        {navLink("/dashboard/payments",  "Payments",  CreditCard)}
        {navLink("/dashboard/sales",     "Reports",   BarChart2)}
        {navLink("/dashboard/settings",  "Settings",  Settings)}
      </nav>

      {/* Bottom: user info + logout */}
      <div className="border-t border-border px-3 py-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white text-xs font-bold flex-shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground truncate">{businessName}</p>
            <p className="text-[10px] text-muted-foreground truncate">{accountEmail}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-xs font-medium text-red-500 hover:text-red-600 transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
          Log out
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-[100dvh] bg-[#f7f7f5]">

      {/* ── Mobile top bar ── */}
      <div className="sm:hidden fixed top-0 inset-x-0 z-40 flex items-center gap-3 px-4 h-14 bg-white border-b border-border shadow-sm">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 -ml-2 rounded-lg hover:bg-muted text-muted-foreground"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-white flex-shrink-0">
            <SiWhatsapp className="h-3.5 w-3.5" />
          </div>
          <span className="text-sm font-bold text-foreground truncate">{businessName}</span>
        </div>
      </div>

      {/* ── Mobile backdrop overlay ── */}
      {mobileOpen && (
        <div
          className="sm:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          onClick={closeMobile}
        />
      )}

      {/* ── Sidebar (drawer on mobile, fixed column on desktop) ── */}
      {sidebar}

      {/* ── Main content ── */}
      <main className="flex-1 overflow-auto pt-14 sm:pt-0">
        {children}
      </main>
    </div>
  );
}
