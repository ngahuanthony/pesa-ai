import { useLocation } from "wouter";
import { ProtectedRoute } from "@/hooks/use-auth-redirect";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { OverviewTab } from "@/components/dashboard/overview-tab";
import { ProductsTab } from "@/components/dashboard/products-tab";
import { ChatTesterTab } from "@/components/dashboard/chat-tester-tab";
import { OrdersTab } from "@/components/dashboard/orders-tab";
import { SalesTab } from "@/components/dashboard/sales-tab";
import { BillingTab } from "@/components/dashboard/billing-tab";
import { SettingsTab } from "@/components/dashboard/settings-tab";

function DashboardContent() {
  const [location] = useLocation();

  // Derive section from URL path
  const section = location.replace(/^\/dashboard\/?/, "") || "overview";

  const renderSection = () => {
    switch (section) {
      case "products": return <ProductsTab />;
      case "orders":   return <OrdersTab />;
      case "chat":     return <ChatTesterTab />;
      case "sales":    return <SalesTab />;
      case "billing":  return <BillingTab />;
      case "settings": return <SettingsTab />;
      default:         return <OverviewTab />;
    }
  };

  // Section pages wrap content with a title when not overview
  const sectionTitles: Record<string, { title: string; sub: string }> = {
    products: { title: "Products",    sub: "Manage your inventory." },
    orders:   { title: "Orders",      sub: "Track customer purchases." },
    chat:     { title: "Chat Tester", sub: "Preview how your shop responds." },
    sales:    { title: "Sales",       sub: "Review your revenue and performance." },
    billing:  { title: "Billing",     sub: "Manage your subscription." },
    settings: { title: "Settings",    sub: "Manage your business profile, AI persona, and integrations." },
  };

  const meta = sectionTitles[section];

  return (
    <DashboardLayout>
      {section === "overview" ? (
        renderSection()
      ) : (
        <div className="space-y-6">
          {meta && (
            <div>
              <h1 className="text-2xl font-bold text-foreground">{meta.title}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">{meta.sub}</p>
            </div>
          )}
          <div className="bg-white rounded-xl border border-border shadow-sm p-6 min-h-[500px]">
            {renderSection()}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}
