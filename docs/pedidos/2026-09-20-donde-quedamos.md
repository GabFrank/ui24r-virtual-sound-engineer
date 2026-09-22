# Dónde quedamos — 2026-09-20

**Para quien retome.** Reemplaza a
[`2026-09-19c-donde-quedamos.md`](2026-09-19c-donde-quedamos.md) en lo que cambió y
lo deja en pie en el resto. Las listas de tareas **siguen viviendo en**
[`2026-09-17b-donde-quedamos.md`](2026-09-17b-donde-quedamos.md), y sigue valiendo
todo lo que los cierres anteriores dicen del banco, del servicio de audio de la Mac
y de cómo el usuario pide que se trabaje.

**Este documento apunta, no repite.**

## Lo más importante de la sesión no es un commit: es una regla

El usuario preguntó de frente si estábamos haciendo el trabajo justo o
sobre-ingenierizando. La respuesta honesta fue **que sí nos estábamos pasando, y en
un lugar medible**: la mecánica de la cuña estaba entera, probada y auditada, y
**ninguna pantalla la llamaba**; había siete decisiones aceptadas sin implementar; y
de los cinco commits del día, **tres fueron arreglar cosas mal escritas o endurecer
una guarda que vigila a otra guarda**.

De ahí salió **«La regla que manda sobre esta tabla»**, escrita en
[`2026-09-17-recapitulacion-y-hoja-de-ruta.md`](2026-09-17-recapitulacion-y-hoja-de-ruta.md),
**antes** de la tabla de la hoja de ruta. En una línea: **un hallazgo medido y
anotado no es una tarea; entra cuando el campo lo encuentre**, y mientras haya una
pieza de la hoja de ruta que no existe, esa gana. Con sus tres preguntas y con lo
que la regla NO afloja, que es el rigor.

Los tres documentos de hallazgos llevan ahora un encabezado que dice que
**esperan al campo**.

## Los cinco commits, en orden

| | Qué |
|---|---|
| `f474e54` | La frase retractada sobre «la frescura de las tramas» seguía en cuatro lugares más: se corrigió uno de cinco y se declaró hecho |
| `893057f` | **La consola se consulta en cada tic**, no una vez al final. Cierra la caída que empieza y termina dentro de la ventana |
| `593da56` | **Qué cuenta como que el músico tocó**: movimiento y cerca del pico de la propia escucha ([ADR-037](../adr/ADR-037-que-cuenta-como-que-el-musico-estaba-tocando.md)) |
| `c18a8a3` | Las dos auditorías: **el agujero no estaba cerrado**, y cuatro afirmaciones más eran falsas |
| `8428828` | La guarda se dejaba engañar por cuatro vías, más el tiempo basura y el conteo de lo no oído |

Árbol limpio, `npm run verificar` en verde, **ningún PR abierto**: nadie lo pidió.

## Lo que hay que saber de lo que quedó abierto

**Una sala viva, sin que nadie toque, todavía le compra a la aplicación un paso de
2 dB sobre una cuña.** Medido, con sus números, en el hallazgo 1 de
[`hallazgos-de-las-auditorias-de-la-cuna-2026-09-19.md`](../backlog/hallazgos-de-las-auditorias-de-la-cuna-2026-09-19.md),
y **hay un test que lo afirma en vez de esconderlo** --`AGUJERO ABIERTO: una sala
VIVA, sin nadie tocando, concede el paso`, con la instrucción de borrarlo el día
que pase a `false`--.

**Daño máximo: dos pasos de 2 dB, con techo en nominal**, porque el motor acota el
envío a monitor a 4 dB por sesión. Con el usuario parado ahí, escuchando.

**La salida técnica está identificada y decidida** --comparar contra una ventana de
referencia del mismo canal, con el músico callado a propósito-- **y NO se construye
todavía**, por la regla de arriba. Desde un solo medidor, «el músico tocó» y «su
micrófono tomó a la banda» se ven iguales, así que ningún número mejor lo arregla.

Los otros que esperan: la cuña movida por otra fuente (hallazgo 7), el límite de la
fuente quieta (8), `duracionS` sin atar al reloj (9), y cancelar una escucha que
deja la pantalla en «lista» y guarda una fila espuria (10) --éste lo estrena la
pantalla que sigue--.

## Lo que sigue, y es lo único que sigue

**La pantalla por músico**, que cierra la pieza 1. Es lo único que falta de esa
pieza: subir, escuchar y anotar están enteros, probados y auditados, y **nadie los
llama**.

Son dos cosas y las dos son la misma pantalla:

- **Se elige a alguien y se ve su cuña** con todo lo que le llega, su propio
  instrumento primero. Tiene que **saber pedir el resto en el último paso**: con
  pasos fijos de 2 dB la rampa se queda a 0,138 dB del nominal, y eso es una cuenta
  de la pantalla, no del motor.
- **El acto de marcar «así está bien»**, que hoy no existe. Mientras no exista,
  toda cuña vive permanentemente en la primera operación.

**La pantalla es la que ENCADENA** subir, escuchar y anotar. La orquestación vive
afuera de los servicios **a propósito**: el músico tiene que ver la cuenta
regresiva y poder cancelar.

**Y el error que esta pieza está invitada a cometer:** el motor no cruza el canal de
la medición contra la ruta, así que **una sola escucha autoriza ocho rutas en
paralelo**, medido. La pantalla escucha una vez y tiene varias rutas del mismo
músico a mano. Es la misma tarea que ADR-035 nombra como «el tope es por clave y el
oído es por parlante».

## El estado del equipo del usuario

**Esta sesión no midió nada con audio, no le escribió nada a la consola y no le
pidió el estado ni una vez.** Lo único que se leyó de afuera fueron los cuatro
repositorios de terceros, clonados y grepeados dos veces --una para proponer y otra
para auditar la propuesta--.

Sigue valiendo todo lo del cierre anterior: el servicio de audio de la Mac que se
traba y parece un permiso, que el usuario opera la MacBook a distancia, las cuatro
claves del supresor antes de meter tonos, y que **nunca se borran los snapshots**.

## Cómo arrancar la próxima sesión

El prompt está en
[`2026-09-20-prompt-para-retomar.md`](2026-09-20-prompt-para-retomar.md), **corto y
apuntado a construir**, porque el usuario lo pidió así el 2026-09-20. Va también
escrito en el chat.
