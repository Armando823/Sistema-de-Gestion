import { useEffect, useState } from 'react';
import SignaturePad from './components/signature/SignaturePad';
import { repairStatuses } from './data/repairData';
import { loadRepairs, saveRepairs } from './services/repairStorage';
import { readImage } from './utils/image';
import { repairLimits, validateRepairForm } from './utils/repairValidation';

const emptyForm = { customer: '', phone: '', device: '', problem: '', photos: [], signature: '', consent: false };

function App() {
  const [repairs, setRepairs] = useState(loadRepairs);
  const [view, setView] = useState('admin');
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState(emptyForm);
  useEffect(() => saveRepairs(repairs), [repairs]);
  const filteredRepairs = repairs.filter((repair) => [repair.id, repair.customer, repair.device].some((value) => value.toLowerCase().includes(search.toLowerCase())));

  function addRepair(event) {
    event.preventDefault();
    const validationError = validateRepairForm(form);
    if (validationError) return setFormError(validationError);
    if (!form.photos.length) return setFormError('Agrega al menos una foto del equipo como evidencia de recepción.');
    if (!form.signature || !form.consent) return setFormError('La firma y la aceptación de la constancia son obligatorias.');
    const nextNumber = Math.max(...repairs.map((repair) => Number(repair.id.replace('REP-', '')) || 1000), 1000) + 1;
    const id = `REP-${nextNumber}`;
    setRepairs([{ ...form, id, status: 'Recibido', updated: 'Ahora' }, ...repairs]);
    setForm(emptyForm);
    setFormError('');
    setNotice(`${id} creada correctamente`);
  }

  function updateStatus(id, status) {
    if (!repairStatuses.includes(status)) return;
    setRepairs(repairs.map((repair) => repair.id === id ? { ...repair, status, updated: 'Ahora' } : repair));
    setNotice(`${id} actualizada`);
  }

  async function addPhotos(event) {
    const files = Array.from(event.target.files).slice(0, 3);
    try {
      const photos = await Promise.all(files.map((file) => readImage(file)));
      setForm((current) => ({ ...current, photos }));
      setFormError('');
    } catch (error) {
      setFormError(error.message);
    }
    event.target.value = '';
  }

  return <div className="app-shell"><header className="topbar"><div><span className="eyebrow">TALLER DIGITAL</span><h1>Control de reparaciones</h1></div><nav><button className={view === 'admin' ? 'nav-button active' : 'nav-button'} onClick={() => setView('admin')}>Administrador</button><button className={view === 'client' ? 'nav-button active' : 'nav-button'} onClick={() => setView('client')}>Consulta cliente</button></nav></header>{notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice('')}>Cerrar</button></div>}{view === 'admin' ? <AdminView form={form} setForm={setForm} formError={formError} addRepair={addRepair} addPhotos={addPhotos} search={search} setSearch={setSearch} repairs={repairs} filteredRepairs={filteredRepairs} updateStatus={updateStatus} /> : <ClientView repairs={repairs} />}</div>;
}

function AdminView({ form, setForm, formError, addRepair, addPhotos, search, setSearch, repairs, filteredRepairs, updateStatus }) {
  return <main className="content"><section className="intro"><div><p className="eyebrow">OPERACIÓN DIARIA</p><h2>Las reparaciones, claras de un vistazo.</h2><p>Registra el estado del equipo, evidencia su recepción y conserva la autorización del cliente.</p></div><div className="summary"><strong>{repairs.length}</strong><span>órdenes activas</span></div></section><section className="workspace"><RepairForm form={form} setForm={setForm} formError={formError} addRepair={addRepair} addPhotos={addPhotos} /><OrderList search={search} setSearch={setSearch} filteredRepairs={filteredRepairs} updateStatus={updateStatus} /></section></main>;
}

function RepairForm({ form, setForm, formError, addRepair, addPhotos }) {
  return <form className="panel form-panel" onSubmit={addRepair}><div className="panel-heading"><h3>Nueva reparación</h3><span>1</span></div><label>Cliente<input required maxLength={repairLimits.customer} value={form.customer} onChange={(event) => setForm({ ...form, customer: event.target.value })} placeholder="Nombre completo" /></label><label>Teléfono<input required maxLength={repairLimits.phone} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="300 000 0000" /></label><label>Equipo<input required maxLength={repairLimits.device} value={form.device} onChange={(event) => setForm({ ...form, device: event.target.value })} placeholder="Marca, modelo y serial" /></label><label>Falla reportada<textarea required maxLength={repairLimits.problem} value={form.problem} onChange={(event) => setForm({ ...form, problem: event.target.value })} placeholder="Describe el problema" /></label><label>Fotos del equipo<input required type="file" accept="image/*" multiple onChange={addPhotos} /><small className="field-help">Hasta 3 fotos del estado físico al recibirlo.</small></label>{form.photos.length > 0 && <div className="photo-preview">{form.photos.map((photo, index) => <img key={photo} src={photo} alt={`Evidencia ${index + 1}`} />)}</div>}<label>Firma del cliente<SignaturePad value={form.signature} onChange={(signature) => setForm({ ...form, signature })} /></label><label className="consent"><input type="checkbox" checked={form.consent} onChange={(event) => setForm({ ...form, consent: event.target.checked })} /> Confirmo que el cliente autoriza la revisión y recibe esta constancia del estado del equipo.</label>{formError && <p className="form-error" role="alert">{formError}</p>}<button className="primary-button">Crear orden</button></form>;
}

function OrderList({ search, setSearch, filteredRepairs, updateStatus }) {
  return <section className="panel orders-panel"><div className="panel-heading"><div><h3>Órdenes recientes</h3><p>{filteredRepairs.length} resultados</p></div><input maxLength="80" className="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar orden o cliente" /></div><div className="order-list">{filteredRepairs.map((repair) => <article className="order" key={repair.id}><div className="order-id">{repair.id}<small>{repair.updated}</small></div><div><h4>{repair.device}</h4><p>{repair.customer} · {repair.problem}</p><small>{repair.photos?.length || 0} foto(s) · {repair.signature ? 'Firmada' : 'Sin firma'}</small></div><select value={repair.status} onChange={(event) => updateStatus(repair.id, event.target.value)}>{repairStatuses.map((status) => <option key={status}>{status}</option>)}</select></article>)}{filteredRepairs.length === 0 && <p className="empty">No hay órdenes que coincidan.</p>}</div></section>;
}

function ClientView({ repairs }) {
  const [code, setCode] = useState('');
  const [result, setResult] = useState(null);
  function findRepair(event) { event.preventDefault(); const normalizedCode = code.trim().toUpperCase(); setResult(/^REP-\d{4,8}$/.test(normalizedCode) ? repairs.find((repair) => repair.id === normalizedCode) || false : false); }
  return <main className="client-view"><div className="client-card"><p className="eyebrow">SEGUIMIENTO DE SERVICIO</p><h2>¿Dónde está tu equipo?</h2><p>Ingresa el código que recibiste al dejar tu equipo en el taller.</p><form onSubmit={findRepair} className="lookup"><input required maxLength="12" value={code} onChange={(event) => setCode(event.target.value)} placeholder="Ej. REP-1001" /><button className="primary-button">Consultar</button></form>{result && <div className="result"><span className="status-dot" /><div><strong>{result.status}</strong><p>{result.device}</p><small>Última actualización: {result.updated}</small></div></div>}{result === false && <p className="error">No encontramos una orden con ese código.</p>}<p className="demo-hint">Prueba con <button onClick={() => setCode('REP-1001')}>REP-1001</button></p></div></main>;
}

export default App;
