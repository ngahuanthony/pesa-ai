import {
  useGetMe, useListOrders, getListOrdersQueryKey,
  useUpdateOrderStatus, usePayOrderWithMpesa, useListProducts, getListProductsQueryKey,
} from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ShoppingBag, Smartphone, CheckCircle2, Pencil, Minus, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const STATUS_STYLES: Record<string, string> = {
  new:       "bg-amber-100 text-amber-700",
  accepted:  "bg-blue-100 text-blue-700",
  preparing: "bg-purple-100 text-purple-700",
  ready:     "bg-emerald-100 text-emerald-700",
  served:    "bg-indigo-100 text-indigo-700",
  completed: "bg-primary/10 text-primary",
  cancelled: "bg-rose-100 text-rose-700",
};

interface PaymentMeta {
  paymentMethod?: "mpesa-stk" | "mpesa-c2b" | "manual";
  mpesaTxnId?:   string | null;
  mpesaAmount?:  number | null;
  mpesaPhone?:   string | null;
  paymentRef?:   string | null;
  paidAt?:       string | null;
}

function PaymentAttempt({ attempt }: { attempt?: any }) {
  if (!attempt) return null;
  if (attempt.status === "PENDING") {
    return <p className="mt-1 text-[10px] font-medium text-amber-700">M-Pesa prompt pending on {attempt.phone || "customer phone"}</p>;
  }
  if (attempt.status === "FAILED") {
    return <p className="mt-1 text-[10px] font-medium text-rose-600">Last M-Pesa attempt failed: {attempt.resultDesc || "Payment not completed"}. You can retry.</p>;
  }
  return null;
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
      {(meta.mpesaTxnId || meta.paymentRef) && (
        <div className="text-[10px] font-mono text-muted-foreground">Ref: {meta.mpesaTxnId || meta.paymentRef}</div>
      )}
      {meta.mpesaAmount && (
        <div className="text-[10px] text-muted-foreground">KES {meta.mpesaAmount.toLocaleString("en-KE")}</div>
      )}
      <div className="text-[10px] text-muted-foreground">{paymentMethodLabel(meta.paymentMethod)}</div>
    </div>
  );
}

function StatusSelect({ order, onChange }: { order: any; onChange: (id: string, val: string) => void }) {
  const isNewFlow = !!order.fulfillmentStatus;
  const currentStatus = isNewFlow ? order.fulfillmentStatus : order.status;
  const normStatus = (currentStatus || "").toLowerCase();

  if (!isNewFlow) {
    return (
      <Select value={currentStatus} onValueChange={(val) => onChange(order.id, val)}>
        <SelectTrigger className={`h-7 text-xs font-semibold border-none w-auto pr-2 ${STATUS_STYLES[normStatus] ?? "bg-muted text-foreground"}`}>
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
    );
  }

  const upperStatus = (currentStatus || "").toUpperCase();
  const allowed = [upperStatus];
  if (upperStatus === "NEW") allowed.push("ACCEPTED");
  if (upperStatus === "ACCEPTED") allowed.push("PREPARING");
  if (upperStatus === "PREPARING") allowed.push("READY");
  if (upperStatus === "READY") allowed.push("SERVED");
  if (upperStatus === "SERVED") allowed.push("COMPLETED");
  if (upperStatus !== "CANCELLED" && upperStatus !== "COMPLETED") allowed.push("CANCELLED");

  return (
    <Select value={upperStatus} onValueChange={(val) => onChange(order.id, val)}>
      <SelectTrigger className={`h-7 text-xs font-semibold border-none w-auto pr-2 ${STATUS_STYLES[normStatus] ?? "bg-muted text-foreground"}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {allowed.map(st => (
          <SelectItem key={st} value={st}>
            {st === "NEW" ? "New" :
             st === "ACCEPTED" ? "Accepted" :
             st === "PREPARING" ? "Preparing" :
             st === "READY" ? "Ready" :
             st === "SERVED" ? "Served" :
             st === "COMPLETED" ? "Completed" : "Cancelled"}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function OrdersTab() {
  const { data: me } = useGetMe();
  const businessId = me?.business?.id || "";
  const { data: orders, isLoading } = useListOrders(businessId, {
    query: {
      enabled: !!businessId,
      queryKey: getListOrdersQueryKey(businessId),
      refetchInterval: 10000
    },
  });
  const { data: productsData } = useListProducts(businessId, {
    query: { enabled: !!businessId, queryKey: getListProductsQueryKey(businessId) },
  });
  const products = (Array.isArray(productsData) ? productsData : (productsData as any)?.products || []) as any[];

  const updateStatus = useUpdateOrderStatus();
  const payMpesa     = usePayOrderWithMpesa();
  const queryClient  = useQueryClient();
  const { toast }    = useToast();

  const [payOrder,    setPayOrder]    = useState<string | null>(null);
  const [payPhone,    setPayPhone]    = useState("");
  const [markOrder,   setMarkOrder]   = useState<string | null>(null);
  const [paymentRef,  setPaymentRef]  = useState("");
  const [markingPaid, setMarkingPaid] = useState(false);
  const [editOrder, setEditOrder] = useState<any | null>(null);
  const [editItems, setEditItems] = useState<{ productId: string; productName: string; quantity: number }[]>([]);
  const [savingItems, setSavingItems] = useState(false);

  const openEdit = (order: any) => {
    setEditOrder(order);
    setEditItems(order.items.map((item: any) => ({
      productId: item.productId,
      productName: item.productName,
      quantity: Number(item.quantity ?? item.qty ?? 1),
    })));
  };

  const changeQuantity = (productId: string, delta: number) => {
    setEditItems((items) => items
      .map((item) => item.productId === productId ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item)
      .filter((item) => item.quantity > 0));
  };

  const addProduct = (productId: string) => {
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    setEditItems((items) => {
      const existing = items.find((item) => item.productId === productId);
      return existing
        ? items.map((item) => item.productId === productId ? { ...item, quantity: item.quantity + 1 } : item)
        : [...items, { productId, productName: product.name, quantity: 1 }];
    });
  };

  const saveItems = async () => {
    if (!editOrder || editItems.length === 0) return;
    setSavingItems(true);
    try {
      const response = await fetch(`/api/businesses/${businessId}/orders/${editOrder.id}/items`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: editItems.map(({ productId, quantity }) => ({ productId, quantity })) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not update order");
      await queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey(businessId) });
      toast({ title: "Order corrected", description: "Stock, total and customer notification were updated." });
      setEditOrder(null);
    } catch (error: any) {
      toast({ title: error.message || "Could not update order", variant: "destructive" });
    } finally {
      setSavingItems(false);
    }
  };

  const canEdit = (order: any) =>
    order.paymentStatus !== "PAID" &&
    ["NEW", "ACCEPTED", "PENDING", "CONFIRMED"].includes(String(order.fulfillmentStatus || order.status || "").toUpperCase());

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
      onSuccess: () => { setPayOrder(null); toast({ title: "M-Pesa prompt sent to customer!" }); },
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
  const isOrderPaid = (o: any) => {
    if (o.fulfillmentStatus) {
      return o.paymentStatus === "PAID";
    }
    const norm = (o.status || "").toLowerCase();
    return norm === "paid" || norm === "fulfilled";
  };

  const isOrderActionableForPayment = (o: any) => {
    if (o.fulfillmentStatus) {
      return o.paymentStatus !== "PAID" && o.fulfillmentStatus !== "CANCELLED";
    }
    const norm = (o.status || "").toLowerCase();
    return norm === "pending" || norm === "confirmed";
  };

  const newCount = orders?.filter((o: any) =>
    o.fulfillmentStatus?.toUpperCase() === "NEW" || o.status?.toLowerCase() === "pending"
  ).length || 0;

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
    <>
      {newCount > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            <p className="text-sm font-medium text-amber-800">You have {newCount} new order{newCount > 1 ? "s" : ""} waiting.</p>
          </div>
        </div>
      )}
      <div className="border border-border rounded-xl overflow-hidden bg-white">

        {/* ── Desktop table (hidden on mobile) ── */}
        <div className="hidden sm:block">
          <div className="grid grid-cols-[1.4fr_1.2fr_1.5fr_0.8fr_1fr_1.2fr] bg-muted/50 px-4 py-2.5 border-b border-border">
            {["ORDER", "CUSTOMER", "ITEMS", "TOTAL", "STATUS", "PAYMENT"].map((h) => (
              <span key={h} className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{h}</span>
            ))}
          </div>

          {(orders as any[]).map((o, i) => {
            const meta: PaymentMeta | undefined = o.paymentMeta;
            return (
              <div key={o.id} className={`grid grid-cols-[1.4fr_1.2fr_1.5fr_0.8fr_1fr_1.2fr] items-start px-4 py-4 ${i < orders.length - 1 ? "border-b border-border" : ""} hover:bg-muted/30 transition-colors`}>
                <div>
                  <div className="font-mono text-xs font-medium text-foreground">#{o.id.substring(0, 8).toUpperCase()}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {new Date(o.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">{o.customerName || "Customer"}</div>
                  <div className="text-xs text-muted-foreground">{o.customerPhone}</div>
                  {o.serviceLocationSnapshot && (
                    <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/60 text-[10px] font-medium text-muted-foreground">
                      <span className="uppercase text-[9px] font-bold">{o.serviceLocationSnapshot.kind}</span>
                      <span>{o.serviceLocationSnapshot.label}</span>
                    </div>
                  )}
                </div>
                <div className="space-y-0.5">
                  {o.items.map((item: any, idx: number) => (
                    <div key={idx} className="text-xs text-foreground">{item.quantity ?? item.qty}× {item.productName}</div>
                  ))}
                  {canEdit(o) && (
                    <button onClick={() => openEdit(o)} className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline">
                      <Pencil className="h-3 w-3" /> Correct items
                    </button>
                  )}
                </div>
                <div className="text-sm font-bold text-foreground">KES {(o.totalAmount ?? o.totalKES).toLocaleString()}</div>
                <div>
                  <StatusSelect order={o} onChange={handleStatusChange} />
                  {(o.paymentStatus || o.fulfillmentStatus) && (
                    <div className="flex gap-1.5 mt-2">
                      {o.paymentStatus && <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground">{o.paymentStatus}</span>}
                      {o.fulfillmentStatus && <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground">{o.fulfillmentStatus}</span>}
                    </div>
                  )}
                </div>
                <div>
                  {isOrderPaid(o) ? (
                    <div>
                      <div className="flex items-center gap-1 text-xs text-emerald-600 font-semibold">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Paid
                      </div>
                      {meta && <PaymentDetails meta={meta} />}
                      <PaymentAttempt attempt={(o as any).mpesaPaymentAttempt} />
                    </div>
                  ) : isOrderActionableForPayment(o) ? (
                    <div className="flex flex-col gap-1.5">
                      <button
                        onClick={() => { setPayOrder(o.id); setPayPhone(o.customerPhone); }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5 transition-colors"
                      >
                        <Smartphone className="h-3.5 w-3.5" /> M-Pesa prompt
                      </button>
                      <button
                        onClick={() => { setMarkOrder(o.id); setPaymentRef(""); }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Mark as Paid
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Mobile card list (hidden on desktop) ── */}
        <div className="sm:hidden divide-y divide-border">
          {(orders as any[]).map((o) => {
            const meta: PaymentMeta | undefined = o.paymentMeta;
            return (
              <div key={o.id} className="px-4 py-4 space-y-3">
                {/* Header: order ref + date + status */}
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="font-mono text-xs font-semibold text-foreground">#{o.id.substring(0, 8).toUpperCase()}</span>
                    <span className="text-[11px] text-muted-foreground ml-2">
                      {new Date(o.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </span>
                    {(o.paymentStatus || o.fulfillmentStatus) && (
                      <div className="flex gap-1.5 mt-1">
                        {o.paymentStatus && <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground">{o.paymentStatus}</span>}
                        {o.fulfillmentStatus && <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground">{o.fulfillmentStatus}</span>}
                      </div>
                    )}
                  </div>
                  <StatusSelect order={o} onChange={handleStatusChange} />
                </div>

                {/* Customer + total */}
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-xs font-bold text-primary">
                    {(o.customerName || "?").slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground">{o.customerName || "Customer"}</div>
                    <div className="text-xs text-muted-foreground">{o.customerPhone}</div>
                    {o.serviceLocationSnapshot && (
                      <div className="mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/60 text-[10px] font-medium text-muted-foreground">
                        <span className="uppercase text-[9px] font-bold">{o.serviceLocationSnapshot.kind}</span>
                        <span>{o.serviceLocationSnapshot.label}</span>
                      </div>
                    )}
                  </div>
                  <div className="text-sm font-bold text-foreground flex-shrink-0">KES {(o.totalAmount ?? o.totalKES).toLocaleString()}</div>
                </div>

                {/* Items */}
                <div className="rounded-lg bg-muted/50 px-3 py-2.5 space-y-0.5">
                  {o.items.map((item: any, idx: number) => (
                    <div key={idx} className="text-xs text-foreground">{item.quantity ?? item.qty}× {item.productName}</div>
                  ))}
                  {canEdit(o) && (
                    <button onClick={() => openEdit(o)} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                      <Pencil className="h-3.5 w-3.5" /> Correct order
                    </button>
                  )}
                </div>

                {/* Payment */}
                {isOrderPaid(o) ? (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Paid
                    {meta && <PaymentDetails meta={meta} />}
                    <PaymentAttempt attempt={(o as any).mpesaPaymentAttempt} />
                  </div>
                ) : isOrderActionableForPayment(o) ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setPayOrder(o.id); setPayPhone(o.customerPhone); }}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-primary/30 px-3 py-2.5 text-xs font-semibold text-primary hover:bg-primary/5 transition-colors"
                    >
                      <Smartphone className="h-3.5 w-3.5" /> M-Pesa Prompt
                    </button>
                    <button
                      onClick={() => { setMarkOrder(o.id); setPaymentRef(""); }}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-300 px-3 py-2.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Mark Paid
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── M-Pesa STK push dialog (shared, rendered once) ── */}
      <Dialog open={payOrder !== null} onOpenChange={(open) => !open && setPayOrder(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Collect Payment via M-Pesa</DialogTitle></DialogHeader>
          <form onSubmit={handleMpesaPay} className="space-y-4 mt-4">
            <div className="p-4 bg-muted rounded-xl text-sm">
              Amount to collect: <strong className="text-foreground">KES {Number((currentOrder as any)?.totalAmount || 0).toLocaleString()}</strong>
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

      {/* ── Mark as Paid dialog (shared, rendered once) ── */}
      <Dialog open={markOrder !== null} onOpenChange={(open) => !open && setMarkOrder(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mark Order as Paid</DialogTitle></DialogHeader>
          {markOrder && (() => {
            const o = (orders as any[]).find((x) => x.id === markOrder);
            if (!o) return null;
            return (
              <form onSubmit={handleMarkPaid} className="space-y-4 mt-4">
                <div className="p-4 bg-muted rounded-xl text-sm space-y-1">
                  <div>Order: <strong className="font-mono">#{o.id.substring(0, 8).toUpperCase()}</strong></div>
                  <div>Amount: <strong>KES {(o.totalAmount ?? o.totalKES).toLocaleString()}</strong></div>
                  <div className="text-muted-foreground text-xs">Use this for bank transfers or M-Pesa paybill payments you confirmed in your statement.</div>
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
            );
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={editOrder !== null} onOpenChange={(open) => !open && setEditOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Correct Order #{editOrder?.id.slice(0, 8).toUpperCase()}</DialogTitle>
          </DialogHeader>
          <div className="mt-3 space-y-4">
            {editOrder?.serviceLocationSnapshot && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
                {editOrder.serviceLocationSnapshot.kind}: {editOrder.serviceLocationSnapshot.label}
              </div>
            )}
            <div className="space-y-2">
              {editItems.map((item) => (
                <div key={item.productId} className="flex items-center gap-2 rounded-lg border p-2.5">
                  <span className="min-w-0 flex-1 text-sm font-medium">{item.productName}</span>
                  <button type="button" onClick={() => changeQuantity(item.productId, -1)} className="rounded-md border p-1.5" aria-label={`Remove one ${item.productName}`}><Minus className="h-3.5 w-3.5" /></button>
                  <span className="w-7 text-center text-sm font-bold">{item.quantity}</span>
                  <button type="button" onClick={() => changeQuantity(item.productId, 1)} className="rounded-md border p-1.5" aria-label={`Add one ${item.productName}`}><Plus className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => setEditItems((items) => items.filter((candidate) => candidate.productId !== item.productId))} className="rounded-md p-1.5 text-rose-600" aria-label={`Remove ${item.productName}`}><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
            <div>
              <label className="text-sm font-medium">Add an item</label>
              <select defaultValue="" onChange={(event) => { addProduct(event.target.value); event.target.value = ""; }} className="mt-1.5 w-full rounded-lg border bg-white px-3 py-2 text-sm">
                <option value="" disabled>Choose a product…</option>
                {products.filter((product) => product.active !== false && Number(product.stockQty || 0) > 0).map((product) => (
                  <option key={product.id} value={product.id}>{product.name} · KSh {Number(product.price || 0).toLocaleString()} · {product.stockQty} available</option>
                ))}
              </select>
            </div>
            <p className="text-xs text-muted-foreground">
              Saving recalculates the total, adjusts reserved stock, records the correction, and tells the customer on WhatsApp.
            </p>
            <button type="button" onClick={saveItems} disabled={savingItems || editItems.length === 0} className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              {savingItems ? "Saving correction…" : "Save corrected order"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
