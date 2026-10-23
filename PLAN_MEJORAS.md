# Plan de mejora integral del sistema

## Objetivo

Mejorar la corrección funcional, seguridad, mantenibilidad y operación del sistema sin reescribirlo por moda ni cambiar las decisiones confirmadas: aplicación web centralizada, API Node.js y MySQL como única persistencia. Mantener las funciones existentes y hacer los cambios gradualmente, con pruebas que demuestren que cada etapa conserva los flujos válidos.

## Diagnóstico inicial

- `frontend/src/App.jsx` sigue coordinando autenticación, sesión, órdenes, sincronización, importación, notificaciones y constancias; `AdminView.jsx` también combina navegación, inventario, clientes, reportes y ajustes.
- `frontend/src/index.css` concentra estilos de múltiples versiones y superficies en una hoja extensa, con reglas repetidas y difíciles de modificar con confianza.
- La lista de clientes se deriva de las órdenes existentes; las garantías ahora se guardan en MySQL, aunque todavía no existe una entidad independiente para clientes sin órdenes.
- Las órdenes ya no se guardan como una lista global: se crean y actualizan mediante operaciones específicas, con versión para rechazar cambios obsoletos. El cliente consulta cada tres segundos, pero usa ETag y no descarga la lista si la revisión no cambió.
- El inventario ya no reemplaza la lista completa: cada alta, edición, eliminación y movimiento de stock tiene una operación acotada; los cambios de stock se serializan en MySQL y rechazan saldos negativos.
- `server/src/app.js` conserva composición HTTP, autenticación de sesión y utilidades compartidas; los handlers de autenticación, órdenes, administración, ajustes y notificaciones están separados bajo `server/src/routes/`.
- El esquema se evoluciona con migraciones SQL versionadas ejecutadas explícitamente; el inicio normal de la API no aplica cambios de esquema.
- Hay pruebas unitarias/de servidor y pruebas de integración MySQL; todavía no hay pruebas automatizadas de componentes ni flujos de navegador.
- Las fotos y firmas se mantienen como cadenas base64 en el flujo de órdenes; su costo de almacenamiento, transferencia y escritura debe medirse antes de decidir cómo optimizarlas, sin introducir otro almacén de persistencia.

## Plan por etapas

### 0. Establecer línea base y contratos

- Documentar los flujos y permisos actuales: administración, cliente por correo, cliente por WhatsApp, creación/seguimiento de órdenes, cambios de estado, inventario, ajustes, fotos, firmas y constancias.
- Registrar los contratos existentes de API, esquema MySQL, datos exportados y configuraciones de despliegue.
- Medir tamaño y responsabilidades de los módulos, consultas SQL principales, tiempos de respuesta y volumen/tamaño típico de fotos.
- Añadir pruebas de caracterización para los flujos existentes antes de mover código. Las pruebas deben detectar cambios de permisos, privacidad y datos.

**Salida verificable:** inventario de endpoints, matriz rol-operación, línea base de build/pruebas y casos que describan el comportamiento que se preserva.

### 1. Corregir integridad funcional y concurrencia (prioridad máxima)

- [x] Derivar clientes de órdenes existentes y persistir garantías en MySQL mediante endpoints restringidos a administración.
- [x] Sustituir cambios locales de garantía por operaciones servidoras y notificar fallos sin presentar un éxito falso.
- [x] Cambiar la escritura de órdenes a operaciones explícitas de creación/actualización; versionar cambios de estado y fotos para rechazar actualizaciones obsoletas.
- [x] Registrar historial de cambios de estado con actor y fecha.
- [x] Sustituir reemplazos globales de inventario por altas, ediciones, eliminaciones y movimientos transaccionales; serializar el stock y rechazar cantidades negativas.
- [x] Registrar un historial de movimientos de inventario para auditoría.
- [x] Revisar importación/exportación: validar campos permitidos en servidor, restringir restauración a administración, reportar duplicados y advertir que los respaldos completos contienen datos personales y medios.

**Salida verificable:** dos sesiones concurrentes no se pisan; clientes y garantías reflejan datos persistidos; los movimientos de inventario sobreviven recargas y no producen stock negativo; hay pruebas de permisos y rollback.

### 2. Endurecer contratos y estructura de la API

- [x] Separar `server/src/app.js` por rutas/dominios (autenticación, órdenes, clientes, inventario, ajustes y notificaciones), conservando una única composición de aplicación. Los handlers viven en `server/src/routes/auth.js`, `server/src/routes/repairs.js`, `server/src/routes/admin.js`, `server/src/routes/settings.js` y `server/src/routes/notifications.js`; las garantías de clientes se mantienen en el módulo administrativo existente.
- [x] Compartir validación de paginación por cursor entre historiales de órdenes e inventario (`server/src/validation.js`); continúan pendientes otros validadores comunes, conservando errores HTTP específicos por ruta.
- Definir explícitamente autorización por rol y propiedad para cada operación, especialmente lectura de fotos/constancias, cambios de estado, importación, inventario y ajustes.
- Normalizar fechas, zonas horarias, moneda y formatos de teléfono en límites claros de la API y la base.
- Añadir límites paginados/filtros en las listas si las mediciones muestran que el volumen esperado lo requiere; evitar devolver imágenes base64 en consultas que no las necesitan.
- Mantener validación estricta de contenido de imagen y límites del lado servidor, además de la validación del navegador.

**Salida verificable:** contratos documentados y pruebas de esquema, errores, permisos por rol, validación y límites en cada ruta.

### 3. Evolucionar MySQL con seguridad

- [x] Introducir migraciones SQL versionadas, ejecutadas explícitamente durante despliegue, y dejar la inicialización normal del servidor libre de cambios de esquema implícitos.
- Revisar el modelo de órdenes, cuentas, clientes, historial, garantías e inventario; usar columnas tipadas para datos consultables y reservar JSON para atributos realmente flexibles.
- Definir claves foráneas, restricciones, índices y reglas de eliminación según el ciclo de vida y la privacidad de los registros.
- Asegurar transacciones y restricciones frente a carreras para códigos únicos, propiedad de órdenes y cantidades de inventario.
- Evaluar fotos/firmas con medidas reales. Como MySQL debe seguir siendo la única persistencia, considerar almacenamiento binario en tablas relacionadas, compresión/redimensionamiento antes de persistir y carga diferida; escoger solo tras medir tamaño, latencia y costo.
- Ampliar la suite MySQL para migraciones desde esquema vacío y versiones anteriores, consistencia, transacciones y operaciones concurrentes.

**Salida verificable:** una base nueva y una base en cada versión soportada llegan al mismo esquema; restauración/integración repetible; índices y planes de consulta revisados para los casos principales.

### 4. Modularizar el frontend por flujos

- Convertir `App.jsx` en una composición de sesión, rutas/pantallas y servicios; sacar de él la lógica de persistencia, sincronización, importación y constancias.
- [x] Extraer el formato versionado y la validación de respaldos de órdenes a `frontend/src/utils/repairBackup.js`; la coordinación de importación/exportación permanece en `App.jsx`.
- Dividir `AdminView.jsx` en pantallas de dashboard, órdenes, inventario, clientes, reportes y ajustes, con componentes presentacionales y hooks pequeños para cada dominio.
- Centralizar estados de carga, vacío, error, confirmación y guardado; evitar falsos mensajes de éxito y cambios optimistas sin recuperación ante fallo.
- [x] Reemplazar la transferencia de la lista completa cada tres segundos por consultas condicionales con ETag y una revisión transaccional de órdenes; evaluar eventos en tiempo real solo si el uso lo justifica.
- Separar CSS por componentes o dominios, eliminar reglas duplicadas y tokens sin uso, y conservar responsive, accesibilidad y modo oscuro.
- Definir una guía visual y una capa pequeña de componentes reutilizables (botones, campos, paneles, diálogos, etiquetas de estado), sin añadir una librería pesada si no aporta valor.

**Salida verificable:** módulos enfocados, navegación accesible por teclado, vistas utilizables en móvil y estados de error/carga cubiertos por pruebas.

### 5. Mejorar autenticación y postura de seguridad

- Revisar almacenamiento del token actual en `sessionStorage`; preferir cookie `HttpOnly`, `Secure`, `SameSite` con protección CSRF si el despliegue puede servir web y API desde el mismo sitio. Documentar la opción si se mantienen orígenes separados.
- Añadir una política CSP y cabeceras de seguridad compatibles con Vite/producción, sin permitir scripts inline inseguros.
- Evaluar límites de acceso distribuidos cuando se ejecuten varias instancias; los limitadores en memoria no comparten estado entre procesos.
- Revisar expiración, rotación e invalidación de sesiones, bloqueo de códigos OTP, uso de secretos, CORS y privacidad de logs.
- Añadir pruebas de abuso de límites, expiración/reutilización de OTP, CSRF (si aplica), XSS, acceso cruzado entre clientes e importación de contenido hostil.
- Corregir vulnerabilidades de dependencias con actualizaciones compatibles y revisión de lockfiles.

**Salida verificable:** lista de controles y amenazas revisada; pruebas negativas pasan; análisis de dependencias y CodeQL limpios para código nuevo.

### 6. Calidad automatizada y cobertura de flujos

- Añadir ESLint y formato consistente con configuración mínima y aplicarlos en CI.
- Añadir pruebas de componentes para formularios, login, listas, confirmaciones, manejo de errores y validaciones visuales relevantes.
- Añadir pruebas end-to-end de navegador para los caminos críticos: iniciar sesión, crear orden, consultar como propietario, cambiar estado como administración, cargar fotos, emitir constancia y actualizar inventario.
- [x] Mantener pruebas de integración reales con MySQL 8 en CI; el workflow levanta MySQL 8 y ejecuta migraciones y pruebas de integración.
- Publicar cobertura como tendencia y aumentar umbrales gradualmente desde la línea base, sin reducir cobertura ni deshabilitar pruebas para hacer pasar CI.
- Añadir pruebas de accesibilidad automatizadas y comprobaciones de build para configuración de producción.

**Salida verificable:** CI ejecuta lint, pruebas unitarias, integración MySQL, E2E de flujos principales y build de producción; fallos muestran diagnóstico útil.

### 7. Preparar operación y recuperación

- [x] Añadir cierre ordenado de HTTP y pool MySQL y tiempos de espera; el manejo de dependencias externas y los límites de conexiones siguen requiriendo revisión operativa.
- Usar logs estructurados con identificador de solicitud, sin registrar contraseñas, códigos OTP, tokens, firmas ni datos personales innecesarios.
- [x] Separar liveness de readiness: `/health` comprueba el proceso y `/ready` comprueba MySQL sin exponer detalles.
- [x] Documentar despliegue reproducible, configuración de secretos y migraciones en `server/README.md`.
- Documentar y probar un procedimiento de copia de seguridad y restauración de la base MySQL; el respaldo administrativo de órdenes no sustituye el respaldo completo de la base.
- Establecer métricas mínimas para errores, latencia, base de datos, correos/WhatsApp y tamaño de medios, conservando la decisión de no incorporar servicios adicionales de persistencia.

**Salida verificable:** procedimiento de despliegue y recuperación ensayado; servicio se apaga limpiamente; logs permiten diagnosticar errores sin filtrar secretos.

## Orden recomendado

1. Línea base y pruebas de caracterización.
2. Persistencia de clientes/garantías, operaciones atómicas y control de concurrencia.
3. Migraciones de esquema y contratos de API.
4. Modularización frontend y estados de carga/error.
5. Controles de sesión, CSP y límites compartidos.
6. Pruebas E2E, lint/formato y accesibilidad.
7. Rendimiento medido, operación, backups y documentación.

**Avance:** se completaron la persistencia de garantías, las mutaciones versionadas de órdenes, las operaciones atómicas de inventario, las migraciones explícitas, el historial transaccional de estados y movimientos de inventario, la validación/restauración administrativa de respaldos y la sincronización condicional de órdenes. También están completadas la modularización de rutas API, la validación compartida de cursores, las pruebas de integración MySQL en CI, el cierre ordenado del servidor y la separación de liveness/readiness. En el frontend comenzó la extracción del contrato de respaldos; siguen pendientes el resto de la modularización, revisar el esquema completo, completar controles de seguridad, pruebas de componentes/E2E y documentar/probar la recuperación de MySQL.

Cada etapa debe ser un conjunto pequeño de cambios revisables. No cambiar simultáneamente el modelo de datos, autenticación y toda la UI; desplegar cada paso tras sus pruebas para reducir riesgo y facilitar reversión.

## Criterios globales de terminado

- Ninguna pantalla de gestión presenta datos ficticios o cambios que se pierden al recargar.
- Las operaciones concurrentes no sobrescriben silenciosamente información de otra sesión.
- La API aplica permisos del lado servidor y tiene pruebas positivas y negativas por rol.
- La creación del esquema y sus actualizaciones están versionadas y se prueban contra MySQL 8.
- Build, lint, pruebas unitarias, integración y flujos E2E críticos pasan en CI.
- No se introducen errores de accesibilidad o regresiones responsive en los flujos principales.
- No quedan alertas de seguridad nuevas de severidad alta/crítica sin resolver.
- El despliegue, respaldo y restauración están documentados y probados.
