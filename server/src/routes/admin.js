import { parseCursorPagination } from "../validation.js";

function isValidWarrantyDate(value) {
  if (value === null) return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidCustomerKey(value) {
  return typeof value === "string" && value.length <= 280 && (
    /^email:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ||
    /^phone:\+?[1-9]\d{6,29}$/.test(value)
  );
}

function parseInventoryItem(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const rawId = item.id;
  const id = Number.isSafeInteger(rawId) && rawId >= 0 ? String(rawId) : rawId;
  const { item: name, sku, category, stock, minimum, cost, supplier } = item;
  if (
    typeof id !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(id) ||
    typeof name !== "string" || name.trim().length < 1 || name.trim().length > 160 ||
    typeof sku !== "string" || sku.trim().length < 1 || sku.trim().length > 100 ||
    typeof category !== "string" || category.trim().length < 1 || category.trim().length > 100 ||
    typeof supplier !== "string" || supplier.trim().length < 1 || supplier.trim().length > 160 ||
    !Number.isSafeInteger(stock) || stock < 0 ||
    !Number.isSafeInteger(minimum) || minimum < 0 ||
    typeof cost !== "number" || !Number.isFinite(cost) || cost < 0 || cost > Number.MAX_SAFE_INTEGER
  ) return null;
  return {
    id,
    item: name.trim(),
    sku: sku.trim().toUpperCase(),
    category: category.trim(),
    stock,
    minimum,
    cost,
    supplier: supplier.trim(),
  };
}

export function createAdminHandlers({ database, requireDatabase, requireAdmin, readBody, parseJson, send, HttpError }) {
  async function handleCustomerWarranties(req, res, pathname, cors) {
    requireDatabase();
    const session = requireAdmin(req);
    if (req.method === "GET" && pathname === "/api/customers/warranties") {
      send(res, 200, { warranties: await database.listCustomerWarranties() }, cors);
      return;
    }
    if (req.method === "PUT" && pathname === "/api/customers/warranties") {
      const body = parseJson(await readBody(req, 4_096));
      if (!isValidCustomerKey(body?.customerKey) || !isValidWarrantyDate(body?.expiresOn)) {
        throw new HttpError(422, "El cliente o la fecha de garantía no son válidos.");
      }
      await database.saveCustomerWarranty(body.customerKey, body.expiresOn, session.email);
      send(res, 200, { ok: true }, cors);
      return;
    }
    throw new HttpError(404, "No encontrado.");
  }

  async function handleInventory(req, res, pathname, cors) {
    requireDatabase();
    const session = requireAdmin(req);
    if (req.method === "GET" && pathname === "/api/inventory") {
      send(res, 200, { items: await database.loadInventory() }, cors);
      return;
    }
    if (req.method === "GET" && pathname === "/api/inventory/movements") {
      const query = new URL(req.url, "http://localhost").searchParams;
      const pagination = parseCursorPagination(query);
      if (!pagination) {
        throw new HttpError(422, "Los parámetros de paginación no son válidos.");
      }
      const movements = await database.listInventoryMovements(pagination);
      send(res, 200, {
        movements,
        nextBeforeId: movements.length === pagination.limit ? movements[movements.length - 1].id : null,
      }, cors);
      return;
    }
    if (pathname === "/api/inventory" && req.method === "POST") {
      const body = parseJson(await readBody(req, 16_384));
      const item = parseInventoryItem(body?.item);
      if (!item) throw new HttpError(422, "Los datos del repuesto no son válidos.");
      await database.createInventoryItem(item, session.email);
      send(res, 201, { item }, cors);
      return;
    }
    const stockMatch = /^\/api\/inventory\/([A-Za-z0-9_-]{1,100})\/stock$/.exec(pathname);
    if (stockMatch && req.method === "PATCH") {
      const body = parseJson(await readBody(req, 4_096));
      if (!Number.isSafeInteger(body?.delta) || body.delta === 0 || Math.abs(body.delta) > 1_000_000) {
        throw new HttpError(422, "El movimiento de existencias no es válido.");
      }
      const item = await database.adjustInventoryStock(stockMatch[1], body.delta, session.email);
      if (!item) throw new HttpError(404, "No se encontró el repuesto.");
      if (item.conflict) throw new HttpError(409, "El movimiento dejaría existencias negativas.");
      send(res, 200, { item }, cors);
      return;
    }
    const itemMatch = /^\/api\/inventory\/([A-Za-z0-9_-]{1,100})$/.exec(pathname);
    if (itemMatch && req.method === "PUT") {
      const body = parseJson(await readBody(req, 16_384));
      const item = parseInventoryItem(body?.item);
      if (!item || item.id !== itemMatch[1] ||
          !Number.isSafeInteger(body?.stockDelta) || Math.abs(body.stockDelta) > 1_000_000) {
        throw new HttpError(422, "Los datos del repuesto no son válidos.");
      }
      const saved = await database.updateInventoryItem(item.id, item, body.stockDelta, session.email);
      if (!saved) throw new HttpError(404, "No se encontró el repuesto.");
      if (saved.conflict) throw new HttpError(409, "El cambio dejaría existencias negativas.");
      send(res, 200, { item: saved }, cors);
      return;
    }
    if (itemMatch && req.method === "DELETE") {
      const deleted = await database.deleteInventoryItem(itemMatch[1], session.email);
      if (!deleted) throw new HttpError(404, "No se encontró el repuesto.");
      send(res, 200, { ok: true }, cors);
      return;
    }
    throw new HttpError(404, "No encontrado.");
  }

  return { handleCustomerWarranties, handleInventory };
}
