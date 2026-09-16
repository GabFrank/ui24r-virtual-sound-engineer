# Los ±15 salieron de leer la función de al lado

**2026-09-16.** Sale de verificar, por primera vez, que el extracto del cliente de
la consola siga vigente. Instrumento: `tools/spikes/p0-2a/cliente-sigue-igual.ts`.
Evidencia:
[`cliente-sigue-igual-2026-09-16.txt`](../spikes/SPK-P0.2a/evidence/cliente-sigue-igual-2026-09-16.txt).

## Lo que se verificó, que nadie había verificado

El extracto [`tablas-conversion-ui24r.js`](../spikes/SPK-P0.2a/evidence/tablas-conversion-ui24r.js)
se tomó el 2026-09-08 de otra dirección —`192.168.0.49`— y de él cuelgan **todas
las leyes de presentación del proyecto**. Nunca se comprobó que siguiera valiendo.

Ahora sí: **las 56 funciones son idénticas** a las que la consola sirve hoy en
`192.168.0.78`, firmware `3.4.8318-ui24`, con la huella del archivo servido
anotada en la evidencia. El extracto vale.

## Y ahí apareció lo incómodo

El extracto tiene, en **líneas consecutivas**, estas dos:

```js
function VtoEQGAIN15(a){return precision(30*a-15,1)}
function VtoEQGAIN20(a){return 40*a-20}
```

La tabla de conversión del proyecto declaró durante meses que la ganancia del
ecualizador de canal era `lineal(−15, +15)`. El ítem 108 la midió el 2026-09-16
contra el filtro real y dio **`40·V − 20`**, o sea la segunda.

**La respuesta estaba archivada en este repositorio desde el 2026-09-08, y se leyó
la función de al lado.**

Eso explica de dónde salió un número que después costó un contrato, seis rondas de
auditoría en seco y cuatro corridas contra la consola. No de una suposición
inventada: de una fuente correcta, leída mal, a dos líneas de distancia de la
correcta.

## Lo que esto NO significa, y hay que decirlo con cuidado

**No significa que el 108 fuera innecesario.** Significa lo contrario de lo que
parece a primera vista, y el propio repositorio tiene el contraejemplo:
`VtoTHRESH` y `VtoRATIO` están en **este mismo archivo** y la medición 97 los
**refutó** contra el comportamiento real del compresor.

O sea: **el cliente dice lo que la pantalla muestra, no lo que el audio hace.** Son
dos afirmaciones distintas, y este proyecto ya sabe que pueden no coincidir. Por
eso las fórmulas del cliente entran como `INFERIDO`, y por eso la ganancia se
midió igual.

Lo que el 108 agrega sobre la fórmula archivada es exactamente lo que hacía falta:
que el audio en la frecuencia central **efectivamente** se mueve `40·V − 20`, con
residuo de 0,01 dB. Sin esa corrida, la fórmula del cliente era una hipótesis con
un contraejemplo conocido en el mismo archivo.

**Lo que sí hay que corregir es otra cosa, más chica y más fea:** la tabla no
debería haber dicho `±15` **nunca**, porque no salía de ninguna medición ni de una
lectura defendible, sino de la función equivocada. Un valor mal con una
procedencia falsa es peor que un valor mal declarado desconocido — es la regla de
§4 de la disciplina, *«un comentario que explica un valor equivocado es peor que
el valor solo»*, en su versión de procedencia.

## Lo que queda disponible sin tocar la consola

Con el extracto verificado, las filas 2 a 6 de
[§5 de la auditoría externa](auditorias/2026-09-15-auditoria-externa.md) se pueden
contestar **leyendo**, y entran como `INFERIDO`:

| Fila | Qué | Fórmula del cliente |
|---|---|---|
| 2 | Retardos | `VtoLATENCY`: el crudo está en **segundos**; bajo 47 muestras lo muestra en muestras y no en ms |
| 3 | Tiempos de compresor | ataque `400^d(V)`, relajación `10·200^d(V)`, con `d(V) = 1−(1−V)²` |
| 3 | Tiempos de puerta | ataque `400^d(V)`, relajación `5·400^d(V)`, retención `2000^d(V)` |
| 4 | Compresor | umbral `96·V − 90`, relación `1/V` — **los dos refutados por la 97 como comportamiento** |
| 5 | Puerta | umbral `96·V − 90`, profundidad `60·V − 60` |
| 6 | Supresor | el modo sale de **dos** claves, no de una: `afs.logic` decide LOCK y `afs.fmode` decide entre LIVE y FIXED |

**Ninguna de estas entra a `raw-map.ts` como `PROBADO`.** Son de presentación, y
la 97 ya demostró que este archivo puede describir bien la pantalla y mal el
audio.

## Una hipótesis nueva, que nadie pidió y conviene anotar

**`VtoEQGAIN15` existe y alguien la usa.** Si el ecualizador de canal es ±20, esa
función de ±15 es de otro ecualizador —el de salida, el gráfico, o el de los
buses—. Eso es un `kind` distinto y una medición distinta, y hoy el proyecto no
tiene ninguna entrada para esas rutas.

**Investigado el mismo día**, y resultó peor de lo que esta nota suponía: el
ecualizador de salida no es el del canal con otro prefijo. El general y los diez
auxiliares tienen **gráficos de 31 bandas** con otra forma de clave —no existe
`m.eq.b1.gain`—, y son 372 rutas sin mapear. Suponer que la ley medida vale para
ellas fallaría por la ley **y** por la clave. Está en
[`hallazgo-el-ecualizador-de-salida-es-otra-cosa.md`](hallazgo-el-ecualizador-de-salida-es-otra-cosa.md).

## Trabajo previo

**No hay coincidencias en otros proyectos** para la comprobación en sí: ninguna de
las cuatro implementaciones de terceros que hablan este protocolo verifica que su
propia copia de las tablas siga vigente contra la consola. `fmalcher/soundcraft-ui`
y `DigiMixer` llevan las conversiones escritas en su código fuente, sin
procedencia anotada ni huella, que es precisamente lo que hace que un valor mal
—como el recorte del medidor en 240 de `DigiMixer`— sobreviva.
