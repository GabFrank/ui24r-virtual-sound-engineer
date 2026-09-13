# Lo que encontraron doce rondas de auditoría, en una noche

**2026-09-13.** Los ítems 105, 106, 107 y 108 pasaron por un auditor independiente
**antes** de tocar la consola: 1, 4, 2 y 5 rondas. Sólo la del 105 quedó archivada
entera; lo demás vivía en mensajes de commit. Esto es lo reutilizable.

**Ninguna ronda encontró un error de física ni de protocolo.** Las doce
encontraron defectos de **forma del control**: expectativas que no podían fallar,
expectativas que fallaban por construcción, y arreglos aplicados a medias.

## Los cuatro modos de falla, por veces que aparecieron

### 1. «El resultado tranquilizador es el que sale cuando no se midió nada»

El más caro, y salió en las cuatro mediciones.

- **106, ronda 1**: el guion no reproducía el banco del número que iba a
  verificar —`a.4.mix` vale 0 en reposo y `faderADb(0) = −∞`— así que habría leído
  el piso en los cuatro estados, las diferencias habrían dado cero, y la tabla
  habría impreso «la fuga es anterior al mute» sobre una cadena muerta.
- **105**: la guarda que tenía que atajarlo **fallaba y no detenía nada**:
  imprimía «falla, lo de abajo es informativo» y seguía hasta el veredicto.
- **108**: una pasada de anulación desapareció y `utiles` pasó a ser `puntos`: un
  punto hundido en el ruido o una captura que recortó puntuaban igual.

**La regla que salió**: al diseñar una expectativa, preguntarse qué imprime con la
cadena rota. Si imprime algo tranquilo, está mal puesta. Y **una guarda que falla
tiene que abortar**, no comentar.

### 2. El control calibrado para fallar en el hallazgo

El inverso, y es igual de malo.

- **106**: C1 exigía −12,68 ± 3 dBFS, y ese número salía de suponer que el fader
  del bus sigue `faderADb` —la hipótesis bajo prueba—. Con un tope del bus de +6
  en vez de +10 habría abortado **exactamente cuando hay hallazgo**.
- **108**: el testigo de C2 estaba a 100 Hz, una década bajo una campana de Q≈1, y
  la falda de esa campana mueve ese bin 0,82 dB contra un tope de 0,5. C2 fallaba
  si la ley resultaba ser ±20, que es lo que la corrida salía a confirmar, y el
  mensaje acusaba a la consola **por la falda del filtro que se estaba midiendo**.
- **108**: L8 comparaba un medidor de banda ancha contra un bin; con dos tonos, en
  el corte el testigo domina el medidor y L8 fallaba siempre.

**La regla**: un umbral que se deriva de la hipótesis bajo prueba no es un
control. Y antes de poner un número redondo, calcular qué predice la física.

### 3. El arreglo aplicado en un lugar y no en el otro

El más frecuente: **once veces en una sola ronda del 108**, y el que motivó
`tools/spikes/restos-de-edicion.mjs`.

- **106**: el C1 circular sobrevivió setenta líneas debajo del que lo reemplazaba,
  y era el que llegaba al `if`. El contrato tenía el gemelo: afirmaba una frase y
  la refutaba veintiocho líneas después.
- **107**: el `process.exit` que cerraba una puerta dejó abierta la frecuente —la
  excepción— que se saltaba la comparación de la pila del supresor.
- **108**: la pasada de anulación restaurada quedó **después** de la guarda que la
  usa, así que la guarda siguió siendo vestigial. Mismo defecto de orden que el
  106 ya había tenido.

**La regla**: después de cada arreglo, `grep` del símbolo, la constante y la
fórmula vieja en **todos** los archivos que tocan el tema. Y el detector
mecánico, que caza la firma: un docblock de una línea pegado encima de otro, un
rótulo de secuencia sin el que lo precede, una constante muerta.

### 4. La guarda escrita contra el aparato que uno supone

- **107**: `m.mute` no existe en esta consola —736 claves con `mute` y ninguna del
  general—. Dos auditorías leyeron el código y ninguna lo vio; salió de leer el
  volcado.
- **107**: `hwoutm.N.src` exigido contra `'m'` cuando el valor es `m.0` y `m.1`.
  La corrida habría muerto en el montaje sobre una consola sana — **y es el mismo
  defecto de la ronda anterior repetido en la ronda que lo cita**.
- **108**: la guarda de los cortes usaba `HZ_TESTIGO / 2`; al bajar el testigo de
  100 a 37 Hz, la mitad quedó en 18,5 contra un pasa-altos de 20.

**La regla**: auditoría de código y lectura del aparato son dos controles
distintos y no se sustituyen.

## Lo que las auditorías verificaron y estaba bien

Se anota porque una auditoría que sólo acusa no se puede calibrar, y porque tres
de estas eran sospechas mías infundadas:

- el WAV de dos tonos no recorta —pico −12,03 dBFS con 12 dB de aire—;
- el ancho de bin es 1/3 Hz y no 1 Hz, así que los dos tonos están a 2700 bins y
  la fuga de Hann entre ellos es indetectable (−0,00006 dB);
- Goertzel **no tiene pérdida por desalineación**: evalúa en la frecuencia exacta,
  no en un bin de la rejilla. El docblock de `analizar.mjs` decía lo contrario
  desde siempre;
- el presupuesto de tiempo cierra con factor 2,7 aun analizando dos veces por
  captura;
- `conRestauracion` cubre excepción, SIGINT/SIGTERM/SIGHUP y socket caído, y
  declara honestamente los huecos que no cubre.

## El costo, y por qué valió

Doce rondas, unas dos horas de auditor. A cambio: **cuatro corridas que habrían
gastado consola para no publicar nada**, **dos que habrían publicado un hallazgo
falso contra el aparato del usuario**, y una guarda de seguridad —la que ata la
magnitud al crudo— que llevaba un día enchufada al motor **sin poder disparar
nunca**.
