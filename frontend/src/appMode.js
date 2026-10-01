// Modo de la aplicación: define qué parte del sistema se muestra.
//   "admin"  -> solo el panel del jefe (PC del taller)
//   "client" -> solo el portal de clientes
//   "full"   -> ambos (solo en desarrollo con `npm run dev`)
//
// Se fija al compilar con `vite build --mode admin` / `--mode client`
// (ver los archivos .env.admin y .env.client). Si no se indica nada, un build
// de producción usa "client" para no exponer nunca el acceso administrativo
// por accidente.
const requested = import.meta.env.VITE_APP_MODE;

export const APP_MODE =
  requested === "admin" || requested === "client" || requested === "full"
    ? requested
    : import.meta.env.DEV
      ? "full"
      : "client";

export const ADMIN_ENABLED = APP_MODE === "admin" || APP_MODE === "full";
export const CLIENT_ENABLED = APP_MODE === "client" || APP_MODE === "full";
