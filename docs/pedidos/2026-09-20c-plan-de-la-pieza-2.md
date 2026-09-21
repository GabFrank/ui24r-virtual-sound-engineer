# El plan de la pieza 2, el ecualizador de canal

**Escrito el 2026-09-20**, inmediatamente después de que el usuario eligiera el
criterio entre cuatro opciones: [ADR-038](../adr/ADR-038-el-criterio-del-ecualizador-de-canal.md).
Su respuesta, textual: *«Opción D, por supuesto, arma un plan e iniciamos»*.

**Este documento ordena, no repite.** El qué y el porqué están en la ADR; acá
está en qué orden se construye y por qué en ese orden.

## El orden, y el criterio con el que está ordenado

**Primero lo que sostiene lo que sigue.** No se empieza por la pantalla ni por el
asistente: se empieza por lo que, si falta, deja todo lo demás sin poder
ejecutarse. Es el mismo criterio con el que se ordenó la pieza 1, y el que el
usuario eligió explícitamente cuando se le ofrecieron tres arranques.

| | Tarea | Por qué va acá | ¿Toca la consola? |
|---|---|---|---|
| **1** | **Medir la frecuencia y el Q de las bandas 2, 3 y 4** | Sin ley medida, la regla 1 del repositorio prohíbe escribir esas tres bandas. **Todo lo demás depende de esto** | **Sí**, corrida corta con restauración |
| **2** | **Decidir si la aplicación puede elegir qué canal analiza** | Sin eso no hay forma de medir un canal, y la elección **es global: le cambia una pantalla al operador**. Es una escritura de clase nueva y necesita decisión del usuario | Decisión primero |
| **3** | **Leer el espectro de un canal** | Las 122 bandas, convertidas con la escala ya medida, promediadas en una ventana. Sólo lee | No escribe |
| **4** | **El asistente: qué banda mover y por qué** | El corazón. Necesita su propia decisión sobre **qué cuenta como «sobresale»** y **qué cuenta como «mejoró»** | No: es función pura |
| **5** | **El servicio que aplica** | Por el camino de siempre, con escucha comprobada entre cambio y cambio y vuelta atrás si empeoró | **Sí**, por el motor de seguridad |
| **6** | **La pantalla** | Recién cuando hay algo que mostrar y algo que disparar | — |
| **7** | **La fuente 1: la biblioteca como punto de partida** | Leer sus preajustes y ofrecerlos. El protocolo ya está medido | Sólo lee |
| **8** | **La fuente 3: «así está bien» guarda la curva** | Cierra el ciclo. **Escribe un preajuste en la consola del usuario**: clase nueva, decisión aparte | **Sí**, y necesita decisión |

## Lo que cada tarea deja listo

**1. La ley de las bandas 2, 3 y 4.** Hoy sólo está medida la banda 1 —frecuencia
y Q— y las cuatro ganancias. El cliente de la consola usa la misma función para
las cuatro, y en la banda 1 esa función coincide exacto con lo medido, así que la
hipótesis es buena; **pero probable no es medido**, y la regla no distingue entre
una hipótesis buena y una mala. Se mide con el mismo método que la banda 1: banda
puesta en una frecuencia, las otras planas, barrido y lectura del audio.

**2. Quién elige qué canal analiza.** El analizador de la consola es **uno solo**,
y elegir su fuente es una escritura. No entra en ninguna de las categorías
abiertas hoy. Hay que resolver además qué pasa cuando el usuario estaba mirando
otra cosa: se anota dónde estaba y se devuelve, igual que con cualquier otra
ruta.

**3. El lector del espectro.** La escala está medida —0,375 dB por byte, 122
bandas de un doceavo de octava, con su fórmula de frecuencia— y la balística
también. Falta promediar una ventana y decidir cuánto dura, que es lo mismo que
ya se resolvió para la escucha de una cuña.

**4. El asistente.** Dos preguntas que **se contestan midiendo, no programando**:
qué diferencia sobre las bandas vecinas cuenta como una resonancia, y qué
diferencia entre dos mediciones cuenta como una mejora. La segunda tiene una vara
disponible: la repetibilidad del medidor está medida en 0,3 dB, y nada por debajo
de eso es una mejora.

**5. El servicio.** Se apoya entero en lo construido: motor de seguridad, diario,
escucha comprobada con sus siete condiciones, atadura del origen y tope por paso.
Lo único nuevo es **qué cuenta como destino audible cuando lo que se mueve son dos
bandas del mismo canal**, que es lo que [ADR-035](../adr/ADR-035-el-tope-es-por-parlante-no-por-clave.md)
dejó decidido y sin implementar.

**6. La pantalla.** Misma forma que la de monitores: elegir el instrumento, ver lo
que la aplicación propone, y aprobar.

**7 y 8. Las fuentes 1 y 3.** El protocolo para leer la biblioteca está medido y
listo. Para escribir en ella **no**, y eso necesita que el usuario decida si la
aplicación puede guardar preajustes con su nombre en su consola.

## Lo que este plan NO incluye, dicho para que nadie lo dé por incluido

- **El compresor y la puerta.** La pieza 2 es el ecualizador. El usuario **no
  retoca la puerta** —medido en su aparato— y el compresor tiene su propia
  decisión ([ADR-032](../adr/ADR-032-puerta-y-compresor-por-lazo-cerrado.md)).
  Que un preajuste de canal los traiga adentro no los mete en esta pieza.
- **La reducción de enmascaramiento**, que es el criterio con mejor respaldo
  académico y **no es alcanzable hoy**: pide oír dos canales a la vez.
- **El ecualizador de salida**, congelado hasta después del MVP.
- **Los hallazgos del backlog.** Siguen esperando al campo, por la regla de la
  hoja de ruta: un hallazgo medido y anotado no es una tarea.

## Y la regla que sigue mandando

**Una tarea, un commit, empujado, y recién ahí la siguiente.** Si aparece un
hallazgo en el medio, va como tarea nueva y no se mete en la que está en curso.
