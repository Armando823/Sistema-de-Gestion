import { useState } from "react";
import SignaturePad from "../signature/Signaturepad";
import { emptyForm } from "../../data/repairData";
import { repairLimits } from "../../utils/repairValidation";

export default function RepairForm({
  form,
  setForm,
  formError,
  addRepair,
  clearFormError,
  className = "",
  title = "Nuevo ingreso",
  subtitle = "(orden de servicio)",
  submitLabel = "Crear orden",
  deviceSuggestions = [],
  emptyValues = emptyForm,
  requireEmail = false,
  requireWhatsAppConsent = false,
}) {
  const [showAllDevices, setShowAllDevices] = useState(false);
  const normalizedDevice = form.device.trim().toLowerCase();
  const hasExactDevice = deviceSuggestions.some(
    (device) => device.toLowerCase() === normalizedDevice,
  );
  const matchingDevices = normalizedDevice && !hasExactDevice
    ? (showAllDevices
        ? deviceSuggestions
        : deviceSuggestions
        .filter((device) =>
          device.toLowerCase().includes(normalizedDevice),
        ))
    : [];

  return (
    <form className={`panel form-panel ${className}`} onSubmit={addRepair}>
      <div className="panel-heading">
        <h3>{title} <small>{subtitle}</small></h3>
        <div className="form-heading-actions">
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setForm(emptyValues);
              clearFormError?.();
            }}
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
        Laptop
        <input
          required
          maxLength={repairLimits.device}
          value={form.device}
          onChange={(event) => {
            setShowAllDevices(false);
            setForm({ ...form, device: event.target.value });
          }}
          autoComplete="off"
          placeholder="Ej. HP Pavilion 15 - SN12345"
        />
        <small className="field-help">Escribe marca, modelo y serial de la laptop.</small>
        {matchingDevices.length > 0 && (
          <div className="device-suggestions" aria-label="Modelos sugeridos">
            {!showAllDevices && deviceSuggestions.length > matchingDevices.length && (
              <button
                type="button"
                className="show-all-devices"
                onClick={() => setShowAllDevices(true)}
              >
                Ver todos los modelos ({deviceSuggestions.length})
              </button>
            )}
            {matchingDevices.map((device) => (
              <button
                type="button"
                key={device}
                onClick={() => {
                  setShowAllDevices(false);
                  setForm({ ...form, device });
                }}
              >
                {device}
              </button>
            ))}
          </div>
        )}
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
        Nombre de quien entrega
        <input
          required
          maxLength={repairLimits.customer}
          value={form.authorizedBy}
          onChange={(event) =>
            setForm({ ...form, authorizedBy: event.target.value })
          }
          placeholder="Nombre completo"
        />
      </label>
      <label>
        Correo del cliente
        <input
          type="email"
          required={requireEmail}
          maxLength={254}
          autoComplete="email"
          value={form.contactEmail}
          onChange={(event) =>
            setForm({ ...form, contactEmail: event.target.value })
          }
          placeholder="nombre@correo.com"
        />
        <small className="field-help">
          Te enviaremos la constancia con el código de tu orden, los datos del
          equipo y cómo contactar al taller.
        </small>
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
      {requireWhatsAppConsent && (
        <label className="consent">
          <input
            type="checkbox"
            required
            checked={form.whatsappOptIn}
            onChange={(event) =>
              setForm({ ...form, whatsappOptIn: event.target.checked })
            }
          />{" "}
          Autorizo a Taller Digital a enviarme por WhatsApp el código de esta
          reparación y, si lo solicito, a reenviarlo al celular verificado.
        </label>
      )}
      <SignaturePad
        value={form.signature}
        onChange={(signature) => setForm({ ...form, signature })}
      />
      {formError && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}
      <button type="submit" className="primary-button">
        {submitLabel}
      </button>
    </form>
  );
}
