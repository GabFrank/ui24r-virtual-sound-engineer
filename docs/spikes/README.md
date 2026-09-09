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
