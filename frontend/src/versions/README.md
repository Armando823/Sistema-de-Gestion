# Versiones

La version activa es la `v0.2`. Su punto de entrada reutiliza todo el flujo
estable de `src/App.jsx` e incorpora el acceso de clientes con cuenta local.
Por eso la v0.2 conserva las funciones de la v0.1: alta y consulta de ordenes,
estados, busqueda, fotos, firmas, constancias, importacion, exportacion,
soporte y panel administrativo.
Estas carpetas conservan funcionalidades preparadas para incorporarse por etapas:

- `v0.2`: autenticacion y acceso de usuarios.
- `v0.3`: panel administrativo, inventario y gestion avanzada de ordenes.
- `v0.4`: pagos, notificaciones, seguimiento, documentos y QR.
- `v1.0`: API, servicios de IA y configuracion de infraestructura.

## Funciones de la referencia visual

- `v0.1`: dashboard, ordenes de servicio, estados, busqueda, alta de reparaciones,
  fotos, firma, constancia y consulta del cliente.
- `v0.2`: acceso de administrador, clientes y permisos.
- `v0.3`: inventario inteligente, reportes operativos y gestion avanzada de ordenes.
- `v0.4`: clientes y garantias, pagos, notificaciones, seguimiento y documentos.
- `v1.0`: ajustes de infraestructura, API, automatizaciones e inteligencia artificial.

La entrada activa de `v0.2` es `v0.2/App.jsx`. Las funcionalidades futuras
permanecen separadas hasta que cada versión esté lista para activarse.
