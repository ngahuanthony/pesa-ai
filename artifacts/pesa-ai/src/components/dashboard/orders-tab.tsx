import {
  useGetMe, useListOrders, getListOrdersQueryKey,
  useUpdateOrderStatus, usePayOrderWithMpesa, useListProducts, getListProductsQueryKey,
} from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ShoppingBag, Smartphone, CheckCircle2, Pencil, Minus, Plus, Trash2, Printer, Volume2, VolumeX, Clock3 , ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { isHospitalityBusiness } from "@/lib/business";
import { isOrderClosed, isOrderPaid, isOrderServed } from "@/lib/order-closeout";
import {
  disableOrderAlertSound,
  enableOrderAlertSound,
  isOrderAlertSoundEnabled,
} from "@/lib/order-alert-sound";
import { OrderDayCloseout } from "./order-day-closeout";

function OrderDayCloseoutDisclosure({ orders }: { orders: any[] }) {
  return (
    <details className="mb-4 rounded-xl border border-border bg-white" data-testid="details-order-day-closeout">
      <summary
        className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden"
        data-testid="summary-order-day-closeout"
      >
        <span>
          End-of-day summary
          <span className="ml-2 text-xs font-normal text-muted-foreground">Open when needed</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="border-t border-border px-3 py-3">
        <OrderDayCloseout orders={orders} />
      </div>
    </details>
  );
}

const STATUS_STYLES: Record<string, string> = {
  new:       "bg-amber-100 text-amber-700",
  accepted:  "bg-blue-100 text-blue-700",
  preparing: "bg-purple-100 text-purple-700",
  ready:     "bg-emerald-100 text-emerald-700",
  served:    "bg-indigo-100 text-indigo-700",
  completed: "bg-primary/10 text-primary",
  cancelled: "bg-rose-100 text-rose-700",
};

const ORDER_TIME_ZONE = "Africa/Nairobi";

interface PaymentMeta {
  paymentMethod?: "mpesa-stk" | "mpesa-c2b" | "manual" | "cash" | "card" | "mpesa-manual";
  mpesaTxnId?:   string | null;
  mpesaAmount?:  number | null;
  mpesaPhone?:   string | null;
  paymentRef?:   string | null;
  paidAt?:       string | null;
}

function formatOrderRef(order: any) {
  const orderNumber = Number(order?.orderNumber);
  return Number.isSafeInteger(orderNumber) && orderNumber >= 1001
    ? `#${orderNumber}`
    : `#${String(order?.id || "").slice(0, 8).toUpperCase()}`;
}

function getOrderTimestamp(createdAt: unknown): number | null {
  const timestamp = Date.parse(String(createdAt ?? ""));
  return Number.isFinite(timestamp) ? timestamp : null;
}

function formatOrderReceivedAt(createdAt: unknown) {
  const timestamp = getOrderTimestamp(createdAt);
  if (timestamp === null) return "Time unavailable";
  const date = new Date(timestamp);
  const day = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: ORDER_TIME_ZONE,
  }).format(date);
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: ORDER_TIME_ZONE,
  }).format(date);
  return `${day} · ${time}`;
}

function formatWaitingDuration(createdAt: unknown) {
  const timestamp = getOrderTimestamp(createdAt);
  if (timestamp === null) return "Time unavailable";
  const totalMinutes = Math.floor(Math.max(0, Date.now() - timestamp) / 60_000);
  if (totalMinutes < 1) return "<1 min";
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function getWaitingMinutes(createdAt: unknown) {
  const timestamp = getOrderTimestamp(createdAt);
  return timestamp === null ? null : Math.floor(Math.max(0, Date.now() - timestamp) / 60_000);
}

function OrderTiming({
  createdAt,
  isActive,
  isLongestWaiting,
}: {
  createdAt: unknown;
  isActive: boolean;
  isLongestWaiting: boolean;
}) {
  const waitingMinutes = getWaitingMinutes(createdAt);
  const ageTone = waitingMinutes !== null && waitingMinutes >= 20
    ? "bg-rose-100 text-rose-800"
    : waitingMinutes !== null && waitingMinutes >= 10
      ? "bg-amber-100 text-amber-800"
      : "bg-muted text-muted-foreground";
  return (
    <div className="mt-1.5 space-y-1">
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Clock3 className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span>Received {formatOrderReceivedAt(createdAt)}</span>
      </div>
      {isActive && (
        <span data-testid="status-order-age" className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${ageTone}`}>
          {isLongestWaiting ? "Longest wait" : "Waiting"} · {formatWaitingDuration(createdAt)}
        </span>
      )}
    </div>
  );
}

function PaymentAttempt({ attempt }: { attempt?: any }) {
  if (!attempt) return null;
  if (attempt.status === "PENDING") {
    const requestedAt = Date.parse(String(attempt.requestedAt || ""));
    const timedOut = Number.isFinite(requestedAt) && Date.now() - requestedAt >= 120_000;
    return timedOut
      ? <p className="mt-1 text-[10px] font-semibold text-rose-700" data-testid="status-mpesa-timeout">M-Pesa prompt timed out after 2 minutes. Resend it or choose another payment method.</p>
      : <p className="mt-1 text-[10px] font-medium text-amber-700">M-Pesa prompt pending on {attempt.phone || "customer phone"}</p>;
  }
  if (attempt.status === "FAILED") {
    return <p className="mt-1 text-[10px] font-semibold text-rose-700" data-testid="status-mpesa-failed">M-Pesa prompt failed: {attempt.resultDesc || "Payment not completed"}. Resend it or choose another payment method.</p>;
  }
  return null;
}

function paymentMethodLabel(method?: string) {
  if (method === "mpesa-stk")  return "M-Pesa (STK push)";
  if (method === "mpesa-c2b")  return "M-Pesa (paybill)";
  if (method === "mpesa-manual") return "M-Pesa (manual confirmation)";
  if (method === "cash") return "Cash (manual)";
  if (method === "card") return "Card (manual)";
  if (method === "manual")     return "Manual confirmation";
  return "M-Pesa";
}

function getPaymentAudit(order: any) {
  return [...(Array.isArray(order?.history) ? order.history : [])]
    .reverse()
    .find((entry: any) => entry.type === "payment");
}

function PaymentDetails({ meta, actor }: { meta: PaymentMeta; actor?: string }) {
  if (!meta) return null;
  return (
    <div className="mt-1 space-y-0.5">
      {(meta.mpesaTxnId || meta.paymentRef) && (
        <div className="text-[10px] font-mono text-muted-foreground">Ref: {meta.mpesaTxnId || meta.paymentRef}</div>
      )}
      {meta.mpesaAmount != null && (
        <div className="text-[10px] text-muted-foreground">KES {meta.mpesaAmount.toLocaleString("en-KE")}</div>
      )}
      <div className="text-[10px] text-muted-foreground">{paymentMethodLabel(meta.paymentMethod)}</div>
      {meta.paidAt && (
        <div className="text-[10px] text-muted-foreground">
          {actor ? `Recorded by ${actor} · ` : "Recorded "}
          {new Intl.DateTimeFormat("en-KE", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: ORDER_TIME_ZONE,
          }).format(new Date(meta.paidAt))}
        </div>
      )}
    </div>
  );
}

function escapePrintText(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function printOrderDocument({
  order,
  businessName,
  kind,
  paperWidth,
}: {
  order: any;
  businessName: string;
  kind: "order" | "bill";
  paperWidth: 58 | 80;
}) {
  const printWindow = window.open("", "_blank", "width=420,height=900");
  if (!printWindow) return false;

  const orderRef = formatOrderRef(order);
  const createdAt = order.createdAt
    ? new Date(order.createdAt).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" })
    : "";
  const items = Array.isArray(order.items) ? order.items : [];
  const total = Number(order.totalAmount ?? order.totalKES ?? 0);
  const location = order.serviceLocationSnapshot;
  const itemRows = items.map((item: any) => {
    const quantity = Number(item.quantity ?? item.qty ?? 1);
    const unitPrice = Number(item.unitPrice ?? item.price ?? 0);
    const lineTotal = Number(item.total ?? item.lineTotal ?? unitPrice * quantity);
    return kind === "bill"
      ? `<div class="item"><span>${quantity} × ${escapePrintText(item.productName || item.name || "Item")}</span><strong>KES ${lineTotal.toLocaleString("en-KE")}</strong></div>`
      : `<div class="item"><strong class="quantity">${quantity} ×</strong><span>${escapePrintText(item.productName || item.name || "Item")}</span></div>`;
  }).join("");
  const paymentMeta = order.paymentMeta || {};
  const paymentStatus = String(order.paymentStatus || order.status || "").toLowerCase();
  const paymentLabel = paymentStatus === "paid" || paymentStatus === "fulfilled" ? "Paid" : "Payment pending";
  const paymentRef = paymentMeta.mpesaTxnId || paymentMeta.paymentRef;
  const locationLine = location
    ? `<div class="detail">${escapePrintText(location.kind || "Location")}: ${escapePrintText(location.label || "")}</div>`
    : "";

  printWindow.document.write(`<!doctype html>
<html><head><meta charset="utf-8"><title>${kind === "bill" ? "Bill" : "Order"} ${escapePrintText(orderRef)}</title>
<style>
  @page { size: ${paperWidth}mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body { width: ${paperWidth}mm; margin: 0; padding: 0; background: #fff; color: #000; }
  body { font: 11px/1.35 Arial, sans-serif; }
  .receipt { width: ${paperWidth}mm; padding: 3mm; }
  header { text-align: center; padding-bottom: 3mm; border-bottom: 1px dashed #000; }
  h1 { margin: 0 0 2mm; font-size: 16px; line-height: 1.2; overflow-wrap: anywhere; }
  h2 { margin: 0; font-size: 12px; text-transform: uppercase; }
  .reference { margin-top: 1mm; font: bold 12px monospace; }
  .details { padding: 3mm 0; border-bottom: 1px dashed #000; }
  .detail { overflow-wrap: anywhere; }
  .detail + .detail { margin-top: 1mm; }
  .items { padding: 2mm 0; border-bottom: 1px dashed #000; }
  .item { display: flex; align-items: flex-start; justify-content: space-between; gap: 2mm; padding: 1mm 0; }
  .item > span { min-width: 0; overflow-wrap: anywhere; }
  .item > strong { flex-shrink: 0; text-align: right; }
  .quantity { min-width: 9mm; }
  .total { display: flex; justify-content: space-between; gap: 2mm; padding: 3mm 0; font-size: 14px; font-weight: bold; }
  .payment { padding: 2mm 0; border-top: 1px dashed #000; font-weight: bold; overflow-wrap: anywhere; }
  footer { margin-top: 3mm; padding-top: 2mm; border-top: 1px dashed #000; text-align: center; font-size: 9px; }
  @media print { html, body, .receipt { width: ${paperWidth}mm; } }
</style></head><body><main class="sheet">
  <div class="receipt">
  <header><h1>${escapePrintText(businessName || "Pesa SI shop")}</h1><h2>${kind === "bill" ? "Customer Bill" : "Order Ticket"}</h2><div class="reference">${escapePrintText(orderRef)}</div></header>
  <section class="details">
    <div class="detail"><strong>Customer:</strong> ${escapePrintText(order.customerName || "Customer")}</div>
    ${order.customerPhone ? `<div class="detail">${escapePrintText(order.customerPhone)}</div>` : ""}
    ${locationLine}
    <div class="detail">${escapePrintText(createdAt)}</div>
    <div class="detail"><strong>Status:</strong> ${escapePrintText(order.fulfillmentStatus || order.status || "New")}</div>
  </section>
  <section class="items">${itemRows || `<div>No items recorded</div>`}</section>
  <div class="total"><span>Total</span><span>KES ${total.toLocaleString("en-KE")}</span></div>
  ${kind === "bill" ? `<div class="payment">${escapePrintText(paymentLabel)}${paymentRef ? `<br>Ref: ${escapePrintText(paymentRef)}` : ""}</div>` : ""}
  <footer>Thank you · ${escapePrintText(orderRef)}</footer>
  </div>
</main><script>window.onload = function () { window.focus(); window.print(); window.onafterprint = function () { window.close(); }; };</script>
</body></html>`);
  printWindow.document.close();
  return true;
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
  const nextStatus: Record<string, string> = {
    NEW: "ACCEPTED",
    PENDING: "ACCEPTED",
    ACCEPTED: "PREPARING",
    CONFIRMED: "PREPARING",
    PREPARING: "READY",
    READY: "SERVED",
  };
  if (upperStatus === "SERVED" && isOrderPaid(order)) nextStatus.SERVED = "COMPLETED";
  const next = nextStatus[upperStatus];
  const fallback = upperStatus === "COMPLETED" || upperStatus === "CANCELLED"
    ? []
      : ["NEW", "PENDING", "ACCEPTED", "CONFIRMED", "PREPARING", "READY"].includes(upperStatus) &&
          next && !isOrderPaid(order)
      ? ["CANCELLED"]
        : [];
  const labelByStatus: Record<string, string> = {
    ACCEPTED: "Accept order",
    PREPARING: "Start preparing",
    READY: "Mark ready",
    SERVED: "Mark served",
    COMPLETED: "Close order",
  };
  const nameByStatus: Record<string, string> = {
    NEW: "New",
    ACCEPTED: "Accepted",
    PREPARING: "Preparing",
    READY: "Ready",
    SERVED: "Served",
    COMPLETED: "Closed",
    CANCELLED: "Cancelled",
  };

  return (
    <div className="space-y-2">
      <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_STYLES[normStatus] ?? "bg-muted text-foreground"}`}>
        {nameByStatus[upperStatus] || currentStatus}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        {next && (
          <button
            type="button"
            data-testid={`button-next-order-step-${order.id}`}
            onClick={() => onChange(order.id, next)}
            className="rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-primary/90"
          >
            {labelByStatus[next]}
          </button>
        )}
        {fallback.length > 0 && (
          <Select onValueChange={(value) => onChange(order.id, value)}>
            <SelectTrigger
              className="h-8 w-[5.5rem] bg-white px-2 text-[11px]"
              aria-label={`More actions for ${formatOrderRef(order)}`}
              data-testid={`select-order-fallback-${order.id}`}
            >
              <SelectValue placeholder="More" />
            </SelectTrigger>
            <SelectContent>
              {fallback.map((status) => (
                <SelectItem key={status} value={status}>{nameByStatus[status]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      {upperStatus === "SERVED" && !isOrderPaid(order) && (
        <p className="text-[10px] font-semibold text-amber-800">Payment needed before closing</p>
      )}
    </div>
  );
}

export function OrdersTab() {
  const { data: me } = useGetMe();
  const businessId = me?.business?.id || "";
  const hospitalityBusiness = isHospitalityBusiness(me?.business);
  const { data: orders, isLoading, isError } = useListOrders(businessId, {
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
  const [orderFilter, setOrderFilter] = useState<"active" | "closed">("active");
  const [orderSoundEnabled, setOrderSoundEnabled] = useState(isOrderAlertSoundEnabled);
  const [manualPaymentMethod, setManualPaymentMethod] = useState<"cash" | "card" | "mpesa-manual">("cash");

  const businessName = me?.business?.name || "Pesa SI shop";
  const [receiptWidth, setReceiptWidth] = useState<"58" | "80">(() => {
    if (typeof window === "undefined") return "80";
    try {
      const saved = window.localStorage.getItem("pesa-si-receipt-width");
      return saved === "58" ? "58" : "80";
    } catch {
      return "80";
    }
  });

  const printOrder = (order: any, kind: "order" | "bill") => {
    if (!printOrderDocument({ order, businessName, kind, paperWidth: Number(receiptWidth) as 58 | 80 })) {
      toast({ title: "Printing window was blocked", description: "Allow pop-ups for this site, then try again.", variant: "destructive" });
    }
  };

  const changeReceiptWidth = (width: "58" | "80") => {
    setReceiptWidth(width);
    try {
      window.localStorage.setItem("pesa-si-receipt-width", width);
    } catch {
      // Keep the current selection for this session if browser storage is disabled.
    }
  };

  const toggleOrderSound = async () => {
    if (orderSoundEnabled) {
      disableOrderAlertSound();
      setOrderSoundEnabled(false);
      toast({ title: "Order sound alerts muted" });
      return;
    }
    try {
      await enableOrderAlertSound();
      setOrderSoundEnabled(true);
      toast({ title: "Order sound alerts enabled", description: "New hotel orders will beep while this dashboard session is open." });
    } catch (error: any) {
      toast({ title: error.message || "Could not enable sound alerts", variant: "destructive" });
    }
  };

  const soundControl = (
    <button
      type="button"
      onClick={() => void toggleOrderSound()}
      data-testid="button-toggle-order-sound"
      className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-colors ${
        orderSoundEnabled
          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
          : "border-border bg-white text-muted-foreground hover:bg-muted"
      }`}
      title="Sound is on by default. Browser playback starts after your first interaction."
    >
      {orderSoundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
      {orderSoundEnabled ? "Sound on · mute" : "Turn sound on"}
    </button>
  );

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
        body: JSON.stringify({
          paymentMethod: manualPaymentMethod,
          paymentRef: paymentRef.trim() || null,
        }),
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
  const isOrderActionableForPayment = (o: any) => {
    if (o.fulfillmentStatus) {
      return o.paymentStatus !== "PAID" && o.fulfillmentStatus !== "CANCELLED";
    }
    const norm = (o.status || "").toLowerCase();
    return norm === "pending" || norm === "confirmed";
  };

  const orderList = Array.isArray(orders) ? orders as any[] : [];
  const statusOf = (order: any) => String(order.fulfillmentStatus || order.status || "").toUpperCase();
  const activeCount = orderList.filter((order) => !isOrderClosed(order)).length;
  const closedCount = orderList.filter(isOrderClosed).length;
  const servedUnpaidCount = orderList.filter((order) => isOrderServed(order) && !isOrderPaid(order) && !isOrderClosed(order)).length;
  const newCount = orderList.filter((order) =>
    statusOf(order) === "NEW" || statusOf(order) === "PENDING"
  ).length;
  const filteredOrders = orderList.filter((order) => {
    return orderFilter === "active" ? !isOrderClosed(order) : isOrderClosed(order);
  }).sort((a, b) => {
    const aActive = !isOrderClosed(a);
    const bActive = !isOrderClosed(b);
    if (aActive !== bActive) return aActive ? -1 : 1;

    const aTime = getOrderTimestamp(a.createdAt);
    const bTime = getOrderTimestamp(b.createdAt);
    if (aTime === null) return bTime === null ? String(a.id).localeCompare(String(b.id)) : 1;
    if (bTime === null) return -1;
    return aActive ? aTime - bTime : bTime - aTime;
  });
  const longestWaitingOrderId = filteredOrders.find((order) =>
    !isOrderClosed(order) &&
    getOrderTimestamp(order.createdAt) !== null
  )?.id;
  const emptyOrdersMessage = orderFilter === "active"
    ? "No active orders to show."
    : "No closed orders to show.";

  if (isLoading) return <div className="py-16 text-center text-muted-foreground text-sm">Loading orders…</div>;
  if (isError) return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-8 text-center text-sm text-rose-800" role="alert" data-testid="status-orders-load-error">
      Orders and the end-of-day summary could not be loaded. Refresh the page to try again.
    </div>
  );

  if (!orders?.length) return (
    <>
      <OrderDayCloseoutDisclosure orders={orderList} />
      <div className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-2xl py-20 text-center px-4">
        {soundControl}
        <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
          <ShoppingBag className="h-7 w-7 text-primary" />
        </div>
        <h3 className="text-lg font-bold mb-2">No orders yet</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          When customers order through your WhatsApp assistant, their orders appear here for you to track and fulfil.
        </p>
      </div>
    </>
  );

  return (
    <>
      <OrderDayCloseoutDisclosure orders={orderList} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex w-fit rounded-xl border border-border bg-white p-1" role="group" aria-label="Filter orders by open or closed status">
          {([
            ["active", `Active (${activeCount})`],
            ["closed", `Closed (${closedCount})`],
          ] as const).map(([filter, label]) => (
            <button
              key={filter}
              type="button"
              onClick={() => setOrderFilter(filter)}
              aria-pressed={orderFilter === filter}
              data-testid={`button-orders-filter-${filter}`}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                orderFilter === filter ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {soundControl}
          <label htmlFor="receipt-paper-width" className="text-xs font-medium text-muted-foreground">Receipt printer width</label>
          <Select value={receiptWidth} onValueChange={(value) => changeReceiptWidth(value as "58" | "80")}>
            <SelectTrigger id="receipt-paper-width" className="h-9 w-28 bg-white text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="58">58 mm roll</SelectItem>
              <SelectItem value="80">80 mm roll</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {servedUnpaidCount > 0 && (
        <div
          className="mb-4 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950"
          role="status"
          data-testid="banner-served-unpaid"
        >
          <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <p className="text-sm font-semibold">
            {servedUnpaidCount} served order{servedUnpaidCount === 1 ? " is" : "s are"} still unpaid.
            {" "}Record the payment to close {servedUnpaidCount === 1 ? "it" : "them"}.
          </p>
        </div>
      )}
      {newCount > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
          <p className="text-sm font-medium text-amber-800">You have {newCount} new order{newCount > 1 ? "s" : ""} waiting. Active orders are sorted by longest wait.</p>
          </div>
        </div>
      )}
      <div className="border border-border rounded-xl overflow-hidden bg-white">

        {/* ── Desktop table (hidden on mobile) ── */}
        <div className="hidden sm:block">
          <div className="grid grid-cols-[1.35fr_1.1fr_1.5fr_0.8fr_1fr_1.2fr] bg-muted/50 px-4 py-2.5 border-b border-border">
            {["TABLE / LOCATION", "CUSTOMER", "ITEMS", "TOTAL", "FULFILMENT", "PAYMENT"].map((h) => (
              <span key={h} className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{h}</span>
            ))}
          </div>

          {filteredOrders.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground" data-testid={`text-empty-orders-${orderFilter}`}>
              {emptyOrdersMessage}
            </div>
          ) : filteredOrders.map((o, i) => {
            const meta: PaymentMeta | undefined = o.paymentMeta;
            const paymentAudit = getPaymentAudit(o);
            const servedUnpaid = isOrderServed(o) && !isOrderPaid(o) && !isOrderClosed(o);
            const mpesaAttempt = (o as any).mpesaPaymentAttempt;
            const requestedAt = Date.parse(String(mpesaAttempt?.requestedAt || ""));
            const mpesaTimedOut = mpesaAttempt?.status === "PENDING" &&
              Number.isFinite(requestedAt) && Date.now() - requestedAt >= 120_000;
            const canResendMpesa = mpesaAttempt?.status === "FAILED" || mpesaTimedOut;
            const mpesaStillPending = mpesaAttempt?.status === "PENDING" && !mpesaTimedOut;
            return (
              <div
                key={o.id}
                data-testid={`row-order-${o.id}`}
                className={`grid grid-cols-[1.35fr_1.1fr_1.5fr_0.8fr_1fr_1.2fr] items-start px-4 py-4 transition-colors ${
                  servedUnpaid ? "border-l-4 border-amber-500 bg-amber-50/70" : "hover:bg-muted/30"
                } ${i < filteredOrders.length - 1 ? "border-b border-border" : ""}`}
              >
                {servedUnpaid && (
                  <div className="-mx-4 -mt-4 col-span-6 mb-3 border-b border-amber-200 bg-amber-100/70 px-4 py-2 text-xs font-bold text-amber-900">
                    Served · payment still needed before this order can be closed
                  </div>
                )}
                <div>
                  <div className="text-sm font-extrabold leading-tight text-foreground">
                    {o.serviceLocationSnapshot?.label || "No table/location"}
                  </div>
                  <div className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                    {o.serviceLocationSnapshot?.kind || "Order"}
                  </div>
                  <div title={String(o.id)} className="mt-1 font-mono text-xs font-semibold text-muted-foreground">{formatOrderRef(o)}</div>
                  <OrderTiming
                    createdAt={o.createdAt}
                    isActive={!isOrderClosed(o)}
                    isLongestWaiting={o.id === longestWaitingOrderId}
                  />
                  <div className="mt-2 flex flex-wrap gap-1">
                    <button onClick={() => printOrder(o, "order")} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-muted" title="Print order receipt on thermal paper">
                      <Printer className="h-3 w-3" /> Receipt
                    </button>
                    <button onClick={() => printOrder(o, "bill")} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-muted" title="Print customer bill on thermal paper">
                      <Printer className="h-3 w-3" /> Bill
                    </button>
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">{o.customerName || "Customer"}</div>
                  <div className="text-xs text-muted-foreground">{o.customerPhone}</div>
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
                </div>
                <div>
                  {isOrderPaid(o) ? (
                    <div>
                      <div className="flex items-center gap-1 text-xs text-emerald-600 font-semibold">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Paid
                      </div>
                      {meta && <PaymentDetails meta={meta} actor={paymentAudit?.actor} />}
                      <PaymentAttempt attempt={(o as any).mpesaPaymentAttempt} />
                    </div>
                  ) : isOrderActionableForPayment(o) ? (
                    <div className="flex flex-col gap-1.5">
                      <PaymentAttempt attempt={mpesaAttempt} />
                      <button
                        data-testid={canResendMpesa ? `button-resend-mpesa-${o.id}` : `button-mpesa-prompt-${o.id}`}
                        disabled={mpesaStillPending}
                        onClick={() => { setPayOrder(o.id); setPayPhone(o.customerPhone); }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 px-2.5 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Smartphone className="h-3.5 w-3.5" /> {canResendMpesa ? "Resend prompt" : mpesaStillPending ? "Prompt pending" : "M-Pesa prompt"}
                      </button>
                      <button
                        onClick={() => { setMarkOrder(o.id); setPaymentRef(""); setManualPaymentMethod("cash"); }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Record payment
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
          {filteredOrders.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground" data-testid={`text-empty-orders-mobile-${orderFilter}`}>
              {emptyOrdersMessage}
            </div>
          ) : filteredOrders.map((o) => {
            const meta: PaymentMeta | undefined = o.paymentMeta;
            const paymentAudit = getPaymentAudit(o);
            const servedUnpaid = isOrderServed(o) && !isOrderPaid(o) && !isOrderClosed(o);
            const mpesaAttempt = (o as any).mpesaPaymentAttempt;
            const requestedAt = Date.parse(String(mpesaAttempt?.requestedAt || ""));
            const mpesaTimedOut = mpesaAttempt?.status === "PENDING" &&
              Number.isFinite(requestedAt) && Date.now() - requestedAt >= 120_000;
            const canResendMpesa = mpesaAttempt?.status === "FAILED" || mpesaTimedOut;
            const mpesaStillPending = mpesaAttempt?.status === "PENDING" && !mpesaTimedOut;
            return (
              <div
                key={o.id}
                data-testid={`card-order-${o.id}`}
                className={`space-y-3 border-l-4 px-4 py-4 ${
                  servedUnpaid ? "border-amber-500 bg-amber-50/70" : "border-transparent"
                }`}
              >
                {servedUnpaid && (
                  <div className="-mx-4 -mt-4 border-b border-amber-200 bg-amber-100/70 px-4 py-2 text-xs font-bold text-amber-900">
                    Served · payment still needed before this order can be closed
                  </div>
                )}
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-base font-extrabold leading-tight text-foreground">
                      {o.serviceLocationSnapshot?.label || "No table/location"}
                    </div>
                    <div className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                      {o.serviceLocationSnapshot?.kind || "Order"}
                    </div>
                    <span title={String(o.id)} className="mt-1 inline-block font-mono text-xs font-semibold text-muted-foreground">{formatOrderRef(o)}</span>
                    <OrderTiming
                      createdAt={o.createdAt}
                      isActive={!isOrderClosed(o)}
                      isLongestWaiting={o.id === longestWaitingOrderId}
                    />
                    <div className="mt-2 flex flex-wrap gap-1">
                      <button onClick={() => printOrder(o, "order")} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-muted" title="Print order receipt on thermal paper">
                        <Printer className="h-3 w-3" /> Receipt
                      </button>
                      <button onClick={() => printOrder(o, "bill")} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-muted" title="Print customer bill on thermal paper">
                        <Printer className="h-3 w-3" /> Bill
                      </button>
                    </div>
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
                    {meta && <PaymentDetails meta={meta} actor={paymentAudit?.actor} />}
                    <PaymentAttempt attempt={(o as any).mpesaPaymentAttempt} />
                  </div>
                ) : isOrderActionableForPayment(o) ? (
                    <div className="space-y-2">
                      <PaymentAttempt attempt={mpesaAttempt} />
                      <div className="flex gap-2">
                        <button
                          data-testid={canResendMpesa ? `button-resend-mpesa-${o.id}` : `button-mpesa-prompt-${o.id}`}
                          disabled={mpesaStillPending}
                          onClick={() => { setPayOrder(o.id); setPayPhone(o.customerPhone); }}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-primary/30 px-3 py-2.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Smartphone className="h-3.5 w-3.5" /> {canResendMpesa ? "Resend prompt" : mpesaStillPending ? "Prompt pending" : "M-Pesa prompt"}
                        </button>
                        <button
                          onClick={() => { setMarkOrder(o.id); setPaymentRef(""); setManualPaymentMethod("cash"); }}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-300 px-3 py-2.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Record payment
                        </button>
                      </div>
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
                  <div>Order: <strong className="font-mono">{formatOrderRef(o)}</strong></div>
                  <div>Amount: <strong>KES {(o.totalAmount ?? o.totalKES).toLocaleString()}</strong></div>
                  <div className="text-muted-foreground text-xs">Choose how the customer paid. This records the staff account and time for reconciliation.</div>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="manual-payment-method" className="text-sm font-medium">Payment method</label>
                  <Select
                    value={manualPaymentMethod}
                    onValueChange={(value) => setManualPaymentMethod(value as "cash" | "card" | "mpesa-manual")}
                  >
                    <SelectTrigger id="manual-payment-method" className="h-10 bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                      <SelectItem value="mpesa-manual">M-Pesa (manual confirmation)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Payment reference <span className="text-muted-foreground font-normal">(optional)</span></label>
                  <Input
                    value={paymentRef}
                    onChange={(e) => setPaymentRef(e.target.value)}
                    placeholder="M-Pesa reference or receipt note"
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
            <DialogTitle>Correct Order {formatOrderRef(editOrder)}</DialogTitle>
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
                {products.filter((product) => product.active !== false && (hospitalityBusiness || Number(product.stockQty || 0) > 0)).map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} · KSh {Number(product.price || 0).toLocaleString()} · {hospitalityBusiness ? "Available by default" : `${product.stockQty} available`}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-muted-foreground">
              {hospitalityBusiness
                ? "Hospitality items remain orderable regardless of stock count. Saving recalculates the total, adjusts only stock actually reserved, and records the correction."
                : "Saving recalculates the total, adjusts reserved stock, records the correction, and tells the customer on WhatsApp."}
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
