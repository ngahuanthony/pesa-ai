import { useGetMe, useGetSalesSummary, getGetSalesSummaryQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Lock, TrendingUp, ShoppingBag, Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export function SalesTab() {
  const { data: me } = useGetMe();
  const businessId = me?.business?.id || "";
  const [period, setPeriod] = useState("30");
  
  const { data: summary, isLoading } = useGetSalesSummary(businessId, { 
    query: { enabled: !!businessId, queryKey: getGetSalesSummaryQueryKey(businessId) } 
  });

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading analytics...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold">Sales Overview</h2>
          <p className="text-sm text-muted-foreground">Track your AI assistant's performance.</p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 Days</SelectItem>
            <SelectItem value="14">Last 14 Days</SelectItem>
            <SelectItem value="30">Last 30 Days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
            <Banknote className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">KES {summary?.totalRevenue?.toLocaleString() || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Orders</CardTitle>
            <ShoppingBag className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.totalOrders || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Order Value</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">KES {summary?.avgOrderValue?.toLocaleString() || 0}</div>
          </CardContent>
        </Card>
      </div>

      {summary?.advancedAnalyticsLocked ? (
        <div className="relative rounded-xl border bg-card p-10 overflow-hidden text-center flex flex-col items-center justify-center">
          <div className="absolute inset-0 bg-muted/40 backdrop-blur-sm z-0"></div>
          <div className="relative z-10 bg-background border p-8 rounded-xl shadow-lg max-w-md w-full">
            <div className="mx-auto bg-primary/10 w-12 h-12 flex items-center justify-center rounded-full mb-4">
              <Lock className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-lg font-bold mb-2">Advanced Analytics Locked</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Upgrade to the Business or Pro plan to view revenue trends and top performing products.
            </p>
            <Link href="/dashboard" className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
              Upgrade Plan
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Revenue Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[250px] w-full">
                {summary?.trend && summary.trend.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={summary.trend}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `KES ${v/1000}k`} />
                      <Tooltip 
                        cursor={{ fill: 'hsl(var(--muted))' }}
                        contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                      />
                      <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground text-sm border border-dashed rounded-lg">
                    No trend data available
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top Products</CardTitle>
            </CardHeader>
            <CardContent>
              {summary?.topProducts && summary.topProducts.length > 0 ? (
                <div className="space-y-4">
                  {summary.topProducts.map((p, i) => (
                    <div key={i} className="flex items-center justify-between border-b last:border-0 pb-3 last:pb-0">
                      <div>
                        <div className="font-medium text-sm">{p.productName}</div>
                        <div className="text-xs text-muted-foreground">{p.qty} sold</div>
                      </div>
                      <div className="font-bold text-sm">KES {p.revenue.toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm border border-dashed rounded-lg">
                  No sales yet
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
