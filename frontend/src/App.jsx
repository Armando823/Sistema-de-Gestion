import { useEffect, useRef, useState } from "react";
import SignaturePad from "./components/signature/SignaturePad";
import ConfirmModal from "./components/modals/ConfirmModal";
import ReceiptModal from "./components/modals/ReceiptModal";
import { repairStatuses } from "./data/repairData";
import { loadRepairs, saveRepairs } from "./services/repairStorage";
import { readImage } from "./utils/image";
import {
  isValidRepair,
  repairLimits,
  validateRepairForm,
} from "./utils/repairValidation";

const emptyForm = {
  customer: "",
  phone: "",
  device: "",
  problem: "",
  photos: [],
  signature: "",
  consent: false,
};

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
  return `<!doctype html><html lang="es"><head><meta charset="UTF-8"><title>${escapeHtml(repair.id)}</title><style>body{font-family:Arial,sans-serif;max-width:700px;margin:40px auto;color:#172a3a}h1{color:#173f3a}dt{font-weight:bold;margin-top:16px}dd{margin:4px 0 0}p{line-height:1.5}.signature{max-width:280px}</style></head><body><p>TALLER DIGITAL</p><h1>Constancia de reparacion ${escapeHtml(repair.id)}</h1><dl><dt>Cliente</dt><dd>${escapeHtml(repair.customer)}</dd><dt>Telefono</dt><dd>${escapeHtml(repair.phone)}</dd><dt>Equipo</dt><dd>${escapeHtml(repair.device)}</dd><dt>Falla reportada</dt><dd>${escapeHtml(repair.problem)}</dd><dt>Estado</dt><dd>${escapeHtml(repair.status)}</dd></dl><p>El cliente autoriza la revision del equipo y recibe esta constancia del estado reportado.</p>${repair.signature ? `<img class="signature" src="${repair.signature}" alt="Firma del cliente">` : ""}</body></html>`;
}

function App() {
  const [repairs, setRepairs] = useState(loadRepairs);
  const [view, setView] = useState("admin");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [confirmation, setConfirmation] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const importInputRef = useRef(null);
      const onClientView = () => setView("client");
  useEffect(() => {
    if (!saveRepairs(repairs))
      setNotice(
        "No se pudieron guardar los cambios: el almacenamiento está lleno o bloqueado.",
      );
  }, [repairs]);
  const filteredRepairs = repairs.filter((repair) =>
    [repair.id, repair.customer, repair.device].some((value) =>
      value.toLowerCase().includes(search.toLowerCase()),
    ),
  );

  function addRepair(event) {
    event.preventDefault();
    const validationError = validateRepairForm(form);
    if (validationError) return setFormError(validationError);
    const nextNumber =
      Math.max(
        ...repairs.map(
          (repair) => Number(repair.id.replace("REP-", "")) || 1000,
        ),
        1000,
      ) + 1;
    const id = `REP-${nextNumber}`;
    const timestamp = new Date().toISOString();
    setRepairs([
      {
        ...form,
        id,
        status: "Recibido",
        createdAt: timestamp,
        updatedAt: timestamp,
        updated: formatTimestamp(timestamp),
      },
      ...repairs,
    ]);
    setForm(emptyForm);
    setFormError("");
    setNotice(`${id} creada correctamente`);
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
    URL.revokeObjectURL(url);
  }

  function printReceipt(repair) {
    const printWindow = window.open("", "_blank");
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
    URL.revokeObjectURL(url);
    setNotice("Copia de órdenes descargada");
  }

  async function importRepairs(event) {
    const file = event.target.files?.[0];
    if (!file) return;
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
      setRepairs(
        repairs.map((repair) =>
          repair.id === id ? { ...repair, photos, updated: "Ahora" } : repair,
        ),
      );
      setNotice(`${id}: fotos actualizadas`);
    } catch (error) {
      setNotice(error.message);
    }
    event.target.value = "";
  }

  async function addPhotos(event) {
    const selectedFiles = Array.from(event.target.files);
    if (selectedFiles.length > repairLimits.photos) {
      setFormError(`Puedes seleccionar máximo ${repairLimits.photos} fotos.`);
      event.target.value = "";
      return;
    }
    try {
      const photos = await Promise.all(selectedFiles.map((file) => readImage(file)));
      setForm((current) => ({ ...current, photos }));
      setFormError("");
    } catch (error) {
      setFormError(error.message);
    }
    event.target.value = "";
  }

  function removeFormPhoto(indexToRemove) {
    setForm((current) => ({
      ...current,
      photos: current.photos.filter((_, index) => index !== indexToRemove),
    }));
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">TALLER DIGITAL</span>
          <h1>Control de reparaciones</h1>
        </div>
        {view === "admin" && (
          <label className="header-search">
            <span aria-hidden="true">⌕</span>
            <input
              aria-label="Buscar orden o cliente"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar orden o cliente"
            />
          </label>
        )}
        {view === "client" && (
          <nav>
            <button
              className="nav-button"
              onClick={() => setView("admin")}
            >
              Administrador
            </button>
            <button className="nav-button active">Consulta cliente</button>
          </nav>
        )}
        {view === "admin" && (
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
          </div>
        )}
      </header>
      {notice && (
        <div className="notice" role="status">
          {notice}
          <button onClick={() => setNotice("")}>Cerrar</button>
        </div>
      )}
      {view === "admin" ? (
        <AdminView
          form={form}
          setForm={setForm}
          formError={formError}
          addRepair={addRepair}
          addPhotos={addPhotos}
          removePhoto={removeFormPhoto}
          search={search}
          setSearch={setSearch}
          repairs={repairs}
          filteredRepairs={filteredRepairs}
          onClientView={onClientView}
          updateStatus={requestStatusChange}
          updatePhotos={updatePhotos}
          requestDelete={requestDelete}
          openReceipt={setReceipt}
        />
      ) : (
        <ClientView repairs={repairs} />
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
  form,
  setForm,
  formError,
  addRepair,
  addPhotos,
  search,
  setSearch,
  repairs,
  filteredRepairs,
  onClientView,
  updateStatus,
  updatePhotos,
  requestDelete,
  openReceipt,
  removePhoto,
}) {
  const statusTotals = repairStatuses.map((status) => ({
    status,
    total: repairs.filter((repair) => repair.status === status).length,
  }));
  const maxStatusTotal = Math.max(...statusTotals.map((item) => item.total), 1);

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar" aria-label="Navegación administrativa">
        <div className="sidebar-mark">MC</div>
        <div className="sidebar-illustration" aria-hidden="true">⌁</div>
        <div className="sidebar-title">
          <strong>Taller Móvil</strong>
          <span>Sistema integral</span>
        </div>
        <nav className="sidebar-nav">
          <span className="sidebar-section">Principal</span>
          <button type="button" className="sidebar-link active">
            <span className="sidebar-icon">▦</span>
            Dashboard
          </button>
          <button type="button" className="sidebar-link">
            <span className="sidebar-icon">≡</span>
            Órdenes
          </button>
          <span className="sidebar-section">Gestión</span>
          <button
            type="button"
            className="sidebar-link muted"
            disabled
            title="Disponible en la versión 0.3"
          >
            <span className="sidebar-icon">⚙</span>
            Inventario inteligente
            <small>0.3</small>
          </button>
          <button
            type="button"
            className="sidebar-link muted"
            disabled
            title="Disponible en la versión 0.4"
          >
            <span className="sidebar-icon">♙</span>
            Clientes y garantías
            <small>0.4</small>
          </button>
          <button
            type="button"
            className="sidebar-link muted"
            disabled
            title="Disponible en la versión 0.3"
          >
            <span className="sidebar-icon">⌁</span>
            Reportes avanzados
            <small>0.3</small>
          </button>
          <button
            type="button"
            className="sidebar-link muted"
            disabled
            title="Disponible en la versión 1.0"
          >
            <span className="sidebar-icon">⚙</span>
            Ajustes
            <small>1.0</small>
          </button>
        </nav>
        <div className="sidebar-footer">
          <button
            type="button"
            className="sidebar-client-link"
            onClick={onClientView}
          >
            Consulta cliente
          </button>
          <span>Versión 0.1</span>
        </div>
      </aside>
      <main className="admin-main">
        <section className="dashboard-heading">
          <div>
            <p className="eyebrow">OPERACIONES HOY</p>
            <h2>Operaciones hoy</h2>
            <p>Registra órdenes y consulta el estado de cada reparación.</p>
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
        <section className="workspace">
          <RepairForm
            form={form}
            setForm={setForm}
            formError={formError}
            addRepair={addRepair}
            addPhotos={addPhotos}
            removePhoto={removePhoto}
          />
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
  addPhotos,
  removePhoto,
}) {
  return (
    <form className="panel form-panel" onSubmit={addRepair}>
      <div className="panel-heading">
        <h3>Nuevo ingreso <small>(orden de servicio)</small></h3>
        <div className="form-heading-actions">
          <button
            type="button"
            className="text-button"
            onClick={() => setForm(emptyForm)}
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
        Equipo
        <input
          required
          maxLength={repairLimits.device}
          value={form.device}
          onChange={(event) => setForm({ ...form, device: event.target.value })}
          placeholder="Marca, modelo y serial"
        />
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
        Firma del cliente
        <SignaturePad
          value={form.signature}
          onChange={(signature) => setForm({ ...form, signature })}
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
      {formError && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}
      <button type="submit" className="primary-button">
        Crear orden
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
  return (
    <section className="panel orders-panel">
      <div className="panel-heading">
        <div>
          <h3>Últimas órdenes</h3>
          <p>{filteredRepairs.length} resultados</p>
        </div>
        <div className="search-controls">
          <input
            maxLength="80"
            className="search"
            aria-label="Buscar órdenes"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar orden o cliente"
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
                {repair.signature ? "Firmada" : "Sin firma"}
              </small>
              <span className={`status-badge ${statusClass(repair.status)}`}>
                {repair.status}
              </span>
              <label className="photo-update">
                Actualizar fotos
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

function ClientView({ repairs }) {
  const [code, setCode] = useState("");
  const [result, setResult] = useState(null);
  function findRepair(event) {
    event.preventDefault();
    const normalizedCode = code.trim().toUpperCase();
    setResult(
      /^REP-\d{4,8}$/.test(normalizedCode)
        ? repairs.find((repair) => repair.id === normalizedCode) || false
        : false,
    );
  }
  return (
    <main className="client-view">
      <div className="client-card">
        <p className="eyebrow">ÁREA DEL CLIENTE</p>
        <h2>¿Dónde está tu equipo?</h2>
        <p>
          El administrador crea la orden en el taller. Tú solo necesitas
          ingresar el código recibido para consultar su estado.
        </p>
        <form onSubmit={findRepair} className="lookup">
          <input
            required
            maxLength="12"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="Ej. REP-1001"
          />
          <button className="primary-button">Consultar</button>
        </form>
        {result && (
          <div className="result">
            <span className="status-dot" />
            <div>
              <strong>{result.status}</strong>
              <p>{result.device}</p>
              <small>Última actualización: {result.updated}</small>
              {result.photos?.length > 0 && (
                <div className="client-photos">
                  <strong>Fotos del equipo</strong>
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
            </div>
          </div>
        )}
        {result === false && (
          <p className="error">No encontramos una orden con ese código.</p>
        )}
        <p className="demo-hint">
          Prueba con{" "}
          <button onClick={() => setCode("REP-1001")}>REP-1001</button>
        </p>
      </div>
    </main>
  );
}

export default App;
