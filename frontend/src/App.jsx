import { useEffect, useRef, useState } from "react";
import LoginView from "./components/auth/LoginView";
import AdminView from "./components/admin/AdminView";
import ClientView from "./components/client/ClientView";
import { emptyForm, repairStatuses } from "./data/repairData";
import ConfirmModal from "./components/modals/ConfirmModal";
import ReceiptModal from "./components/modals/ReceiptModal";
import { loadRepairs } from "./services/repairStorage";
import {
  authenticateClient,
  authenticateAdmin,
  clearClientSession,
  registerClient,
  saveClientSession,
} from "./services/accountStorage";
import {
  createSharedRepair,
  deleteSharedRepair,
  nextSharedRepairId,
  loginSharedPhone,
  requestSharedPhoneCode,
  restoreSharedSession,
  sendSharedRepairCode,
  readSetting,
  saveSetting,
  updateSharedRepair,
  importSharedRepair,
} from "./services/dbService";
import { readImage } from "./utils/image";
import { sendReceiptEmail } from "./services/notifyService";
import {
  isValidRepair,
  isValidEmail,
  isValidImageData,
  repairLimits,
  validateRepairForm,
} from "./utils/repairValidation";

const supportEmail = "soporte@tallerdigital.com";
const backupFormat = "sistema-de-gestion.repair-backup";
const backupRepairFields = new Set([
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

function isValidBackupRepair(repair) {
  return Boolean(
    repair &&
    typeof repair === "object" &&
    !Array.isArray(repair) &&
    Object.keys(repair).every((key) => backupRepairFields.has(key)) &&
    isValidRepair(repair) &&
    (repair.version === undefined ||
      (Number.isSafeInteger(repair.version) && repair.version >= 1)) &&
    (repair.createdAt === undefined || repair.createdAt === null ||
      (typeof repair.createdAt === "string" && repair.createdAt.length <= 40)) &&
    (repair.ownerEmail === undefined || isValidEmail(repair.ownerEmail)) &&
    (repair.ownerPhone === undefined ||
      (typeof repair.ownerPhone === "string" && /^\+[1-9]\d{7,14}$/.test(repair.ownerPhone)))
  );
}

function getBackupRepairs(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object" || Array.isArray(data) ||
      !Array.isArray(data.repairs)) return null;
  if (data.format === backupFormat && data.version === 1 &&
      Object.keys(data).every((key) =>
        ["format", "version", "exportedAt", "repairs"].includes(key),
      ) &&
      typeof data.exportedAt === "string" &&
      Number.isFinite(Date.parse(data.exportedAt))) {
    return data.repairs;
  }
  if (data.format === undefined && data.version === undefined &&
      Object.keys(data).every((key) => key === "repairs")) {
    return data.repairs;
  }
  return null;
}

const defaultSettings = {
  businessName: "Taller Digital",
  businessPhone: "+57 300 000 0000",
  businessEmail: supportEmail,
  businessAddress: "Carrera 15 # 82-20, Bogotá",
  currency: "PEN - Sol peruano",
  timezone: "Bogotá (GMT-5)",
  serviceHours: "Lunes a sábado, 8:00 a.m. - 6:00 p.m.",
  responseTime: "24 horas",
  autoNotifications: true,
  automaticReport: true,
  notifyOnStatus: true,
  darkMode: false,
};

function formatTimestamp(timestamp = new Date()) {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function receiptHtml(repair) {
  const signatureMarkup = isValidImageData(repair.signature)
    ? `<img class="signature" src="${escapeHtml(repair.signature)}" alt="Firma del cliente">`
    : "";
  return `<!doctype html><html lang="es"><head><meta charset="UTF-8"><title>${escapeHtml(repair.id)}</title><style>body{font-family:Arial,sans-serif;max-width:700px;margin:40px auto;color:#172a3a}h1{color:#173f3a}dt{font-weight:bold;margin-top:16px}dd{margin:4px 0 0}p{line-height:1.5}.signature{max-width:280px}</style></head><body><p>TALLER DIGITAL</p><h1>Constancia de reparacion ${escapeHtml(repair.id)}</h1><dl><dt>Cliente</dt><dd>${escapeHtml(repair.customer)}</dd><dt>Telefono</dt><dd>${escapeHtml(repair.phone)}</dd><dt>Equipo</dt><dd>${escapeHtml(repair.device)}</dd><dt>Falla reportada</dt><dd>${escapeHtml(repair.problem)}</dd><dt>Estado</dt><dd>${escapeHtml(repair.status)}</dd>${repair.authorizedBy ? `<dt>Recibido por</dt><dd>${escapeHtml(repair.authorizedBy)}</dd>` : ""}</dl><p>El cliente autoriza la revision del equipo y recibe esta constancia del estado reportado.</p>${signatureMarkup}</body></html>`;
}

function App({ version = "Final" }) {
  const [repairs, setRepairs] = useState([]);
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [role, setRole] = useState(null);
  const [dataReady, setDataReady] = useState(false);
  const [repairsReady, setRepairsReady] = useState(false);
  const [settingsReady, setSettingsReady] = useState(false);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [settings, setSettings] = useState(defaultSettings);
  const repairsRef = useRef(repairs);
  const noticeRef = useRef(notice);
  const [clientForm, setClientForm] = useState(emptyForm);
  const [clientFormError, setClientFormError] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const importInputRef = useRef(null);
  repairsRef.current = repairs;
  noticeRef.current = notice;
  useEffect(() => {
    let cancelled = false;
    function applySettings(savedSettings = {}) {
      setSettings({
        ...defaultSettings,
        ...savedSettings,
        currency: savedSettings.currency === "COP - Peso colombiano"
          ? defaultSettings.currency
          : savedSettings.currency || defaultSettings.currency,
      });
    }
    async function loadAccount(account) {
      const [repairsResult, settingsResult] = await Promise.allSettled([
        loadRepairs(),
        readSetting("workshop-settings", {}),
      ]);
      if (cancelled) return;
      const savedRepairs = repairsResult.status === "fulfilled" ? repairsResult.value : [];
      const savedSettings = settingsResult.status === "fulfilled" ? settingsResult.value : {};
      setRepairs(savedRepairs);
      setRepairsReady(repairsResult.status === "fulfilled");
      setSettingsReady(settingsResult.status === "fulfilled");
      if (repairsResult.status === "rejected") {
        setNotice("No se pudieron cargar las órdenes compartidas.");
      } else if (settingsResult.status === "rejected") {
        setNotice("No se pudieron cargar los ajustes del taller.");
      }
      setClientEmail(account.email);
      setClientPhone(account.phone || "");
      setRole(account.role);
      applySettings(savedSettings);
      setDataReady(true);
    }
    async function initialize() {
      const account = await restoreSharedSession();
      if (account) {
        await loadAccount(account);
      } else if (!cancelled) {
        setRepairs([]);
        setRepairsReady(true);
        setSettingsReady(true);
        setDataReady(true);
      }
    }
    initialize().catch(() => {
      if (cancelled) return;
      setRepairs([]);
      setRepairsReady(false);
      setSettingsReady(false);
      setClientEmail("");
      setClientPhone("");
      setRole(null);
      setSettings(defaultSettings);
      setNotice("No se pudo conectar con el servidor.");
      setDataReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!role || !dataReady || !repairsReady) return undefined;
    let active = true;
    let requestInProgress = false;
    let syncFailed = false;

    async function refreshRepairs() {
      if (!active || requestInProgress || document.visibilityState !== "visible") return;
      requestInProgress = true;
      const previousRepairs = repairsRef.current;
      try {
        const latestRepairs = await loadRepairs();
        if (!active || repairsRef.current !== previousRepairs) return;
        if (latestRepairs !== previousRepairs &&
            JSON.stringify(latestRepairs) !== JSON.stringify(previousRepairs)) {
          setRepairs(latestRepairs);
        }
        syncFailed = false;
        if (noticeRef.current === "No se pudieron sincronizar las órdenes. Comprueba tu conexión.") {
          setNotice("");
        }
      } catch {
        if (active && !syncFailed) {
          syncFailed = true;
          setNotice("No se pudieron sincronizar las órdenes. Comprueba tu conexión.");
        }
      } finally {
        requestInProgress = false;
      }
    }

    refreshRepairs();
    const intervalId = window.setInterval(refreshRepairs, 3_000);
    document.addEventListener("visibilitychange", refreshRepairs);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshRepairs);
    };
  }, [dataReady, repairsReady, role]);
  useEffect(() => {
    if (dataReady && settingsReady && role === "admin") {
      saveSetting("workshop-settings", settings).then((saved) => {
        if (!saved) setNotice("No se pudieron guardar los ajustes del taller.");
      }).catch((error) => setNotice(error.message || "No se pudieron guardar los ajustes del taller."));
    }
  }, [dataReady, settingsReady, settings, role]);
  // El correo se propone en el formulario; no usar la identidad sintética por teléfono.
  useEffect(() => {
    if (!clientEmail || clientPhone) return;
    setClientForm((form) => (form.contactEmail ? form : { ...form, contactEmail: clientEmail }));
  }, [clientEmail, clientPhone]);
  useEffect(() => {
    if (!clientPhone) return;
    setClientForm((form) => (form.phone ? form : { ...form, phone: clientPhone }));
  }, [clientPhone]);
  const filteredRepairs = repairs.filter((repair) =>
    [repair.id, repair.customer, repair.device].some((value) =>
      value.toLowerCase().includes(search.toLowerCase()),
    ),
  );

  if (!dataReady) return null;

  async function createRepair(formData, clearForm, clearError, noticeMessage) {
    const timestamp = new Date().toISOString();
    let id;
    try {
      id = await nextSharedRepairId();
    } catch (error) {
      setNotice(error.message || "No se pudo reservar un código de reparación.");
      return;
    }
    const newRepair = {
      ...formData,
      id,
      status: "Recibido",
      createdAt: timestamp,
      updatedAt: timestamp,
      updated: formatTimestamp(timestamp),
    };
    let savedRepair;
    try {
      savedRepair = await createSharedRepair(newRepair);
    } catch (error) {
      setNotice(`${id}: ${error.message || "no se pudo guardar la orden."}`);
      return;
    }
    setRepairs((current) => [savedRepair, ...current.filter((repair) => repair.id !== id)]);
    clearForm();
    clearError();
    if (newRepair.contactEmail) await emailReceipt(newRepair, noticeMessage);
    if (clientPhone && !isAdmin) {
      setNotice(`${id} quedó guardada. Enviando el código por WhatsApp...`);
      try {
        await sendSharedRepairCode(id);
        setNotice(`${id} quedó guardada y enviamos el código a tu WhatsApp.`);
      } catch (error) {
        setNotice(`${id} quedó guardada, pero no se pudo enviar el código por WhatsApp: ${error.message}`);
      }
    } else if (!newRepair.contactEmail) {
      setNotice(`${id} ${noticeMessage}`);
    }
  }

  // Envía (o reenvía) la constancia al correo del cliente. No bloquea la
  // creación de la orden: si el correo falla, la orden ya quedó guardada y
  // se puede reenviar desde la constancia.
  async function emailReceipt(repair, noticeMessage = "") {
    const email = repair.contactEmail;
    if (!email) {
      setNotice(`${repair.id} no tiene un correo registrado.`);
      return;
    }
    const prefix = noticeMessage ? `${repair.id} ${noticeMessage}. ` : "";
    setNotice(`${prefix}Enviando la constancia a ${email}...`);
    const result = await sendReceiptEmail(repair, email);
    setNotice(
      result.ok
        ? `${prefix}Constancia enviada a ${email}.`
        : `${prefix}No se pudo enviar la constancia a ${email}: ${result.message} La orden quedó guardada y podrás reenviar la constancia más tarde.`,
    );
  }

  async function addClientRepair(event) {
    event.preventDefault();
    const validationError = validateRepairForm(clientForm, {
      requireEmail: !clientPhone,
      requireWhatsAppConsent: Boolean(clientPhone),
    });
    if (validationError) return setClientFormError(validationError);
    await createRepair(
      {
        ...clientForm,
        phone: clientPhone || clientForm.phone,
        contactEmail: clientForm.contactEmail.trim(),
        ownerEmail: clientEmail,
        whatsappOptIn: Boolean(clientPhone && clientForm.whatsappOptIn === true),
      },
      () => setClientForm({ ...emptyForm, phone: clientPhone, contactEmail: clientPhone ? "" : clientEmail }),
      () => setClientFormError(""),
      "enviada al taller",
    );
  }

  function requestStatusChange(id, status) {
    if (!repairStatuses.includes(status)) return;
    const repair = repairs.find((item) => item.id === id);
    if (!repair || repair.status === status) return;
    setConfirmation({ type: "status", id, status });
  }

  function requestDelete(id) {
    setConfirmation({ type: "delete", id });
  }

  async function confirmAction() {
    if (confirmation?.type === "status") {
      const current = repairs.find((repair) => repair.id === confirmation.id);
      if (!current) {
        setNotice("No se encontró la orden que intentas actualizar. Actualiza la lista.");
        setConfirmation(null);
        return;
      }
      try {
        const savedRepair = await updateSharedRepair(
          confirmation.id,
          current.version,
          { status: confirmation.status },
        );
        setRepairs((items) => items.map((repair) => repair.id === savedRepair.id ? savedRepair : repair));
        setNotice(`${confirmation.id} actualizada`);
      } catch (error) {
        setNotice(error.message || "No se pudo actualizar el estado de la orden.");
      }
    }
    if (confirmation?.type === "delete") {
      try {
        await deleteSharedRepair(confirmation.id);
      } catch (error) {
        setNotice(error.message || "No se pudo eliminar la orden.");
        setConfirmation(null);
        return;
      }
      setRepairs((current) =>
        current.filter((repair) => repair.id !== confirmation.id),
      );
      setNotice(`${confirmation.id} eliminada`);
    }
    setConfirmation(null);
  }

  function downloadReceipt(repair) {
    const blob = new Blob([receiptHtml(repair)], {
      type: "text/html;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${repair.id}-constancia.html`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function printReceipt(repair) {
    // Con "noopener" window.open devuelve null y la impresión nunca se abría;
    // se imprime desde un iframe oculto dentro del navegador.
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    frame.onload = () => {
      try {
        frame.contentWindow.focus();
        frame.contentWindow.print();
      } catch {
        setNotice("No se pudo abrir la ventana de impresión.");
      }
      setTimeout(() => frame.remove(), 60000);
    };
    frame.srcdoc = receiptHtml(repair);
    document.body.appendChild(frame);
  }

  function exportRepairs() {
    const backup = {
      format: backupFormat,
      version: 1,
      exportedAt: new Date().toISOString(),
      repairs,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ordenes-reparacion-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Respaldo completo descargado. Incluye datos personales, fotos y firmas; guárdalo de forma segura.");
  }

  async function importRepairs(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > repairLimits.importFileSize) {
      setNotice("El archivo de órdenes supera el tamaño máximo permitido.");
      event.target.value = "";
      return;
    }
    try {
      const importedData = JSON.parse(await file.text());
      const importedRepairs = getBackupRepairs(importedData);
      if (!importedRepairs) {
        setNotice("El formato del respaldo no es compatible.");
        return;
      }
      let invalid = 0;
      let duplicates = 0;
      let failed = 0;
      const knownIds = new Set(repairs.map((repair) => repair.id));
      const added = [];
      for (const repair of importedRepairs) {
        if (!isValidBackupRepair(repair)) {
          invalid += 1;
          continue;
        }
        if (knownIds.has(repair.id)) {
          duplicates += 1;
          continue;
        }
        knownIds.add(repair.id);
        try {
          added.push(await importSharedRepair(repair));
        } catch (error) {
          if (error.status === 409) duplicates += 1;
          else if (error.status === 422) invalid += 1;
          else failed += 1;
        }
      }
      setRepairs((current) => {
        const currentIds = new Set(current.map(({ id }) => id));
        return [...added.filter(({ id }) => !currentIds.has(id)), ...current];
      });
      setSearch("");
      setNotice(`${added.length} agregada(s), ${duplicates} duplicada(s), ${invalid} inválida(s), ${failed} fallida(s).`);
    } catch {
      setNotice("No se pudo leer el archivo de órdenes");
    } finally {
      event.target.value = "";
    }
  }

  async function updatePhotos(id, event) {
    const selectedFiles = Array.from(event.target.files);
    if (selectedFiles.length > repairLimits.photos) {
      setNotice(`Puedes seleccionar máximo ${repairLimits.photos} fotos.`);
      event.target.value = "";
      return;
    }
    try {
      const photos = await Promise.all(selectedFiles.map((file) => readImage(file)));
      const current = repairsRef.current.find((repair) => repair.id === id);
      if (!current) throw new Error("No se encontró la orden. Actualiza la lista e inténtalo de nuevo.");
      const savedRepair = await updateSharedRepair(id, current.version, { photos });
      setRepairs((items) => items.map((repair) => repair.id === id ? savedRepair : repair));
      setNotice(`${id}: fotos actualizadas`);
    } catch (error) {
      setNotice(error.message);
    }
    event.target.value = "";
  }

  async function handleClientLogin(email, password) {
    const result = await authenticateClient(email, password);
    if (result.account) {
      setClientEmail(result.account.email);
      setClientPhone(result.account.phone || "");
      if (!await saveClientSession(result.account.email)) {
        return { error: "No se pudo guardar la sesión. Inténtalo de nuevo." };
      }
      try {
        const [savedRepairs, savedSettings] = await Promise.all([
          loadRepairs(),
          readSetting("workshop-settings", {}),
        ]);
        setRepairs(savedRepairs);
        setRepairsReady(true);
        setSettingsReady(true);
        setSettings({ ...defaultSettings, ...savedSettings });
      } catch (error) {
        return { error: error.message || "No se pudieron cargar los datos del servidor." };
      }
      setRole(result.account.role || "client");
    }
    return result;
  }

  async function handlePhoneCodeRequest(phone) {
    try {
      await requestSharedPhoneCode(phone);
      return {};
    } catch (error) {
      return { error: error.message || "No se pudo enviar el código por WhatsApp." };
    }
  }

  async function handlePhoneLogin(phone, code) {
    try {
      const account = await loginSharedPhone(phone, code);
      if (account.role !== "client") {
        await clearClientSession();
        return { error: "Esta cuenta no puede ingresar desde el acceso de cliente." };
      }
      const [savedRepairs, savedSettings] = await Promise.all([
        loadRepairs(),
        readSetting("workshop-settings", {}),
      ]);
      setRepairs(savedRepairs);
      setRepairsReady(true);
      setSettingsReady(true);
      setSettings({ ...defaultSettings, ...savedSettings });
      setClientEmail(account.email);
      setClientPhone(account.phone || phone);
      setRole("client");
      return {};
    } catch (error) {
      await clearClientSession();
      return { error: error.message || "No se pudo iniciar sesión." };
    }
  }

  async function handleAdminLogin(email, password) {
    const result = await authenticateAdmin(email, password);
    if (!result.account) return result;
    try {
      const [savedRepairs, savedSettings] = await Promise.all([
        loadRepairs(),
        readSetting("workshop-settings", {}),
      ]);
      setRepairs(savedRepairs);
      setRepairsReady(true);
      setSettingsReady(true);
      setSettings({ ...defaultSettings, ...savedSettings });
      setClientEmail(result.account.email);
      setClientPhone("");
      setRole("admin");
      return result;
    } catch (error) {
      await clearClientSession();
      return { error: error.message || "No se pudieron cargar los datos compartidos." };
    }
  }

  function handleClientRegister(email, password) {
    return registerClient(email, password);
  }

  if (!role) {
    return (
      <LoginView
        onClientLogin={handleClientLogin}
        onClientRegister={handleClientRegister}
        onAdminLogin={handleAdminLogin}
        onPhoneLogin={handlePhoneLogin}
        onPhoneCodeRequest={handlePhoneCodeRequest}
      />
    );
  }

  const isAdmin = role === "admin";

  function logout() {
    setRole(null);
    setClientEmail("");
    setClientPhone("");
    clearClientSession();
    setSearch("");
    setClientForm(emptyForm);
    setClientFormError("");
    setConfirmation(null);
    setReceipt(null);
  }

  function contactSupport() {
    const copySupportEmail = navigator.clipboard?.writeText(settings.businessEmail);
    if (copySupportEmail) {
      copySupportEmail
        .then(() => setNotice(`Correo copiado: ${settings.businessEmail}`))
        .catch(() => setNotice(`Escribe a ${settings.businessEmail}`));
      return;
    }
    setNotice(`Escribe a ${settings.businessEmail}`);
  }

  return (
    <div className={isAdmin ? "app-shell client-shell admin-shell" : "app-shell client-shell"}>
      <header className="topbar">
        {!isAdmin ? (
          <div className="client-topbar-brand">
            <div>
              <span className="eyebrow">{settings.businessName}</span>
              <h1>Control de reparaciones</h1>
            </div>
            <span className="brand-gear" aria-hidden="true">⚙</span>
          </div>
        ) : (
          <div>
            <span className="eyebrow">{settings.businessName}</span>
            <h1>Control de reparaciones</h1>
          </div>
        )}
        {isAdmin && (
          <label className="header-search">
            <span aria-hidden="true">⌕</span>
            <input
              aria-label="Buscar orden o cliente"
              maxLength={80}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar orden o cliente"
            />
          </label>
        )}
        {!isAdmin && (
          <div className="client-topbar-actions">
            <span className="client-role" title={clientPhone || clientEmail}>
              {clientPhone || clientEmail}
            </span>
            <a
              className="support-button"
              href={`mailto:${settings.businessEmail}?subject=${encodeURIComponent(`Solicitud de soporte - ${settings.businessName}`)}`}
              onClick={contactSupport}
              title={`Contactar a ${settings.businessEmail}`}
            >
              Contactar soporte <span aria-hidden="true">▣</span>
            </a>
            <button type="button" className="logout-button" onClick={logout}>
              <span className="logout-copy">
                <strong>Cerrar sesión</strong>
              </span>
              <b aria-hidden="true">●</b>
            </button>
          </div>
        )}
        {isAdmin && (
          <div className="topbar-tools">
            <span className="system-status"><i /> Sistema activo</span>
            <button
              type="button"
              className="text-button"
              onClick={exportRepairs}
            >
              Descargar respaldo
            </button>
            <label className="text-button import-label">
              Restaurar respaldo
              <input
                ref={importInputRef}
                className="file-input"
                type="file"
                accept="application/json,.json"
                onChange={importRepairs}
              />
            </label>
            <span className="admin-profile"><b>AD</b> Admin</span>
            <button type="button" className="text-button" onClick={logout}>Cerrar sesión</button>
          </div>
        )}
      </header>
      {notice && (
        <div className="notice" role="status">
          {notice}
          <button onClick={() => setNotice("")}>Cerrar</button>
        </div>
      )}
      {isAdmin ? (
        <AdminView
          version={version}
          search={search}
          setSearch={setSearch}
          repairs={repairs}
          settings={settings}
          setSettings={setSettings}
          onNotice={setNotice}
          filteredRepairs={filteredRepairs}
          onLogout={logout}
          updateStatus={requestStatusChange}
          updatePhotos={updatePhotos}
          requestDelete={requestDelete}
          openReceipt={setReceipt}
        />
      ) : (
        <ClientView
          repairs={repairs}
          clientEmail={clientEmail}
          clientPhone={clientPhone}
          requireWhatsAppConsent={Boolean(clientPhone)}
          form={clientForm}
          setForm={setClientForm}
          formError={clientFormError}
          clearFormError={() => setClientFormError("")}
          addRepair={addClientRepair}
          emptyValues={{ ...emptyForm, phone: clientPhone, contactEmail: clientPhone ? "" : clientEmail }}
          onEmail={clientPhone ? undefined : emailReceipt}
          onWhatsApp={async (repair) => {
            try {
              await sendSharedRepairCode(repair.id);
              setNotice(`Enviamos el código de ${repair.id} por WhatsApp.`);
            } catch (error) {
              setNotice(`No se pudo reenviar el código de ${repair.id}: ${error.message}`);
            }
          }}
        />
      )}
      {confirmation && (
        <ConfirmModal
          title={
            confirmation.type === "delete" ? "Eliminar orden" : "Cambiar estado"
          }
          message={
            confirmation.type === "delete"
              ? `¿Seguro que deseas eliminar ${confirmation.id}?`
              : `¿Cambiar ${confirmation.id} a ${confirmation.status}?`
          }
          confirmLabel={
            confirmation.type === "delete" ? "Eliminar" : "Cambiar estado"
          }
          onConfirm={confirmAction}
          onCancel={() => setConfirmation(null)}
        />
      )}
      <ReceiptModal
        repair={receipt}
        onClose={() => setReceipt(null)}
        onPrint={printReceipt}
        onDownload={downloadReceipt}
        onEmail={emailReceipt}
      />
    </div>
  );
}

export default App;
