import assert from "node:assert/strict";
import test from "node:test";
import { summarizeOrderCloseout } from "./order-closeout.ts";

test("summarizes payments, closeout states, and top items by the Nairobi business day", () => {
  const summary = summarizeOrderCloseout([
    {
      id: "cash-order",
      createdAt: "2026-10-05T06:10:00.000Z",
      fulfillmentStatus: "COMPLETED",
      paymentStatus: "PAID",
      totalAmount: 350,
      paymentMeta: { paymentMethod: "cash", paidAt: "2026-10-05T07:00:00.000Z" },
      items: [{ productId: "pilau", productName: "Pilau", quantity: 2, unitPrice: 175 }],
      history: [
        { type: "status", at: "2026-10-05T07:10:00.000Z", to: "SERVED" },
        { type: "status", at: "2026-10-05T07:20:00.000Z", to: "COMPLETED" },
      ],
    },
    {
      id: "mpesa-order-from-yesterday",
      createdAt: "2026-10-04T17:00:00.000Z",
      fulfillmentStatus: "COMPLETED",
      paymentStatus: "PAID",
      totalAmount: 500,
      paymentMeta: { paymentMethod: "mpesa-stk", paidAt: "2026-10-05T07:15:00.000Z" },
      items: [
        { productId: "pilau", productName: "Pilau", quantity: 1, unitPrice: 350 },
        { productId: "juice", productName: "Juice", quantity: 1, unitPrice: 150 },
      ],
      history: [{ type: "status", at: "2026-10-04T18:00:00.000Z", to: "COMPLETED" }],
    },
    {
      id: "card-order",
      createdAt: "2026-10-05T07:00:00.000Z",
      fulfillmentStatus: "COMPLETED",
      paymentStatus: "PAID",
      totalAmount: 200,
      paymentMeta: { paymentMethod: "card", paidAt: "2026-10-05T07:30:00.000Z" },
      items: [{ productId: "tea", productName: "Tea", quantity: 2, unitPrice: 100 }],
      history: [{ type: "status", at: "2026-10-05T07:35:00.000Z", to: "COMPLETED" }],
    },
    {
      id: "ready-unpaid",
      createdAt: "2026-10-03T17:00:00.000Z",
      fulfillmentStatus: "READY",
      paymentStatus: "PENDING",
      history: [],
    },
    {
      id: "served-unpaid",
      createdAt: "2026-10-04T17:00:00.000Z",
      updatedAt: "2026-10-05T07:45:00.000Z",
      fulfillmentStatus: "SERVED",
      paymentStatus: "PENDING",
      history: [{ type: "status", at: "2026-10-05T07:45:00.000Z", to: "SERVED" }],
    },
    {
      id: "cancelled-today",
      createdAt: "2026-10-04T17:00:00.000Z",
      updatedAt: "2026-10-05T07:50:00.000Z",
      fulfillmentStatus: "CANCELLED",
      paymentStatus: "PENDING",
      history: [{ type: "status", at: "2026-10-05T07:50:00.000Z", to: "CANCELLED" }],
    },
    {
      id: "new-order-today",
      createdAt: "2026-10-05T08:00:00.000Z",
      fulfillmentStatus: "NEW",
      paymentStatus: "PENDING",
      history: [],
    },
  ], new Date("2026-10-05T08:00:00.000Z"));

  assert.equal(summary.date, "2026-10-05");
  assert.equal(summary.ordersReceived, 3);
  assert.equal(summary.paidOrderCount, 3);
  assert.equal(summary.totalSales, 1050);
  assert.deepEqual(summary.payments, {
    cash: { amount: 350, count: 1 },
    card: { amount: 200, count: 1 },
    mpesa: { amount: 500, count: 1 },
    other: { amount: 0, count: 0 },
  });
  assert.equal(summary.servedToday, 3);
  assert.equal(summary.openNow, 3);
  assert.equal(summary.cancelledToday, 1);
  assert.deepEqual(summary.topItems.map(({ name, quantity }) => ({ name, quantity })), [
    { name: "Pilau", quantity: 3 },
    { name: "Tea", quantity: 2 },
    { name: "Juice", quantity: 1 },
  ]);
});

test("uses Nairobi midnight boundaries and ignores invalid payment timestamps", () => {
  const summary = summarizeOrderCloseout([
    {
      id: "just-before-midnight",
      createdAt: "2026-10-04T20:59:00.000Z",
      status: "paid",
      totalAmount: 120,
      paymentMeta: { paymentMethod: "cash", paidAt: "2026-10-04T20:59:00.000Z" },
      items: [{ productName: "Yesterday item", quantity: 1, unitPrice: 120 }],
    },
    {
      id: "at-midnight",
      createdAt: "2026-10-04T21:00:00.000Z",
      status: "pending",
    },
    {
      id: "invalid-paid-at",
      createdAt: "2026-10-05T06:00:00.000Z",
      status: "paid",
      totalAmount: 50,
      paymentMeta: { paymentMethod: "manual", paidAt: "not-a-date" },
    },
  ], new Date("2026-10-05T08:00:00.000Z"));

  assert.equal(summary.ordersReceived, 2);
  assert.equal(summary.paidOrderCount, 0);
  assert.equal(summary.totalSales, 0);
  assert.equal(summary.cancelledToday, 0);
});
