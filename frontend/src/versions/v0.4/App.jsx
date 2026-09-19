const trackingSteps = [
  { label: "Recibido", complete: true },
  { label: "Diagnóstico", complete: true },
  { label: "En reparación", complete: true },
  { label: "Control de calidad", complete: false },
  { label: "Listo para recoger", complete: false },
];

const payments = [
  { label: "Revisión general", amount: "$150" },
  { label: "Cambio de pantalla", amount: "$280" },
  { label: "Garantía extendida", amount: "$60" },
];

const documents = [
  "Constancia de recepción",
  "Factura provisional",
  "Garantía del servicio",
];

export default function AppV04() {
  return (
    <div className="version-app version-app--v04">
      <header className="version-app__topbar">
        <div>
          <p className="eyebrow">CLIENTE</p>
          <h2>Portal de seguimiento v0.4</h2>
        </div>
      </header>

      <section className="version-panels">
        <article className="panel panel--wide">
          <div className="panel__header">
            <h3>Estado del equipo</h3>
            <span>REP-1042</span>
          </div>
          <div className="progress-steps">
            {trackingSteps.map((step) => (
              <div key={step.label} className={step.complete ? "step is-complete" : "step"}>
                <span>{step.complete ? "✓" : "○"}</span>
                <small>{step.label}</small>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel__header">
            <h3>Pagos</h3>
          </div>
          <ul className="simple-list">
            {payments.map((item) => (
              <li key={item.label}><span>{item.label}</span><strong>{item.amount}</strong></li>
            ))}
          </ul>
        </article>
      </section>

      <section className="table-panel">
        <div className="panel__header">
          <h3>Documentos y garantías</h3>
        </div>
        <ul className="document-list">
          {documents.map((document) => (
            <li key={document}>{document}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
