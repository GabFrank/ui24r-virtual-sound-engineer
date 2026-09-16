# SPK-P0.2c — Matriz de salidas

**Estado:** Pendiente · **Timebox:** 5 días · **Control:** G-C
**Depende de:** SPK-P0.2a, S-02.6 · **Bloquea a:** S-06.7, S-10.3b, S-08.6, S-14.1
**Montaje:** Ui24R, una salida no usada, navegador oficial. Solo consola.

## Pregunta que responde

¿Cómo se codifica el procesamiento de salida, existe el ecualizador gráfico por red, y se puede leer el estado de la supresión de realimentación?

## Pasos

1. Mismo método que el spike de procesamiento de canal, sobre auxiliares y general.
2. Buscar específicamente si el ecualizador gráfico de 31 bandas viaja por el protocolo, o si solo está el paramétrico.
3. Leer el estado de la supresión de realimentación: filtros fijos y totales.
4. Escritura de prueba en una salida no usada, con el mismo protocolo de precondiciones que el spike de canal.

## Criterios

| # | Criterio | Tipo | Umbral | Medido | Resultado |
|---|---|---|---|---|---|
| 1 | Ecualizador paramétrico de salida: bandas, ganancia, factor de calidad, frecuencia | bloqueante | 7 puntos o más por parámetro | **La pregunta estaba mal planteada: el ecualizador de salida de esta consola NO es paramétrico.** El general y los diez auxiliares tienen un gráfico de 31 bandas —`m.eq.peak.{l,r}.K`, `a.B.eq.peak.K`— sin frecuencia ni Q por banda. Ver el criterio 3 | ✅ contestado |
| 2 | Pasa altos y pasa bajos de salida | bloqueante | 7 puntos o más | | ⬜ |
| 3 | ¿Existe el ecualizador gráfico de 31 bandas por red? | bloqueante | sí o no. Si no, la corrección de sala usa el paramétrico | **SÍ, y es el único que hay.** 31 bandas por lado en el general —L y R con su `linked`— y 31 en cada uno de los diez auxiliares; subgrupos y efectos no tienen. Contado sobre el aparato. **Su ley de ganancia está MEDIDA** por el [ítem 109](../compromisos/109-la-ley-del-ecualizador-de-salida.md): `30·V − 15`, residuo 0,001 dB, en una banda de un auxiliar. Y la banda 17 responde en 1000 Hz, o sea que el orden de las claves sigue al de las etiquetas | ✅ |
| 4 | Retardo de salida | bloqueante | 7 puntos o más | | ⬜ |
| 5 | Inversión de polaridad | informativo | documentada | | ⬜ |
| 6 | Lectura del estado de supresión de realimentación | informativo | filtros fijos y totales legibles, sí o no | **SÍ.** `m.afs.numfixed` y `m.afs.numtotal` se leen, y la pila entera en `m.afs.eq.N` como texto. El modo sale de **dos** claves y no de una: ver [el hallazgo](../backlog/hallazgo-el-modo-del-supresor-son-dos-claves.md) | ✅ |
| 7 | Ida y vuelta de la conversión | bloqueante | 1 % o menos | | ⬜ |
| 8 | Escritura de prueba verificada por lectura | bloqueante | dentro del 1 % | | ⬜ |

## Resultado colateral — 2026-09-09: los medidores de las salidas, ubicados

**Ninguno de los ocho criterios de arriba está medido.** Este spike pregunta por el *procesamiento* de las salidas —ecualizador, pasa altos y bajos, retardo, polaridad— y eso sigue sin tocarse.

Lo que sí se midió, viniendo de otro lado, es **dónde están los medidores de cada salida** dentro de la trama `VU2`, que es infraestructura necesaria para varios de estos criterios pero no responde ninguno.

La cola de la trama son 154 bytes y sus secciones **no comparten el paso**:

| Relativo al fin de las entradas | Contenido | Paso |
|---|---|---|
| `0 .. 11` | 2 entradas de línea | 6 |
| `12 .. 53` | 6 subgrupos | 7 |
| `54 .. 81` | 4 efectos | 7 |
| `82 .. 131` | 10 auxiliares | 5 |
| `132 .. 153` | general | — |

Detalle y método en `docs/protocol-spec.md` §4.3 y en `evidence/cola-vu2-2026-09-09.txt`.

**Resuelto el 2026-09-09.** El bloque de subgrupo y el de efecto son tiras **estéreo** de 7 bytes: `+0`/`+1` previo izquierdo y derecho, `+2`/`+3` posterior al fader, `+4`/`+5` del bloque dinámico, `+6` reducción e indicador de puerta. El auxiliar es mono de 5. La primera lectura concluyó «el medidor del subgrupo es anterior al fader» porque mover `s.0.mix` no movía nada; era falso — `s.0.mute` valía 1 y los bytes posteriores estaban en cero.

## Evidencia a entregar

- `evidence/output-raw-tables/`, `evidence/geq-search.md`.

## Acción ante fallo

Sin ecualizador gráfico por red, la corrección de sala propone filtros paramétricos, lo que en realidad es mejor para corregir problemas concretos. Sin escritura verificada, la corrección de sala queda en modo sugerencia y la automatización de sala se pospone.

## Evidencia archivada

Todo lo que esta carpeta guarda, con qué es cada cosa. Un archivo que nadie
cita es una medición que nadie va a encontrar cuando la necesite.

- `evidence/buses-vu2-2026-09-09.txt` — qué es cada byte de la cola de `VU2`
