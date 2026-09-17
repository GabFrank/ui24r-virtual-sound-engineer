# El audio de la Mac se traba, y el síntoma se lee como un permiso

**2026-09-17.** Costó una sesión entera de medición y produjo una conclusión falsa
que estuvo a punto de cambiar cómo se trabaja. No hubo daño en la consola.

## El síntoma

El grabador aborta con:

```
ERROR: no se pudo arrancar la captura: Error Domain=com.apple.coreaudio.avfaudio
Code=268451843 ... failed call=err = PerformCommand(*ioNode, kAUStartIO, NULL, 0)
```

Encuentra el dispositivo, informa su formato correcto —«Scarlett 2i2, 4 canales a
48000 Hz»—, anuncia que graba, **y la captura no arranca**. El archivo queda con
la cabecera y sin muestras.

## La conclusión falsa, y por qué era convincente

La sesión que lo encontró trabajaba **por una conexión remota** y concluyó:

> *«La Mac le entrega silencio perfecto a cualquier grabación que no salga de una
> aplicación con permiso de micrófono. Las mediciones no se pueden lanzar desde
> una sesión remota por red.»*

Era falso, y tenía tres cosas a favor que lo hacían sonar bien:

1. **macOS sí gobierna la entrada de audio con un permiso**, y el mensaje de error
   del propio grabador lo sugiere —lo dice condicionado a «si dice permiso», pero
   se lee entero—.
2. **Una sesión remota es sospechosa de entrada**, y la explicación tenía forma de
   regla del sistema operativo.
3. **Nada la contradecía**, porque con la captura muerta cualquier prueba falla.

**Lo que la tiró abajo fueron dos comprobaciones de treinta segundos:**

- **Falla igual con el micrófono interno.** Si fuera del cableado o de la interfaz,
  el micrófono de la Mac tendría que andar. No anda: es del sistema, no del banco.
- **El permiso estaba concedido.** Concedido a la terminal desde el 2026-09-12, y
  la terminal se lanzó el 15 — el permiso es anterior al proceso, que es el orden
  que macOS necesita.

Y había una tercera, decisiva, en el propio registro del proyecto: **el grabador
había funcionado desde una sesión idéntica el 2026-09-16 a las 00:49**, capturando
43 200 muestras. Si el camino fuera imposible por diseño, esa corrida no existiría.

## La causa y la cura

**El servicio de audio de macOS —`coreaudiod`— se traba.** Deja de entregar la
entrada a todo el mundo, sin registrar nada en el log del sistema y sin degradar
la salida, que sigue funcionando. Mientras está así, **ninguna aplicación puede
grabar**, tenga el permiso que tenga.

**Se cura reiniciándolo:**

```
sudo killall coreaudiod
```

El sonido se corta un segundo y vuelve solo. Tras hacerlo, la misma orden que
fallaba capturó las 139 200 muestras esperadas y midió el piso de ruido real del
banco: −68,7 dBFS en el canal 1 y −82,4 en el 2.

**No hace falta acceso físico a la máquina.** Se puede lanzar por SSH, que es como
se hizo. Es lo único de esta cadena que pide contraseña.

## Cómo distinguirlo la próxima vez, en tres pasos

| Si… | entonces |
|---|---|
| Falla también con el **micrófono interno** | no es la interfaz ni el cableado |
| El permiso figura **concedido y anterior** al arranque de la terminal | no es el permiso |
| El grabador **ya funcionó** antes desde el mismo sitio | no es el camino |

Las tres a la vez apuntan al servicio de audio. **Y si falta la última, buscarla:**
este proyecto archiva sus corridas, así que «esto alguna vez anduvo desde acá» es
un dato comprobable y no un recuerdo.

## Lo que este incidente dice del método

**Es la misma forma que el techo de la puerta del [ítem
120](../compromisos/120-el-umbral-y-la-profundidad-de-la-puerta.md), el mismo día:
se midió una propiedad del instrumento y se la anotó como propiedad de otra cosa.**
Allá el banco se disfrazó de consola; acá el sistema operativo se disfrazó de
política de seguridad.

Y las dos veces la salida fue la misma: **cambiar una condición y ver si el
síntoma la sigue.** En el 120, subir la fuente 12 dB. Acá, probar otro dispositivo
de entrada. Ninguna de las dos necesitó una herramienta nueva.

**La diferencia incómoda** es que la conclusión de la puerta se escribió junto al
método para refutarla, y ésta no: se escribió como una regla general del sistema
operativo, que es la clase de afirmación que nadie vuelve a probar. `vse-disciplina`
§7 ya tiene la versión de esto para el trabajo previo —«no encontré X» dicho como
«no hacen X»—; ésta es la misma ampliación de alcance, aplicada a la propia máquina.

## Trabajo previo

- **En el proyecto**: [`el-108-corrió-y-falló-por-dos-cuadros`](el-108-corrio-y-fallo-por-dos-cuadros.md)
  ya había documentado la familia —«instrumentos que no dicen lo que les pasa»— y
  dejó al grabador informando su código de salida y su motivo. **Esa corrección es
  la que permitió este diagnóstico**: sin ella, la captura muerta habría vuelto un
  archivo mudo en vez de un mensaje con el código de CoreAudio.
- **En proyectos de terceros**: **no hay coincidencias.** Ninguno de los cuatro
  repositorios del protocolo graba audio —hablan con la consola por red y nada
  más—, así que no tienen nada que decir sobre la captura en macOS. Que no haya
  precedente significa que esta nota es la única fuente y conviene mantenerla.
