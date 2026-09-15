# Hallazgo: capturas huérfanas que el validador no ve

**Encontrado el 2026-09-12**, mientras se agregaba el paso del plano al flujo
visual. **No se arregla en esa tarea**: un hallazgo en medio de una tarea va
como tarea nueva, y mezclarlo habría juntado una medición de la consola con una
limpieza de archivos.

## Qué pasa

`docs/visual/` guarda **138 capturas**. El recorrido tiene 28 pasos en dos
anchos, o sea 56 archivos de `flujo-*` esperados. Hay **108**, así que
**sobran 52**: capturas de pasos que ya no existen.

**Este párrafo decía 36 y hoy son 52.** El número no se actualizó y el recorrido
siguió cambiando —el paso 10, el plano del local, entró el 2026-09-12 y
renumeró los que venían—. Es la clase de cifra que envejece sola y que hay que
contar en vez de recordar. Lo notó una auditoría de coherencia cruzada.

Salen de renumerar. Cuando se insertó el paso del plano como 10, los pasos 10 a
27 se corrieron a 11 a 28 y quedaron los archivos con el número viejo. Ya había
pasado antes: conviven `flujo-tablet-18-historial.png` y
`flujo-tablet-18-recorrido-otro-estado.png`, de una inserción anterior.

## Por qué importa más de lo que parece

**El validador dice «138 guardadas, alineadas con los guiones y con el índice» y
pasa en verde.** O sea que comprueba que cada paso tenga su captura, y **no** que
cada captura tenga su paso. Es una comprobación en un solo sentido, y el sentido
que falta es justo el que deja basura acumulándose.

El daño real no es el espacio: es que alguien abra
`flujo-tablet-10-pa-lista.png` creyendo que mira el paso 10 y esté mirando una
pantalla de hace dos renumeraciones.

## Qué hacer

1. Que el validador compruebe los dos sentidos y falle si sobra una captura.
2. Borrar las 36 huérfanas en ese mismo cambio, para que el validador nuevo pase.
3. Que `flujo.mjs` limpie su carpeta de salida antes de escribir, así el
   problema no se vuelve a fabricar solo.

**No se borra nada antes de que el validador sepa detectarlo**, porque una
limpieza a mano sin comprobación se vuelve a ensuciar en la próxima inserción.
