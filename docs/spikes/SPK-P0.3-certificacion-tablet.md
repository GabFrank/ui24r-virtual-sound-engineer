# SPK-P0.3 — Certificación de tablet e interfaz de audio

**Estado:** Pendiente · **Timebox:** 5 días · **Control:** G-B
**Depende de:** S-00.3, SPK-P0.3b · **Bloquea a:** SPK-LIFE, SPK-CAL, S-05.1a
**Montaje:** tablet candidata, concentrador USB con alimentación propia, interfaz de audio, dos fuentes de señal distintas, cargador.

## Pregunta que responde

¿Esta tablet concreta captura dos entradas independientes, sin procesamiento, durante horas, mientras se carga?

Es el mayor riesgo técnico del proyecto y está en el camino crítico.

## Pasos

1. Conectar por el concentrador con alimentación y verificar que la tablet carga mientras actúa como anfitrión.
2. Comprobar si el dispositivo declara soporte de captura sin procesar.
3. Poner señales distintas en cada entrada y verificar que no se mezclan.
4. Capturar cuatro horas seguidas a 48 kHz, contando cortes.
5. Registrar la temperatura y observar si aparece limitación térmica.
6. Conmutar la alimentación fantasma a mano y comprobar que se detecta por el cambio de ruido.

## Criterios

| # | Criterio | Tipo | Umbral | Medido | Resultado |
|---|---|---|---|---|---|
| 1 | La tablet carga mientras actúa como anfitrión USB | bloqueante | sí | | ⬜ |
| 2 | Captura sin procesar soportada | bloqueante | sí, o alternativa documentada con su efecto medido | | ⬜ |
| 3 | Entradas 1 y 2 independientes | bloqueante | señales distintas, sin mezcla | | ⬜ |
| 4 | Cortes en cuatro horas | bloqueante | 1 por hora o menos | | ⬜ |
| 5 | Estabilidad térmica | bloqueante | sin limitación durante las cuatro horas | | ⬜ |
| 6 | Alimentación fantasma detectada por cambio de ruido | informativo | sí | | ⬜ |
| 7 | Fila completa en la matriz de hardware | bloqueante | sí | | ⬜ |

## Evidencia a entregar

- `evidence/4h-capture.log` con marcas de tiempo y cortes, `evidence/thermal.csv`, `evidence/dual-input.wav`, fotos del montaje.

## Acción ante fallo

Repetir una vez con la segunda tablet de la matriz, con timebox de cinco días. Si tampoco certifica, es una decisión de alcance por ADR: otra tablet, u otro entorno de ejecución para la medición. Mientras tanto, el primer entregable y todos los spikes de consola siguen avanzando: no dependen de USB.
