# Hallazgo: sólo `clearall` borra filtros del supresor, y se lleva la pila entera

**Medido el 2026-09-13.** Evidencia:
`docs/spikes/SPK-P0.10b-vu2/evidence/limpiar-supresor-tras-la-104-2026-09-13.txt`.

## Qué pasó

La medición **104** corrió 900 segundos de 1 kHz sostenido por el canal 10. Su
guion razonó con cuidado sobre el supresor del **auxiliar** por el que iba el
tono —lo exigió apagado y abortaba si no— y **se olvidó del general**: el canal
tiene `i.9.mix` sin mutear, así que alimenta el general aunque esa salida no se
usara para medir. `m.afs.enabled` valía 1 y `m.afs.fmode` valía 1.

Al terminar, el general del usuario tenía plantado:

```
m.afs.eq.6 ^ 1000.0081787109, 7.0, -18.0, 2
```

Una notch de **−18 dB con Q 7 en 1 kHz**. Atenuación real sobre su PA.

## Lo que se creía y no era

El guion `limpiar-supresor-del-general.ts` afirmaba, desde el 2026-09-10:

> `clearlive` funciona y se comprueba; `clearfixed` y `clearall` no hicieron
> nada nunca.

Probando los tres en orden sobre este filtro:

| mandato | borró |
|---|---|
| `m.afs.clearlive` | **0** |
| `m.afs.clearfixed` | **0** |
| `m.afs.clearall` | **1** |

Exactamente al revés. **Y el número de la ranura no dice de qué pila es**: el 6
cae donde `numfixed = 6` haría pensar que empiezan los vivos, y ninguno de los
dos mandatos específicos lo tocó.

Lo único de lo que hoy hay evidencia es: **`clearall` borra, y borra todo.**

Que el guion pruebe los tres en orden y lea por HTTP entre uno y otro es lo que
permitió verlo. Si hubiera confiado en la creencia y disparado sólo `clearlive`,
habría informado «borró 0» y el filtro seguiría puesto.

## Por qué esto es caro y no un detalle

El precio de olvidarse de apagar el supresor no es «hay que limpiarlo después».
Es que **limpiarlo cuesta los filtros del usuario**: la única herramienta que
funciona se lleva la pila completa, incluido el ring-out que él plantó en sus
fechas. Ya pasó dos veces en este proyecto; la segunda le costó tres filtros
—200,0 / 4226,4 / 8190,1 Hz a −6 dB— que no se escribieron de vuelta porque el
Q no estaba en ningún registro y restaurar con un valor inferido deja un estado
que nunca existió.

Esta vez no costó nada porque las seis ranuras fijas ya estaban vacías. Esa
suerte no se repite.

## Lo que se hizo

1. **El guion de la 104 arreglado**: `m.afs.enabled` entra a `PREVIO`, se apaga
   dentro de `conRestauracion` y se restaura por el camino garantizado. No se
   exige apagado de entrada porque encendido es el estado **normal** de la
   consola del usuario, y un guion que se niegue a correr así no corre nunca.
2. **El docblock del limpiador corregido**, con la corrida que lo refuta.
3. **Un trinquete nuevo**, `supresor-con-sonido.test.ts`: si un guion hace sonar
   algo, tiene que escribir `m.afs.enabled` en 0. Hoy **46 guiones** no lo hacen
   y la lista está fija: no puede crecer, y lo que se arregle sale de ella en el
   mismo commit.

El censo con el que se escribió esa lista estaba mal —buscaba `codificarSetd` y
se perdía los guiones que apagan con un ayudante `escribir()`— y **lo encontró
el propio test**, que exige que lo que ya cumple no figure en la lista. Eran 46
y no 48.

## Lo que queda abierto

- **Qué distingue a `clearfixed` de `clearlive`**, si es que alguno hace algo.
  Con dos corridas que se contradicen, lo honesto es decir que no se sabe.
- **Qué valor de `m.afs.fmode` es LIVE, FIXED y LOCK** (tarea T2). Decide si una
  corrida planta filtros permanentes o pasajeros, y sigue sin medirse.
