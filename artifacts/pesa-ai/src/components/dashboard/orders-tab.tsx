import { useGetMe, useListOrders, getListOrdersQueryKey, useUpdateOrderStatus, usePayOrderWithMpesa } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Smartphone } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useState } from "react";

export function OrdersTab() {
  const { data: me } = useGetMe();
  const businessId = me?.business?.id || "";
  const { data: orders, isLoading } = useListOrders(businessId, { query: { enabled: !!businessId, queryKey: getListOrdersQueryKey(businessId) } });
  
  const updateStatus = useUpdateOrderStatus();
  const payMpesa = usePayOrderWithMpesa();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [payOrder, setPayOrder] = useState<string | null>(null);
  const [payPhone, setPayPhone] = useState("");

  const handleStatusChange = (orderId: string, status: string) => {
    updateStatus.mutate({ businessId, orderId, data: { status } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey(businessId) });
        toast({ title: "Order status updated" });
      }
    });
  };

  const handleMpesaPay = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payOrder || !payPhone) return;

    payMpesa.mutate({ businessId, orderId: payOrder, data: { phone: payPhone } }, {
      onSuccess: () => {
        setPayOrder(null);
        toast({ title: "M-Pesa prompt sent to customer!" });
      }
    });
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-500';
      case 'confirmed': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 'paid': return 'bg-primary/20 text-primary';
      case 'fulfilled': return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
      case 'cancelled': return 'bg-destructive/10 text-destructive';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading orders...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Orders</h2>
        <p className="text-sm text-muted-foreground">Orders created by the AI assistant on WhatsApp.</p>
      </div>

      {!orders?.length ? (
        <div className="border-2 border-dashed border-border rounded-xl p-12 text-center">
          <p className="text-muted-foreground mb-4">No orders received yet.</p>
          <p className="text-sm text-muted-foreground">When customers place orders via WhatsApp, they will appear here.</p>
        </div>
      ) : (
        <div className="border rounded-md overflow-hidden bg-card">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Order ID</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium text-xs">
                    {o.id.substring(0,8)}...
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {new Date(o.createdAt).toLocaleDateString()}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{o.customerName || "Customer"}</div>
                    <div className="text-xs text-muted-foreground">{o.customerPhone}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs space-y-1">
                      {o.items.map((item, idx) => (
                        <div key={idx}>{item.qty}x {item.productName}</div>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="font-bold">KES {o.totalKES.toLocaleString()}</TableCell>
                  <TableCell>
                    <Select value={o.status} onValueChange={(val) => handleStatusChange(o.id, val)}>
                      <SelectTrigger className={`h-8 text-xs font-semibold border-none ${getStatusColor(o.status)}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="confirmed">Confirmed</SelectItem>
                        <SelectItem value="paid">Paid</SelectItem>
                        <SelectItem value="fulfilled">Fulfilled</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right">
                    <Dialog open={payOrder === o.id} onOpenChange={(open) => {
                      if(open) { setPayOrder(o.id); setPayPhone(o.customerPhone); }
                      else setPayOrder(null);
                    }}>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline" className="text-primary hover:text-primary hover:bg-primary/10 border-primary/20">
                          <Smartphone className="w-3 h-3 mr-1" />
                          M-Pesa
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Send M-Pesa STK Push</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleMpesaPay} className="space-y-4 mt-4">
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Customer Phone</label>
                            <Input value={payPhone} onChange={(e) => setPayPhone(e.target.value)} />
                          </div>
                          <div className="p-3 bg-muted rounded-md text-sm">
                            Amount to collect: <strong>KES {o.totalKES.toLocaleString()}</strong>
                          </div>
                          <Button type="submit" className="w-full" disabled={payMpesa.isPending}>
                            {payMpesa.isPending ? "Sending..." : "Send Payment Prompt"}
                          </Button>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
