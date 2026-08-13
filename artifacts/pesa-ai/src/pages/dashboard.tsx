import { ProtectedRoute } from "@/hooks/use-auth-redirect";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, MessageSquare, ShoppingCart, BarChart3, CreditCard, Settings } from "lucide-react";
import { ProductsTab } from "@/components/dashboard/products-tab";
import { ChatTesterTab } from "@/components/dashboard/chat-tester-tab";
import { OrdersTab } from "@/components/dashboard/orders-tab";
import { SalesTab } from "@/components/dashboard/sales-tab";
import { BillingTab } from "@/components/dashboard/billing-tab";
import { SettingsTab } from "@/components/dashboard/settings-tab";

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardLayout>
        <div className="flex flex-col space-y-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-bold tracking-tight">Control Center</h1>
            <p className="text-muted-foreground">Manage your products, orders, and AI assistant settings.</p>
          </div>

          <Tabs defaultValue="products" className="w-full">
            <TabsList className="flex flex-wrap w-full md:w-auto h-auto justify-start border-b border-border bg-transparent p-0 gap-2 mb-6">
              <TabsTrigger value="products" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:border-primary border border-transparent rounded-full px-4 py-2 text-sm">
                <Package className="w-4 h-4 mr-2" /> Products
              </TabsTrigger>
              <TabsTrigger value="chat-tester" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:border-primary border border-transparent rounded-full px-4 py-2 text-sm">
                <MessageSquare className="w-4 h-4 mr-2" /> Chat Tester
              </TabsTrigger>
              <TabsTrigger value="orders" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:border-primary border border-transparent rounded-full px-4 py-2 text-sm">
                <ShoppingCart className="w-4 h-4 mr-2" /> Orders
              </TabsTrigger>
              <TabsTrigger value="sales" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:border-primary border border-transparent rounded-full px-4 py-2 text-sm">
                <BarChart3 className="w-4 h-4 mr-2" /> Sales
              </TabsTrigger>
              <TabsTrigger value="billing" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:border-primary border border-transparent rounded-full px-4 py-2 text-sm">
                <CreditCard className="w-4 h-4 mr-2" /> Billing
              </TabsTrigger>
              <TabsTrigger value="settings" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:border-primary border border-transparent rounded-full px-4 py-2 text-sm">
                <Settings className="w-4 h-4 mr-2" /> Settings
              </TabsTrigger>
            </TabsList>

            <div className="bg-card border border-border rounded-xl shadow-sm p-4 md:p-6 min-h-[500px]">
              <TabsContent value="products" className="m-0 focus-visible:outline-none">
                <ProductsTab />
              </TabsContent>
              <TabsContent value="chat-tester" className="m-0 focus-visible:outline-none">
                <ChatTesterTab />
              </TabsContent>
              <TabsContent value="orders" className="m-0 focus-visible:outline-none">
                <OrdersTab />
              </TabsContent>
              <TabsContent value="sales" className="m-0 focus-visible:outline-none">
                <SalesTab />
              </TabsContent>
              <TabsContent value="billing" className="m-0 focus-visible:outline-none">
                <BillingTab />
              </TabsContent>
              <TabsContent value="settings" className="m-0 focus-visible:outline-none">
                <SettingsTab />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
