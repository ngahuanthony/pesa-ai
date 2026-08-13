import { useGetMe, useListOrders, useListProducts, useGetSalesSummary, getListOrdersQueryKey, getListProductsQueryKey, getGetSalesSummaryQueryKey } from "@workspace/api-client-react";
import { ShoppingCart, DollarSign, Package, MessageSquare, TrendingUp, RefreshCw } from "lucide-react";
import { Link } from "wouter";

export function OverviewTab() {
  const { data: me } = useGetMe();
  const businessId = me?.business?.id || "";
  const { data: ordersData } = useListOrders(businessId, { query: { enabled: !!businessId, queryKey: getListOrdersQueryKey(businessId) } });
  const { data: productsData } = useListProducts(businessId, { query: { enabled: !!businessId, queryKey: getListProductsQueryKey(businessId) } });
  const { data: salesData } = useGetSalesSummary(businessId, { query: { enabled: !!businessId, queryKey: getGetSalesSummaryQueryKey(businessId) } });

  const orders = (ordersData as any)?.orders || [];
  const products = (productsData as any)?.products || [];
  const pendingOrders = orders.filter((o: any) => o.status === "pending").length;
  const activeProducts = products.filter((p: any) => p.isActive !== false).length;
  const totalRevenue = (salesData as any)?.totalRevenue || 0;
  const recentOrders = orders.slice(0, 5);

  const stats = [
    {
      label: "Total Revenue",
      value: `KSh ${totalRevenue.toLocaleString()}`,
      sub: "+12% from last month",
      icon: DollarSign,
      iconColor: "text-primary",
      subColor: "text-primary",
    },
    {
      label: "Pending Orders",
      value: String(pendingOrders),
      icon: ShoppingCart,
      iconColor: "text-amber-500",
    },
    {
      label: "Active Products",
      value: String(activeProducts),
      icon: Package,
      iconColor: "text-blue-500",
    },
    {
      label: "Conversations",
      value: "0",
      icon: MessageSquare,
      iconColor: "text-muted-foreground",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Overview</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Here is what's happening with your shop today.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, sub, icon: Icon, iconColor, subColor }) => (
          <div key={label} className="bg-white rounded-xl border border-border p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-muted-foreground font-medium">{label}</p>
              <Icon className={`h-4 w-4 ${iconColor}`} />
            </div>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            {sub && (
              <p className={`text-xs mt-1 flex items-center gap-1 ${subColor || "text-muted-foreground"}`}>
                <TrendingUp className="h-3 w-3" /> {sub}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Bottom two-column */}
      <div className="grid lg:grid-cols-[1fr_280px] gap-4">
        {/* Recent Orders */}
        <div className="bg-white rounded-xl border border-border p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-foreground">Recent Orders</h2>
              <p className="text-xs text-muted-foreground">Your latest customer purchases</p>
            </div>
            <Link
              href="/dashboard/orders"
              className="text-xs font-medium text-primary hover:underline"
            >
              View All
            </Link>
          </div>

          {recentOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
                <ShoppingCart className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="font-semibold text-foreground text-sm">No orders yet</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[240px]">
                When customers complete a purchase via WhatsApp, it will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentOrders.map((order: any) => (
                <div key={order.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div>
                    <p className="text-sm font-medium text-foreground">{order.customerPhone}</p>
                    <p className="text-xs text-muted-foreground">{order.status}</p>
                  </div>
                  <p className="text-sm font-semibold text-foreground">KSh {(order.total || 0).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* AI Assistant panel */}
        <div className="bg-white rounded-xl border border-border p-5 shadow-sm space-y-5">
          <div>
            <h2 className="font-semibold text-foreground">AI Assistant</h2>
            <p className="text-xs text-muted-foreground">Your automated salesperson</p>
          </div>

          {/* Status */}
          <div className="flex items-center gap-3 bg-muted/40 rounded-xl p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white flex-shrink-0">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Digital AI</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                <p className="text-xs text-primary font-medium">Online &amp; Ready</p>
              </div>
            </div>
          </div>

          {/* Quick actions */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Quick Actions</p>
            <div className="space-y-2">
              <Link
                href="/dashboard/products"
                className="flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-muted/50 transition-colors group"
              >
                <RefreshCw className="h-4 w-4 text-primary flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">Update Inventory</p>
                  <p className="text-xs text-muted-foreground">Teach AI new products</p>
                </div>
              </Link>
              <Link
                href="/dashboard/chat"
                className="flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-muted/50 transition-colors group"
              >
                <MessageSquare className="h-4 w-4 text-primary flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">Test Persona</p>
                  <p className="text-xs text-muted-foreground">See how it responds</p>
                </div>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
