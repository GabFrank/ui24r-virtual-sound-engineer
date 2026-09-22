# Dónde quedamos — cierre del 2026-09-17

**Para quien retome, en cualquier sesión.** Esto no cuenta qué se hizo —eso está
en los contratos, en las ADR y en el `CHANGELOG`— sino **en qué estado queda todo
y qué conviene saber antes de tocar nada**.

## El estado del equipo del usuario

**Comprobado al cerrar, contra el retrato tomado antes de la medición:**

| | |
|---|---|
| Claves del volcado | **6625 antes y 6625 ahora** |
| Diferencias | **cero**, clave por clave |
| Filtros plantados en el supresor | **0** — las doce ranuras vacías |
| Papelito de restauración | **cerrado** |
| Reproductores o grabadores huérfanos | ninguno |
| Instantánea «alma caninde» | intacta |

**El banco sigue como el 2026-09-16**: salida de la Scarlett → canal 10, master 1
→ entrada 1, aux 5 → entrada 2, perilla en 10 dB.

**AnyDesk quedó corriendo.** Si no se va a usar, se cierra.

## Lo que hay que saber antes de medir otra vez

**El servicio de audio de la Mac se traba y el síntoma se lee como un permiso
denegado.** Costó la sesión de la madrugada y produjo una conclusión falsa. Se
cura con `sudo killall coreaudiod`, lanzable por SSH. Cómo distinguirlo en tres
pasos está en
[el hallazgo](../backlog/hallazgo-el-audio-de-la-mac-se-traba-y-parece-un-permiso.md).

**El usuario opera la MacBook a distancia**, por SSH y AnyDesk. No se puede mover
ningún cable del banco ni tocar la perilla de la Scarlett hasta que vuelva. Si el
USB se corta a mitad de corrida, la corrida se muere y nadie puede reenchufarla.

## Lo que cambió hoy, y es mucho

### La medición: el ítem 120, y una retractación

**La profundidad de la puerta quedó medida y publicada** —`60a − 60` acierta al
décimo de dB—, acotada al crudo 0,55 … 1,00. Es la ley número trece.

**Y se retractó la conclusión del 2026-09-16**: el techo de 29 dB que se le
atribuyó a la puerta **era el piso del banco**. Lo dirimió la prueba que el propio
contrato había declarado de antemano: la fuente subió 12 dB y el techo no se
movió. Tercera vez que este proyecto documenta el límite de su instrumento como si
fuera el del aparato.

**Lo que sigue abierto del 120**: el umbral en dB —acotado entre 80 y 100 dB por
unidad, los 96 del cliente adentro y sin confirmar— y la histéresis, que **existe**
y es **menor que 1,5 dB**. Las dos necesitan una escalera más fina que la
histéresis, y **las dos quedaron congeladas** por la hoja de ruta.

### La hoja de ruta, rehecha desde el soundcheck del usuario

Está en
[`2026-09-17-recapitulacion-y-hoja-de-ruta.md`](2026-09-17-recapitulacion-y-hoja-de-ruta.md)
y **manda sobre lo que sigue**. Lo esencial:

- **El cuello de botella es cablear, no medir.** Cada etapa actúa cuando tiene
  cinco cosas —tope, decisión, servicio, pantalla, y ley o lazo cerrado— y hoy
  sólo la ganancia las tiene.
- **Tres decisiones nuevas**: la mezcla de conjunto entra y la aplicación mueve
  faders ([ADR-031](../adr/ADR-031-la-mezcla-de-conjunto-entra.md)); la puerta y el
  compresor se ajustan por lazo cerrado sin medir más leyes
  ([ADR-032](../adr/ADR-032-puerta-y-compresor-por-lazo-cerrado.md)); los envíos a
  efectos entran ([ADR-033](../adr/ADR-033-los-envios-a-efectos-entran.md)).
- **Congelado hasta después del MVP**: el umbral de la puerta en dB, la superficie
  del compresor como interfaz, el ecualizador de salida y su lado derecho, los
  faders de bus y del general. Todo eso está medido y archivado; lo que cambia es
  que nadie le dedica otra sesión.

### El agujero de seguridad que apareció al empezar a construir

**Dos reglas del motor existían en el código y no en el comportamiento**, porque
los dos servicios de producción le pasaban un historial vacío: el presupuesto por
sesión y «comprobá el efecto antes de volver a moverlo». La segunda fallaba
**abierta** — se podía mover una ruta 2 dB, otra vez 2 dB, y así sin fin.

**No hubo exposición**: ninguna pantalla repite un cambio hoy. La rampa del
monitor iba a ser la primera, y por eso apareció ahora.

**Arreglado en dos commits**, con la causa de fondo incluida: el diario guardaba
el crudo del protocolo con la etiqueta de la unidad física al lado —el mismo error
que ya se había arreglado en el motor y nunca en el diario—.

## Lo que quedó a medias, y es lo primero que conviene mirar

**La pieza 1 de la hoja de ruta —la pantalla de monitor— está empezada.** La
decisión está escrita y el piso construido; falta lo de arriba.

**Decidido y escrito:** [ADR-034](../adr/ADR-034-poner-el-nivel-de-monitor-y-retocarlo.md).
Poner el nivel de un monitor y retocarlo son dos operaciones. La rampa sube de a
2 dB escuchando entre paso y paso, con **techo en 0 dB** —decisión del usuario— y
el primer movimiento desde el silencio salta a **−32,14 dB**, el punto más bajo
escribible. Retocar mantiene los 2 y los 4 de ADR-028.

**Construido:** el historial de la sesión, entero y enchufado.

**Falta, en este orden:**

1. **El ancla y el techo de nominal en el motor.** El ancla es lo que separa las
   dos operaciones: poner el nivel la fija, retocar se mide desde ahí. El techo de
   0 dB es un tope absoluto sobre la magnitud resultante, distinto del
   `techoPorRuta` de «hasta donde estaba».
2. **El asistente que sepa subir.** Hoy `puedeBajarEnvioAMonitor` rechaza de plano
   cualquier pedido de subir, y el nombre lo dice. Hay que decidir si se extiende o
   si convive con uno nuevo.
3. **La pantalla, por músico** —decisión del usuario—: se elige a alguien y se ve
   su cuña con todo lo que le llega, su propio instrumento primero. Es la misma
   forma que va a tener la pantalla QR de la banda.

## Lo que el usuario pidió y conviene no perder

- **Preguntarle siempre de forma interactiva**, nunca con una frase al final de un
  informe.
- **Explicarle en lenguaje de producto**, no de código ni de claves.
- **Decir explícitamente que se buscó trabajo previo**, y buscarlo de verdad:
  [`trabajo-previo-de-terceros.md`](../referencia/trabajo-previo-de-terceros.md).
- **Avisarle cuando la sesión se está poniendo larga**, y dejar todo preparado para
  cerrarla. Lo pidió el 2026-09-17: *«sesiones largas acumulan mucho historial no
  útil y producen resultados menos buenos»*. El corte va **después de un commit
  empujado**, nunca a mitad de una tarea, y con este documento escrito.

## Dos apuntes chicos que quedaron anotados y sin hacer

- **Los márgenes de ganancia por instrumento merecen una revisión contra fuentes.**
  `channel-profiles.ts` le da al cajón **menos** margen que a la voz, y eso va
  contra el sentido común de los transitorios.
- **El recorrido deja reordenar instrumentos pero no etapas**, y el usuario
  ecualiza antes de la puerta mientras el orden propuesto hace lo contrario.
