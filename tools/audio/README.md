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
