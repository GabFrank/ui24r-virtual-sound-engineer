# Spikes de fase 0

Un spike responde una pregunta con un número, dentro de un timebox. No entrega producto y no requiere tests ni entrada en el changelog. Su código vive en `tools/spikes/`.

Cada charter distingue **criterios bloqueantes** de **informativos**. Un criterio bloqueante que falla admite **una sola repetición** antes de escalar a decisión de alcance.

## Estado

| Spike | Control | Timebox | Estado |
|---|---|---|---|
| [P0.1](SPK-P0.1-conectividad.md) Conectividad, eco y cadencia de medidores | G-A | 3 d | ⬜ |
| [ACK-POLICY](SPK-ACK-POLICY.md) Política de confirmación de escrituras | G-A | 1 d | ⬜ |
| [P0.2a](SPK-P0.2a-capability-basica.md) Matriz de capacidades, lectura y escritura básica | G-A | 8 d | ⬜ |
| [P0.9](SPK-P0.9-concurrencia.md) Concurrencia y presencia | G-A | 3 d | ⬜ |
| [P0.8](SPK-P0.8-snapshots.md) Instantáneas y alcance de la recuperación | G-A | 3 d | ⬜ |
| [P0.7a](SPK-P0.7a-soundcheck-protocolo.md) Soundcheck virtual, protocolo | G-A | 3 d | ⬜ |
| [P0.10a](SPK-P0.10a-dsp-referencia.md) Validación de procesamiento de señal | G-B | 3 d | ⬜ |
| [P0.6'](SPK-P0.6-generador-player.md) Reproductor como generador | G-B | 3 d | ⬜ |
| [P0.10b](SPK-P0.10b-vu2.md) Calibración y balística de los medidores | G-B | 3 d | ⬜ |
| [P0.5](SPK-P0.5-analysis-bus.md) Bus de análisis | G-B | 3 d | ⬜ |
| [PA-BUS](SPK-PA-BUS.md) Topología de salidas silenciables | G-B | 1 d | ⬜ |
| [P0.2b](SPK-P0.2b-procesamiento-canal.md) Matriz de procesamiento de canal | G-C | 8 d | ⬜ |
| [P0.2c](SPK-P0.2c-salidas.md) Matriz de salidas | G-C | 5 d | ⬜ |
| [P0.3b](SPK-P0.3b-usb-b.md) Consola por USB directo a la tablet | G-B | 2 d | ⬜ |
| [FW3](SPK-FW3-capacidades-firmware.md) Capacidades del firmware 3.x y contenido del CUE | G-B | 5 d | ⬜ |
| [P0.3](SPK-P0.3-certificacion-tablet.md) Certificación de tablet e interfaz | G-B | 5 d | ⬜ |
| [LIFE](SPK-LIFE-ciclo-vida.md) Ciclo de vida de Android con audio | G-B | 3 d | ⬜ |
| [CAL](SPK-CAL-ganancia-interfaz.md) Calibración de ganancia de la interfaz | G-B | 1 d | ⬜ |
| [SAFE-GEN](SPK-SAFE-GEN.md) Invariantes del generador sobre hardware | G-C | 3 d | ⬜ |
| [P0.4'](SPK-P0.4-captura-prolongada.md) Captura dual prolongada | G-C | 3 d | ⬜ |
| [LOOP](SPK-LOOP-loopback.md) Loopback e igualación de entradas | G-C | 3 d | ⬜ |
| [P0.7b](SPK-P0.7b-soundcheck-repetibilidad.md) Soundcheck virtual, repetibilidad | G-D | 3 d | ⬜ |
| [REPEAT](SPK-REPEAT-repetibilidad-sala.md) Repetibilidad de la medición de sala | G-C | 3 d | ⬜ |

**Ninguno está cerrado, y cuatro tienen resultados parciales.** La columna es binaria a propósito —un spike se cierra o no se cierra— pero un ⬜ no significa lo mismo en todos ellos:

| Spike | Qué ya está contestado | Qué falta para cerrarlo |
|---|---|---|
| P0.1 | Cadencia y umbral de inestabilidad (99 ms sobre `RTA`); no hay eco; reconexión con la wifi cortada, 20 de 20 | Los otros dos modos de corte —router apagado y cambio de IP— y los tres clientes durante diez minutos con cambios ocurriendo. Los dos necesitan a alguien delante del aparato |
| ACK-POLICY | El **mecanismo**: segunda conexión testigo, medida en 27 ms | La tabla parámetro a método y el texto de INV-011. Es redacción, no laboratorio |
| P0.2a | Rutas confirmadas contra el aparato, y las dos primeras escrituras reales | Reproductor, grabación multipista, punto de derivación y enlace estéreo |
| P0.10b | Escala y recorrido —80 dB—, balística, tasa, respuesta en frecuencia, techo y repetibilidad | Solo la correspondencia con **dBFS absolutos**, que exige un bucle físico calibrado |

## Sobre actualizar el firmware de la consola

Anotado el 2026-09-09. La consola declara **3.4.8318-ui24** y existe un **3.5.8328** con manual técnico analizado (`SPK-P0.2a/evidence/manual-tecnico-fw-3.5.8328.txt`).

**Recomendación: no actualizar todavía.** Cuatro razones, en orden de peso:

1. **Todo lo medido en este proyecto es contra 3.4.8318.** El recorrido del medidor, el techo, la curva de ganancia con su déficit, la escala del analizador, la latencia del testigo. Actualizar no las invalida necesariamente, pero les quita la procedencia: pasarían a ser «medidas contra otro firmware» hasta que alguien las repita. Es mucho trabajo en juego por ninguna necesidad concreta.
2. **No hay nada del 3.5 que haga falta.** El manual confirma que el formato de la trama, las secciones y las conversiones son las mismas. Lo que agrega —de-esser, automix, efectos— no es lo que este proyecto usa hoy.
3. **El propio manual no certifica compatibilidad**, y avisa que documenta una versión distinta de la instalada.
4. **El script de actualización tiene un punto que el manual marca como sospechoso**: la condición previa al flasheo compara salidas completas de `md5sum`, que incluyen el nombre del archivo, así que la comparación podría no proteger lo que se supone que protege. En una actualización de firmware, una verificación que no verifica es exactamente el riesgo que no conviene correr sobre el aparato de trabajo de alguien.

**Si algún día se actualiza**, el orden razonable: guardar un volcado completo con `curl /raw` antes, actualizar, guardar otro después, y volver a correr las mediciones que sostienen constantes —recorrido y techo del medidor, curva de ganancia, escala del analizador—. Con eso el cambio queda medido en vez de supuesto.

## El estado en que quedó la consola, y dos cosas que no se pudieron devolver

Anotado el 2026-09-09. La regla de la fase es restaurar todo lo que se toca, y se cumplió con una excepción y media.

**`var.rta` quedó publicándose como `-1` en vez de vacío.** La clave llegaba en el volcado como `SETS^var.rta^` —texto vacío— y ahora la consola la publica como `SETD^var.rta^-1`. Una vez asignada en caliente, el tipo cambia y no se revierte por protocolo. **El analizador está apagado igual**, comprobado: 172 tramas seguidas en cero. Probablemente se normalice con un reinicio del aparato.

**El supresor de realimentación del general aprendió de los tonos.** Esto es lo importante y no fue por escribir nada: `m.afs.enabled` vale 1, y los tonos sostenidos de 1 kHz le hicieron plantar filtros nuevos. Los trece filtros se devolvieron a su valor exacto del volcado inicial y está comprobado clave por clave, así que **lo que procesa audio es lo original**. Lo que no se pudo devolver es `var.afsdata`, la contabilidad interna del motor —con qué nivel aprendió cada filtro y en qué orden—: no acepta escritura.

> **Regla nueva, y vale para cualquiera que mida acá: antes de meter tonos sostenidos, mirar `*.afs.enabled`.** Nada en el protocolo avisa. El daño aparece en el diff final o no aparece nunca. Si está encendido, apagarlo anotando el valor y devolverlo al terminar.

## Qué se puede tocar durante una sesión de medición

Acordado con el dueño del equipo el 2026-09-09, y vale **sólo para los scripts
de `tools/spikes/` durante una sesión de medición**. No cambia nada de lo que
la aplicación puede hacer: sus reglas siguen siendo las de `CONTRIBUTING.md`, y
en particular INV-010 le sigue prohibiendo tocar un envío de monitor.

**La consola entera está disponible**, incluidos los envíos de auxiliar, los
subgrupos y los efectos, que son lo que hace falta para ubicar cada sección de
la trama `VU2`.

**Lo único prohibido: borrar las instantáneas guardadas en la consola.** Son el
trabajo de la banda y no se recuperan.

Dos condiciones que hacían seguro el acuerdo cuando se tomó, y que hay que
volver a comprobar en cada sesión en vez de darlas por ciertas:

- No había **nada conectado a los parlantes**.
- Las únicas señales presentes eran la fuente de medición en el canal 10 y
  audio en los canales 21 y 22.

Si alguna de las dos cambia —alguien enchufa unos in-ears, se alimenta el
sistema— el acuerdo no aplica: un envío de auxiliar subido a ciegas con
alguien usando monitores es de las pocas cosas que pueden lastimar a una
persona. Y como siempre: anotar el valor anterior antes de tocar, y devolverlo
al terminar.
