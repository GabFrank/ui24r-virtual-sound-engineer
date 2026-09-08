# Curvas objetivo

El sistema **no busca una respuesta plana**. Busca una curva de sala con inclinación descendente, que es lo que suena natural en un recinto.

**Estado: esta tabla vive solo en este documento.** El código conoce los nombres de los presets (`HouseCurvePreset` en `packages/domain/src/entities/venue.ts`) pero todavía no sus valores. Cuando se porten, se agrega el test que verifica que cada preset tenga los 31 valores y que coincidan con esta tabla.

Cada preset es una tabla por bandas de tercio de octava, en decibeles relativos a la banda de 1 kHz. Hay un test que carga cada preset y verifica que tiene los 31 valores.

## Presets

Valores en decibeles relativos, de 20 Hz a 20 kHz.

| Banda Hz | Live Music | Acoustic | Speech | Bass Enhanced |
|---|---|---|---|---|
| 20 | +5,0 | +2,0 | −12,0 | +8,0 |
| 25 | +5,0 | +2,0 | −10,0 | +8,0 |
| 31,5 | +5,0 | +2,0 | −8,0 | +8,0 |
| 40 | +4,5 | +2,0 | −6,0 | +7,5 |
| 50 | +4,0 | +1,5 | −4,0 | +7,0 |
| 63 | +4,0 | +1,5 | −2,0 | +6,5 |
| 80 | +3,5 | +1,5 | −1,0 | +6,0 |
| 100 | +3,0 | +1,0 | 0,0 | +5,0 |
| 125 | +2,5 | +1,0 | 0,0 | +4,0 |
| 160 | +2,0 | +1,0 | 0,0 | +3,0 |
| 200 | +1,5 | +0,5 | 0,0 | +2,0 |
| 250 | +1,0 | +0,5 | 0,0 | +1,5 |
| 315 | +1,0 | +0,5 | 0,0 | +1,0 |
| 400 | +0,5 | 0,0 | 0,0 | +0,5 |
| 500 | +0,5 | 0,0 | 0,0 | +0,5 |
| 630 | 0,0 | 0,0 | 0,0 | 0,0 |
| 800 | 0,0 | 0,0 | 0,0 | 0,0 |
| 1000 | 0,0 | 0,0 | 0,0 | 0,0 |
| 1250 | 0,0 | 0,0 | +0,5 | 0,0 |
| 1600 | −0,5 | 0,0 | +1,0 | −0,5 |
| 2000 | −0,5 | −0,5 | +1,5 | −1,0 |
| 2500 | −1,0 | −0,5 | +2,0 | −1,5 |
| 3150 | −1,5 | −1,0 | +2,0 | −2,0 |
| 4000 | −2,0 | −1,0 | +1,5 | −2,5 |
| 5000 | −2,5 | −1,5 | +1,0 | −3,0 |
| 6300 | −3,0 | −2,0 | 0,0 | −3,5 |
| 8000 | −3,5 | −2,5 | −1,0 | −4,0 |
| 10000 | −4,0 | −3,0 | −2,0 | −4,5 |
| 12500 | −5,0 | −3,5 | −4,0 | −5,5 |
| 16000 | −6,0 | −4,5 | −6,0 | −6,5 |
| 20000 | −7,5 | −6,0 | −8,0 | −8,0 |

**Live Music** es la de partida: refuerzo de graves moderado y caída suave en agudos, que es lo habitual en refuerzo sonoro de música en vivo.
**Acoustic** es más contenida, para formaciones con instrumentos acústicos y poca amplificación.
**Speech** sacrifica los graves para ganar inteligibilidad, con un realce leve en la zona de la consonante.
**Bass Enhanced** para música que lo pide, con el límite de que el sistema de amplificación lo pueda dar.

**Custom** es editable por el usuario. **Band Signature** queda vacío hasta que exista suficiente histórico para derivarlo, en la fase de aprendizaje.

## Cómo se usa

La desviación al objetivo se calcula **solo en el rango útil del sistema de amplificación**, declarado en su perfil. Pedirle 20 Hz a un sistema que empieza en 45 Hz produce una recomendación absurda y potencialmente destructiva.

Fuera del rango útil, la curva se muestra en gris y no genera hallazgos.
