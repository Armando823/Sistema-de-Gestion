import { useEffect, useRef, useState } from "react";
import SignaturePad from "./components/signature/Signaturepad";
import ConfirmModal from "./components/modals/ConfirmModal";
import ReceiptModal from "./components/modals/ReceiptModal";
import { repairStatuses } from "./data/repairData";
import { loadRepairs, saveRepairs } from "./services/repairStorage";
import {
  authenticateClient,
  clearClientSession,
  readClientSession,
  registerClient,
  saveClientSession,
} from "./services/accountStorage";
import { readImage } from "./utils/image";
import {
  isValidRepair,
  isValidImageData,
  repairLimits,
  validateRepairForm,
} from "./utils/repairValidation";
import {
  loadInventory,
  deleteSetting,
  readSetting,
  saveInventory,
  saveSetting,
} from "./services/dbService";

const emptyForm = {
  customer: "",
  phone: "",
  device: "",
  problem: "",
  photos: [],
  signature: "",
  authorizedBy: "",
  consent: false,
};

const demoUsers = import.meta.env.DEV
  ? { admin: { username: "jefe", password: "jefe123", label: "Administrador" } }
  : null;

const supportEmail = "soporte@tallerdigital.com";

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

const laptopCatalog = [
  "HP Pavilion 15",
  "HP 14",
  "HP Envy x360",
  "HP Victus 16",
  "HP EliteBook 840",
  "HP ProBook 450",
  "HP Omen 16",
  "Lenovo IdeaPad 3",
  "Lenovo ThinkPad E14",
  "Lenovo Legion 5",
  "Lenovo Yoga Slim 7",
  "Lenovo V15",
  "Lenovo ThinkBook 15",
  "Lenovo IdeaPad 5",
  "Lenovo IdeaPad Flex 5",
  "Lenovo ThinkPad T14",
  "Lenovo ThinkPad X1 Carbon",
  "Lenovo Legion 7",
  "Lenovo LOQ 15",
  "Dell Inspiron 15",
  "Dell Latitude 5420",
  "Dell XPS 13",
  "Dell Vostro 15",
  "Dell G15",
  "Dell Precision 5560",
  "Dell Inspiron 14",
  "Dell Latitude 7440",
  "Dell XPS 15",
  "ASUS VivoBook",
  "ASUS TUF Gaming",
  "ASUS ZenBook 14",
  "ASUS ROG Strix G15",
  "ASUS ExpertBook",
  "MacBook Air",
  "MacBook Pro",
  "MacBook Pro 14",
  "MacBook Pro 16",
  "Acer Aspire 5",
  "Acer Nitro 5",
  "Acer Swift 3",
  "Acer Chromebook 315",
  "MSI Modern 14",
  "MSI Katana 15",
  "MSI GF63 Thin",
  "Samsung Galaxy Book",
  "Samsung Galaxy Book 3",
  "Microsoft Surface Laptop",
  "Microsoft Surface Pro",
];

function statusClass(status) {
  return `status-${status.toLowerCase().replaceAll(" ", "-")}`;
}

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

function LoginView({ onLogin, onClientLogin, onClientRegister }) {
  const [adminLogin, setAdminLogin] = useState(false);
  const [clientAccess, setClientAccess] = useState("welcome");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [error, setError] = useState("");

  function submit(event) {
    event.preventDefault();
    const user = demoUsers?.admin;
    if (!user || username.trim().toLowerCase() !== user.username || password !== user.password) {
      setError("El usuario o la contraseña no son correctos.");
      return;
    }
    setError("");
    onLogin("admin");
  }

  function openAdminLogin() {
    setAdminLogin(true);
    setUsername("");
    setPassword("");
    setError("");
  }

  function openClientAccess(access) {
    setAdminLogin(false);
    setClientAccess(access);
    setEmail("");
    setPassword("");
    setPasswordConfirmation("");
    setError("");
  }

  async function submitClient(event) {
    event.preventDefault();
    const result = await onClientLogin(email, password);
    if (result.error) {
      setError(result.error);
      return;
    }
    setError("");
  }

  async function submitRegistration(event) {
    event.preventDefault();
    if (password !== passwordConfirmation) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    const result = await onClientRegister(email, password);
    if (result.error) {
      setError(result.error);
      return;
    }
    setPassword("");
    setPasswordConfirmation("");
    setError("Cuenta creada. Ahora puedes iniciar sesión.");
    setClientAccess("login");
  }

  return (
    <main className={`login-view ${adminLogin ? "login-admin" : "login-client"}`}>
      <section className="login-card">
        <div className="login-brand">
          <span className="sidebar-mark">MC</span>
          <div>
            <p className="eyebrow">TALLER DIGITAL</p>
            <h1>Control de reparaciones</h1>
          </div>
        </div>
        <div className="login-heading">
          <p className="eyebrow">{adminLogin ? "ACCESO PRIVADO" : "ACCESO PÚBLICO"}</p>
          <h2>{adminLogin ? "Panel del jefe" : "Consulta tu reparación"}</h2>
          <p>
            {adminLogin
              ? "Este acceso está reservado para la administración del taller."
              : "Crea una cuenta para consultar y gestionar tus reparaciones."}
          </p>
        </div>
        {adminLogin ? (
          <form className="login-form" onSubmit={submit}>
            <label>
              Usuario del jefe
              <input
                required
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="jefe"
              />
            </label>
            <label>
              Contraseña
              <input
                required
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="********"
              />
            </label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button type="submit" className="primary-button">Entrar al panel administrativo</button>
            <button type="button" className="private-access" onClick={() => setAdminLogin(false)}>
              Volver al acceso de cliente
            </button>
          </form>
        ) : clientAccess === "welcome" ? (
          <div className="public-access">
            <button type="button" className="primary-button" onClick={() => openClientAccess("login")}>
              Iniciar sesión como cliente
            </button>
            <button type="button" className="secondary-button" onClick={() => openClientAccess("register")}>
              Crear cuenta de cliente
            </button>
            <p>Necesitas una cuenta para crear y consultar tus reparaciones.</p>
            {demoUsers && (
              <button type="button" className="private-access" onClick={openAdminLogin}>
                Acceso demo privado del jefe
              </button>
            )}
          </div>
        ) : (
          <form className="login-form" onSubmit={clientAccess === "register" ? submitRegistration : submitClient}>
            <label>
              Correo electrónico
              <input
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="cliente@correo.com"
              />
            </label>
            <label>
              Contraseña
              <input
                required
                type="password"
                minLength={8}
                autoComplete={clientAccess === "register" ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Mínimo 8 caracteres"
              />
            </label>
            {clientAccess === "register" && (
              <label>
                Confirmar contraseña
                <input
                  required
                  type="password"
                  minLength={8}
                  autoComplete="new-password"
                  value={passwordConfirmation}
                  onChange={(event) => setPasswordConfirmation(event.target.value)}
                  placeholder="Repite tu contraseña"
                />
              </label>
            )}
            {error && <p className="form-error" role="alert">{error}</p>}
            <button type="submit" className="primary-button">
              {clientAccess === "register" ? "Crear cuenta" : "Entrar como cliente"}
            </button>
            <button type="button" className="private-access" onClick={() => openClientAccess("welcome")}>
              Volver
            </button>
          </form>
        )}
        <p className="login-note">
          Los clientes usan una cuenta propia. El acceso demo administrativo
          solo está disponible durante el desarrollo local.
        </p>
      </section>
    </main>
  );
}

function App({ version = "Final" }) {
  const [repairs, setRepairs] = useState([]);
  const [clientEmail, setClientEmail] = useState("");
  const [role, setRole] = useState(null);
  const [dataReady, setDataReady] = useState(false);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [settings, setSettings] = useState(defaultSettings);
  const [clientForm, setClientForm] = useState(emptyForm);
  const [clientFormError, setClientFormError] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const importInputRef = useRef(null);
  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      loadRepairs(),
      readClientSession(),
      readSetting("workshop-settings", {}),
    ]).then(([repairsResult, sessionResult, settingsResult]) => {
      if (cancelled) return;
      const savedRepairs = repairsResult.status === "fulfilled" ? repairsResult.value : [];
      const sessionEmail = sessionResult.status === "fulfilled" ? sessionResult.value : "";
      const savedSettings = settingsResult.status === "fulfilled" ? settingsResult.value : {};
      setRepairs(savedRepairs);
      setClientEmail(sessionEmail);
      setRole(sessionEmail ? "client" : null);
      setSettings({
        ...defaultSettings,
        ...savedSettings,
        currency: savedSettings.currency === "COP - Peso colombiano"
          ? defaultSettings.currency
          : savedSettings.currency || defaultSettings.currency,
      });
      setDataReady(true);
    }).catch(() => {
      if (cancelled) return;
      setRepairs([]);
      setClientEmail("");
      setRole(null);
      setSettings(defaultSettings);
      setNotice("No se pudo cargar la base de datos local.");
      setDataReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!dataReady) return;
    saveRepairs(repairs).then((saved) => {
      if (!saved) setNotice("No se pudieron guardar los cambios en la base de datos local.");
    });
  }, [dataReady, repairs]);
  useEffect(() => {
    if (dataReady) saveSetting("workshop-settings", settings);
  }, [dataReady, settings]);
  const filteredRepairs = repairs.filter((repair) =>
    [repair.id, repair.customer, repair.device].some((value) =>
      value.toLowerCase().includes(search.toLowerCase()),
    ),
  );

  if (!dataReady) return null;

  function createRepair(formData, clearForm, clearError, noticeMessage) {
    const timestamp = new Date().toISOString();
    const id = `REP-${
      Math.max(
        ...repairs.map(
          (repair) => Number(repair.id.replace("REP-", "")) || 1000,
        ),
        1000,
      ) + 1
    }`;
    setRepairs([
      {
        ...formData,
        id,
        status: "Recibido",
        createdAt: timestamp,
        updatedAt: timestamp,
        updated: formatTimestamp(timestamp),
      },
      ...repairs,
    ]);
    clearForm();
    clearError();
    setNotice(`${id} ${noticeMessage}`);
  }

  function addClientRepair(event) {
    event.preventDefault();
    const validationError = validateRepairForm(clientForm);
    if (validationError) return setClientFormError(validationError);
    createRepair(
      { ...clientForm, ownerEmail: clientEmail },
      () => setClientForm(emptyForm),
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

  function confirmAction() {
    if (confirmation?.type === "status") {
      setRepairs((current) =>
        current.map((repair) =>
          repair.id === confirmation.id
            ? {
                ...repair,
                status: confirmation.status,
                updatedAt: new Date().toISOString(),
                updated: formatTimestamp(),
              }
            : repair,
        ),
      );
      setNotice(`${confirmation.id} actualizada`);
    }
    if (confirmation?.type === "delete") {
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
    const printWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!printWindow) {
      setNotice("El navegador bloqueó la ventana de impresión.");
      return;
    }
    printWindow.document.write(receiptHtml(repair));
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  function exportRepairs() {
    const blob = new Blob([JSON.stringify(repairs, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ordenes-reparacion-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Copia de órdenes descargada");
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
      const importedRepairs = Array.isArray(importedData)
        ? importedData
        : importedData?.repairs;
      const validRepairs = Array.isArray(importedRepairs)
        ? importedRepairs.filter(isValidRepair).slice(0, 500)
        : [];
      if (validRepairs.length === 0) {
        setNotice("El archivo no contiene órdenes válidas");
        return;
      }
      setRepairs(validRepairs);
      setSearch("");
      setNotice(`${validRepairs.length} orden(es) importada(s)`);
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
      setRepairs((current) =>
        current.map((repair) =>
          repair.id === id ? { ...repair, photos, updated: "Ahora" } : repair,
        ),
      );
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
      await saveClientSession(result.account.email);
      setRole("client");
    }
    return result;
  }

  function handleClientRegister(email, password) {
    return registerClient(email, password);
  }

  if (!role) {
    return (
      <LoginView
        onLogin={setRole}
        onClientLogin={handleClientLogin}
        onClientRegister={handleClientRegister}
      />
    );
  }

  const isAdmin = role === "admin";

  function logout() {
    setRole(null);
    setClientEmail("");
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
            <span className="client-role" title={clientEmail}>
              {clientEmail}
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
              Exportar datos
            </button>
            <label className="text-button import-label">
              Importar datos
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
          form={clientForm}
          setForm={setClientForm}
          formError={clientFormError}
          clearFormError={() => setClientFormError("")}
          addRepair={addClientRepair}
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
      />
    </div>
  );
}

function AdminView({
  version,
  search,
  setSearch,
  repairs,
  filteredRepairs,
  onLogout,
  updateStatus,
  updatePhotos,
  requestDelete,
  openReceipt,
  settings,
  setSettings,
}) {
  const ordersSectionRef = useRef(null);
  const [activeSection, setActiveSection] = useState("dashboard");
  const [companyLogo, setCompanyLogo] = useState("");
  const [logoReady, setLogoReady] = useState(false);
  useEffect(() => {
    readSetting("workshop-logo", "").then((savedLogo) => {
      setCompanyLogo(savedLogo || "");
      setLogoReady(true);
    });
  }, []);
  useEffect(() => {
    if (!logoReady) return;
    if (companyLogo) saveSetting("workshop-logo", companyLogo);
    else deleteSetting("workshop-logo");
  }, [companyLogo, logoReady]);
  const inventoryFallback = [
    { id: 1, item: "Pantalla HP 15.6 FHD", sku: "LCD-HP156-FHD", category: "Pantallas", stock: 8, minimum: 4, cost: 185000, supplier: "Partes Express" },
    { id: 2, item: "Teclado HP Español", sku: "KBD-HP-ES", category: "Teclados", stock: 7, minimum: 8, cost: 68000, supplier: "CompuRepuestos" },
    { id: 3, item: "Cable USB-C 65W", sku: "CAB-USBC-65", category: "Cargadores", stock: 24, minimum: 10, cost: 32000, supplier: "Partes Express" },
    { id: 4, item: "Batería Lenovo L20M4PC0", sku: "BAT-LNV-L20", category: "Baterías", stock: 3, minimum: 5, cost: 210000, supplier: "TecnoSupply" },
    { id: 5, item: "SSD NVMe 512 GB", sku: "SSD-NVME-512", category: "Almacenamiento", stock: 12, minimum: 6, cost: 168000, supplier: "TecnoSupply" },
  ];
  const [inventoryData, setInventoryData] = useState([]);
  const [inventoryReady, setInventoryReady] = useState(false);
  useEffect(() => {
    loadInventory().then((savedInventory) => {
      setInventoryData(savedInventory.length > 0 ? savedInventory : inventoryFallback);
      setInventoryReady(true);
    });
  }, []);
  useEffect(() => {
    if (inventoryReady) saveInventory(inventoryData);
  }, [inventoryData, inventoryReady]);
  const [inventorySearch, setInventorySearch] = useState("");
  const [inventoryFilter, setInventoryFilter] = useState("Todos");
  const [editingInventoryId, setEditingInventoryId] = useState(null);
  const [inventoryForm, setInventoryForm] = useState({
    item: "",
    sku: "",
    category: "",
    stock: "",
    minimum: "",
    cost: "",
    supplier: "",
  });
  const [clientsData, setClientsData] = useState([
    { id: 1, name: "Laura Gómez", email: "laura@test.com", phone: "+51 987 321 654", device: "Lenovo IdeaPad 3", warrantyUntil: "2026-12-20", tickets: 2, lastService: "12/09/2026" },
    { id: 2, name: "Carlos Ruiz", email: "carlos@test.com", phone: "+51 976 442 118", device: "HP Pavilion 15", warrantyUntil: "2026-10-04", tickets: 1, lastService: "04/09/2026" },
    { id: 3, name: "Ana García", email: "ana@test.com", phone: "+51 965 703 221", device: "Dell Inspiron 15", warrantyUntil: "2027-02-18", tickets: 3, lastService: "18/08/2026" },
  ]);
  const [clientSearch, setClientSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("Todos");
  const [reportPeriod, setReportPeriod] = useState("all");
  const [settingsSaved, setSettingsSaved] = useState(false);

  function showOrders() {
    setActiveSection("orders");
    ordersSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function showDashboard() {
    setActiveSection("dashboard");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showInventory() {
    setActiveSection("inventory");
  }

  function showClients() {
    setActiveSection("clients");
  }

  function showReports() {
    setActiveSection("reports");
  }

  function showSettings() {
    setActiveSection("settings");
  }

  async function updateCompanyLogo(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setCompanyLogo(await readImage(file, 500));
    } catch {
      setCompanyLogo("");
    }
    event.target.value = "";
  }

  function warrantyState(date) {
    if (!date) return "Sin garantía";
    const days = Math.ceil((new Date(`${date}T23:59:59`) - new Date()) / 86400000);
    if (days < 0) return "Vencida";
    if (days <= 30) return "Por vencer";
    return "Vigente";
  }

  function warrantyLabel(date) {
    if (!date) return "Sin cobertura";
    return new Intl.DateTimeFormat("es-PE", { dateStyle: "medium" }).format(new Date(`${date}T12:00:00`));
  }

  function openClientOrders(client) {
    setSearch(client.name);
    setActiveSection("orders");
  }

  const filteredClients = clientsData.filter((client) => {
    const status = warrantyState(client.warrantyUntil);
    const matchesSearch = [client.name, client.email, client.phone, client.device]
      .some((value) => value.toLowerCase().includes(clientSearch.toLowerCase()));
    return matchesSearch && (clientFilter === "Todos" || status === clientFilter);
  });
  const clientWarrantyCounts = ["Vigente", "Por vencer", "Vencida", "Sin garantía"].map((status) => ({
    status,
    total: clientsData.filter((client) => warrantyState(client.warrantyUntil) === status).length,
  }));
  const reportRepairs = reportPeriod === "all"
    ? repairs
    : repairs.filter((repair) => !repair.createdAt || new Date(repair.createdAt) >= new Date(Date.now() - Number(reportPeriod) * 86400000));
  const reportStatusTotals = repairStatuses.map((status) => ({
    status,
    total: reportRepairs.filter((repair) => repair.status === status).length,
  }));
  const reportMaxStatusTotal = Math.max(...reportStatusTotals.map((item) => item.total), 1);
  const deliveredCount = reportRepairs.filter((repair) => repair.status === "Entregado").length;
  const activeCount = reportRepairs.length - deliveredCount;
  const completionRate = reportRepairs.length ? Math.round((deliveredCount / reportRepairs.length) * 100) : 0;

  function exportReport() {
    const rows = [
      ["Orden", "Cliente", "Equipo", "Estado", "Actualización"],
      ...reportRepairs.map((repair) => [repair.id, repair.customer, repair.device, repair.status, repair.updated]),
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value || "").replaceAll('"', '""')}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.download = `reporte-reparaciones-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  const statusTotals = repairStatuses.map((status) => ({
    status,
    total: repairs.filter((repair) => repair.status === status).length,
  }));
  const maxStatusTotal = Math.max(...statusTotals.map((item) => item.total), 1);
  const currencyPrefix = settings.currency.startsWith("PEN")
    ? "S/ "
    : settings.currency.startsWith("USD")
    ? "US$"
    : settings.currency.startsWith("MXN")
      ? "MX$"
      : "$";
  function inventoryLevel(stock) {
    if (stock === 0) return "Agotado";
    if (stock < 4) return "Crítico";
    if (stock < 8) return "Bajo";
    return "Adecuado";
  }
  function resetInventoryForm() {
    setEditingInventoryId(null);
    setInventoryForm({ item: "", sku: "", category: "", stock: "", minimum: "", cost: "", supplier: "" });
  }
  function saveInventoryItem(event) {
    event.preventDefault();
    const item = {
      ...inventoryForm,
      item: inventoryForm.item.trim(),
      sku: inventoryForm.sku.trim().toUpperCase(),
      category: inventoryForm.category.trim(),
      supplier: inventoryForm.supplier.trim(),
      stock: Math.max(Number(inventoryForm.stock) || 0, 0),
      minimum: Math.max(Number(inventoryForm.minimum) || 0, 0),
      cost: Math.max(Number(inventoryForm.cost) || 0, 0),
    };
    if (!item.item || !item.sku || !item.category || !item.supplier) return;
    setInventoryData((current) => editingInventoryId
      ? current.map((entry) => entry.id === editingInventoryId ? { ...entry, ...item } : entry)
      : [...current, { id: Date.now(), ...item }]);
    resetInventoryForm();
  }
  function editInventoryItem(item) {
    setEditingInventoryId(item.id);
    setInventoryForm({ ...item, stock: String(item.stock), minimum: String(item.minimum), cost: String(item.cost) });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function removeInventoryItem(id) {
    setInventoryData((current) => current.filter((item) => item.id !== id));
    if (editingInventoryId === id) resetInventoryForm();
  }
  const inventoryLevels = ["Todos", "Agotado", "Crítico", "Bajo", "Adecuado"];
  const filteredInventory = inventoryData.filter((item) => {
    const matchesSearch = [item.item, item.sku, item.category, item.supplier]
      .some((value) => value.toLowerCase().includes(inventorySearch.toLowerCase()));
    const matchesFilter = inventoryFilter === "Todos" || inventoryLevel(item.stock) === inventoryFilter;
    return matchesSearch && matchesFilter;
  });
  const lowStockCount = inventoryData.filter((item) => inventoryLevel(item.stock) !== "Adecuado").length;
  const inventoryValue = inventoryData.reduce((total, item) => total + item.stock * item.cost, 0);

  return (
    <div className={`admin-layout ${settings.darkMode ? "admin-dark" : ""}`}>
      <aside className="admin-sidebar" aria-label="Navegación administrativa">
        <div className="sidebar-mark">MC</div>
        <label className="company-logo-upload company-logo-hero" title="Cargar logo de empresa">
          {companyLogo ? <img src={companyLogo} alt={`Logo de ${settings.businessName}`} /> : <span className="sidebar-illustration" aria-hidden="true">⌁</span>}
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={updateCompanyLogo} />
          <span className="company-logo-hint">{companyLogo ? "Cambiar logo" : "Agregar logo"}</span>
        </label>
        <div className="sidebar-title">
          <strong>{settings.businessName}</strong>
          <span>Sistema integral</span>
        </div>
        <nav className="sidebar-nav">
          <span className="sidebar-section">Principal</span>
          <button
            type="button"
            className={`sidebar-link ${activeSection === "dashboard" ? "active" : ""}`}
            onClick={showDashboard}
          >
            <span className="sidebar-icon">▦</span>
            Dashboard
          </button>
          <button
            type="button"
            className={`sidebar-link ${activeSection === "orders" ? "active" : ""}`}
            onClick={showOrders}
            aria-controls="admin-orders"
          >
            <span className="sidebar-icon">≡</span>
            Órdenes
          </button>
          <span className="sidebar-section">Gestión</span>
          <button
            type="button"
            className={`sidebar-link ${activeSection === "inventory" ? "active" : ""}`}
            onClick={showInventory}
          >
            <span className="sidebar-icon">⚙</span>
            Inventario inteligente
          </button>
          <button
            type="button"
            className={`sidebar-link ${activeSection === "clients" ? "active" : ""}`}
            onClick={showClients}
          >
            <span className="sidebar-icon">♙</span>
            Clientes y garantías
          </button>
          <button
            type="button"
            className={`sidebar-link ${activeSection === "reports" ? "active" : ""}`}
            onClick={showReports}
          >
            <span className="sidebar-icon">⌁</span>
            Reportes avanzados
          </button>
          <button
            type="button"
            className={`sidebar-link ${activeSection === "settings" ? "active" : ""}`}
            onClick={showSettings}
          >
            <span className="sidebar-icon">⚙</span>
            Ajustes
          </button>
        </nav>
        <div className="sidebar-footer">
          <button type="button" className="sidebar-client-link" onClick={onLogout}>
            Cerrar sesión
          </button>
          <span>Versión {version}</span>
        </div>
      </aside>
      <main className="admin-main">
        {(activeSection === "dashboard" || activeSection === "orders") && (
          <>
            <section className="dashboard-heading">
              <div>
                <p className="eyebrow">OPERACIONES HOY</p>
                <h2>Solicitudes recibidas</h2>
                <p>Gestiona órdenes creadas por los clientes y agrega sus imágenes.</p>
              </div>
              <div className="summary">
                <strong>{repairs.length}</strong>
                <span>órdenes totales</span>
              </div>
            </section>
            <section className="dashboard-stats" aria-label="Resumen de órdenes">
              <Metric
                label="Órdenes totales"
                value={repairs.length}
                tone="green"
                icon="▣"
              />
              <Metric
                label="En diagnóstico"
                value={statusTotals.find((item) => item.status === "En diagnóstico")?.total || 0}
                tone="blue"
                icon="⌁"
              />
              <Metric
                label="En reparación"
                value={statusTotals.find((item) => item.status === "En reparación")?.total || 0}
                tone="orange"
                icon="⚙"
              />
              <Metric
                label="Entregadas"
                value={statusTotals.find((item) => item.status === "Entregado")?.total || 0}
                tone="purple"
                icon="↥"
              />
            </section>
            <section
              ref={ordersSectionRef}
              id="admin-orders"
              className="workspace admin-orders-only"
              tabIndex={-1}
            >
              <OrderList
                search={search}
                setSearch={setSearch}
                filteredRepairs={filteredRepairs}
                updateStatus={updateStatus}
                updatePhotos={updatePhotos}
                requestDelete={requestDelete}
                openReceipt={openReceipt}
              />
            </section>
          </>
        )}

        {activeSection === "inventory" && (
          <section className="panel inventory-panel">
            <div className="panel-heading">
              <div>
                <h3>Inventario inteligente</h3>
                <p>Control de repuestos, mínimos y movimientos del taller.</p>
              </div>
              <span className="inventory-sync">Sincronizado ahora</span>
            </div>
            <form className="inventory-form" onSubmit={saveInventoryItem}>
              <div className="inventory-form-title">
                <div>
                  <strong>{editingInventoryId ? "Editar repuesto" : "Agregar repuesto"}</strong>
                </div>
                {editingInventoryId && <button type="button" className="inventory-cancel" onClick={resetInventoryForm}>Cancelar edición</button>}
              </div>
              <div className="inventory-form-fields">
                <input required aria-label="Nombre del repuesto" value={inventoryForm.item} onChange={(event) => setInventoryForm({ ...inventoryForm, item: event.target.value })} placeholder="Repuesto" />
                <input required aria-label="SKU o referencia" value={inventoryForm.sku} onChange={(event) => setInventoryForm({ ...inventoryForm, sku: event.target.value })} placeholder="SKU" />
                <input required value={inventoryForm.category} onChange={(event) => setInventoryForm({ ...inventoryForm, category: event.target.value })} placeholder="Categoría" />
                <input required aria-label="Existencias" type="number" min="0" value={inventoryForm.stock} onChange={(event) => setInventoryForm({ ...inventoryForm, stock: event.target.value })} placeholder="Cantidad" />
                <input required aria-label="Stock mínimo" type="number" min="0" value={inventoryForm.minimum} onChange={(event) => setInventoryForm({ ...inventoryForm, minimum: event.target.value })} placeholder="Mínimo" />
                <input required aria-label="Costo unitario" type="number" min="0" value={inventoryForm.cost} onChange={(event) => setInventoryForm({ ...inventoryForm, cost: event.target.value })} placeholder="Costo" />
                <input required value={inventoryForm.supplier} onChange={(event) => setInventoryForm({ ...inventoryForm, supplier: event.target.value })} placeholder="Proveedor" />
                <button type="submit" className="inventory-save">{editingInventoryId ? "Guardar cambios" : "Guardar repuesto"}</button>
              </div>
            </form>
            <div className="inventory-overview">
              <div><span>Valor en stock</span><strong>{currencyPrefix}{inventoryValue.toLocaleString("es-CO")}</strong></div>
              <div><span>Referencias activas</span><strong>{inventoryData.length}</strong></div>
              <div className={lowStockCount > 0 ? "inventory-alert" : ""}><span>Requieren atención</span><strong>{lowStockCount}</strong></div>
            </div>
            <div className="inventory-toolbar">
              <input
                aria-label="Buscar repuesto"
                value={inventorySearch}
                onChange={(event) => setInventorySearch(event.target.value)}
                placeholder="Buscar por nombre, SKU o proveedor"
              />
              <select
                aria-label="Filtrar inventario por estado"
                value={inventoryFilter}
                onChange={(event) => setInventoryFilter(event.target.value)}
              >
                {inventoryLevels.map((level) => <option key={level}>{level}</option>)}
              </select>
            </div>
            <div className="inventory-grid">
              {filteredInventory.map((item) => (
                <article key={item.id} className="inventory-card">
                  <div className="inventory-card-heading">
                    <div>
                      <strong>{item.item}</strong>
                      <small>{item.category} · {item.sku}</small>
                    </div>
                    <span className={`inventory-level inventory-level-${inventoryLevel(item.stock).toLowerCase()}`}>
                      {inventoryLevel(item.stock)}
                    </span>
                  </div>
                  <div className="inventory-stock-row">
                    <div><b>{item.stock}</b><span>unidades disponibles</span></div>
                    <small>Mínimo: {item.minimum}</small>
                  </div>
                  <div className="inventory-progress"><span style={{ width: `${Math.min((item.stock / Math.max(item.minimum * 2, 1)) * 100, 100)}%` }} /></div>
                  <div className="inventory-details">
                    <span>Proveedor: {item.supplier}</span>
                    <span>{currencyPrefix}{item.cost.toLocaleString("es-CO")} / unidad</span>
                  </div>
                  <div className="inventory-actions">
                    <button
                      type="button"
                      disabled={item.stock === 0}
                      onClick={() => setInventoryData((current) => current.map((entry) => entry.id === item.id ? { ...entry, stock: Math.max(entry.stock - 1, 0) } : entry))}
                    >
                      -1 salida
                    </button>
                    <button
                      type="button"
                      onClick={() => setInventoryData((current) => current.map((entry) => entry.id === item.id ? { ...entry, stock: entry.stock + 1 } : entry))}
                    >
                      +1 entrada
                    </button>
                    <button type="button" onClick={() => editInventoryItem(item)}>Editar</button>
                    <button type="button" className="inventory-delete" onClick={() => removeInventoryItem(item.id)}>Eliminar</button>
                  </div>
                </article>
              ))}
            </div>
            {filteredInventory.length === 0 && <p className="empty inventory-empty">No hay repuestos que coincidan con la búsqueda.</p>}
          </section>
        )}

        {activeSection === "clients" && (
          <section className="panel clients-panel">
            <div className="panel-heading">
              <div>
                <h3>Clientes y garantías</h3>
                <p>Consulta clientes, equipos atendidos y vencimientos próximos.</p>
              </div>
            </div>
            <div className="client-overview">
              <div><span>Clientes registrados</span><strong>{clientsData.length}</strong></div>
              {clientWarrantyCounts.map((item) => <div key={item.status} className={`client-count client-count-${item.status.toLowerCase().replaceAll(" ", "-")}`}><span>{item.status}</span><strong>{item.total}</strong></div>)}
            </div>
            <div className="client-toolbar">
              <input aria-label="Buscar cliente" value={clientSearch} onChange={(event) => setClientSearch(event.target.value)} placeholder="Buscar por nombre, correo, teléfono o equipo" />
              <select aria-label="Filtrar garantías" value={clientFilter} onChange={(event) => setClientFilter(event.target.value)}>
                <option>Todos</option><option>Vigente</option><option>Por vencer</option><option>Vencida</option><option>Sin garantía</option>
              </select>
            </div>
            <div className="client-grid">
              {filteredClients.map((client) => {
                const warranty = warrantyState(client.warrantyUntil);
                return (
                <article key={client.id} className="customer-card">
                  <div className="customer-header">
                    <div><strong>{client.name}</strong><small>{client.email}</small></div>
                    <span className={`status-badge ${warranty === "Vigente" ? "success" : warranty === "Vencida" ? "danger" : warranty === "Sin garantía" ? "neutral" : "warning"}`}>{warranty}</span>
                  </div>
                  <div className="customer-details"><span>Teléfono<strong>{client.phone}</strong></span><span>Equipo<strong>{client.device}</strong></span><span>Último servicio<strong>{client.lastService}</strong></span><span>Tickets activos<strong>{client.tickets}</strong></span></div>
                  <div className="warranty-expiry"><span>Garantía hasta</span><strong>{warrantyLabel(client.warrantyUntil)}</strong></div>
                  <div className="customer-actions">
                    <button type="button" onClick={() => openClientOrders(client)}>Ver órdenes</button>
                    <button type="button" onClick={() => setClientsData((current) => current.map((entry) => entry.id === client.id ? { ...entry, warrantyUntil: `${new Date().getFullYear() + 1}-${client.warrantyUntil?.slice(5) || "12-31"}` } : entry))}>{warranty === "Vigente" ? "Extender garantía" : "Asignar garantía"}</button>
                    {warranty !== "Sin garantía" && <button type="button" className="customer-remove-warranty" onClick={() => setClientsData((current) => current.map((entry) => entry.id === client.id ? { ...entry, warrantyUntil: null } : entry))}>Eliminar garantía</button>}
                  </div>
                </article>
                );
              })}
            </div>
            {filteredClients.length === 0 && <p className="empty inventory-empty">No hay clientes que coincidan con la búsqueda.</p>}
          </section>
        )}

        {activeSection === "reports" && (
          <section className="panel reports-panel">
            <div className="panel-heading">
              <div>
                <h3>Reportes avanzados</h3>
                <p>Resumen operativo basado en las órdenes registradas.</p>
              </div>
              <div className="report-controls">
                <select aria-label="Periodo del reporte" value={reportPeriod} onChange={(event) => setReportPeriod(event.target.value)}>
                  <option value="all">Todo el historial</option>
                  <option value="30">Últimos 30 días</option>
                  <option value="90">Últimos 90 días</option>
                </select>
                <button type="button" className="report-export" onClick={exportReport}>Exportar CSV</button>
              </div>
            </div>
            <div className="report-summary">
              <div className="report-kpi">
                <span>Órdenes analizadas</span>
                <strong>{reportRepairs.length}</strong>
              </div>
              <div className="report-kpi">
                <span>Órdenes activas</span>
                <strong>{activeCount}</strong>
              </div>
              <div className="report-kpi">
                <span>Entregadas</span>
                <strong>{deliveredCount}</strong>
              </div>
              <div className="report-kpi">
                <span>Cumplimiento</span>
                <strong>{completionRate}%</strong>
              </div>
            </div>
            <div className="report-bars" aria-label="Estadísticas por estado">
              {reportStatusTotals.map((item) => (
                <div key={item.status} className="report-bar-row">
                  <span>{item.status}</span>
                  <div className="report-bar-track">
                    <div
                      className="report-bar-fill"
                      style={{ width: `${(item.total / reportMaxStatusTotal) * 100}%` }}
                    />
                  </div>
                  <strong>{item.total}</strong>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeSection === "settings" && (
          <form className="panel settings-panel" onSubmit={(event) => { event.preventDefault(); setSettingsSaved(true); }}>
            <div className="panel-heading">
              <div>
                <h3>Ajustes</h3>
                <p>Configura la información que utilizan tus órdenes y notificaciones.</p>
              </div>
              {settingsSaved && <span className="settings-saved">Cambios guardados</span>}
            </div>
            <div className="settings-columns">
              <section className="settings-group">
                <h4>Información del taller</h4>
                <label>Nombre comercial<input required value={settings.businessName} onChange={(event) => setSettings({ ...settings, businessName: event.target.value })} /></label>
                <label>Teléfono de atención<input required value={settings.businessPhone} onChange={(event) => setSettings({ ...settings, businessPhone: event.target.value })} /></label>
                <label>Correo de soporte<input required type="email" value={settings.businessEmail} onChange={(event) => setSettings({ ...settings, businessEmail: event.target.value })} /></label>
                <label>Dirección<input required value={settings.businessAddress} onChange={(event) => setSettings({ ...settings, businessAddress: event.target.value })} /></label>
              </section>
              <section className="settings-group">
                <h4>Operación</h4>
                <label>Moneda<select value={settings.currency} onChange={(event) => setSettings({ ...settings, currency: event.target.value })}><option>PEN - Sol peruano</option><option>USD - Dólar estadounidense</option><option>COP - Peso colombiano</option><option>MXN - Peso mexicano</option></select></label>
                <label>Zona horaria<select value={settings.timezone} onChange={(event) => setSettings({ ...settings, timezone: event.target.value })}><option>Bogotá (GMT-5)</option><option>Ciudad de México (GMT-6)</option><option>Lima (GMT-5)</option></select></label>
                <label>Horario de atención<input value={settings.serviceHours} onChange={(event) => setSettings({ ...settings, serviceHours: event.target.value })} /></label>
                <label>Tiempo de respuesta esperado<select value={settings.responseTime} onChange={(event) => setSettings({ ...settings, responseTime: event.target.value })}><option>24 horas</option><option>48 horas</option><option>3 a 5 días</option></select></label>
              </section>
            </div>
            <div className="settings-list">
              <label><input type="checkbox" checked={settings.autoNotifications} onChange={() => setSettings({ ...settings, autoNotifications: !settings.autoNotifications })} />Notificaciones automáticas a clientes</label>
              <label><input type="checkbox" checked={settings.notifyOnStatus} onChange={() => setSettings({ ...settings, notifyOnStatus: !settings.notifyOnStatus })} />Avisar cuando cambie el estado de una orden</label>
              <label><input type="checkbox" checked={settings.automaticReport} onChange={() => setSettings({ ...settings, automaticReport: !settings.automaticReport })} />Generar resumen operativo automático</label>
              <label><input type="checkbox" checked={settings.darkMode} onChange={() => setSettings({ ...settings, darkMode: !settings.darkMode })} />Modo oscuro del panel administrativo</label>
            </div>
            <div className="settings-footer"><small>Última configuración guardada en este navegador.</small><button type="submit" className="inventory-save">Guardar ajustes</button></div>
          </form>
        )}
      </main>
    </div>
  );
}

function Metric({ label, value, tone, icon }) {
  return (
    <div className={`metric-card ${tone}`}>
      <div className="metric-label">
        <span>{label}</span>
        <span className="metric-icon" aria-hidden="true">{icon}</span>
      </div>
      <strong>{value}</strong>
      <small>Actualizado ahora</small>
    </div>
  );
}

function RepairForm({
  form,
  setForm,
  formError,
  addRepair,
  clearFormError,
  className = "",
  title = "Nuevo ingreso",
  subtitle = "(orden de servicio)",
  submitLabel = "Crear orden",
  deviceSuggestions = [],
}) {
  const [showAllDevices, setShowAllDevices] = useState(false);
  const normalizedDevice = form.device.trim().toLowerCase();
  const hasExactDevice = deviceSuggestions.some(
    (device) => device.toLowerCase() === normalizedDevice,
  );
  const matchingDevices = normalizedDevice && !hasExactDevice
    ? (showAllDevices
        ? deviceSuggestions
        : deviceSuggestions
        .filter((device) =>
          device.toLowerCase().includes(normalizedDevice),
        ))
    : [];

  return (
    <form className={`panel form-panel ${className}`} onSubmit={addRepair}>
      <div className="panel-heading">
        <h3>{title} <small>{subtitle}</small></h3>
        <div className="form-heading-actions">
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setForm(emptyForm);
              clearFormError?.();
            }}
          >
            Limpiar
          </button>
          <span>1</span>
        </div>
      </div>
      <label>
        Cliente
        <input
          required
          maxLength={repairLimits.customer}
          value={form.customer}
          onChange={(event) =>
            setForm({ ...form, customer: event.target.value })
          }
          placeholder="Nombre completo"
        />
      </label>
      <label>
        Teléfono
        <input
          required
          maxLength={repairLimits.phone}
          value={form.phone}
          onChange={(event) => setForm({ ...form, phone: event.target.value })}
          placeholder="300 000 0000"
        />
      </label>
      <label>
        Laptop
        <input
          required
          maxLength={repairLimits.device}
          value={form.device}
          onChange={(event) => {
            setShowAllDevices(false);
            setForm({ ...form, device: event.target.value });
          }}
          autoComplete="off"
          placeholder="Ej. HP Pavilion 15 - SN12345"
        />
        <small className="field-help">Escribe marca, modelo y serial de la laptop.</small>
        {matchingDevices.length > 0 && (
          <div className="device-suggestions" aria-label="Modelos sugeridos">
            {!showAllDevices && deviceSuggestions.length > matchingDevices.length && (
              <button
                type="button"
                className="show-all-devices"
                onClick={() => setShowAllDevices(true)}
              >
                Ver todos los modelos ({deviceSuggestions.length})
              </button>
            )}
            {matchingDevices.map((device) => (
              <button
                type="button"
                key={device}
                onClick={() => {
                  setShowAllDevices(false);
                  setForm({ ...form, device });
                }}
              >
                {device}
              </button>
            ))}
          </div>
        )}
      </label>
      <label>
        Falla reportada
        <textarea
          required
          maxLength={repairLimits.problem}
          value={form.problem}
          onChange={(event) =>
            setForm({ ...form, problem: event.target.value })
          }
          placeholder="Describe el problema"
        />
      </label>
      <label>
        Nombre de quien entrega
        <input
          required
          maxLength={repairLimits.customer}
          value={form.authorizedBy}
          onChange={(event) =>
            setForm({ ...form, authorizedBy: event.target.value })
          }
          placeholder="Nombre completo"
        />
      </label>
      <label className="consent">
        <input
          type="checkbox"
          checked={form.consent}
          onChange={(event) =>
            setForm({ ...form, consent: event.target.checked })
          }
        />{" "}
        Confirmo que el cliente autoriza la revisión y recibe esta constancia
        del estado del equipo.
      </label>
      <SignaturePad
        value={form.signature}
        onChange={(signature) => setForm({ ...form, signature })}
      />
      {formError && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}
      <button type="submit" className="primary-button">
        {submitLabel}
      </button>
    </form>
  );
}

function OrderList({
  search,
  setSearch,
  filteredRepairs,
  updateStatus,
  updatePhotos,
  requestDelete,
  openReceipt,
}) {
  const pendingCount = filteredRepairs.filter(
    (repair) => repair.status === "Recibido",
  ).length;

  return (
    <section className="panel orders-panel">
      <div className="panel-heading">
        <div>
          <h3>Solicitudes recibidas</h3>
          <p>
            {filteredRepairs.length} solicitud(es)
            {pendingCount > 0 ? ` · ${pendingCount} pendiente(s)` : ""}
          </p>
        </div>
        <div className="search-controls">
          <input
            maxLength="80"
            className="search"
            aria-label="Buscar solicitudes"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar solicitud o cliente"
          />
          {search && (
            <button
              type="button"
              className="text-button"
              onClick={() => setSearch("")}
            >
              Limpiar
            </button>
          )}
        </div>
      </div>
      <div className="order-list">
        {filteredRepairs.map((repair) => (
          <article className="order" key={repair.id}>
            <div className="order-id">
              {repair.id}
              <small>{repair.updated}</small>
            </div>
            <div>
              <h4>{repair.device}</h4>
              <p>
                {repair.customer} · {repair.problem}
              </p>
              <small>
                {repair.photos?.length || 0} foto(s) ·{" "}
                {repair.authorizedBy
                  ? "Autorizada"
                  : repair.signature
                    ? "Firmada"
                    : "Sin autorización"}
              </small>
              <span className={`status-badge ${statusClass(repair.status)}`}>
                {repair.status}
              </span>
              <label className="photo-update">
                Agregar / actualizar fotos
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) => updatePhotos(repair.id, event)}
                />
              </label>
            </div>
            <select
              aria-label={`Estado de ${repair.id}`}
              value={repair.status}
              onChange={(event) => updateStatus(repair.id, event.target.value)}
            >
              {repairStatuses.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
            <div className="order-actions">
              <button
                type="button"
                className="text-button"
                onClick={() => openReceipt(repair)}
              >
                Constancia
              </button>
              <button
                type="button"
                className="text-button danger-text"
                onClick={() => requestDelete(repair.id)}
              >
                Eliminar
              </button>
            </div>
          </article>
        ))}
        {filteredRepairs.length === 0 && (
          <p className="empty">No hay órdenes que coincidan.</p>
        )}
      </div>
    </section>
  );
}

function ClientView({
  repairs,
  clientEmail,
  form,
  setForm,
  formError,
  clearFormError,
  addRepair,
}) {
  const [code, setCode] = useState("");
  const [result, setResult] = useState(null);

  function findRepair(event) {
    event.preventDefault();
    const normalizedCode = code.trim().toUpperCase();
    setResult(
      /^REP-\d{4,8}$/.test(normalizedCode)
        ? repairs.find(
            (repair) =>
              repair.id === normalizedCode &&
              (!repair.ownerEmail || repair.ownerEmail === clientEmail),
          ) || false
        : false,
    );
  }

  const progressStatusIndex = {
    Recibido: 0,
    "En diagnóstico": 1,
    "Esperando repuesto": 1,
    "En reparación": 2,
    "Listo para entregar": 4,
    Entregado: 4,
  };
  const currentStatusIndex = result ? progressStatusIndex[result.status] ?? -1 : -1;
  const deviceSuggestions = [
    ...new Set([
      ...repairs.map((repair) => repair.device),
      ...laptopCatalog,
    ]),
  ];

  return (
    <main className="client-view">
      <div className="client-portal-grid">
        <RepairForm
          className="client-request-form"
          form={form}
          setForm={setForm}
          formError={formError}
          clearFormError={clearFormError}
          addRepair={addRepair}
          title="Solicitar reparación"
          subtitle="(el taller la revisará)"
          submitLabel="Enviar solicitud"
          deviceSuggestions={deviceSuggestions}
        />
        <div className="client-card">
        <div className="client-kicker">
          <span className="client-mark">MC</span>
          <p className="eyebrow">ÁREA DEL CLIENTE</p>
        </div>
        <h2>Consulta tu reparación</h2>
        <p>
          Ingresa el código de tu orden para conocer el estado actual de tu
          equipo y las últimas novedades del taller.
        </p>
        <form onSubmit={findRepair} className="lookup">
          <input
            required
            maxLength="12"
            aria-label="Código de reparación"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="Código: REP-1001"
          />
          <button type="submit" className="primary-button">Consultar estado</button>
        </form>
        {result && (
          <div className="result">
            <div className="result-heading">
              <div>
                <span className="result-label">ORDEN {result.id}</span>
                <strong>{result.status}</strong>
              </div>
              <span className={`status-badge ${statusClass(result.status)}`}>
                En seguimiento
              </span>
            </div>
            <div className="client-progress" aria-label="Progreso de la reparación">
              {[
                ["Recibido", "▣"],
                ["Diagnóstico", "⌕"],
                ["Reparación", "⚒"],
                ["Control de calidad", "✓"],
                ["Listo para recoger", "➜"],
              ].map(([status, icon], index) => (
                <div
                  className={index <= Math.min(currentStatusIndex, 4) ? "progress-step complete" : "progress-step"}
                  key={status}
                >
                  <span className="progress-icon">{icon}</span>
                  <small>{status}</small>
                </div>
              ))}
            </div>
            <div className="client-details">
              <div>
                <small>Equipo</small>
                <strong>{result.device}</strong>
              </div>
              <div>
                <small>Cliente</small>
                <strong>{result.customer}</strong>
              </div>
              <div>
                <small>Última actualización</small>
                <strong>{result.updated}</strong>
              </div>
              <div>
                <small>Falla reportada</small>
                <strong>{result.problem}</strong>
              </div>
            </div>
            {result.photos?.length > 0 && (
              <div className="client-photos">
                <div className="section-label">
                  <strong>Fotos de recepción</strong>
                  <span>{result.photos.length} archivo(s)</span>
                </div>
                <div className="photo-preview">
                  {result.photos.map((photo, index) => (
                    <img
                      key={photo}
                      src={photo}
                      alt={`Foto del equipo ${index + 1}`}
                    />
                  ))}
                </div>
              </div>
            )}
            <p className="client-note">Te avisaremos cuando el estado de tu equipo cambie.</p>
          </div>
        )}
        {result === null && (
          <div className="client-benefits" aria-label="Información de consulta">
            <span>Seguimiento en línea</span>
            <span>Información actualizada</span>
            <span>Consulta disponible siempre</span>
          </div>
        )}
        {result === false && (
          <p className="error" role="alert">No encontramos una orden con ese código. Revisa que esté escrito correctamente.</p>
        )}
        <p className="demo-hint">
          Código de prueba: <button type="button" onClick={() => setCode("REP-1001")}>REP-1001</button>
        </p>
        </div>
      </div>
    </main>
  );
}

export default App;
