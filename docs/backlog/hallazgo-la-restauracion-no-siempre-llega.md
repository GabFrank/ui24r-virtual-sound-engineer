# La restauración arrancó y no llegó, y eso ya no queda sin registro

**2026-09-16.** Sale de cortar a mano `banco-en-vivo.ts` después de cablear el
banco. Instrumentos nuevos: `tools/spikes/pendiente.ts` y
`tools/spikes/reparar-pendiente.ts`.

## Lo que pasó

Al cortar el medidor en vivo, la señal llegó y `conRestauracion` **arrancó** —
alcanzó a imprimir *«SIGTERM recibida: se restaura antes de salir»*— pero al
proceso lo mataron antes de que terminara de escribir. La consola quedó con **el
supresor apagado y un envío de auxiliar abierto**.

Se detectó releyendo por HTTP, **a mano, porque alguien se acordó de mirar**. Esa
es la parte incómoda: no lo detectó ninguna guarda. Sin ese acordarse, la consola
del usuario quedaba así.

No hubo daño —no había nada conectado a los parlantes y se corrigió en el
momento, verificando clave por clave— pero el mecanismo falló en la dirección que
importa.

## Por qué el arreglo obvio es el equivocado

Lo primero que uno piensa es acortar la restauración. Está mal, y conviene dejar
escrito por qué para que nadie lo intente de nuevo.

Buena parte de esos segundos es una **espera de seguridad**: entre matar el tono y
volver a encender el supresor hay que esperar a que el tono muera de verdad,
porque reencenderlo con el tono sonando **es exactamente como se plantó la notch
de la 104**. Acortar esa espera cambia un riesgo por otro peor, y el peor es el
que le deja un filtro permanente al usuario.

El problema no es que la restauración tarde. Es que **lo único que sabía qué había
que restaurar vivía en la memoria del proceso que se acaba de morir**.

## El papelito

`pendiente.ts` escribe en disco, **antes de la primera escritura**, qué claves se
van a tocar y a qué valor vuelven. Si el proceso muere de golpe, el papelito
sobrevive: la corrida siguiente lo encuentra y avisa, y `reparar-pendiente.ts` lo
deshace verificando por HTTP.

Con eso, el docblock de `conRestauracion` —que declaraba *«`SIGKILL` y quedarse
sin corriente. No hay vuelta.»*— pasa a ser cierto sólo de ese módulo, y quedó
corregido ahí.

**Tres decisiones que valen más que el código:**

- **Avisa, no restaura solo.** Aplicar valores de una sesión que murió quién sabe
  cómo, sin que nadie mire, es escribir a ciegas sobre la consola de alguien. El
  que corre el reparador está mirando.
- **El papelito se borra sólo si la relectura por HTTP confirma que todo volvió.**
  Borrarlo igual sería perder el único registro de lo que falta arreglar, justo en
  el caso en que hace falta.
- **Un papelito ilegible no se lee como «no hay nada pendiente».** Devolver `null`
  ahí sería la conclusión falsa —la consola sí quedó tocada— así que devuelve un
  centinela que se ve. Se comprobó con un mutante: poniendo `null`, el test falla.

## Probado contra la consola, no sólo contra un test

Esto es lo que faltaba, y es la regla del propio proyecto: *un test que pasa
contra el simulador no cierra ninguna invariante*. El papelito se ejerció de punta
a punta contra el aparato real el 2026-09-16, corriendo `llega-el-tono.ts`:

- **durante la corrida** el papelito existía, nombrando el guion, la consola y
  `m.afs.enabled` con el valor previo **leído del aparato**;
- **al terminar** la restauración se verificó por HTTP y el papelito **se borró
  solo**.

La misma corrida deja de paso tres confirmaciones: el banco sigue sano —el tono
entra y vuelve con margen—, el supresor no plantó nada —doce filtros antes y doce
después— y la cadencia del medidor vuelve a reproducir lo del
[hallazgo del flujo por cambio](hallazgo-el-medidor-se-emite-por-cambio.md).
Evidencia:
[`llega-el-tono-2026-09-16b.txt`](../spikes/SPK-P0.10b-vu2/evidence/llega-el-tono-2026-09-16b.txt).

## El trinquete, y lo que falta

Veintitrés guiones usan `conRestauracion` y **tres** dejan el papelito. Los otros
veinte están en una lista declarada entera que **sólo puede encoger**, con su
tamaño escrito para que agregar un nombre no la afloje en silencio. Es el mismo
patrón —y por el mismo motivo— que `restauracion-garantizada.test.ts`: convertir
veinte guiones de golpe es un cambio mecánico grande sobre código que habla con un
aparato real.

**Lo que el papelito NO cubre:** que se pierda el disco. Cubre lo que pasa de
verdad, que es un proceso muerto de golpe.

**Y una causa que no se arregló, porque no es del proyecto:** lo que mató al
proceso fue la herramienta con que lo corté, que manda la señal y no espera. La
lección operativa es cortar estos guiones de una forma que les dé sus segundos, y
está anotada acá porque la próxima persona la va a repetir.

## Trabajo previo

**No hay coincidencias en otros proyectos.** Ninguna de las cuatro
implementaciones de terceros que hablan este protocolo restaura nada: son
bibliotecas de control, escriben cuando se les pide y no tienen concepto de
«dejar la consola como estaba». El problema aparece recién cuando un programa
**mide** sobre el equipo de alguien, y eso no lo hace ninguna de ellas.
