export default function ReceiptModal({ repair, onClose, onPrint, onDownload }) {
  if (!repair) return null;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal receipt-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-heading">
          <div>
            <p className="eyebrow">CONSTANCIA DE REPARACION</p>
            <h3 id="receipt-title">{repair.id}</h3>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Cerrar constancia"
          >
            X
          </button>
        </div>
        <dl className="receipt-details">
          <div>
            <dt>Cliente</dt>
            <dd>{repair.customer}</dd>
          </div>
          <div>
            <dt>Telefono</dt>
            <dd>{repair.phone}</dd>
          </div>
          <div>
            <dt>Equipo</dt>
            <dd>{repair.device}</dd>
          </div>
          <div>
            <dt>Falla reportada</dt>
            <dd>{repair.problem}</dd>
          </div>
          <div>
            <dt>Estado</dt>
            <dd>{repair.status}</dd>
          </div>
        </dl>
        <p className="receipt-note">
          El cliente autoriza la revision del equipo y recibe esta constancia
          del estado reportado.
        </p>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cerrar
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => onDownload(repair)}
          >
            Descargar
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => onPrint(repair)}
          >
            Imprimir
          </button>
        </div>
      </section>
    </div>
  );
}
