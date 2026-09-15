# Auditoría del ítem 105, antes de que tocara la consola

**2026-09-13, 06:10.** Un auditor independiente leyó el contrato, el guion, el
hallazgo del que salen y la evidencia de la 104. Se anota porque **paró una
corrida que habría publicado un veredicto falso**, y porque el modo de falla es
el mismo que esta serie ya repitió tres veces.

## El hallazgo que lo justificó todo

> El −91,77 dBFS de la 104 se midió **después** de que ese guion escribiera,
> dentro de `conRestauracion`: `a.4.mix = 0,45` — el fader maestro del auxiliar,
> que en reposo vale **0**.

Y `faderADb(0) = −∞`. Comprobado leyendo la consola: `a.4.mix` vale 0 ahora
mismo.

O sea que el guion del 105 **no reproducía el banco del que salía el número que
decía reproducir**. Habría medido el piso del bin en los cuatro estados; las
cuatro caídas habrían dado ≈ 0 dB; `clasificar` habría devuelto «queda» dos
veces; y la rama `queda/queda` habría impreso un párrafo largo, sereno y falso
sobre dónde está la fuga.

La guarda que tenía que atajarlo —G1, «E0 reproduce la 104»— **fallaba y no
detenía nada**: imprimía «FALLA, todo lo de abajo es informativo» y seguía
derecho hasta el veredicto. Y su mensaje acusaba a la consola equivocada: decía
«el banco cambió entre las dos corridas» cuando lo que había pasado es que el
guion no lo había reproducido.

## Los otros trece

| # | sev | qué |
|---|---|---|
| 2 | ALTA | G1 falla y el veredicto se imprime igual. El contrato prometía abortar |
| 3 | ALTA | `generalDb` de E1 se mide, se imprime y **no lo usa nadie**, siendo la única comprobación de que `m.mute = 1` llegó |
| 4 | ALTA | El envío es pre-fader; que además sea pre- o post-**mute** este proyecto no lo midió nunca. Si fuera pre-mute, E2 no separa nada y el guion lo leía como resultado |
| 5 | ALTA | La fila «E1 cae → es del banco» atribuía a la Scarlett una firma que la diafonía general→auxiliar **adentro de la consola** produce idéntica |
| 6 | MEDIA-ALTA | No exigía `m.mute = 0` ni `i.9.mute = 0` al empezar. Con el general ya muteado, E1 = E0 y G1 del testigo falla sin detener nada |
| 7 | MEDIA-ALTA | Nadie miraba el margen. Si E0 sale cerca del piso, **la fila «cae» es inalcanzable por aritmética** y el guion está obligado a imprimir «queda» |
| 8 | MEDIA-ALTA | E3 se medía con el canal muteado: una fuente ajena de 1 kHz que entrara por el canal estaría tapada y la guarda pasaría sin ver nada |
| 9 | MEDIA | `afplay` sin guarda de dispositivo ni de supervivencia. La 104 comprobaba en cada punto que el tono siguiera sonando; el 105 había **eliminado** esa comprobación |
| 10 | MEDIA | `cae/queda` es físicamente contradictorio y el guion entraba en la primera rama ignorando la segunda |
| 11 | MEDIA | Una caída **negativa** —que mutear suba el nivel— caía en el cajón «queda» en vez de informarse como anomalía |
| 12 | MEDIA | Un `ChildProcess` que emite `'error'` sin oyente mata el proceso **sin correr el `finally`**. `conRestauracion` enumera cuatro huecos y éste no estaba |
| 13 | BAJA | Los dos `setd` de mute se escribían a ciegas, sin releer |
| 14 | BAJA | El contrato llama L5 a la restauración y el guion nunca imprime esa etiqueta; y no se miraba `recorteExacto` en la entrada 1, de la que cuelga el testigo |

## Lo que el auditor comprobó y estaba bien

Vale anotarlo porque una auditoría que sólo acusa no se puede calibrar.

- **`ENTRADA_GENERAL = 0` es correcto**, y el índice no está inventado acá.
- **El bin de Goertzel no tiene pérdida por desalineación**: `amplitudDelTono`
  evalúa la correlación en la frecuencia **exacta**, no en un bin de la rejilla.
  Lo verificó con seis largos de captura distintos: 0,000 dB de diferencia. O sea
  que pasar de 3 s a 4 s **no** sesga la comparación con la 104. De paso: el
  docblock de `analizar.mjs` describe mal lo que el código hace —habla de una
  pérdida por desalineación que no existe— **pero el código está bien**.
- Las tres claves que se escribían estaban las tres leídas, en `PREVIO`,
  restauradas por `restaurarClaves` dentro de `conRestauracion` y reverificadas.
- **Exigir el envío en 0 en vez de escribirlo** es la decisión correcta.
- Apagar el supresor 1500 ms antes del tono: el orden es el correcto.
- 4 segundos de captura y 2000 ms tras un mute alcanzan de sobra.

## Qué se hizo

El contrato y el guion se reescribieron enteros. Lo nuevo que no estaba en
ninguna de las dos versiones anteriores:

- **Un control positivo antes de todo.** C1 abre el envío a 1,0 y exige que la
  entrada 2 dé cerca de los −12,68 dBFS de la 104: si no, el tono no está
  entrando y no hay nada que medir. C2 mutea el canal con el envío abierto y
  **mide si el mute está en el camino del auxiliar**, que es un dato que este
  proyecto no tenía.
- **Una guarda que falla aborta.** Si falla cualquiera de C1, G1, G2, G3, G4 o
  hay recorte, no se imprime veredicto y el proceso sale con 1.
- **G2**, que es aritmética y no opinión: sin 15 dB de margen en E0, la fila
  «cae» no puede ocurrir.

## La lección, que es la misma de siempre

El defecto no estaba en la física ni en el instrumento: estaba en que **el
resultado tranquilizador era el que salía cuando no se medía nada**. Es
exactamente lo que la 104 tuvo que arreglar agregando L3b, y lo que la 94 sufrió
sin poder nombrar. Una expectativa que no puede fallar no es una expectativa, y
una que falla sin detener nada tampoco.
