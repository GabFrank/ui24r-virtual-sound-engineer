---
name: vse-experto
description: Conocimiento experto del Ui24R Virtual Sound Engineer — cómo está construido, por qué está construido así, cómo se usa y qué reglas no se pueden romper. Usar al implementar, revisar o explicar cualquier parte de este proyecto.
---

# Experto en el Ui24R Virtual Sound Engineer

> **Cómo se trabaja acá está aparte.** Esta skill dice qué es el proyecto y para quién. Las reglas de commit, de documentación, de medición y de trato con la consola del usuario están en la skill **`vse-disciplina`**, y se aplican siempre, no solo cuando se pregunte por el proceso.

## Qué es esto

Un ingeniero de sonido virtual asistido por medición para consolas **Soundcraft Ui24R**.

No reemplaza a un ingeniero de sonido. Le da a **un músico que al mismo tiempo canta, toca, dirige y opera la consola** un sistema que escucha, mide, compara, explica, sugiere, aplica cambios controlados y verifica si realmente mejoraron el sonido.

Ese usuario condiciona todas las decisiones. Está de pie, a un metro de una tablet, con poca luz, a veces con un instrumento en una mano, y siempre con menos tiempo del que quisiera. Cuando dudes de una decisión de diseño o de producto, preguntate qué le sirve **a él, en el escenario, tres minutos antes de empezar**.

## Las cinco reglas que gobiernan el repositorio

Están en el README y no son decorativas. Cualquier cambio que las contradiga es un cambio equivocado, por bueno que parezca.

1. **Nada se asume del protocolo.** Ninguna función se implementa sobre un parámetro que no esté probado en `docs/capability-matrix.md`.
2. **Nada se escribe sin invariante.** Toda escritura a la consola pasa por el Safety Engine y está cubierta por una invariante de `docs/safety-invariants.md` con su test.
3. **Ningún asistente habla con la consola.** Solo `MixerDomainAPI` escribe, y solo por el camino `Assistant → Recommendation → Transaction → SafetyEngine → write()`.
4. **Primero medir, después corregir.** Cada corrección automática guarda estado, aplica un cambio pequeño, vuelve a medir y revierte si empeoró.
5. **La autoridad es humana.** La automatización avanza OBSERVAR → SUGERIR → ASISTIDO → AUTOMÁTICO CONTROLADO, y nunca salta etapas.

## Estado real, hoy

> **Esta sección se pudre.** Dijo «no escribe nada en la consola» durante tres días en los que ya escribía. Antes de afirmar algo sobre el estado, mirá `docs/alcance-mvp.md`, `docs/autonomy-matrix.md` y `rutasProbadas()` en `packages/mixer-adapter/src/raw-map.ts`; y si esta sección los contradice, la que está mal es ésta.

**El producto es un asistente de soundcheck, no de show** (`docs/alcance-mvp.md`, decidido con el usuario el 2026-09-11). Durante la función no hace nada. Acompaña a la banda instrumento por instrumento hasta dejar la mezcla guardada en una instantánea de la consola.

**El motor tiene tres categorías de escritura abiertas**, cada una con su ADR: la ganancia de entrada (ADR-026, decisión del usuario), el silencio de canal para diagnosticar fuera del show (ADR-027, **propuesta del agente aceptada por el usuario** — no al revés: esa autoría ya se invirtió una vez y el propio ADR lo deja escrito), y el nivel del envío a monitor, sólo `i.N.aux.M.value`, nunca en `SHOW` y con techo (ADR-028, decisión del usuario; el «hasta donde estaba» es del usuario, y anclarlo a la primera vez que la aplicación bajó es operacionalización del agente, que `safety-invariants.md` pide no fusionar). INV-010 **ya no es «nunca»**.

**La hoja de ruta rumbo al MVP se rehízo el 2026-09-17 desde el soundcheck del usuario**, y manda sobre lo que sigue: [`docs/pedidos/2026-09-17-recapitulacion-y-hoja-de-ruta.md`](../../../docs/pedidos/2026-09-17-recapitulacion-y-hoja-de-ruta.md). Tres decisiones nuevas: **la mezcla de conjunto entra** y la aplicación mueve faders (ADR-031, pide medir el fader de canal contra el audio); **puerta y compresor se ajustan por lazo cerrado** sobre el indicador de puerta y el medidor de reducción, sin más leyes (ADR-032); **los envíos a efectos entran** (ADR-033). **El cuello de botella es cablear, no medir**: cada etapa actúa cuando tiene tope, decisión, servicio, pantalla y ley o lazo, y sólo la ganancia los tiene. La primera pieza es la pantalla de monitor, **empezada el 2026-09-17**: ADR-034 separó **poner el nivel** de una cuña de **retocarla** —el presupuesto de 4 dB por sesión hacía imposible levantar un retorno desde el piso— y **el motor ya lo distingue**: mientras la ruta no tiene nivel establecido el acumulado se suspende y lo reemplaza un techo en **nominal, 0 dB**, que rige también al retocar. **Falta SÓLO el encadenado, y esta línea se corrigió dos veces el 2026-09-20**: decía «el asistente sólo sabe bajar» y «tampoco está el primer paso desde el silencio», y las dos dejaron de ser ciertas el **2026-09-19** —`puedeSubirEnvioAMonitor` sube de a 2 dB con techo en nominal, y el borde del silencio tiene caso propio en el motor y en la atadura, `ORIGEN_EN_SILENCIO`—. Se corrigió a «falta SÓLO la pantalla» y esa misma noche la pantalla se construyó, así que la corrección duró horas: **es la forma de error que esta sección avisa de sí misma y padece igual**, dos veces en un día. Lo que sigue en pie es la consecuencia: **nadie marca todavía un nivel como establecido**, porque eso lo marca la pantalla, y toda cuña vive en la primera operación. **Desde el 2026-09-20 la pantalla existe y ENCADENA** (`monitor/monitores.component.ts`): se elige al músico y a cuál de sus monitores, se ven **los 32 caminos** que entran a esa cuña --24 canales más línea, reproductor y los cuatro retornos de efecto, que es donde vive la reverb del cantante-- con su propio instrumento primero, y se la sube de a un paso: subir, escuchar dieciocho segundos con los dos medidores y anotar, **un envío por vez** porque el motor no cruza el canal de la medición contra la ruta. El último paso pide lo que falta y llega a nominal exacto, que es la cuenta de los 0,138 dB que ADR-034 dejó pendiente. **Y marca «así está bien»** --en la fila del envío y con un botón que cierra la cuña entera, las dos formas que el usuario eligió el 2026-09-20--, con lo que ADR-034 queda implementada de punta a punta y **la pieza 1 de la hoja de ruta está cerrada**. Sólo se puede marcar lo que la aplicación movió y verificó en esta sesión: el nivel establecido sale del diario y se cruza, no se declara. **Lo que NO se probó todavía es la escritura contra el aparato**: el diario y la tabla de mediciones van directo a SQLite de Capacitor, o sea sólo Android, así que en el navegador la cadena se frena antes de escribir --comprobado contra la consola del usuario el 2026-09-20: cero claves tocadas-- y la rampa sólo se puede ejercitar en la tablet. La ley sólo está medida para los 24 canales (ítem 104), así que a los otros ocho caminos la pantalla les dice **que mandan y no cuánto**, y la aplicación no los mueve. Decisión del usuario del 2026-09-20 entre tres arranques, y una segunda: **cuando suba, va a subir un envío por vez**, porque el motor no cruza el canal de la medición contra la ruta. **Y el trabajo previo apareció en el archivo propio**: la consola ya tiene una pantalla por músico, `MOREME`, con la misma unidad de cuenta --manual del fabricante, §6.2; el párrafo con el canal propio resaltado en naranja está en §3.3 y §3.4, y una primera redacción se lo atribuyó todo a §6.2, que no nombra el naranja--, y ningún documento la citaba. **Y antes de construir el asistente que sube se cerró el agujero que lo sostiene**, primera tarea del 2026-09-17b: los topes de INV-004 acotan un **movimiento**, y sólo se ataba un extremo —`magnitudPropuesta` al crudo, desde el 2026-09-13—, así que **un salto de 31 dB pasaba el tope de 2 dB por paso declarando que venía de un decibel más abajo**. Hoy lo ata `verificarAtaduraDelOrigen` y rechaza con `ORIGEN_NO_ATADO`. **Pero la garantía va enunciada sobre el cable y no sobre el veredicto, y la primera redacción de esta línea decía «la cadena queda entera», que es falso**: el motor no lee la consola, compara dos números del mismo llamador, y mentirlos los dos coherentemente sigue dando `permitido: true`. Quien ata el crudo al estado confirmado es el adaptador, **después**, con `CONFLICT`. Lo que se sostiene: **ninguna escritura sale con el movimiento mal medido**. Y el freno por paso hereda la holgura del 1 % **en los dos extremos**: son **2,84 dB y no 2**, medido — contra un margen que antes era ilimitado. **Y la guarda se cayó abierta una vez más por el operando de al lado**: `atar` no miraba el crudo, así que con `valorEsperado` en `NaN` la cuña se movía 31 dB con la transacción `APLICADA`; se cerró con `CRUDO_NO_NUMERICO`. `coincideConEsperado` (INV-011) tiene hoy la misma forma y queda como tarea. **Y los topes se cobraban por cambio mientras el movimiento real es la cadena**: cuatro pasos honestos de 2 dB en una transacción movían la cuña 8 dB, porque el contexto no se actualiza entre cambio y cambio; desde el 2026-09-17b la misma ruta repetida se rechaza con `RUTA_REPETIDA`, y se rechaza en vez de acumular porque dentro de una transacción no hay dónde escuchar. **Y «se escuchó entre paso y paso» era una palabra y no una comprobación, cerrado el 2026-09-18**: `historialDeLaSesion` miraba sólo que `medicionPosteriorId` no fuera nulo, así que **dieciséis transacciones honestas de 2 dB levantaban una cuña 32 dB, de −32 a nominal, sin una sola espera**, anotando dieciséis mediciones inventadas; lo que cortaba era el techo. Hoy `escuchaComprobada` exige **siete** cosas: que el identificador resuelva, que la medición sea de esta sesión, que su `signalType` esté en la lista blanca `PINK|SWEEP|SINE|BURST|PERFORMANCE`, que dure lo que `LIMITES[kind].escuchaMinimaS` pide —cero para el silencio de canal, diez segundos para todas las demás—, que todos los cambios verificados traigan fecha de envío utilizable, que la medición no sea anterior a la más tardía de ellas **como instante**, y que **su ventana haya terminado** para el instante en que se juzga. **Las dos son decisiones del usuario del 2026-09-18**, entre tres y cuatro opciones. **Y la parte instructiva es que la primera versión tenía cinco condiciones y no cerraba nada**: con mediciones bien formadas —`duracionS: 10` declarado, creadas en el instante de la escritura— la ráfaga volvía entera, porque comprobaba una promesa y no tiempo transcurrido. Lo midió una auditoría adversarial el mismo día, con la suite verde, junto con otras cuatro de formas conocidas: `signalType` por lista negra (el campo ausente concedía), `Date.parse` sobre fecha sin huso (hora local), fechas comparadas como texto, y un cambio sin fecha autorizado por un hermano. **`Measurement.timestamp` ganó su semántica ese día** —cuándo **empezó** la captura, con huso explícito— porque el motor empezó a depender de ella. **Falla cerrado, y esta frase decía tres cosas que hoy son todas falsas, aunque las tres eran ciertas al escribirse**: decía que nadie escribe en la tabla `measurement`, que los dos servicios pasan la lista vacía y que no hay cambio de comportamiento en producción. Se escribió a la 01:03 del 2026-09-18 y la segunda dejó de ser cierta a las 20:24 de ese mismo día --una corrección anterior dijo que «dos ya eran falsas al escribirse», y no: fue una, dieciocho horas después. Lo cazó una auditoría de fidelidad--. Los servicios pasan las mediciones de la sesión **desde el 2026-09-18**, y **desde el 2026-09-19 la pantalla de ganancia escribe la tabla**: aplica, vuelve a medir dieciocho segundos, guarda la ventana y anota su identificador en `medicionPosteriorId`. Así que **sí hay cambio de comportamiento, y es el que importa**: hasta ese día un segundo ajuste sobre el mismo canal se rechazaba siempre por falta de medición intermedia, aunque el músico hubiera tocado. Lo que sigue abierto es el **envío a monitor**, y por falta de quien capture: `EnvioAMonitorService` no mide, así que ninguna cuña queda con escucha comprobada hasta que exista la pantalla por músico. La medición que se guarda sale del **medidor de la consola** —sin micrófono, sin calibración, con un centinela en `calibrationStateId` que hace que `medicionEsConfiable` conteste que no—, y hay dos guardas en `verificar` porque nada de esto lo caza el compilador: una mira que no se pase la lista vacía y la otra que producción siga guardando y anotando. **No comprueba que la medición sea del parlante que se movió** —`channelId` no se cruza contra la ruta, así que una misma medición autoriza a la vez todas las rutas que la citen—, ni que sea confiable, **ni que el músico estuviera tocando**: distingue señal de silencio, no un barrido de sala de un instrumento. Las tres son tareas. **Sólo alcanza a las rutas con la ley medida, y la ganancia del previo no la tiene**: para el único parámetro que la aplicación mueve de punta a punta el motor sigue creyéndole al llamador, y eso se cierra midiendo, no programando. **Y el 2026-09-18 se escribió la decisión que unifica cuatro hallazgos en uno: [ADR-035](../../../docs/adr/ADR-035-el-tope-es-por-parlante-no-por-clave.md), decidida y sin implementar.** Todo el estado por ruta --acumulado, techo, rutas tocadas, escucha comprobada-- se indexa por la **cadena de la clave**, y el músico oye un parlante: el alias con ceros de la ganancia (**12 dB con el tope en 3**, medido), el enlace estéreo, las familias distintas sobre la misma cuña (**6 dB**, y **16 dB** por cuatro bandas del ecualizador sobre el mismo centro) y la escucha que no cruza `channelId` son **el mismo defecto visto de cuatro lados** --la frase que los unifica es del 2026-09-17, no de esta decisión--. Tres decisiones del usuario: la unidad de cuenta es el **destino audible**; **dos caminos al mismo parlante en una transacción se rechazan**, igual que `RUTA_REPETIDA`; y el destino tiene **dos coordenadas, parlante y zona del espectro**, así que cuatro bandas del ecualizador sólo chocan si se pisan. **La mitad del estado ya está construida acá**: `pares-estereo.ts` lee `stereoIndex` desde el 2026-09-09 y `que-entra-al-general.ts` ya modela un destino audible; lo que aporta `fmalcher` es el uso, no el dato. **De las 38 claves `stereoIndex` del aparato del usuario, 34 valen −1 y cuatro no** --las entradas de línea y el reproductor: dos pares activos hoy--. Y el fader **no llega a la cuña en esta consola**: los **320** envíos a auxiliar están en `post = 0` --240 de los canales de entrada, 20 de línea, 20 del reproductor y 40 de los retornos de efecto; se escribió 240 y era el censo de los canales, corregido el 2026-09-18--. **Y hay 170 caminos más que entran a los mismos diez buses y no publican `post` en absoluto** --`a.N.mtx.M`, `s.N.mtx.M`, `m.mtx.M`--, hoy todos en cero: el modelo del destino audible de ADR-035 iba a decidir leyendo `post` y `postproc`, y para ésos no hay qué leer. Faltan el modelo de qué llega a cada cuña, cuánto pesa cada camino, cuándo dos bandas se pisan, y resolver tres choques: INV-005, las transacciones de sistema y ADR-031.

Congeladas hasta después del MVP: el umbral de la puerta en dB, la superficie del compresor como interfaz, el ecualizador de salida, los faders de bus y del general.

**Abierto no es alcanzable, y es la distinción que esta sección ya se comió una vez.** Hoy sólo dos servicios de producción construyen un `CambioPropuesto`: `gain/aplicar-ganancia.service.ts`, que la pantalla de ganancia llama, y `monitor/envio-a-monitor.service.ts`, que **nadie llama todavía** —se llamó `bajar-envio.service.ts` hasta el 2026-09-19 y esta línea siguió nombrándolo así, y el nombre viejo además describía mal lo que hace: sube, baja y anota la escucha—. El silencio de canal no tiene ningún camino de producción. Antes de escribir «la aplicación hace X», buscá quién construye ese `kind` y quién llama a ese servicio. Bajar el fader de un auxiliar para cazar un acople está decidido y sin implementar; el general espera una decisión del usuario (ADR-029). Toda escritura pasa por el motor de seguridad y se confirma por la conexión testigo (ADR-024).

**No reproduce audio.** Micrófono de medición, interfaz de audio y motor nativo siguen pendientes de los spikes.

Lo que funciona de punta a punta sin hardware de medición (lo comprobado en la tablet contra la consola es la sesión del 2026-09-10: conexión, canales, medidores y espectro; el escenario y el recorrido son posteriores y todavía no tienen prueba de campo):

```
Perfiles (banda, local, sistema de amplificación)
  → Escenario (dónde está cada fuente, micrófono, monitor y caja, con su duda)
  → Sesión (crear, avanzar de estado, cerrar)
    → Canales (qué entrada es qué instrumento)
    → Recorrido guiado (en qué orden se ajusta la banda; se reordena arrastrando)
    → Ganancia (medida, propuesta y aplicada con verificación)
  → Historial (solo lectura, exportable)
Ajustes (consola, actualización, datos)
```

Más: telemetría en vivo, espectro con el analizador prestado (ADR-025), detección de realimentación, paro de emergencia, y actualización desde GitHub. **Saber si hay otro operador está medido y expuesto por el adaptador (`otroOperador()`), y ninguna pantalla lo muestra**: el verde de G-A es del mecanismo, no del producto.

**Leyes de conversión medidas contra el aparato, con bucle externo.** Esta lista cambió mucho el 2026-09-16 y el número exacto lo cuenta `validate-numeros`, no esta línea: **en `RAW_MAP` hay doce**. Son las curvas de frecuencia y Q del ecualizador de canal, el pasa-altos, el pasa-bajos, la **ganancia de sus cuatro bandas** —medida una por una—, el envío a monitor, la **ganancia del ecualizador gráfico de salida en sus dos superficies** —un auxiliar y el general— y el **sostenido de la puerta**, que es la primera del dominio del tiempo, y **la profundidad de la puerta**, medida el 2026-09-17 y acotada al crudo 0,55 … 1,00 porque más abajo lo que se mide es el piso del banco. Aparte están medidos y **fuera de la tabla a propósito** el fader de bus y el del general, porque sus rutas siguen cerradas (ADR-029).

**Medido y todavía fuera de la tabla por una razón escrita:** la **pendiente del umbral del compresor** —96,4 dB por unidad, ítem 118— porque falta su cero; la **curva de la relación** —ítem 117 más ítem 118— porque **no es un número**: la pendiente sube con el nivel, así que `R = 1 + 0,548·(1/a − 1)` es el promedio en una ventana y no una ley; y los **tiempos del compresor**, porque la forma se confirmó pero no se dedujo.

**Refutadas:** `VtoRATIO(a) = 1/a` del compresor, el tope de 50:1 del manual (ítem 110), **la forma de la relajación de la puerta** (ítem 116) y **la rodilla dura del compresor** (ítem 118). **Y una des-refutación, que es la corrección más grande del 2026-09-16:** `VtoTHRESH` figuraba como refutada y no lo estaba — la 97 había refutado la conjunción y el culpable era la relación. Desde el ítem 118 **no queda ninguna entrada `REFUTADO` en `raw-map.ts`**; el test que lo comprobaba ahora ejercita la maquinaria con una entrada de mentira para que el camino no quede sin correr.

**El hallazgo más importante del 2026-09-16, y el que más cuesta tener presente:** **el compresor no tiene una relación, tiene una curva.** Aprieta fortísimo apenas se pasa el umbral y va aflojando con el nivel. Cualquier función que proponga «comprimí 3 a 1» está diciendo algo que este aparato no hace. **La superficie entera está medida** (ítem 119): ocho posiciones del control por seis excesos, con la reducción dependiendo sólo del exceso sobre el codo —comprobado en tres umbrales, 0,27 dB de diferencia—, así que la tabla sirve en cualquier umbral y se puede interpolar. La curva y la superficie están publicadas como tablas en [`hallazgo-el-compresor-no-tiene-una-relacion.md`](../../../docs/backlog/hallazgo-el-compresor-no-tiene-una-relacion.md), con la reducción como función del exceso — que resultó ser **independiente del umbral**, y por eso se puede escribir una vez y usar en cualquiera.

**Otros hallazgos del 2026-09-16 que cambian lo que se puede construir:** el ecualizador de canal tiene **cuatro** bandas y no cinco —`b5` se escribe y no suena—; los «doce filtros» del supresor eran **doce ranuras vacías**; en modo **LOCK** el supresor no aprende, comprobado contra un positivo del mismo día; y los milisegundos que la consola muestra **no son los que hace el aparato**, con ADR-030 decidiendo cómo se le dice eso al usuario.

**Sin medir:** el **cero** del umbral del compresor, la relajación de los dos, las otras siete columnas de la superficie del compresor, el envío a efectos, y el lado derecho del ecualizador del general —que necesita cambiar un cable—. El **umbral de la puerta** dejó de estar sin medir y pasó a estar **acotado**: entre 80 y 100 dB por unidad (ítem 120), con los 96 del cliente adentro y sin confirmar.

**Y el hallazgo del 2026-09-17, que es una retractación:** el techo de 29 dB que el 2026-09-16 se le atribuyó a la profundidad de la puerta **era el piso del banco de medición**. Se dirimió subiendo la fuente 12 dB y viendo que el techo no se movía de su nivel absoluto —−106,6 dBFS contra −105,5—. Con eso `VtoGATE_DEPTH(a) = 60a − 60` quedó **confirmada al décimo de dB** y publicada. Es la tercera vez que este proyecto documenta el límite de su instrumento como si fuera el del aparato; las dos anteriores fueron el recorrido del medidor y su techo. **La puerta también tiene histéresis**, comprobada sin ambigüedad en un umbral, y **menor que 1,5 dB**: por debajo de lo que la escalera separa. Las fórmulas del cliente oficial para eso están archivadas en `docs/spikes/SPK-P0.2a/evidence/tablas-conversion-ui24r.js` y valen como hipótesis, no como medición.

**Y el 2026-09-21 el ecualizador de canal quedó medido entero: las doce hojas de sus cuatro bandas.** Faltaban la frecuencia y el Q de las bandas 2, 3 y 4 --la 1 la midió el ítem 101 y las cuatro ganancias el 113-- y sin eso la regla 1 prohibía escribirlas, o sea que la pieza 2 no se podía construir. El **ítem 121** las midió, una corrida por banda contra el filtro real: **las tres comparten la exponencial `20·1102,5^V` y el `0,05·300^V` de la banda 1**, con error máximo de `f0` entre 0,17 % y 0,25 % contra un criterio del 5 %, y el control de cierre en verde en las tres. Tramo publicado: crudo 0,25 … 0,90 en frecuencia y 0,35 … 0,70 en Q. **Lo que costó es la parte instructiva**: las tres primeras corridas fallaron su control con la ley saliendo bien igual, y hubo dos diagnósticos míos equivocados --«son los micrófonos abiertos», refutado callando 31 rutas sin que cambiara nada; «se movió una perilla», refutado por el usuario-- antes de encontrar que **el instrumento se comía 28,00 dB**: puentea el compresor del canal y con eso se lleva la ganancia del preajuste `Kick Drum` que el usuario le puso al canal del banco el 2026-09-15. Se compensó subiendo el estímulo. Ver [`el-banco-no-estaba-roto-el-instrumento-se-comia-28-db.md`](../../../docs/backlog/el-banco-no-estaba-roto-el-instrumento-se-comia-28-db.md).

**Y el hallazgo del 2026-09-20, al empezar la pieza 2: los preajustes del usuario ya están en su consola y el protocolo los deja listar y leer, medido.** `PRESETLIST^<categoría>` devuelve los nombres con prefijo --`f:` fábrica, `u:` usuario-- y `READPRESET^<categoría>^<nombre>` devuelve el contenido como JSON de claves relativas con su crudo. Él tiene **diez preajustes propios**, y **son de canal entero (`ch`), no de ecualizador**: traen ecualizador, dinámica y puerta juntos, 32 claves. Los bancos de usuario del ecualizador, la dinámica y la puerta están **vacíos**. Seis de los diez **no están cargados en ningún canal**, así que censar los nombres del volcado subestima su biblioteca --que es lo que hizo la primera versión del hallazgo--. **Cargar un preajuste NO es un comando**: la consola devuelve el contenido y el cliente escribe clave por clave, así que aplicarlo desde la aplicación son muchas escrituras propias por el motor de seguridad, y choca con el máximo de cuatro parámetros por transacción de INV-005 y con el conteo por destino audible de ADR-035. Guardar, renombrar y borrar existen en el mismo vocabulario y **no se ejercieron**. `prmod` sigue `INFERIDO` --los controles que cambian el sonido lo ponen en 1 y cargar o guardar lo ponen en 0, leído del cliente que sirve la consola; **el modo fácil y las dos pendientes NO lo ponen en 1**, y al cargar un preajuste de canal **la marca de la dinámica no se limpia**, porque el cargador la manda a `comp.prmod`, que en esta consola no existe-- y volverlo medido toca su aparato. Detalle en [`hallazgo-los-preajustes-del-usuario-ya-estan-en-la-consola.md`](../../../docs/backlog/hallazgo-los-preajustes-del-usuario-ya-estan-en-la-consola.md).

## Mapa del código

| Ruta | Qué hay | Regla |
|---|---|---|
| `packages/domain` | Entidades, reglas, validación, constructores | Sin dependencias de framework. Los valores por defecto son decisiones del dominio y viven acá. |
| `packages/mixer-adapter` | Protocolo, estado confirmado, adaptador | **Único** punto que habla con la consola. |
| `packages/safety` | Motor de seguridad, diario, ejecutor de transacciones | Tiene autoridad sobre cualquier asistente. |
| `packages/assistants` | Análisis y propuestas | Funciones puras. No tocan la consola ni la base. |
| `packages/logging` | Registro, sumideros y lectura del registro guardado | Depende del almacén y de nada más. |
| `packages/store` | Puerto de almacén, esquema de la base y semántica de consulta | La verdad sobre qué contesta una consulta. Incluye el SQL, para poder probarlo. |
| `packages/updater` | Política de actualización | TypeScript puro, sin red ni Android. |
| `packages/dsp-contract` | Tipos del puente con el motor de audio nativo | Todavía sin implementación. |
| `apps/mobile/src/app/core` | Servicios transversales | Base, registro, conexión, sesión, repositorios. |
| `apps/mobile/src/app/escenario` | El plano del local y sus fichas | Es una mesa de trabajo, no un instrumento: cada elemento lleva su incertidumbre y ninguna inferencia es más precisa que sus entradas. |
| `apps/mobile/src/app/recorrido` | El recorrido guiado del soundcheck | El orden lo publica `docs/orden-del-soundcheck.md`; el usuario lo reordena y queda en el perfil de la banda. |
| `apps/mobile/src/app/monitor` | La cuña de un músico: subirla y bajarla con toda la cadena de seguridad, escucharla con los dos medidores, y **la pantalla que la muestra** | Único sitio de producción, junto con `gain/`, que construye un `CambioPropuesto`. Enchufa la ley real al asistente, que no puede importar el adaptador. La pantalla **todavía no llama a los servicios**: sólo lee. Lo que afirma decibeles vive en `cuna-del-musico.ts`, sin decoradores, para que los tests lo puedan sujetar. |
| `apps/mobile/src/app/ui` | Primitivas del sistema de diseño | Ver `docs/design-system.md`. |
| `apps/mobile/android` | Plataforma Capacitor y complemento de actualización | Java, no Kotlin: no hay cadena de Kotlin configurada. |
| `tools/mixer-sim` | Simulador de la consola | **Reproduce nuestras hipótesis, no el protocolo.** |
| `tools/spikes` | Los guiones de medición | Corren con `medir.mjs`, que archiva la misma corrida que se ve; restauran todo con `try/finally` y lo comprueban por HTTP. |
| `docs/compromisos` | Un contrato por medición, escrito **antes** de medir | Lo que se promete, lo que no, y las expectativas de un auditor que no vio la solución (`docs/protocolo-de-verificacion.md`). Numerados por el plan de la madrugada, no por el orden de implementación. |
| `docs/pedidos` | Lo que dijo el usuario, textual, y los planes y resúmenes por fecha | Todo lo demás es interpretación; esto es lo que permite auditarla. |
| `docs/inventario` | Las claves de la consola real, observadas sin escribir | Por firmware y fecha. |
| `docs/referencia` | El manual del fabricante, extraído, y lo que aporta | Tercera fuente, no superior: contra una medición, pierde. |
| `tools/visual` | Capturas y recorrido del camino de usuario | `flujo.mjs` falla si un paso se atasca. |

## Convenciones que hay que respetar

### Idioma
Español rioplatense en el dominio, en la interfaz y en los comentarios. Identificadores genéricos en inglés cuando ya son términos del oficio (`SessionState`, `ChannelAssignment`). Los mensajes de error se le muestran al usuario: tienen que decir **qué se esperaba**, no «valor inválido».

### Angular
- Componentes autónomos, señales, `ChangeDetectionStrategy.OnPush` siempre.
- **Nunca llamar funciones ni getters desde una plantilla.** Se reevalúan en cada ciclo de detección de cambios. Si la plantilla necesita algo calculado, va en un `computed()`. Esto ya se violó tres veces y costó cuarenta y ocho llamadas por ciclo en la pantalla de telemetría.
- Nada de valores literales de color, espacio o tamaño en un componente: todo sale de las fichas de `src/styles/_tokens.scss`.
- Los parámetros de ruta llegan como `input()` gracias a `withComponentInputBinding`.

### TypeScript
- Los paquetes se importan por sus fuentes, con extensión `.ts` explícita en los imports relativos. Lo exige el modo de eliminación de tipos de Node, que es con lo que corren los tests.
- **Sin propiedades declaradas en el constructor** (`constructor(private readonly x: T)`): ese modo de Node no las admite.
- `strict` con `noUncheckedIndexedAccess` y `exactOptionalPropertyTypes`.

### Commits
Conventional Commits. **El ámbito nombra el módulo, no el hito**: `feat(assistants)`, no `feat(mvp0)`. Los ámbitos válidos están en `commitlint.config.js`.

### Pruebas
`node --test --experimental-strip-types`. Cada test lleva en el nombre el identificador de la invariante que cubre, cuando corresponde. Un test que pasa contra el simulador **no cierra ninguna invariante**.

## Las trampas que ya mordieron

Cada una de estas costó tiempo. Están acá para que no vuelva a pasar.

**El signo de la propuesta de ganancia.** Con el pico a −4 dBFS proponía *subir* la ganancia, empujando hacia la saturación el canal que ya estaba cerca. La resta estaba invertida. Hay un test que exige bajar cuando el pico está alto, y un comentario junto a la línea.

**`null` en SQL contra `null` en JavaScript.** `columna = NULL` nunca es cierto en SQL; `x === null` sí lo es en JavaScript. «La sesión abierta» se busca por `cerrada_el IS NULL`. Y al ordenar, SQLite trata `NULL` como el valor más bajo mientras que la referencia lo manda al final en los dos sentidos. Por eso el esquema **y el SQL** viven en `packages/store`: `test/sql.test.ts` los corre contra SQLite real y compara resultado a resultado con el almacén en memoria. El almacén de Android solo ejecuta el texto.

**Invariantes vivas pero inertes.** INV-034 estaba escrita, probada y no se disparaba nunca, porque el campo del que dependía no lo poblaba nadie. Cuando agregues una invariante, verificá que algo real la active.

**El volcado inicial parecía una avalancha.** Al conectar, la consola manda su estado entero. El detector de cambios masivos lo leía como «alguien recuperó una instantánea». Se resuelve con `volcadoIniciado()`.

**La misma regla implementada dos veces.** El adaptador calculaba bien la conexión inestable y la interfaz tenía una segunda copia rota. El adaptador es la única fuente.

**Nombres de clase que colisionan.** Uno de los tonos de aviso se llama «aviso» y la clase base del componente también: `.aviso.aviso` coincidía con cualquier mensaje y todos salían en ámbar.

**Elementos fijos que tapan contenido.** El paro de emergencia y la barra inferior flotan. Cualquier página que termine en un botón tiene que reservar `--zona-inferior`.

**Firma de Android.** El sistema solo reemplaza una aplicación por otra firmada con la **misma clave**. Sin un almacén de claves fijo guardado como secreto, ninguna actualización funciona y el mensaje que ve el usuario es «aplicación no instalada», que no explica nada.

**Un número escrito a mano en la documentación se pudre.** La cuenta de tests estuvo en 220 cuando eran 283, se corrigió a 293, y dos PR después ya eran 298. La corrección dura hasta el siguiente PR que agregue un test. Cuando un dato cambia cada semana y nada lo comprueba, la respuesta no es corregirlo otra vez: es no afirmarlo, y decir dónde se consulta. Los números que sí valen la pena escribir son los que cambian con una decisión —cuántas invariantes hay, cuántos gates— porque cambiarlos es parte de tomar la decisión.

**Una comprobación puede estar calibrada por debajo de la regla.** El recorrido medía el paro del diálogo con un umbral de 44 px cuando INV-019 exige 64, así que aprobaba un botón de 48. Se había corregido antes un caso de 60 px argumentando que «cuatro píxeles no valen debilitar una invariante», y se dejó pasar uno de dieciséis. Cuando escribas la comprobación, copiá el número de la regla, no uno parecido.

**Una comprobación puede comprobar menos de lo que dice.** El validador de identificadores reconocía ocho familias como definición y comprobaba tres como referencia: spikes, epics, historias, riesgos y decisiones no se comparaban contra nada, y así sobrevivió una cita a EP-09 —que no existe— en un documento que el script daba por validado. Cuando agregues una comprobación, comprobá también su cobertura: no alcanza con que falle cuando debe, tiene que mirar todo lo que dice mirar.

**Los mapas de código de scripts rompen la compilación de desarrollo.** Con `allowImportingTsExtensions`, el compilador pierde `src/main.ts`. Están apagados a propósito en `angular.json`.

## Cómo se trabaja

```bash
npm run verificar          # todo lo que comprueba la integración continua
npm run verificar:commits  # los mensajes de esta rama, contra main

npm run lint          # chequeo de tipos completo + compilación de la app
npm test              # los tests de los paquetes y de los ayudantes de la app
npm run test:dsp      # 48 de procesamiento de señal
npm run validate:docs # identificadores de la documentación
npm run validate:templates  # acentos graves y llamadas desde plantilla
npm run validate:limites    # límites entre paquetes

npm run build:dev -w mobile          # compilación con la galería de diseño
node tools/visual/flujo.mjs          # 28 pasos del camino de usuario, 2 anchos
node tools/visual/capture.mjs        # escenarios del protocolo + sistema de diseño
node tools/mixer-sim/src/server.mjs  # simulador de la consola
```

**Antes de abrir un PR**: `npm run verificar` y `npm run verificar:commits`. Si tocaste interfaz, además las capturas.

Las ramas salen de `main` y entran por PR. `main` está protegida.

## Cómo se usa la aplicación

**La primera vez**, en este orden, porque cada paso depende del anterior:

1. **Perfiles → Banda.** Nombre e integrantes con sus instrumentos. Sirve para poder decir «el micrófono de Ana» en vez de «el canal 3».
2. **Perfiles → Amplificación.** Cajas y **rango útil**. El rango útil es el dato que impide que la aplicación proponga corregir donde el equipo no entrega nada; declararlo de más produce correcciones absurdas y potencialmente destructivas.
3. **Perfiles → Local.** Tipo, dimensiones (opcionales, y mejor vacías que inventadas) y curva objetivo.
4. **Ajustes → Consola.** La dirección. La Ui24R levanta su propia red y se presenta en `ws://10.10.1.1`.

**En cada show:**

1. **Sesión → Empezar**, eligiendo banda y local.
2. Avanzar de estado según lo que se vaya haciendo. La pantalla dice qué se puede hacer en cada estado.
3. **Canales**: asignar y marcar los que llevan **fuente en vivo**. Esa marca no es informativa: protege cuando se active el modo de reproducción, que sustituye las entradas por pistas grabadas.
4. **Ganancia**: medir canal por canal. Solo se ajusta en configuración de canales (INV-006): al grabar una toma, cambiarla haría que la toma dejara de representar al show.
5. Al terminar, **cerrar la sesión**. Es irreversible y queda en el historial.

**El paro de emergencia** está en todas las pantallas. Hace lo local primero, sin red, en menos de 200 ms. **No silencia el general ni los canales**: un paro que apaga el show entero es peor que el problema que resuelve, y nadie lo usaría.

## Cuándo consultar qué documento

| Pregunta | Documento |
|---|---|
| ¿Por qué se decidió así? | `docs/adr/` |
| ¿Qué no se puede hacer nunca? | `docs/safety-invariants.md` |
| ¿Qué sabemos del protocolo? | `docs/capability-matrix.md` |
| ¿Qué falta medir para desbloquear X? | `docs/spikes/`, `docs/gates/` |
| ¿Cómo se ve y por qué? | `docs/design-system.md` |
| ¿Qué puede hacer el usuario hoy? | `docs/flujo-de-usuario.md` |
| ¿Cómo se publica una versión? | `docs/actualizacion-en-app.md` |
| ¿Qué falló antes y cómo se vio? | `docs/visual/README.md` |

## Lo que nunca hay que hacer

1. Escribir en la consola fuera del camino `Assistant → Recommendation → Transaction → SafetyEngine → write()`.
2. Marcar una invariante como cerrada por pasar contra el simulador.
3. Implementar sobre un parámetro del protocolo que ningún spike verificó.
4. Llamar funciones o getters desde una plantilla de Angular.
5. Escribir un color, un espacio o un tamaño literal en un componente.
6. Cambiar el nombre de los artefactos de publicación (`vse-<version>.apk` y su `.sha256`) sin actualizar el actualizador: la detección se rompe en silencio.
7. Versionar un almacén de claves o cualquier secreto. El repositorio es público.
8. Editar una migración de base ya publicada. Se agrega otra.
9. Empujar sin correr `npm run lint` y `npm test`.
