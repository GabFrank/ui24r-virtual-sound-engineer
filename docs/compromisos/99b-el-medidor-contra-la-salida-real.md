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
  coinciden sobre el recorrido medido, entonces —calculado o medido— el medidor
  **sirve para lo que la aplicación lo usa**, que es saber qué está pasando en la
  consola.

  **Y el recorrido es 39 dB, no sesenta.** La primera versión de este contrato
  decía «sesenta decibeles», y eran del **fader**: el fader baja 61,7 dB entre el
  crudo 1,0 y el 0,05. El **medidor** no, porque tiene piso. Con el banco tal como
  quedó cableado —tono a −20 dBFS, `pre` en −51,66 dB— el medidor llega al byte 16
  a los **23 dB**, y la medición 94 ya se declaró indecidible con 18: correr eso
  sería un control que sólo puede confirmar.

  Subir el tono 16 dB sube el medidor y el nivel en la interfaz a la par, y ahí el
  tope lo pone el recorte de la interfaz: pico en −6,9 dBFS y **39 dB de
  recorrido**. Es lo que hay, se calcula en el guión antes del primer punto, y si
  diera menos de 25 la corrida **aborta** en vez de publicar un número que no
  decide nada.

  El costo: el tono no es el de la 97 ni el de la 98, así que **los niveles
  absolutos de esta corrida no son comparables con aquéllas**. La ganancia del
  previo, `hw.N.gain`, **no se toca** y se registra — eso es lo que permite decir
  que el banco es el mismo aparato en el mismo estado.
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
   - **los dos medidores del general**, que llegan en el mismo cuadro y no
     cuestan nada: el de antes de su fader (+0), el de después (+1) y su
     **reducción de ganancia** (+4);
   - **la salida real del general**, capturada por la entrada 1 de la interfaz.

   Los del general convierten una comparación de **dos puntos** en una cadena de
   **cuatro**, y con eso una divergencia queda *localizada* en vez de quedar en
   «el medidor no predice»:

   | Tramo | Qué lo mide | Qué significa que se rompa |
   |---|---|---|
   | fader del canal → `salida` | el medidor del canal | el post-fader no sigue al fader |
   | `salida` → `pre` del general | dos medidores de la consola | algo en la suma del bus |
   | `pre` → `post` del general | el fader del general | el general no está estático |
   | `post` del general → entrada 1 | **el instrumento externo** | **el medidor no predice la salida** |
   | reducción del general | el byte +4 | **el compresor del general actuó** |

   Y si `post` del general sigue a `salida` del canal escalón por escalón, queda
   **medido** que el general es una ganancia estática, que hoy es una suposición.
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
  **Éste es el testigo fuerte**: vigila el camino analógico de reproducción
  entero, incluida la perilla de salida de la interfaz y el cable.
- **La referencia interna no se mueve.** Vigila que la computadora siga emitiendo
  el mismo nivel digital, **y nada más**: los canales 3 y 4 son un retorno
  *interno* de la interfaz, así que no ven la perilla de salida, ni el cable, ni
  el previo.
- **Y el camino de *captura* no lo vigila nadie.** La salida de la consola, el
  cable, la perilla de entrada del canal 1 —un potenciómetro analógico que se
  puede rozar— y el conversor. Todo el eje de dB reales cuelga de eso, y su único
  control es **repetir el punto de arranque al cierre**: tiene que caer dentro de
  **0,2 dB** del de apertura, y si no, la corrida no vale. La vuelta del barrido
  lo da gratis.
- **Y que el tono salga y entre por el mismo aparato.** Con el mismo dispositivo
  en las dos puntas el desvío de reloj **se cancela exactamente** —la ida
  multiplica por `1+δ` y la vuelta divide por `1+δ`— y el tono grabado cae en
  1000,000 Hz. Con dispositivos distintos no se cancela y aparece como pérdida de
  ventana: medio bin cuesta **1,42 dB**. Se comprueba buscando el máximo entre
  999,5 y 1000,5 Hz al abrir y al cerrar. **M2 no cubre esto**: los canales 3 y 4
  se generan y capturan con los mismos relojes, así que leen bien igual.

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
| **Compresor del general** | **Se puentea** | `m.dyn.l.ratio = 0,0488` y `bypass = 0`, o sea que **está puesto y fuerte**. Su medidor de reducción dio **0,00 dB en los 77 cuadros** de la corrida en seco —medido, no deducido del umbral, cuya ley la 97 refutó—, pero eso fue a **un** nivel y el barrido mueve el nivel casi cuarenta decibeles. Se puentea, y se sigue leyendo su reducción en cada punto |
| Ecualizador gráfico del general | Plano | **0 de 62 bandas** fuera del centro |
| Puerta del general | Apagada | `m.gate.enabled = 0` |
| Retardo del general | Cero | `m.delayL = m.delayR = 0` |
| Compresor del canal 10 | Inerte | `i.9.dyn.ratio = 1`, que es 1:1 |
| Puerta del canal 10 | Inerte | `i.9.gate.thresh = 0`, el fondo |
| De-esser del canal 10 | Apagado | `i.9.deesser.enabled = 0` |
| Cadena entera, a 1 kHz | **Unidad** | Los cuatro medidores —`pre` y `salida` del canal, `pre` y `post` del general— leen **−51,66 dB idénticos**, en la corrida en seco con el tono a −20 dBFS. La corrida real usa el tono 16 dB más arriba, así que los absolutos suben 16 y la unidad se vuelve a comprobar en el punto de arranque |

**Y el compresor del general se puentea durante la corrida, y se restaura.**
Vigilarlo no alcanza. El ecualizador del general, su fader y el supresor apagado
son **ganancias estáticas** y se cancelan en una atenuación relativa al arranque;
el compresor **no**, porque depende del nivel, y el barrido mueve el nivel casi
cuarenta decibeles. Que hoy dé cero de reducción no dice que vaya a darlo cuarenta
decibeles más abajo — ni más arriba.

Se puentea con `m.dyn.bypass = 1` y **no** poniéndole 1:1, porque lo que se
compara son diferencias contra el arranque y cualquier ganancia de compensación
constante se cancela sola. El valor previo se lee con `exigirClave` y se restaura
por `conRestauracion`.

**Y se sigue vigilando igual**, con su propio medidor de reducción en cada punto:
si el puenteo no hizo lo que dice, el byte lo delata. Un puenteo que no se
comprueba es un control que sólo puede confirmar.

**La puerta y el dinámico del canal 10 están puestos, y están cubiertos.**
`i.9.gate.enabled = 1` con el umbral en el fondo, y el dinámico del canal en 1:1.
Los dos están **aguas arriba** del fader, así que su acción no cambia al moverlo,
y **M1 los delata si actuaran**. Queda escrito para que se sepa que están
cubiertos y no ignorados.

**Y el banco se archiva, que es lo que la 98 estableció y esta corrida casi
pierde.** Antes del primer punto se leen y se registran `pre`, `hw.N.gain`, el
piso del bin con el tono apagado, `i.N.pan`, qué pierna del general lleva la
señal, y **el general entero**: `m.mix`, `m.dyn.*`, `m.gate.*`, `m.eq.*`,
`m.afs.enabled/fmode`. Es todo lo que hay entre el fader del canal y el conector,
y hasta esta versión no estaba escrito en ninguna parte.

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

**El instrumento externo no cuantiza a escalones, pero decir que «no aporta nada»
era falso**, y de una manera que habría hecho entrar como válidos los puntos que
peor se miden. Tiene tres términos de error y dos dependen del punto:

- **Ruido en el bin.** Los «98 dB abajo» son la relación en *un* nivel; al bajar
  el tono 40 dB, el margen baja 40 dB. El error de amplitud es
  `8,686 × 10^(−margen/20)` dB: con **20 dB** de margen son **0,87 dB**, casi el
  doble del umbral de M3 — o sea que en el borde de su propio rango de validez el
  instrumento erraba más que lo que se quería decidir. **Un punto sólo vale con
  45 dB o más** sobre el ruido del bin, que son 0,05 dB, un sexto de escalón.
- **Y «el ruido del bin» no es lo que el analizador imprimía.** `analizar.mjs`
  informaba el ruido de **banda ancha** —la potencia total menos la del tono— y
  eso está unos 50 dB por encima del ruido que de verdad limita una medición en un
  bin de 0,3 Hz. Medido en el banco del 2026-09-12: banda ancha −68,46 dBFS,
  **ruido en el bin −114,06**, 45,6 dB de diferencia. Usar el primero como
  criterio habría anulado casi todo el barrido sin motivo. El analizador ahora
  informa los dos, midiendo el segundo con el mismo Goertzel corrido **al lado**
  del tono, y **el piso se mide en esta corrida con el tono apagado**, no se
  hereda de otra.
- **Desalineación de frecuencia.** Con la ventana de Hann, 0,1 bin cuesta
  0,056 dB y medio bin **1,42 dB**. Se cancela en las atenuaciones sólo si el
  desplazamiento es el mismo en todos los puntos; se comprueba al abrir y al
  cerrar (ver los testigos).
- **Ganancia analógica de captura.** No la vigila nadie. Su cota es la repetición
  del punto de arranque al cierre, dentro de 0,2 dB.

| # | Predicción | Qué la falsaría |
|---|---|---|
| **M1** | **`pre` y `entrada` no se mueven** más de 0,667 dB en todo el barrido | Que se muevan: la fuente cambió, o el fader no está donde este proyecto cree |
| **M2** | **La referencia interna no se mueve** más de 0,2 dB | Que se mueva: el camino de reproducción cambió |
| **M3** | **La atenuación de la salida real sigue a `faderADb`** dentro de **0,5 dB**, en los puntos donde el tono queda **45 dB** sobre el ruido del bin | Que se desvíe. Sería la primera evidencia medida **afuera** de que `faderADb` no describe el fader, y tocaría todo lo que la usa |
| **M4** | **La atenuación del medidor `salida` y la de la salida real coinciden** dentro de 0,667 dB, **sólo donde el byte del medidor está entre 16 y 239** | Que difieran. El medidor no predice la salida |
| **M5** | **El escalón del medidor es 0,333401 dB**: la recta de **bytes** del medidor contra **dB reales**, por mínimos cuadrados con la ordenada libre sobre los puntos que sobrevivan a la ventana de M4, tiene pendiente 0,333401 dB/byte dentro del **1 %** | Otra pendiente. `MEDIDOR_RANGO_DB = 80` o `VU_ESCALA` están mal, y eso toca **todas** las mediciones del proyecto |
| **M6** | **Ida y vuelta.** El mismo crudo da la misma atenuación bajando y subiendo, dentro de 0,667 dB | Que no: histéresis o falta de asentamiento |

### El control de balística: SE SACA, y por qué

La primera versión de este contrato proponía bajar el fader de golpe y comparar
cuántos milisegundos tarda cada instrumento en llegar abajo, con este
razonamiento:

> *«Si el medidor cae de un cuadro al siguiente y la salida real tiene una cola,
> el medidor es un cálculo del fader y no una medición del audio.»*

**Ese razonamiento ya estaba refutado por una medición de este mismo proyecto.**
`docs/protocol-spec.md:412`, sección Balística, midió el 2026-09-10 la caída de
este medidor: **20 dB con mediana de 37 ms**, contra una cadencia de cuadro de
**~44 ms**. O sea que *«cae de un cuadro al siguiente»* es el resultado esperado
**también para un medidor que mide de verdad**, porque su caída medida es más
corta que un cuadro. El control estaba garantizado a dar el resultado que yo iba
a leer como «es un cálculo», midiera o calculara: una falsación imposible antes
de medir nada.

Y en la otra dirección tampoco decide: una cola en la salida real la puede
producir el rampeo del fader digital de la consola, el relajamiento del compresor
del general, el transitorio del ecualizador de 31 bandas o el pasa-altos del
conversor. Ninguno de esos es «el medidor integra audio».

**Y hacía falta algo que no existe.** `analizar.mjs` devuelve un número por
archivo, no una envolvente; para una curva de caída hay que correr el Goertzel
sobre ventanas sucesivas. Y no hay origen de tiempo común: los cuadros `VU2` no
traen marca de la consola y entre la entrada y el WAV está la latencia de
CoreAudio más el buffer.

Así que **no va en esta corrida**. Queda en el registro de trabajo pendiente como
lo que es: una medición propia, con su propio instrumento por escribir, que tiene
que empezar declarando que su resolución es de un cuadro y que el efecto que
busca es más corto que eso.

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
- **Y un acuerdo dentro del umbral es una cota, no una identidad.** M3 pasando
  dice que si `faderADb` se aparta del fader real, se aparta **menos que 0,5 dB en
  los puntos medidos**. No dice que sea la ley del fader — la 94 declaró
  exactamente eso indecidible, y esta corrida tiene mejor instrumento pero la
  misma lógica. Lo mismo vale para M4.
- **Esto NO rescata a la 94 ni a la 96b, y la asimetría es real.** Si el medidor
  difiere de la salida, las dos quedan tocadas, porque midieron leyes a través de
  medidores post-fader. Si **coincide**, no quedan salvadas: esta corrida mide el
  byte `+2` de la sección de **entradas**, y la 94 leyó el bloque de **auxiliar**
  y la 96b el de **efectos**, que están en la cola de la trama, tienen otro paso,
  y cuya escala en dB el `protocol-spec` §4.4 declara **no medida sobre esos
  bloques**. Cerrar esa mitad es otra corrida: el mismo método, con el general
  recibiendo de un auxiliar.
- **Nada sobre un error de escala constante**, que es invisible por construcción
  en una medición relativa al arranque.
- **Un solo nivel de fuente.** Si el acuerdo aparece, es una forma consistente, no
  una escala probada: para eso hay que repetir con la fuente 10 dB más abajo,
  donde las atenuaciones en dB tienen que dar iguales y las absolutas no.
- **Nada sobre el fader del general ni sobre el de un bus.** Lo que se barre es
  `i.N.mix`; el general se atraviesa como ganancia estática, y eso **se comprueba
  con sus medidores**, no se supone.
- **Y el ruido del bin no es el ruido del sistema.** Que el tono se vea 98 dB
  sobre el piso en 1 kHz no dice que la consola tenga 98 dB de rango dinámico;
  dice que **en esa frecuencia** se puede seguir midiendo hasta ahí.

## Restauración

Se escriben **tres claves** —`i.9.mix`, `m.afs.enabled` y `m.dyn.bypass`— y las
tres se leen del aparato con
`exigirClave`, que falla si la lectura no llegó en vez de suponer. La
restauración va por `conRestauracion`, que corre también si llega una señal, y se
comprueba **releyendo por HTTP**, que es un camino distinto del que escribió.

El supresor del general se apaga mientras el tono suena y se restaura: un tono
sostenido le planta notches de −18 dB, y ya pasó dos veces hoy.

**No hay nada conectado a ninguna salida física** —el usuario desconectó la
Rokit y el B2— salvo los dos cables del bucle a la interfaz. Así que esta corrida
no hace ruido en la sala.


---

# Resultado

**Corrida del 2026-09-13**, archivada en
`docs/spikes/SPK-P0.10b-vu2/evidence/medidor-contra-salida-real-2026-09-13c.txt`
con la huella del guión. Banco: tono de 1 kHz a −15 dBFS por la Scarlett al canal
10, `hw.9.gain = 0,2508445026` —**el mismo que la 97 y la 98**—, 48 puntos de ida
y vuelta, 44 útiles, 34 dentro de la ventana del medidor.

Hubo **tres corridas**. Las dos primeras no llegaron a barrer o no sirvieron, por
errores míos que las guardas atajaron; están al final, porque callarlas dejaría
este documento diciendo que salió a la primera.

## Las seis expectativas

| # | Umbral | Resultado | |
|---|---|---|---|
| **M1** | `pre` y `entrada` quietos, 0,667 dB | rango **0,12 dB**, 0 puntos fuera | **PASA** |
| **M2** | referencia interna, 0,2 dB | **0,00 dB** | **PASA** |
| **M3** | salida real vs `faderADb`, 0,5 dB | **0,12 dB** máximo, 22 puntos | **PASA** |
| **M4** | medidor vs salida real, 0,667 dB | **0,17 dB** máximo, 17 puntos sobre 35,0 dB | **PASA** |
| **M5** | escalón del medidor, 1 % | **0,333017** dB/byte contra 0,333401 — **0,11 %** | **PASA** |
| **M6** | histéresis, 0,667 dB | **0,00 dB** | **PASA** |

Y los controles del camino que M2 no cubre: el punto de arranque repetido al
cierre difiere **0,00 dB**, y la alineación de frecuencia cae en el centro exacto
al abrir y al cerrar.

## Lo que queda establecido

**`faderADb` queda verificada desde afuera de la consola.** Es la primera vez en
este proyecto. Los 0,12 dB son de un conversor que no es el de la consola, sobre
22 puntos y 60 dB de recorrido de fader. **Y es una cota, no una identidad**: dice
que si la ley se aparta del fader real se aparta menos que eso *en los puntos
medidos*.

**El medidor predice la salida real**, 0,17 dB sobre 35 dB de tramo. Para lo que
la aplicación lo usa —saber qué está pasando— el medidor sirve. Esto **no**
distingue «medido» de «calculado y correcto», y eso sigue abierto.

**El escalón del medidor queda anclado a un instrumento externo.** El **rango
implicado es 79,91 dB** contra el 80 declarado. Dos corridas independientes dieron
79,90 y 79,91. La hipótesis de los **84,5 dB** que este proyecto tuvo que retirar
queda descartada **con evidencia de afuera**, no por autoconsistencia.

**El general es una ganancia estática: medido, no supuesto.** De `pre` a `post`
del general, 0,21 dB en todo el barrido, con el compresor puenteado y su medidor
de reducción en 0,00 dB en los 48 puntos.

**La consola no redondea el crudo del fader.** 1 → 1, 0,4 → 0,4, 0,05 → 0,05
exactos, releídos por HTTP. Cierra la duda de si `faderADb` había que evaluarla en
lo escrito o en lo devuelto: son lo mismo.

## Dos cosas que aparecieron sin buscarlas

**1. Los medidores de la consola se movieron y el audio no.** En la segunda
corrida, en un punto —crudo 0,52 de la vuelta— los **cuatro** medidores de la
consola subieron juntos ~0,8 dB:

| | bajando | subiendo |
|---|---|---|
| `pre` | −46,66 | −45,85 |
| `salida` | −57,33 | −56,46 |
| `pre`/`post` del general | −57,00 | −56,20 |
| **salida real, por la interfaz** | **−28,49** | **−28,50** |

La salida real no se movió **0,01 dB**. En la tercera corrida no se repitió, así
que fue un transitorio y no algo sistemático — pero **sin el segundo instrumento
habría entrado al registro como un evento real de 0,8 dB**. Es exactamente para lo
que sirve medir por dos caminos.

**2. El medidor de canal y el del general no tienen el mismo fondo.** Cerca del
piso del medidor de canal los dos se separan hasta **1,14 dB**, y por debajo el de
canal da `-Infinity` mientras el del general sigue informando −77 dB. Eso toca la
mitad abierta del `protocol-spec` §4.4 —a cuántos dB equivale un escalón en los
bloques de la cola— y **esta corrida no la cierra**: mide el bloque de entradas.

## Las tres corridas, y por qué hubo tres

| | Qué pasó | Quién lo atajó |
|---|---|---|
| **a** | Abortó antes de barrer: la interfaz recortaba, pico 0,00 dBFS | La guarda de recorte |
| **b** | Barrió, pero con el estimador de piso de una sola muestra y M1 como veredicto global | Los datos: dos tomas del mismo silencio dieron −106,70 y −136,12 dBFS |
| **c** | La buena | |

**El error de la (a) fue calcular el recorrido desde `pre`** cuando el barrido
arranca en el crudo 1,0, que son **+10 dB de fader** por encima. El medidor y la
interfaz empezaban los dos diez decibeles más arriba de lo que la cuenta suponía.

**El error de la (b) fue estimar un piso de ruido con una muestra.** Un bin
aislado de ruido no es «el piso»: es una variable aleatoria con **5,6 dB** de
desviación y cola hacia abajo. Ahora se promedian 40 bins, y **la guarda juzga
cada punto contra el ruido de su propia captura** en vez de contra un número de
hace cinco minutos.

Los dos errores estaban en **la aritmética del guión, no en la prosa del
contrato**, y el auditor de expectativas —que leyó el contrato— no vio ninguno de
los dos. Eso es un hallazgo sobre el método: **el auditor tiene que correr contra
el guión además del contrato.**

## Restauración, comprobada

`i.9.mix`, `m.afs.enabled` y `m.dyn.bypass` restaurados a lo leído del aparato
antes de empezar, y comprobados **por HTTP**, que es un camino distinto del que
escribió. `hw.9.gain` y `m.mix` nunca se tocaron. La instantánea **Alma caninde**
se verificó presente leyendo `SHOWLIST` y `SNAPSHOTLIST`, no por «no la toqué».
