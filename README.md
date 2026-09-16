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
- Registro e inicio de sesión de clientes mediante correo y contraseña.
- El cliente puede crear solicitudes y consultar sus reparaciones después de iniciar sesión.
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
- `src/services/repairStorage.js`: persistencia actual de órdenes; se puede reemplazar por una API sin cambiar la pantalla.
- `src/services/accountStorage.js`: cuentas locales de clientes para el prototipo.
- `src/index.css`: estilos de la primera versión.
- `src/components/modals/`: confirmaciones y constancias de órdenes.

## Proximo paso

Esta versión no tiene backend ni base de datos. Las cuentas, fotos, firmas y
órdenes se guardan temporalmente en `localStorage`; las contraseñas se guardan
como hash, pero el almacenamiento local no es una frontera de seguridad. Para
producción se debe conectar una API, agregar autenticación de servidor,
verificación de correo, almacenamiento privado de archivos y generar una
constancia con fecha y condiciones revisadas legalmente.

## Acceso de demostración local

- Cliente: debe crear una cuenta con correo y contraseña.
- Administrador: usuario `jefe`, contraseña `jefe123`, únicamente con `npm run dev`.

El acceso administrativo demo se desactiva en el build de producción para no
publicar esas credenciales en el bundle. Esto no reemplaza autenticación real:
antes de desplegar la aplicación se necesita un backend con sesiones seguras,
autorización por orden y almacenamiento privado.

## Uso rápido

1. Entra en `frontend` y ejecuta `npm install`.
2. Ejecuta `npm run dev`.
3. Abre la dirección que muestre Vite.
4. Crea una cuenta de cliente e inicia sesión.
5. Completa la solicitud y guarda el código generado.
6. Desde el panel del administrador puedes cambiar el estado y agregar las fotos de recepción.
7. El cliente puede consultar sus órdenes con el código generado.

Los datos se conservan únicamente en el navegador actual. Borrar los datos del sitio elimina las órdenes guardadas.
