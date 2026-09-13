# 99b — El medidor de la consola contra la salida real

**Fecha: 2026-09-12.** Consola 192.168.0.78, fw 3.4.8318-ui24. Canal 10 (`i.9`),
la línea de la Scarlett. Contrato escrito **antes** de tocar la consola.

## Por qué ésta antes que las otras

Las cinco mediciones de hoy —94, 95, 96, 97 y 98— terminan todas con la misma
declaración:

> *«Esto es autoconsistencia y no calibración: se contrasta un medidor de la
> consola contra otro medidor de la misma consola, los dos decodificados con
> constantes del mismo `mixer.html`. Y todos los dB son de la escala del
> medidor, no dBFS.»*

Es la brecha más vieja del proyecto, y hasta hoy no había con qué cerrarla. El
2026-09-12 el usuario cableó la salida del general a la entrada 1 de la interfaz,
y con eso hay **un segundo instrumento**: otro conversor y código de análisis
propio.

### Y hay una hipótesis concreta que esto tiene que decidir

El auditor de expectativas del ítem 99a levantó una que no se podía descartar
desde adentro:

> *La consola podría no estar **midiendo** el medidor post-fader, sino
> **calculándolo**: `post = pre × VtoLIN(fader)`, para dibujar la barra.*

Si fuera así, cada vez que este proyecto comparó un medidor post-fader contra
`faderADb` estaba **contrastando una tabla contra sí misma**, y el acuerdo no
probaba nada del audio.

**Y no toca sólo al ítem 99a.** La medición 94 midió la ley del envío a un
auxiliar leyendo el medidor del bus, y la 96b la del envío a efectos igual. Si
el medidor fuera un cálculo, las dos quedan en duda.

## Lo que hace falta decir antes, sobre qué puede y qué no puede decidir esta corrida

**No puede distinguir «medido» de «calculado exactamente igual que la realidad».**
Si la consola calcula el medidor con una tabla que **acierta**, el resultado es
idéntico a medirlo. Ninguna comparación de niveles estacionarios los separa.

Lo que sí puede, y es lo que el producto necesita:

- **Decidir si el medidor predice la salida real.** Si el medidor y la salida
  coinciden sobre sesenta decibeles, entonces —calculado o medido— el medidor
  **sirve para lo que la aplicación lo usa**, que es saber qué está pasando en la
  consola. Y si difieren, la 94 y la 96b quedan tocadas y hay que decirlo.
- **Anclar el escalón del medidor a un instrumento externo.** El proyecto declara
  0,333401 dB por escalón derivado de dos constantes del `mixer.html`. Nunca se
  contrastó contra nada de afuera.
- **Verificar `faderADb` en la salida**, no a través del medidor de la propia
  consola.

Y hay una manera barata de atacar la parte que los niveles estacionarios no
separan: **la balística**. Un medidor calculado sigue al fader al instante; uno
que mide tiene tiempo de integración. La medición 96a usó exactamente ese
argumento para ubicar el medidor de un bus de efectos. Va como control aparte,
declarado abajo.

## El método

1. **La fuente se queda quieta.** Tono de 1 kHz por la Scarlett al canal 10, un
   solo nivel, la ganancia del previo sin tocar.
2. **Se barre el fader del canal**, `i.9.mix`, que es el parámetro cuya ley
   `faderADb` este proyecto cree conocer.
3. En cada punto se leen **a la vez**:
   - los tres medidores del canal en la consola: `pre` (+0), `entrada` (+1) y
     **`salida` (+2), que es el post-fader**;
   - **la salida real del general**, capturada por la entrada 1 de la interfaz.
4. **Y la referencia interna de la interfaz.** Sus canales 3 y 4 devuelven la
   señal que la computadora está mandando, exacta: medido el 2026-09-12, un tono
   generado a −20 dBFS lee −20,00. Con eso la transferencia se calcula como
   **capturado menos transmitido**, y una deriva del reproductor no se confunde
   con una del aparato.
5. **El nivel se mide en el bin de 1 kHz, no por pico.** Contra este banco, el
   pico da 32 dB de recorrido útil y el bin da 98. Sin eso el barrido se aplana
   a mitad de camino, que es lo que le pasó a la primera corrida de la 94.

### Los dos testigos

- **`pre` y `entrada` no se mueven.** El fader del canal está **aguas abajo** de
  los dos —medido el 2026-09-09— así que si alguno se mueve, se movió la fuente.
- **La referencia interna no se mueve.** Si cambia, cambió el camino de
  reproducción y el punto no vale.

## Las precondiciones, verificadas ANTES de escribir nada

**Entre el fader del canal y la entrada de la interfaz no hay sólo un cable.**
Está el resto de la cadena del canal, y después **el general entero con su
propio ecualizador, su propio compresor y su propio fader**. El contrato no lo
decía en su primera versión, y era el agujero más grande que tenía: si el
compresor del general estuviera actuando, barrer el fader del canal le cambiaría
el nivel de entrada y comprimiría distinto en cada punto. Lo que se mediría como
«la ley del fader» sería la ley del fader **a través de un compresor**.

Así que se verificó antes, leyendo del aparato:

| Qué | Estado | Cómo se sabe |
|---|---|---|
| **Compresor del general** | **No actúa** | `m.dyn.l.ratio = 0,0488` y `bypass = 0`, o sea que **está puesto y fuerte**. Pero su propio medidor de reducción dio **0,00 dB en los 77 cuadros** con el tono sonando. No se dedujo del umbral —cuya ley la 97 refutó—: se midió |
| Ecualizador gráfico del general | Plano | **0 de 62 bandas** fuera del centro |
| Puerta del general | Apagada | `m.gate.enabled = 0` |
| Retardo del general | Cero | `m.delayL = m.delayR = 0` |
| Compresor del canal 10 | Inerte | `i.9.dyn.ratio = 1`, que es 1:1 |
| Puerta del canal 10 | Inerte | `i.9.gate.thresh = 0`, el fondo |
| De-esser del canal 10 | Apagado | `i.9.deesser.enabled = 0` |
| Cadena entera, a 1 kHz | **Unidad** | Los cuatro medidores —`pre` y `salida` del canal, `pre` y `post` del general— leen **−51,66 dB idénticos** |

**Y el compresor del general se vigila durante el barrido, no sólo antes.** Su
medidor de reducción se lee en cada punto: si en alguno deja de dar cero, ese
punto no mide el fader y se anula. El nivel que le llega cambia en cada paso del
barrido, así que verificarlo una sola vez al principio no alcanza — eso sería un
control que sólo puede confirmar.

### Un hallazgo que salió de mirar, y que no era el objetivo

Buscando el compresor del general aparecieron dos claves que **ninguna medición
de este proyecto había leído**: `m.afs.numfixed = 6` y `m.afs.numtotal = 12`.

Con **cero filtros puestos** en las doce ranuras en ese momento, eso no es un
conteo de filtros: es la **asignación**. El supresor tiene **doce ranuras, seis
reservadas como fijas**, que es exactamente lo que el manual del fabricante dice
—«parametric EQ's (6 fixed, … floating)»— y explica de una lo que este proyecto
tenía con tres mediciones que sólo cerraban juntas: `clearlive` limpia las
flotantes y `clearall` las dos, así que un filtro que cayó en una ranura fija
resiste `clearlive`.

No es de esta medición y no se declara medido acá: queda anotado con su origen.

## Las expectativas

Falsables, con su umbral, antes de correr.

**El umbral del medidor de la consola es de dos escalones —0,667 dB—** en todo lo
que sea diferencia de dos lecturas, que es el caso de toda atenuación de acá.
**El instrumento externo no cuantiza a escalones**: su incertidumbre es el ruido
del bin, que en este banco está 98 dB abajo, así que no aporta nada al umbral.

| # | Predicción | Qué la falsaría |
|---|---|---|
| **M1** | **`pre` y `entrada` no se mueven** más de 0,667 dB en todo el barrido | Que se muevan: la fuente cambió, o el fader no está donde este proyecto cree |
| **M2** | **La referencia interna no se mueve** más de 0,2 dB | Que se mueva: el camino de reproducción cambió |
| **M3** | **La atenuación de la salida real sigue a `faderADb`** dentro de **0,5 dB** en el tramo donde el tono queda 20 dB sobre el ruido del bin | Que se desvíe. Sería la primera evidencia medida **afuera** de que `faderADb` no describe el fader, y tocaría todo lo que la usa |
| **M4** | **La atenuación del medidor `salida` y la de la salida real coinciden** dentro de 0,667 dB | Que difieran. El medidor no predice la salida, y la 94 y la 96b —que midieron leyes a través de medidores post-fader— quedan tocadas |
| **M5** | **El escalón del medidor es 0,333401 dB**, contrastado contra el instrumento externo: la recta de lecturas del medidor contra dB reales tiene esa pendiente dentro del 2 % | Otra pendiente. El `MEDIDOR_RANGO_DB = 80` o `VU_ESCALA` están mal, y eso toca **todas** las mediciones del proyecto |
| **M6** | **Ida y vuelta.** El mismo crudo da la misma atenuación bajando y subiendo, dentro de 0,667 dB | Que no: histéresis o falta de asentamiento |

### El control de balística, aparte

Con el tono sonando y el fader arriba, se lo baja de golpe a 0,05 y se muestrea
**el medidor cuadro a cuadro** mientras se graba la salida. Después se compara
cuántos milisegundos tarda cada uno en llegar abajo.

- Si el medidor cae **de un cuadro al siguiente** y la salida real tiene una
  cola, el medidor es un cálculo del fader y no una medición del audio.
- Si los dos tienen una cola parecida, el medidor está integrando audio.

**Esto no es una expectativa con umbral**: es una observación que se informa con
sus números. No hay un valor previo contra el cual compararla, y ponerle un
umbral inventado sería fabricar un criterio.

## Lo que esta corrida NO va a poder decir

- **Nada en dBu ni en dBFS absolutos de la consola.** Entre la salida de la
  consola y la interfaz hay una ganancia de entrada que nadie midió, y el manual
  da «+20,5 dBu máximo» que es un tope, no una referencia de calibración. Lo que
  se mide son **diferencias por un camino que no se toca**.
- **No distingue «medido» de «calculado y correcto».** Está dicho arriba y se
  repite acá porque es la conclusión que va a tentar.
- **Un canal, una frecuencia, un nivel de fuente, un fader.** Nada sobre los
  otros veintitrés canales, ni sobre los faderes de bus, ni sobre el general.
- **Nada sobre la ley inversa.** Esto mide crudo → dB. Una afirmación sobre
  `dbAFader` —«para bajar 6 dB escribí esto y no te equivocás más de X»— es otra
  cosa: la 94 la escribió y la tuvo que retirar.
- **Y el ruido del bin no es el ruido del sistema.** Que el tono se vea 98 dB
  sobre el piso en 1 kHz no dice que la consola tenga 98 dB de rango dinámico;
  dice que **en esa frecuencia** se puede seguir midiendo hasta ahí.

## Restauración

Se escribe **sólo `i.9.mix`**, y su valor previo se lee del aparato con
`exigirClave`, que falla si la lectura no llegó en vez de suponer. La
restauración va por `conRestauracion`, que corre también si llega una señal, y se
comprueba **releyendo por HTTP**.

El supresor del general se apaga mientras el tono suena y se restaura: un tono
sostenido le planta notches de −18 dB, y ya pasó dos veces hoy.

**No hay nada conectado a ninguna salida física** —el usuario desconectó la
Rokit y el B2— salvo los dos cables del bucle a la interfaz. Así que esta corrida
no hace ruido en la sala.
