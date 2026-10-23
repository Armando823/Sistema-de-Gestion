# Servidor del sistema de gestión

API central Node.js para la aplicación web. Las cuentas, reparaciones, ajustes,
inventario y códigos de acceso viven en MySQL; la API no usa PostgreSQL ni
almacenamiento local. Requiere Node.js 20+ y MySQL 8+.

## Desarrollo local

1. Crea una base MySQL vacía y copia `.env.example` como `.env`.
2. Configura `MYSQL_URL` con el usuario, la contraseña y la base creados. Codifica
   caracteres especiales de la contraseña como URL encoding.
3. Configura `SESSION_SECRET` con al menos 32 caracteres, `ADMIN_EMAIL` y
   `ADMIN_PASSWORD` (mínimo 12 caracteres). `MAIL_DRY_RUN=true` evita requerir
   SMTP durante el desarrollo.
4. Ejecuta:

```bash
npm install
npm run dev
```

La API crea las tablas cuando arranca y crea la cuenta administrativa inicial.
El esquema es nuevo y vacío; no importa datos desde SQLite o PostgreSQL.
`GET /health` verifica que el proceso está activo y `GET /ready` comprueba la
conexión MySQL. Para ejecutar las pruebas:

```bash
npm test
```

Para la integración, define `MYSQL_TEST_URL` con una URL de MySQL local que use
una base terminada en `_test` y ejecuta `npm run test:integration`.

La prueba de integración solo acepta MySQL local y una base cuyo nombre termine
en `_test`; no la apuntes a datos reales.

## Persistencia de órdenes, garantías e inventario

Las órdenes se crean con `POST /api/repairs` y sus cambios administrativos se
envían mediante `PATCH /api/repairs/:id` con la versión leída por el cliente. Si
otra sesión guardó primero, la API responde `409` para evitar sobrescribir su
cambio. La lista de órdenes no admite reemplazo global.

Las garantías se consultan y guardan en `/api/customers/warranties`; las rutas
requieren una sesión administrativa. El inventario también requiere ese rol y se
modifica por elemento:

- `POST /api/inventory` crea un repuesto.
- `PUT /api/inventory/:id` edita sus datos y aplica el delta de stock indicado.
- `DELETE /api/inventory/:id` elimina un repuesto.
- `PATCH /api/inventory/:id/stock` aplica un delta entero a las existencias.

Los movimientos se serializan en MySQL y responden `409` si dejarían existencias
negativas. No se admite reemplazar la colección completa.

## Configuración

| Variable | Uso |
| --- | --- |
| `MYSQL_URL` | URL `mysql://usuario:contraseña@host:3306/base`; obligatoria para iniciar el servidor. |
| `MYSQL_SSL_CA` | CA PEM opcional. En producción se valida siempre el certificado TLS. |
| `SESSION_SECRET` | Secreto de sesiones, mínimo 32 caracteres. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Credenciales para crear el primer administrador. |
| `NOTIFY_API_KEY` | Clave opcional para clientes internos del endpoint de correo. |
| `MAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | Envío de constancias por correo. |
| `MAIL_DRY_RUN` | `true` registra sin enviar correos. |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Credenciales privadas de WhatsApp Cloud API. Deben configurarse juntas. |
| `WHATSAPP_OTP_TEMPLATE`, `WHATSAPP_ORDER_TEMPLATE`, `WHATSAPP_TEMPLATE_LANGUAGE` | Plantillas aprobadas para OTP y códigos de reparación. |
| `ALLOWED_ORIGINS` | Orígenes web permitidos, separados por comas, si la interfaz se aloja en otro dominio. |
| `TRUST_PROXY` | `true` solo detrás de un proxy confiable. |
| `RATE_LIMIT_IP_PER_HOUR`, `RATE_LIMIT_EMAIL_PER_HOUR` | Límites de envío de correo. |
| `BUSINESS_*` | Datos del taller incluidos en las constancias. |

No publiques secretos en el frontend. Las sesiones se firman en el servidor; los
códigos OTP expiran en 10 minutos, se consumen una sola vez y tienen límite de
intentos. La autorización para mensajes de reparación se guarda con cada orden.

## Despliegue

Despliega la API Node.js junto a una instancia MySQL administrada o privada. Define
`MYSQL_URL`, `NODE_ENV=production`, `SESSION_SECRET`, las credenciales iniciales
del administrador, SMTP y WhatsApp si se requieren esas funciones. Cambia
`MAIL_DRY_RUN=false` después de configurar SMTP. `MYSQL_SSL_CA` solo es necesaria
cuando el proveedor exige una CA que Node.js no reconoce.

Para Docker, desde esta carpeta:

```bash
docker compose up -d --build
```

El servicio escucha en el puerto definido por `PORT` (3001 por defecto). Publica
la API detrás de HTTPS y configura `/health` como health check. Si la interfaz web
se publica en un origen distinto, incluye ese origen en `ALLOWED_ORIGINS`.

Los límites antiabuso se guardan en memoria y son por proceso. Mantén una sola
instancia hasta configurar un limitador compartido antes de escalar horizontalmente.
