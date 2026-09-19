# Lo que dejaron abiertas las dos auditorías de la escucha

**2026-09-19.** Salieron de auditar `51f3d1f` —el commit que hizo que la
aplicación guarde lo que escucha y lo anote en la transacción—. Lo que **tocaba
esa pieza** se arregló en el acto, en el commit siguiente; lo que no, se anota
acá en vez de meterse en la tarea que lo encontró, que es la regla del proyecto.

Las dos auditorías corrieron sobre la cadena completa —mapeo, `INSERT` real,
`SELECT` real, `historialDeLaSesion` y `SafetyEngine.evaluar`— contra SQLite real
con el esquema de la migración. **Ninguna tocó la consola del usuario.**

---

## 1. Una sola medición guardada autoriza el segundo paso de las 24 ganancias

**MEDIDO.** `escuchaComprobada` no cruza `Measurement.channelId` contra la ruta
del cambio. Con **una** escucha real de 18 segundos, anotada en la última
transacción de cada ruta, **las 24 ganancias de previo consumen su presupuesto
entero de sesión**: 24 segundos pasos aceptados, 48 dB extra, 96 dB de ganancia
movidos sobre 24 canales. La medición dice `channelId = asig-3` y el motor no lo
mira.

**Sobre la MISMA ruta la puerta no cede**: una medición compra exactamente un
paso extra y después el motor corta, porque la condición de orden la deja atrás
en cuanto hay una escritura más nueva. Medido: 2 pasos, 4,0 dB.

**No está expuesto por la pantalla de hoy**, que empareja cada transacción con la
medición de su propio canal. Lo que cambió el 2026-09-19 es que **la tabla dejó
de estar vacía**: el agujero pasó de inalcanzable a estar a una línea de
distancia, y esa línea no la protege ningún test ni la guarda.

**Ya estaba declarado en el código** —`historial-de-la-sesion.ts` lo dice con
todas las letras— y es la misma tarea que
[ADR-035](../adr/ADR-035-el-tope-es-por-parlante-no-por-clave.md) nombra como «el
tope es por clave y el oído es por parlante». Lo que aporta esta auditoría es la
**magnitud** y el cambio de estado.

**Nota para quien lo cierre:** `channelId` es el identificador de la asignación
de banda, no el canal de consola, y la ruta es `hw.N.gain` sacada de `i.N.src`.
Cruzarlos pide un mapeo que hoy el historial no tiene.

---

## 2. Una caída que empieza y termina dentro de la ventana no la ve nadie

**MEDIDO, y es el residuo declarado del arreglo del medidor congelado.** El
2026-09-19 se cerraron las dos mitades: el dato —un medidor que no se movió ni un
escalón en dieciocho segundos no es un músico— y la causa —no se guarda una
escucha si la consola no está conectada al terminar la ventana—.

**Lo que ninguna de las dos alcanza:** una conexión que se cae y vuelve *adentro*
de la misma ventana. Deja dos valores distintos, así que el medidor «se movió», y
al terminar la consola está conectada. Se cierra mirando la **frescura de las
tramas** —cuántos milisegundos hace que llegó la última `VU2`— en vez del estado
de la conexión. El adaptador ya lleva esa cuenta (`ultimaTramaVuMs`) y no la
expone.

---

## 3. Un identificador de sesión inventado, pero no vacío, entra a la tabla

**MEDIDO** con la base como corre en la tablet, o sea con las claves foráneas
apagadas. `MedicionesService.guardar` sólo rechaza la cadena vacía: un
`sessionId` en `'   '`, o el de una sesión borrada, **entra, se lee y el motor
concede** cuando se pregunta por ese mismo identificador.

**No está expuesto**: el llamador no guarda nada sin sesión abierta. Y conviene
recordar por qué la base no ayuda: el esquema declara la clave foránea y **la
aplicación nunca ejecuta `PRAGMA foreign_keys = ON`** —el complemento de Android
tampoco—, así que esa garantía existe en los tests, donde `node:sqlite` las
activa, y no en el aparato.

---

## 4. El botón de aplicar no se apaga mientras hay una captura corriendo

**LEÍDO DEL CÓDIGO.** En la pantalla de ganancia, *Medir* se deshabilita mientras
se captura y *Aplicar* no. Así que se puede escribir la ganancia en el medio de
una ventana de dieciocho segundos que ya está corriendo, y esa ventana se guarda
sin que la fila diga que el canal cambió a mitad de camino.

**Falla cerrado**: el motor rechaza esa medición porque empezó antes de la
escritura, y el `capturar()` que viene después revienta con «ya hay una captura
en curso», así que no se anota nada. Lo que queda es una fila imprecisa y una
promesa rechazada. Es anterior a la pieza de la escucha; lo que cambió es que
ahora esa ventana se guarda.

---

## 5. Una cifra retractada que sigue citada en el código

**LEÍDO.** `historial-de-la-sesion.ts` cita «**32 dB —de −32 a nominal— en 24
ms**». `docs/safety-invariants.md` ya retiró ese número: no se reproduce —da 18 o
19 ms según la corrida— y sobre todo **es lo que tarda en evaluarse la guarda, no
en moverse la cuña**. La retractación está escrita en el documento y no en el
código.

Es anterior al 2026-09-19 y no lo introdujo esta pieza.
