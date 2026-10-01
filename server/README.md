# Servicio de notificaciones (correo de la constancia)

Cuando el cliente firma y envía su solicitud, la app le manda por correo la
constancia con todo lo que necesita saber: código de la orden, datos del equipo,
estado, cómo consultarla, datos de contacto del taller, la firma y la constancia
adjunta.

**Por qué es un servidor aparte:** la app de escritorio no puede enviar correos
por sí sola con seguridad. Hacerlo exige una contraseña SMTP, y esa contraseña
quedaría dentro del instalador, a la vista de cualquiera. Así la contraseña vive
solo en el servidor y la app únicamente le pide: "envía esta constancia".

```
App cliente (Electron) --https--> Servidor de notificaciones --SMTP--> Correo del cliente
```

Solo usa Node.js 20+ y una dependencia (`nodemailer`).

## Probarlo en tu PC (sin enviar correos reales)

```bash
cd server
npm install
cp .env.example .env     # en Windows: copy .env.example .env
```

En `.env` pon `NODE_ENV=development`, `MAIL_DRY_RUN=true` y deja `NOTIFY_API_KEY`
con cualquier texto. Luego:

```bash
npm run dev
curl http://localhost:3001/health        # {"status":"ok"}
```

Con `MAIL_DRY_RUN=true` el servidor registra el envío en el log sin mandar nada.
Para enviar correos de verdad, pon `MAIL_DRY_RUN=false` y completa `MAIL_FROM` y
las variables `SMTP_*`.

Para que la app de escritorio lo use en esa misma PC:

```bash
# Windows (PowerShell)
$env:NOTIFY_URL="http://localhost:3001"; $env:NOTIFY_API_KEY="la-clave"; npm start
```

## Configuración (variables de entorno)

| Variable | Para qué sirve |
| --- | --- |
| `NOTIFY_API_KEY` | Clave que deben presentar las apps. **Obligatoria en producción** (mín. 16 caracteres). |
| `MAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | Cuenta de correo que envía. Puerto 587 con `SMTP_SECURE=false`, o 465 con `true`. |
| `BUSINESS_*` | Nombre, teléfono, correo, dirección, horario y tiempo de respuesta que salen en el correo. |
| `TRUST_PROXY` | `true` solo si hay nginx/Caddy delante; así los límites por IP usan la IP real. |
| `RATE_LIMIT_IP_PER_HOUR` / `RATE_LIMIT_EMAIL_PER_HOUR` | Límites anti-abuso (30 y 5 por defecto). |
| `ALLOWED_ORIGINS` | Solo para la versión web; la app Electron no lo necesita. |
| `MAIL_DRY_RUN` | `true` = no envía, solo registra. |

## Ponerlo en un servidor

Necesitas un servidor (VPS, Render, Railway, Fly.io...) y un dominio con https.

**Opción A: Docker**

```bash
cd server
npm install                  # genera package-lock.json; súbelo a Git
cp .env.example .env         # y complétalo
docker compose up -d --build
```

**Opción B: PM2 en un VPS**

```bash
cd server && npm install --omit=dev
cp .env.example .env         # y complétalo
npm i -g pm2
pm2 start ecosystem.config.cjs && pm2 save && pm2 startup
```

En ambos casos el servicio escucha en el puerto 3001 y **debe ir detrás de https**
(la clave viaja en cada petición). Ejemplo con nginx:

```nginx
server {
  server_name correo.tudominio.com;
  listen 443 ssl;        # certificado con certbot / Let's Encrypt
  client_max_body_size 4m;
  location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header X-Forwarded-For $remote_addr;
  }
}
```

Con nginx delante, deja `TRUST_PROXY=true`. `GET /health` sirve para monitoreo.

## Conectar las apps de escritorio

Cada PC con la app **cliente** (y la de administrador, si quiere reenviar) necesita
saber dónde está el servidor. Crea un archivo `server-config.json` en la carpeta de
datos de la app (la misma donde está `taller-digital.db`):

```json
{ "notifyUrl": "https://correo.tudominio.com", "notifyApiKey": "LA-CLAVE-DEL-SERVIDOR" }
```

También funcionan las variables de entorno `NOTIFY_URL` y `NOTIFY_API_KEY`. La app
rechaza direcciones `http://` que no sean de la misma PC. Si no hay configuración, el
cliente igual puede crear su orden; solo verá un aviso de que no se pudo enviar el correo.

## Qué protege y qué no

- Valida y limita todo lo que recibe (tamaño, formato, firma realmente PNG/JPEG),
  escapa el HTML y envía siempre la misma plantilla: el servicio no sirve para mandar
  textos libres.
- Limita por IP y por destinatario, y reintenta los fallos temporales del SMTP.
- **Límite conocido:** la clave debe estar en cada PC cliente, así que quien tenga
  acceso a una de esas PC puede leerla. Por eso existen los límites por IP y por
  destinatario y la plantilla fija. La solución de fondo es el backend con cuentas y
  sesiones que ya se menciona en el README principal.
- Para que los correos no caigan en spam, envía desde un dominio propio con SPF y
  DKIM (lo configura el proveedor SMTP).

## Pruebas

```bash
npm test      # desde la raíz del proyecto, incluye las de este servicio
```
