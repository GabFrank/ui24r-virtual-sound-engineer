# ADR-020 — La aplicación se actualiza a sí misma desde GitHub

**Estado:** Aceptada
**Fecha:** 2026-09-08
**Origen:** decisión de producto. La aplicación no se publica en ninguna tienda.

## Contexto

La aplicación no va a estar en Google Play. Es de uso propio de una banda, sobre una tablet concreta, y publicarla implicaría una ficha de tienda, una política de privacidad y una revisión por cada versión: todo eso para un único dispositivo.

Sin tienda, la única forma de actualizar es copiar el APK a mano. Durante la fase de pruebas eso ocurre varias veces por semana, y cada vez cuesta el tiempo de conectar la tablet, transferir el fichero, buscarlo en el explorador y confirmar el diálogo. Se hace justo cuando hay menos tiempo, que es antes de un ensayo.

Hay además una restricción de Android que condiciona todo lo demás: **el sistema sólo reemplaza una aplicación instalada por otra firmada con la misma clave.** La clave de depuración que genera el entorno de desarrollo es distinta en cada máquina y en cada máquina de integración continua. Sin una clave fija, dos compilaciones cualesquiera quedan firmadas diferente y toda actualización falla con «aplicación no instalada», un mensaje que no dice cuál es el problema.

## Decisión

La aplicación consulta las publicaciones del propio repositorio, descarga el APK de la versión más alta, verifica su suma SHA-256 y lo instala mediante `PackageInstaller`.

Cuatro condiciones acotan el mecanismo:

1. **Nunca durante una sesión activa** ni con una transacción en curso. Actualizar reinicia la aplicación; hacerlo con una transacción a medio aplicar dejaría la consola en un estado que nadie va a revertir. Queda como INV-034.
2. **Sólo versiones estables.** Los borradores y los pre-lanzamientos se descartan, y también las etiquetas con sufijo (`v0.3.0-rc.1`) aunque la casilla de GitHub no esté tildada: esa casilla es manual y se olvida.
3. **Sólo se descarga de servidores de GitHub y sólo por HTTPS.** La lista de servidores está fija en el código, se valida en TypeScript al leer el catálogo y otra vez en Java en cada redirección. El catálogo llega por red y nombra el fichero que se va a instalar: sin este filtro, quien conteste la petición elige qué aplicación se instala.
4. **Un único almacén de claves,** guardado como secreto del repositorio y usado tanto para las compilaciones de depuración como para las de publicación. Es lo que hace que un APK compilado en una máquina y otro publicado por la integración continua puedan reemplazarse entre sí.

La política de cuándo corresponde actualizar vive en `packages/updater`, en TypeScript puro y con tests. El código nativo sólo ejecuta: permiso, descarga, instalación.

## Consecuencias

Se gana poder publicar una versión y tenerla en la tablet en el minuto siguiente, sin cable y sin explorador de ficheros. Durante la fase de pruebas eso es la diferencia entre corregir algo el mismo día o acumularlo para la próxima vez que haya tablet a mano.

Se pierde el reparto por fases y la reversión de la tienda: si una versión sale rota, la corrección es publicar la siguiente. Se acepta porque el parque instalado es de un dispositivo.

Queda un permiso incómodo: `REQUEST_INSTALL_PACKAGES` más el ajuste del sistema «instalar aplicaciones desconocidas», que Android obliga a conceder saliendo a los ajustes. La aplicación lleva al usuario hasta esa pantalla y relee el permiso al volver, porque el resultado que devuelve el sistema es siempre «cancelado» aunque se haya concedido.

Queda también una ceremonia nueva y obligatoria: generar el almacén de claves y cargarlo como secreto **antes** de la primera compilación que se instale en la tablet. Si se salta, la primera actualización falla y la única salida es desinstalar y perder los datos locales.

El instalador elegido es `PackageInstaller` y no el intent clásico de abrir el fichero. Cuesta más código, y a cambio devuelve un motivo cuando falla. El fallo más probable es exactamente el de la firma distinta, y con el intent clásico el usuario sólo vería «aplicación no instalada».

## Alternativas descartadas

**Publicar en Google Play.** Resuelve firma, reparto y reversión de una vez. Se descarta por el costo de ficha, política de privacidad y revisión por versión para un único dispositivo, y porque la demora de revisión anula la ventaja de corregir el mismo día.

**Copiar el APK a mano.** Es lo que se hace hoy. Se descarta porque el costo se paga en el peor momento y porque, sin clave fija, tampoco funciona: el problema de la firma es el mismo con cable que sin cable.

**Un servidor propio con el APK.** Agrega una pieza que hay que mantener y pagar. GitHub ya aloja las publicaciones del repositorio y ya es de donde sale el código.

**`WebView` con actualización sólo del contenido web.** Permitiría cambiar la interfaz sin reinstalar, pero no el código nativo, que es donde va a vivir el motor de audio (ADR-001). Sería una vía que deja de servir justo cuando empieza lo difícil.
