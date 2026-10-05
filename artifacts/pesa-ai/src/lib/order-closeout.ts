export interface CloseoutOrder {
  id?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  status?: string | null;
  fulfillmentStatus?: string | null;
  paymentStatus?: string | null;
  paymentMethod?: string | null;
  totalAmount?: number | string | null;
  paymentMeta?: {
    paymentMethod?: string | null;
    paidAt?: string | null;
  } | null;
  items?: Array<{
    productId?: string | null;
    productName?: string | null;
    name?: string | null;
    quantity?: number | string | null;
    qty?: number | string | null;
    unitPrice?: number | string | null;
    price?: number | string | null;
    lineTotal?: number | string | null;
    totalPrice?: number | string | null;
  }> | null;
  history?: Array<{
    type?: string | null;
    at?: string | null;
    to?: string | null;
  }> | null;
}

export interface CloseoutPaymentTotal {
  amount: number;
  count: number;
}

export interface CloseoutTopItem {
  id: string;
  name: string;
  quantity: number;
  revenue: number;
}

export interface OrderCloseoutSummary {
  date: string;
  ordersReceived: number;
  paidOrderCount: number;
  totalSales: number;
  payments: {
    cash: CloseoutPaymentTotal;
    card: CloseoutPaymentTotal;
    mpesa: CloseoutPaymentTotal;
    other: CloseoutPaymentTotal;
  };
  servedToday: number;
  openNow: number;
  cancelledToday: number;
  topItems: CloseoutTopItem[];
}

const SERVED_STATUSES = new Set(["SERVED", "COMPLETED", "FULFILLED"]);

function normalizedStatus(order: CloseoutOrder) {
  return String(order.fulfillmentStatus || order.status || "").toUpperCase();
}

export function isOrderPaid(order: CloseoutOrder) {
  if (order.fulfillmentStatus) {
    return String(order.paymentStatus || "").toUpperCase() === "PAID";
  }
  const status = String(order.status || "").toLowerCase();
  return status === "paid" || status === "fulfilled";
}

export function isOrderServed(order: CloseoutOrder) {
  return SERVED_STATUSES.has(normalizedStatus(order));
}

export function isOrderClosed(order: CloseoutOrder) {
  return normalizedStatus(order) === "CANCELLED" || (isOrderServed(order) && isOrderPaid(order));
}

function dateKey(value: string | Date | null | undefined, timeZone: string) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function amount(value: number | string | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function countStatusChangesToday(
  orders: readonly CloseoutOrder[],
  targetStatuses: Set<string>,
  today: string,
  timeZone: string,
) {
  const matched = new Set<string>();

  orders.forEach((order, index) => {
    const orderId = String(order.id || `order-${index}`);
    const statusHistory = (Array.isArray(order.history) ? order.history : [])
      .filter((entry) => String(entry.type || "").toLowerCase() === "status");

    for (const entry of statusHistory) {
      const status = String(entry.to || "").toUpperCase();
      if (targetStatuses.has(status) && dateKey(entry.at, timeZone) === today) {
        matched.add(orderId);
      }
    }

    // Older orders may not have a status history. Use their last update as the
    // best available event time, but do not override a recorded history.
    if (statusHistory.length === 0) {
      const currentStatus = normalizedStatus(order);
      if (targetStatuses.has(currentStatus) && dateKey(order.updatedAt || order.createdAt, timeZone) === today) {
        matched.add(orderId);
      }
    }
  });

  return matched.size;
}

function paymentBucket(order: CloseoutOrder): keyof OrderCloseoutSummary["payments"] {
  const method = String(order.paymentMeta?.paymentMethod || order.paymentMethod || "").toLowerCase();
  if (method === "cash") return "cash";
  if (method === "card") return "card";
  if (method.startsWith("mpesa")) return "mpesa";
  return "other";
}

export function summarizeOrderCloseout(
  orders: readonly CloseoutOrder[],
  now = new Date(),
  timeZone = "Africa/Nairobi",
): OrderCloseoutSummary {
  const today = dateKey(now, timeZone) || "";
  const receivedToday = orders.filter((order) => dateKey(order.createdAt, timeZone) === today);
  const paidToday = orders.filter((order) =>
    isOrderPaid(order) &&
    dateKey(order.paymentMeta?.paidAt || order.updatedAt || order.createdAt, timeZone) === today
  );

  const payments: OrderCloseoutSummary["payments"] = {
    cash: { amount: 0, count: 0 },
    card: { amount: 0, count: 0 },
    mpesa: { amount: 0, count: 0 },
    other: { amount: 0, count: 0 },
  };
  const itemTotals = new Map<string, CloseoutTopItem>();
  let totalSales = 0;

  for (const order of paidToday) {
    const orderAmount = amount(order.totalAmount);
    totalSales += orderAmount;
    const bucket = payments[paymentBucket(order)];
    bucket.amount += orderAmount;
    bucket.count += 1;

    for (const item of Array.isArray(order.items) ? order.items : []) {
      const quantity = amount(item.quantity ?? item.qty ?? 1);
      if (quantity <= 0) continue;

      const name = String(item.productName || item.name || "Unnamed item");
      const id = String(item.productId || name);
      const unitPrice = amount(item.unitPrice ?? item.price);
      const savedLineTotal = item.lineTotal ?? item.totalPrice;
      const itemRevenue = savedLineTotal == null ? unitPrice * quantity : amount(savedLineTotal);
      const current = itemTotals.get(id) || { id, name, quantity: 0, revenue: 0 };
      current.quantity += quantity;
      current.revenue += itemRevenue;
      itemTotals.set(id, current);
    }
  }

  for (const bucket of Object.values(payments)) {
    bucket.amount = Math.round(bucket.amount * 100) / 100;
  }

  return {
    date: today,
    ordersReceived: receivedToday.length,
    paidOrderCount: paidToday.length,
    totalSales: Math.round(totalSales * 100) / 100,
    payments,
    servedToday: countStatusChangesToday(orders, new Set(["SERVED", "COMPLETED", "FULFILLED"]), today, timeZone),
    openNow: orders.filter((order) => !isOrderClosed(order)).length,
    cancelledToday: countStatusChangesToday(orders, new Set(["CANCELLED"]), today, timeZone),
    topItems: [...itemTotals.values()]
      .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue || a.name.localeCompare(b.name))
      .slice(0, 5),
  };
}
