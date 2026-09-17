# El reparador plantó un filtro: encendió el supresor con el tono sonando

**2026-09-17, de madrugada.** Incidente en la consola del usuario, con daño real y
reparado. Evidencia:
[`limpiar-supresor-2026-09-17.txt`](../spikes/SPK-P0.10b-vu2/evidence/limpiar-supresor-2026-09-17.txt).

## Qué pasó, en orden

1. La corrida del [ítem 120](../compromisos/120-el-umbral-y-la-profundidad-de-la-puerta.md)
   **se murió de golpe** en su segundo control, sin mensaje. Dejó la consola
   escrita —el supresor apagado, el compresor puenteado, la puerta con umbral y
   profundidad puestos— y **el papelito de `pendiente.ts` abierto**, que es
   exactamente para lo que existe.
2. Se corrió `reparar-pendiente.ts`, que devolvió las doce claves y **lo comprobó
   releyendo por HTTP**: las doce OK.
3. **Y al comparar contra el retrato de antes de la madrugada apareció un filtro
   plantado**: `m.afs.eq.3` con **4000,03 Hz, Q 7, −18 dB**.

**4000 Hz es el tono de medición.** El reproductor `afplay` de la corrida muerta
**siguió vivo** —el proceso que lo lanzó murió, él no—, y el reparador devolvió
`m.afs.enabled` a 1 **con ese tono sonando**. El supresor hizo lo suyo.

## Por qué ninguna guarda podía verlo

Las corridas normales matan su reproductor en el `finally` de `conRestauracion`,
antes de restaurar. **`reparar-pendiente.ts` corre en otro proceso** y no tiene
ningún manejador de ese huérfano: para él, el tono es invisible.

Y las guardas estáticas tampoco: el reparador **lee** la clave del papelito y la
**restaura** —cumple las tres reglas—. Lo que estaba mal no es qué escribe sino
**en qué orden y con qué sonando**, y eso no se ve en el texto del programa.

## El arreglo

**Dos cosas, y las dos en `reparar-pendiente.ts`:**

1. **Silencio primero.** Antes de tocar nada mata cualquier `afplay` y cualquier
   grabador que hayan sobrevivido. Es tosco a propósito: no hay forma de
   distinguir «mi huérfano» de otro, y en una máquina de medición no hay ninguno
   legítimo.
2. **El supresor se devuelve ÚLTIMO.** Es el mismo principio que el `PREVIO` de
   los guiones ya aplicaba al fader —*«no se devuelve el nivel antes de devolver
   lo que lo protege»*— y acá es más fuerte: si algo quedara sonando pese al
   silencio, encender el supresor primero es plantar un filtro.

## El daño, y que era el mínimo

**Un filtro, detectado en la comparación de rutina contra el retrato de antes de
la madrugada, y borrado en seguida.** La pila volvió a cero, comprobado releyendo.

**Que se detectara no fue suerte**: comparar el volcado completo contra el estado
anterior es lo que se hace después de cada corrida desde el 2026-09-16. Sin esa
costumbre, el filtro se quedaba ahí, y el usuario lo habría encontrado en un
ensayo — con una banda de 4 kHz atenuada 18 dB en su PA y sin ninguna explicación.

## Lo que este incidente dice del método, y no es cómodo

**El papelito funcionó**: la corrida murió de la forma que `conRestauracion` no
cubre y el papelito la cubrió. **El reparador también hizo su trabajo**: devolvió
las doce claves y lo comprobó.

**Y entre las dos cosas correctas quedó un hueco.** La restauración era correcta
como lista de valores y equivocada como **secuencia**, y ninguna de las tres
guardas mira secuencias.

Queda anotado como lo que es: un tipo de defecto que este repositorio todavía no
sabe cazar solo.

## Trabajo previo

- **Ninguno de los cuatro repositorios de terceros toca el supresor** más allá de
  enumerar sus claves. Ver
  [`trabajo-previo-de-terceros.md`](../referencia/trabajo-previo-de-terceros.md).
- **Propio**: este proyecto ya le plantó filtros a esta consola **dos veces** antes
  —septiembre— y de ahí salieron la guarda de `m.afs.enabled = 0` y el trinquete
  `supresor-con-sonido`. **Las dos siguen siendo correctas y ninguna cubría esto**,
  porque las dos miran el guion que suena, no el que repara.
