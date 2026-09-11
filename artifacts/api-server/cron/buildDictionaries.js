#!/usr/bin/env node
const db = require("../pesa-src/db");
const { colorMap } = require("../pesa-src/transcriptNormalizer");
const result = db.mutate((state) => {
  let count = 0;
  for (const business of state.businesses || []) {
    const dictionary = business.dictionary && typeof business.dictionary === "object" ? business.dictionary : {};
    const products = (state.products || []).filter((product) => product.businessId === business.id);
    for (const product of products) {
      const name = String(product.name || "").toLowerCase();
      for (const [color, synonyms] of Object.entries(colorMap)) if (name.includes(color) && !dictionary[color]) dictionary[color] = synonyms;
    }
    dictionary._builtAt = new Date().toISOString();
    dictionary._category = business.category || null;
    business.dictionary = dictionary;
    count += 1;
  }
  return { businesses: count };
});
console.log("Built dictionaries for " + result.businesses + " shops");
