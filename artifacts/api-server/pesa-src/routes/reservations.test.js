const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pesa-si-reservations-"));
process.env.ANTHROPIC_API_KEY = "unit-test-only";
process.env.WHATSAPP_TOKEN = "";

const db = require("../db");
const reservations = require("./reservations");
const whatsapp = require("../whatsapp");
const { getAssistantReply } = require("../ai");

let businessSequence = 0;
function createBusiness({ name = "Reservation Test Hotel", merchantType = "hotel" } = {}) {
  businessSequence += 1;
  return db.mutate((state) => db.createBusiness(state, {
    name: `${name} ${businessSequence}`,
    category: merchantType === "retail" ? "Retail" : "Hospitality",
    merchantType,
    phone: `254700${String(businessSequence).padStart(6, "0")}`,
    personalPhone: "254711111111",
    pesaAiNumber: `254722${String(businessSequence).padStart(6, "0")}`,
  }));
}

function createRequest(business, customerPhone = "254799000001") {
  return db.createRoomReservation({
    businessId: business.id,
    customerId: `customer-${business.id}`,
    customerName: "Guest",
    customerPhone,
    roomType: "Standard room",
    checkInDate: "2026-11-05",
    checkOutDate: "2026-11-08",
    guestCount: 2,
  });
}

test("reservation requests validate dates, guests, business type, and persist as pending", () => {
  const hotel = createBusiness();
  const pending = createRequest(hotel);

  assert.match(pending.reference, /^RR-[A-F0-9]{8}$/);
  assert.equal(pending.status, "PENDING");
  assert.equal(pending.quotedAmount, null);
  assert.equal(pending.paymentStatus, "PENDING");
  assert.throws(() => db.createRoomReservation({
    businessId: hotel.id,
    customerPhone: "254799000002",
    roomType: "Standard room",
    checkInDate: "2026-02-30",
    checkOutDate: "2026-03-03",
    guestCount: 1,
  }), /valid check-in and check-out dates/i);
  assert.throws(() => db.createRoomReservation({
    businessId: hotel.id,
    customerPhone: "254799000003",
    roomType: "Standard room",
    checkInDate: "2026-11-05",
    checkOutDate: "2026-11-08",
    guestCount: 21,
  }), /guestCount must be from 1 to 20/i);
  assert.throws(() => db.createRoomReservation({
    businessId: hotel.id,
    customerPhone: "254799000004",
    roomType: "Standard room",
    checkInDate: "2026-11-05",
    checkOutDate: "2026-11-08",
    guestCount: 2,
    customerName: " ",
  }), /customerName is required/i);
  const shop = createBusiness({ name: "Retail Shop", merchantType: "retail" });
  assert.throws(() => createRequest(shop), /only available for hospitality/i);
});

test("reservation list and updates stay within the signed-in business", async () => {
  const hotelA = createBusiness({ name: "Hotel A" });
  const hotelB = createBusiness({ name: "Hotel B" });
  const requestA = createRequest(hotelA);
  createRequest(hotelB, "254799000002");
  const sessionA = { businessId: hotelA.id };

  assert.deepEqual(
    reservations.list({ params: { businessId: hotelA.id }, session: sessionA }).map((item) => item.id),
    [requestA.id],
  );
  await assert.rejects(
    reservations.update({
      params: { businessId: hotelB.id, reservationId: requestA.id },
      body: { status: "CONFIRMED", quotedAmount: 15000 },
      session: sessionA,
    }),
    /not authorized/i,
  );
});

test("reception WhatsApp commands require an explicit rate and notify the right guest details", () => {
  const hotel = createBusiness();
  const request = createRequest(hotel);
  assert.deepEqual(
    whatsapp.parseReservationStaffCommand(`CONFIRM ${request.reference} KES 12,500 NOTE: Late arrival`),
    {
      action: "CONFIRM",
      reference: request.reference,
      quotedAmount: 12500,
      staffNotes: "Late arrival",
    },
  );
  assert.deepEqual(
    whatsapp.parseReservationStaffCommand(`DECLINE ${request.reference}`),
    { action: "DECLINE", reference: request.reference, staffNotes: null },
  );
  assert.equal(whatsapp.parseReservationStaffCommand(`CONFIRM ${request.reference}`).action, "INVALID");
  const notice = whatsapp.buildReservationRequestNotice(request);
  assert.match(notice, new RegExp(request.reference));
  assert.match(notice, /2026-11-05 to 2026-11-08/);
  assert.match(notice, /CONFIRM .* <rate in KSh>/);
});

test("confirmation requires a rate; payment is separate and decisions notify once", async () => {
  const hotel = createBusiness();
  const request = createRequest(hotel);
  const notifications = [];
  const originalNotify = whatsapp.notifyReservationDecision;
  whatsapp.notifyReservationDecision = async (business, reservation) => {
    notifications.push({ businessId: business.id, status: reservation.status });
    return false;
  };

  try {
    await assert.rejects(
      reservations.update({
        params: { businessId: hotel.id, reservationId: request.id },
        body: { status: "CONFIRMED" },
        session: { businessId: hotel.id },
      }),
      /rate is required/i,
    );
    assert.equal(db.getRoomReservation(hotel.id, request.id).status, "PENDING");

    const confirmed = await reservations.update({
      params: { businessId: hotel.id, reservationId: request.id },
      body: { status: "CONFIRMED", quotedAmount: 12500, staffNotes: "Check late arrival" },
      session: { businessId: hotel.id },
    });
    assert.equal(confirmed.status, "CONFIRMED");
    assert.equal(confirmed.quotedAmount, 12500);
    assert.equal(notifications.length, 1);

    const paid = await reservations.update({
      params: { businessId: hotel.id, reservationId: request.id },
      body: { paymentStatus: "PAID", paymentReference: "QWERTY1234" },
      session: { businessId: hotel.id },
    });
    assert.equal(paid.status, "CONFIRMED");
    assert.equal(paid.paymentStatus, "PAID");
    assert.equal(paid.paymentReference, "QWERTY1234");
    assert.equal(notifications.length, 1);

    await assert.rejects(
      reservations.update({
        params: { businessId: hotel.id, reservationId: request.id },
        body: { status: "DECLINED" },
        session: { businessId: hotel.id },
      }),
      /already been reviewed/i,
    );
  } finally {
    whatsapp.notifyReservationDecision = originalNotify;
  }
});

test("hospitality catalog availability ignores stock and does not reserve nonexistent inventory", () => {
  const hotel = createBusiness();
  const product = db.createProduct(hotel.id, { name: "Garden Suite", price: 18000, stockQty: 0 });
  assert.equal(db.isProductAvailable(hotel, product), true);

  const order = db.mutate((state) => db.createOrder(state, {
    businessId: hotel.id,
    customerId: "hotel-guest",
    items: [{ productId: product.id, quantity: 2 }],
  }));
  assert.equal(order.items[0].quantity, 2);
  assert.equal(order.items[0].stockReservedQuantity, 0);
  assert.equal(db.listProducts(hotel.id)[0].stockQty, 0);

  const shop = createBusiness({ name: "Retail Shop", merchantType: "retail" });
  const outOfStock = db.createProduct(shop.id, { name: "Cable", price: 500, stockQty: 0 });
  assert.equal(db.isProductAvailable(shop, outOfStock), false);
});

test("AI uses a stubbed tool call to save a pending reservation without confirming dates or rate", async () => {
  const hotel = createBusiness();
  const responses = [
    {
      stop_reason: "tool_use",
      content: [{
        type: "tool_use",
        id: "reservation-tool",
        name: "create_room_reservation",
        input: {
          guest_name: "Amina Otieno",
          room_type: "Standard room",
          check_in_date: "2026-11-05",
          check_out_date: "2026-11-08",
          guest_count: 2,
        },
      }],
    },
    {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "Reception will check those dates and send a rate. Your request is pending." }],
    },
  ];
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => responses.shift(),
  });

  try {
    const result = await getAssistantReply(hotel, "customer-ai", [], "I want a room from Nov 5 to Nov 8 for two guests", {
      customerName: "Guest",
      customerPhone: "254799000009",
    });
    assert.equal(result.reservationRequest.status, "PENDING");
    assert.equal(result.reservationRequest.customerName, "Amina Otieno");
    assert.equal(result.reservationRequest.quotedAmount, null);
    assert.match(result.replyText, /pending/i);
    assert.equal(responses.length, 0);
  } finally {
    global.fetch = originalFetch;
  }
});

test("AI uses the WhatsApp profile name as a fallback and refuses unnamed room requests", async () => {
  const hotel = createBusiness();
  const originalFetch = global.fetch;
  const requests = [];
  const responses = [
    {
      stop_reason: "tool_use",
      content: [{
        type: "tool_use",
        id: "profile-name-reservation",
        name: "create_room_reservation",
        input: {
          room_type: "Standard room",
          check_in_date: "2026-12-05",
          check_out_date: "2026-12-08",
          guest_count: 1,
        },
      }],
    },
    {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "Thanks. Reception will review your request." }],
    },
    {
      stop_reason: "tool_use",
      content: [{
        type: "tool_use",
        id: "unnamed-reservation",
        name: "create_room_reservation",
        input: {
          room_type: "Standard room",
          check_in_date: "2026-12-10",
          check_out_date: "2026-12-12",
          guest_count: 1,
        },
      }],
    },
    {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "What name should I put on the room request?" }],
    },
  ];
  global.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return { ok: true, json: async () => responses.shift() };
  };

  try {
    const withProfile = await getAssistantReply(hotel, "profile-guest", [], "I want a room", {
      customerName: "WhatsApp Profile",
      customerPhone: "254799000010",
    });
    assert.equal(withProfile.reservationRequest.customerName, "WhatsApp Profile");
    assert.match(requests[0].system, /Known WhatsApp profile name: "WhatsApp Profile"/);
    const roomTool = requests[0].tools.find((tool) => tool.name === "create_room_reservation");
    assert.ok(roomTool.input_schema.required.includes("guest_name"));

    const withoutProfile = await getAssistantReply(hotel, "unnamed-guest", [], "I want a room", {
      customerPhone: "254799000011",
    });
    assert.equal(withoutProfile.reservationRequest, null);
    assert.match(withoutProfile.replyText, /what name/i);
    assert.match(requests[3].messages.at(-1).content[0].content, /Ask the guest for their name/);
    assert.equal(
      db.listRoomReservations(hotel.id).filter((item) => item.customerPhone === "254799000011").length,
      0,
    );
  } finally {
    global.fetch = originalFetch;
  }
});