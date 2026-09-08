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

- Sistema de diseño: fichas de color, espaciado, tipografía y tacto; once
  primitivas de componente; galería viva en la compilación de desarrollo
  (`docs/design-system.md`).
- Interfaz responsiva de verdad en teléfono, optimizada para tablet: tres
  puntos de corte puestos donde el contenido se rompe, no en tamaños de
  dispositivo.

- Enrutador con rutas reales: el gesto de atrás de Android funciona, las
  pantallas de edición reciben qué editan y al reanudar se vuelve donde estaba.
- Persistencia con dos implementaciones del mismo puerto, SQLite en la tablet y
  `localStorage` en el navegador, con la semántica de consulta en `@vse/store`
  y probada.
- Perfiles: altas, ediciones, listas y borrado de bandas, locales y sistemas de
  amplificación, con validación en el dominio.
- Sesión: crear, avanzar según la tabla de transiciones, cerrar y recuperar la
  que hubiera quedado abierta al arrancar.
- Historial de sesiones con detalle de solo lectura y exportación.
- Ajustes: dirección de la consola, conexión, datos y acceso a la actualización.
- `tools/visual/flujo.mjs`: recorre el camino de usuario completo en dos anchos
  y falla si algún paso se atasca (`docs/flujo-de-usuario.md`).

- Telemetría, canales, ganancia y actualización migradas al sistema de diseño,
  con lista de tarjetas en lugar de tabla en pantallas angostas.

### Corregido
- Las cuatro pantallas heredadas llamaban funciones desde la plantilla, que se
  reevalúan en cada ciclo de detección de cambios. En telemetría eran cuarenta
  y ocho llamadas por ciclo, en la pantalla que más ciclos genera. Ahora cada
  una deriva sus filas de una sola señal calculada.
- La asignación de canales usaba una señal `version` incrementada a mano para
  forzar el refresco, en vez de derivar de las asignaciones.
- La compilación de desarrollo no compilaba, y con ella `ng serve` tampoco:
  los mapas de código de scripts hacían que el compilador perdiera `main.ts`.
- El paro de emergencia se montaba sobre el último botón de la pantalla en
  teléfono, dejándolo inalcanzable.
- Todos los avisos efímeros salían en ámbar, incluidos los de éxito: el tono
  «aviso» colisionaba con la clase base del componente.
- La dirección de la consola estaba en dos sitios, con valores por defecto
  distintos y sin validación.
- INV-034 quedaba inerte en MVP0: no existiendo todavía el modelo de sesión, la
  pantalla ofrecía actualizar con la consola conectada. Lo encontró una captura
  visual hecha para mostrar lo contrario.
