# Política de seguridad

## Versiones compatibles

| Versión | Estado |
| ------- | ------ |
| 0.1.x | En desarrollo; sin compromiso de soporte de seguridad |

El proyecto todavía está en desarrollo. No se recomienda para operar un taller
con datos reales ni para exponer la aplicación de escritorio a usuarios no
confiables.

## Alcance y limitaciones

La aplicación de escritorio guarda órdenes y cuentas localmente en SQLite; la
versión web de desarrollo usa `localStorage`. El administrador y los clientes
inician sesión localmente, pero las cuentas y órdenes no se sincronizan entre
instalaciones. Las contraseñas del administrador se protegen con scrypt y sal
aleatoria; las de clientes, con PBKDF2 y sal aleatoria. Esto no proporciona
autenticación centralizada ni autorización para un servicio multiusuario. El
acceso de prueba del administrador solo existe en el servidor de desarrollo web
y no se incluye en las compilaciones de producción.

No guardes información sensible ni uses esta aplicación como sistema
multiusuario en producción. Para ese uso se necesita un backend con autenticación,
autorización y almacenamiento compartido. Consulta el README para más detalles
sobre el estado actual y las limitaciones.

## Reportar una vulnerabilidad

Usa **Report a vulnerability** en la pestaña **Security** del repositorio para
enviar un aviso privado. Si esa opción no está disponible, contacta al mantenedor
por un canal privado antes de divulgar los detalles. No abras un issue público
con información explotable.

Incluye los pasos para reproducir el problema, su impacto y, si la conoces, una
posible mitigación. Usa únicamente datos de prueba y no incluyas contraseñas,
tokens ni datos personales reales.
