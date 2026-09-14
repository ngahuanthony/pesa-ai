const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pesa-public-shops-"));
const db = require("../db");
const publicShops = require("./public-shops");

function fixture() {
  fs.writeFileSync(db.DATA_FILE, JSON.stringify({
    businesses: [
      {
        id: "public-a",
        name: "A Accessories",
        category: "Phone accessories",
        publicPhone: "0792 717 918",
        publicShopPublished: true,
        location: "Nairobi CBD",
      },
      {
        id: "public-b",
        name: "B Accessories",
        category: "Phone accessories",
        whatsappRequestedPhone: "0792 717 918",
        published: true,
      },
      {
        id: "private-same-number",
        name: "Private Accessories",
        publicPhone: "0792 717 918",
        publicShopPublished: false,
      },
      {
        id: "personal-only",
        name: "Personal Number Shop",
        phone: "0792 717 918",
        publicShopPublished: true,
      },
    ],
    products: [
      {
        id: "iphone-16",
        businessId: "public-a",
        name: "iPhone 16 Pro Max Clear Cover",
        description: "Protective phone cover",
        price: 800,
        stockQty: 7,
        active: true,
        colorStock: [
          {
            color: "Orange",
            quantity: 3,
            imageUrl: "https://example.supabase.co/storage/v1/object/public/product-images/public-a/iphone-16_orange.webp",
          },
          { color: "Black", quantity: 4 },
        ],
      },
    ],
  }));
}

test.beforeEach(fixture);

test("accepts common Kenyan number formats and matches exact public numbers", () => {
  const local = publicShops.search({ query: { phone: "0792 717 918" } });
  const international = publicShops.search({ query: { phone: "+254 792 717 918" } });

  assert.equal(local.phone, "254792717918");
  assert.deepEqual(local.shops.map((shop) => shop.name), ["A Accessories", "B Accessories"]);
  assert.deepEqual(international.shops.map((shop) => shop.name), local.shops.map((shop) => shop.name));
  assert.match(local.shops[0].whatsappUrl, /text=Hi%20a-accessories-public-a/);
});

test("returns only photographed matching variants for on-demand search", () => {
  const result = publicShops.searchProducts({
    query: { business_id: "public-a", q: "iPhone 16 orange" },
  });
  assert.equal(result.variants.length, 1);
  assert.equal(result.variants[0].variant, "Orange");
  assert.equal(result.variants[0].stockQty, 3);
  assert.match(result.variants[0].imageUrl, /iphone-16_orange\\.webp$/);
});

test("does not expose unpublished or personal-number businesses", () => {
  const result = publicShops.search({ query: { phone: "0792 717 918" } });
  assert.equal(result.shops.some((shop) => shop.name === "Private Accessories"), false);
  assert.equal(result.shops.some((shop) => shop.name === "Personal Number Shop"), false);
});

test("returns an empty list for an exact number with no public shop", () => {
  assert.deepEqual(publicShops.search({ query: { phone: "0711 111 111" } }).shops, []);
});

test("rejects partial and malformed phone searches", () => {
  assert.throws(
    () => publicShops.search({ query: { phone: "717 918" } }),
    { message: /complete Kenyan shop number/ },
  );
});

test("resolves unique legacy name slugs but not ambiguous names", () => {
  const unique = db.getPublicShopBySlug("a-accessories");
  assert.equal(unique.name, "A Accessories");

  const state = JSON.parse(fs.readFileSync(db.DATA_FILE, "utf8"));
  state.businesses.push({
    id: "public-a-copy",
    name: "A Accessories",
    publicPhone: "0711 111 111",
    publicShopPublished: true,
  });
  fs.writeFileSync(db.DATA_FILE, JSON.stringify(state));

  assert.equal(db.getPublicShopBySlug("a-accessories"), undefined);
  assert.equal(db.getPublicShopBySlug("a-accessories-publica").name, "A Accessories");
  assert.equal(db.getPublicShopBySlug("a-accessories-publicac").name, "A Accessories");
});