const PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;

export function normalizePhone(value) {
  if (typeof value !== "string") return "";
  const phone = value.replace(/[\s().-]/g, "");
  return PHONE_PATTERN.test(phone) ? phone : "";
}
