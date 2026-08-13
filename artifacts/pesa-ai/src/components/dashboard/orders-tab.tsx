import {
  useGetMe, useListOrders, getListOrdersQueryKey,
  useUpdateOrderStatus, usePayOrderWithMpesa,
} from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ShoppingBag, Smartphone } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const STATUS_STYLES: Record<string, string> = {
  pending:   "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  confirmed: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  paid:      "bg-primary/10 text-primary",
  fulfilled: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  cancelled: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
};

export function OrdersTab() {
  const { data: me } = useGetMe();
  const businessId = me?.business?.id || "";
  const { data: orders, isLoading } = useListOrders(businessId, {
    query: { enabled: !!businessId, queryKey: getListOrdersQueryKey(businessId) },
  });

  const updateStatus = useUpdateOrderStatus();
  const payMpesa     = usePayOrderWithMpesa();
  const queryClient  = useQueryClient();
  const { toast }    = useToast();

  const [payOrder, setPayOrder] = useState<string | null>(null);
  const [payPhone, setPayPhone] = useState("");

  const handleStatusChange = (orderId: string, status: string) => {
    updateStatus.mutate({ businessId, orderId, data: { status } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey(businessId) });
        toast({ title: "Order updated" });
      },
    });
  };

  const handleMpesaPay = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payOrder || !payPhone) return;
    payMpesa.mutate({ businessId, orderId: payOrder, data: { phone: payPhone } }, {
      onSuccess: () => {
        setPayOrder(null);
        toast({ title: "M-Pesa prompt sent to customer!" });
      },
    });
  };

  const currentOrder = orders?.find((o) => o.id === payOrder);

  if (isLoading) return <div className="py-16 text-center text-muted-foreground text-sm">Loading orders…</div>;

  if (!orders?.length) return (
    <div className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-2xl py-20 text-center px-4">
      <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
        <ShoppingBag className="h-7 w-7 text-primary" />
      </div>
      <h3 className="text-lg font-bold mb-2">No orders yet</h3>
      <p className="text-sm text-muted-foreground max-w-sm">
        When customers order through your WhatsApp assistant, their orders appear here for you to track and fulfil.
      </p>
    </div>
  );

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      {/* Table head */}
      <div className="grid grid-cols-[1.4fr_1.2fr_1.5fr_0.8fr_1fr_1fr] bg-muted/50 px-4 py-2.5 border-b border-border">
        {["ORDER", "CUSTOMER", "ITEMS", "TOTAL", "STATUS", "PAYMENT"].map((h) => (
          <span key={h} className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{h}</span>
        ))}
      </div>

      {orders.map((o, i) => (
        <div key={o.id} className={`grid grid-cols-[1.4fr_1.2fr_1.5fr_0.8fr_1fr_1fr] items-center px-4 py-4 ${i < orders.length - 1 ? "border-b border-border" : ""} hover:bg-muted/30 transition-colors`}>
          {/* Order ID + date */}
          <div>
            <div className="font-mono text-xs font-medium text-foreground">#{o.id.substring(0, 8).toUpperCase()}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {new Date(o.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            </div>
          </div>

          {/* Customer */}
          <div>
            <div className="text-sm font-medium text-foreground">{o.customerName || "Customer"}</div>
            <div className="text-xs text-muted-foreground">{o.customerPhone}</div>
          </div>

          {/* Items */}
          <div className="space-y-0.5">
            {o.items.map((item, idx) => (
              <div key={idx} className="text-xs text-foreground">
                {item.qty}× {item.productName}
              </div>
            ))}
          </div>

          {/* Total */}
          <div className="text-sm font-bold text-foreground">KES {o.totalKES.toLocaleString()}</div>

          {/* Status */}
          <div>
            <Select value={o.status} onValueChange={(val) => handleStatusChange(o.id, val)}>
              <SelectTrigger className={`h-7 text-xs font-semibold border-none w-auto pr-2 ${STATUS_STYLES[o.status] ?? "bg-muted text-foreground"}`}>
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
          </div>

          {/* Payment */}
          <div>
            {o.status !== "paid" && o.status !== "fulfilled" ? (
              <Dialog
                open={payOrder === o.id}
                onOpenChange={(open) => {
                  if (open) { setPayOrder(o.id); setPayPhone(o.customerPhone); }
                  else setPayOrder(null);
                }}
              >
                <DialogTrigger asChild>
                  <button className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5 transition-colors">
                    <Smartphone className="h-3.5 w-3.5" /> Collect via M-Pesa
                  </button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Collect Payment via M-Pesa</DialogTitle></DialogHeader>
                  <form onSubmit={handleMpesaPay} className="space-y-4 mt-4">
                    <div className="p-4 bg-muted rounded-xl text-sm">
                      Amount to collect: <strong className="text-foreground">KES {currentOrder?.totalKES.toLocaleString()}</strong>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Customer's M-Pesa phone</label>
                      <Input value={payPhone} onChange={(e) => setPayPhone(e.target.value)} placeholder="e.g. 0712 345 678" />
                      <p className="text-xs text-muted-foreground">They will get a prompt on their phone to confirm the payment.</p>
                    </div>
                    <button type="submit" disabled={payMpesa.isPending} className="w-full h-10 rounded-lg bg-primary text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60 transition-colors">
                      {payMpesa.isPending ? "Sending prompt…" : "Send Payment Prompt"}
                    </button>
                  </form>
                </DialogContent>
              </Dialog>
            ) : (
              <span className="text-xs text-emerald-600 font-semibold">✓ Paid</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
