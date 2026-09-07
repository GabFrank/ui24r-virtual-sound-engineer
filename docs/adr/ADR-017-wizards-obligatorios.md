# ADR-017 — Asistentes de configuración obligatorios

**Estado:** Aceptada
**Fecha:** 2026-09-07
**Origen:** Auditoría de producto B-15, B-35 a B-41; auditoría técnica A-19; auditoría de calidad D-10.

## Contexto

El plan verificaba en su lista de arranque que el bus de análisis y el retorno estuvieran bien, pero **no decía cómo se configuran la primera vez**: qué auxiliar elegir, cómo asegurarse de que no lo usan los monitores, cómo cablear.

Eso importa por seguridad, no por comodidad. La interfaz de audio aplica **alimentación fantasma a las dos entradas con un solo botón**. El micrófono la necesita; la entrada 2 recibe una salida de línea de la consola. Con un cable XLR en la entrada 2, la alimentación fantasma llega a la salida de la consola.

Tampoco se contemplaba: que la ganancia del preamplificador de la interfaz no es legible por software, que las mediciones multiposición exigen caminar por la sala mientras la tablet queda atada por USB, ni el uso en escenario con una mano y poca luz.

## Decisión

Son obligatorios estos asistentes:

1. **Configuración y patcheo**, condición de seguridad: elección del auxiliar de análisis, verificación de que no alimenta monitores, reserva del reproductor, y lista de cableado con la regla **entrada 2 solo por conector TRS, nunca XLR**, con confirmación explícita.
2. **Calibración de ganancia de la interfaz**, con tono de nivel conocido desde la consola y ajuste fino por el fader del bus, porque pedirle a alguien que gire un potenciómetro hasta medio decibel es frágil.
3. **Calibración de nivel acústico**, opcional, con estado "sin calibrar" visible mientras no exista.
4. **Loopback**, con verificación de cables antes y después.
5. **Recuperación tras desconexión**, con resumen de qué cambió mientras no había conexión.
6. **Modo show**: texto grande, contraste alto, solo alertas críticas, bloqueo contra toques accidentales, paro de emergencia siempre accesible, ninguna escritura posible.
7. **Resolución de conflicto**, cuando el valor actual no es el esperado.

Las mediciones multiposición usan **avisos hablados por el propio sistema de amplificación** y arranque automático detectando el comienzo de la señal en la referencia eléctrica, porque el operador está lejos de la tablet.

La verificación de que el monitoreo directo de la interfaz está apagado **no se hace preguntando**: se hace con una prueba electroacústica.

## Consecuencias

- El asistente de configuración es parte del MVP1, no un extra.
- Cada asistente declara su presupuesto de tiempo, porque un soundcheck real dura entre veinte y sesenta minutos. Si los asistentes no entran en ese presupuesto, el producto no se usa.

## Alternativas descartadas

- **Confiar en que el usuario cablea bien.** El usuario es el mismo que está afinando la guitarra y probando su micrófono.
