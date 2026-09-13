# La señal de que una corrida terminó es una sola, y dos veces la sustituí

**2026-09-13.** Pasó dos veces el mismo día, con el mismo razonamiento, y la
segunda vez **contaminé una medición en curso**.

## Las dos veces

**La primera.** Leí «el archivo de evidencia existe» + «`pgrep` no encontró
nada» y concluí que la corrida había terminado. Escribí en la consola a mitad de
un barrido y, al reactivar el supresor con el tono sonando, planté un notch de
−18 dB en 1 kHz sobre el general del usuario.

**La segunda**, seis horas después. `pgrep -f "pasa-altos-y-pasa-bajos"` devolvió
vacío y el archivo de evidencia tenía **493 bytes: sólo el encabezado**. Concluí
que el guión había muerto al arrancar, verifiqué la consola —que estaba con los
puenteos puestos, lo que confirmaba mi hipótesis— y **escribí ocho claves para
restaurarla**. La medición llevaba un minuto y medio de CPU y seguía viva.

## Por qué las dos evidencias engañan

| Lo que miré | Por qué no dice lo que parece |
|---|---|
| **El archivo de evidencia existe** | `medir.mjs` escribe el encabezado **al empezar** y el cuerpo al terminar. Un archivo con sólo el encabezado es exactamente lo que se ve **mientras corre** |
| **`pgrep` no encontró nada** | Devolvió vacío con el proceso vivo desde hacía cuatro minutos. Repetido después, el mismo patrón lo encontró. El mecanismo no está claro, y no hace falta que lo esté |
| **La consola tiene los puenteos puestos** | Confirmaba mi hipótesis de que el guión había llegado a escribirlos y muerto. También es lo que se ve **a mitad de la corrida** |

Las tres son compatibles con «terminó» y con «está corriendo». Ninguna las
separa. **Y encadenar tres indicios débiles no hace uno fuerte**: los tres tenían
la misma ambigüedad.

## La regla

**La única señal de que una corrida terminó es la notificación del arnés.** Dice,
textualmente, «you will be notified when it completes». No hay que buscarle
confirmación: buscarle confirmación es lo que produce los dos incidentes.

Corolarios:

- **Un `pgrep` vacío no es evidencia de nada.** Puede usarse para confirmar que
  algo *sigue vivo*; nunca para concluir que murió.
- **Mirar la salida parcial está bien; concluir de ella está mal.** Leer el
  archivo mientras corre para ver si el banco arrancó como se esperaba es
  legítimo y útil. Decidir que terminó, no.
- **Si hace falta saber si un proceso está vivo, `ps` lo contesta y `pgrep` no lo
  contestó.** Pero eso es un rodeo: la pregunta correcta es si llegó la
  notificación.

## Lo que costó esta vez, con el detalle

**Se plantaron cuatro filtros de −18 dB en 1 kHz sobre el general del usuario.**
La restauración que escribí puso `m.afs.enabled = 1` **con el multitono sonando**,
y el manual explica exactamente qué pasa entonces: *«when ringing out the system
in Fixed Mode, any sustained sound detected by AFS2 will trigger Fixed filters to
be set»*. El modo era FIXED (`m.afs.fmode = 1`).

**Y limpiarlos costó tres filtros del usuario.** El único comando que borra algo
es `clearall` con el supresor **encendido** —`clearfixed` no hace nada, y
`clearall` con el supresor apagado tampoco, las cuatro combinaciones están
medidas en
[`borrar-filtros-plantados-2026-09-13.txt`](../spikes/SPK-P0.10b-vu2/evidence/borrar-filtros-plantados-2026-09-13.txt)—
pero `clearall` **borra todo, no sólo lo plantado**. Al repetirlo para sacar el
último de 1 kHz se llevó también:

| Frecuencia | Ganancia | Q |
|---|---|---|
| **200,0 Hz** | −6 dB | 7,0 |
| **4226,4 Hz** | −6 dB | 7,0 |
| **8190,1 Hz** | −6 dB | 7,0 |

Tres cortes modestos repartidos por el espectro: **un ring-out de verdad**, casi
seguro del usuario. El Q no está en el registro de esa corrida; el 7,0 es el valor
que tienen **todos** los filtros del supresor que este proyecto archivó alguna
vez, así que es lo más probable — y por eso mismo **no se escriben de vuelta**:
restaurar con un valor inferido deja la consola en un estado que nunca existió, y
eso es peor que dejarla sin el filtro, porque nadie se entera. Se le dice al
usuario qué se perdió y él decide.

## Y una regla nueva que sale de esto

**Nunca encender el supresor con señal sonando.** No es una recomendación: es lo
que el fabricante documenta que planta filtros permanentes. Toda restauración que
toque `afs.enabled` tiene que **apagar la fuente primero**.

## Lo que costó esta vez

La corrida de la 103 quedó **contaminada** y se descarta: sus escrituras y las
mías se intercalaron, y no hay forma de saber qué punto quedó medido con qué
estado. Se rehace entera. La consola se restaura y se comprueba por HTTP, como
siempre.

**Y la corrida contaminada se archiva igual**, con esta nota: una corrida que se
descarta también es evidencia de qué pasó.
