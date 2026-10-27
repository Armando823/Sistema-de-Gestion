import { memo } from "react";
import { repairStatuses } from "../../data/repairData";
import { statusClass } from "../../utils/repairPresentation";

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
      <div className="orders-table-wrap">
        <table className="orders-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Cliente</th>
              <th>Equipo</th>
              <th>Falla reportada</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredRepairs.map((repair) => (
              <tr key={repair.id}>
                <td className="order-code">
                  {repair.id}
                  <small>{repair.updated}</small>
                </td>
                <td>{repair.customer}</td>
                <td>{repair.device}</td>
                <td className="order-problem">{repair.problem}</td>
                <td>
                  <span className={`status-badge ${statusClass(repair.status)}`}>
                    {repair.status}
                  </span>
                  <select
                    aria-label={`Estado de ${repair.id}`}
                    value={repair.status}
                    onChange={(event) => updateStatus(repair.id, event.target.value)}
                  >
                    {repairStatuses.map((status) => (
                      <option key={status}>{status}</option>
                    ))}
                  </select>
                </td>
                <td className="order-actions">
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => openReceipt(repair)}
                  >
                    Constancia
                  </button>
                  <label className="text-button photo-update">
                    Fotos
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(event) => updatePhotos(repair.id, event)}
                    />
                  </label>
                  <button
                    type="button"
                    className="text-button danger-text"
                    onClick={() => requestDelete(repair.id)}
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
            {filteredRepairs.length === 0 && (
              <tr>
                <td colSpan="6" className="empty">No hay órdenes que coincidan.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="orders-prototype-note">Prototipo con datos de ejemplo</p>
    </section>
  );
}

export default memo(OrderList);
