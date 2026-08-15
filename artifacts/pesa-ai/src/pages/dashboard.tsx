import { useLocation } from "wouter";
import { ProtectedRoute } from "@/hooks/use-auth-redirect";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { OverviewTab }        from "@/components/dashboard/overview-tab";
import { ProductsTab }        from "@/components/dashboard/products-tab";
import { ChatTesterTab }      from "@/components/dashboard/chat-tester-tab";
import { OrdersTab }          from "@/components/dashboard/orders-tab";
import { SalesTab }           from "@/components/dashboard/sales-tab";
import { BillingTab }         from "@/components/dashboard/billing-tab";
import { SettingsTab }        from "@/components/dashboard/settings-tab";
import { WhatsAppAccountTab } from "@/components/dashboard/whatsapp-account-tab";
import { VideoScanTab }       from "@/components/dashboard/video-scan-tab";
import { BusinessProfileTab } from "@/components/dashboard/business-profile-tab";
import { StockTab }           from "@/components/dashboard/stock-tab";
import { PricesTab }          from "@/components/dashboard/prices-tab";
import { CustomersTab }       from "@/components/dashboard/customers-tab";
import { PaymentsTab }        from "@/components/dashboard/payments-tab";

// Normalise path → section key
function getSection(location: string): string {
  // Strip leading /dashboard/
  const raw = location.replace(/^\/dashboard\/?/, "");
  if (!raw) return "overview";
  // stock sub-pages: stock/in, stock/sale, stock/take, stock/history → all "stock"
  if (raw.startsWith("stock")) return "stock";
  return raw;
}

function DashboardContent() {
  const [location] = useLocation();
  const section = getSection(location);

  const renderSection = () => {
    switch (section) {
      case "products":   return <ProductsTab />;
      case "orders":     return <OrdersTab />;
      case "chat":       return <ChatTesterTab />;
      case "sales":      return <SalesTab />;
      case "billing":    return <BillingTab />;
      case "settings":   return <SettingsTab />;
      case "whatsapp":   return <WhatsAppAccountTab />;
      case "video-scan": return <VideoScanTab />;
      case "profile":    return <BusinessProfileTab />;
      case "stock":      return <StockTab />;
      case "prices":     return <PricesTab />;
      case "customers":  return <CustomersTab />;
      case "payments":   return <PaymentsTab />;
      default:           return <OverviewTab />;
    }
  };

  const sectionTitles: Record<string, { title: string; sub: string }> = {
    products:    { title: "Products",         sub: "Manage your inventory." },
    orders:      { title: "Orders",           sub: "Track customer purchases." },
    chat:        { title: "Chat Tester",      sub: "Preview how your shop responds." },
    sales:       { title: "Reports",          sub: "Review your revenue and performance." },
    billing:     { title: "Billing",          sub: "Manage your subscription." },
    settings:    { title: "Settings",         sub: "Manage your business profile, AI persona, and integrations." },
    whatsapp:    { title: "WhatsApp Account", sub: "Connect your WhatsApp Business number to your shop." },
    "video-scan":{ title: "Stock Scanner",     sub: "Scan your shop and AI will build your product catalogue." },
    profile:     { title: "Business Profile", sub: "Your shop details and account information." },
    stock:       { title: "Stock",            sub: "Manage inventory levels, sales, and adjustments." },
    prices:      { title: "Prices",           sub: "Set pricing rules and discounts." },
    customers:   { title: "Customers",        sub: "View and manage your customer list." },
    payments:    { title: "Payments",         sub: "Track M-Pesa transactions and revenue." },
  };

  const meta = sectionTitles[section];

  return (
    <DashboardLayout>
      {section === "overview" ? (
        renderSection()
      ) : (
        <div className="p-6 space-y-5">
          {meta && (
            <div>
              <h1 className="text-2xl font-bold text-foreground">{meta.title}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">{meta.sub}</p>
            </div>
          )}
          <div className="bg-white rounded-xl border border-border shadow-sm p-6 min-h-[420px]">
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
