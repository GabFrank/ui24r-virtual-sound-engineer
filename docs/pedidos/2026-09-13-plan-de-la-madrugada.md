# Plan de la madrugada del 2026-09-13

**Pedido del usuario**, textual: «*me gustaría que me des la lista de tareas que
vas a ejecutar durante la madrugada, incluye leer el manual que descargamos, de
acuerdo a lo que descubres en el manual puedes crear más tareas, recuerda también
de crear o actualizar el gatillo que despierta*».

Y antes, al irse a dormir: «*te dejaré trabajando toda la madrugada*».

## Las condiciones, que no son las de anoche

1. **El bucle está cableado**: salida del general a la entrada 1 de la Scarlett,
   **y salida del auxiliar 5 a la entrada 2**. La segunda mitad no se usó todavía
   y es la que desbloquea el bloque 2.
2. **No hay nada conectado a ninguna salida física** salvo esos dos cables. Nada
   de lo de esta noche hace ruido en la sala.
3. El instrumento externo existe y está validado contra un filtro conocido.
4. **La Mac tiene que quedar encendida** y **las perillas de la Scarlett sin
   tocar** — las dos cosas fallaron hoy, y el eje de decibeles cuelga de la
   segunda sin ningún testigo que la vigile.

## El orden, y por qué

**Primero lo que necesita la consola.** La consola se puede apagar: pasó el
2026-09-11, toda la noche. El trabajo de producto no se pierde si desaparece; una
medición sí. **Y el manual va después de las mediciones** por lo mismo: el archivo
no se va a ningún lado.

**Pero el manual va antes del producto**, porque de lo que diga pueden salir
mediciones nuevas — y ésas sí necesitan el aparato.

---

## Bloque 0 — Cerrar la 101 (en marcha)

| | |
|---|---|
| **Qué** | Aplicar el resultado de la medición de las curvas del ecualizador, documentarlo, commit y push |
| **Estado** | El barrido está corriendo. Línea base plana dentro de 0,82 dB, 14,7 dB de recorrido antes del recorte |
| **Y la decisión anunciada al usuario** | Si pasa, **no se promueve a `PROBADO` con eso solo**. Medir crudo → Hz no prueba la dirección inversa, que es la que la aplicación usaría para escribir. Ver el bloque 3 |

---

## Bloque 1 — La medición que decide si la 94 y la 96b se salvan

**Es la de mayor valor de la noche, y no la había visto hasta que el usuario
describió el cable.**

`protocol-spec` §4.4 dice, con todas las letras:

> *«Lo que sigue abierto es la otra mitad: a cuántos dB equivale un escalón de
> esos bytes. La 96b los convierte con la escala del medidor de **canal**, que no
> está medida sobre este bloque, así que todas sus cifras en dB heredan esa
> suposición.»*

La 99b de ayer ancló la escala del medidor **de canal** a un instrumento externo
—rango implicado 79,91 dB contra el 80 declarado— y **declaró explícitamente que
eso no rescata a la 94 ni a la 96b**, porque ésas leyeron los bloques de
**auxiliar** y de **efectos**, que están en la cola de la trama y tienen otro
paso.

**Con el aux 5 entrando a la Scarlett, esa mitad se puede cerrar**: mismo método
que la 99b, barriendo el envío al auxiliar y midiendo la salida real del auxiliar
por el segundo canal del bucle.

| # | Qué | Qué queda sabido | Riesgo declarado |
|---|---|---|---|
| **102** | La escala en dB de los bloques de **bus** de la trama `VU2`, contra el instrumento externo | Si el paso del bloque de auxiliar es el mismo 0,3334 dB del canal. **Decide si la 94 y la 96b siguen en pie** | El bloque de auxiliar es mono de 5 bytes y el de efectos estéreo de 7: medir uno **no** da el otro. Si sólo se mide el de auxiliar, se dice, y la 96b sigue tocada |

Contrato antes de tocar nada, auditoría del contrato **y del guión** —la lección
de hoy— y una sola corrida archivada.

---

## Bloque 2 — La auditoría general que el usuario pidió

«*cuando consideres prudente, puedes parar las mediciones y lanzar una auditoría
general para ver que todo esté andando correctamente*».

El momento prudente es **acá**: con la 101 y la 102 cerradas se cierra un ciclo
completo —instrumento construido, validado, dos mediciones corridas, entradas de
`RAW_MAP` promovidas o no— y hay algo entero que auditar en vez de trabajo a medio
hacer.

Alcance: que la suite siga siendo un control y no un adorno, que los documentos
digan lo que las corridas dijeron, que no haya cifras citadas que no estén en
ningún archivo de evidencia, y que las entradas de `RAW_MAP` que cambiaron de
estado lo hayan hecho con la evidencia que declaran.

---

## Bloque 3 — El manual, que primero hay que poder leer

### 3a. El extractor miente sobre sí mismo, y hay que arreglarlo antes de leer

El `README` de `docs/referencia/` dice que el extractor «sale al 79 % de
caracteres legibles». **Es falso, y el centinela no puede verlo:** su clase de
caracteres es `[A-Za-zÀ-ÿ0-9]`, que **incluye** los caracteres corruptos. Medido:

| | |
|---|---|
| `ÿ` (U+00FF) | **320 231 veces** |
| `í`, `î`, `Ã`, `¸`, `ì`, `þ`, `ï` | entre 1 100 y 2 600 cada uno |
| `Ü` por la ligadura **fi** | «Ürmware», «conÜguration», «speciÜed», «Ülter», «Üxed» |
| `Ý` por la ligadura **fl** | «Ýat», «Ýoat» |
| ` = ` por espacio en texto justificado | **6 533 veces** |
| **Tokens que son palabras ASCII limpias** | **12 107 de 31 612 — el 38 %** |

O sea que **hoy el manual no se puede buscar**: `grep firmware` da cero, y hay
once apariciones. Es exactamente el patrón que este proyecto ya nombró: *un
control que sólo puede confirmar*.

Tareas: restituir las ligaduras, entender qué es el `ÿ`, deshacer el `=` del
justificado, y **cambiar el centinela para que mida palabras y no caracteres** —
un umbral sobre «qué fracción de los tokens son palabras de diccionario» no se
deja engañar por esto.

### 3b. Leer el manual entero, con la regla ya escrita

`docs/referencia/README.md` ya fija la regla y no se toca: **el manual es una
tercera fuente, no una superior. Cuando choca con una medición, gana la
medición.** Ya lo hizo dos veces (4 bandas contra 5; «un snapshot recuerda todo»
contra el supresor que no vuelve).

Lo que se busca, en orden de valor esperado:

1. **Qué parámetros existen que este proyecto no sabe que existen.** Es lo único
   que el `mixer.html` no puede decir por sí solo.
2. **Rangos declarados** para todo lo que está en `RAW_MAP` sin medir.
3. **El supresor**: LIVE / FIXED / LOCK y `m.afs.fmode`, que ya quedó como
   hipótesis con origen y sigue sin medirse.
4. **Lo que el manual diga del enrutado, los subgrupos, las matrices y los grupos
   de silencio**, que el producto va a necesitar y hoy no están tocados.
5. **Y todo lo que contradiga al aparato**, que va a la tabla de contradicciones.

**De esto salen tareas nuevas**, y se anotan acá mismo con su origen. Las que
necesiten el aparato van al principio de lo que quede de noche; las que no,
después.

### 3c. El Service Manual

Está mencionado como existente y nunca se miró. Si aparece, mismo tratamiento.

---

## Bloque 4 — Producto, que no necesita la consola

En orden. Todo esto está pendiente desde antes de hoy.

| # | Qué | Por qué importa |
|---|---|---|
| **P1** | **El que llama al monitor.** Ningún código de producción construye un `MONITOR_AUX_SEND`, y `techoPorRuta` no tiene productor | Es lo que hace que una sesión con sonido real valga el tiempo del usuario. Sin esto, la aplicación mide y no toca |
| **P2** | **Atar `magnitudPropuesta` al valor crudo** que va al cable | Tiene que cerrarse **antes** del primer llamador, o el primero hereda la ambigüedad |
| **P3** | Convertir los **46 guiones** restantes a `conRestauracion`, con el trinquete que ya los cuenta | Cada uno es una corrida que puede dejar la consola distinta de como estaba |
| **P4** | Arreglar los **9 guiones** con valores previos escritos a mano | Un valor previo inventado restaura a un estado que nunca existió |
| **P5** | El ítem **103** (pantalla de la banda por QR) y la pantalla del ítem **92** | |
| **P6** | El **ADR de bajar buses** para cazar acoples | Decisión tomada, sin registrar |

---

## El gatillo que despierta

Un trabajo recurrente cada veinte minutos que vuelve a entrar en este plan. Sólo
dispara con la sesión ociosa, así que no interrumpe una medición: espera a que el
turno termine.

**Su prompt dice dónde está el estado** —este archivo— y **qué NO hacer**, porque
un gatillo que sólo dice «seguí» invita a improvisar.

## Lo que no se toca en toda la noche

- La instantánea **«Alma Caninde»**, verificada presente hoy leyendo `SHOWLIST` y
  `SNAPSHOTLIST` — no por «no la toqué».
- La **fantasma del canal 9** (INV-007), que es del usuario.
- El **supresor** sólo si una medición lo exige, y se deja como estaba.
- Y **nada suena en la sala**: no hay nada conectado a ninguna salida salvo los
  dos cables del bucle.
