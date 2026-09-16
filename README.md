# Sistema de Gestion 0.1

MVP de un sistema para talleres de reparacion de laptops y otros equipos.

## Ejecutar

```bash
cd frontend
npm install
npm run dev
```

Abre la URL que muestre Vite, normalmente `http://localhost:5173`.

## Funciones actuales

- Panel de administrador para crear ordenes de reparacion.
- Busqueda por codigo, cliente o equipo.
- Actualizacion del estado de cada orden.
- Consulta publica del estado mediante el codigo de la orden.
- El cliente puede crear una solicitud y consultar el estado de su reparación.
- El administrador gestiona las solicitudes y agrega las fotos de recepción desde el panel.
- Persistencia local en el navegador con `localStorage`.
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
- `src/services/repairStorage.js`: persistencia actual; se puede reemplazar por una API sin cambiar la pantalla.
- `src/index.css`: estilos de la primera versión.
- `src/components/modals/`: confirmaciones y constancias de órdenes.

## Proximo paso

Esta versión no tiene usuarios, backend ni base de datos. Las fotos y firmas se guardan temporalmente en `localStorage`, por lo que no es una solución de respaldo ni una garantía legal. Para producción se debe conectar una API, agregar autenticación, almacenamiento privado de archivos y generar una constancia con fecha y condiciones revisadas legalmente.

## Accesos de demostración

- Cliente: acceso público, sin usuario ni contraseña.
- Administrador: usuario `jefe`, contraseña `jefe123`.

El panel administrativo está pensado únicamente para el jefe. Estos accesos funcionan en el frontend para la demostración; para protegerlo realmente en producción se necesita autenticación en un backend.

## Uso rápido

1. Entra en `frontend` y ejecuta `npm install`.
2. Ejecuta `npm run dev`.
3. Abre la dirección que muestre Vite.
4. Desde el acceso de cliente, completa la solicitud, dibuja la firma y acepta la constancia.
5. Desde el panel del administrador puedes cambiar el estado y agregar las fotos de recepción.
6. El cliente puede consultar la orden con el código generado, por ejemplo `REP-1003`.

Los datos se conservan únicamente en el navegador actual. Borrar los datos del sitio elimina las órdenes guardadas.
