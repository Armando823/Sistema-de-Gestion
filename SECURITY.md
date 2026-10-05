# Política de seguridad

## Versiones compatibles

| Versión | Estado |
| ------- | ------ |
| 0.1.x | En desarrollo; sin compromiso de soporte de seguridad |

El proyecto todavía está en desarrollo. No se recomienda para operar un taller
con datos reales ni para exponer la aplicación de escritorio a usuarios no
confiables.

## Alcance y limitaciones

La aplicación de escritorio conserva órdenes y cuentas en SQLite local. La web
desplegada puede usar la API Node y PostgreSQL compartidos, con sesiones firmadas
y autorización por rol y propiedad de las órdenes; el modo de desarrollo sin
`VITE_API_URL` sigue usando `localStorage`. Electron no sincroniza ni migra datos
a PostgreSQL. Las contraseñas locales de cliente usan PBKDF2 y sal aleatoria; el
servidor web usa scrypt y sal aleatoria.

El despliegue web y sus controles aún requieren validación operativa antes de
usarse con datos reales. Protege las variables del servidor, configura
`ALLOWED_ORIGINS` y usa PostgreSQL administrado con TLS. No publiques claves,
contraseñas ni tokens en el repositorio. Consulta el README y `server/README.md`
para las limitaciones y configuración.

## Reportar una vulnerabilidad

Usa **Report a vulnerability** en la pestaña **Security** del repositorio para
enviar un aviso privado. Si esa opción no está disponible, contacta al mantenedor
por un canal privado antes de divulgar los detalles. No abras un issue público
con información explotable.

Incluye los pasos para reproducir el problema, su impacto y, si la conoces, una
posible mitigación. Usa únicamente datos de prueba y no incluyas contraseñas,
tokens ni datos personales reales.
