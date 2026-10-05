# Sistema de Gestion 0.1

MVP de un sistema para talleres de reparacion de laptops y otros equipos.

## Ejecutar

```bash
npm install
npm start
```

Esto compila el frontend y abre la aplicación de escritorio con Electron.

## Dos versiones: administrador y cliente

La app se compila en dos modos, así cada PC muestra solo lo que le corresponde:

| Modo | Qué muestra | Instalador |
| --- | --- | --- |
| `admin` | Solo el panel del jefe (abre directo en el login administrativo) | `npm run dist:admin` -> `release/admin/Taller-Digital-Admin-Setup-0.1.0.exe` |
| `client` | Solo el portal de clientes (sin acceso ni credenciales de administrador) | `npm run dist:client` -> `release/client/Taller-Digital-Setup-0.1.0.exe` |

Para probar sin instalador: `npm run start:admin` o `npm run start:client`.
En desarrollo web: `npm run dev:admin`, `npm run dev:client` o `npm run dev`
(este último muestra ambos, solo para desarrollo). Si un build de producción no
indica modo, usa `client` por seguridad. El modo se define en
`frontend/.env.admin` y `frontend/.env.client`.

Al instalar, la base de datos se crea automáticamente en la carpeta de datos
del usuario de Windows.

Para ejecutar solo la versión web durante el desarrollo:

```bash
cd frontend
npm install
npm run dev
```

## Funciones actuales

- Panel de administrador para crear ordenes de reparacion.
- Busqueda por codigo, cliente o equipo.
- Actualizacion del estado de cada orden.
- En la web desplegada, los clientes ingresan con el celular verificado por un
  código temporal de WhatsApp; Electron conserva el acceso local con correo y
  contraseña.
- El cliente puede crear solicitudes y consultar sus reparaciones después de iniciar sesión.
- El administrador gestiona las solicitudes y agrega las fotos de recepción desde el panel.
- Persistencia local en SQLite desde Electron.
- Validación básica del alta de órdenes.
- Generación de códigos consecutivos para nuevas órdenes.
- El rol técnico está desactivado temporalmente; se habilitará en una versión posterior.
- Registro de hasta 3 fotos comprimidas del equipo al recibirlo.
- Firma dibujada y aceptación de una constancia de revisión.
- Limpieza del formulario y de la búsqueda.
- Confirmación antes de cambiar estados o eliminar órdenes.
- Constancia imprimible o descargable en formato HTML.
- Estados identificados visualmente por color.
- Límite de 3 imágenes de máximo 5 MB cada una.

## Estructura inicial

- `src/App.jsx`: flujo principal y navegación del MVP.
- `src/data/repairData.js`: estados y datos iniciales; aquí se podrán añadir catálogos.
- `main.js`: ventana de Electron, esquema SQLite y canales IPC.
- `preload.js`: puente seguro entre el renderer y Electron.
- `frontend/src/services/dbService.js`: API asíncrona de persistencia para SQLite y fallback web.
- `frontend/src/services/repairStorage.js`: validación y persistencia de órdenes.
- `frontend/src/services/accountStorage.js`: cuentas y sesiones de clientes.
- `src/index.css`: estilos de la primera versión.
- `src/components/modals/`: confirmaciones y constancias de órdenes.

## Datos locales

Electron crea automáticamente `taller-digital.db` en `app.getPath("userData")`.
La base contiene las tablas `accounts`, `sessions`, `settings`, `inventory` y
`repairs`. El renderer no tiene acceso directo al sistema de archivos ni a
SQLite: todas las operaciones pasan por `preload.js` y canales IPC.

Al ejecutar Vite directamente, `dbService.js` conserva un fallback en el
navegador para facilitar el desarrollo. Para cuentas y datos compartidos en una
web desplegada, configura `VITE_API_URL` y consulta
[`server/README.md`](server/README.md): se necesitan PostgreSQL, el Web Service
de la API y un Static Site para React. El primer administrador se inicializa
mediante variables privadas del servidor.

## Acceso y contraseñas

- **Administrador (jefe):** la primera vez que se abre la versión `admin`, la app
  pide crear la contraseña (usuario `admin`, mínimo 8 caracteres). Se guarda
  cifrada con scrypt y sal aleatoria en la base de datos local; no hay
  credenciales escritas en el código ni en los instaladores.
- Tras 5 intentos fallidos el acceso se bloquea 30 segundos.
- Solo con `npm run dev` (navegador, sin Electron) existe un acceso de prueba
  `admin` / `Admin123`; Vite lo elimina de todas las compilaciones de producción.

**Si el jefe olvida su contraseña:** cierra la app y borra la fila
`admin_credential` de la tabla `settings` en `taller-digital.db` (carpeta de
datos de la app en `%APPDATA%`), por ejemplo con
`sqlite3 taller-digital.db "DELETE FROM settings WHERE key='admin_credential';"`.
Al abrir otra vez pedirá crear una contraseña nueva; las órdenes no se pierden.

- **Cliente en Electron:** se registra con correo y contraseña; las nuevas
  contraseñas se almacenan con PBKDF2 y sal aleatoria; las cuentas anteriores
  con SHA-256 se actualizan al iniciar sesión.
- **Cliente web:** ingresa con su celular en formato internacional y confirma el
  código de seis dígitos que se envía a su WhatsApp. Requiere configurar Meta
  WhatsApp Cloud API y aprobar las plantillas descritas en
  [`server/README.md`](server/README.md).
- En Electron, la sesión de cliente se conserva solo mientras la ventana está
  abierta. En la web, el servidor emite sesiones firmadas con duración de 12 horas.

Electron mantiene cuentas y datos locales a cada instalación; sus bases SQLite
no se sincronizan ni se migran automáticamente a PostgreSQL. En la web
desplegada, PostgreSQL comparte la información y el servidor limita el acceso
por rol y propiedad de las órdenes. El modo web de desarrollo sin
`VITE_API_URL` conserva `localStorage` local.

Consulta [`SECURITY.md`](SECURITY.md) para las limitaciones de seguridad y cómo
reportar una vulnerabilidad.

## Privacidad de las órdenes

Un cliente web solo ve órdenes asociadas a su cuenta o al celular que verificó
por WhatsApp. La consulta pública de una orden aún no asociada exige el código
**y** el teléfono registrado, para impedir que se vean órdenes ajenas probando
códigos consecutivos.

## Notificaciones de órdenes

En la web, el cliente se identifica con su celular verificado. Al guardar una
solicitud, el sistema envía su código de reparación por WhatsApp; también puede
reenviarlo desde "Consulta tu reparación". Antes de crearla, el cliente debe
autorizar explícitamente esos mensajes por WhatsApp; esta autorización se guarda
con la orden. Si WhatsApp falla, la orden queda guardada y el sitio muestra el
error. El correo de constancia continúa disponible si el cliente agrega un correo
al formulario y en la versión Electron.

El envío lo hace un servicio aparte, en la carpeta `server/` (la app no guarda
contraseñas de correo). Instrucciones de instalación, configuración y despliegue en
[`server/README.md`](server/README.md).

## Pruebas

```bash
npm test
```

Verifican la contraseña del administrador (hash con sal, bloqueo por intentos,
imposibilidad de redefinir la contraseña) y las reglas de privacidad de las
órdenes. En GitHub se ejecutan solas (con la compilación de ambas versiones) en
cada push mediante `.github/workflows/ci.yml`.

## Uso rápido

1. Entra en `frontend` y ejecuta `npm install`.
2. Ejecuta `npm run dev`.
3. Abre la dirección que muestre Vite.
4. Crea una cuenta de cliente e inicia sesión.
5. Completa la solicitud y guarda el código generado.
6. Desde el panel del administrador puedes cambiar el estado y agregar las fotos de recepción.
7. El cliente puede consultar sus órdenes con el código generado.

En el modo web de desarrollo, los datos se guardan en el `localStorage` del
navegador actual. La aplicación de escritorio Electron usa SQLite local en la
carpeta de datos del usuario. Ninguno de los dos modos sincroniza información con
otros equipos; borrar los datos del sitio elimina los datos web guardados.
