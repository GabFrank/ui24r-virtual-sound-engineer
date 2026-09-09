# ADR-025 — El analizador se toma prestado con permiso, una vez por sesión

**Estado:** Aceptada
**Fecha:** 2026-09-09
**Origen:** SPK-P0.5, tras decodificar el flujo `RTA` el 2026-09-09. Registra la decisión del usuario sobre R-28.

## Contexto

`RTA` resultó ser el **analizador de espectro de la consola**, y no el latido que el proyecto creyó durante meses: 122 bandas de un doceavo de octava, de ~20,9 Hz a ~22,6 kHz, a 0,375 dB por byte. Es la única fuente de información frecuencial que la aplicación tiene sin motor de audio ni micrófono propio, y de ella dependen la detección de realimentación y cualquier consejo de ecualización.

**El problema no es leerlo sino elegir qué mira.** La fuente se elige con `var.rta`, y `var.rta` es **global**: una sola variable de la consola, no una por cliente. Medido el 2026-09-09 con dos conexiones simultáneas: el testigo vio el cambio. O sea que cuando la aplicación apunta el analizador a un canal, **el operador ve cambiar el RTA en su propia pantalla**, en vivo y sin que nadie se lo haya anunciado.

Eso lo separa de todo lo demás que la aplicación lee. Leer un fader no se nota; elegir la fuente del analizador sí, y se nota en el aparato de otra persona mientras trabaja.

Un segundo hecho, medido el mismo día: **`var.rta` llega en el volcado inicial**, como `SETS^var.rta^` con el valor vacío. Una nota anterior de este repositorio decía que la clave no existía, y estaba equivocada. Importa porque cambia lo que significa «restaurar»: el valor anterior **se puede leer**, así que no hay razón para reconstruirlo.

Lo que no se puede saber hoy: si ese vacío es el estado de fábrica o quedó así porque una sesión de medición anterior lo dejó vacío al «restaurar» a un valor que nunca leyó. Es exactamente el daño que esta decisión previene.

## Decisión

**La aplicación pide permiso una vez por sesión y devuelve la fuente al valor que leyó.**

1. **Se lee antes de escribir.** El valor de `var.rta` se toma del volcado inicial. Quien no lo haya leído no lo escribe.
2. **Se pide permiso la primera vez** que una pantalla necesita el espectro. El diálogo dice que el operador va a ver cambiar su RTA y que se lo devuelve al terminar.
3. **La respuesta vale para toda la sesión.** No se vuelve a preguntar. Preguntar en cada préstamo termina en un diálogo que se acepta sin leer, que es no preguntar con más pasos.
4. **Se devuelve al soltar**: al salir de la pantalla, al desconectar y al terminar la sesión. Si nunca llegó el valor, **no se restaura nada** —dejarlo como está es menos dañino que escribir un valor que nadie leyó.
5. **Sin permiso, la aplicación usa lo que el operador ya tenga elegido.** No es un camino muerto: si el analizador está apuntando a algo, ese espectro se lee igual y se dice de qué fuente viene.

## Alternativas descartadas

- **Preguntar en cada préstamo.** Máxima transparencia sobre el papel. En la práctica, un diálogo que aparece cada vez que se mira otro canal se acepta sin leer a los cinco minutos, y entonces protege menos que preguntar una vez y bien.
- **No escribir `var.rta` nunca.** Riesgo cero y capacidad recortada: la aplicación solo vería el canal que el operador esté mirando, y la detección de realimentación —que necesita mirar donde el operador no está mirando— quedaría sin datos justo cuando hace falta.
- **Permiso una vez, pero nunca con el show empezado.** Es más conservador y sigue sobre la mesa como refinamiento. Se descartó **ahora** porque la aplicación todavía no tiene un concepto de «show en curso» en el que se pueda confiar, y colgar una salvaguarda de una señal que no existe da una falsa sensación de protección. Cuando ese estado exista, esta ADR se revisa.

## Consecuencias

- Aparece un permiso de sesión, que es un concepto nuevo: hasta ahora la aplicación no pedía nada porque no tocaba nada visible.
- El préstamo tiene que sobrevivir a una reconexión: si la conexión se cae con el analizador prestado, al volver hay que restaurar. El valor leído se guarda en memoria y el volcado nuevo lo vuelve a traer.
- R-28 pasa de Abierto a Mitigado por decisión; queda por implementar.
- No cambia nada en nivel OBSERVE hasta que la pantalla de espectro exista. Hoy `var.rta` no se escribe desde la aplicación en ningún nivel de autonomía; las únicas escrituras son de guiones de spike, y desde el 2026-09-09 usan `tomarAnalizador()`, que lee antes de escribir.
