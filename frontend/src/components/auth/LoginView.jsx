import { useState } from "react";
import { ADMIN_ENABLED, CLIENT_ENABLED } from "../../appMode";

export default function LoginView({ onClientLogin, onClientRegister, onAdminLogin, onPhoneLogin, onPhoneCodeRequest }) {
  const [adminLogin, setAdminLogin] = useState(false);
  const [clientAccess, setClientAccess] = useState("welcome");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [phoneCodeSent, setPhoneCodeSent] = useState(false);
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [error, setError] = useState("");

  async function submitSharedAdmin(event) {
    event.preventDefault();
    const result = await onAdminLogin(email, password);
    if (result.error) {
      setError(result.error);
      return;
    }
    setError("");
    setPassword("");
  }

  function openAdminLogin() {
    setAdminLogin(true);
    setEmail("");
    setPassword("");
    setError("");
  }

  function openClientAccess(access) {
    setAdminLogin(false);
    setClientAccess(access);
    setEmail("");
    setPhone("");
    setPhoneCode("");
    setPhoneCodeSent(false);
    setPassword("");
    setPasswordConfirmation("");
    setError("");
  }

  async function submitClient(event) {
    event.preventDefault();
    const result = await onClientLogin(email, password);
    if (result.error) {
      setError(result.error);
      return;
    }
    setError("");
  }

  async function requestPhoneCode(event) {
    event.preventDefault();
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

  async function submitRegistration(event) {
    event.preventDefault();
    if (password !== passwordConfirmation) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    const result = await onClientRegister(email, password);
    if (result.error) {
      setError(result.error);
      return;
    }
    setPassword("");
    setPasswordConfirmation("");
    setError("Cuenta creada. Ahora puedes iniciar sesión.");
    setClientAccess("login");
  }

  return (
    <main className={`login-view ${adminLogin ? "login-admin" : "login-client"}`}>
      <section className="login-card">
        <div className="login-brand">
          <span className="sidebar-mark">MC</span>
          <div>
            <p className="eyebrow">TALLER DIGITAL</p>
            <h1>Control de reparaciones</h1>
          </div>
        </div>
        <div className="login-heading">
          <p className="eyebrow">{adminLogin ? "ACCESO PRIVADO" : "ACCESO PÚBLICO"}</p>
          <h2>{adminLogin ? "Panel del jefe" : "Consulta tu reparación"}</h2>
          <p>
            {adminLogin
              ? "Este acceso está reservado para la administración del taller."
              : onPhoneLogin
                ? "Ingresa con tu celular y confirma el código que recibirás por WhatsApp."
                : "Crea una cuenta para consultar y gestionar tus reparaciones."}
          </p>
        </div>
        {adminLogin ? (
          <form className="login-form" onSubmit={submitSharedAdmin}>
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
            <button type="button" className="private-access" onClick={() => setAdminLogin(false)}>
              Volver al acceso de cliente
            </button>
          </form>
        ) : clientAccess === "welcome" ? (
          <div className="public-access">
            <button type="button" className="primary-button" onClick={() => openClientAccess("login")}>
              {onPhoneLogin ? "Ingresar con WhatsApp" : "Iniciar sesión como cliente"}
            </button>
            {!onPhoneLogin && (
              <button type="button" className="secondary-button" onClick={() => openClientAccess("register")}>
                Crear cuenta de cliente
              </button>
            )}
            <p>{onPhoneLogin
              ? "Al solicitarlo, autorizas a Taller Digital a enviarte el código de acceso por WhatsApp."
              : "Necesitas una cuenta para crear y consultar tus reparaciones."}</p>
            {ADMIN_ENABLED && CLIENT_ENABLED && (
              <button type="button" className="private-access" onClick={openAdminLogin}>
                Acceso administrativo
              </button>
            )}
          </div>
        ) : onPhoneLogin ? (
          <form className="login-form" onSubmit={phoneCodeSent ? submitPhoneCode : requestPhoneCode}>
            <label>
              Número de celular con código de país
              <input
                required
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+573001234567"
                readOnly={phoneCodeSent}
              />
              <small className="field-help">
                Al solicitar el código autorizas a Taller Digital a enviarte mensajes de acceso por WhatsApp.
              </small>
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
            {error && <p className="form-error" role="alert">{error}</p>}
            <button type="submit" className="primary-button">
              {phoneCodeSent ? "Verificar código e ingresar" : "Enviar código por WhatsApp"}
            </button>
            <button type="button" className="private-access" onClick={() => openClientAccess("welcome")}>
              Volver
            </button>
            {phoneCodeSent && (
              <button type="button" className="private-access" onClick={() => setPhoneCodeSent(false)}>
                Cambiar celular
              </button>
            )}
          </form>
        ) : (
          <form className="login-form" onSubmit={clientAccess === "register" ? submitRegistration : submitClient}>
            <label>
              Correo electrónico
              <input
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="cliente@correo.com"
              />
            </label>
            <label>
              Contraseña
              <input
                required
                type="password"
                minLength={8}
                autoComplete={clientAccess === "register" ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Mínimo 8 caracteres"
              />
            </label>
            {clientAccess === "register" && (
              <label>
                Confirmar contraseña
                <input
                  required
                  type="password"
                  minLength={8}
                  autoComplete="new-password"
                  value={passwordConfirmation}
                  onChange={(event) => setPasswordConfirmation(event.target.value)}
                  placeholder="Repite tu contraseña"
                />
              </label>
            )}
            {error && <p className="form-error" role="alert">{error}</p>}
            <button type="submit" className="primary-button">
              {clientAccess === "register" ? "Crear cuenta" : "Entrar como cliente"}
            </button>
            <button type="button" className="private-access" onClick={() => openClientAccess("welcome")}>
              Volver
            </button>
          </form>
        )}
        <p className="login-note">
          {!CLIENT_ENABLED
            ? "Acceso exclusivo para la administración del taller."
            : !ADMIN_ENABLED
              ? "Usa tu cuenta personal para consultar tus reparaciones."
              : "Los clientes usan una cuenta propia. El acceso administrativo está disponible para gestionar el taller."}
        </p>
      </section>
    </main>
  );
}
