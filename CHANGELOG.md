# Changelog

Sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y versionado semántico.

## [Sin publicar]

### Agregado
- Estructura de monorepo, integración continua y convenciones de contribución (S-00.1, S-00.5).
- 18 decisiones de arquitectura, de ADR-001 a ADR-018 (S-00.2).
- Charters de los 22 spikes de fase 0 con criterio de aprobación numérico (S-00.3).
- Matriz de capacidades del protocolo, matriz de hardware y registro de riesgos (S-00.4).
- 33 invariantes de seguridad con su test y la versión desde la que aplican (S-00.6).
- Actas de gate en blanco para G-A a G-E, y plantilla de informe de prueba de campo.
- Actualización dentro de la aplicación, sin tienda: consulta las publicaciones
  del repositorio, descarga el APK, verifica su SHA-256 e instala con
  `PackageInstaller` (ADR-020).
- `packages/updater`: comparación de versiones, lectura del catálogo de
  publicaciones y política de cuándo corresponde actualizar. 32 tests.
- Complemento nativo `Actualizador` y plataforma Android de Capacitor, con el
  permiso de instalación, el enlace al ajuste del sistema y la traducción de los
  fallos del instalador a algo legible.
- INV-034: no se actualiza durante una sesión, con una transacción en curso ni
  con la consola conectada.
- Flujo de publicación que compila, firma y adjunta el APK con su suma.
- `docs/actualizacion-en-app.md`: la ceremonia del almacén de claves, que hay
  que hacer **antes** de la primera instalación en la tablet.

### Corregido
- INV-034 quedaba inerte en MVP0: no existiendo todavía el modelo de sesión, la
  pantalla ofrecía actualizar con la consola conectada. Lo encontró una captura
  visual hecha para mostrar lo contrario.
