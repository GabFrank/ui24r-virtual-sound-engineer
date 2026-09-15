# La balística del medidor es otra medición, y empieza declarando que no la puede ver

**Origen:** el auditor de expectativas del ítem 99b, 2026-09-13. El control de
balística que la 99b llevaba **se sacó del contrato** antes de correr.

## Qué se creía

> *«Un medidor calculado sigue al fader al instante; uno que mide tiene tiempo de
> integración. Si el medidor cae de un cuadro al siguiente y la salida real tiene
> una cola, el medidor es un cálculo.»*

Era la única vía que quedaba para separar «la consola **mide** el medidor
post-fader» de «lo **calcula** como `pre × tabla(fader)`», que es la hipótesis que
toca a la 94 y la 96b. Los niveles estacionarios no la separan.

## Por qué no servía

**Este proyecto ya había medido la balística de ese medidor y el número refuta el
control.** `docs/protocol-spec.md:412`, del 2026-09-10:

> Cinco ráfagas de 1 200 ms: subida de **0 ms** y caída de 20 dB con **mediana de
> 37 ms**. La cadencia con señal es de ~44 ms, así que nada por debajo de eso se
> puede afirmar.

**37 ms es menos que un cuadro de 44 ms.** O sea que «cae de un cuadro al
siguiente» es lo que se ve **también cuando el medidor mide de verdad**. El
control estaba garantizado a dar el resultado que se iba a leer como «es un
cálculo».

Es la misma forma que el auditor de la 98 encontró en su S7: una falsación
aritméticamente imposible, escrita antes de medir nada.

## Y en la otra dirección tampoco

Una cola en la salida real la puede producir el rampeo del fader digital de la
consola, el relajamiento del compresor del general, el transitorio del ecualizador
de 31 bandas o el pasa-altos del conversor. Ninguno es «el medidor integra audio».

## Qué haría falta para medirla de verdad

1. **Un instrumento que no existe.** `analizar.mjs` da un número por archivo. Hace
   falta correr el Goertzel sobre ventanas sucesivas —10 ms con salto de 5— y
   **publicar la resolución junto al número**.
2. **Aceptar que no hay origen de tiempo común.** Los cuadros `VU2` no traen marca
   de la consola, y entre la entrada y el WAV está la latencia de CoreAudio más el
   buffer. Así que no se alinean cuadros con muestras: se mide **en cada
   instrumento contra su propio reloj** el tiempo desde su última lectura alta
   hasta la primera 20 dB por debajo — el mismo evento que usó la §4.3.
3. **Empezar diciendo que el efecto buscado es más corto que la resolución.** Sólo
   una cola en la salida real **mucho** mayor que 44 ms sería informativa.

## Lo que esto deja abierto

La pregunta *«¿la consola mide el medidor post-fader o lo calcula?»* **sigue
abierta**, y la 99b lo declara. Lo que la 99b sí puede cerrar es la que importa
para el producto: si el medidor **predice** la salida real.
