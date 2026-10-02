const HOTEL_MENU_GROUPS = {
  food: [
    {
      heading: "Meat & Poultry",
      names: [
        "Beef 1kg",
        "Goat 1kg",
        "Capon Whole Chicken",
        "Free Range (Kienyeji)",
        "Beef Stew",
        "Beef Pilau",
        "Chicken Pilau",
        "Char Grilled Chicken",
        "Chicken Teriyaki",
        "Stir Fried Chicken",
        "Maryland Chicken",
      ],
    },
    { heading: "Seafood", names: ["Grilled Fish Fillet", "Whole Tilapia"] },
    { heading: "Specialty Platters", names: ["Chicken Bahati", "Opal Chef Platter"] },
    { heading: "Pizza", names: ["Pizza Hawaii", "Pizza Peperoni", "Pizza Marghetta"] },
    { heading: "Pasta", names: ["Bolognese", "Puttanesca", "Carbonara"] },
    { heading: "Ugali", names: ["Brown/White Ugali"] },
    {
      heading: "Potatoes",
      names: [
        "Fries",
        "Mashed Potatoes",
        "Mukimo",
        "Wedges",
        "Roast Potatoes",
        "Masala Fries",
        "Saute Potatoes",
        "Garlic Fries",
      ],
    },
    { heading: "Rice", names: ["White Rice", "Special Rice", "Pilau Plain"] },
    { heading: "Other Accompaniments", names: ["Plantain Banana", "Bhajia", "Naan Bread"] },
    {
      heading: "Vegetables",
      names: ["Kienyeji Greens", "Steamed Spinach", "Steamed Cabbage", "Italian Vegetable"],
    },
    { heading: "Vegan", names: ["Beans Curry", "Vegetable Curry", "Olo Cupscum"] },
    {
      heading: "Desserts",
      names: [
        "Tropical Fruit Platter",
        "Fruit Salad",
        "Homtequin Ice Cream",
        "Ice Cream Fruit Pudding",
        "Churros",
        "Swiss Roll",
      ],
    },
  ],
  drinks: [
    {
      heading: "Coffee",
      names: [
        "Cappuccino",
        "Mocha",
        "Espresso",
        "Latte",
        "Americano",
        "Latte Machiato",
        "Espresso Machiato",
        "Black Coffee",
        "Frappe (Double)",
        "Affogato (Double)",
      ],
    },
    {
      heading: "Iced Coffee",
      names: ["Vanilla Iced Latte", "Iced Cappuccino", "Iced Americano", "Iced Latte Machiato"],
    },
  ],
};

function normalizeMenuProductName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const classificationByName = new Map();
for (const [category, groups] of Object.entries(HOTEL_MENU_GROUPS)) {
  for (const group of groups) {
    group.names.forEach((name, order) => {
      const normalizedName = normalizeMenuProductName(name);
      if (!normalizedName || classificationByName.has(normalizedName)) {
        throw new Error(`Duplicate or invalid hotel menu item: ${name}`);
      }
      classificationByName.set(normalizedName, { category, group: group.heading, order });
    });
  }
}

const HOTEL_MENU_CATEGORY_ITEMS = [...classificationByName.entries()].map(([normalizedName, classification]) => ({
  normalizedName,
  ...classification,
}));

function getHotelMenuClassification(productName) {
  return classificationByName.get(normalizeMenuProductName(productName)) || null;
}

module.exports = {
  HOTEL_MENU_GROUPS,
  HOTEL_MENU_CATEGORY_ITEMS,
  getHotelMenuClassification,
  normalizeMenuProductName,
};