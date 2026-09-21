# 121 — La frecuencia y el Q de las bandas 2, 3 y 4 del ecualizador de canal

**Contrato escrito ANTES de medir**, el 2026-09-20, como pide la disciplina del
proyecto. Lo que está abajo es lo que se promete y lo que no; los resultados se
agregan después, y si contradicen esto, el que manda es el resultado.

## Estado al 2026-09-21: TRES corridas de la banda 2, las tres fallan, y ya se sabe por qué

**La causa está medida y no es el aparato ni el banco: es el instrumento.** Puentea
el compresor del canal para que no aplaste la punta de la campana, y con eso se
lleva los **28,00 dB de ganancia de salida** que el preajuste `Kick Drum` del
usuario tiene cargado en el canal 10 desde el 2026-09-15. Aislado cambiando una
sola clave, con el retorno interno de la interfaz quieto en −27,00 dBFS las dos
veces. Todo en
[`el-banco-no-estaba-roto-el-instrumento-se-comia-28-db.md`](../backlog/el-banco-no-estaba-roto-el-instrumento-se-comia-28-db.md),
con los dos diagnósticos equivocados que hubo en el medio y cómo los cortó el
usuario.

La tercera corrida —[`curvas-banda-2-2026-09-21.txt`](../spikes/SPK-P0.2b/evidence/curvas-banda-2-2026-09-21.txt)—
se hizo **con el banco probado sano un minuto antes** y volvió a capturar a
−58,3 dBFS, que es lo que confirmó que el problema no era el banco.

**Lo que falta para cerrar el ítem**: compensar esos decibeles —subiendo el
estímulo o el previo— y repetir las tres bandas. La ley no está en duda; la
relación señal a ruido sí.

## Estado al 2026-09-20: dos corridas de la banda 2, y las dos fallan su control

**La ley sale bien las dos veces y NO se publica**, porque el control de cierre
del propio instrumento dice que la corrida no vale. Publicarla igual, apoyándose
en que el error es seis veces menor que el criterio, sería exactamente lo que
este repositorio hizo tres veces con el límite de su banco.

| | Banda 1, `curvas-del-ecualizador-2026-09-13b.txt` | Banda 2, corrida 1 | Banda 2, corrida 2, con todo callado |
|---|---|---|---|
| E3, error de `f0` | ≤ 0,2 % | **0,78 %** | **0,61 %** |
| E5, factor del Q | — | **1,01** | **1,03** |
| **E6, la forma de la base** | **0,09 dB — PASA** | **0,97 dB — FALLA** | **0,89 dB — FALLA** |
| Dispersión punto a punto | 0,024 dB | 0,234 dB | **0,244 dB** |
| Pico de la línea base | **−29,6 dBFS** | −58,8 dBFS | −58,7 dBFS |

Evidencia: [`curvas-banda-2-2026-09-20.txt`](../spikes/SPK-P0.2b/evidence/curvas-banda-2-2026-09-20.txt)
y [`curvas-banda-2-2026-09-20b.txt`](../spikes/SPK-P0.2b/evidence/curvas-banda-2-2026-09-20b.txt).

### La primera explicación era razonable y era falsa

Se atribuyó la deriva a los **diez canales abiertos** de la consola del usuario
—seis micrófonos de voz, dos entradas de línea y tres retornos de efecto— que
entran a la misma mezcla por la que el banco escucha. Encajaba, y el usuario
autorizó callarlos.

**Se callaron 31 rutas y no cambió nada**: la dispersión pasó de 0,234 a 0,244 y
la forma de la base de 0,97 a 0,89. Dentro del ruido. La hipótesis queda
**refutada**, y se deja escrita porque el error es instructivo: la explicación
encajaba con el síntoma y no era la causa.

### Lo que sí distingue a hoy de septiembre: hay 29 dB menos de señal

**Las dos corridas de hoy capturan a −58,8 dBFS y la buena de septiembre a
−29,6**, con la misma ganancia de previo en el canal —`hw.9.gain` vale
`0.2508445026` en las tres, comprobado— y sin que callar cambie el nivel. La
diferencia está **fuera de la consola**: el nivel de salida de la interfaz o su
ganancia de entrada, que son perillas físicas.

Con 29 dB menos de señal la dispersión por punto sube, y de ahí cuelga todo: el
propio instrumento avisa que por encima de 0,05 dB su resolución declarada de
±1,5 % queda sin respaldo.

**Lo que queda por hacer es subir el nivel del banco y repetir**, no aflojar el
criterio.

### Lo que quedó comprobado igual, y vale

- **El instrumento quedó parametrizado por banda**, y la banda 1 sigue siendo el
  valor por omisión para que una corrida sin argumento reproduzca el ítem 101.
- **La consola del usuario volvió exactamente a como estaba** las dos veces,
  comprobado por HTTP clave por clave y, la segunda, comparando dos volcados
  completos: ninguna diferencia en los silencios, y el supresor del general
  encendido.
- **El canal 10 no manda nada a los auxiliares ni a los efectos**, así que el
  tono sostenido no llegó a los supresores de las cuñas, que están encendidos.

## Por qué se mide

**Es la primera tarea del plan de la pieza 2** —el ecualizador de canal— y la
que sostiene todo lo demás: [ADR-038](../adr/ADR-038-el-criterio-del-ecualizador-de-canal.md)
decidió que la corrección sale de medir el propio canal y de mover una banda por
vez, y **la regla 1 del repositorio prohíbe escribir sobre un parámetro sin ley
medida**.

**Qué hay hoy.** El [ítem 101](101-las-curvas-del-ecualizador.md) midió la
frecuencia y el Q **de la banda 1 solamente**, y el [ítem 113](108-la-ley-de-la-ganancia-del-ecualizador.md)
midió **las cuatro ganancias**, que dieron la misma recta. O sea que la
aplicación sabe cuánto realza cualquiera de las cuatro bandas, y **no sabe en qué
frecuencia está parada ninguna salvo la primera**.

**Y la hipótesis es buena, que es justamente el riesgo.** El cliente que sirve la
propia consola usa **la misma función para las cuatro bandas** —`FREQtoV` y
`QtoV`, sin índice de banda— y en la banda 1 esa función coincide **exacto** con
lo medido por el 101. Las cuatro ganancias ya dieron la misma recta. Todo apunta
a que las tres faltantes comparten la ley.

**Nada de eso es una medición.** Es la clase de hipótesis cómoda que este
repositorio ya publicó como hecho cuatro veces y tuvo que retractar. El 101
existe porque el `mixer.html` tampoco alcanzaba para la banda 1.

## Qué se promete

Para **cada una** de las bandas 2, 3 y 4, medidas por separado contra el filtro
real del canal:

1. **Si la frecuencia central sigue `20 · 1102,5^V`**, la misma exponencial que la
   banda 1, dentro de una tolerancia declarada.
2. **Si el Q sigue `0,05 · 300^V`**, ídem.
3. **El tramo de crudo sobre el que eso se comprobó**, que es el único tramo que
   habilita escritura. Fuera de él la respuesta es `FUERA_DE_RANGO`, no una
   extrapolación.

## Qué NO se promete

- **Nada de la banda 5.** Está medido que se escribe y **no suena**: el
  ecualizador de este canal tiene cuatro campanas. No entra en esta medición.
- **Nada sobre el ecualizador de salida ni sobre los buses.** Es otro `kind` y
  otra superficie.
- **Nada sobre la forma de la campana fuera de lo que `qPorAnchoMitad` mide**:
  el ancho a mitad de altura, no la pendiente de las faldas ni el orden del
  filtro.
- **Nada sobre otros canales.** Se mide un canal. Que los veinticuatro compartan
  la ley es una suposición razonable y no se va a publicar como medida.

## Cómo se mide, y por qué así

**Con el mismo instrumento que midió la banda 1**, parametrizado por banda. Usar
el guion que ya pasó auditorías vale más que escribir uno nuevo y más corto: los
controles que trae —el recorte, el margen sobre el ruido, la altura mínima, la
caída exigida de los dos lados, el crudo que se repite al cierre para ver si el
banco se movió— son los que hacen que la medición sea defendible.

**Se mide el filtro, no la clave.** La consola guarda el crudo; releerlo no dice
en qué frecuencia filtró el DSP. Lo que lo dice es la respuesta en frecuencia del
canal, capturada con el multitono y restada contra su propia línea base.

**La línea base es con el ecualizador ADENTRO y la banda que se mide en su
ganancia neutra**, no con el ecualizador puenteado. Así las otras tres bandas,
el pasa-altos y el pasa-bajos están en las dos capturas y se cancelan; puentear
todo y volver a meter todo mediría el producto de las siete hojas.

**Se puentea lo que depende del nivel y nada más**: el compresor del canal, el
de-esser, la puerta, el compresor del general y **el supresor de realimentación
del general**. Todos aplastarían justo la punta de la campana, que es de donde
salen la frecuencia central, la altura y el Q.

## Lo que le toca al equipo del usuario

- **Suena.** El estímulo entra por el canal 10 y sale por el general, que es por
  donde el banco escucha. Si su PA está encendida, se oye.
- **El supresor del general se apaga durante la corrida y se vuelve a encender**
  al terminar. Está declarado en la lista de restauración y se comprueba por
  HTTP.
- **Se anota el valor previo de cada clave que se toca**, leído del aparato, y se
  restaura con `try/finally` más el registro en disco que sobrevive a una caída.
- **Ninguna instantánea se toca.**

## Qué esperaría un auditor que no vio el resultado

Escrito antes, para que no se pueda acomodar después:

1. **Que las tres bandas den la misma ley, con los residuos en el mismo orden que
   los del 101.** Si una da distinto, la sospechosa es la medición antes que el
   aparato, y hay que decir por qué.
2. **Que el crudo que se repite al cierre dé lo mismo que al principio.** Si el
   banco se movió, la corrida no vale, por buena que se vea la curva.
3. **Que la altura de la campana sea del orden de la ganancia escrita.** Con el
   crudo de ganancia en 1,0 la banda tiene que subir cerca de 20 dB; si sube 6,
   algo se está aplastando y la punta no es la punta.
4. **Que el tramo publicado sea el barrido**, y no el rango del parámetro. El 101
   publicó 0,25 … 0,90 para la frecuencia y 0,35 … 0,70 para el Q porque eso fue
   lo que vio.
5. **Que si el resultado confirma la hipótesis, el documento no se escriba como
   si siempre hubiera sido obvio.** Confirmar una hipótesis cómoda es el
   resultado más fácil de contar mal.

## Qué desbloquea

Que la aplicación pueda **escribir las bandas 2, 3 y 4**, que es lo que la pieza
2 necesita para mover una banda elegida por medición y no la única que hoy tiene
ley.
