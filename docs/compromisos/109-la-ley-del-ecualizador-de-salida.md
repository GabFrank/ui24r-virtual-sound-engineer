# 109 — La ley de la ganancia del ecualizador de salida

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
  No expone el ecualizador de salida.
- **`Dennion/ioBroker.soundcraft`**: cero coincidencias de lo mismo.
- **`ndikanov/ui24`**: es un retoque visual del cliente oficial —vista de
  reproductores y color de botones—. No toca parámetros de mezcla.
- **`NaturalDevCR/MyUiPro`**: un envoltorio para ver varias ventanas del cliente a
  la vez. Archivado en julio de 2025. Sin funciones de ecualizador.

**Nadie lo expone, nadie lo documenta, nadie mapea sus claves.** Que no haya
precedente significa que hay que tener más cuidado, no menos: no hay una segunda
implementación contra la cual contrastar un resultado raro.

Lo que sí hay son **dos fuentes propias que coinciden**: el manual del fabricante
—«EQ de salida: 31 bandas, ±15 dB»— y el cliente, con `VtoEQGAIN15` y
`this.gain = 15`. Las dos entran como hipótesis, no como verdad.
