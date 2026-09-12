# 96b — La ley del envío a efectos

Continúa [`96-ley-del-envio-a-efectos.md`](96-ley-del-envio-a-efectos.md) —el
contrato, escrito antes de tocar nada— después de que
[`96a`](96a-bytes-del-bus-de-efecto.md) estableciera que **el medidor del bus de
efectos toma después del procesador**.

Evidencia: `evidence/ley-envio-fx-2026-09-12.txt` y `…-12b.txt`, dos corridas
completas de cuatro series cada una.

## El diseño que 96a obligó

Tres condiciones que la medición del auxiliar no tenía:

| Condición | Por qué | Cómo se hizo |
|---|---|---|
| Asentamiento de varias colas | La cola tarda 1170 ms en llegar a cero; leer antes es leer la cola del punto anterior | 6 s por punto más 2 s de ventana, contra los 2,5 s del auxiliar |
| Probar la linealidad | Un factor constante se cancela en diferencias **sólo si el reverb es lineal** | La ley entera a **dos niveles de fader**, y se comparan |
| No promediar izquierda con derecha | El reverb las descorrelaciona | Se informan por separado |

Y el barrido va **bajando y subiendo**: si no coinciden, lo que se midió fue la
cola.

## El resultado, y por qué no es un sí

**La primera corrida falló el criterio que el guion imprime antes de correr.**
Separación máxima entre las dos curvas: 0,41 dB = **1,24 escalones**, contra un
umbral de uno. Eso se escribe como falló, sin «pasó por poco».

La segunda corrida dio **0,33 dB = 1,00 escalones exactos**: justo sobre la
línea.

| | Corrida A | Corrida B |
|---|---|---|
| Separación entre curvas | 0,41 dB (1,24 esc.) | 0,33 dB (1,00 esc.) |
| Histéresis, fader alto | 0,41 dB | **0,00** |
| Histéresis, fader bajo | 0,00 | 0,00 |
| Desvío contra `faderADb` | 0,25 dB (0,76 esc.) | 0,23 dB (0,68 esc.) |

**Qué separa a las dos corridas.** Un solo punto:

| crudo | Corrida A | Corrida B | |
|---|---|---|---|
| 0,40 | +0,41 | **0,00** | se mudó → **era ruido** |
| 0,70 | −0,33 | **−0,33** | idéntico → **reproducible** |

El 0,41 del crudo 0,4 no se repitió, y la histéresis que lo acompañaba tampoco.
Queda **un solo desvío reproducible**: el crudo 0,70, de exactamente un escalón.

## Veredicto

**El criterio registrado no puede decidir.** Una corrida falló y la otra cayó
exactamente en el límite. La comparación opera en el borde de la resolución del
instrumento, que es justo lo que
[`hallazgo-umbral-de-una-diferencia.md`](../backlog/hallazgo-umbral-de-una-diferencia.md)
dice que es inevitable: **una diferencia de dos lecturas arrastra hasta dos
escalones de cuantización sin que nada se haya movido**, y el umbral se fijó en
uno.

**El umbral no se corrige hacia atrás.** Sería exactamente la forma del error que
el auditor encontró en la 94: el cambio de criterio era correcto y el orden
estaba invertido.

## Lo que sí se puede afirmar

**El envío a efectos no se desvía de `faderADb` más de 0,25 dB** —menos de un
escalón— en ninguno de los dieciséis puntos de las dos corridas, sobre 28 dB de
recorrido. Es la misma acotación que dio el envío a auxiliar, obtenida a través
de un reverb, y **con una salvedad que el auxiliar no necesita**: descansa en que
el reverb sea lineal, y eso no se pudo establecer mejor que un escalón.

**Lo que NO se puede decir es «el envío a efectos usa la ley del fader».** Ni
siquiera se dijo del auxiliar, donde la medición era más limpia.

## Lo que NO prueba

- **Nada sobre la linealidad del reverb mejor que un escalón.** Es el límite de
  este montaje, no un detalle.
- **Un bus de cuatro y un `fxtype` de dos.** `f.2` y `f.3` son tipo 1.
- **Una sola frecuencia.** 96a midió 7,7 dB de dispersión entre 100 Hz y 10 kHz
  en este bus: la ganancia del reverb depende de la frecuencia, y aunque un
  factor constante se cancele en las diferencias, **nadie comprobó que la ley del
  envío sea la misma a 100 Hz**.
- **Nada sobre cómo suena.** Los parámetros internos del efecto están fuera del
  MVP por decisión declarada.
- **Nada sobre el retorno del efecto al general**, que es otra etapa.

## Dos cosas que salieron bien del diseño

**La repetición decidió lo que el argumento no podía.** Frente a un 0,41 que
podía ser ruido o no-linealidad, no se discutió: se corrió otra vez. El punto se
mudó y quedó resuelto. Es más barato que cualquier razonamiento sobre el dato.

**La histéresis funcionó como control del asentamiento.** En la corrida B dio
0,00 dB en las dos series, o sea que los 6 s por punto alcanzan para esta cola.
Sin esa prueba, «esperé bastante» habría sido una afirmación sin respaldo.
