const SKYVIEW_OPAL_HOTEL = "skyview opal hotel";

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

export function getShopEntryPrompt(businessName: string): string {
  if (businessName.trim().toLowerCase() === SKYVIEW_OPAL_HOTEL) {
    return "Hi Skyview Opal Hotel, I'd like to explore dining, rooms, the pool, conferences and events.";
  }
  return "Hi, I'd like to shop";
}