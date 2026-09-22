# Dónde quedamos — segundo cierre del 2026-09-19

**Para quien retome, en cualquier sesión.** Reemplaza a
[`2026-09-19-donde-quedamos.md`](2026-09-19-donde-quedamos.md) en lo que cambió y
lo deja en pie en el resto. Las listas de tareas **siguen viviendo en**
[`2026-09-17b-donde-quedamos.md`](2026-09-17b-donde-quedamos.md) —este documento
apunta a ellas en vez de copiarlas— y sigue valiendo todo lo que el cierre
anterior dice del banco, del servicio de audio de la Mac y de cómo el usuario
pide que se trabaje.

## Lo primero, porque manda sobre todo lo demás

**Sigue en pie la regla del corte de deriva**, y esta sesión la respetó: no se
midió nada con audio, no se le escribió nada a la consola, y no se abrió ninguna
investigación fuera de la pieza en curso. Lo único que se leyó de afuera fueron
los cuatro repositorios de terceros, porque la disciplina lo exige antes de
proponer.

- **Antes** de medir, leer un volcado, auditar una parte del sistema o abrir una
  investigación: preguntarse si hace falta para la pieza en curso. Si no, **no se
  hace**, y si no es obvio, se pregunta.
- **Después**: un hallazgo cierto no es una tarea si no toca la pieza en curso.
  Va al backlog y se sigue.
- Auditar es obligatorio, pero manda sobre **cómo** se valida lo que se hace, no
  sobre **qué** se hace.

## Lo que se hizo: una tarea de la pieza 1 y su corrección, dos commits empujados

La rama es `claude/soundcraft-ui24-assistant-kh8ezj` y está sincronizada en
`a88f2e9`. El árbol está limpio. **No se abrió ningún PR**: nadie lo pidió.

El usuario eligió arrancar por el cimiento, entre tres opciones: **que la
aplicación guarde lo que escucha**, antes que la pantalla o el acto de marcar el
nivel.

### 1. `51f3d1f` — la aplicación guarda lo que escucha y lo anota

**Era la mitad suelta del lazo, y tenía efecto medible en el producto.** La
pantalla de ganancia aplicaba, volvía a medir dieciocho segundos para contarle al
usuario si había servido, y **tiraba esa ventana**. El motor exige una medición
entre un cambio y el siguiente sobre el mismo parámetro y la resuelve contra la
tabla `measurement`, pidiendo el identificador exacto que la transacción declara.
Con la tabla vacía y el campo en nulo, **el segundo ajuste sobre el mismo canal se
rechazaba siempre**. La aplicación sabía que había escuchado, se lo decía al
usuario por pantalla, y no se lo decía al motor.

**Son dos mitades y ninguna sirve sola**: una tabla llena con
`medicionPosteriorId` en nulo da el mismo veredicto que la tabla vacía.

**Trabajo previo, buscado y dicho:** los cuatro repositorios se clonaron en los
commits que el inventario declara y se grepearon. **Ninguno guarda una medición**
—lo que MyUiPro persiste son preferencias de la interfaz— y ninguno liga una
medición a un cambio. Sin precedente, que es un dato y pide más cuidado.

### 2. `a88f2e9` — la escucha se decidía mirando un número muerto

**Lo que las dos auditorías encontraron es peor que el defecto que el commit
anterior arreglaba.** La frase «si nadie tocó, nadie oyó» fallaba en las **dos**
direcciones, y estaba escrita como si fuera la garantía.

> **Medido:** `MixerService` sólo vacía la lista de canales cuando el usuario
> desconecta a propósito. Si la conexión se cae sola, los últimos niveles quedan
> ahí y la captura muestrea dieciocho segundos de un número muerto: una ventana
> con la consola caída y el último nivel en −14,6 dB **se guardaba como
> `PERFORMANCE` de 17,95 segundos y el motor autorizaba el paso siguiente, con
> cero segundos de música**. El delator —el medidor no se movió ni un escalón—
> estaba en el análisis y nadie lo miraba.

Y al revés: **un canal que entró a −54 dB se guardaba como silencio**, o sea que
el canal para el que el asistente de ganancia existe era justamente el que no
podía subir en dos pasos. El proyecto separó «no entró nada» de «entró muy bajo»
el 2026-09-09 porque llevan a consejos opuestos, y este mapeo las volvió a fundir.

Y **tres segundos de música en una ventana de dieciocho declaraban 17,95 segundos
de escucha**, indistinguibles de dieciocho: lo que el motor comprobaba no era
«escuchó diez segundos» sino «pasaron dieciocho de reloj y en algún momento hubo
señal».

**Decisión del usuario, entre tres opciones: medir la música y no el reloj.** Hoy
son dos preguntas y las dos tienen que dar que sí —que haya entrado algo, por
encima del **piso de ruido** y no del umbral de análisis; y que **el medidor se
haya movido**— y la escucha que se declara es cuánto sonó la fuente, contando
muestras.

| Ventana de 18 segundos | Antes | Ahora |
|---|---|---|
| Músico tocando | tocó | tocó |
| Consola caída, medidor congelado | **tocó** | no tocó |
| Canal que entró muy bajo (−54) | **no tocó** | tocó |
| Toca 3 de los 18 segundos | **17,95 s** | 3 s |

**Consecuencia de producto, y hay que decirla:** el músico tiene que tocar **al
menos diez de los dieciocho segundos**; si no, la aplicación pide otra vuelta en
vez de dejar seguir.

**Y hay una segunda mitad que ataca la causa:** no se guarda una escucha si la
consola no está conectada al terminar la ventana. **Lo que ninguna de las dos
alcanza está escrito con todas las letras**: una caída que empieza y termina
adentro de la ventana. Queda en el backlog.

## Las dos auditorías, que es lo más importante de esta sesión

**Adversarial y de fidelidad, acotadas al MVP y a las herramientas**, las dos
sobre la cadena completa —mapeo, `INSERT` real, `SELECT` real,
`historialDeLaSesion` y `SafetyEngine.evaluar`— contra SQLite real con el esquema
de la migración. Ninguna tocó la consola.

### Lo que hay que aprender, que no es el agujero

**Once afirmaciones falsas escritas en un solo commit**, y la mayoría de la misma
forma: una justificación convincente al lado de una decisión correcta.

- **El motivo de `referenceMode: null` contradecía una medición del propio
  repositorio.** Decía que «dónde cae el medidor respecto del fader no se midió»,
  y está medido desde el 2026-09-09 —el fader está aguas abajo, y el compromiso
  99b lo usa como su testigo fuerte—. Estaba en tres lugares, **uno de ellos el
  mensaje de un test**. La decisión sigue en pie por el motivo verdadero: los
  cuatro valores nombran un **envío** y esto es el medidor propio.
- **El test decía ejercitar el orden de los parámetros del `INSERT` y no lo
  ejercitaba**: la lista era una copia a mano, y permutar dos columnas en
  producción dejaba la suite entera en verde. **Es el mismo defecto que ese commit
  dijo arreglar, en el renglón de al lado.**
- **El test de la calibración era tautológico**: comparaba contra la constante
  importada, así que cambiarle la forma al centinela pasaba en verde.
- **«Tres copias del `INSERT`» eran dos.** Cuarta cuenta falsa en un mensaje de
  commit de este repositorio.
- **La cronología estaba mal contada en dos documentos.** La frase de la lista
  vacía se escribió a la 01:03 del 2026-09-18 **siendo cierta** y dejó de serlo a
  las 20:24 del **mismo** día: era una afirmación y no dos, y no fue «el día
  siguiente».
- **Enumeraba siete condiciones y listaba seis.** El motivo de la guarda de sesión
  era falso —una fila huérfana **sí** la encuentra quien pregunte por ese mismo
  identificador—. El comentario de los 50 ms tenía tres errores, incluido «cuatro
  órdenes de magnitud» cuando son doscientas veces. `sampleRate` no es la cadencia
  del medidor sino la del sondeo. Y un comentario justificaba un peligro que **no
  puede ocurrir**, citando un precedente que no aplica.
- **Dos docblocks quedaron describiendo la función equivocada** al insertar los
  métodos nuevos, y uno era el que guarda la evidencia de los dos canales
  mezclados. Devueltos a su sitio.

Ninguna de las once la habría encontrado la suite: todas estaban verdes.

### La guarda nueva, y su propio agujero

`validate-escucha-anotada.mjs` mira que producción siga guardando y anotando,
porque los tests prueban la maquinaria y **siguen pasando enteros si alguien borra
cualquiera de las dos llamadas**. Se le agregó una tercera regla que ningún test
podía cubrir: **quien guarda una escucha tiene que mirar la conexión**.

**Y su primera versión tenía el agujero que dice tapar**, por segunda vez en dos
commits: buscaba el nombre y contaba la definición como llamada. La auditoría la
burló además por la mención dentro de una cadena de texto y por un `//` pegado a
dos puntos; las dos se taparon. **Las que no tienen arreglo por texto quedan
nombradas en su docblock**: la llamada que está y siempre pasa `null`, y la que
vive en código muerto.

### Lo que la auditoría confirmó

Que el orden temporal se sostiene en la cadena completa y no sólo en la función
—una medición anterior a la escritura no pasa, ni un milisegundo antes—; que
reusar una medición sobre la **misma** ruta compra exactamente un paso y después
el motor corta; que ningún campo de una medición real vuelve distinto de la base;
y que los topes declarados se cumplen —la rampa honesta corta en 6,0 dB con
`ACUMULADO_EXCEDIDO`—.

## Lo que falta de la pieza 1

**Dos cosas, y las dos son la misma pantalla.**

1. **La pantalla por músico** —decisión del usuario—: se elige a alguien y se ve
   su cuña con todo lo que le llega, su propio instrumento primero. **Y tiene que
   saber pedir el resto en el último paso**: con pasos fijos de 2 dB nominal es
   inalcanzable, la rampa se queda a 0,138 dB. **Eso no necesita tocar el motor**:
   el asistente ya acepta cualquier subida hasta 2 dB, así que pedir los últimos
   0,138 es una cuenta de la pantalla.
2. **El acto de marcar «así está bien»**, que es lo que hoy no existe. Mientras no
   exista, **toda cuña vive permanentemente en la primera operación**: sin
   presupuesto acumulado, con techo en nominal, 2 dB por paso y escucha obligatoria
   entre pasos.

**El hueco de las mediciones se cerró a medias, y hay que saber de qué mitad.** La
lectura estaba hecha desde el 2026-09-18 y **la escritura desde el 2026-09-19**:
la pantalla de ganancia guarda su ventana y anota el identificador. Lo que sigue
abierto es **el envío a monitor**, y no por falta de código:
`EnvioAMonitorService` **no mide**. Quien va a capturar ahí es la pantalla por
músico.

## Lo que hay abierto, fuera de la pieza 1

Las listas siguen en
[`2026-09-17b-donde-quedamos.md`](2026-09-17b-donde-quedamos.md). Están los **nueve
hallazgos del 2026-09-18** en
[`hallazgos-de-la-auditoria-del-censo-2026-09-18.md`](../backlog/hallazgos-de-la-auditoria-del-censo-2026-09-18.md),
uno cerrado, y **cinco nuevos** en
[`hallazgos-de-las-auditorias-de-la-escucha-2026-09-19.md`](../backlog/hallazgos-de-las-auditorias-de-la-escucha-2026-09-19.md).

**Ninguno está en el camino de la pieza 1.** El más grande de los nuevos: **una
sola medición guardada autoriza el segundo paso de las 24 ganancias** —96 dB con
una fila— porque nadie cruza el canal de la medición contra la ruta. No está
expuesto por la pantalla de hoy, que empareja cada transacción con la medición de
su propio canal, pero **pasó de inalcanzable a estar a una línea**: es la misma
tarea que ADR-035 nombra como «el tope es por clave y el oído es por parlante».

Y de los del 2026-09-18, el más accionable sigue siendo el compresor y la puerta
de los auxiliares —190 claves— que se rechazan citando un motivo **falso**.

## El estado del equipo del usuario

**Esta sesión no midió nada con audio y no le escribió nada a la consola.** Sólo
se le pidió el estado cero veces: no hizo falta. El banco sigue como el
2026-09-16 y el último volcado comparado es el del 2026-09-18 —6665 claves, cero
diferencias—.

Sigue valiendo:

- **El servicio de audio de la Mac se traba y el síntoma se lee como un permiso
  denegado.** Se cura con `sudo killall coreaudiod`, lanzable por SSH. Ver
  [el hallazgo](../backlog/hallazgo-el-audio-de-la-mac-se-traba-y-parece-un-permiso.md).
- **El usuario opera la MacBook a distancia**, por SSH y AnyDesk. No se puede mover
  ningún cable del banco ni tocar la perilla de la Scarlett hasta que vuelva.
- **Antes de meter tonos sostenidos, mirar las cuatro claves del supresor que están
  en 1**: la global, la de la mezcla y las de los auxiliares 1 y 2, que son cuñas.
- **Nunca borrar los snapshots guardados.** Es la única prohibición absoluta.
- **El fader del canal no llega a las cuñas**: los 320 envíos a auxiliar están
  antes del fader. Lo que sí llega es el ecualizador.
- **Hay dos pares estéreo activos**: las entradas de línea y el reproductor.

## Cómo arrancar la próxima sesión

El prompt para pegar después de un `/clear` está en
[`2026-09-19b-prompt-para-retomar.md`](2026-09-19b-prompt-para-retomar.md).

**Y hay que escribírselo en el chat, no sólo dejarlo acá.** Lo pidió el
2026-09-19: trabaja por SSH y AnyDesk, así que un entregable que tiene que
**copiar** y que vive sólo en un archivo es un entregable que no le llegó. El
archivo queda para auditar; la copia va en la respuesta.
