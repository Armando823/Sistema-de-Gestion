import { useMemo, useState } from "react";

const baseMetrics = [
  { label: "Órdenes abiertas", value: "128", delta: "+12%" },
  { label: "Tiempo promedio", value: "2.4d", delta: "-0.6d" },
  { label: "Stock crítico", value: "14", delta: "3 nuevos" },
  { label: "Ingresos", value: "$48.2k", delta: "+8.1%" },
];

const orders = [
  { id: "REP-1042", customer: "Ana García", device: "HP Pavilion 15", status: "En reparación", value: "$420" },
  { id: "REP-1047", customer: "Luis Pérez", device: "Lenovo ThinkPad", status: "Diagnóstico", value: "$280" },
  { id: "REP-1054", customer: "María López", device: "Dell XPS", status: "Listo", value: "$680" },
  { id: "REP-1061", customer: "Jorge Ruiz", device: "MacBook Air", status: "Pendiente", value: "$530" },
];

const inventory = [
  { item: "Pantalla 15.6" , stock: 21, level: "Adecuado" },
  { item: "Teclado HP", stock: 7, level: "Bajo" },
  { item: "Cable USB-C", stock: 42, level: "Adecuado" },
  { item: "Batería Lenovo", stock: 3, level: "Crítico" },
];

export default function AppV03() {
  const [tab, setTab] = useState("overview");

  const summary = useMemo(() => {
    const activeOrders = orders.filter((order) => order.status !== "Listo").length;
    const criticalStock = inventory.filter((item) => item.level === "Crítico" || item.level === "Bajo").length;
    return { activeOrders, criticalStock };
  }, []);

  return (
    <div className="version-app version-app--v03">
      <header className="version-app__topbar">
        <div>
          <p className="eyebrow">ADMINISTRACIÓN</p>
          <h2>Panel operativo v0.3</h2>
        </div>
        <nav className="version-app__nav" aria-label="Secciones v0.3">
          <button type="button" className={tab === "overview" ? "is-active" : ""} onClick={() => setTab("overview")}>Resumen</button>
          <button type="button" className={tab === "orders" ? "is-active" : ""} onClick={() => setTab("orders")}>Órdenes</button>
          <button type="button" className={tab === "inventory" ? "is-active" : ""} onClick={() => setTab("inventory")}>Inventario</button>
        </nav>
      </header>

      <section className="version-metrics">
        {baseMetrics.map((metric) => (
          <article key={metric.label} className="metric-card">
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.delta}</small>
          </article>
        ))}
      </section>

      <section className="version-panels">
        <article className="panel panel--wide">
          <div className="panel__header">
            <h3>Resumen operativo</h3>
            <span>actualizado hace 5 min</span>
          </div>
          <div className="summary-grid">
            <div>
              <label>Órdenes activas</label>
              <strong>{summary.activeOrders}</strong>
            </div>
            <div>
              <label>Stock crítico</label>
              <strong>{summary.criticalStock}</strong>
            </div>
            <div>
              <label>Capacidad</label>
              <strong>74%</strong>
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="panel__header">
            <h3>Actividad reciente</h3>
          </div>
          <ul className="timeline">
            <li><span>09:20</span> <strong>Ingreso de nueva batería.</strong></li>
            <li><span>10:05</span> <strong>Diagnóstico finalizado para REP-1042.</strong></li>
            <li><span>11:30</span> <strong>Autorización de pago para REP-1054.</strong></li>
          </ul>
        </article>
      </section>

      <section className="table-panel">
        <div className="panel__header">
          <h3>Órdenes por trabajo</h3>
        </div>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Cliente</th>
              <th>Equipo</th>
              <th>Estado</th>
              <th>Valor</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>{order.id}</td>
                <td>{order.customer}</td>
                <td>{order.device}</td>
                <td><span className={`pill pill--${order.status.toLowerCase().replace(/\s+/g, "-")}`}>{order.status}</span></td>
                <td>{order.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="table-panel">
        <div className="panel__header">
          <h3>Inventario</h3>
        </div>
        <table>
          <thead>
            <tr>
              <th>Artículo</th>
              <th>Stock</th>
              <th>Nivel</th>
            </tr>
          </thead>
          <tbody>
            {inventory.map((item) => (
              <tr key={item.item}>
                <td>{item.item}</td>
                <td>{item.stock}</td>
                <td><span className={`pill pill--${item.level.toLowerCase()}`}>{item.level}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
