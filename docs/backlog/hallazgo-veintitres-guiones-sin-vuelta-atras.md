# Hallazgo: veintitrés guiones escriben en la consola sin ningún camino de vuelta

**Censado el 2026-09-13**, al convertir `eco.ts`.

## Qué lo motivó

El trinquete `restauracion-garantizada` cuenta guiones que no usan
`conRestauracion`. Al convertir `eco.ts` se vio que **esa lista mezcla dos cosas
que no son igual de graves**:

- los que restauran en un `try/finally` —que no corre ante una señal—, donde el
  riesgo es morir en el momento malo;
- los que **no restauran nada, nunca**, donde no hay riesgo: hay certeza.

`eco.ts` era del segundo grupo. Escribía el valor contrario al que encontraba y
terminaba. Con la ruta por omisión eso deja el canal 10 del usuario **muteado**.

## El censo

De los 75 del trinquete, **23 escriben estado y no tienen ningún camino de
restauración** —ni `finally`, ni `conRestauracion`, ni una segunda escritura del
valor previo—:

```
  20  auditoria/21-var-rta.ts              93  p0-8/eco-del-puntero.ts
  20  p0-10b-vu/restaurar.ts               94  p0-10b-vu/encender-fantasma.ts
  33  p0-5/espectro-del-general.ts         99  p0-10b-vu/escribir.ts
  34  auditoria/19-restaurar.ts           101  p0-10b-vu/borrar-filtros-fijos.ts
  35  auditoria/estado.ts                 128  p0-10b-vu/ley-ganancia.ts
  35  p0-10b-vu/probar-escritura.ts       135  p0-10b-vu/ley-fader.ts
  41  p0-10b-vu/hay-pendrive.ts           146  p0-10b-vu/limpiar-supresor-del-general.ts
  60  p0-10b-vu/dos-clientes.ts           149  p0-9/recall-diez-veces.ts
  66  p0-10b-vu/tres-clientes.ts          152  p0-10b-vu/ley-rta-por-frecuencia.ts
  73  p0-10b-vu/limpiar-afs-automaticos.ts 177 p0-10b-vu/tono-por-el-aire.ts
  77  p0-10b-vu/borrar-instantanea-real.ts 220 p0-5/donde-vive-una-realimentacion.ts
  87  p0-5/control-positivo-del-analizador.ts
```

## Por qué NO se convierte en trinquete, y esto importa

**Porque la lista mezcla dos categorías y sólo una es un defecto.**

Algunos de estos guiones **existen para cambiar estado**:
`limpiar-supresor-del-general.ts` borra filtros, `borrar-instantanea-real.ts`
borra una instantánea, `encender-fantasma.ts` enciende la fantasma,
`limpiar-afs-automaticos.ts`, `borrar-filtros-fijos.ts`. Restaurar lo que
acaban de hacer sería anular su propósito. Para ellos, «no restaura» es correcto.

Los otros **miden**, y dejan rastro como efecto secundario: `ley-fader.ts`,
`ley-ganancia.ts`, `probar-escritura.ts`, `tono-por-el-aire.ts`,
`donde-vive-una-realimentacion.ts`. Ahí «no restaura» sí es un defecto.

**Separar las dos categorías es un juicio por guion, no una regla que un `grep`
pueda aplicar.** Escribir un trinquete que las trate igual daría una lista de
excepciones con la mitad de las entradas, y este proyecto ya tiene documentado lo
que pasa con esas listas: se convierten en el lugar donde se esconde lo que
molesta.

Y hacerlo depender de la prosa del docblock —«este guion existe para borrar»—
sería exactamente el error que el proyecto castiga: **la capa que justifica
decidiendo por la que implementa**.

## Lo convertido hasta ahora

| guion | qué dejaba escrito | commit |
|---|---|---|
| `p0-10b-vu/eco.ts` | el canal 10 **muteado** —o desmuteado— según cómo estuviera | `ad648e7` |
| `p0-10b-vu/ley-fader.ts` | el fader del canal 10 en **0,20**, unos −38 dB | `0780a8d` |
| `p0-10b-vu/ley-ganancia.ts` | la ganancia del previo en **0,70**, con la del usuario en 0,2508 | `987d0ec` |

| `p0-10b-vu/tono-por-el-aire.ts` | **a medias**: ya restaura y ahora lo verifica por HTTP, pero sigue sin `conRestauracion` | pendiente |

Los tres primeros salieron además del trinquete del supresor: los tres hacían sonar tono
sostenido —60 y 300 segundos— con el supresor del general encendido.

*(Los dos últimos entraron **mezclados** en commits cuyo mensaje habla de otra
cosa. Es la regla del proyecto —una tarea, un commit— incumplida dos veces por el
mismo descuido: agrupar un `git add -A` al final de un tramo largo. Queda dicho
acá porque no reescribo historia ya empujada, y porque el número del trinquete no
alcanza para encontrar cuándo bajó.)*

## Lo que sí queda

El censo, que antes no existía, y la distinción nombrada. Cuando alguien toque
uno de los que miden, que lo convierta; y que el que lo convierta lo saque del
trinquete que ya existe, en el mismo commit.

**Y uno quedó a medias, dicho como tal.** `tono-por-el-aire.ts` ya restauraba
bien al final; se le agregó la verificación por HTTP y se le sacó una **afirmación
falsa** —decía «automáticos limpiados» después de disparar `clearlive`, que el
2026-09-13 se midió que no borra nada— pero **no se envolvió en
`conRestauracion`**: son ochenta líneas de código secuencial de nivel superior con
declaraciones en el medio, y envolverlo a máquina es donde se introducen errores
que no se pueden probar sin la consola. Sigue en el trinquete.

**El orden de prioridad es por probabilidad de volver a correrse**, no por
tamaño: los `p0-10b-vu/ley-*.ts` son los que alguien va a querer repetir, y son
los que dejan escrito un fader o una ganancia del usuario.
