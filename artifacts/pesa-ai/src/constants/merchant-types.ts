export const MERCHANT_TYPES = [
  { value: "retail", label: "Retail & Trade" },
  { value: "hospitality", label: "Hotel & Hospitality" },
  { value: "service", label: "Services" },
  { value: "other", label: "Other" },
] as const;

export function displayMerchantType(value?: string | null) {
  const type = value === "hotel" ? "hospitality" : value;
  return MERCHANT_TYPES.some((option) => option.value === type) ? type! : "retail";
}