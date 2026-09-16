# 114 — Los tiempos del compresor: ¿cuánto tarda en apretar y en soltar?

## MEDIDO el 2026-09-16: la forma del cliente acierta; el número, no

Evidencia:
[`tiempos-del-compresor-2026-09-16e.txt`](../spikes/SPK-P0.10b-vu2/evidence/tiempos-del-compresor-2026-09-16e.txt).
Los tres controles en verde: el escalón limpio sin compresor, el tono 85 dB sobre
el piso, y **15,36 dB** de reducción asentada.

### El ataque

| crudo | t63 medido | t90 medido | lo que predice el cliente |
|---|---|---|---|
| 0,00 | en el piso (<5 ms) | en el piso | 1,0 ms |
| 0,25 | **9,0 ms** | 17,5 ms | 13,8 ms |
| 0,50 | **57,0 ms** | 115,0 ms | 89,4 ms |
| 0,75 | **176,0 ms** | 352,5 ms | 275,1 ms |
| 1,00 | **259,0 ms** | 515,5 ms | 400,0 ms |

### La relajación

| crudo | t63 medido | t90 medido | lo que predice el cliente |
|---|---|---|---|
| 0,00 | en el piso (<5 ms) | 7,0 ms | 10,0 ms |
| 0,25 | **25,5 ms** | 63,5 ms | 101,6 ms |
| 0,50 | **120,5 ms** | 296,0 ms | 531,8 ms |
| 0,75 | **322,0 ms** | 783,5 ms | 1436,2 ms |
| 1,00 | **459,0 ms** | 1111,5 ms | 2000,0 ms |

### Lo que esto dice, que es más fino que «coincide» o «no coincide»

**La FORMA de la curva del cliente es correcta.** El cociente entre lo medido y lo
que predice es **constante a lo largo de todo el recorrido**, que abarca un factor
de 400:

| | constante | dispersión |
|---|---|---|
| ataque, t63 | **0,645** | **1,5 %** |
| ataque, t90 | **1,282** | **0,8 %** |
| relajación, t63 | **0,233** | 7,8 % |
| relajación, t90 | **0,571** | 9,5 % |

Que el cociente no se mueva más de un 1,5 % mientras el tiempo crece 29 veces
**no puede ser casualidad**: significa que `400^desqr(V)` describe bien cómo se
reparte el control. Lo que no acierta es el factor de escala.

**Para el ataque, la diferencia es compatible con una definición.** El número del
fabricante cae entre el t63 y el t90 medidos —en el 79 % del asentamiento—, y el
fabricante **no dice qué convención usa**. Eso no es un error suyo ni nuestro: son
dos formas de medir la misma cosa.

**Para la relajación, no.** Ahí ni siquiera el t90 llega: el aparato recupera en
**0,57 veces** lo que dice la pantalla, y con el t63 la diferencia es de más del
cuádruple. Una diferencia de definición explicaría un factor parecido en los dos
controles, y **el ataque da 1,28 donde la relajación da 0,57**. Eso queda como
**pregunta abierta**, no como refutación: puede ser otra convención distinta para
la relajación —recuperar una cantidad fija de decibeles es una de las habituales—
y este banco no lo distingue.

### Lo que el producto puede usar hoy, y lo que no

- **Sí puede confiar en lo relativo.** Si la aplicación dice «duplicá el ataque»,
  mover el control según la fórmula del cliente da el doble de verdad. La forma
  está medida.
- **No puede confiar en los milisegundos de la pantalla**, sobre todo en la
  relajación: lo que la consola muestra como 500 ms recupera, en el audio, en unos
  120 según el t63.

### Por qué NO entra todavía en la tabla de conversión

Porque **la forma no se derivó: se confirmó**. El exponente sale del cliente y lo
medido es el factor de escala. Cuatro puntos con cociente constante son evidencia
fuerte de que la forma es esa, y **no son una derivación independiente**.

Y hay un motivo mejor para esperar: **el desacuerdo entre ataque y relajación está
sin explicar.** Publicar una ley con una inconsistencia de ese tamaño entre dos
parámetros hermanos es exactamente lo que este repositorio termina corrigiendo
después.

**Lo que lo cerraría**, y ahora es barato porque el instrumento funciona: una
rejilla más densa —ocho o diez crudos— y una corrida con otra profundidad de
reducción, que es lo que distinguiría «otra convención» de «otra ley».

### Tres corridas fallaron antes, y las tres por defectos del instrumento

Ninguna por el aparato, y las tres las cazó **C2** —el control que comprueba que
el escalón sea limpio con el compresor puenteado—:

1. [`…-2026-09-16.txt`](../spikes/SPK-P0.10b-vu2/evidence/tiempos-del-compresor-2026-09-16.txt):
   el detector tomaba **el mayor salto de la grabación**, que es el arranque del
   tono y no el escalón. Medía «asentamiento» sobre los seis segundos enteros.
2. [`…-b.txt`](../spikes/SPK-P0.10b-vu2/evidence/tiempos-del-compresor-2026-09-16b.txt):
   buscar el salto más parecido a 18 dB tampoco alcanzó — el arranque es una
   rampa y alguno de sus tramos se le parece.
3. [`…-c.txt`](../spikes/SPK-P0.10b-vu2/evidence/tiempos-del-compresor-2026-09-16c.txt)
   y [`…-d.txt`](../spikes/SPK-P0.10b-vu2/evidence/tiempos-del-compresor-2026-09-16d.txt):
   atado el escalón a su posición conocida, seguía sin encontrarlo. **Dos defectos
   más, y el segundo es el interesante:** el escalón se reparte entre tres
   ventanas de análisis, así que ningún salto entre puntos vecinos superaba el
   umbral; y «no se asienta» devolvía el mismo valor que «no encontré el escalón»,
   con lo que **C2 no podía distinguir su éxito de su fracaso**.

La corrida `d` es la que lo resolvió, porque el guion **imprimió la envolvente** en
vez de decir sólo «no lo encontré». El escalón estaba perfecto —17,9 dB a los
3040 ms, sin asentamiento— y el problema era de quien lo buscaba.

**Vale la pena decirlo así:** las tres veces el control positivo hizo exactamente
lo que tiene que hacer un control positivo, que es fallar cuando el instrumento
está roto y no cuando el resultado no gusta.

---


**Contrato escrito el 2026-09-16, ANTES de tocar la consola.** Consola
192.168.0.78. Canal 10 (`i.9`) → general → entrada 1 de la Scarlett.

## Qué decide

Cuántos **milisegundos** tarda el compresor del canal en apretar cuando la señal
sube de golpe, y cuánto tarda en soltar cuando baja, como función del crudo de
`i.N.dyn.attack` y `i.N.dyn.release`.

**Y el producto lo necesita para hablar.** La aplicación va a decir *«el bombo
suena blando: subí el ataque a 20 ms»*. Con la ley mal, ese «20 ms» es otro
número y el consejo sale al revés del que corresponde — dicho con total
seguridad, que es lo peor.

## Por qué ahora, y por qué no antes

**Esto es C5 del [ítem 97](97-leyes-del-compresor.md), que no se midió.** Aquel
contrato dejó escrito el motivo:

> *«Un tiempo de relajación se mide viendo cómo cae la reducción, y la escala de
> la reducción es justo lo que quedó bajo sospecha. Primero se resuelve eso.»*

**El razonamiento era correcto y ya no aplica**, pero no porque se haya resuelto
aquella sospecha: porque **cambió el instrumento**. Entonces se pensaba medir
mirando el medidor de reducción **de la propia consola**. Hoy hay banco con
retorno por la interfaz, así que se mide **el audio que sale** y no hace falta
ninguna lectura del aparato. El bloqueo se levantó solo.

## Cómo se mide, y por qué esta forma no depende de nada dudoso

**Con un escalón.** El tono salta de golpe de un nivel bajo —que no llega al
umbral— a uno alto que sí comprime.

Lo que sale hace esto: **salta igual que la entrada, y después baja** hasta el
nivel comprimido, a medida que el compresor actúa. **Ese descenso es el ataque.**

Para la relajación, al revés: el tono baja de golpe, la salida baja con él y
después **sube** hasta recuperar. Ese ascenso es la relajación.

**No se usa el medidor de reducción, ni ninguna lectura de la consola.** Tampoco
hace falta la ley de la relación —refutada por la 97— ni la del umbral —también
refutada—: alcanza con que haya **una cantidad medible de compresión**, y eso se
comprueba contra el mismo tono con el compresor puenteado.

## La definición del tiempo, declarada ANTES de medir

**Esto es lo primero que hay que fijar, porque distintas definiciones dan
distintos números para el mismo aparato.** Se informan las dos:

- **t63**: desde el escalón, cuánto tarda la reducción en llegar al **63 %** de
  su valor final. Es la constante de tiempo de un sistema de primer orden.
- **t90**: lo mismo al **90 %**.

**El fabricante no dice cuál usa**, y eso acota lo que esta corrida puede
concluir: si el número medido no coincide con su fórmula, **puede ser la
definición y no el aparato**. Se dirá así, sin convertirlo en una refutación que
no está probada.

## La resolución del instrumento, también declarada antes

La envolvente se calcula deslizando una ventana corta sobre la grabación. Con el
tono en **4000 Hz** y una ventana de **6 ciclos (1,5 ms)**, la resolución es de
**unos 1,5 ms**.

**El extremo rápido de la escala del fabricante es 1 ms**, o sea **por debajo de
lo que este banco distingue**. Así que:

- Los tiempos por debajo de **5 ms** se informan como *«en el piso del
  instrumento o por debajo»*, **no como un número**.
- Y eso **no es un fracaso**: el rango útil para el producto está en las decenas y
  centenas de milisegundos, que es donde se decide si un bombo tiene pegue.

## Qué se escribe, y qué vuelve

| Clave | Para qué |
|---|---|
| `m.afs.enabled` | apagado mientras suene, comprobado releyendo por HTTP |
| `i.9.dyn.attack` | **lo que se barre** |
| `i.9.dyn.release` | **lo que se barre** |
| `i.9.dyn.threshold` | el punto de trabajo, para que haya compresión medible |
| `i.9.dyn.ratio` | una relación fija, para que la reducción sea grande y estable |
| `i.9.dyn.bypass` | el control positivo: la misma medición sin compresor |
| `i.9.dyn.outgain` | **neutralizada**: el ítem 110 se comió una corrida entera por no hacerlo |
| `i.9.dyn.softknee` | se lee y se informa; con rodilla blanda el arranque es gradual |
| `i.9.gate.enabled`, `i.9.deesser.enabled` | el resto del proceso del canal, fuera |
| `m.dyn.bypass` | el compresor del general, fuera del camino |
| `i.9.mix` | el fader del canal, para el punto de trabajo del conversor |

Todas leídas antes, restauradas por `restaurarClaves()` dentro de
`conRestauracion`, verificadas releyendo por HTTP, y anotadas en el papelito.

**El fader del general no se toca.**

## Los controles

**C1 — el tono llega.** El bin de 4000 Hz, al menos **45 dB** sobre el piso, en
los dos niveles del escalón.

**C2 — el escalón es LIMPIO, y es el control que hace honesta a toda la corrida.**
Con el compresor **puenteado**, el mismo escalón tiene que medir un tiempo **en el
piso del instrumento**: sin asentamiento. Si con el compresor apagado ya sale una
curva, lo que se está midiendo es el archivo, el conversor o la ventana de
análisis —**no** el compresor— y la corrida se detiene.

**C3 — el compresor está actuando.** La reducción asentada tiene que ser de al
menos **6 dB** contra el mismo tono con el compresor puenteado. Sin eso, «tardó
tanto» sería el tiempo de un efecto que casi no existe, y el ruido lo domina.

## Las expectativas, declaradas antes de mirar

- **L1 — monotonía.** Más crudo, más tiempo. Si no, no es un control de tiempo.
- **L2 — el ataque es más rápido que la relajación** en el mismo crudo. Es así en
  todos los compresores y su fórmula lo dice: `400^…` contra `10·200^…`.
- **L3 — repetibilidad**: dos escalones seguidos en el mismo crudo, dentro del
  **20 %** uno del otro. Es un tope holgado a propósito: un tiempo no es una
  lectura de nivel, y todavía no se sabe cuánto disperso.
- **L4 — contra la fórmula del cliente**, se informa el cociente entre lo medido y
  lo que predice `VtoATTACK(a) = 400^desqr(a)` y `VtoREL(a) = 10·200^desqr(a)`,
  con `desqr(a) = 1 − (1−a)²`. **No hay tope**: es información, no criterio. Que
  coincida sería un resultado; que no, puede ser la definición.

**Si falla C1, C2 o C3, no se publica ningún tiempo.**

## Lo que esta corrida NO va a decir

- **Nada de la puerta.** Va en un ítem aparte: su estímulo es otro —hay que cruzar
  el umbral hacia abajo— y hoy la puerta de este canal está con el umbral al
  mínimo y profundidad 0, o sea que no hace nada.
- **Nada de la forma de la curva.** Se mide cuánto tarda en llegar, no si el
  camino es exponencial. Un compresor con detector de dos etapas no se
  distinguiría.
- **Nada de programa dependiente del material.** Un tono no es una voz ni un
  bombo. Si el detector cambia de comportamiento con señal real, esto no lo ve.
- **Nada de la rodilla.** `softknee` se lee y se deja como esté.
- **Nada del compresor del general**, que es otro bloque.
- Una frecuencia, un umbral, una relación, un canal, un día.

## Trabajo previo

**Buscado el 2026-09-16, con los cuatro repositorios clonados y grepeados**, y
también en casa.

- **`fmalcher/soundcraft-ui`** declara `attack`, `release` y `hold` en su modelo
  de estado, como números crudos. **No los convierte a milisegundos**: sus únicas
  conversiones son fader, medidor, retardo, peso de automix y ganancia del previo.
  Ver [`trabajo-previo-de-terceros.md`](../referencia/trabajo-previo-de-terceros.md).
- **`Dennion/ioBroker.soundcraft`**, **`ndikanov/ui24`** y **`NaturalDevCR/MyUiPro`**:
  no los tocan.
- **Propio, ítem 97**: refutó `VtoTHRESH` y `VtoRATIO`, del mismo archivo del que
  salen las fórmulas de tiempo. **Dos aciertos y dos fallos** tiene ese archivo
  contra el audio: el ecualizador de canal y el de salida acertaron.
- **Propio, ítem 98**: midió la superficie del compresor con cada punto **asentado**
  —o sea, deliberadamente sin tiempos—.
- **El manual del fabricante SÍ da los rangos**, y coinciden **exactamente** con
  los extremos de la fórmula del cliente:

  | | El manual | La fórmula del cliente |
  |---|---|---|
  | Ataque del compresor | «Attack 1ms - 400ms» | `400^desqr(a)`: 1 → 400 ms |
  | Relajación del compresor | «Release 10ms - 2000ms» | `10·200^desqr(a)`: 10 → 2000 ms |
  | Puerta | «Attack 1ms to 400ms, Release 5ms to 2000ms, Hold 1ms to 2000ms» | 1→400, 5→2000, 1→2000 |

  > **Corregido antes de commitear.** El borrador de este contrato decía que el
  > manual «no da rangos en milisegundos». Era falso y estaba a un `grep` de
  > distancia, en un archivo de este repositorio. Es la tercera vez en el día que
  > una afirmación cómoda —«nadie lo dice»— se cae al buscarla.

**Eso cambia qué tiene que contestar esta corrida.** Los **extremos** los declaran
dos fuentes que coinciden, así que lo interesante no es si el máximo son 400 ms:
es **la forma de la curva en el medio**, que es donde vive el uso real. Con el
control a la mitad la fórmula predice **89 ms**, no 200. Si el aparato reparte de
otra manera, cualquier consejo de la aplicación cae en el lugar equivocado aunque
los extremos estén bien.

**Nadie convierte esos crudos a tiempo contra el audio.** Dos fuentes escritas
declaran el mismo rango, y las dos describen la pantalla: el mismo archivo del
cliente ya falló dos veces contra el aparato, y el mismo manual afirma un tope de
relación de 50:1 que el [ítem 110](110-el-crudo-cero-de-la-relacion.md) refutó.
Coincidir entre ellas no las hace ciertas.
