import { useGetMe, useListOrders, useListProducts, useGetSalesSummary, getListOrdersQueryKey, getListProductsQueryKey, getGetSalesSummaryQueryKey } from "@workspace/api-client-react";
import { ShoppingCart, DollarSign, Package, MessageSquare, Bot, UserCheck, AlertTriangle } from "lucide-react";
import { Link } from "wouter";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

interface HandoverConvo {
  conversationId: string;
  customerId: string;
  customerPhone: string | null;
  customerName: string | null;
  handoverAt: string | null;
  lastMessage: string | null;
}

export function OverviewTab() {
  const { data: me } = useGetMe();
  const businessId  = (me as any)?.business?.id || "";
  const businessName = (me as any)?.business?.name || "your shop";
  const { toast } = useToast();

  const { data: ordersData }   = useListOrders(businessId,   { query: { enabled: !!businessId, queryKey: getListOrdersQueryKey(businessId) } });
  const { data: productsData } = useListProducts(businessId, { query: { enabled: !!businessId, queryKey: getListProductsQueryKey(businessId) } });
  const { data: salesData }    = useGetSalesSummary(businessId, { query: { enabled: !!businessId, queryKey: getGetSalesSummaryQueryKey(businessId) } });

  const [handoverConvos, setHandoverConvos] = useState<HandoverConvo[]>([]);
  const [resumingId, setResumingId]         = useState<string | null>(null);

  const fetchHandover = async () => {
    if (!businessId) return;
    try {
      const res = await fetch(`/api/businesses/${businessId}/conversations`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setHandoverConvos(data.conversations || []);
      }
    } catch { /* ignore */ }
  };

  useEffect(() => { fetchHandover(); }, [businessId]);

  const handleResumeAI = async (customerPhone: string) => {
    setResumingId(customerPhone);
    try {
      await fetch(`/api/businesses/${businessId}/conversations/${encodeURIComponent(customerPhone)}/resume-ai`, {
        method: "POST",
        credentials: "include",
      });
      toast({ title: "AI resumed for this customer" });
      await fetchHandover();
    } catch {
      toast({ title: "Failed to resume AI", variant: "destructive" });
    } finally {
      setResumingId(null);
    }
  };

  const orders       = (ordersData   as any)?.orders   || [];
  const products     = (productsData as any)?.products || [];
  const totalRevenue = (salesData    as any)?.totalRevenue || 0;
  const recentOrders = orders.slice(0, 5);

  const stats = [
    {
      label: "Total Products",
      value: String(products.length),
      link: { label: "Add products",  href: "/dashboard/products" },
      icon: Package,
      iconBg: "bg-purple-100",
      iconColor: "text-purple-600",
    },
    {
      label: "Total Orders",
      value: String(orders.length),
      link: { label: "View orders",   href: "/dashboard/orders" },
      icon: ShoppingCart,
      iconBg: "bg-orange-100",
      iconColor: "text-orange-500",
    },
    {
      label: "Total Revenue",
      value: `KSh ${totalRevenue.toLocaleString()}`,
      link: { label: "View reports",  href: "/dashboard/sales" },
      icon: DollarSign,
      iconBg: "bg-green-100",
      iconColor: "text-green-600",
    },
    {
      label: "Need Attention",
      value: String(handoverConvos.length),
      link: { label: handoverConvos.length > 0 ? "See below ↓" : "All good", href: "#handover" },
      icon: handoverConvos.length > 0 ? AlertTriangle : UserCheck,
      iconBg: handoverConvos.length > 0 ? "bg-amber-100" : "bg-blue-100",
      iconColor: handoverConvos.length > 0 ? "text-amber-600" : "text-blue-500",
    },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* ── Hero banner ── */}
      <div className="rounded-2xl bg-[#0d3d26] text-white p-7">
        <h2 className="text-xl font-bold mb-1">Pesa AI – Your WhatsApp Shop, Simplified.</h2>
        <p className="text-white/70 text-sm mb-4">Upload. Connect. Sell. AI handles the rest.</p>
        <div className="flex flex-wrap gap-4 text-sm text-white/80">
          <span className="flex items-center gap-1.5"><span className="text-green-400">✓</span> Easy Setup</span>
          <span className="flex items-center gap-1.5"><span className="text-green-400">✓</span> Manage Stock</span>
          <span className="flex items-center gap-1.5"><span className="text-green-400">✓</span> Connect WhatsApp</span>
        </div>
      </div>

      {/* ── Section title ── */}
      <div>
        <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Welcome to {businessName}! Here's your shop overview.</p>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, link, icon: Icon, iconBg, iconColor }) => (
          <div key={label} className="bg-white rounded-xl border border-border p-5 shadow-sm">
            <div className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${iconBg} mb-3`}>
              <Icon className={`h-5 w-5 ${iconColor}`} />
            </div>
            <p className="text-xs text-muted-foreground font-medium">{label}</p>
            <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
            {link.href.startsWith("#") ? (
              <span className="text-xs font-medium text-primary mt-1 inline-block">{link.label}</span>
            ) : (
              <Link href={link.href} className="text-xs font-medium text-primary hover:underline mt-1 inline-block">
                {link.label}
              </Link>
            )}
          </div>
        ))}
      </div>

      {/* ── Human handover alert ── */}
      {handoverConvos.length > 0 && (
        <div id="handover" className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-amber-200 bg-amber-100/60">
            <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
            <h2 className="font-semibold text-amber-800 text-sm">
              {handoverConvos.length} customer{handoverConvos.length !== 1 ? "s" : ""} waiting for you
            </h2>
            <span className="ml-auto text-xs text-amber-600">AI is paused for these chats</span>
          </div>
          <div className="divide-y divide-amber-100">
            {handoverConvos.map((c) => (
              <div key={c.conversationId} className="flex items-center justify-between px-5 py-3 gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">{c.customerName || c.customerPhone || "Customer"}</p>
                  {c.customerName && <p className="text-xs text-muted-foreground">{c.customerPhone}</p>}
                  {c.lastMessage && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">"{c.lastMessage}"</p>
                  )}
                  {c.handoverAt && (
                    <p className="text-[11px] text-amber-600 mt-0.5">
                      Requested {new Date(c.handoverAt).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleResumeAI(c.customerPhone || c.customerId)}
                  disabled={resumingId === (c.customerPhone || c.customerId)}
                  className="flex-shrink-0 rounded-lg bg-white border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-50 transition-colors"
                >
                  {resumingId === (c.customerPhone || c.customerId) ? "Resuming…" : "Resume AI →"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Bottom row ── */}
      <div className="grid lg:grid-cols-[1fr_320px] gap-4">
        {/* Recent Orders */}
        <div className="bg-white rounded-xl border border-border p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground">Recent Orders</h2>
            <Link href="/dashboard/orders" className="text-xs font-medium text-primary hover:underline flex items-center gap-1">
              View all orders →
            </Link>
          </div>

          {recentOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
                <ShoppingCart className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="font-medium text-sm text-foreground">No orders yet</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[220px]">
                Once customers start ordering through your WhatsApp shop, their orders will appear here.
              </p>
              <Link
                href="/dashboard/whatsapp"
                className="mt-4 inline-flex h-8 items-center justify-center rounded-full bg-primary px-4 text-xs font-semibold text-white hover:bg-primary/90"
              >
                Connect WhatsApp to start
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {recentOrders.map((order: any) => (
                <div key={order.id} className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
                  <div>
                    <p className="text-sm font-medium text-foreground">{order.customerPhone}</p>
                    <p className="text-xs text-muted-foreground capitalize">{order.status}</p>
                  </div>
                  <p className="text-sm font-semibold text-foreground">KSh {(order.total || 0).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* AI Activity Feed */}
        <div className="bg-white rounded-xl border border-border p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Bot className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-foreground">AI Activity Feed</h2>
          </div>

          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
              <Bot className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No activity yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Your AI's actions will show here once WhatsApp is connected.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
