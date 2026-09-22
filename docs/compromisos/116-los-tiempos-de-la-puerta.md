# 116 — Los tiempos de la puerta: abrir, sostener y cerrar

## MEDIDO el 2026-09-16: el sostenido acierta EXACTO, y eso explica el resto

Evidencia:
[`tiempos-de-la-puerta-2026-09-16.txt`](../spikes/SPK-P0.10b-vu2/evidence/tiempos-de-la-puerta-2026-09-16.txt).
Los cuatro controles en verde: escalón limpio sin puerta, tono 83,1 dB sobre el
piso, la puerta atenúa **21,79 dB** cerrada, y con el nivel alto abre hasta el
mismo valor que sin puerta —−41,61 contra −41,61—.

### El sostenido: la fórmula del cliente da el número exacto

| crudo | medido | `2000^desqr(V)` | diferencia |
|---|---|---|---|
| 0,250 | 28,5 ms | 27,8 ms | **+0,7** |
| 0,375 | 103,0 ms | 102,7 ms | **+0,3** |
| 0,500 | 299,0 ms | 299,1 ms | **−0,1** |
| 0,625 | 687,0 ms | 686,8 ms | **+0,2** |
| 0,750 | 1244,0 ms | 1243,7 ms | **+0,3** |
| 0,875 | 1776,0 ms | 1776,0 ms | **0,0** |
| 1,000 | 2000,0 ms | 2000,0 ms | **0,0** |

**Esto no es «coincide dentro de la tolerancia»: es el mismo número.** Sobre un
recorrido de 28 a 2000 ms, el error más grande es de siete décimas de
milisegundo, y el instrumento resuelve medio.

**Entra en `RAW_MAP` como `2000^desqr(V)`**, y es la **primera ley del dominio del
tiempo** que este proyecto mide.

### Y ese acierto es la pieza que faltaba para leer los ítems 114 y 115

**Un sostenido es un retardo. Un ataque y una relajación son asentamientos.**

Un retardo no admite convención: o la puerta empezó a cerrar o no. Un
asentamiento sí, y hay que elegir a qué fracción se le llama «el tiempo» —t63,
t90, «hasta 2 dB del final»—.

**El único de los tres que no necesita definición es el único que coincide.**

Eso sostiene, ahora con un caso a favor y no sólo por descarte, que los
desacuerdos del [114](114-los-tiempos-del-compresor.md) son **de convención y no
de ley**. No lo prueba —sigue sin saberse cuál usa el fabricante— pero era la
hipótesis que quedaba viva después de que el [115](115-como-suelta-el-compresor.md)
matara la otra.

**Y de yapa, vale como control del instrumento.** La cadena entera —el archivo, el
reproductor, la interfaz, la consola, el grabador, la envolvente— reproduce una
ley conocida al **0,1 %**. Así que los desacuerdos del compresor **no son del
banco**.

### La apertura: la forma acierta, la escala no

| | constante contra el cliente | dispersión | puntos |
|---|---|---|---|
| apertura, t63 | **0,199** | 8,5 % | 6 |

Mismo patrón que el ataque del compresor: el reparto es el de `400^desqr(V)` y el
factor de escala no. Acá el factor es **0,20** y en el compresor era **0,64**, o
sea que **tampoco es el mismo factor entre los dos bloques** — una convención
compartida habría dado lo mismo.

### La relajación: acá no es sólo la escala, es la forma

| crudo | medido / predicho |
|---|---|
| 0,125 | 0,47 |
| 0,250 | 0,63 |
| 0,500 | **0,70** |
| 0,750 | 0,63 |
| 1,000 | 0,50 |

**El cociente no es constante: sube hasta la mitad del recorrido y vuelve a
bajar**, con 23 % de dispersión mientras la repetibilidad se mantiene en 1-6 %.
O sea que la dispersión **no es ruido de la medición**.

**`5·400^desqr(V)` no describe cómo cierra esta puerta.** Eso es más fuerte que lo
del compresor: allá la forma acertaba y fallaba el número; acá falla la forma.

### La profundidad

Con el crudo en 2/3, el cliente predice **−20,0 dB** y se midieron **−21,79**.
Cerca, y no igual. **Un punto no es una ley** y no se generaliza: para eso habría
que barrerla.

> **CONTESTADO el 2026-09-17 por el [ítem 120](120-el-umbral-y-la-profundidad-de-la-puerta.md):
> la ley es la del cliente, y acierta al décimo de dB.** Barrida en seis
> posiciones, `60a − 60` da 0,0 / 9,0 / 18,0 / 27,0 en las cuatro que el banco
> alcanza a ver. Ya está en `RAW_MAP` como `PROBADO`, acotada al crudo 0,55 … 1,00.
>
> **Y explica de paso el 1,79 dB de diferencia de acá.** Aquella medición tomó un
> solo punto al borde de lo que el banco ve: el piso del instrumento —unos
> −105,5 dBFS— levanta la lectura justo donde la atenuación se acerca a él.

### Lo que queda establecido, y lo que no

**Establecido:**

1. El sostenido de la puerta es **`2000^desqr(V)` ms**, medido en siete
   posiciones con error máximo de 0,7 ms.
2. La apertura sigue la **forma** del cliente con factor **0,199**.
3. La relajación **no sigue** la forma del cliente.
4. El instrumento reproduce una ley conocida al 0,1 %.

**No establecido:**

- **Qué ley sigue la relajación de la puerta.** Hace falta un modelo distinto, y
  esta corrida no propone ninguno.
- ~~**La ley de la profundidad**: un punto.~~ **Cerrada** por el [ítem 120](120-el-umbral-y-la-profundidad-de-la-puerta.md) el 2026-09-17.
- **La ley del umbral**: no se midió, se calibró. El crudo usado fue **0,46**. El [ítem 120](120-el-umbral-y-la-profundidad-de-la-puerta.md) lo **acotó** entre 80 y 100 dB por unidad el 2026-09-17, sin confirmar ni refutar los 96 del cliente.
- **Qué convención usa el fabricante** para ataque y relajación.

---


**Contrato escrito el 2026-09-16, ANTES de tocar la consola.** Consola
192.168.0.78. Canal 10 (`i.9`) → general → entrada 1 de la Scarlett.

## Qué decide

Cuántos **milisegundos** tarda la puerta del canal en **abrir** cuando llega
señal, cuánto **se queda abierta** después de que la señal cae, y cuánto tarda en
**cerrar**, como función del crudo de `i.N.gate.attack`, `i.N.gate.hold` y
`i.N.gate.release`.

**Y de yapa, cuánto atenúa cerrada**, que sale de la misma grabación sin costo.

## Para qué sirve, en el escenario

La puerta es lo que hace que el micrófono de la voz **no te meta la batería
entera** cuando nadie canta. Los tres tiempos se oyen, y se oyen mal cuando están
puestos de cualquier manera:

- **Abrir lento** te **come el arranque** de la palabra. La «p» de «pero» no llega.
- **Sostener poco** hace que la puerta **castañetee** entre sílaba y sílaba.
- **Cerrar rápido** se oye como un **corte**, en vez de como que se apagó.

## Cómo se mide, y por qué sale todo de un escalón

**Con el mismo escalón del [ítem 114](114-los-tiempos-del-compresor.md)**, que ya
pasó sus controles: el tono salta de un nivel bajo a uno alto y vuelve.

- **El nivel bajo queda por DEBAJO del umbral** de la puerta, o sea con la puerta
  cerrada. **El alto, por encima.**
- Al subir, la salida **sube** mientras la puerta abre. **Eso es el ataque.**
- Al bajar, la salida se queda arriba un rato —**eso es el sostenido**— y después
  **baja**. **Eso es la relajación.**

**Los dos tiempos del cierre salen de la misma captura**, y esa es la razón de
medir así: el sostenido es el retardo antes de que empiece a caer, y la
relajación es la caída.

**No se usa ninguna lectura de la consola.**

## La profundidad se fija en −20 dB, y no es un detalle

Hoy el canal tiene `gate.depth = 0`, que según el cliente es **−60 dB**: con la
puerta cerrada no queda prácticamente nada, y el nivel bajo se hunde en el ruido.
Medir un tiempo entre el piso de ruido y la señal no es medir la puerta.

**Se escribe una profundidad intermedia** para que el recorrido esté bien definido
y bien por encima del ruido. Es una clave más que tocar y que devolver, y queda
dicho acá.

## Qué se escribe, y qué vuelve

| Clave | Para qué |
|---|---|
| `m.afs.enabled` | apagado mientras suene, comprobado releyendo por HTTP |
| `i.9.gate.enabled`, `i.9.gate.bypass` | encender la puerta y el control positivo |
| `i.9.gate.thresh` | **calibrado**: tiene que quedar entre el nivel bajo y el alto |
| `i.9.gate.depth` | fijada, por lo de arriba |
| `i.9.gate.attack`, `i.9.gate.hold`, `i.9.gate.release` | **lo que se barre** |
| `i.9.dyn.bypass` | el compresor del canal, fuera: si comprime, contamina el escalón |
| `i.9.deesser.enabled` | fuera |
| `m.dyn.bypass` | el compresor del general, fuera |
| `i.9.mix` | el fader del canal, punto de trabajo del conversor |

Todas leídas antes, restauradas dentro de `conRestauracion`, verificadas
releyendo por HTTP y anotadas en el papelito. **El fader del general no se toca.**

## Los controles

**C1 — el tono llega**, al menos 45 dB sobre el piso con la puerta abierta.

**C2 — el escalón es limpio con la puerta PUENTEADA.** Igual que en el 114: si sin
puerta ya sale una curva, lo que se mediría es el archivo, el conversor o la
ventana de análisis. La corrida se detiene.

**C3 — la puerta está actuando.** Con el nivel bajo, la salida tiene que estar al
menos **10 dB por debajo** de la que da el mismo nivel bajo con la puerta
puenteada. Sin eso, la puerta no está cerrando y no hay nada que cronometrar.

**C4 — el umbral quedó EN EL MEDIO.** La puerta tiene que estar **cerrada** con el
nivel bajo y **abierta** con el alto. Se comprueba con las dos mediciones, no se
supone de la calibración.

## Las expectativas, declaradas antes de mirar

- **L1 — monotonía** en los tres controles.
- **L2 — el sostenido no cambia el tiempo de caída**, sólo cuándo empieza. Si
  moverlo cambia también la pendiente, el modelo de «sostener y después cerrar»
  está mal y hay que decirlo.
- **L3 — repetibilidad** dentro del 20 %.
- **L4 — contra las fórmulas del cliente**: `VtoGATE_ATTACK(a) = 400^desqr(a)`,
  `VtoGATE_HOLD(a) = 2000^desqr(a)`, `VtoGATE_RELEASE(a) = 5·400^desqr(a)`, con
  `desqr(a) = 1 − (1−a)²`. **Se informa el cociente, sin tope**: es información.
- **L5 — la profundidad medida** contra `VtoGATE_DEPTH(a) = 60a − 60`.

**Si falla C1, C2, C3 o C4, no se publica ningún tiempo.**

## Y hay una expectativa que este contrato NO puede tener

**El ítem 114 dejó abierto por qué la relajación del compresor mide 0,24 de lo que
muestra la pantalla**, y el 115 descartó la explicación más probable. Si la
relajación de la puerta diera **el mismo factor**, sería un dato fuerte —apuntaría
al medidor o a una convención compartida, no al compresor—. Si diera otro, también.

**No se declara como expectativa porque no hay base para predecir ninguna de las
dos.** Se declara que **se va a mirar**, para que no parezca hallazgo lo que fue
una comparación buscada después.

## Lo que esta corrida NO va a decir

- **Nada de la ley del umbral de la puerta**, que necesita barrer el nivel y es
  otro método. Se calibra y se informa el crudo usado, nada más.
- **Nada con señal real.** Un tono no es una voz ni una batería filtrándose.
- **Nada del `gate.prmod`**, que se lee y se deja.
- **Nada de la puerta de los buses de salida.**
- Una frecuencia, un canal, un día.

## Trabajo previo

**Buscado el 2026-09-16, con los cuatro repositorios clonados y grepeados.** El
inventario está en
[`trabajo-previo-de-terceros.md`](../referencia/trabajo-previo-de-terceros.md).

- **`fmalcher/soundcraft-ui`** declara `attack`, `hold`, `release`, `depth`,
  `thresh`, `enabled` y `bypass` de la puerta en su modelo de estado, como números
  crudos. **No convierte ninguno.**
- **`Dennion/ioBroker.soundcraft`**, **`ndikanov/ui24`** y **`NaturalDevCR/MyUiPro`**:
  no tocan la puerta.
- **El manual del fabricante** da los rangos: *«Attack 1ms to 400ms, Release 5ms to
  2000ms, Hold 1ms to 2000ms, Depth -inf to 0dB»*, y **coinciden con los extremos
  de las fórmulas del cliente** — salvo la profundidad, que el cliente acota en
  −60 dB y el manual escribe como «-inf». Esa diferencia se anota y **no se mide
  acá**: comprobar un «infinito» pide otro método.
- **Propio, ítems 114 y 115**: el instrumento del escalón, con sus controles ya
  pasados, y la advertencia de que la forma del cliente puede acertar en la
  repartición y errar en la escala.

**Nadie mide los tiempos de esta puerta.** Sin segunda implementación, un
resultado raro no tiene con qué contrastarse.
