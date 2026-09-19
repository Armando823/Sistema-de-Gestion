const apiServices = [
  { name: "API de reparaciones", status: "Activa", uptime: "99.9%" },
  { name: "Autenticación", status: "Activa", uptime: "99.8%" },
  { name: "Integración IA", status: "En prueba", uptime: "97.5%" },
];

const automations = [
  "Asignación automática de técnicos",
  "Notificación por WhatsApp y correo",
  "Generación de diagnósticos con IA",
];

const aiFeatures = [
  "Clasificación de fallos",
  "Resumen del historial de equipo",
  "Sugerencias de repuestos",
];

export default function AppV10() {
  return (
    <div className="version-app version-app--v10">
      <header className="version-app__topbar">
        <div>
          <p className="eyebrow">INFRAESTRUCTURA</p>
          <h2>Arquitectura v1.0</h2>
        </div>
      </header>

      <section className="version-panels">
        <article className="panel panel--wide">
          <div className="panel__header">
            <h3>Servicios activos</h3>
          </div>
          <ul className="simple-list">
            {apiServices.map((service) => (
              <li key={service.name}><span>{service.name}</span><strong>{service.status}</strong><small>{service.uptime}</small></li>
            ))}
          </ul>
        </article>

        <article className="panel">
          <div className="panel__header">
            <h3>Automatizaciones</h3>
          </div>
          <ul className="feature-list">
            {automations.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </article>
      </section>

      <section className="table-panel">
        <div className="panel__header">
          <h3>IA y analítica</h3>
        </div>
        <ul className="feature-list">
          {aiFeatures.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </section>
    </div>
  );
}
