# Política de seguridad

## Versiones compatibles

| Versión | Estado |
| --- | --- |
| 0.1.x | En desarrollo; sin compromiso de soporte de seguridad |

El sistema está en desarrollo y no se recomienda operarlo con datos reales sin
revisar la configuración del servidor, MySQL, HTTPS, correo y WhatsApp.

## Alcance y limitaciones

La aplicación web usa una API Node.js y una base MySQL central. No hay una base
SQLite de escritorio ni sincronización entre bases de datos. Las contraseñas se
almacenan con scrypt y sal aleatoria; el API firma las sesiones y verifica el rol
y la propiedad antes de permitir acceso a órdenes.

Configura `MYSQL_URL`, `SESSION_SECRET` y las credenciales iniciales del
administrador únicamente en el servidor. Usa TLS en producción, restringe los
orígenes web y protege las credenciales de MySQL, SMTP y Meta WhatsApp. Consulta
`README.md` y `server/README.md` para los límites de despliegue y pruebas.

## Reportar una vulnerabilidad

Usa **Report a vulnerability** en la pestaña **Security** del repositorio para
enviar un aviso privado. Si esa opción no está disponible, contacta al
mantenedor por un canal privado antes de divulgar los detalles. No abras un
issue público con información explotable.

Incluye los pasos para reproducir el problema, su impacto y, si la conoces, una
posible mitigación. Usa únicamente datos de prueba y no incluyas contraseñas,
tokens ni datos personales reales.
