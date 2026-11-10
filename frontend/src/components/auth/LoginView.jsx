import { useState } from "react";
import { ADMIN_ENABLED, CLIENT_ENABLED } from "../../appMode";

export default function LoginView({ onAdminLogin, onPhoneLogin, onPhoneCodeRequest }) {
  const [activeRole, setActiveRole] = useState(CLIENT_ENABLED ? "client" : "admin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [phoneCodeSent, setPhoneCodeSent] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");

  function resetFields() {
    setEmail("");
    setPhone("");
    setPhoneCode("");
    setPassword("");
    setPhoneCodeSent(false);
    setConsent(false);
    setError("");
  }

  function switchRole(role) {
    setActiveRole(role);
    resetFields();
  }

  async function submitAdmin(event) {
    event.preventDefault();
    const result = await onAdminLogin(email, password);
    if (result.error) {
      setError(result.error);
      return;
    }
    setError("");
    setPassword("");
  }

  async function requestPhoneCode(event) {
    event.preventDefault();
    if (!consent) {
      setError("Debes autorizar el envío del código por WhatsApp.");
      return;
    }
    const result = await onPhoneCodeRequest(phone);
    if (result.error) {
      setError(result.error);
      return;
    }
    setError("");
    setPhoneCodeSent(true);
  }

  async function submitPhoneCode(event) {
    event.preventDefault();
    const result = await onPhoneLogin(phone, phoneCode);
    if (result.error) setError(result.error);
    else setError("");
  }

  return (
    <main className="login-screen">
      <section className="login-left">
        <div className="login-left-top">
          <div>
            <p className="eyebrow light">TALLER DIGITAL</p>
            <h1>Control de reparaciones</h1>
          </div>
        </div>
        <p className="login-left-desc">
          Recepción de equipos con fotos y firma digital, seguimiento por código y avisos al cliente por WhatsApp y correo.
        </p>
        <ul className="login-features">
          <li><span className="check">✓</span> Código único por orden</li>
          <li><span className="check">✓</span> Constancia de recepción</li>
          <li><span className="check">✓</span> Consulta del estado en línea</li>
        </ul>
      </section>

      <section className="login-right">
        <div className="login-card">
          {ADMIN_ENABLED && CLIENT_ENABLED && (
            <div className="role-tabs">
              <button
                type="button"
                className={activeRole === "client" ? "active" : ""}
                onClick={() => switchRole("client")}
              >
                Cliente
              </button>
              <button
                type="button"
                className={activeRole === "admin" ? "active" : ""}
                onClick={() => switchRole("admin")}
              >
                Administrador
              </button>
            </div>
          )}

          {activeRole === "admin" ? (
            <form className="login-form" onSubmit={submitAdmin}>
              <p className="eyebrow">ACCESO PRIVADO</p>
              <h2>Panel del jefe</h2>
              <p className="login-subtitle">Este acceso está reservado para la administración del taller.</p>
              <label>
                Correo del administrador
                <input
                  required
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="admin@correo.com"
                />
              </label>
              <label>
                Contraseña
                <input
                  required
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="********"
                />
              </label>
              {error && <p className="form-error" role="alert">{error}</p>}
              <button type="submit" className="primary-button">Entrar al panel administrativo</button>
            </form>
          ) : (
            <form className="login-form" onSubmit={phoneCodeSent ? submitPhoneCode : requestPhoneCode}>
              <p className="eyebrow">ACCESO PÚBLICO</p>
              <h2>Consulta tu reparación</h2>
              <p className="login-subtitle">
                {phoneCodeSent
                  ? "Ingresa el código que recibiste por WhatsApp para verificar tu acceso."
                  : "Ingresa tu número de celular y te enviaremos un código de acceso por WhatsApp."}
              </p>
              <label>
                Celular (con código de país)
                <input
                  required
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="+51 9XX XXX XXX"
                  readOnly={phoneCodeSent}
                />
              </label>
              {phoneCodeSent && (
                <label>
                  Código recibido por WhatsApp
                  <input
                    required
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    pattern="[0-9]{6}"
                    value={phoneCode}
                    onChange={(event) => setPhoneCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                  />
                </label>
              )}
              {!phoneCodeSent && (
                <label className="consent-row">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(event) => setConsent(event.target.checked)}
                  />
                  <span>Autorizo a Taller Digital a enviarme el código de acceso por WhatsApp.</span>
                </label>
              )}
              {error && <p className="form-error" role="alert">{error}</p>}
              <button type="submit" className="primary-button">
                {phoneCodeSent ? "Verificar código e ingresar" : "Enviar código por WhatsApp"}
              </button>
              {phoneCodeSent && (
                <button type="button" className="private-access" onClick={() => setPhoneCodeSent(false)}>
                  Cambiar celular
                </button>
              )}
            </form>
          )}

        </div>
        <span className="prototype-note">Prototipo con datos de ejemplo</span>
      </section>
    </main>
  );
}
