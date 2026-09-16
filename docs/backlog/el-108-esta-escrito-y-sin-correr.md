# El ítem 108 está escrito, auditado seis veces, y listo para correr

> **Corrió el 2026-09-15 y no salió ley.** Falló en la primera captura con tono,
> por dos cuadros del medidor donde hacen falta veinte. La consola quedó
> restaurada y el supresor no plantó nada. Lo que pasó, las cinco hipótesis que
> se refutaron midiendo y los dos defectos del guion que aparecieron en el
> camino están en
> [`el-108-corrio-y-fallo-por-dos-cuadros.md`](el-108-corrio-y-fallo-por-dos-cuadros.md).
> Este documento describe el estado **antes** de esa corrida y se deja como
> estaba.

**2026-09-13.** Contrato:
[`108-la-ley-de-la-ganancia-del-ecualizador.md`](../compromisos/108-la-ley-de-la-ganancia-del-ecualizador.md).
Guion: `tools/spikes/p0-10b-vu/ley-ganancia-del-eq.ts`. **No hay evidencia
archivada porque no corrió**, y este archivo existe para que eso no se lea como
un olvido.

## Qué mide y por qué importa

`i.N.eq.bM.gain` es **la única hoja del ecualizador que la aplicación podría
escribir**. Las cuatro leyes que midió el ítem 101 —frecuencia y Q de la campana,
y los dos filtros de corte— están en Hz y en Q, y el tope de su `kind` está en dB,
así que el motor las rechaza por INV-004 y tiene razón: un tope de 4 dB no acota
un salto de frecuencia. Está en
[`hallazgo-un-kind-una-unidad-y-las-hojas-no-coinciden.md`](hallazgo-un-kind-una-unidad-y-las-hojas-no-coinciden.md).

La ganancia **está en dB**, igual que el tope. Medirla es lo único que convierte
al ecualizador de canal —432 de las 834 rutas escribibles, «el corazón del
producto» según el propio recorrido que las cuenta— en algo que la aplicación
pueda tocar.

Y decide una contradicción abierta: la tabla declara **±15 dB** y el ítem 101 vio
**+20,0 exactos** en el extremo. Los dos no pueden ser ciertos.

## En qué estado quedó

**La sexta auditoría se corrió el 2026-09-15, y con ella se deja de auditar.** Dos
auditores por el protocolo del proyecto: uno de procedencia y otro que fijó sus
expectativas antes de mirar y midió ejerciendo las funciones puras del guion con
datos sintéticos, porque sin consola no se puede correr.

**La racha no se cortó: se cumplió por sexta vez.** Cuatro de los hallazgos están
dentro de las líneas que escribió la quinta ronda.

### Lo que se arregló

| | |
|---|---|
| **ALTA** | `m.afs.enabled = 0` se escribía y **no se releía**, siendo la única de las cinco neutralizaciones cuya pérdida le cuesta algo **al usuario** y no a la medición: el supresor aprende de los 900 s de tono y planta una notch permanente. Sobrevivió a las cinco rondas anteriores. Ya pasó dos veces en este proyecto; la segunda costó tres filtros |
| **ALTA** | El piso de L4 valía **30, que es exactamente la respuesta ±15**: con esa ley la corrida pasaba por cero margen y perder un crudo por punta la dejaba sin publicar nada. Estaba armada para no poder contestar una de sus dos respuestas. Ahora son 24, y quien decide entre las hipótesis es la pendiente |
| **ALTA** | **L8 y L3 no componían.** L8 existe para que L3 no acuse en falso a la consola, y tolera 1,5 dB contra los 0,3 de L3: entre 0,6 y 1,5 dB de aplastamiento interno, L3 fallaba sola diciendo «la ley NO es lineal». Ahora L3 lee el desvío con signo que L8 midió y, si alcanza para explicar su residuo, dice «posible aplastamiento interno» y nombra el paso siguiente |
| **MEDIA** | L8 nombraba un detector —pico o potencia— aunque **las dos predicciones entraran** en el tope. Se separan 1,5 dB recién en \|g\| = 13,1, así que con ±15 y dos crudos anulados el nombre salía por centésimas. Ahora dice que no decide |
| **BAJA** | El guarda de L8 miraba un sentido mientras el bucle usa los dos, y el conteo impreso contaba puntos que se salteaban en silencio. Lo encontraron los dos auditores por caminos distintos |
| **BAJA** | La cifra de sensibilidad era del modelo de potencia, escrita por la misma ronda que dejó de suponer el modelo |
| **BAJA** | Dos cifras de prosa del contrato que no reproducen: el pico de la suma es −11,98 y no −12,03, y las faldas salen de Q = 1,000 y no del 1,010 que el texto atribuye al ítem 101 |

### Lo que se deja sin arreglar, y por qué

Está en el contrato, en «Lo que esta corrida NO va a decir»: el aplastamiento de
menos de 0,5 dB que no ve nadie, el único nivel de estímulo, el tope de C2 que
puede fallar en una corrida limpia, el equilibrio de los dos tonos que L8 supone,
y la ceguera de L3b a la estructura impar.

**Ninguno puede dañar la consola** —eso se cerró— y varios los ayuda a decidir la
propia corrida. Seguir auditando en seco tiene rendimientos decrecientes: seis
rondas, y varias veces lo que una encontraba lo había introducido el arreglo de la
anterior.

## Lo que hace falta para correrla

1. **Nada del usuario.** El banco está cableado y la corrida sólo toca el canal 10
   y el compresor del general, todo restaurado por `restaurarClaves()` y
   verificado por HTTP.
2. Unos **seis minutos** de consola.

**Corregido el 2026-09-15: el punto 1 resultó falso, y el modo en que falló
importa.** «El banco está cableado» seguía siendo cierto, pero el canal 10 no
estaba plano: el show `Prueba` lo había dejado configurado como un bombo, con el
pasa-bajos apoyado sobre el bin de 1 kHz que la corrida mide. Eso no habría
abortado la corrida, la habría hecho **publicar una ley deformada**. Hizo falta el
usuario —para autorizar el reseteo del canal— y una tarea nueva antes de medir.
Está en
[`hallazgo-el-canal-del-banco-no-estaba-plano.md`](hallazgo-el-canal-del-banco-no-estaba-plano.md).

Lo que esto le agrega a la lista de arriba: **una precondición sobre el estado de
un equipo compartido caduca**, y ninguna de las seis auditorías la miró, porque
las seis auditaron el guion y el contrato —que eran correctos— y no la consola.

## Y una cosa que la corrida **puede** dejar de regalo

L8 no sabe si el medidor de la consola es de pico o de potencia, así que **mide
las dos** y dice cuál ajusta. El ítem 99b calibró la escala del medidor con un
solo seno, donde pico y eficaz se diferencian en una constante que se absorbe en
la calibración y se cancela en toda diferencia: **el estímulo de dos tonos es la
primera vez en este proyecto que la distinción importa**.

**Pero no sale gratis, y este párrafo decía que sí.** Escribía «sale medida sin
costo», que es una propiedad dada por conseguida **antes de medir** —el tercer paso
del diagnóstico del protocolo de verificación—. Un auditor lo midió: las dos
predicciones se separan 1,5 dB recién en \|g\| = 13,1 dB, así que la distinción
sólo se obtiene **si el barrido llega ahí con los dos extremos vivos**. Con la ley
±15 y dos crudos anulados por lado —lo que le pasó al ítem 101— las dos entran en
el tope y no se decide nada.

Y hay un tercer detector posible que nadie midió: uno que integre en una ventana
comparable al cuadro de ~44 ms, que es plausible porque la envolvente de los dos
tonos late cada 27 ms. Ése caería justo en la zona donde las dos ajustan.

Así que el regalo es **condicional**, y la corrida lo dice por pantalla en vez de
nombrar un detector por centésimas de diferencia.
