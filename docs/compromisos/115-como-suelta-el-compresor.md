# 115 — ¿El compresor suelta con constante de tiempo o con pendiente constante?

## MEDIDO el 2026-09-16: no es pendiente constante. Y la relajación sigue sin explicarse.

Evidencia:
[`como-suelta-el-compresor-2026-09-16.txt`](../spikes/SPK-P0.10b-vu2/evidence/como-suelta-el-compresor-2026-09-16.txt).
Los cuatro controles en verde, incluido el nuevo: **15,42 dB** de reducción alta
contra **6,64** de baja, o sea 8,78 de diferencia sobre un mínimo de 5.

### La decisión

| | cociente medido (t63 con poca reducción / con mucha) |
|---|---|
| lo que predice una **pendiente constante** | **0,431** |
| lo que predice una **constante de tiempo** | **1,00** |
| **ataque, medido** | **0,888** |
| **relajación, medido** | **1,309** |

**La pendiente constante queda refutada, y por partida doble.** En el ataque el
cociente está cerca de 1 y lejos de 0,43. En la relajación **ni siquiera baja: sube**
— con menos reducción que recuperar, el compresor tarda *más*, que es lo contrario
de lo que hace una pendiente en decibeles por segundo.

**Así que la hipótesis que el ítem 114 dejó anotada para explicar el desacuerdo de
la relajación es falsa.** El factor de 0,24 entre lo medido y lo que muestra la
pantalla **no viene de la profundidad**.

### La forma, ahora con nueve posiciones

| | constante contra la fórmula del cliente | dispersión máxima | puntos |
|---|---|---|---|
| **ataque, t63** | **0,641** | **2,1 %** | 7 |
| **relajación, t63** | **0,240** | 26,5 % | 8 |

**El ataque queda cerrado como forma.** Siete posiciones, un recorrido de 400 a 1,
y el cociente no se mueve más del 2 %. `400^desqr(V)` describe bien cómo reparte
el control, y lo que cambia es sólo la escala.

**La relajación no.** Con 26 % de dispersión y una repetibilidad que llega al 20 %
en varias posiciones, **el instrumento no la resuelve con la calidad con la que
resuelve el ataque**. No es que la fórmula esté mal: es que esta corrida no lo
puede afirmar.

### Lo que queda establecido, y lo que no

**Establecido:**

1. El compresor **no** suelta con pendiente constante en dB/s.
2. La forma del **ataque** es la de la fórmula del cliente, con factor **0,641**
   sobre el t63, medido en siete posiciones.
3. La diferencia entre lo medido y lo que muestra la pantalla **no se explica por
   la profundidad de la reducción**.

**No establecido:**

- **Por qué la relajación mide 0,24.** Sigue abierto, y ahora con una explicación
  menos.
- **Por qué el cociente de la relajación da 1,31 y no 1,0.** Que tarde *más* con
  menos reducción no tiene una lectura obvia. Puede ser del aparato o del
  instrumento —con 6,6 dB de excursión la envolvente tiene menos señal contra el
  ruido y el cruce del 63 % se vuelve sensible—, y **esta corrida no lo separa**.
- **Si la relajación sigue la misma forma.** Con 26 % de dispersión, no se afirma.

### Por qué el ataque tampoco entra todavía en la tabla

**Y el motivo ya no es la medición: es de producto, y lo decide el usuario.**

La app y la consola hablarían números distintos. Si la aplicación dice «ataque
20 ms» queriendo decir el t63 medido, **la pantalla de la consola va a mostrar
31**. El usuario ve dos números para lo mismo.

Hay dos salidas, y son incompatibles:

- **Hablar en los números de la consola**, para que coincidan con lo que el
  usuario ve en su tablet, sabiendo que no son los milisegundos reales.
- **Hablar en milisegundos medidos**, que es lo que de verdad hace el aparato, a
  costa de no coincidir con la pantalla.

**Eso no lo decide una medición.** Queda anotado para el usuario.

---


**Contrato escrito el 2026-09-16, ANTES de tocar la consola.** Consola
192.168.0.78. Canal 10 (`i.9`) → general → entrada 1 de la Scarlett.

## Qué decide, y por qué es la pregunta correcta

El [ítem 114](114-los-tiempos-del-compresor.md) midió los tiempos y dejó un
desacuerdo sin explicar:

| | lo medido contra lo que predice el cliente |
|---|---|
| ataque, t63 | **0,645** |
| relajación, t63 | **0,233** |

**Si fuera sólo una convención distinta para contar el mismo tiempo, los dos
factores serían parecidos.** No lo son, y por casi el triple.

**La hipótesis que lo explicaría** es que el compresor no suelte con una constante
de tiempo sino con una **pendiente constante en decibeles por segundo** — que es
como funcionan muchos compresores—. En ese caso «el tiempo de relajación» del
fabricante sería *cuánto tarda en recuperar una cantidad fija de decibeles*, y lo
medido dependería de cuánta reducción hubiera que recuperar.

**Y eso se distingue con una sola cosa: medir a dos profundidades.**

| Si el compresor es… | Al medir con la mitad de reducción, el t63… |
|---|---|
| una **constante de tiempo** (exponencial) | **no cambia** |
| una **pendiente constante** (dB por segundo) | **cae a la mitad** |

No hay forma de que las dos den lo mismo. Es un experimento que decide.

## Y hay un dato del 114 que ya apunta en esa dirección

El cociente **t90 / t63** medido dio **2,0** en las cuatro posiciones del ataque.

- Una **exponencial pura** daría **2,30**.
- Una **rampa lineal** daría **1,43**.

Está en el medio, más cerca de la exponencial. **Eso no decide nada por sí solo**
—un detector de dos etapas da cualquier cosa entre las dos— y se anota porque
sostiene que la pregunta vale la pena, no como respuesta.

## Qué se mide

Lo mismo que el 114, con dos cambios:

1. **Rejilla más densa**: nueve posiciones del control en vez de cinco, para que
   la forma quede determinada por los datos y no por cuatro puntos.
2. **Dos profundidades de reducción**: una alta —unos 15 dB, la del 114— y una
   baja —unos 7 dB—. La profundidad se **calibra moviendo el umbral** hasta dar
   con la reducción buscada, y **se informa la que se logró**, no la que se quería.

## Los controles

**Los tres del 114, sin aflojar ninguno**: C1 el tono llega con 45 dB de margen,
C2 el escalón es limpio con el compresor puenteado, C3 hay reducción medible.

**Y uno nuevo, C4 — las dos profundidades son de verdad distintas.** La reducción
alta tiene que ser al menos **5 dB mayor** que la baja. Sin eso, «no cambió con la
profundidad» sería cierto por no haber cambiado la profundidad, y la conclusión
—«es una constante de tiempo»— saldría de la nada.

## Las expectativas, declaradas antes de mirar

- **L1 — monotonía** en las nueve posiciones, en los dos controles.
- **L2 — el ataque sigue siendo más rápido que la relajación** en el mismo crudo.
- **L3 — repetibilidad** dentro del 20 %.
- **L4 — la decisión.** Se informa el cociente entre el t63 con reducción baja y
  el t63 con reducción alta:
  - cerca de **1,0** → constante de tiempo;
  - cerca de la **razón de profundidades** → pendiente constante;
  - en el medio → **ninguna de las dos**, y se dice así.

**Esta corrida puede terminar sin decidir, y eso está declarado de antemano.** Si
el cociente cae en el medio, lo honesto es publicar que el compresor no es ni una
cosa ni la otra, no elegir la que más convenga.

## Lo que esta corrida NO va a decir

- **Nada de la puerta.**
- **Nada con señal real.** Un tono no es una voz.
- **Nada de la rodilla**, que se lee y se deja.
- **Nada del compresor del general.**
- Una frecuencia, un canal, un día, dos profundidades.

## Qué se escribe, y qué vuelve

Las mismas claves del [114](114-los-tiempos-del-compresor.md), con su `PREVIO`,
su `conRestauracion`, su papelito y su relectura por HTTP. **El umbral se mueve
más que en el 114** —es lo que calibra la profundidad— y vuelve igual.

**El fader del general no se toca.**

## Trabajo previo

**Buscado el 2026-09-16 con los cuatro repositorios clonados**, y en casa.

- **Ninguno de los cuatro convierte los tiempos a milisegundos**, así que menos
  todavía dice cómo suelta. Ver
  [`trabajo-previo-de-terceros.md`](../referencia/trabajo-previo-de-terceros.md).
- **El manual del fabricante** da los rangos —«Release 10ms - 2000ms»— y **no dice
  la convención**: ni si es exponencial, ni sobre cuántos decibeles se cuenta. Esa
  ausencia es justamente lo que hace falta medir.
- **Propio, ítem 114**: midió los tiempos y dejó este desacuerdo escrito, con el
  experimento que lo resolvería. Esto es ese experimento.
- **Propio, ítem 98**: midió la superficie del compresor con cada punto asentado,
  o sea deliberadamente sin tiempos. No aporta a esta pregunta y se dice.

**Nadie publicó cómo suelta este compresor.** Sin segunda implementación, un
resultado raro no tiene con qué contrastarse: hay que tener más cuidado, no menos.
