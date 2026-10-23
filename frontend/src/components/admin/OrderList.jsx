import { repairStatuses } from "../../data/repairData";
import { statusClass } from "../../utils/repairPresentation";

export default function OrderList({
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
