const SKYVIEW_OPAL_HOTEL = "skyview opal hotel";

export type ShopEntryBusiness = string | {
  name?: string | null;
  category?: string | null;
  merchantType?: string | null;
};

function businessFields(value: ShopEntryBusiness) {
  return typeof value === "string" ? { name: value } : value;
}

export function isSkyviewOpalHotel(value: ShopEntryBusiness): boolean {
  return String(businessFields(value).name || "").trim().toLowerCase() === SKYVIEW_OPAL_HOTEL;
}

export function isHospitalityBusiness(value: ShopEntryBusiness): boolean {
  const business = businessFields(value);
  const merchantType = String(business.merchantType || "").trim().toLowerCase();
  if (merchantType === "hospitality" || merchantType === "hotel") return true;
  if (merchantType && !["retail", "other"].includes(merchantType)) return false;
  const category = String(business.category || "").trim().toLowerCase();
  const descriptor = category || String(business.name || "").trim().toLowerCase();
  return /\b(hotel|hospitality|accommodation|resort|lodge|inn|restaurant|cafe)\b|café/.test(descriptor);
}

export function normalizeKenyanWhatsAppNumber(raw: string): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("2540")) return `254${digits.slice(4)}`;
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("0")) return `254${digits.slice(1)}`;
  if (digits.startsWith("7") || digits.startsWith("1")) return `254${digits}`;
  return digits;
}

export function formatKenyanWhatsAppNumber(raw: string): string {
  const digits = normalizeKenyanWhatsAppNumber(raw);
  if (digits.length === 12 && digits.startsWith("254")) {
    return `+254 ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
  }
  return raw;
}

export function getShopEntryPrompt(value: ShopEntryBusiness): string {
  const business = businessFields(value);
  const name = String(business.name || "Our business").trim();
  if (isSkyviewOpalHotel(business)) {
    return "Hi Skyview Opal Hotel, I'd like to explore dining, rooms, the pool, conferences and events.";
  }
  if (isHospitalityBusiness(business)) {
    return `Hi ${name}, I'd like to make an enquiry or place an order.`;
  }
  return "Hi, I'd like to shop";
}