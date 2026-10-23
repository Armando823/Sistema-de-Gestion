import { useEffect, useState } from "react";
import AdminDashboard from "./AdminDashboard";
import OrderList from "./OrderList";
import { repairStatuses } from "../../data/repairData";
import { readImage } from "../../utils/image";
import { toCsv } from "../../utils/csv";
import { loadInventory, deleteSetting, readSetting, saveInventory, saveSetting } from "../../services/dbService";

export default function AdminView({
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
  onNotice,
}) {
  const [activeSection, setActiveSection] = useState("dashboard");
  const [companyLogo, setCompanyLogo] = useState("");
  const [logoReady, setLogoReady] = useState(false);
  useEffect(() => {
    readSetting("workshop-logo", "").then((savedLogo) => {
      setCompanyLogo(savedLogo || "");
      setLogoReady(true);
    }).catch((error) => onNotice(error.message || "No se pudo cargar el logo del taller."));
  }, []);
  useEffect(() => {
    if (!logoReady) return;
    const save = companyLogo
      ? saveSetting("workshop-logo", companyLogo)
      : deleteSetting("workshop-logo");
    save.then((saved) => {
      if (!saved) onNotice("No se pudo guardar el logo del taller.");
    }).catch((error) => onNotice(error.message || "No se pudo guardar el logo del taller."));
  }, [companyLogo, logoReady]);
  const inventoryFallback = [];
  const [inventoryData, setInventoryData] = useState([]);
  const [inventoryReady, setInventoryReady] = useState(false);
  useEffect(() => {
    loadInventory().then((savedInventory) => {
      setInventoryData(savedInventory.length > 0 ? savedInventory : inventoryFallback);
      setInventoryReady(true);
    }).catch((error) => onNotice(error.message || "No se pudo cargar el inventario."));
  }, []);
  useEffect(() => {
    if (inventoryReady) {
      saveInventory(inventoryData).then((saved) => {
        if (!saved) onNotice("No se pudo guardar el inventario.");
      }).catch((error) => onNotice(error.message || "No se pudo guardar el inventario."));
    }
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
  const [clientsData, setClientsData] = useState([]);
  const [clientSearch, setClientSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("Todos");
  const [reportPeriod, setReportPeriod] = useState("all");
  const [settingsSaved, setSettingsSaved] = useState(false);

  function showOrders() {
    setActiveSection("orders");
    window.scrollTo({ top: 0, behavior: "smooth" });
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
    const csv = toCsv(rows);
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
        {activeSection === "dashboard" && (
          <AdminDashboard
            repairs={repairs}
            onOpenOrders={showOrders}
            onOpenReceipt={openReceipt}
          />
        )}

        {activeSection === "orders" && (
          <>
            <section className="dashboard-heading">
              <div>
                <p className="eyebrow">GESTIÓN DEL TALLER</p>
                <h2>Órdenes de reparación</h2>
                <p>Busca solicitudes, actualiza su estado y administra las constancias.</p>
              </div>
              <div className="summary">
                <strong>{filteredRepairs.length}</strong>
                <span>{filteredRepairs.length === 1 ? "orden encontrada" : "órdenes encontradas"}</span>
              </div>
            </section>
            <section id="admin-orders" className="workspace admin-orders-only">
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
          <form className="panel settings-panel" onSubmit={async (event) => {
            event.preventDefault();
            try {
              setSettingsSaved(await saveSetting("workshop-settings", settings));
            } catch (error) {
              setSettingsSaved(false);
              onNotice(error.message || "No se pudieron guardar los ajustes del taller.");
            }
          }}>
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
            <div className="settings-footer"><small>Configuración guardada en el servidor.</small><button type="submit" className="inventory-save">Guardar ajustes</button></div>
          </form>
        )}
      </main>
    </div>
  );
}
