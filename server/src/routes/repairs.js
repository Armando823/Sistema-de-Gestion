import { normalizePhone } from "../phone.js";
import { parseCursorPagination } from "../validation.js";

const repairStatuses = [
  "Recibido",
  "En diagnóstico",
  "Esperando repuesto",
  "En reparación",
  "Listo para entregar",
  "Entregado",
];

function isValidRepair(repair, parseReceiptRequest) {
  return Boolean(
    repair &&
    typeof repair === "object" &&
    /^REP-\d{4,8}$/.test(repair.id) &&
    repairStatuses.includes(repair.status) &&
    (repair.whatsappOptIn === undefined || typeof repair.whatsappOptIn === "boolean") &&
    Array.isArray(repair.photos ?? []) &&
    (repair.photos ?? []).length <= 3 &&
    (repair.photos ?? []).every((photo) =>
      typeof photo === "string" &&
      photo.length <= 2_500_000 &&
      /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(photo),
    ) &&
    parseReceiptRequest({
      email: "valid@example.com",
      repair: { ...repair, signature: repair.signature || "" },
    }).ok
  );
}

const repairBackupFields = new Set([
  "id",
  "customer",
  "phone",
  "device",
  "problem",
  "status",
  "updated",
  "createdAt",
  "ownerEmail",
  "ownerPhone",
  "authorizedBy",
  "signature",
  "photos",
  "contactEmail",
  "whatsappOptIn",
  "version",
]);

function isValidBackupEmail(value) {
  return typeof value === "string" &&
    value.length <= 254 &&
    /^[^\s@,;<>()]+@[^\s@,;<>()]+\.[^\s@,;<>()]+$/.test(value);
}

function normalizeBackupRepair(repair, parseReceiptRequest) {
  if (!repair || typeof repair !== "object" || Array.isArray(repair) ||
      Object.keys(repair).some((key) => !repairBackupFields.has(key)) ||
      !isValidRepair(repair, parseReceiptRequest)) {
    return null;
  }
  if (repair.version !== undefined &&
      (!Number.isSafeInteger(repair.version) || repair.version < 1)) {
    return null;
  }
  if (repair.createdAt !== undefined && repair.createdAt !== null &&
      (typeof repair.createdAt !== "string" || repair.createdAt.length > 40)) {
    return null;
  }
  if (repair.ownerEmail !== undefined && !isValidBackupEmail(repair.ownerEmail)) {
    return null;
  }
  if (repair.ownerPhone !== undefined &&
      (typeof repair.ownerPhone !== "string" || normalizePhone(repair.ownerPhone) !== repair.ownerPhone)) {
    return null;
  }
  const { version, ...backupRepair } = repair;
  return backupRepair;
}

export function createRepairHandlers({
  database,
  config,
  requireDatabase,
  requireSession,
  requireAdmin,
  readBody,
  parseJson,
  send,
  HttpError,
  lookupLimiter,
  clientIp,
  now,
  parseReceiptRequest,
}) {
  async function handleRepairs(req, res, pathname, cors) {
    requireDatabase();
    const session = requireSession(req);
    if (req.method === "POST" && pathname === "/api/repairs/next-id") {
      send(res, 200, { id: await database.nextRepairId() }, cors);
      return;
    }
    if (req.method === "GET" && pathname === "/api/repairs") {
      const revision = await database.getRepairSyncRevision();
      const etag = `"repairs-${revision}"`;
      const responseHeaders = {
        ...cors,
        ETag: etag,
        "Cache-Control": "private, no-cache",
        Vary: cors.Vary ? `${cors.Vary}, Authorization` : "Authorization",
      };
      if (req.headers["if-none-match"] === etag) {
        res.writeHead(304, responseHeaders);
        res.end();
        return;
      }
      send(res, 200, { repairs: await database.listRepairs(session) }, responseHeaders);
      return;
    }
    if (req.method === "POST" && pathname === "/api/repairs/import") {
      const adminSession = requireAdmin(req);
      const body = parseJson(await readBody(req, config.limits.repairImportBytes));
      const repair = normalizeBackupRepair(body?.repair, parseReceiptRequest);
      if (!repair) throw new HttpError(422, "La orden del respaldo no es válida.");
      try {
        const importedRepair = await database.createRepair(adminSession, repair);
        send(res, 201, { repair: importedRepair }, cors);
      } catch (error) {
        if (["ER_DUP_ENTRY", "23505"].includes(error.code)) {
          throw new HttpError(409, "La orden ya existe.");
        }
        throw error;
      }
      return;
    }
    if (req.method === "POST" && pathname === "/api/repairs") {
      const body = parseJson(await readBody(req, config.limits.bodyBytes));
      if (!isValidRepair(body?.repair, parseReceiptRequest)) {
        throw new HttpError(422, "La orden no es válida.");
      }
      const repair = await database.createRepair(session, body.repair);
      send(res, 201, { repair }, cors);
      return;
    }
    const updateMatch = /^\/api\/repairs\/(REP-\d{4,8})$/.exec(pathname);
    if (req.method === "PATCH" && updateMatch) {
      const adminSession = requireAdmin(req);
      const body = parseJson(await readBody(req, config.limits.bodyBytes));
      const patch = body?.patch;
      if (!Number.isSafeInteger(body?.expectedVersion) || body.expectedVersion < 1 ||
          !patch || typeof patch !== "object" || Array.isArray(patch)) {
        throw new HttpError(422, "La versión o los cambios de la orden no son válidos.");
      }
      const keys = Object.keys(patch);
      if (keys.length === 0 || keys.some((key) => !["status", "photos"].includes(key))) {
        throw new HttpError(422, "Solo se permite actualizar el estado o las fotos de la orden.");
      }
      if (patch.status !== undefined && !repairStatuses.includes(patch.status)) {
        throw new HttpError(422, "El estado de la orden no es válido.");
      }
      if (patch.photos !== undefined &&
          (!Array.isArray(patch.photos) || patch.photos.length > 3 ||
            patch.photos.some((photo) =>
              typeof photo !== "string" ||
              photo.length > 2_500_000 ||
              !/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(photo),
            ))) {
        throw new HttpError(422, "Las fotos de la orden no son válidas.");
      }
      const repair = await database.updateRepair(
        updateMatch[1],
        body.expectedVersion,
        { ...patch, updated: new Date(now()).toISOString() },
        adminSession.email,
      );
      if (!repair) throw new HttpError(404, "No se encontró la orden.");
      if (repair.conflict) {
        throw new HttpError(409, "La orden cambió en otra sesión. Actualiza la lista e inténtalo de nuevo.");
      }
      send(res, 200, { repair }, cors);
      return;
    }
    const historyMatch = /^\/api\/repairs\/(REP-\d{4,8})\/status-history$/.exec(pathname);
    if (req.method === "GET" && historyMatch) {
      requireAdmin(req);
      const query = new URL(req.url, "http://localhost").searchParams;
      const pagination = parseCursorPagination(query);
      if (!pagination) {
        throw new HttpError(422, "Los parámetros de paginación no son válidos.");
      }
      const history = await database.listRepairStatusHistory(historyMatch[1], {
        ...pagination,
      });
      send(res, 200, {
        history,
        nextBeforeId: history.length === pagination.limit ? history[history.length - 1].id : null,
      }, cors);
      return;
    }
    const deleteMatch = /^\/api\/repairs\/(REP-\d{4,8})$/.exec(pathname);
    if (req.method === "DELETE" && deleteMatch) {
      requireAdmin(req);
      await database.deleteRepair(deleteMatch[1]);
      send(res, 200, { ok: true }, cors);
      return;
    }
    throw new HttpError(404, "No encontrado.");
  }

  async function handleRepairLookup(req, res, cors) {
    requireDatabase();
    if (req.method !== "POST") {
      throw new HttpError(405, "Método no permitido.", { Allow: "POST, OPTIONS" });
    }
    const rate = lookupLimiter.take(clientIp(req));
    if (!rate.allowed) {
      throw new HttpError(429, "Demasiadas consultas. Intenta más tarde.", {
        "Retry-After": String(rate.retryAfterSec),
      });
    }
    const body = parseJson(await readBody(req, 4_096));
    const id = typeof body?.id === "string" ? body.id.trim().toUpperCase() : "";
    const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
    if (!/^REP-\d{4,8}$/.test(id) || phone.length < 7 || phone.length > 30) {
      throw new HttpError(422, "El código o teléfono no son válidos.");
    }
    const repair = await database.lookupRepair(id, phone);
    send(res, 200, { repair: repair ?? null }, cors);
  }

  return { handleRepairs, handleRepairLookup };
}
