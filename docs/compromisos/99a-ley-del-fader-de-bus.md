# 99a — La ley del fader de un bus auxiliar

**Fecha: 2026-09-12.** Consola 192.168.0.78, fw 3.4.8318-ui24. Canal 10 (`i.9`),
la línea de la Scarlett. Auxiliar 5 (`a.4`). Contrato escrito **antes** de tocar
la consola.

## Por qué hace falta

El usuario decidió el 2026-09-12, eligiendo entre opciones, que la aplicación
pueda **bajar el auxiliar y el general** para cazar un acople: «*Los dos, con
techo*». Es literalmente el primer paso de su método.

`a.N.mix` va de 0 a 1 y nadie sabe a cuántos decibeles corresponde. Sin ese eje
no se puede declarar un límite en dB, e **INV-004 rechaza todo parámetro sin
límite declarado**. Es exactamente lo que mantuvo cerrado el envío a monitor
hasta que la medición 94 lo acotó.

**Y es una ruta de las peligrosas**: `a.N.mix` no es el envío de un canal, es
**el volumen entero de esa cuña**. Por eso el motor la cierra hoy con su lista
blanca, y por eso abrirla va a necesitar su propio ADR además de esta medición.

## Por qué el auxiliar 5, y por qué no hace falta conectar nada

**El 5 (`a.4`) está limpio**, verificado por HTTP antes de escribir el contrato:
fader en 0, sin silenciar, sin enlace estéreo, `afs.enabled = 0`, cero filtros y
**cero canales mandándole**. No arrastra ni un notch de un show anterior, que es
lo que descalificó al auxiliar 1 en la medición 94.

**Y no hace falta que haya nada enchufado.** Los medidores están en el DSP, antes
del conector: la consola no sabe si hay un cable del otro lado. La medición 94 ya
barrió 27,87 dB a través del medidor del auxiliar 3 con nada conectado a ningún
auxiliar, y su evidencia está archivada.

*(Esto quedó dicho porque el agente afirmó lo contrario —«sin una cuña conectada
no puedo medir la ley de `a.N.mix`»— y se contradijo a sí mismo un mensaje
después. Lo encontró el usuario preguntando qué cambiaba al conectar. No cambia
nada.)*

## El método, y el testigo que viene incluido

El bloque de un auxiliar es una tira mono de cinco bytes, y los dos primeros son
lo que hace falta:

- **`+0` (`pre`) está ANTES del fader del bus** — medido el 2026-09-09 moviendo
  `a.0.mix`: no se movió.
- **`+1` (`post`) está DESPUÉS** — el mismo día: siguió al fader hasta cero.

Así que el experimento se cierra sobre sí mismo:

1. Fuente quieta: tono de 1 kHz por la Scarlett, la ganancia del previo sin
   tocar.
2. Se abre el envío del canal 10 al auxiliar 5 al máximo, para que el bus tenga
   la mayor señal posible y el barrido tenga recorrido antes de tocar el piso.
3. Se barre `a.4.mix` de arriba hacia abajo, y **la atenuación de `post`
   respecto del tope del barrido es la ley del fader del bus**.
4. **Dos testigos, no uno.** El `pre` del auxiliar tiene que quedarse quieto
   —está antes del fader— y el `pre` del canal también —está antes de todo—. Si
   se mueve el del canal, se movió la fuente; si se mueve el del auxiliar y el
   del canal no, se movió algo entre el canal y el bus, que sería un hallazgo
   por sí solo.

**Todo se expresa como atenuación respecto del tope del barrido, no como valores
absolutos.** `pre` y `post` son tomas distintas y no hay motivo para suponer que
comparten referencia; suponerlo sería inventar un dato.

## Las expectativas

Falsables, con su umbral, antes de correr. **El umbral es de dos escalones
—0,667 dB— en todo lo que sea una diferencia de dos lecturas**, que es el caso
de toda atenuación de esta corrida.

| # | Predicción | Qué la falsaría |
|---|---|---|
| **F1** | **El `pre` del auxiliar no se mueve** al mover el fader del bus, más de 0,667 dB en todo el barrido | Que se mueva. Reabriría qué es el byte `+0`, que está medido en un solo bus (`a.0`) y un solo día |
| **F2** | **El `pre` del canal no se mueve** más de 0,667 dB | Que se mueva: la fuente cambió y la corrida no vale |
| **F3** | **La atenuación de `post` no se desvía de `faderADb` más de un escalón** del medidor en el tramo útil | Que se desvíe. Sería la primera evidencia de que un fader de bus no usa la misma ley que el fader de canal |
| **F4** | **Ida y vuelta.** El mismo crudo da la misma atenuación bajando y subiendo, dentro de 0,667 dB | Que no. Habría histéresis o falta de asentamiento, y los puntos afectados no valdrían |
| **F5** | **Recorrido útil de al menos 20 dB** antes de que `post` toque el piso del medidor | Menos. Un tramo corto no separa `faderADb` de una curva parecida: es exactamente lo que le pasó a la primera corrida de la 94, que con 18 dB no pudo decidir |

## Lo que esta corrida NO va a poder decir

- **Nada sobre `m.mix`.** El general es otra ruta y va en otra medición: mover el
  fader del general con un tono sonando **cambia el volumen de la sala**, y eso
  se hace con el usuario presente o con su permiso explícito.
- **No prueba que `a.N.mix` deba abrirse.** Medir la ley es el requisito de
  INV-004, no la decisión. Abrirla necesita su propio ADR, con el techo y el
  estado de sesión razonados, igual que lo necesitó el envío a monitor.
- **Un bus de diez, un día, una frecuencia, un nivel de fuente.** Nada sobre los
  otros nueve auxiliares, ni sobre los subgrupos, ni sobre los efectos —que
  además son estéreo y tienen otro reparto de bytes—.
- **Esto es autoconsistencia y no calibración**: se contrasta un medidor de la
  consola contra la ley que otro medidor de la misma consola sostiene. Todos los
  dB son de la escala del medidor, **no dBFS**.
- **Y si `post` sigue a `faderADb` dentro de un escalón, eso es una cota y no
  una identidad.** Dice que si hay diferencia es menor que la resolución del
  instrumento. **No dice que sean la misma ley** — es exactamente lo que la 94
  declaró indecidible para el envío, y la tentación de escribir «el fader del
  bus usa la ley del fader» va a estar ahí igual.

## Restauración

Se escribe `i.9.aux.4.value` y `a.4.mix`. Los dos valores previos **se leen del
aparato** con `exigirClave`, que falla si la lectura no llegó en vez de suponer;
hoy los dos están en 0. La restauración va por `conRestauracion`, que corre
también si llega una señal, y se comprueba **releyendo por HTTP** —un camino
distinto del WebSocket que escribió—.

El supresor del general se apaga mientras el tono suena y se restaura, por la
misma razón de siempre: un tono sostenido le planta notches de −18 dB.
