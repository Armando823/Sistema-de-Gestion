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
- El cliente no crea ordenes; solo consulta una orden registrada por el administrador.
- Persistencia local en el navegador con `localStorage`.
- Validación básica del alta de órdenes.
- Generación de códigos consecutivos para nuevas órdenes.
- El rol técnico está desactivado temporalmente; se habilitará en una versión posterior.
- Registro de hasta 3 fotos comprimidas del equipo al recibirlo.
- Firma dibujada y aceptación de una constancia de revisión.

## Estructura inicial

- `src/App.jsx`: flujo principal y navegación del MVP.
- `src/data/repairData.js`: estados y datos iniciales; aquí se podrán añadir catálogos.
- `src/services/repairStorage.js`: persistencia actual; se puede reemplazar por una API sin cambiar la pantalla.
- `src/index.css`: estilos de la primera versión.

## Proximo paso

Esta versión no tiene usuarios, backend ni base de datos. Las fotos y firmas se guardan temporalmente en `localStorage`, por lo que no es una solución de respaldo ni una garantía legal. Para producción se debe conectar una API, agregar autenticación, almacenamiento privado de archivos y generar una constancia con fecha y condiciones revisadas legalmente.
