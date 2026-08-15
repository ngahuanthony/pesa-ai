import { Package, PlusCircle, MinusCircle, ClipboardList, History } from "lucide-react";
import { Link, useLocation } from "wouter";
import { StockInTab } from "./stock-in-tab";

const SECTIONS = [
  {
    slug: "in",
    icon: PlusCircle,
    title: "Stock In",
    desc: "Record incoming stock — new purchases, deliveries, or restocks.",
    href: "/dashboard/stock/in",
    color: "text-green-600",
    bg:   "bg-green-50",
  },
  {
    slug: "sale",
    icon: MinusCircle,
    title: "Quick Sale",
    desc: "Record a manual sale and immediately deduct it from stock.",
    href: "/dashboard/stock/sale",
    color: "text-orange-500",
    bg:   "bg-orange-50",
  },
  {
    slug: "take",
    icon: ClipboardList,
    title: "Stock Take",
    desc: "Audit your physical stock and reconcile against system counts.",
    href: "/dashboard/stock/take",
    color: "text-blue-600",
    bg:   "bg-blue-50",
  },
  {
    slug: "history",
    icon: History,
    title: "Stock History",
    desc: "View a full log of all stock movements and adjustments.",
    href: "/dashboard/stock/history",
    color: "text-purple-600",
    bg:   "bg-purple-50",
  },
];

export function StockTab() {
  const [location] = useLocation();
  const sub = location.split("/").pop(); // in | sale | take | history

  const active = SECTIONS.find((s) => s.slug === sub);

  if (sub === "in") return <StockInTab />;

  if (active) {
    const { icon: Icon, title, color, bg } = active;
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className={`flex h-16 w-16 items-center justify-center rounded-full ${bg} mb-4`}>
          <Icon className={`h-8 w-8 ${color}`} />
        </div>
        <h2 className="text-xl font-bold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-[320px]">
          Full stock management is coming soon. This feature will let you {title.toLowerCase()} with ease.
        </p>
        <Link href="/dashboard/products" className="mt-6 inline-flex h-9 items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-white hover:bg-primary/90">
          Manage Products instead
        </Link>
      </div>
    );
  }

  // Overview grid
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        {SECTIONS.map(({ icon: Icon, title, desc, href, color, bg }) => (
          <Link key={title} href={href}>
            <div className="flex items-start gap-4 bg-white border border-border rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer group">
              <div className={`flex h-11 w-11 items-center justify-center rounded-full ${bg} flex-shrink-0`}>
                <Icon className={`h-5 w-5 ${color}`} />
              </div>
              <div>
                <p className="font-semibold text-foreground group-hover:text-primary transition-colors">{title}</p>
                <p className="text-sm text-muted-foreground mt-0.5">{desc}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
      <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <Package className="h-4 w-4 text-amber-600 flex-shrink-0" />
        <p className="text-sm text-amber-800">Full stock management is coming soon. For now, manage your products from the <Link href="/dashboard/products" className="underline font-medium">Products</Link> tab.</p>
      </div>
    </div>
  );
}
