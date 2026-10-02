type BusinessType = {
  category?: string | null;
  merchantType?: string | null;
} | null | undefined;

export function isHospitalityBusiness(business: BusinessType): boolean {
  const merchantType = String(business?.merchantType || "").trim().toLowerCase();
  const category = String(business?.category || "").trim().toLowerCase();
  return merchantType === "hospitality" ||
    merchantType === "hotel" ||
    /\b(hotel|hospitality)\b/.test(category);
}