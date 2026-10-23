import { repairStatuses } from "../../data/repairData";
import { statusClass } from "../../utils/repairPresentation";

function Metric({ label, value, tone, icon, detail }) {
  return (
    <div className={`metric-card ${tone}`}>
      <div className="metric-label">
        <span>{label}</span>
        <span className="metric-icon" aria-hidden="true">{icon}</span>
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

export default function AdminDashboard({ repairs, onOpenOrders, onOpenReceipt }) {
  const statusTotals = repairStatuses.map((status) => ({
    status,
    total: repairs.filter((repair) => repair.status === status).length,
  }));
  const deliveredCount = statusTotals.find((item) => item.status === "Entregado")?.total || 0;
  const activeCount = repairs.length - deliveredCount;
  const recentRepairs = [...repairs]
    .sort((first, second) => {
      const firstDate = Date.parse(first.createdAt || first.updatedAt || "") || 0;
      const secondDate = Date.parse(second.createdAt || second.updatedAt || "") || 0;
      return secondDate - firstDate;
    })
    .slice(0, 5);

  return (
    <>
      <section className="dashboard-heading">
        <div>
          <p className="eyebrow">RESUMEN DEL TALLER</p>
          <h2>Operaciones</h2>
          <p>Consulta el estado de las órdenes y la actividad reciente.</p>
        </div>
        <button type="button" className="primary-button" onClick={onOpenOrders}>
          Ver órdenes <span aria-label={`${repairs.length} órdenes`}>{repairs.length}</span>
        </button>
      </section>

      <section className="dashboard-stats" aria-label="Resumen de órdenes">
        <Metric label="Órdenes totales" value={repairs.length} tone="green" icon="▣" detail="Histórico" />
        <Metric
          label="En diagnóstico"
          value={statusTotals.find((item) => item.status === "En diagnóstico")?.total || 0}
          tone="blue"
          icon="⌁"
          detail="Pendientes de revisión"
        />
        <Metric
          label="En reparación"
          value={statusTotals.find((item) => item.status === "En reparación")?.total || 0}
          tone="orange"
          icon="⚙"
          detail="Trabajo en curso"
        />
        <Metric label="Entregadas" value={deliveredCount} tone="purple" icon="↥" detail="Finalizadas" />
      </section>

      <div className="admin-dashboard-grid">
        <section className="panel dashboard-activity">
          <div className="panel-heading">
            <div>
              <h3>Actividad reciente</h3>
              <p>Últimas órdenes registradas en el taller.</p>
            </div>
            <button type="button" className="text-button" onClick={onOpenOrders}>
              Ver todas
            </button>
          </div>
          {recentRepairs.length > 0 ? (
            <div className="dashboard-recent-list">
              {recentRepairs.map((repair) => (
                <button
                  type="button"
                  className="dashboard-recent-order"
                  key={repair.id}
                  onClick={() => onOpenReceipt(repair)}
                  aria-label={`Abrir constancia de ${repair.id}, ${repair.device}`}
                >
                  <span className="dashboard-recent-id">{repair.id}</span>
                  <span className="dashboard-recent-copy">
                    <strong>{repair.device}</strong>
                    <small>{repair.customer} · {repair.updated || "Sin actualización"}</small>
                  </span>
                  <span className={`status-badge ${statusClass(repair.status)}`}>
                    {repair.status}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="dashboard-empty">
              <span aria-hidden="true">▣</span>
              <strong>Aún no hay órdenes</strong>
              <p>Cuando se registre una solicitud, aparecerá aquí.</p>
            </div>
          )}
        </section>

        <section className="panel dashboard-workload">
          <div className="panel-heading">
            <div>
              <h3>Estado de órdenes</h3>
              <p>Distribución del trabajo actual.</p>
            </div>
          </div>
          <div className="dashboard-status-list" aria-label="Órdenes por estado">
            {statusTotals.map((item) => (
              <div className="dashboard-status-row" key={item.status}>
                <div>
                  <span>{item.status}</span>
                  <strong>{item.total}</strong>
                </div>
                <div
                  className="dashboard-status-track"
                  role="meter"
                  aria-label={`${item.status}: ${item.total} de ${repairs.length} órdenes`}
                  aria-valuemin="0"
                  aria-valuemax={Math.max(repairs.length, 1)}
                  aria-valuenow={item.total}
                >
                  <span style={{ width: `${repairs.length ? (item.total / repairs.length) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="dashboard-active-total">
            <span>Órdenes activas</span>
            <strong>{activeCount}</strong>
          </div>
        </section>
      </div>
    </>
  );
}
