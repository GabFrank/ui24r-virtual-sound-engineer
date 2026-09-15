# Hallazgo: el umbral de «un escalón» está mal puesto para una diferencia

**Encontrado el 2026-09-12**, midiendo el ítem 96b. **No se arregla ahí**: un
criterio de falsación no se toca después de ver el dato, y la 94 ya documenta
lo que pasa cuando se hace.

## El problema

Las mediciones de esta serie deciden con un umbral de **un escalón del medidor**
—`MEDIDOR_RANGO_DB × VU_ESCALA` = 0,3334 dB—, con el argumento de que ningún
hallazgo por debajo de la resolución del instrumento existe. Para una **lectura**
está bien.

**Para una diferencia de dos lecturas, no.** Cada lectura arrastra hasta
±0,167 dB de cuantización. La diferencia de dos arrastra hasta ±0,333 dB **sólo
por cuantización**, sin que nada se haya movido. O sea que un umbral de un
escalón aplicado a una diferencia **rechaza por construcción** resultados que el
instrumento no puede separar de cero.

Las pruebas que comparan dos curvas —linealidad, histéresis, ida contra vuelta—
son todas diferencias.

## Qué pasó en el 96b

La prueba de linealidad dio **1,24 escalones** contra un umbral de 1,00. Falló
como estaba escrita. Seis de los ocho puntos dieron 0,00 exacto y el desvío
apareció en dos, con la misma magnitud que la histéresis — que es la firma de
una lectura ruidosa y no de un reverb que comprime.

**Nada de eso se usó para declararla aprobada.** El resultado se escribió como
falló, y la duda se resolvió repitiendo la corrida: si el desvío cae en el mismo
punto, es real; si se muda, era ruido.

## Qué hacer

1. **Separar dos constantes** en los guiones: `RESOLUCION_DB` para lecturas y
   algo como `RESOLUCION_DE_UNA_DIFERENCIA_DB = 2 × RESOLUCION_DB` para
   comparaciones entre lecturas. Las dos derivadas, ninguna escrita a mano.
2. **Que el contrato diga cuál usa cada predicción**, antes de medir.
3. **No retocar el 96b con el umbral nuevo.** Su resultado queda como está, con
   su criterio original y su repetición. Si el umbral corregido cambia la
   lectura de esa medición, eso se dice en una nota que cite las dos.

**Por qué importa el punto 3.** La tentación de aplicar el umbral corregido
hacia atrás es exactamente la forma que tomó el error de la 94: el cambio de
criterio era correcto y el orden estaba invertido. Un umbral mal puesto se
corrige para adelante.
