# Sistema de gestión

Aplicación web para gestionar reparaciones de laptops y otros equipos. Los
usuarios acceden desde el navegador; el API Node.js y MySQL centralizan las
cuentas, órdenes, ajustes e inventario. No se usa Electron, SQLite ni
almacenamiento local como fuente de datos.

## Funciones

- Acceso del administrador y de clientes; los clientes pueden ingresar por
  correo/contraseña o verificar su celular con un código de WhatsApp.
- Crear solicitudes, buscar órdenes y consultar su estado, respetando el acceso
  del cliente a sus propios registros.
- Registrar hasta tres fotos de recepción, firma y aceptación; generar,
  imprimir o descargar constancias.
- Gestionar inventario y configuración del taller.
- Consultar el historial administrativo de cambios de estado y movimientos de
  inventario.
- Descargar y restaurar respaldos administrativos de órdenes, sin sobrescribir
  registros existentes.
- Enviar constancias por correo y códigos por WhatsApp cuando el servidor tenga
  configuradas esas integraciones y el cliente haya dado su autorización.

## Desarrollo

Requiere Node.js 20+ y una instancia MySQL 8+. Crea una base MySQL vacía y
configura `MYSQL_URL`, `SESSION_SECRET`, `ADMIN_EMAIL` y `ADMIN_PASSWORD` en
`server/.env` (copia `server/.env.example`). Aplica el esquema con las
migraciones antes de iniciar la API; el primer administrador se crea al arrancar.
No se importan datos desde PostgreSQL ni SQLite.

En dos terminales:

```bash
npm --prefix server install
npm --prefix server run migrate:dev
npm --prefix server run dev
```

```bash
npm --prefix frontend install
npm run dev
```

Vite reenvía las solicitudes `/api` al servidor local en `http://localhost:3001`.
Para una compilación estática ejecuta `npm run build`. `npm start` inicia el API;
`npm start` presupone que las migraciones ya se aplicaron. La aplicación web se
sirve desde el hosting web configurado para el proyecto.

Consulta [`server/README.md`](server/README.md) para variables de entorno,
configuración de correo/WhatsApp, Docker y despliegue de MySQL.

## Datos y privacidad

MySQL es la única persistencia de la aplicación. La base nueva empieza vacía y
no se migran automáticamente los registros de la versión anterior. Las sesiones
se validan en el servidor; las órdenes de clientes se asocian a su cuenta o al
celular verificado y no se permiten búsquedas por código solamente.

Revisa [`SECURITY.md`](SECURITY.md) antes de operar con datos reales.

## Pruebas

```bash
npm test
npm --prefix server run test:integration
```

Las pruebas de integración requieren `MYSQL_TEST_URL` apuntando a una base MySQL
local cuyo nombre termine en `_test`. CI inicia MySQL 8 para ejecutar esas pruebas;
el conjunto de migraciones crea y elimina bases temporales con ese sufijo, por lo
que el usuario de prueba necesita permisos `CREATE DATABASE` y `DROP DATABASE`.
