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
- Registro e inicio de sesión de clientes mediante correo y contraseña.
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
navegador para facilitar el desarrollo web.

## Acceso y contraseñas

- **Cliente:** crea su propia cuenta con correo y contraseña.
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

Esto sigue siendo autenticación local: antes de desplegar el sistema para uso
multiusuario se necesita un backend con sesiones seguras y autorización por orden.

## Privacidad de las órdenes

Un cliente solo ve las órdenes que creó con su cuenta. Para consultar una orden
creada por el taller (sin cuenta asociada) debe escribir el código **y** el
teléfono registrado en la orden, así no se pueden ver órdenes ajenas probando
códigos consecutivos.

## Correo de la constancia al cliente

Al enviar su solicitud, el cliente escribe su correo (se propone el de su cuenta) y
recibe una constancia con el código de la orden, los datos del equipo, cómo
consultarla, el contacto del taller y su firma. Si el correo falla, la orden se
guarda igual y se puede reenviar: el cliente desde "Consulta tu reparación" y el
administrador desde la constancia de la orden.

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

Los datos se conservan únicamente en el navegador actual. Borrar los datos del sitio elimina las órdenes guardadas.
