# Decisión pendiente de implementar: bajar el auxiliar y el general

**Decisión del usuario el 2026-09-12**, eligiendo entre opciones: la aplicación
puede bajar **el auxiliar y el general** para cazar un acople, **con el mismo
techo** de «hasta donde estaba».

Es lo que él hace: *«Si el acople es muy fuerte entonces bajo el nivel del
auxiliar o pa, dependiendo de donde se escucha, luego vuelvo a subir de a poco
buscando el acople nuevamente»*.

## Por qué no se implementa en el mismo movimiento que ADR-028

Porque son parámetros distintos con riesgos distintos, y mezclarlos es lo que ya
salió mal una vez esta semana:

| Ruta | Qué mueve | Quién lo sufre |
|---|---|---|
| `i.N.aux.M.value` | un canal dentro de una cuña | un músico |
| `a.N.mix` | **toda** una cuña | un músico, entero |
| `m.mix` | **la sala** | el público |

ADR-028 abrió el primero. Los otros dos necesitan su propio ADR, y el tercero
merece pensarse aparte: bajar el general durante un soundcheck es distinto de
bajarlo con gente adelante, y el usuario ya dejó escrito que el modo live es una
función que hoy no existe.

## Lo que hace falta antes

1. **La ley de `a.N.mix` y de `m.mix`.** Son faders de bus, y la ley del fader
   está medida —`faderADb`— pero **medida sobre el fader de canal**. Que el bus
   use la misma es plausible y, después de lo que pasó con el bus de efectos, no
   se asume: se mide.
2. **Decidir el techo del general.** «Hasta donde estaba» funciona para una cuña.
   Para la sala, el usuario tiene una referencia que la aplicación no: cuánta
   gente hay.
3. **Un ADR propio**, con las tres filas de arriba adentro.

## Estado de las rutas hoy

`MASTER_FADER` y el fader del bus auxiliar siguen `USER_ONLY` y no escribibles.
`a.N.mix` cae bajo `MONITOR_AUX_SEND` y lo mantiene cerrado la lista blanca del
motor, que sólo acepta `i.N.aux.M.value`.
