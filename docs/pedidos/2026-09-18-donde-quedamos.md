# Dónde quedamos — 2026-09-18

**Para quien retome, en cualquier sesión.** Reemplaza a
[`2026-09-17c-donde-quedamos.md`](2026-09-17c-donde-quedamos.md) en lo que cambió.
Las listas de tareas **siguen viviendo en**
[`2026-09-17b-donde-quedamos.md`](2026-09-17b-donde-quedamos.md) —este documento
apunta a ellas en vez de copiarlas— y sigue en pie el estado del banco, el
hallazgo del servicio de audio de la Mac, y lo que el usuario pidió sobre cómo
trabajar.

## El estado del equipo del usuario

**Comprobado al cerrar contra el volcado tomado al abrir**, ordenados y
comparados línea por línea:

| | |
|---|---|
| Claves del volcado | **6665 al abrir y 6665 al cerrar** |
| Diferencias | **cero**, clave por clave |
| Filtros plantados en el supresor | **0** |
| Supresor | **encendido** (`m.afs.enabled = 1`) |
| Escrituras a la consola en toda la sesión | **ninguna**: sólo se le pidió el estado, tres veces |
| Procesos sueltos | ninguno |

**El banco sigue como el 2026-09-16.** Esta sesión no midió nada con audio.

### Dos cosas del aparato que esta sesión descubrió y conviene tener presentes

Las dos salieron de leer el volcado entero en vez de su principio, y las dos
corrigen afirmaciones que se habían escrito el mismo día.

- **Hay dos pares estéreo activos ahora mismo.** De las 38 claves `stereoIndex`,
  **34 valen −1 y cuatro no**: `l.0 = 0`, `l.1 = 1`, `p.0 = 0`, `p.1 = 1` — las
  entradas de línea y el reproductor. El enlace estéreo no es un riesgo a futuro.
- **El fader del canal no llega a las cuñas.** Los **240** envíos a auxiliar
  tienen `post = 0` —antes del fader— y `postproc = 1`. Para esa combinación, la
  tabla del ítem 95 dice que el ecualizador mueve el auxiliar y el fader no.

## Lo que se hizo: dos tareas, dos commits empujados

La rama es `claude/soundcraft-ui24-assistant-kh8ezj` y está sincronizada. El árbol
está limpio. **No se abrió ningún PR**: nadie lo pidió.

### 1. `ff96c1e` — la escucha entre pasos era una palabra, no una guarda

**Elegida por el usuario entre cuatro opciones**, con el argumento de que le da
sentido al freno de la ruta repetida y de que la pantalla de monitor —la pieza que
sigue— es justo la que iba a abrir el agujero.

`historialDeLaSesion` decidía si se había escuchado entre una transacción y la
siguiente mirando sólo que `medicionPosteriorId` no fuera nulo. **Medido:
dieciséis pasos honestos de 2 dB levantan una cuña 32 dB, de −32 a nominal, sin
una sola espera**, anotando dieciséis mediciones que no existen.

Hoy `escuchaComprobada` exige **siete** condiciones. Dos decisiones del usuario:
qué cuenta como escucha —«una medición real, posterior, y con el músico sonando»,
descartando el silencio y el cronómetro— y cuánto dura —**que lo decida el tipo de
parámetro**: cero para el silencio de canal, diez segundos para las demás—.

**Y la parte que más importa: la primera versión tenía cinco condiciones y no
cerraba nada.** Con la suite entera en verde y once mutantes cazados, una auditoría
adversarial corrió la misma ráfaga con mediciones **bien formadas** y la cuña
volvió a subir los 32 dB: `duracionS` lo declara quien escribe la fila, así que la
guarda comprobaba una promesa y no tiempo transcurrido. Se agregó que **la ventana
haya terminado**, y eso cerró de paso la medición del futuro.

La misma auditoría encontró cuatro más, las cuatro de formas ya conocidas acá:
`signalType` por **lista negra** —el campo ausente concedía—, `Date.parse` sobre
fecha **sin huso** —hora local—, fechas comparadas **como texto**, y un cambio sin
fecha autorizado por un hermano. Y una condición **muerta** cuyo mutante sobrevivía.

Una auditoría de fidelidad encontró **seis afirmaciones falsas**, entre ellas
«32 dB en **24 ms**»: ese número no se reproduce y es lo que tarda en evaluarse la
guarda, **no en moverse la cuña**. Ahora se cita el movimiento y no el reloj.

`Measurement.timestamp` ganó su semántica —**cuándo empezó**, con huso explícito—
porque el motor pasó a depender de ella.

### 2. `cc0eb35` — ADR-035: el tope se cuenta por parlante, no por clave

**Elegida por el usuario**, y es la decisión escrita que unifica cuatro tareas que
estaban anotadas en cuatro listas distintas.

Tres decisiones suyas entre opciones: la unidad de cuenta es el **destino
audible**; dos caminos al mismo parlante en una transacción **se rechazan**, igual
que `RUTA_REPETIDA`; y el destino tiene **dos coordenadas, parlante y zona del
espectro**, así que cuatro bandas del ecualizador sólo chocan si se pisan —si no,
ecualizar un canal pasaría a ser cuatro transacciones con diez segundos de escucha
entre cada una—.

**Y acá también hubo dos errores propios**, los dos de la forma que este
repositorio corrige: se escribió que las 38 claves de enlace estaban en −1 —se
miró el principio del volcado y se generalizó— y se presentó el agrupamiento por
enlace como hallazgo ajeno cuando **este repositorio lo mide desde el 2026-09-09**
y tiene `pares-estereo.ts`. Lo que aporta `fmalcher` es el **uso**, no el dato.

**Y una cifra falsa que venía de antes, corregida donde vive:** «36 dB en ráfaga»
estaba en `engine.ts` desde el 2026-09-17b y en el documento del 17b atribuida a
**tres** alias, que dan 18. Son **24** con cuatro, y el número honesto es que **no
hay techo**, porque el patrón del alias no tiene cota.

## Lo que hay que aprender de esta jornada, que no es ninguno de los dos arreglos

**Es la cuarta jornada seguida en que la auditoría encuentra defectos reales con
la suite entera en verde, y esta vez encontró algo peor que las anteriores: el
arreglo no arreglaba nada.**

No fue un descuido de cobertura. Había once mutantes probados uno por uno y los
once cazados, tests para cada condición, y la suite completa en verde. Lo que
faltaba era **una condición que nadie había pensado**, y ningún test puede cazar
una guarda que no existe. El auditor la encontró **atacando el arreglo con
entradas bien formadas** en vez de con entradas rotas.

La regla que deja: **mutar prueba que los tests cazan lo que hay; sólo atacar
prueba que lo que hay alcanza.**

Y la otra, que se repitió dos veces en el día sobre el propio aparato: **leer el
principio de un volcado y generalizar al resto es la misma forma de error que el
repositorio corrige con los proyectos ajenos.** Las dos veces la afirmación
cómoda era la falsa.

## Lo que queda abierto

**Las listas viven en [`2026-09-17b-donde-quedamos.md`](2026-09-17b-donde-quedamos.md)**
y este documento no las repite. Qué cambió de ellas:

| Antes | Ahora |
|---|---|
| «La escucha entre transacciones que nadie comprueba» | **Cerrada** el 2026-09-18 |
| «El alias con ceros», «el enlace estéreo», «las familias distintas» | **Decididas juntas** en ADR-035, sin implementar. Ya no son tres tareas: son una |
| Las demás | Sin cambios |

### Lo que ADR-035 dejó anotado y hay que resolver al implementarlo

Tres choques con reglas que ya existen, ninguno estaba dicho antes, y los encontró
la auditoría de fidelidad:

1. **Con INV-005**, el límite de cuatro parámetros por transacción.
2. **Con las transacciones de sistema**: seleccionar el bus de análisis escribe
   **veintitrés envíos al mismo destino**. Tiene que quedar exento, y hay que
   escribirlo.
3. **Con [ADR-031](../adr/ADR-031-la-mezcla-de-conjunto-entra.md)**, la mezcla de
   conjunto, si el destino audible incluye el general.

Y tres cosas sin definir: **cómo se calcula el destino audible** —hay que leer
`post` y `postproc`—, **cuánto pesa cada camino**, y **cuándo dos bandas se pisan**.

### Tareas nuevas que dejó la escucha

- **`escuchaComprobada` no cruza `channelId`**, así que una medición del canal 5
  autoriza la cuña del canal 3, y una misma medición autoriza a la vez todas las
  rutas que la citen. **Es parte de ADR-035**, no una tarea aparte.
- **No se mira `medicionEsConfiable`**: el historial no recibe el estado de
  calibración.
- **La guarda distingue señal de silencio, no al músico tocando de un barrido de
  sala**, que es lo que la decisión del usuario pedía. Necesita el cruce con el
  canal, o sea ADR-035.

## Lo que falta de la pieza 1

Sigue igual: **el asistente que sepa subir** —hoy sólo sabe bajar— y **la pantalla
por músico**, que es la que marca «así está bien».

**Y ahora cuesta un poco más que ayer, por lo que se hizo hoy.** Además del caso
con nombre propio dentro de la atadura del origen, la pantalla de monitor va a
tener que **pasarle las mediciones al historial**: hoy los dos servicios pasan la
lista vacía, y con la lista vacía ninguna ruta queda con escucha comprobada, así
que el segundo paso de cualquier rampa se rechaza. El compilador no caza una lista
vacía; está dicho en los dos servicios.

## Cómo arrancar la próxima sesión

El prompt para pegar después de un `/clear` está en
[`2026-09-18-prompt-para-retomar.md`](2026-09-18-prompt-para-retomar.md).

## Lo que sigue valiendo de los cierres anteriores

- **El servicio de audio de la Mac se traba y el síntoma se lee como un permiso
  denegado.** Se cura con `sudo killall coreaudiod`, lanzable por SSH. Ver
  [el hallazgo](../backlog/hallazgo-el-audio-de-la-mac-se-traba-y-parece-un-permiso.md).
- **El usuario opera la MacBook a distancia**, por SSH y AnyDesk. No se puede mover
  ningún cable del banco ni tocar la perilla de la Scarlett hasta que vuelva.
- **Antes de meter tonos sostenidos, mirar `m.afs.enabled`**, que hoy está en 1.
- **Nunca borrar los snapshots guardados.** Es la única prohibición absoluta.
- **Cómo el usuario pide que se trabaje**: preguntas siempre interactivas,
  explicaciones en lenguaje de producto, trabajo previo buscado y dicho
  explícitamente, una tarea un commit empujado, auditoría antes de dar algo por
  bueno, y aviso cuando la sesión se alarga.
