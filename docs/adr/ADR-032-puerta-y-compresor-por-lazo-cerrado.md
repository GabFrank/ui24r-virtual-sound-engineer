# ADR-032 — La puerta y el compresor se ajustan cerrando el lazo, no por ley

**Fecha:** 2026-09-17
**Estado:** **decidida y sin implementar.** No hay tope para `GATE` ni
`COMPRESSOR` en el motor, ni servicio, ni pantalla.
**Origen:** **Decisión del usuario**, eligiendo entre tres opciones el
2026-09-17, en la recapitulación registrada en
[`pedidos/2026-09-17-recapitulacion-y-hoja-de-ruta.md`](../pedidos/2026-09-17-recapitulacion-y-hoja-de-ruta.md).

## El problema, que lo crearon las mediciones

El alcance decía que las leyes de la puerta y del compresor **se miden antes de
la primera entrega**, y nombraba el umbral de la puerta en dB como la más
importante. Tres madrugadas de medición dijeron otra cosa:

- **El umbral de la puerta no se deja medir con este banco.** La puerta es un
  interruptor, así que el escalón de la escalera es la resolución; el
  [ítem 120](../compromisos/120-el-umbral-y-la-profundidad-de-la-puerta.md)
  lo acotó entre 80 y 100 dB por unidad y no más.
- **El compresor no tiene una relación: tiene una curva** ([117](../compromisos/117-la-curva-del-compresor.md),
  [119](../compromisos/119-la-superficie-del-compresor.md)), y su umbral tiene
  pendiente y no cero ([118](../compromisos/118-el-umbral-del-compresor.md)).
  Una ley que diga «comprimí 3 a 1» promete algo que el aparato no hace.

Y la regla 4 del repositorio ya decía cómo se actúa sin ley: **primero medir,
después corregir** — aplicar un cambio chico, volver a medir, revertir si
empeoró.

## Lo que el usuario decidió

**Las dos se ajustan cerrando el lazo sobre lo que la consola mide y manda en
cada trama:**

- **La puerta**, sobre el **indicador de puerta** (bit 7 del byte `+5` de `VU2`,
  confirmado): sube el umbral con el músico callado hasta que cierra, y lo baja
  con el músico tocando hasta que abre. La profundidad, que sí está medida, se
  escribe según el perfil.
- **El compresor**, sobre el **medidor de reducción** (byte `+5`, medido contra
  la caída real de nivel en el [ítem 97](../compromisos/97-leyes-del-compresor.md)):
  aprieta hasta la reducción que el perfil pide.

**No se miden más leyes de puerta ni de compresor para el MVP.** El umbral de la
puerta en dB, la superficie del compresor y sus tiempos **quedan congelados**
como referencia.

## Qué se descartó

| Opción | Por qué no |
|---|---|
| **Lazo cerrado, y además medir el umbral en dB** para que la pantalla muestre un número honesto | Otra sesión de consola con una escalera más fina que la histéresis. Descartado por ahora: sirve para mostrar, no para actuar, y el usuario eligió actuar primero. Se puede volver a preguntar cuando haya pantalla. |
| **Primero las leyes** — seguir midiendo hasta tener umbral, relación y tiempos en unidades físicas | Descartado porque dos de las tres ya demostraron no ser números, y porque es exactamente el trofeo de plástico que el usuario pidió no fabricar. |

## Lo que esta decisión NO resuelve

- **Cómo se le muestra el compresor al usuario** ahora que no hay relación. Sigue
  abierto; la decisión de hoy es sobre cómo se *actúa*, no sobre qué se dice.
- **Qué reducción y qué profundidad pide cada perfil.** `channel-profiles.ts`
  trae `compresorRatio` y `usaPuerta` por instrumento; hay que traducirlos a
  «cuántos dB de reducción» y revisarlos contra fuentes.
- **El lazo tiene su propio riesgo**: subir un umbral con el músico callado y
  bajarlo con el músico tocando pide dos estados que la aplicación tiene que
  distinguir, y el recorrido guiado ya sabe a quién le toca.

## Trabajo previo

**Buscado el 2026-09-17.** El inventario está en
[`trabajo-previo-de-terceros.md`](../referencia/trabajo-previo-de-terceros.md).

- **Los cuatro repositorios del protocolo**: `fmalcher/soundcraft-ui` expone
  las claves de la puerta y del compresor como crudo; **ninguno de los cuatro
  las ajusta contra un medidor**. Sobre cerrar el lazo no hay coincidencias en
  otros proyectos.
- **El propio supresor de la consola** es el precedente más cercano en el
  aparato: actúa sobre lo que mide y no sobre una ley escrita.
- **Propio**: [ADR-026](ADR-026-cerrar-el-lazo.md) —cerrar el lazo para la
  ganancia— es el mismo principio con el medidor de canal, y ya está en
  producción. Esta decisión lo extiende a dos medidores más que las mediciones
  del 2026-09-09 y del 2026-09-16 dejaron confirmados.
