// Phone encryption and hashing happen on the backend, never in the browser.
export function customerPhone(record) {
  const masked = record?.customer_phone_masked;
  if (typeof masked === "string" && masked.trim()) return masked;

  // Support older API responses without displaying their full phone numbers.
  const legacy = ["phone_number", "customer_phone", "phone", "caller_phone", "from_number"]
    .map((key) => record?.[key])
    .find((value) => typeof value === "string" && value.trim());
  if (!legacy || !/^\+?[\d\s().-]+$/.test(legacy.trim())) return null;
  const digits = legacy.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return `•••• ${digits.slice(-4)}`;
}
