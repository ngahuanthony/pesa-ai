import {
  useGetMe, useListOrders, getListOrdersQueryKey,
  useUpdateOrderStatus, usePayOrderWithMpesa,
} from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ShoppingBag, Smartphone, CheckCircle2 } from "lucide-react";
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

// Payment metadata saved on the order by the backend when payment is detected
// (M-Pesa STK push, C2B webhook, or manual vendor confirmation).
interface PaymentMeta {
  paymentMethod?: "mpesa-stk" | "mpesa-c2b" | "manual";
  mpesaTxnId?:   string | null;
  mpesaAmount?:  number | null;
  mpesaPhone?:   string | null;
  paymentRef?:   string | null;
  paidAt?:       string | null;
}

function paymentMethodLabel(method?: string) {
  if (method === "mpesa-stk")  return "M-Pesa (STK push)";
  if (method === "mpesa-c2b")  return "M-Pesa (paybill)";
  if (method === "manual")     return "Manual confirmation";
  return "M-Pesa";
}

function PaymentDetails({ meta }: { meta: PaymentMeta }) {
  if (!meta) return null;
  return (
    <div className="mt-1 space-y-0.5">
      {meta.mpesaTxnId && (
        <div className="text-[10px] font-mono text-muted-foreground">Ref: {meta.mpesaTxnId}</div>
      )}
      {meta.paymentRef && (
        <div className="text-[10px] font-mono text-muted-foreground">Ref: {meta.paymentRef}</div>
      )}
      {meta.mpesaAmount && (
        <div className="text-[10px] text-muted-foreground">KES {meta.mpesaAmount.toLocaleString("en-KE")}</div>
      )}
      <div className="text-[10px] text-muted-foreground">{paymentMethodLabel(meta.paymentMethod)}</div>
    </div>
  );
}

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

  // STK push dialog state
  const [payOrder,  setPayOrder]  = useState<string | null>(null);
  const [payPhone,  setPayPhone]  = useState("");

  // Mark as Paid dialog state
  const [markOrder,     setMarkOrder]     = useState<string | null>(null);
  const [paymentRef,    setPaymentRef]    = useState("");
  const [markingPaid,   setMarkingPaid]   = useState(false);

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

  const handleMarkPaid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!markOrder) return;
    setMarkingPaid(true);
    try {
      const res = await fetch(`/api/businesses/${businessId}/orders/${markOrder}/mark-paid`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentRef: paymentRef.trim() || null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(err.error || "Failed to mark as paid");
      }
      queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey(businessId) });
      toast({ title: "Order marked as paid ✓" });
      setMarkOrder(null);
      setPaymentRef("");
    } catch (err: any) {
      toast({ title: err.message || "Failed to mark as paid", variant: "destructive" });
    } finally {
      setMarkingPaid(false);
    }
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

  const isPaidOrFulfilled = (status: string) => status === "paid" || status === "fulfilled";
  const isActionable      = (status: string) => status === "pending" || status === "confirmed";

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      {/* Table head */}
      <div className="grid grid-cols-[1.4fr_1.2fr_1.5fr_0.8fr_1fr_1.2fr] bg-muted/50 px-4 py-2.5 border-b border-border">
        {["ORDER", "CUSTOMER", "ITEMS", "TOTAL", "STATUS", "PAYMENT"].map((h) => (
          <span key={h} className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{h}</span>
        ))}
      </div>

      {(orders as any[]).map((o, i) => {
        const meta: PaymentMeta | undefined = o.paymentMeta;
        return (
          <div key={o.id} className={`grid grid-cols-[1.4fr_1.2fr_1.5fr_0.8fr_1fr_1.2fr] items-start px-4 py-4 ${i < orders.length - 1 ? "border-b border-border" : ""} hover:bg-muted/30 transition-colors`}>
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
              {o.items.map((item: any, idx: number) => (
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

            {/* Payment column */}
            <div>
              {isPaidOrFulfilled(o.status) ? (
                <div>
                  <div className="flex items-center gap-1 text-xs text-emerald-600 font-semibold">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Paid
                  </div>
                  {meta && <PaymentDetails meta={meta} />}
                </div>
              ) : isActionable(o.status) ? (
                <div className="flex flex-col gap-1.5">
                  {/* STK Push */}
                  <Dialog
                    open={payOrder === o.id}
                    onOpenChange={(open) => {
                      if (open) { setPayOrder(o.id); setPayPhone(o.customerPhone); }
                      else setPayOrder(null);
                    }}
                  >
                    <DialogTrigger asChild>
                      <button className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5 transition-colors">
                        <Smartphone className="h-3.5 w-3.5" /> M-Pesa prompt
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

                  {/* Mark as Paid (bank transfer / manual paybill) */}
                  <Dialog
                    open={markOrder === o.id}
                    onOpenChange={(open) => {
                      if (open) { setMarkOrder(o.id); setPaymentRef(""); }
                      else setMarkOrder(null);
                    }}
                  >
                    <DialogTrigger asChild>
                      <button className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Mark as Paid
                      </button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Mark Order as Paid</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={handleMarkPaid} className="space-y-4 mt-4">
                        <div className="p-4 bg-muted rounded-xl text-sm space-y-1">
                          <div>Order: <strong className="font-mono">#{o.id.substring(0, 8).toUpperCase()}</strong></div>
                          <div>Amount: <strong>KES {o.totalKES.toLocaleString()}</strong></div>
                          <div className="text-muted-foreground text-xs">Use this for bank transfers or M-Pesa paybill payments you confirmed in your M-Pesa statement.</div>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium">Payment reference <span className="text-muted-foreground font-normal">(optional)</span></label>
                          <Input
                            value={paymentRef}
                            onChange={(e) => setPaymentRef(e.target.value)}
                            placeholder="e.g. Bank ref, M-Pesa TransID, cheque no."
                          />
                          <p className="text-xs text-muted-foreground">Saved for reconciliation — visible on this order.</p>
                        </div>
                        <button
                          type="submit"
                          disabled={markingPaid}
                          className="w-full h-10 rounded-lg bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors"
                        >
                          {markingPaid ? "Saving…" : "Confirm Payment Received"}
                        </button>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
