import { useMemo, useState } from "react";
import V02App from "./versions/v0.2/App";
import V03App from "./versions/v0.3/App";
import V04App from "./versions/v0.4/App";
import V10App from "./versions/v1.0/App";

const versions = [
  {
    id: "v0.2",
    label: "v0.2",
    title: "Autenticación y clientes",
    summary: "Acceso administrativo, clientes, permisos y flujo principal del taller.",
    status: "Activo",
    accent: "#16806d",
    render: () => <V02App />,
  },
  {
    id: "v0.3",
    label: "v0.3",
    title: "Panel administrativo avanzado",
    summary: "Inventario, métricas, órdenes, reportes y gestión operativa del taller.",
    status: "Activo",
    accent: "#3f5ec5",
    render: () => <V03App />,
  },
  {
    id: "v0.4",
    label: "v0.4",
    title: "Cliente, pagos y seguimiento",
    summary: "Seguimiento, pagos, documentos, garantías, QR y notificaciones.",
    status: "Activo",
    accent: "#8d52d9",
    render: () => <V04App />,
  },
  {
    id: "v1.0",
    label: "v1.0",
    title: "Infraestructura y IA",
    summary: "API, conectividad, automatizaciones y servicios de inteligencia artificial.",
    status: "Activo",
    accent: "#d97706",
    render: () => <V10App />,
  },
];

export default function VersionLauncher() {
  const [selectedVersion, setSelectedVersion] = useState("v0.2");

  const activeVersion = useMemo(
    () => versions.find((version) => version.id === selectedVersion) ?? versions[0],
    [selectedVersion],
  );

  return (
    <div className="version-launcher">
      <aside className="version-launcher__sidebar">
        <div className="version-launcher__header">
          <p className="eyebrow">VERSIÓN DEL SISTEMA</p>
          <h1>Control de reparaciones</h1>
        </div>

        <div className="version-launcher__list">
          {versions.map((version) => (
            <button
              key={version.id}
              type="button"
              className={`version-card ${selectedVersion === version.id ? "active" : ""}`}
              style={{ "--accent": version.accent }}
              onClick={() => setSelectedVersion(version.id)}
            >
              <div className="version-card__top">
                <strong>{version.label}</strong>
                <span>{version.status}</span>
              </div>
              <h3>{version.title}</h3>
              <p>{version.summary}</p>
            </button>
          ))}
        </div>
      </aside>

      <main className="version-launcher__content">
        <div className="version-launcher__status">
          <span className="version-dot" style={{ background: activeVersion.accent }} />
          <strong>{activeVersion.label}</strong>
          <span>{activeVersion.status}</span>
        </div>

        {activeVersion.render()}
      </main>
    </div>
  );
}
