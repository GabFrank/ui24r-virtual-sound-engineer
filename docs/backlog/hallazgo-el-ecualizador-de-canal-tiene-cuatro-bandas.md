# El ecualizador de canal tiene cuatro bandas, no cinco

**2026-09-16.** Medido contra el audio por el
[ítem 113](../compromisos/113-las-otras-cuatro-bandas-del-ecualizador.md).
Evidencia:
[`ley-ganancia-banda-5-2026-09-16b.txt`](../spikes/SPK-P0.10b-vu2/evidence/ley-ganancia-banda-5-2026-09-16b.txt).

## Lo que el proyecto venía diciendo

**«Cinco bandas paramétricas»**, en cinco documentos. La cuenta salía de contar
las claves que la consola publica: `i.N.eq.b1` a `i.N.eq.b5`, cada una con su
`freq`, su `gain` y su `q`.

## Lo que dice el audio

Con la banda 5 puesta en 1000 Hz, el tono presente y **80,5 dB sobre el piso**, se
barrió su crudo de 0 a 1 en 39 puntos.

**El recorrido medido fue 0,00 dB.**

No es un negativo sobre silencio, y esto es lo que lo hace concluyente: C1 pasó
—el tono estaba—, L1 pasó —el punto plano con el ecualizador activo coincidió con
el puenteado a la centésima— y C2 pasó. La medición era válida; lo que no se
movió fue el audio.

**`i.N.eq.b5.gain` se puede escribir y no llega a ningún lado.**

## Las otras cuatro sí, y con la misma ley

| Banda | Ley medida |
|---|---|
| 1 | `40,005·V − 20,004` |
| 2 | `39,999·V − 19,999` (ítem 108) |
| 3 | `40,010·V − 20,006` |
| 4 | `39,998·V − 19,998` |
| **5** | **no se mueve** |

## Las otras tres fuentes ya lo decían, y una era nuestra

| Fuente | Qué dice |
|---|---|
| **El manual del fabricante**, archivado en este repositorio | *«**4-band Parametric EQ**, High-Pass Filter, Low-Pass Filter, Compressor, De-esser and Noise Gate on input channels»* |
| **El cliente de la consola** | su gráfico recorre `"hpf b1 b2 b3 b4 lpf"`: cuatro campanas, más los dos filtros de corte |
| **El manual técnico del firmware**, archivado en `SPK-P0.2a/evidence/` | *«La EQ paramétrica de canal usa ramas **`eq.b1` a `eq.b4`** con freq, q y gain»* |
| **`fmalcher/soundcraft-ui`** | declara `b1`…`b5` en su tipo y los trae los cinco en su volcado de estado, **sin semántica**. Sus valores de fábrica son idénticos a los de esta consola |

**Dos de esas cuatro fuentes estaban archivadas en este repositorio**, y las dos
lo decían con todas las letras: el manual de usuario y el manual técnico del
firmware. Encontrarlas costó un `grep`, y el `grep` se hizo recién hoy — al
escribir el contrato, porque el usuario había pedido que el trabajo previo se
hiciera y se dijera explícitamente.

**O sea que esto no se descubrió midiendo: se confirmó midiendo.** El dato estaba
en casa y nadie lo había buscado, que es la misma forma del
[hallazgo del 2026-09-14](hallazgo-la-respuesta-estaba-archivada.md).

### Y el manual técnico no sólo lo decía: avisaba de ESTE error

Textual de
[`manual-tecnico-fw-3.5.8328.txt`](../spikes/SPK-P0.2a/evidence/manual-tecnico-fw-3.5.8328.txt),
archivado en este repositorio:

> «La EQ paramétrica de canal usa ramas **`eq.b1` a `eq.b4`** con freq, q y gain,
> además de HPF, LPF y sus pendientes. **La interfaz también contiene referencias
> a `b5` en contextos concretos; su presencia no convierte todas las EQ de canal
> en cinco bandas.** Debe respetarse el widget y el tipo de tira que origina cada
> referencia.»

**La segunda frase describe exactamente la equivocación que este repositorio
cometió**, escrita de antemano, en un archivo propio. No hacía falta medir nada
para no cometerla: hacía falta leer lo que ya estaba guardado.

Se mide igual, y la medición vale —una fuente escrita describe la pantalla y este
proyecto tiene dos contraejemplos de que el aparato hace otra cosa—. Lo que no
vale es la excusa: **el aviso estaba, y el `grep` que lo encuentra tarda un
segundo.**

## Por qué importa, y no es una cuestión de catálogo

**Una aplicación que ofrezca cinco bandas le muestra al usuario un control que no
suena.** Peor: uno que la aplicación *cree* que suena. Con la entrada puesta en la
tabla de conversión, el motor de seguridad la dejaría escribir —la unidad cuadra,
son dB— y la escritura se confirmaría por la conexión testigo, porque la clave
existe y la consola la guarda.

O sea: **todas las comprobaciones darían verde sobre un cambio que no hace nada.**
El usuario movería un control, la aplicación diría «aplicado», y el sonido no
cambiaría. Eso es peor que no tener la banda.

Por eso `i.N.eq.b5.gain` **no entra** en `RAW_MAP`, y la ausencia lleva su motivo
escrito al lado.

## Es la misma forma de error que se corrigió esta mañana

El 2026-09-16, unas horas antes, se descubrió que los **doce filtros** del
supresor del general eran **doce ranuras vacías**: la consola publica la clave
esté o no ocupada. Y `m.afs.numtotal` no se movía al plantarse un filtro, así que
la cuenta no detectaba nada.

**Las dos veces, contar claves publicadas se leyó como contar funciones que
funcionan.** Es la trampa que este protocolo pone: el volcado es generoso, expone
todo lo que el firmware guarda, y no distingue lo que está conectado de lo que no.

La regla que queda: **una clave que existe no es una función que funciona**, y la
única forma de saber cuál es cuál es escribirla y escuchar.

## Lo que esto NO dice

- **Nada de los buses de salida.** Ahí el ecualizador es el gráfico de 31 bandas,
  que es otra cosa y está medido aparte.
- **Nada de `b5.freq` ni `b5.q`.** Se midió que la ganancia no llega al audio; no
  se probó qué hacen las otras dos claves de esa banda. Lo razonable es que
  tampoco, y no está medido.
- **Nada de los subgrupos**, que el cliente dibuja con `this.bands = 5` en vez de
  6. Qué banda se cae ahí no se miró.
- **Un canal de veinticuatro.** Que `b5` esté desconectada en el canal 10 y
  conectada en otro no tiene sentido físico, pero tampoco está medido.

## Trabajo previo

Los cuatro repositorios estaban clonados y grepeados el mismo día; el inventario
con el commit de cada uno está en
[`trabajo-previo-de-terceros.md`](../referencia/trabajo-previo-de-terceros.md).

- **`fmalcher/soundcraft-ui`** es el único que nombra las bandas, y las nombra las
  cinco: `b1?: B1; … b5?: B1;` en `mixer-state.models.ts`, con `B1 = {gain, q,
  freq}`. **No dice cuántas funcionan**, y no convierte ninguna.
- **`Dennion/ioBroker.soundcraft`**, **`ndikanov/ui24`** y **`NaturalDevCR/MyUiPro`**:
  no tocan el ecualizador.

**Nadie mide si la quinta banda hace algo.** El dato de que un modelo de estado
ajeno también la enumere es, si acaso, la confirmación de que el error es fácil de
cometer: otro autor contó las mismas cinco claves.
