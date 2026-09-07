# ADR-014 — Modelo de dominio ampliado antes de MVP1

**Estado:** Aceptada
**Fecha:** 2026-09-07
**Origen:** Auditoría de producto B-25 a B-34; auditoría técnica A-25; auditoría de calidad D-24.

## Contexto

El plan enumeraba entidades pero **no existía `Channel`**: había tipo de canal, perfil de canal, roles, escenas con fuentes principales y perfil de banda, pero nada unía la entrada física de la consola con el integrante, el instrumento, el perfil y el rol. Sin eso no se persiste nada de lo demás.

Faltaban además: la entidad de hallazgo y su hipótesis, sin la cual la explicación "la evidencia indica que el problema es de sala" no se puede generar de forma determinística; la toma de soundcheck virtual; el candidato de mezcla; el perfil del sistema de amplificación, necesario para respetar su rango útil; y la instantánea del lado de la aplicación.

Medición, recomendación y transacción no se referenciaban entre sí por identificador, así que el lazo cerrado y el aprendizaje posterior no serían reconstruibles.

Los puntajes de sala y mezcla aparecían en el panel sin fórmula.

## Decisión

Se define el modelo completo antes del MVP1, con:

- **`ChannelAssignment`** uniendo entrada, integrante, instrumento, perfil, rol por defecto, micrófono y si el canal está en vivo.
- La cadena **`Finding` → `Hypothesis` → `Recommendation`**, con causas posibles: canal, sala, sistema de amplificación, subgraves o ubicación.
- `VirtualSoundcheckTake`, `MixCandidate`, `PAProfile` con la topología de buses y cuáles se pueden silenciar, `Snapshot` y `CalibrationState`.
- **Referencias por identificador** entre medición, recomendación y transacción, en ambos sentidos.
- **Confianza definida por dominio**, no solo para multiposición: sala por consistencia y desviación frente al ruido de medición; canal por repetición del hallazgo en dos capturas con relación señal-ruido suficiente; mezcla por presencia en dos de tres ventanas.
- **Fórmulas de los puntajes** con ejemplos numéricos.
- Ciclo de vida de la sesión con tabla de transiciones, incluidos los estados de soundcheck y las condiciones de retroceso.

## Consecuencias

- Es una historia grande y temprana, pero todo lo demás la usa.
- Cada entidad tiene test de ida y vuelta contra la base de datos.

## Alternativas descartadas

- **Ir agregando entidades por versión.** Habría dejado los enlaces por identificador para el final, cuando ya no se pueden reconstruir los datos históricos.
