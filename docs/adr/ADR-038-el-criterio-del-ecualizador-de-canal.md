# ADR-038 — El criterio del ecualizador de canal: nombre para arrancar, medición para corregir, y lo aprobado vuelve a la biblioteca

**Estado:** Decidida, sin implementar
**Fecha:** 2026-09-20
**Origen:** decisión del usuario, entre cuatro opciones, al abrir la pieza 2 de la hoja de ruta del 2026-09-17. La pregunta que él planteó, textual en lo esencial: **con qué criterio la aplicación decide mover una banda**, porque *«que suene bien» no es un número*.

## Contexto

La pieza 2 es el ecualizador de canal y **no existe nada de ella**: ni decisión, ni asistente, ni servicio, ni pantalla. Empieza por una decisión del usuario, igual que la 1 empezó con [ADR-034](ADR-034-poner-el-nivel-de-monitor-y-retocarlo.md).

**Lo que el usuario puso como condiciones**, el 2026-09-20:

> No es algo definitivo ni rígido: primero construir una base, después pulir. **Los valores no pueden ser fijos sino configurables.** Para el MVP **no hay configuración manual en la app**: el asistente lo hace todo, pero el usuario puede auxiliar tocando directamente el mixer y **avisando que ése es el ecualizador preferido**. Puede haber **más de una configuración por tipo de instrumento**. Soundcraft permite crear preajustes personalizados y conviene aprovechar esa función.

**Lo que el aparato ya tiene, medido el 2026-09-20** —[`hallazgo-los-preajustes-del-usuario-ya-estan-en-la-consola.md`](../backlog/hallazgo-los-preajustes-del-usuario-ya-estan-en-la-consola.md)—:

- el protocolo **deja listar y leer** los preajustes, y guardar, renombrar y borrar existen sin haberse ejercido;
- el usuario tiene **diez preajustes propios**, y son **de canal entero**: traen ecualizador, dinámica y puerta juntos, 32 claves;
- **reúsa la misma curva de voz en varios cantantes**, y tiene dos djembes con variante alternativa: «más de una configuración por instrumento», observada y no supuesta;
- **retoca el ecualizador después de cargar, siempre** —los siete canales con etiqueta lo tienen marcado—, y **la puerta no la toca nunca**: los seis con etiqueta de puerta están sin retocar;
- la consola trae **28 curvas de fábrica** por instrumento.

**Lo que la aplicación tiene para medir un canal.** El analizador de la consola da **122 bandas de un doceavo de octava** con su escala medida, y **se puede apuntar a un canal**: está medido con un micrófono real el 2026-09-10. No hay micrófono de medición, no hay motor de audio propio y la aplicación no reproduce audio.

**Lo que falta medir, y vale para cualquiera de las opciones.** Del ecualizador de canal están medidas **las cuatro ganancias**, pero **la frecuencia y el Q de la banda 1 solamente**. Las bandas 2, 3 y 4 no tienen ley medida, así que por la regla 1 del repositorio no se puede escribir en ellas. Probablemente compartan la ley —el cliente de la consola usa la misma función para las cuatro, y en la banda 1 esa función coincide exacto con lo medido— pero **probable no es medido**.

## Decisión

**El criterio que mueve una banda tiene tres fuentes y se usan en cascada, en este orden.**

1. **El punto de partida sale de una curva nombrada**, cuando existe para ese instrumento: primero una del usuario, si no la de fábrica de la consola, y si no hay ninguna se parte de donde esté el canal. El punto de partida **no es el resultado**: es de dónde arranca la corrección.

2. **La corrección sale de medir el propio canal**, con el músico tocando. La aplicación propone, aplica, **vuelve a escuchar y a medir**, y **deshace si no mejoró**. Los valores **no son fijos**: salen de esa medición, que es como se cumple la condición del usuario sin inventar una tabla.

3. **Lo que el usuario aprueba vuelve a la biblioteca.** Cuando él toca el mixer y avisa «así está bien», esa curva se guarda con nombre y **pasa a ser el punto de partida de ese instrumento la próxima vez**. Es el «avisá que ése es el preferido» que él pidió, y cierra el ciclo: la biblioteca se llena con lo suyo, no con lo que otro escribió en una tabla.

### Lo que es operacionalización del agente, y no decisión del usuario

Se separa a propósito, porque esa autoría ya se invirtió una vez en este repositorio y `safety-invariants.md` pide no fusionarlas. **El usuario eligió la cascada de tres.** Lo de abajo lo propone el agente y queda sujeto a revisión:

- **La aplicación escribe sólo las bandas del ecualizador**, aunque el preajuste del que parte traiga también dinámica y puerta. Tres motivos: el usuario **no retoca la puerta** —está medido en su aparato—, la pieza 2 es el ecualizador y no la tira entera, y aplicar 32 claves de golpe choca con el máximo de cuatro parámetros por transacción de INV-005.
- **Una banda por vez, con escucha en el medio.** Es la misma máquina de la pieza 1 y el mismo motivo: sin escucha entre cambio y cambio no hay con qué verificar que mejoró. También evita el choque de [ADR-035](ADR-035-el-tope-es-por-parlante-no-por-clave.md), que cuenta dos bandas como el mismo destino si se pisan.
- **Cuando hay más de una curva para un instrumento, elige el usuario, no la aplicación.** La aplicación las ofrece; no adivina cuál de los dos djembes es éste.

## Consecuencias

**Qué se gana.**

- **Funciona donde no hay tabla.** Para la mitad de la lista del MVP —los cinco djembes, las flautas nativo americanas, las maracas, el kick del foot case— no hay curva de fábrica ni fuente de oficio confiable. La fuente 2 no las necesita.
- **Se apoya entero en lo ya construido.** Proponer, aplicar chico, escuchar, medir, verificar y deshacer es la máquina de la pieza 1, con su diario, su motor de seguridad y su comprobación de escucha.
- **La biblioteca mejora con el uso** y es del usuario, no nuestra.

**Qué se pierde y qué cuesta.**

- **Es la más grande de las cuatro opciones**, y no entra en una tanda. Se construye por etapas, y las etapas están en el plan de la pieza 2.
- **Pide que el músico toque.** Sin señal no hay medición y no hay corrección: el asistente queda mirando.
- **Mientras mide, el analizador de la consola queda apuntando a ese canal**, y esa elección es global: **le cambia esa pantalla al operador**. Hay que avisárselo, y hay que devolverlo a donde estaba.

**Qué queda bloqueado hasta que se mida.**

- **La frecuencia y el Q de las bandas 2, 3 y 4.** Es lo primero del plan y vale para cualquier opción.

**Qué queda abierto y pide su propia decisión.**

- **Que la aplicación escriba preajustes en la consola del usuario** —la fuente 3— es una escritura de una clase nueva, sobre algo que él guardó con su nombre. No la habilita esta ADR.
- **Que la aplicación elija qué canal analiza** es también una escritura, y hoy ninguna categoría abierta la cubre.
- **Cómo se decide que «mejoró»** sobre un espectro de 122 bandas. Es el corazón del asistente y se decide con su propia medición, no acá.

## Alternativas descartadas

**A. Manda el nombre: poner un preajuste y listo.** Es lo más barato y usa lo que él ya tiene. Se descarta como criterio único porque **no se entera de la sala ni del día** —y él mismo retoca después de cargar, siempre, en los siete canales—, porque **para la mitad de su lista no hay curva**, y porque poner un preajuste suyo son 32 cambios de golpe contra un máximo de cuatro. **No se descarta del todo: queda como la fuente 1.**

**B. Manda sólo la medición.** Es la que mejor se apoya en lo construido y la que funciona donde no hay tabla. Se descarta como criterio único porque **tira a la basura las diez curvas que él ya tiene guardadas** y le hace empezar de cero cada instrumento, cada vez. **Queda como la fuente 2.**

**C. Manda la distancia a una curva de referencia del instrumento.** Es el precedente comercial más fuerte. Se descarta como criterio único porque **la curva de referencia no existe** para los djembes, las flautas ni las maracas, y fabricarla nosotros sería inventar el número que esta ADR existe para no inventar. **Queda como la fuente 3, con la curva construida por el usuario y no por nosotros.**

## Trabajo previo

El relevamiento completo está en [`trabajo-previo-ecualizacion-automatica.md`](../referencia/trabajo-previo-ecualizacion-automatica.md), levantado el 2026-09-20 **antes** de ofrecerle las opciones al usuario. Lo que pesó en esta decisión:

- **Los cuatro repositorios del protocolo no sirven para esta pregunta, y el usuario lo dijo primero**: son bibliotecas y clientes, no asistentes. Ninguno decide nada sobre el sonido, y ninguno toca preajustes — comprobado clonando y grepeando, en [`trabajo-previo-de-terceros.md`](../referencia/trabajo-previo-de-terceros.md).
- **La fuente 2 tiene precedente de oficio y de producto.** Sound On Sound enseña el barrido —subir una campana angosta, barrer escuchando, recortar donde molesta— **y dice que su propia tabla de frecuencias por instrumento sirve poco**. En producto: `soothe2` recorta lo que sobresale, `Gullfoss` reparte el equilibrio con un modelo de percepción. Y **adentro de la propia consola**, el supresor dbx ya hace esa forma con otro objetivo.
- **La fuente 3 tiene el precedente más directo, y en el número de bandas que importa.** Waves *Curves AQ*, de 2025, arma la curva con **cuatro anclas —grave, fundamental, armónicos y aire—**, que es exactamente el reparto de las cuatro campanas de esta consola; publica versión de latencia cero para vivo y le apunta al caso de este usuario. `sonible smart:EQ` permite además **perfiles propios construidos de una referencia y compartibles**, que es la fuente 3 tal cual.
- **La reducción de enmascaramiento** —Hafezi y Reiss, JAES 2015, con la medida sacada de las buenas prácticas del oficio— es el criterio con mejor respaldo académico y **no es alcanzable hoy**: pide oír dos canales a la vez y el analizador de la consola es uno solo y global. Queda anotado como conocido y no alcanzable, no como descartado.
- **Lo que existe para esta consola y NO es esto**: *Mixing Station* tiene una función de ecualización automática, y corrige **la respuesta del sistema en la posición de un micrófono de medición**, no el canal. Su documentación dice que sigue en desarrollo y que no reemplaza a los oídos. Se anota porque se parece lo suficiente como para confundirlo con un precedente y no lo es.
