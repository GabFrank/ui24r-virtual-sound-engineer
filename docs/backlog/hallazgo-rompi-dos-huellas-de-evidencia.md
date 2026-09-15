# Hallazgo: rompí dos huellas de evidencia, y el validador no sabía decir cuál importaba

**2026-09-13.** Lo encontré corriendo `tools/docs/validate-huella-de-evidencia.mjs`
mientras preparaba el ítem 106.

## Qué pasó

`medir.mjs` escribe en cada evidencia la huella del guion que corrió, y su
docblock nombra el ataque que eso impide:

> *«no "mirar una corrida y archivar otra", sino **archivar una corrida y después
> cambiar el guion debajo**»*

**Hice exactamente eso, dos veces en la misma noche.** Archivé la 104 y después
le arreglé al guion el defecto del supresor; archivé la limpieza del supresor y
después le corregí el docblock al limpiador. Las dos huellas dejaron de
coincidir.

El detector funcionó. Lo que no funcionaba era lo que decía después.

## El problema del detector

Un ✘ mudo: «archivada X, hoy Y». No distingue **corregir una coma de un docblock**
de **cambiar el banco de la medición**. Y las dos cosas habían pasado, una de cada.

Peor: una de las dos divergencias es **permanente**. La 104 midió con el supresor
del general encendido —ése fue su defecto— y el guion de hoy lo apaga. Remedir no
reproduce esa corrida: daría otra, con la fuga 4,7 dB más arriba, como midió el
105. Así que ese ✘ no se podía resolver nunca, y **un control que está en rojo
para siempre es un control que nadie mira**.

## Lo que se hizo

**El validador ahora hace arqueología en vez de acusar.** Recorre el historial
buscando la versión cuya huella es la archivada, y cuando la encuentra compara el
código de entonces contra el de hoy **ignorando comentarios**. Dice una de tres:

- `SOLO EN COMENTARIOS` — el código que corrió es el de hoy, los números valen
  tal cual, y no hay nada que remedir;
- `TOCO CODIGO en: …` — la evidencia no es del guion de hoy, con los archivos
  nombrados;
- o que no encontró ninguna versión con esa huella, que es peor y se dice.

**No lee ninguna anotación ni le cree a ninguna prosa** para esto: reconstruye la
huella commit por commit.

**Y sale con 1 sólo si cambió el código.** Una coma de docblock no deja el
control en rojo.

## La divergencia reconocida, atada a un hash

Para el caso permanente hace falta poder cerrarlo sin mentir. La evidencia puede
declarar `# divergencia reconocida: <huella de hoy>`, y el validador la acepta
**sólo si esa huella es la de hoy**.

No es una exención por prosa: **si el guion vuelve a cambiar, la huella
reconocida deja de ser la de hoy y vuelve el ✘**. El reconocimiento caduca solo.

Y caducó, el mismo día: al extraer `leerUnaClave` a un módulo compartido, la
huella cambió y el validador volvió a marcarla sin que nadie se lo pidiera. Eso
está anotado en la propia evidencia.

## El límite honesto

La heurística de comentario reconoce `//`, `*` y `/*` por cómo empiezan; **no
parsea**. Un comentario raro la engaña, y el error cae del lado seguro: cuenta la
línea como código y acusa de más.

Y no distingue **mover** código de **cambiarlo**: la extracción de
`leerUnaClave` fue un movimiento puro y el validador la informa como «TOCO
CODIGO». También es el lado correcto del error.

*(La primera versión de ese docblock escribía el cierre de bloque de comentario
literal, dentro de un comentario de bloque, en la frase que habla de comentarios
raros. Cerraba el comentario y rompía el archivo. Queda dicho porque es el mismo
caso que la heurística describe, cometido al describirlo.)*

## Y una cosa que hice mal al commitear esto

El código de este cambio entró **mezclado en el commit del ítem 106**, cuyo
mensaje no lo menciona. La regla del proyecto es una tarea, un commit, y no la
cumplí. No reescribo historia ya empujada; queda dicho acá, que es donde un
lector lo va a buscar.
