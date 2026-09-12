# 96a — Qué mide cada byte del bloque de un bus de efecto

**Se partió del ítem 96** cuando un auditor encontró, antes de medir, que la ley
del envío a efectos iba a leerse sobre un byte cuyo significado nadie había
verificado en un bus con procesador adentro.

## El pendiente que esto cierra

`protocol-spec.md` §4.4 lo listaba en dos lugares: *«El papel de cada byte
dentro de un bloque de subgrupo o de efecto. Las secciones ya están ubicadas; lo
que falta es cuál es el nivel y si hay pre y post.»*

`capability-matrix.md` decía en cambio **«Cada byte identificado»** con ✅, para
subgrupo **y** efecto. El spec tenía razón: el docblock de `busEstereo` dice que
la medición se hizo *«con el canal 10 asignado al **subgrupo 1**»*. **Un
subgrupo no tiene procesador y un bus de efectos sí.** La matriz quedó corregida.

## Lo medido

Canal 10 (`i.9`) al efecto 2 (`f.1`), que es **el único bus de efectos que no
alimenta ningún otro canal** —`f.0` tiene diez, `f.2` ocho, `f.3` cuatro—.
Evidencia: `evidence/bytes-del-bus-de-efecto-2026-09-12b.txt`.

### 1. El bus está aislado — control negativo, no lectura de estado

| Estado | preIzq | preDer | postIzq | postDer |
|---|---|---|---|---|
| envío 0 | **0** | **0** | **0** | **0** |

Con el envío en cero los cuatro bytes caen a cero. El aislamiento **se probó**,
no se leyó del estado, que es lo que el auditor pedía.

### 2. Los nombres eran correctos: `+0/+1` previo, `+2/+3` posterior al fader

| Fader del bus | preIzq | preDer | postIzq | postDer |
|---|---|---|---|---|
| 0,7647 | 136 | 121 | 136 | 121 |
| 0,50 | **136** | **121** | 101 | 86 |
| 0,20 | **136** | **121** | 21 | 6,8 |
| 0,00 | **136** | **121** | **0** | **0** |

`+0/+1` no se mueven con el fader del bus; `+2/+3` lo siguen hasta cero. **Queda
verificado en un bus de efectos**, que es lo que faltaba.

### 3. El medidor toma DESPUÉS del procesador

Tres líneas independientes, todas en el mismo sentido:

| Prueba | Una suma daría | Se midió |
|---|---|---|
| Caída al cortar el envío | 20 dB en ~37 ms (balística medida del medidor) | **1170 ms hasta cero** |
| Izquierda contra derecha, con fuente **mono centrada** (`i.9.pan = 0,5`) | iguales | **136 / 121**, y decaen a ritmos distintos |
| Dispersión entre 100 Hz, 1 kHz y 10 kHz | 0,23 dB (lo que dio el medidor de entrada) | **7,7 dB** |

La caída completa, byte a byte: 136 → 119 (133 ms) → 99 (333 ms) → 50 (699 ms)
→ 16 (999 ms) → 0 (1170 ms). **Lo medido es la curva; cualquier RT60 que se
saque de ahí es una cuenta mía sobre ella, no una cifra que la corrida imprima.**
Como orden de magnitud sirve para elegir el asentamiento del ítem 96b —se
tomaron 6 s, unas cinco veces los 1170 ms de la cola— y para nada más: no es una
medición de tiempo de reverberación y no debe citarse como tal.

**El reparo del auditor queda resuelto sin control positivo.** Avisó que «un
procesador transparente es indistinguible de no estar», y tenía razón en
general. Acá no aplica: este procesador **demostrablemente no es transparente**
—deja cola de más de un segundo, descorrelaciona los canales y dispersa 7,7 dB
entre frecuencias—. Si hubiera dado plano, habría hecho falta el control
positivo y la conclusión habría quedado abierta.

## Qué significa para el ítem 96

**La ley del envío a efectos no se puede leer del medidor del bus como si fuera
un auxiliar.** Toda lectura es envío × reverb.

No la vuelve imposible: si el reverb es lineal e invariante, su ganancia en
régimen es un factor constante a frecuencia fija, **y un factor constante se
cancela en las diferencias**. Pero eso impone tres condiciones que la corrida
del auxiliar no tenía:

1. **Asentamiento de varias colas por punto**, no los 2,5 s del auxiliar. La
   cola medida tarda 1170 ms en llegar a cero, así que el ítem 96b tomó 6 s.
2. **Comprobar la linealidad**, corriendo la ley entera a dos niveles absolutos
   distintos y verificando que las formas son paralelas. Una curva sola, por
   limpia que salga, no lo prueba.
3. **Izquierda y derecha por separado**, nunca promediadas: se descorrelacionan,
   y la descorrelación puede depender del nivel.

Si la linealidad falla, queda el método de sustitución que propuso el auditor:
anular con el fader del canal —cuya ley está medida— hasta devolver el medidor a
la misma lectura, sin confiar en su linealidad a través del reverb.

## Un defecto propio, y por qué casi no lo detecto

**La primera corrida rehizo a mano el cálculo del desplazamiento en la trama y
se salteó la sección del reproductor**, que va entre los canales y los
subgrupos. Leía otro bloque.

Lo que importa es que **el resultado salió perfectamente consistente**: cinco
filas idénticas, el testigo estable, 56 a 58 tramas por lectura. Leído rápido
parecía «el bus no responde a nada», que es una conclusión limpia y publicable.
**Lo que lo delató fue que el byte valía 247** — el centinela de «sin
reducción», un número con significado propio, no un nivel.

La corrida quedó archivada como `bytes-del-bus-de-efecto-2026-09-12.txt`. El
guion ahora usa `decodificarVuBuses` en vez de recalcular: **la biblioteca ya
sabía hacerlo bien**.

## Lo que NO prueba

- **Un bus de cuatro, con un `fxtype` de dos.** `f.1` es tipo 0; `f.2` y `f.3`
  son tipo 1 y pueden comportarse distinto.
- **Nada sobre `+4` y `+5`**, los bytes del bloque dinámico del bus. `busEstereo`
  no los expone y esta corrida no los miró.
- **Nada sobre el tiempo de reverberación del efecto.** Lo medido es una curva
  de caída con el medidor instantáneo tras cortar el envío. Sirve para elegir un
  asentamiento; no es un RT60 y no debe citarse como tal.
- **Nada sobre qué escucha el operador.** El retorno del bus al general es otra
  etapa y no está en este camino.
