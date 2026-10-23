import { useState } from "react";
import RepairForm from "../repairs/RepairForm";
import { laptopCatalog } from "../../data/repairData";
import { canClientView } from "../../utils/repairAccess";
import { lookupSharedRepair } from "../../services/dbService";
import { statusClass } from "../../utils/repairPresentation";
import { isValidImageData } from "../../utils/repairValidation";

export default function ClientView({
  repairs,
  clientEmail,
  clientPhone,
  requireWhatsAppConsent,
  form,
  setForm,
  formError,
  clearFormError,
  addRepair,
  emptyValues,
  onEmail,
  onWhatsApp,
}) {
  const [code, setCode] = useState("");
  const [lookupPhone, setLookupPhone] = useState("");
  const [result, setResult] = useState(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState("");

  async function findRepair(event) {
    event.preventDefault();
    const normalizedCode = code.trim().toUpperCase();
    if (!/^REP-\d{4,8}$/.test(normalizedCode)) {
      setLookupError("");
      setResult(false);
      return;
    }
    setIsLookingUp(true);
    setLookupError("");
    setResult(null);
    try {
      const ownedRepair = repairs.find(
        (repair) =>
          repair.id === normalizedCode &&
          (repair.ownerPhone === clientPhone ||
            canClientView(repair, clientEmail, clientPhone || lookupPhone)),
      );
      if (ownedRepair) {
        setResult(ownedRepair);
        return;
      }
      if (lookupPhone.trim()) {
        setResult((await lookupSharedRepair(normalizedCode, lookupPhone)) || false);
        return;
      }
      setResult(false);
    } catch {
      setLookupError("No pudimos consultar la orden. Comprueba tu conexión e inténtalo otra vez.");
      setResult(false);
    } finally {
      setIsLookingUp(false);
    }
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
    ...repairs.filter((repair) =>
      repair.ownerEmail === clientEmail || (clientPhone && repair.ownerPhone === clientPhone),
    ).map((repair) => repair.device),
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
          emptyValues={emptyValues}
          requireEmail={!clientPhone}
          requireWhatsAppConsent={requireWhatsAppConsent}
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
            disabled={isLookingUp}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="Código: REP-1001"
          />
          {!clientPhone && (
            <input
              type="tel"
              maxLength="30"
              aria-label="Teléfono registrado en la orden"
              value={lookupPhone}
              disabled={isLookingUp}
              onChange={(event) => setLookupPhone(event.target.value)}
              placeholder="Teléfono (solo si el taller creó la orden)"
            />
          )}
          <button type="submit" className="primary-button" disabled={isLookingUp}>
            {isLookingUp ? "Buscando orden…" : "Consultar estado"}
          </button>
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
            {result.photos?.some(isValidImageData) && (
              <div className="client-photos">
                <div className="section-label">
                  <strong>Fotos de recepción</strong>
                  <span>{result.photos.filter(isValidImageData).length} archivo(s)</span>
                </div>
                <div className="photo-preview">
                  {result.photos.filter(isValidImageData).map((photo, index) => (
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
            {result.contactEmail && onEmail && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => onEmail(result)}
              >
                Reenviar constancia a {result.contactEmail}
              </button>
            )}
            {clientPhone && onWhatsApp && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => onWhatsApp(result)}
              >
                Reenviar código por WhatsApp
              </button>
            )}
          </div>
        )}
        {result === null && !isLookingUp && (
          <div className="client-benefits" aria-label="Información de consulta">
            <span>Seguimiento en línea</span>
            <span>Información actualizada</span>
            <span>Consulta disponible siempre</span>
          </div>
        )}
        {result === false && (
          <p className="error" role="alert">{lookupError || "No encontramos una orden con esos datos. Revisa el código y, si el taller creó la orden, escribe también el teléfono registrado."}</p>
        )}
        </div>
      </div>
    </main>
  );
}
