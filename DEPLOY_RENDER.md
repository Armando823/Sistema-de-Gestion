# Guía de despliegue en Render + TiDB Cloud (sin Docker)

Esta guía despliega el backend (Node) y el frontend (Static Site) en Render, usando TiDB Cloud como base de datos MySQL.

---

## Parte 1 — Crear la base de datos en TiDB Cloud (gratis)

### 1.1 Crear cuenta
1. Ve a https://tidbcloud.com.
2. Clic en **Sign Up** (Google/GitHub/email).
3. Verifica tu correo.

### 1.2 Crear el cluster Serverless (gratis)
1. En el dashboard → **Create Cluster**.
2. Elige **Serverless**.
3. Configuración:
   - Cloud/Region: la más cercana a tu región de Render (ej. AWS N. Virginia).
   - Cluster Name: `taller-digital`.
4. Clic en **Create** (tarda ~1 min).

### 1.3 Crear una base de datos dedicada
1. Entra al cluster → pestaña **Connect** o **SQL Editor**.
2. Ejecuta:
   ```sql
   CREATE DATABASE taller_digital CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```
3. (Opcional) Crea un usuario dedicado o usa el root que te da TiDB.

### 1.4 Obtener la connection string
1. En el cluster → **Connect** → **General** (no CLI).
2. Copia la URL con este formato:
   ```
   mysql://USUARIO:PASSWORD@HOST:4000/taller_digital
   ```
3. Si la contraseña tiene caracteres especiales (`@`, `:`, `/`, `#`), URL-encodeála (https://www.urlencoder.org/).
4. **Guarda la contraseña** (TiDB no la vuelve a mostrar).

---

## Parte 2 — Desplegar en Render

### 2.1 Conectar el repositorio
1. Ve a https://dashboard.render.com.
2. Clic en **New +** → **Blueprint**.
3. Conecta tu cuenta de GitHub y selecciona el repo `Sistema-de-Gestion`.
4. Render detecta `render.yaml` y muestra 2 servicios:
   - `electronicservis-api` (backend Node)
   - `electronicservis-web` (frontend Static Site)

### 2.2 Completar variables del backend (`electronicservis-api`)
| Variable | Valor |
|---|---|
| `NODE_VERSION` | `20` (ya viene por defecto) |
| `NODE_ENV` | `production` |
| `RUN_MIGRATIONS` | `true` |
| `TRUST_PROXY` | `true` |
| `MAIL_DRY_RUN` | `true` |
| `BUSINESS_NAME` | `Taller Digital` (o tu nombre) |
| `SESSION_SECRET` | Cadena aleatoria de **≥32 caracteres**. Genera una con `openssl rand -hex 32`. |
| `ADMIN_EMAIL` | Tu correo de administrador (ej. `admin@tudominio.com`). |
| `ADMIN_PASSWORD` | Contraseña de **≥12 caracteres** con al menos una letra y un número. |
| `MYSQL_URL` | La connection string de TiDB (ej. `mysql://...@...:4000/taller_digital`). |
| `ALLOWED_ORIGINS` | Déjalo vacío por ahora. |

### 2.3 Completar variables del frontend (`electronicservis-web`)
| Variable | Valor |
|---|---|
| `NODE_VERSION` | `20` |
| `VITE_API_URL` | Déjalo vacío por ahora. |

### 2.4 Deploy inicial del backend
1. Clic en **Apply** (o "Create Blueprint").
2. Espera a que el backend termine de construir y arrancar.
3. Verifica:
   - `https://electronicservis-api-u1if.onrender.com/health` → `{"status":"ok"}`.
   - `https://electronicservis-api-u1if.onrender.com/ready` → `{"status":"ok"}` (confirma MySQL).
4. **Copia la URL del backend** (ej. `https://electronicservis-api-u1if.onrender.com`).

### 2.5 Configurar y desplegar el frontend
1. En Render → servicio `electronicservis-web` → **Environment**.
2. Pon `VITE_API_URL` = URL del backend copiada.
3. Clic en **Manual Deploy** → **Deploy latest commit** (o espera al auto-deploy).
4. Cuando termine, copia la URL del frontend (ej. `https://electronicservis-web-u1if.onrender.com`).

### 2.6 Cerrar el círculo (CORS)
1. En Render → servicio `electronicservis-api` → **Environment**.
2. Pon `ALLOWED_ORIGINS` = URL del frontend.
3. Redespliega el backend (Manual Deploy).

---

## Parte 3 — Verificación final

- Frontend carga: `https://electronicservis-web-u1if.onrender.com`
- Login admin funciona con `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
- `/health` y `/ready` del backend responden 200.

---

## Parte 4 — Problemas comunes

### "No se pudo preparar MySQL: ..."
- Verifica `MYSQL_URL` (contraseña URL-encodeada, puerto 4000, base existente).
- TiDB Cloud Serverless duerme; el primer arranque tarda ~10-20s. El backend reintenta automáticamente (5 intentos).

### "CORS bloqueado" en el navegador
- Falta `ALLOWED_ORIGINS` en el backend con la URL exacta del frontend (sin barra final).

### El frontend no conecta al backend
- Falta `VITE_API_URL` en el frontend, o se puso después del build (Render necesita rebuild).

### Admin no puede iniciar sesión
- El admin se crea solo la primera vez. Si cambiaste `ADMIN_PASSWORD` después, borra el registro en TiDB:
  ```sql
  DELETE FROM accounts WHERE email = 'tu_admin@correo.com';
  ```
  y redespliega el backend.

### Cambiar contraseña de TiDB
- En TiDB Cloud → cluster → Connect/Settings → Reset Password.
- Actualiza `MYSQL_URL` en Render y redespliega.

---

## Resumen de archivos relevantes
- `render.yaml` — definición de los 2 servicios (sin Docker).
- `server/src/config.js` — lee variables de entorno.
- `server/src/index.js` — arranque, migraciones, reintentos de BD.
- `frontend/.env.example` — documenta `VITE_API_URL`.
- `Dockerfile` — opcional, solo si usas Docker en otro proveedor (Fly.io, etc.).
