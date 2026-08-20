import { useEffect, useState } from 'react';
import { repairStatuses } from './data/repairData';
import { loadRepairs, saveRepairs } from './services/repairStorage';
import { repairLimits, validateRepairForm } from './utils/repairValidation';

function App() {
  const [repairs, setRepairs] = useState(loadRepairs);
  const [view, setView] = useState('admin');
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({ customer: '', phone: '', device: '', problem: '' });
  useEffect(() => saveRepairs(repairs), [repairs]);
  const filteredRepairs = repairs.filter((repair) => [repair.id, repair.customer, repair.device].some((value) => value.toLowerCase().includes(search.toLowerCase())));
  function addRepair(event) {
    event.preventDefault();
    const validationError = validateRepairForm(form);
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setFormError('');
    const nextNumber = Math.max(...repairs.map((repair) => Number(repair.id.replace('REP-', '')) || 1000), 1000) + 1;
    const id = `REP-${nextNumber}`;
    setRepairs([{ ...form, id, status: 'Recibido', updated: 'Ahora' }, ...repairs]);
    setForm({ customer: '', phone: '', device: '', problem: '' });
    setNotice(`${id} creada correctamente`);
  }
  function updateStatus(id, status) {
    if (!repairStatuses.includes(status)) return;
    setRepairs(repairs.map((repair) => repair.id === id ? { ...repair, status, updated: 'Ahora' } : repair));
    setNotice(`${id} actualizada`);
  }
  return (
    <div className="app-shell">
      <header className="topbar"><div><span className="eyebrow">TALLER DIGITAL</span><h1>Control de reparaciones</h1></div><nav><button className={view === 'admin' ? 'nav-button active' : 'nav-button'} onClick={() => setView('admin')}>Administrador</button><button className={view === 'client' ? 'nav-button active' : 'nav-button'} onClick={() => setView('client')}>Consulta cliente</button></nav></header>
      {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice('')}>Cerrar</button></div>}
      {view === 'admin' ? <main className="content"><section className="intro"><div><p className="eyebrow">OPERACIÓN DIARIA</p><h2>Las reparaciones, claras de un vistazo.</h2><p>Registra equipos, actualiza su avance y comparte el código con cada cliente.</p></div><div className="summary"><strong>{repairs.length}</strong><span>órdenes activas</span></div></section><section className="workspace"><form className="panel form-panel" onSubmit={addRepair}><div className="panel-heading"><h3>Nueva reparación</h3><span>1</span></div><label>Cliente<input maxLength={repairLimits.customer} value={form.customer} onChange={(event) => setForm({ ...form, customer: event.target.value })} placeholder="Nombre completo" /></label><label>Teléfono<input maxLength={repairLimits.phone} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="300 000 0000" /></label><label>Equipo<input maxLength={repairLimits.device} value={form.device} onChange={(event) => setForm({ ...form, device: event.target.value })} placeholder="Marca y modelo" /></label><label>Falla reportada<textarea maxLength={repairLimits.problem} value={form.problem} onChange={(event) => setForm({ ...form, problem: event.target.value })} placeholder="Describe el problema" /></label>{formError && <p className="form-error" role="alert">{formError}</p>}<button className="primary-button">Crear orden</button></form><section className="panel orders-panel"><div className="panel-heading"><div><h3>Órdenes recientes</h3><p>{filteredRepairs.length} resultados</p></div><input maxLength="80" className="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar orden o cliente" /></div><div className="order-list">{filteredRepairs.map((repair) => <article className="order" key={repair.id}><div className="order-id">{repair.id}<small>{repair.updated}</small></div><div><h4>{repair.device}</h4><p>{repair.customer} · {repair.problem}</p></div><select value={repair.status} onChange={(event) => updateStatus(repair.id, event.target.value)}>{repairStatuses.map((status) => <option key={status}>{status}</option>)}</select></article>)}{filteredRepairs.length === 0 && <p className="empty">No hay órdenes que coincidan.</p>}</div></section></section></main> : <ClientView repairs={repairs} />}
    </div>
  );
}

function ClientView({ repairs }) {
  const [code, setCode] = useState('');
  const [result, setResult] = useState(null);
  function findRepair(event) { event.preventDefault(); const normalizedCode = code.trim().toUpperCase(); setResult(/^REP-\d{4,8}$/.test(normalizedCode) ? repairs.find((repair) => repair.id === normalizedCode) || false : false); }
  return <main className="client-view"><div className="client-card"><p className="eyebrow">SEGUIMIENTO DE SERVICIO</p><h2>¿Dónde está tu equipo?</h2><p>Ingresa el código que recibiste al dejar tu equipo en el taller.</p><form onSubmit={findRepair} className="lookup"><input maxLength="12" value={code} onChange={(event) => setCode(event.target.value)} placeholder="Ej. REP-1001" /><button className="primary-button">Consultar</button></form>{result && <div className="result"><span className="status-dot" /><div><strong>{result.status}</strong><p>{result.device} · {result.customer}</p><small>Última actualización: {result.updated}</small></div></div>}{result === false && <p className="error">No encontramos una orden con ese código.</p>}<p className="demo-hint">Prueba con <button onClick={() => setCode('REP-1001')}>REP-1001</button></p></div></main>;
}

export default App;