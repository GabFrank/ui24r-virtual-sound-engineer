# El ecualizador de salida no es el de canal con otro nombre

**2026-09-16.** Sale de cerrar una incógnita que quedó abierta al medir el ítem
108: el cliente de la consola tiene **dos** leyes de ganancia de ecualizador y
sólo una se midió. Leído del cliente verificado y del estado real de la consola;
**no se escribió nada**.

## Las tres superficies, que no son la misma con distinto prefijo

| Superficie | Clave | Estructura | Ley de la ganancia |
|---|---|---|---|
| Canal, 24 | `i.N.eq.bM.{freq,q,gain}` | **5 bandas paramétricas** | `40·V − 20` — **±20 dB, MEDIDA** por el ítem 108 |
| General | `m.eq.peak.{l,r}.K` | **gráfico de 31 bandas, estéreo** | `30·V − 15` — ±15 dB, **INFERIDO** |
| Auxiliares, 10 | `a.N.eq.peak.K` | **gráfico de 31 bandas**, mono | `30·V − 15` — ±15 dB, **INFERIDO** |

Contado sobre el estado real de la consola: 31 bandas por lado en el general —L y
R por separado, con su `linked`—, 31 en cada uno de los diez auxiliares. Los
subgrupos y los bloques de efectos **no tienen** ecualizador de salida.

Son **372 rutas** de ecualizador que el proyecto no tiene mapeadas, y que no se
parecen a las del canal ni en la forma de la clave.

## Por qué esto importa más de lo que parece

El ítem 108 midió la ganancia del ecualizador **de canal** y dio ±20 dB. La
tentación natural —y el motivo por el que esto se escribe— es suponer que esa ley
vale para el ecualizador de salida, que es lo mismo «pero en el general».

**No vale, y fallaría por dos motivos a la vez:**

1. **Otra ley.** El cliente usa `VtoEQGAIN20` para las bandas paramétricas del
   canal y `VtoEQGAIN15` para un control cuyas etiquetas dicen literalmente
   «+15dB» y «−15dB». Aplicar ±20 a una perilla de ±15 pide **un tercio de más**
   de lo que el usuario vería.
2. **Otra clave.** No existe `m.eq.b1.gain`: el general no tiene bandas
   paramétricas. Una escritura compuesta por analogía con el canal iría a una ruta
   que no existe.

Y hay un tercer motivo, más incómodo: **es exactamente el error que acabamos de
cometer al revés.** La tabla declaró ±15 para el canal durante meses porque
alguien leyó `VtoEQGAIN15` en vez de `VtoEQGAIN20`, que están en líneas
consecutivas —ver
[`hallazgo-la-respuesta-estaba-archivada.md`](hallazgo-la-respuesta-estaba-archivada.md)—.
Las dos funciones son reales y las dos se usan; lo que estaba mal era **a cuál
corresponde cada superficie**. Ese mapeo es el hallazgo, no las fórmulas.

## Qué está establecido y qué no

**Establecido, leyendo:** que hay dos leyes, que el canal usa la de ±20 —y está
medida contra el filtro real—, y que las superficies de salida son gráficas de 31
bandas con una estructura de clave distinta. Esto último sale del **estado real de
la consola**, no del cliente: las claves están ahí y se contaron.

**No establecido:** que el ecualizador de salida sea efectivamente ±15 **en el
audio**. La fórmula del cliente describe lo que la pantalla muestra, y este
repositorio ya tiene el contraejemplo de que eso puede no coincidir con el
comportamiento —la medición 97 refutó `VtoTHRESH` y `VtoRATIO`, del mismo
archivo—. Entra como `INFERIDO`, igual que las demás.

**Tampoco establecido:** que las 31 bandas sean de un tercio de octava, ni en qué
frecuencias están centradas. El gráfico del cliente las dibuja con una tabla
propia que no se leyó acá.

## Lo que queda como tarea, sin hacer

- **Medir la ley del ecualizador de salida** contra el bus real, como el 108 hizo
  con el canal. El banco ya sirve: el retorno del general entra por la entrada 1
  y el del auxiliar 5 por la entrada 2, los dos verificados el 2026-09-16.
- **Decidir si estas 372 rutas entran a `raw-map.ts` como `INFERIDO`.** No se hace
  acá por dos motivos: es una decisión de diseño que merece su propia tarea, y la
  plantilla de rutas de la tabla usa un solo índice (`i.N.eq.b1.gain`) mientras
  que el general necesita dos (`m.eq.peak.l.K`). Meter una forma nueva de clave de
  apuro, en la tabla de la que depende INV-004, es la clase de cambio que conviene
  pensar despierto.

## Trabajo previo

**No hay coincidencias en otros proyectos.** Ninguno de los cuatro que hablan este
protocolo distingue las dos leyes: `fmalcher/soundcraft-ui` expone la ganancia del
ecualizador como un valor normalizado sin convertir a decibeles, y los otros tres
no tocan el tema. Que nadie lo haya documentado es coherente con que el error de
leer la función de al lado haya sobrevivido meses acá.
