# SPK-P0.7a — Soundcheck virtual, protocolo

**Estado:** Pendiente · **Timebox:** 3 días · **Control:** G-A
**Depende de:** SPK-P0.2a · **Bloquea a:** SPK-P0.7b, G-D, S-11.1
**Montaje:** Ui24R, pendrive candidato, router, laptop, navegador oficial.

## Pregunta que responde

¿Se puede grabar, seleccionar sesión, posicionar y reproducir el soundcheck virtual desde el protocolo, y qué pasa con los canales que están en vivo?

Se ejecuta **temprano**, con la consola sola, porque su respuesta condiciona el diseño de toda la mezcla comparada. Si no hay posicionamiento ni grabación por protocolo, es mejor saberlo ahora que sesenta ítems después.

## Pasos

1. Capturar el tráfico al seleccionar una sesión y al arrastrar la barra de tiempo en la interfaz oficial.
2. Grabar 22 pistas durante cinco minutos en el pendrive candidato, tres veces.
3. Contar los pasos manuales necesarios para entrar y salir del modo soundcheck.
4. Con un canal en vivo, observar qué ocurre con su fuente al activar el modo soundcheck.
5. Documentar la clave que desactiva la ganancia analógica en modo soundcheck.

## Criterios

| # | Criterio | Tipo | Umbral | Medido | Resultado |
|---|---|---|---|---|---|
| 1 | Existe selección de sesión por protocolo | informativo | sí o no, con captura | | ⬜ |
| 2 | Existe posicionamiento temporal por protocolo | informativo | sí o no, con captura | | ⬜ |
| 3 | Grabación de 22 pistas, 5 min, sin fallos del pendrive | bloqueante | 3 de 3 intentos | | ⬜ |
| 4 | Pasos manuales para entrar y salir del modo soundcheck | bloqueante | 3 o menos | | ⬜ |
| 5 | Comportamiento de un canal en vivo al activar soundcheck, y si su fuente es legible | bloqueante | documentado | | ⬜ |
| 6 | Pendrive incorporado a la matriz de hardware con su velocidad medida | bloqueante | sí | | ⬜ |

## Evidencia a entregar

- `evidence/mtk-traffic/`, `evidence/recording-runs.md`, `evidence/live-channel-behavior.md`.

## Acción ante fallo

Sin grabación por protocolo: la aplicación guía la grabación manual en la interfaz oficial y detecta el estado por lectura.
Sin posicionamiento: la reproducción arranca siempre desde cero y las tomas se limitan a cinco minutos.
Sin ninguna de las dos ni lectura de estado: la mezcla comparada se degrada a comparar dos capturas en vivo, se marca como datos insuficientes y el control G-D se cierra como fallo documentado.
