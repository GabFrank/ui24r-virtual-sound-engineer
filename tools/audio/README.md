# El grabador

`grabar.swift` captura de una entrada de audio a un WAV y dice qué capturó.

## Para qué

Todas las mediciones de este proyecto hasta el 2026-09-12 terminan con la misma
declaración: **«esto es autoconsistencia y no calibración»**. Se contrasta un
medidor de la consola contra otro medidor de la misma consola, los dos
decodificados con constantes sacadas del mismo `mixer.html`. Y todos los dB
publicados son de la escala del medidor, **no dBFS**.

Esto rompe ese círculo. Con la salida del general y la de un auxiliar entrando a
la interfaz, hay **un segundo instrumento independiente**: otro conversor y
código de análisis propio.

## Cómo se compila

```
swiftc -O tools/audio/grabar.swift -o tools/audio/bin/grabar
```

El binario no va al repositorio. La fuente sí, y es lo que se audita.

## Cómo se usa

```
tools/audio/bin/grabar <segundos> <salida.wav> [parte-del-nombre-del-dispositivo]
```

Necesita **permiso de micrófono para la terminal** en macOS. Ese permiso no es
del micrófono: gobierna **toda** entrada de audio, incluida una interfaz USB por
sus entradas de línea. Apple lo llamó así por el caso más común.

## Las dos guardas, y por qué

**No cae al dispositivo por omisión.** Si se le pide un nombre y no lo encuentra,
aborta y lista los que hay. Un archivo grabado del micrófono de la Mac creyendo
que viene de la interfaz es un dato **plausible y falso**, que es la peor clase.

**Comprueba que el archivo quedó bien cerrado.** `AVAudioFile` escribe el tamaño
en la cabecera recién cuando se destruye, y la primera versión dejaba que eso
pasara al terminar el proceso —donde ya no pasa—. El resultado eran archivos con
los datos completos en disco y una cabecera que decía `audio bytes: 0`: **un
archivo que existe, pesa lo correcto y es ilegible.** Ahora se cierra a mano
antes de informar, y si el tamaño en disco no coincide con las muestras
capturadas, aborta en vez de declararlo bueno.

## Lo que no hace

**No reproduce.** Grabar y reproducir en el mismo proceso invita a cerrar un lazo
por descuido; el tono lo manda `afplay` aparte.

**No convierte nada.** Guarda en el formato de la entrada, sin cambiar frecuencia
ni profundidad. Cada conversión es una oportunidad de meter un error de escala, y
este proyecto ya pagó tres.

---

# El analizador

`analizar.mjs` dice qué hay en un WAV capturado: el nivel del tono, el piso, y
cuánto separa uno del otro.

## Por qué el pico no alcanza, y es la diferencia entre poder medir y no

El pico de una señal con ruido es el pico de la suma: cuando el tono baja hasta
el orden del ruido, el pico deja de bajar y el barrido se aplana.

Medido contra este banco, con un tono de 1 kHz:

| | por pico | en el bin de 1 kHz |
|---|---|---|
| tono presente, general | −22,8 dBFS | −23,0 dBFS |
| en silencio, general | −55,1 dBFS | **−120,9 dBFS** |
| **recorrido útil** | **~32 dB** | **~98 dB** |

Correlacionando con el seno y el coseno de la frecuencia buscada —Goertzel, una
DFT de un solo bin— el ruido que no está en esa frecuencia no entra en la
cuenta. Con cuatro segundos a 48 kHz el bin es de 0,25 Hz.

**Y es el mismo dato, medido mejor**: no es un truco para ver lo que no está. Si
el tono se fue, el bin da cero igual — en silencio lee −121 dBFS.

**Verificado contra un valor conocido**: los canales 3 y 4 de la interfaz son su
retorno interno, y con un tono generado a −20 dBFS leen **−20,00 exacto**.

## Dos detalles que costaron

**No busca el trozo `data` con `indexOf`.** Eso encuentra la primera aparición,
que puede caer dentro de un `JUNK` de relleno o del propio audio y devolver
basura con forma de señal. Los archivos de `AVAudioFile` traen ese `JUNK`, así
que el caso no es teórico. Se recorren los trozos.

**`Math.max(...x)` revienta la pila** con 192.000 muestras. Va con bucle.

## Lo que no dice

Nada sobre dBFS absolutos **de la consola**. Mide lo que llegó a la interfaz, y
entre la salida de la consola y esto hay una ganancia de entrada que nadie midió.
Sirve para **diferencias** por un camino que no se toca, que es lo que las leyes
necesitan.
