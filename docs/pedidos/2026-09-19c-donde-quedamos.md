# Dónde quedamos — tercer cierre del 2026-09-19

**Para quien retome.** Reemplaza a
[`2026-09-19b-donde-quedamos.md`](2026-09-19b-donde-quedamos.md) en lo que cambió
y lo deja en pie en el resto. Las listas de tareas **siguen viviendo en**
[`2026-09-17b-donde-quedamos.md`](2026-09-17b-donde-quedamos.md), y sigue valiendo
todo lo que los cierres anteriores dicen del banco, del servicio de audio de la
Mac y de cómo el usuario pide que se trabaje.

**Este documento apunta, no repite.** Cada número vive en su contrato o en su
hallazgo, que es el único sitio donde se corrige cuando cambia.

## Lo primero: la regla del foco se respetó

No se midió nada con audio, **no se le escribió nada a la consola y no se le pidió
el estado ni una vez**: no hizo falta para la pieza en curso. Lo único que se leyó
de afuera fueron los cuatro repositorios de terceros, clonados y grepeados, porque
la disciplina lo exige antes de proponer.

## Lo que se hizo: dos tareas de la pieza 1 y su corrección, tres commits

Rama `claude/soundcraft-ui24-assistant-kh8ezj`, sincronizada en `f7f44b1`, árbol
limpio, `npm run verificar` en verde. **No se abrió ningún PR**: nadie lo pidió.

El usuario eligió arrancar por **que la cuña escuche**. Al empezar apareció que el
molde de la ganancia no servía, y eso se le preguntó antes de escribir nada.

### La asimetría que cambió la forma de la tarea

**La ganancia está aguas arriba del medidor del canal, así que moverla lo mueve.
El envío a una cuña no**: deriva del canal hacia el bus y está antes del fader, de
modo que subirlo **no mueve el medidor del canal ni un escalón**. Copiar el molde
habría dejado la aplicación afirmando «acá se escuchó» sobre una cuña muda, paso
tras paso, hasta el techo de nominal.

**Decisión del usuario, entre tres opciones: los DOS medidores.** El del músico
prueba que tocó; el de la cuña, que a su parlante le llegó algo. Está en
[ADR-036](../adr/ADR-036-la-escucha-de-una-cuna-se-comprueba-sobre-dos-medidores.md),
con el detalle de qué byte se lee y por qué.

### `56eaf6e` — el medidor de la cuña llega a la aplicación

La cola de la trama se decodificaba desde el 2026-09-09 y **sólo la leían los
guiones de medición**. Se lee el byte de **después del fader del auxiliar**, que es
lo que sale hacia el parlante; se expone también el de antes, porque la diferencia
entre los dos **es ese fader** y es lo único que explica una cuña que recibe señal
y no suena.

También se enseñó al constructor de tramas a armar la cola: declaraba cero
auxiliares, así que cualquier lector de esa sección pasaba en verde sin leer un
byte de cuña.

### `7ab9c59` — la cuña ya se escucha

`EscuchaDeLaCunaService` muestrea los dos medidores **en el mismo tic**, guarda la
ventana y `EnvioAMonitorService.anotarEscucha` la anota. Las series se cruzan **por
instante**: tocar los primeros nueve segundos y que la cuña suene los últimos nueve
es **cero** escucha, no nueve.

### `f7f44b1` — lo que encontraron las auditorías

## Las dos auditorías, que es lo más importante de esta sesión

Adversarial y de fidelidad, acotadas al MVP y a las herramientas, **las dos sobre
la cadena completa** —trama, adaptador, mapeo, `INSERT` y `SELECT` reales contra
SQLite real con el esquema de la migración, `historialDeLaSesion` y el motor—.
Ninguna tocó la consola.

### Lo que hay que aprender, que no es el agujero

**Una afirmación falsa en CINCO lugares, y de la forma que este repositorio
persigue.** Se escribió que cierto barrido usó el fader del auxiliar en 0,45
«justamente porque mueve un medidor y deja el otro quieto». Es falso: ese barrido
fue otro, sobre otro auxiliar, y el que se citó dice con todas las letras que no
tocó ese fader.

**La conclusión no cambia: cambia por qué se sostiene. Y lo instructivo es que la
evidencia verdadera era MÁS FUERTE que la inventada y estaba en el archivo que se
estaba leyendo para escribir eso** —el 2026-09-09 se movió el fader de un auxiliar
y se vio cuál de los dos medidores lo seguía—. Se agarró un motivo que sonaba bien
en vez del que estaba ahí.

Las otras: **31 bandas donde hay 122**; **«igual que los canales» donde es al
revés**, contradiciendo un docblock del mismo commit; y **«los nueve tests» donde
son ocho de nueve**. Y dos motivos retirados por no sostenerse.

**Y una más cara que las cuatro:** un comentario decía que cerrar la caída de
conexión a mitad de la ventana «pide mirar la frescura de las tramas y es una tarea
aparte». **Medido que no**: la aplicación ya sabe cuándo se cae, y sólo lo pregunta
una vez, al final, cuando ya lo está preguntando cada 50 ms. Presentar como caro
algo que cuesta una línea es peor que no decir nada.

### La guarda, burlada tres veces más

`validate-escucha-anotada.mjs` ganó una regla —que producción siga pasando el
medidor de la cuña— y **su primera versión no cazaba su propio caso**, por cuarta
vez en el repositorio. Después la auditoría la burló por tres vías más: un literal
suelto en cualquier archivo, una declaración escrita sin `readonly`, y un falso
positivo. **Hoy distingue por cómo termina la línea** y exige que el archivo llame
a donde la serie tiene que llegar. Las tres reproducidas y cazadas.

### Lo que las auditorías confirmaron

Que series vacías, un auxiliar que no existe y `NaN`/`Infinity` en cualquiera de
las dos series **fallan cerrado**; que las series no se pueden desalinear por el
camino de producción; que reusar una medición para un segundo paso de la **misma**
ruta se rebota; y que las cuatro afirmaciones sobre los cuatro repositorios de
terceros son exactas, comprobadas clonando.

## Lo que falta de la pieza 1, y en qué orden conviene

**Dos tareas, y la primera sostiene a la segunda.**

1. **Que la escucha sea de verdad.** Los dos agujeros medidos, en
   [`hallazgos-de-las-auditorias-de-la-cuna-2026-09-19.md`](../backlog/hallazgos-de-las-auditorias-de-la-cuna-2026-09-19.md)
   con sus números: alcanza con que cada medidor se mueva **un escalón una sola
   vez** en los dieciocho segundos, así que **dos segundos de música con ambiente
   alrededor declaran dieciocho**; y una caída dentro de la ventana **cuesta una
   sola muestra**. **Los dos son heredados de la escucha de ganancia** —comprobado,
   la misma ventana por ese camino da lo mismo— así que arreglarlos arregla las dos
   herramientas. Ninguno está expuesto hoy, **y los dos los estrena la pantalla que
   sigue**.
2. **La pantalla por músico**, que cierra la pieza 1. Se elige a alguien y se ve su
   cuña con todo lo que le llega, su propio instrumento primero. Tiene que **saber
   pedir el resto en el último paso** —con pasos fijos de 2 dB la rampa se queda a
   0,138 dB del nominal, y eso es una cuenta de la pantalla: el asistente ya acepta
   cualquier subida hasta 2 dB—. Y trae **el acto de marcar «así está bien»**, que
   hoy no existe: mientras no exista, toda cuña vive permanentemente en la primera
   operación.

**La mecánica de escuchar ya está entera; lo que falta es quien la encadene.**
Subir, escuchar y anotar son tres llamadas y la orquestación vive afuera **a
propósito**: el músico tiene que ver la cuenta regresiva y poder cancelar.

## Lo que hay abierto fuera de la pieza 1

Las listas siguen en
[`2026-09-17b-donde-quedamos.md`](2026-09-17b-donde-quedamos.md). Los hallazgos
están en tres documentos: los
[nueve del 2026-09-18](../backlog/hallazgos-de-la-auditoria-del-censo-2026-09-18.md),
los [cinco de la escucha](../backlog/hallazgos-de-las-auditorias-de-la-escucha-2026-09-19.md)
y los [seis de la cuña](../backlog/hallazgos-de-las-auditorias-de-la-cuna-2026-09-19.md).

**Uno creció y conviene saberlo antes de la pantalla:** que el motor no cruce el
canal de la medición contra la ruta ahora deja que **una sola escucha autorice ocho
rutas en paralelo**, medido. No es mala fe: la pantalla por músico escucha una vez
y tiene varias rutas del mismo músico a mano, así que **es el error que la pieza
siguiente está invitada a cometer**. Es la misma tarea que ADR-035 nombra como «el
tope es por clave y el oído es por parlante».

## El estado del equipo del usuario

**Esta sesión no midió nada, no escribió nada y no le pidió el estado a la
consola.** El banco sigue como el 2026-09-16 y el último volcado comparado es el
del 2026-09-18. Sigue valiendo todo lo que el cierre anterior dice: el servicio de
audio de la Mac que se traba y parece un permiso, que el usuario opera la MacBook a
distancia, las cuatro claves del supresor antes de meter tonos, y que **nunca se
borran los snapshots**.

## Cómo arrancar la próxima sesión

El prompt está en
[`2026-09-19c-prompt-para-retomar.md`](2026-09-19c-prompt-para-retomar.md), y
**acotado a propósito a las dos tareas que siguen**: el usuario pidió el 2026-09-19
que no lleve nada que no sirva para eso. **Va también escrito en el chat**, porque
trabaja por sesión remota y un entregable que tiene que copiar y vive sólo en un
archivo es un entregable que no le llegó.
