# 109 — La ley de la ganancia del ecualizador de salida

## MEDIDA el 2026-09-16: `30·V − 15`, o sea ±15 dB

Evidencia:
[`ley-del-eq-de-salida-2026-09-16b.txt`](../spikes/SPK-P0.2c/evidence/ley-del-eq-de-salida-2026-09-16b.txt).

| | medido | tope |
|---|---|---|
| pendiente | **29.990 dB** por unidad de crudo | — |
| ordenada | **-14.995 dB** | — |
| residuo máximo (L2) | **0.001 dB** | 0.3 |
| recorrido total (L3) | **29.99 dB** | 24 mínimo |
| corte y realce (L4) | **-14.99** y **15.00 dB** | — |
| asimetría (L4) | **0.00** | 0.5 |
| el testigo se movió (C2) | **0.32 dB** | 1.0 |

**La fórmula del cliente resultó exacta**, igual que pasó con la del canal en el
ítem 108. Se redondea a `30·V − 15`: la milésima no se distingue de cero con esta
corrida.

## Y la otra pregunta también quedó contestada

**La banda 17 responde en 1000 Hz**, que es lo que decía su etiqueta. Medido
realzando la banda al máximo y comparando contra plano en cinco candidatas:

| | 630 Hz | 800 Hz | **1000 Hz** | 1250 Hz | 1600 Hz |
|---|---|---|---|---|---|
| realce | 1.96 dB | 5.31 dB | **14.99 dB** | 5.42 dB | 1.93 dB |

Simétrico alrededor del centro, y el pico donde la etiqueta prometía. **Con eso el
orden de las claves sigue al de las etiquetas, para esta banda**, y las 32
etiquetas contra 31 bandas se explican porque la última —«22k»— es el borde del
gráfico y no una banda.

**De yapa, la forma de la falda**, que el contrato decía que no iba a medir y
salió igual: con el realce al máximo, una banda de distancia mueve unos 5,3 dB y
dos bandas unos 1,95. No es la ley del filtro, pero acota cuánto se pisan las
bandas vecinas.

## El control C2 falló primero, y el defecto era del instrumento

La primera corrida —
[`ley-del-eq-de-salida-2026-09-16.txt`](../spikes/SPK-P0.2c/evidence/ley-del-eq-de-salida-2026-09-16.txt)—
dio la **misma ley**, con el mismo residuo de 0,001 dB, y **se negó a publicarla**
porque C2 midió 16,73 dB de movimiento en el testigo contra un tope de 1,0.

**El testigo estaba en 4000 Hz y el estímulo era un solo tono de 1000.** O sea que
no había nada que medir en esa frecuencia: lo que se leyó fue el ruido de fondo,
y su recorrido natural. El ítem 108 usa **dos tonos** exactamente por esto, y ese
precedente estaba a la vista.

Es la misma familia de error que este repositorio viene documentando —medir sobre
silencio y leerlo como una lectura— con el agravante de que acá no había que
descubrir nada: había que copiar al guion hermano.

**Que la corrida se negara a publicar es lo que funcionó.** La ley ya estaba bien
en esa primera corrida, y publicarla igual —con un control en rojo y la premisa
rota— habría sido acomodar la regla al resultado.

Corregido el estímulo a dos tonos y puesto el testigo **a seis bandas** —dos era
demasiado cerca: la propia medición de la falda dice que mueve 1,96 dB, más que el
tope— C2 pasó con 0,32 dB.

## Lo que esto NO cierra

- ~~**Nada del ecualizador del general.**~~ **Cerrado el mismo día por el
  [ítem 112](112-la-ley-del-ecualizador-del-general.md)**, que lo midió y dio
  `29,993·V − 14,996`: la misma ley. Se deja el renglón porque la deuda que
  declaraba —«que compartan la ley sigue siendo una suposición razonable»— es lo
  que hizo que alguien fuera a medirla.
- **Nada de las otras 30 bandas.**
- **No entra a `raw-map.ts` todavía**, y ahora se sabe exactamente qué lo
  bloquea: `canonizarRuta` sólo entiende las familias `i.N` y `aux.M`, y devuelve
  `undefined` para cualquier otra. Para `a.N.eq.peak.K` hay que enseñarle la
  familia `a.` y el índice de banda — y esa función es de la que depende INV-004
  para rechazar rutas. Es una tarea aparte, con su propia prueba.

---


**Contrato escrito el 2026-09-16, ANTES de tocar la consola.** Consola
192.168.0.78. Canal 10 (`i.9`) → auxiliar 5 (`a.4`) → entrada 2 de la Scarlett.

## Qué decide

Cuántos decibeles cambia el nivel en la frecuencia de una banda del **ecualizador
gráfico de salida**, como función del crudo. Hoy la única fuente es el cliente de
la consola, que usa `VtoEQGAIN15` = `30·V − 15` y dibuja el gráfico con
`this.gain = 15`: **±15 dB, `INFERIDO`**.

Hace falta medirlo por un motivo que este proyecto ya vivió: **una fórmula del
cliente describe la pantalla, no necesariamente el audio.** La medición 97 refutó
`VtoTHRESH` y `VtoRATIO`, del mismo archivo, contra el comportamiento real. Y el
ítem 108 acaba de mostrar el reverso: la del ecualizador de canal resultó exacta.
Las dos cosas pasan, y por eso se mide.

**Y hay una segunda pregunta, que es tan importante como la ley:** cuál clave
corresponde a cuál frecuencia. El cliente trae **32 etiquetas para 31 bandas**
—`20 25 32 … 20k 22k`— y a qué banda apunta cada `peak.K` **no está establecido**.
Suponerlo sería exactamente el error de los ±15: leer la entrada de al lado.

## Por qué en un auxiliar y no en el general

El usuario autorizó medir «el ecualizador de salida» describiéndolo como el del
general. **Se mide en el auxiliar 5, y el motivo no es comodidad.**

- El auxiliar 5 **no está en el camino de nada suyo**: su envío desde el canal 10
  está en cero y su propio nivel también, comprobado el 2026-09-16.
- El general **sí** lo está: es por donde sale su mezcla, y es la superficie donde
  este proyecto ya plantó un filtro permanente dos veces por meterle tonos.
- La pregunta es la misma: las dos superficies son gráficos de 31 bandas y el
  cliente las dibuja con la misma función.

**Lo que esto NO cierra, y queda dicho:** que el general comparta la ley es una
**suposición razonable, no un resultado**. Si hace falta cerrarla, se mide aparte
y con su propia autorización.

## El banco

Tono por la Scarlett al canal 10 —el mismo de siempre—, que sube al auxiliar 5, y
de ahí a la entrada 2 de la interfaz. Los tres cables se verificaron el
2026-09-16 con `banco-en-vivo.ts`: con el envío abierto en 0,75 la entrada 2
marcó **−6,4 dBFS**.

**Ese nivel es demasiado alto para barrer un realce**, así que el envío se abre
menos: con +15 dB de realce sobre −6,4 el pico se iría a +8,6 dBFS y recortaría el
conversor. Se busca un punto de partida cerca de **−25 dBFS**, que deja el peor
caso en −10.

## Qué se escribe, y qué vuelve

| Clave | Para qué |
|---|---|
| `m.afs.enabled` | apagado mientras suene, **comprobado releyendo por HTTP** |
| `i.9.aux.4.value` | el envío del canal al auxiliar, para que llegue señal |
| `a.4.mix` | el nivel del auxiliar, para poner el punto de partida |
| `a.4.eq.peak.K` | **la banda que se barre**: es la medición |
| `i.9.dyn.bypass`, `i.9.gate.enabled`, `i.9.deesser.enabled` | el proceso del canal, que depende del nivel |

Todas leídas antes, restauradas por `restaurarClaves()` dentro de
`conRestauracion`, verificadas releyendo por HTTP, y anotadas en el papelito de
`pendiente.ts` antes de la primera escritura.

**No se toca** el ecualizador del general, ni el fader del general, ni el canal
salvo su proceso, ni ninguna otra banda del auxiliar.

## Primero: qué frecuencia es cada banda

**No se supone del orden de las etiquetas.** Se realza **una** banda a su máximo y
se barre un tono por el espectro buscando dónde está el bulto. Eso da la
frecuencia central de esa banda **medida**, y de paso dice si el orden de las
claves sigue al de las etiquetas.

Si el bulto no aparece, la corrida se detiene: sin saber qué frecuencia mide, la
ley que saldría sería de una banda desconocida.

## Los controles

**C1 — el tono llega.** El bin de la frecuencia de la banda, con el ecualizador
plano, al menos **45 dB** sobre el piso efectivo medido con el canal muteado.

**C2 — la banda es LOCAL.** Un testigo a más de una octava de distancia no se
puede mover más de **1,0 dB** mientras la banda barre su recorrido. Es más
holgado que el tope del 108 —0,63— **a propósito**: un gráfico de tercio de
octava tiene faldas más anchas que una campana de Q 1, y todavía no se sabe
cuánto. Si C2 falla, lo que se movió fue algo global y la corrida no mide la ley.

## Las expectativas, declaradas antes de mirar

- **L1 — el crudo 0,5 es el punto plano**, dentro de 0,2 dB contra el ecualizador
  puenteado.
- **L2 — la ley es lineal en el crudo**, con residuo máximo de 0,3 dB.
- **L3 — el recorrido total es de al menos 24 dB**, y se informa cuál es. Con la
  hipótesis del cliente serían 30; el mínimo se pone en 24 para que la corrida
  pueda contestar **también** si son menos, sin quedarse sin margen. Es la lección
  del 108, donde el piso valía exactamente una de las dos respuestas.
- **L4 — la simetría**: |dB en 0| y |dB en 1| no difieren más de 0,5 dB.
- **L5 — ida y vuelta** dentro de 0,5 dB.
- **L6 — el crudo escrito contra el releído.**

Si falla C1, C2, L1 o L3, **no se imprime ley**.

## Lo que esta corrida NO va a decir

- **Nada de las otras 30 bandas.** Una banda de treinta y una.
- **Nada del ecualizador del general**, que es otra superficie y se explicó arriba.
- **Nada sobre el ancho de banda ni la forma del filtro.** Se mide la altura en la
  frecuencia de la banda.
- **Nada sobre si las bandas interactúan entre sí.** Con una sola movida no se ve.
- Un nivel de fuente, un día, una consola.

## Trabajo previo

**No hay coincidencias en otros proyectos, y se buscó antes de escribir esto.**
Los cuatro que hablan este protocolo:

- **`fmalcher/soundcraft-ui`**: cero coincidencias de `eq.peak`, `graphic` y `geq`.
  ~~No expone el ecualizador de salida.~~ **La segunda mitad es falsa y se deja
  tachada:** sí lo expone —31 bandas por lado del general y 31 por auxiliar, con
  su `linked`— sólo que **anidado en un JSON de estado**, donde `eq.peak` nunca
  aparece como cadena. La búsqueda de texto era cierta; la conclusión, no. Lo
  corrigió el [ítem 112](112-la-ley-del-ecualizador-del-general.md) el mismo día.
- **`Dennion/ioBroker.soundcraft`**: cero coincidencias de lo mismo.
- **`ndikanov/ui24`**: es un retoque visual del cliente oficial —vista de
  reproductores y color de botones—. No toca parámetros de mezcla.
- **`NaturalDevCR/MyUiPro`**: un envoltorio para ver varias ventanas del cliente a
  la vez. Archivado en julio de 2025. Sin funciones de ecualizador.

> **CORREGIDO el 2026-09-16 por una auditoría, y la corrección es más grande que
> este documento.** La frase «`ndikanov/ui24` y `NaturalDevCR/MyUiPro` no tocan
> parámetros de mezcla» es **falsa para MyUiPro**: escribe `SETD^i.N.gain` y
> `SETD^i.N.hiz` desde su `mixer-store.ts`, y publica una ley de la ganancia de
> entrada. Y «`Dennion/ioBroker.soundcraft`: sólo estado» también es falsa:
> escribe fader, panorama, silencio y la ganancia del previo.
>
> **Lo que este documento concluía sigue en pie** —ninguno de los cuatro toca el
> ecualizador, el compresor, la puerta ni el supresor, y eso es lo que acá se
> medía—. Lo que estaba mal es el alcance de la frase: un `grep` del parámetro
> del día, ampliado en silencio a una afirmación sobre todo el proyecto ajeno.
>
> El inventario comprobado, con el commit de cada repositorio, está en
> [`trabajo-previo-de-terceros.md`](../referencia/trabajo-previo-de-terceros.md).


**Nadie lo expone, nadie lo documenta, nadie mapea sus claves.** Que no haya
precedente significa que hay que tener más cuidado, no menos: no hay una segunda
implementación contra la cual contrastar un resultado raro.

Lo que sí hay son **dos fuentes propias que coinciden**: el manual del fabricante
—«EQ de salida: 31 bandas, ±15 dB»— y el cliente, con `VtoEQGAIN15` y
`this.gain = 15`. Las dos entran como hipótesis, no como verdad.
