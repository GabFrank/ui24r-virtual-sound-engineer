# Changelog

Sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y versionado semántico.

## [Sin publicar]

### Agregado
- **Prueba de conexión dentro de la aplicación** (Ajustes → Prueba de conexión).
  Cronometra la cadencia de los medidores —media, mediana, percentil 95,
  fluctuación y el umbral de inestabilidad de SPK-P0.1— y cada reconexión tras
  un corte de red, y exporta el informe en Markdown o JSON. Se mide desde la
  tablet porque esos dos números son del aparato en esa red, no del protocolo:
  medirlos en una laptop daría los de la laptop.
  **No escribe nada en la consola.** El eco de las escrituras propias queda sin
  medir por eso, y el informe lo dice en vez de callarlo. La cadencia se calcula
  por tramos entre cortes: el hueco de una caída no es cadencia de la consola, y
  contarlo subía la media de 50 a 66 ms en la prueba contra el simulador.

### Agregado
- **Los hallazgos de firmware y el contexto musical, como preguntas y no como
  hechos.** Llegó un documento con capacidades de la consola que el manual base
  no documenta —sidechain entre subgrupos, RTA compartido, pre-delay, canales DSP
  adicionales— y con una propuesta de automatización por canción. Se guarda tal
  como llegó, y sus doce afirmaciones entran en la matriz de capacidades como
  DESCONOCIDO con el spike que las mide (SPK-FW3). Ninguna se implementa hasta
  entonces.
- **ADR-022**: qué canción se está tocando entra por un puerto y se referencia
  por identificador externo, no por una lista de temas propia ni por la pantalla.
  Sin código todavía: se implementa cuando exista su primer usuario real.
- **R-21, R-22 y R-23**: el alcance crecería a automatización de show sin revisar
  la matriz de autonomía; la recuperación de un CUE podría mover la mezcla
  personal de un músico; y las transiciones graduales exigen un ritmo de
  escritura que nadie midió.

## [0.1.1] - 2026-09-08

Primera versión con APK instalable. El contenido es el mismo que describe
0.1.0 —que no llegó a producir fichero—, más lo que sigue.

### Cambiado
- **La versión la deciden los commits.** Cada fusión en `main` pasa por la
  publicación: `semantic-release` lee los commits desde la última etiqueta,
  decide el incremento, compila, firma y publica. Empujar una etiqueta a mano ya
  no publica nada. ADR-021 dice por qué, y qué se pierde con eso.

### Corregido
- **La restauración del almacén de claves.** El secreto estaba bien cargado pero
  traía retornos de carro, y `base64 -d` los rechaza: la publicación de 0.1.0
  murió ahí, después de pasar las seis comprobaciones. Ahora se quitan los
  espacios antes de decodificar, se comprueba que lo decodificado sea un almacén
  y que abra con la contraseña cargada, y cada uno de los tres fallos dice cuál
  fue. Si aun así no es base64, dice cuánto mide, cuántos caracteres se
  salen del alfabeto y si el largo cierra en múltiplo de cuatro: eso distingue
  haber pegado el `.jks` binario de haber copiado solo una parte. Y hace un
  segundo intento ignorando lo que no sea del alfabeto —una marca de orden de
  bytes, unas comillas—, que igual tiene que abrirse como almacén y coincidir
  con la huella del APK.
- **La firma del APK se comprueba contra el almacén, no a ojo.** La corrida
  compara la huella SHA-256 del certificado del APK con la del almacén que
  restauró y se detiene si difieren. Descartar la clave de depuración —lo único
  que hacía antes— dejaba pasar cualquier otra clave equivocada.

## [0.1.0] - 2026-09-08

**No llegó a producir un APK.** La etiqueta existe y la corrida falló al
restaurar el almacén de claves; la primera versión con fichero instalable es la
siguiente. Se deja anotada porque la etiqueta quedó publicada.

Primera versión publicada. **No habla con la consola todavía**: sirve para
cargar bandas, locales y sistemas de amplificación, abrir y cerrar sesiones, y
para dejar funcionando el camino de actualización antes de la fase de pruebas
con hardware. Medir y escribir en la Ui24R depende de los spikes de la puerta
G-A, ninguno de los cuales está cerrado.

### Corregido
- **INV-019**: el paro de emergencia dentro de un diálogo medía 48 px cuando la
  invariante exige 64, y la comprobación que lo cubría estaba calibrada en 44 —
  por debajo de la propia regla.
- **INV-021**: un cambio de la instantánea activa no invalidaba el estado si
  venía con menos de diez parámetros, y la causa probable estaba fija en
  «recuperación de instantánea» también cuando no lo era.
- **INV-034**: la señal de transacción en curso no la ponía nadie en `true`, y
  al conectarla se apagaba antes de tiempo con dos transacciones solapadas.
- **INV-005**: `PACING_MS` no la importaba ningún código de producción, y la
  exención del límite de cuatro parámetros para las transacciones de sistema no
  se podía ni expresar.
- **INV-003**: la retención de veinte instantáneas automáticas existía como un
  número y no la consultaba nadie.
- **INV-001**: `puedeAplicarse` comprobaba que la referencia no fuera nula, que
  es el defecto que la invariante describe.
- El orden de los documentos sin el índice por el que se ordena divergía entre
  SQLite y el navegador; ordenar por `id` funcionaba en uno y no en el otro.
- El fader tenía un salto de 47 dB por debajo de 0,0625, y la ganancia se
  calculaba con una conversión inventada.
- El validador de identificadores comprobaba tres de las ocho familias que
  reconocía; el de plantillas no miraba `@else if`, `@switch` ni `@for`;
  `verificar` no corría los tests de DSP.

### Agregado
- `npm run verificar` y `npm run verificar:commits`: lo mismo que comprueba la
  integración continua, en un comando, antes de empujar.
- `packages/logging`: el registro, el sumidero de consola y uno **persistente**
  sobre el puerto de almacén, así que funciona igual en la tablet y en el
  navegador. Encola y vuelca por lotes, purga por número contando sin traer, y
  no lanza nunca: si el almacén falla, anota el error y sigue. Ajustes lista los
  últimos cien eventos, filtra por avisos y errores, y los copia como
  `events.jsonl`.
- `Cargable` y `Lectura`, con `ui-cargando` y `ui-fallo`: una pantalla que lee
  distingue cargando, error y vacío, en ese orden. El esqueleto solo aparece la
  primera vez; una recarga que falla no vacía lo que ya estaba en pantalla.
- `intentarGuardar()`: escribir en el almacén y fallar ahora se ve. Antes no
  aparecía ni el aviso de éxito ni ningún error, y lo escrito se perdía.
- Aviso antes de salir de una edición con cambios sin guardar
  (`guardaDeSalida`, `ui-salir-sin-guardar`), en las tres pantallas de perfiles.
- Borrado de un sistema de amplificación, con la comprobación de que no lo use
  ningún local.
- `packages/mixer-adapter/src/conversiones.ts`: las cuatro conversiones entre el
  valor crudo y unidades físicas, juntas y marcadas con
  `VERIFICADO_CONTRA_CONSOLA = false`. La interfaz antepone «≈» a lo que sale de
  ellas, y «—» cuando la consola todavía no dijo el valor.
- `releerEstado()`: la relectura que INV-021 exigía y no existía. El estado
  invalidado por una avalancha se quedaba inválido hasta desconectar a mano.
- `contar()` en el puerto de almacén, y el esquema de la base mudado a
  `@vse/store` para poder probar su SQL contra SQLite real.
- Estructura de monorepo, integración continua y convenciones de contribución (S-00.1, S-00.5).
- 18 decisiones de arquitectura, de ADR-001 a ADR-018 (S-00.2).
- Charters de los 22 spikes de fase 0 con criterio de aprobación numérico (S-00.3).
- Matriz de capacidades del protocolo, matriz de hardware y registro de riesgos (S-00.4).
- 33 invariantes de seguridad con su test y la versión desde la que aplican (S-00.6). Hoy son 34: INV-034 se agregó con la actualización dentro de la aplicación.
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

- Sistema de diseño: fichas de color, espaciado, tipografía y tacto; catorce
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

### Agregado
- `npm run validate:limites`: verifica los límites entre paquetes que el
  proyecto declara. Tres sitios afirmaban «hay una regla de lint que lo
  verifica» y no hay ESLint en el repositorio.
- Comprobación de funciones llamadas desde plantillas de Angular.
- Test que **lee la tabla de `docs/channel-profiles.md`** y la compara fila por
  fila con el código. El que había comprobaba ocho valores sueltos de trece
  perfiles y no leía el documento; las dos tablas ya habían divergido en cinco
  celdas.

### Corregido
- Accesibilidad: la navegación perdía el nombre accesible entre 600 y 899 px;
  `ui-field` generaba los identificadores de ayuda y error y no los enlazaba
  nunca; el medidor no exponía valor; las filas del historial no se podían
  navegar con teclado; las pestañas tenían un patrón ARIA a medias; el diálogo
  no tenía nombre accesible; y al cambiar de pantalla el foco no se movía.
- La casilla «en vivo», que decide si una fuente real se sustituye por una
  pista grabada, medía 22 px.
- `ui-stat` se usaba para texto en 28 px monoespaciado y los valores se
  montaban unos sobre otros en la tarjeta de resumen de la sesión.
- Jerga interna en pantalla: códigos de invariante, rutas crudas del protocolo,
  «σ ± 3», markdown sin renderizar y estados del dominio en inglés.
- Estados que se distinguían solo por color, sin refuerzo textual.
- Las últimas seis funciones llamadas desde plantillas.
- La documentación afirmaba cuatro coberturas de test que no existían, el
  README llevaba tres entregas de retraso, y varios documentos citaban rutas y
  cifras que ya no eran ciertas.
- **Las asignaciones de canal vivían en dos sitios y el que se persistía estaba
  siempre vacío.** La pantalla de canales decía «12 de 12 asignados» mientras
  el tablero de la sesión decía «0 canales», y al reiniciar la aplicación se
  perdía la asignación entera en silencio, incluida la marca de canal en vivo
  de la que depende INV-029. Ahora hay una sola fuente: el perfil de banda.
- La pantalla de canales mostraba «Sin asignar» sobre canales que sí lo
  estaban: el enlace de propiedad sobre el desplegable se aplicaba antes de que
  existieran sus opciones.
- Guardar dos de las tres dimensiones de un local descartaba las dos en
  silencio y mostraba un aviso de éxito.
- Los errores de validación aparecían al primer carácter, y un formulario
  recién abierto ya estaba en rojo antes de que el usuario escribiera nada.
- «Cancelar» durante la captura de ganancia no detenía el muestreo, que seguía
  vivo y empujaba muestras dentro de la ventana del canal siguiente.
- «Proponer todos» podía no hacer nada sin decirlo, y proponía el perfil
  genérico para nombres que no reconocía.
- Los avisos efímeros se apilaban sin límite y tapaban el contenido.
- **Cinco invariantes estaban escritas, probadas y muertas**, el mismo patrón
  que ya se había visto con INV-034. Todas corregidas con su test:
  INV-001 comprobaba que la referencia a la instantánea no fuera nula, no que
  la instantánea existiera; INV-008 e INV-010 se aplicaban sobre la etiqueta
  que declaraba quien proponía el cambio y no sobre la ruta, así que un envío
  a un auxiliar de monitor etiquetado como fader de canal pasaba; las cláusulas
  de Q mínimo y realce máximo de INV-004 tenían su constante en el dominio y
  ninguna regla las consultaba; el tope acumulado de INV-004 sumaba magnitudes
  y bloqueaba el movimiento que deshace; y la lista blanca del paro de
  emergencia de INV-019 no la consultaba el motor.
- El estado confirmado se daba por válido al abrir el socket, antes de recibir
  el volcado, y una trama de medidores tras un tramo inestable lo revalidaba
  sin haber releído nada.
- Una transacción sin cambios se aprobaba.
- **INV-019: el paro de emergencia quedaba inoperable con cualquier diálogo
  abierto.** Un `dialog` con `showModal()` se pinta en la capa superior del
  navegador y su velo intercepta los eventos: el botón flotante dejaba de
  existir para el usuario. Ahora `ui-dialog` monta el paro en su cabecera, y
  el recorrido automático lo verifica en cada corrida.
- El paro medía 60 px en teléfono, por debajo de los 64 que exige INV-019.
- Con el paro activo, «PARO» quedaba en 2,42:1 sobre gris: ilegible justo
  cuando importa.
- La banda de rearme tapaba la barra superior entera, incluido el estado de la
  conexión, y su botón medía 31 px de alto.
- La tecla de escape cerraba los diálogos que exigen una decisión.
- El aviso efímero se solapaba con el paro entre 600 y 696 px de ancho.
- La marca de pico del medidor se pintaba según el nivel instantáneo, no según
  el pico.
- El medidor no tenía rol ni valor accesible, y en teléfono es el único
  portador del nivel.
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
