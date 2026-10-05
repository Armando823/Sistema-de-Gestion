# Servicio de notificaciones (correo de la constancia)

Cuando el cliente firma y envía su solicitud, la app le manda por correo la
constancia con todo lo que necesita saber: código de la orden, datos del equipo,
estado, cómo consultarla, datos de contacto del taller, la firma y la constancia
adjunta.

El servidor proporciona la API de la aplicación web y envía correos. Las
credenciales SMTP y de la base de datos solo viven en el servidor, nunca en el
navegador ni en los instaladores.

```
App web / Electron --https--> API Node.js -- PostgreSQL compartido
                                   |
                    +--------------+--------------+
                    |                             |
                    +--> SMTP --> Correo          +--> Meta Cloud API --> WhatsApp
```

Requiere Node.js 20+, PostgreSQL, Nodemailer y el cliente `pg`.

## Desarrollo local

```bash
cd server
npm install
cp .env.example .env     # en Windows: copy .env.example .env
```

Configura `DATABASE_URL` con una base PostgreSQL de desarrollo, un `SESSION_SECRET`
aleatorio de al menos 32 caracteres y las variables `ADMIN_EMAIL` y
`ADMIN_PASSWORD` (mínimo 12 caracteres) para crear al primer administrador.
Configura `MAIL_DRY_RUN=true` para que las pruebas no envíen correos. Después:

```bash
npm run dev
curl http://localhost:3001/health        # {"status":"ok"}
```

Las cuentas, órdenes, ajustes e inventario web se almacenan en PostgreSQL. La
aplicación Electron sigue usando SQLite local. La creación de cuentas públicas
solo permite el rol de cliente; el administrador se inicializa con las variables
de entorno anteriores.

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
| `WHATSAPP_ACCESS_TOKEN` | Token privado de Meta para WhatsApp Cloud API. |
| `WHATSAPP_PHONE_NUMBER_ID` | ID del número emisor de WhatsApp Business, no el número telefónico. |
| `WHATSAPP_API_VERSION` | Versión de Graph API (por defecto `v22.0`). |
| `WHATSAPP_OTP_TEMPLATE` / `WHATSAPP_ORDER_TEMPLATE` | Nombres exactos de las plantillas aprobadas (por defecto `customer_login_otp` y `repair_order_code`). |
| `WHATSAPP_TEMPLATE_LANGUAGE` | Código de idioma aprobado por Meta (por defecto `es`). |

## Desplegar la web en Render

La publicación usa tres recursos de Render: PostgreSQL, el Web Service de la API
y un Static Site para React. El Web Service que ya aloja `server/` puede seguir
con **Root Directory** `server`.

1. Crea una base **PostgreSQL** en Render. En el Web Service, añade `DATABASE_URL`
   usando la URL interna de esa base.
2. En el Web Service configura `NODE_ENV=production`, `SESSION_SECRET` (aleatorio,
   mínimo 32 caracteres), `ADMIN_EMAIL`, `ADMIN_PASSWORD` (mínimo 12 caracteres),
   y `NOTIFY_API_KEY` (mínimo 16 caracteres). Añade SMTP y pon
   `MAIL_DRY_RUN=false` cuando el proveedor de correo esté configurado.
3. Crea un **Static Site** desde el mismo repositorio, rama `main`, con **Root
   Directory** `frontend`, **Build Command** `npm ci && npm run build:web` y
   **Publish Directory** `dist`.
4. En el Static Site define `VITE_API_URL` con la URL pública del Web Service.
   `VITE_APP_MODE=full` ya está guardado en `.env.web`; si Render solicita
   variables de entorno, también puedes configurarlo explícitamente.
5. Copia la URL pública del Static Site y configúrala como `ALLOWED_ORIGINS` en
   el Web Service. Si luego cambia, actualiza el valor y vuelve a desplegar ambos
   recursos.
6. En Meta Business configura WhatsApp Cloud API y crea/aprueba dos plantillas
   en español: una plantilla **Authentication/OTP** para el código de acceso,
   con botón de copiar código, y una plantilla **Utility** para el código de
   reparación con una variable de texto `{{1}}` en el cuerpo. En el
   Web Service configura `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
   `WHATSAPP_OTP_TEMPLATE`, `WHATSAPP_ORDER_TEMPLATE` y
   `WHATSAPP_TEMPLATE_LANGUAGE`, y vuelve a desplegar el servicio. No pongas el
   token en el Static Site ni en el código fuente.

El cliente inicia sesión con el celular en formato internacional E.164 (por
ejemplo `+573001234567`), autoriza el envío de mensajes de acceso, recibe un
código de seis dígitos por WhatsApp y lo confirma en la web. Los códigos vencen
a los 10 minutos, se consumen una sola vez y tienen intentos limitados. Al crear
una reparación, el cliente debe autorizar por separado los mensajes de esa
reparación; la autorización queda guardada en PostgreSQL. La orden se guarda
antes de enviar su código por WhatsApp; si Meta falla, permanece guardada y el
cliente puede reenviar el código desde su consulta. Las reparaciones antiguas
no se enviarán por WhatsApp hasta que se haya registrado autorización.
Las órdenes antiguas se asocian al iniciar sesión si su teléfono coincide con
el número verificado.

Sin credenciales de Meta y plantillas aprobadas, el servidor puede desplegarse,
pero no podrá enviar códigos ni completar el acceso de clientes web. El acceso
administrativo sigue usando correo y contraseña.

`PORT` lo asigna Render automáticamente. Configura `/health` como **Health Check
Path** del Web Service. El esquema PostgreSQL se crea automáticamente al primer
arranque. El primer administrador se crea una sola vez desde `ADMIN_EMAIL` y
`ADMIN_PASSWORD`; no hay registro público de administradores.

La contraseña `ADMIN_PASSWORD` no se restablece cambiando la variable una vez
creada la cuenta. Para cambiarla se debe añadir un flujo de cambio de contraseña
autenticado antes de operar con cuentas reales.

El modo web almacena datos en la base PostgreSQL compartida; el modo Electron
mantiene sus datos en SQLite locales y **no los sincroniza ni los migra
automáticamente** a PostgreSQL.

## Docker y PM2

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

En Docker y PM2, define igualmente `DATABASE_URL`, `SESSION_SECRET` y las
credenciales iniciales del administrador si quieres habilitar la API compartida.
Si solo se usa el envío de correo con una app Electron, esas variables de base de
datos no aplican. Si no se configura `PORT`, el servicio escucha en el puerto
3001. En todos los casos debe ir detrás de HTTPS.

Ejemplo con nginx:

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
