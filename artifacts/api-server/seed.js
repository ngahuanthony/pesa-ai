#!/usr/bin/env node
// Seeds the pilot business — Digital Nation Accessories — with a starter
// product catalog and a demo login, so there's something to sign into and
// test the assistant against immediately after `npm start`.
// Safe to re-run: skips whatever already exists.

const db = require("./src/db");
const auth = require("./src/auth");

const DEMO_EMAIL = "demo@digitalnation.co.ke";
const DEMO_PASSWORD = "demo12345";

function main() {
  let business = db.listBusinesses().find((b) => b.phone === "0700000000");

  if (!business) {
    const { passwordHash, passwordSalt } = auth.hashPassword(DEMO_PASSWORD);
    const created = db.mutate((state) => {
      const business = db.createBusiness(state, {
        name: "Digital Nation Accessories",
        category: "phone accessories",
        phone: "0700000000",
        paybillNumber: null,
      });
      db.createAccount(state, { businessId: business.id, email: DEMO_EMAIL, passwordHash, passwordSalt });
      return business;
    });
    business = created;
    console.log(`Created pilot business: ${business.name} (persona: ${business.personaName})`);
    console.log(`Demo login -> email: ${DEMO_EMAIL}  password: ${DEMO_PASSWORD}`);
  } else {
    console.log(`Pilot business already exists: ${business.name} (id: ${business.id})`);
  }

  const products = db.listProducts(business.id);
  if (products.length === 0) {
    const starter = [
      { name: "Tempered Glass Screen Protector", description: "Universal fit, most phone models", price: 200, stockQty: 50 },
      { name: "Silicone Phone Case", description: "Shockproof, available in black/clear/blue", price: 350, stockQty: 40 },
      { name: "Type-C Fast Charger (20W)", description: "Cable + adapter, fast charging", price: 900, stockQty: 25 },
      { name: "Wireless Earbuds", description: "Bluetooth 5.0, with charging case", price: 1500, stockQty: 15 },
      { name: "Power Bank 10000mAh", description: "Dual USB output", price: 1800, stockQty: 10 },
      { name: "Car Phone Holder", description: "Dashboard mount, adjustable", price: 450, stockQty: 20 },
    ];
    for (const p of starter) db.createProduct(business.id, p);
    console.log(`Added ${starter.length} starter products.`);
  } else {
    console.log(`Business already has ${products.length} product(s) — skipping product seed.`);
  }

  console.log("\nDone. Business ID:", business.id);
  console.log(`Log in at http://localhost:${process.env.PORT || 4000}/login.html with:`);
  console.log(`  email:    ${DEMO_EMAIL}`);
  console.log(`  password: ${DEMO_PASSWORD}`);
}

main();
