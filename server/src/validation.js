const MAX_CURSOR = "18446744073709551615";

export function parseCursorPagination(searchParams) {
  const beforeId = searchParams.get("beforeId");
  const limit = searchParams.has("limit") ? Number(searchParams.get("limit")) : 50;
  if ((beforeId !== null &&
        (!/^[1-9]\d{0,19}$/.test(beforeId) || BigInt(beforeId) > BigInt(MAX_CURSOR))) ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    return null;
  }
  return { beforeId: beforeId || MAX_CURSOR, limit };
}
