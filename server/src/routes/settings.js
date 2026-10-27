export function createSettingsHandlers({
  database,
  requireDatabase,
  requireSession,
  readBody,
  parseJson,
  send,
  HttpError,
}) {
  async function handleSettings(req, res, pathname, cors) {
    requireDatabase();
    const session = await requireSession(req);
    const key = decodeURIComponent(pathname.slice("/api/settings/".length));
    if (!["workshop-settings", "workshop-logo", "workshop-warranties"].includes(key)) {
      throw new HttpError(404, "No encontrado.");
    }
    if (req.method === "GET") {
      if (session.role !== "admin" && key !== "workshop-settings") {
        throw new HttpError(403, "No tienes permisos para esta operación.");
      }
      let value = await database.getSetting(key);
      if (session.role !== "admin" && key === "workshop-settings" && value) {
        const {
          businessName,
          businessPhone,
          businessEmail,
          businessAddress,
          serviceHours,
          responseTime,
          currency,
          timezone,
        } = value;
        value = {
          businessName,
          businessPhone,
          businessEmail,
          businessAddress,
          serviceHours,
          responseTime,
          currency,
          timezone,
        };
      }
      send(res, 200, { value }, cors);
      return;
    }
    if (session.role !== "admin") throw new HttpError(403, "No tienes permisos para esta operación.");
    if (req.method === "PUT") {
      const body = parseJson(await readBody(req, 3_500_000));
      await database.saveSetting(key, body?.value);
      send(res, 200, { ok: true }, cors);
      return;
    }
    if (req.method === "DELETE") {
      await database.deleteSetting(key);
      send(res, 200, { ok: true }, cors);
      return;
    }
    throw new HttpError(405, "Método no permitido.", { Allow: "GET, PUT, DELETE, OPTIONS" });
  }

  return { handleSettings };
}
