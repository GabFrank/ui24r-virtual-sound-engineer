# ADR-021 — La versión la deciden los commits, no una etiqueta a mano

**Estado:** Aceptada
**Fecha:** 2026-09-08
**Origen:** la primera publicación del repositorio, y cómo falló.

## Contexto

ADR-020 dejó el mecanismo por el que una versión llega a la tablet: una publicación de GitHub con el APK y su suma. Lo que quedó sin decidir fue quién la dispara y quién elige el número.

Hasta acá lo hacía una persona: `git tag v0.1.0 && git push origin v0.1.0`. Eso tiene tres costos que se cobraron en la primera corrida real.

El primero es que el número lo elige quien escribe la etiqueta, y no tiene por qué corresponderse con lo que cambió. Nada impedía publicar `v0.2.0` sobre un cambio de documentación ni `v0.1.1` sobre uno que rompe el formato de la base de datos local. Los commits de este repositorio ya dicen qué clase de cambio son --hay `commitlint` en la integración continua que lo exige-- y ese dato se estaba tirando.

El segundo es la ceremonia. Publicar requiere acordarse de etiquetar, y de etiquetar el commit correcto, después de fusionar. Durante la fase de pruebas con hardware la frecuencia esperada es de varias versiones por semana; una ceremonia manual a esa frecuencia se salta.

El tercero apareció en la primera publicación: **la etiqueta `v0.1.0` se creó, la corrida falló al restaurar el almacén de claves y no hubo APK.** El secreto estaba cargado pero traía retornos de carro, y `base64 -d` los rechaza. La etiqueta quedó ocupada, y con el disparador atado a la etiqueta, corregir el fallo obligaba a borrarla y volverla a crear --o a quemar un número de versión por un error de copiado.

## Decisión

**Cada fusión en `main` pasa por la publicación.** `semantic-release` lee los commits desde la última etiqueta, decide si alguno libera y con qué incremento, compila y firma el APK, y crea la etiqueta y la publicación. Si ningún commit libera --`docs:`, `chore:`, `ci:`, `refactor:`, `test:`-- termina sin publicar y sin fallar.

Empujar una etiqueta a mano ya no publica nada.

La publicación **no escribe en el repositorio**: no hay `@semantic-release/git`, ni CHANGELOG generado, ni `package.json` actualizado. `main` exige revisión por pull request, así que un empuje automático fallaría; y el CHANGELOG de este repositorio está escrito para leerse, con el porqué de cada cambio, cosa que una lista de asuntos de commit no sustituye. Esa lista existe igual: son las notas de la publicación en GitHub.

## Consecuencias

Se gana que el número de versión sea una consecuencia y no una decisión: `fix:` da parche, `feat:` da menor, `BREAKING CHANGE:` da mayor, y quien quiera un incremento distinto tiene que escribir un commit distinto. Se gana también que fusionar sea todo lo que hay que hacer, que es lo que se necesita cuando la tablet está esperando en el ensayo.

Se pierde poder publicar «esto de acá» sin fusionarlo. No se considera pérdida: lo que llega a la tablet debería ser lo que está en `main` y pasó por revisión.

Se acepta un costo de dependencias: `semantic-release` y sus complementos suman unos cuatrocientos paquetes de desarrollo a un repositorio que tenía seis dependencias directas. Se aceptó porque la alternativa era escribir y mantener el mismo análisis de commits a mano, y porque la parte propia --compilar, firmar y comprobar la firma-- queda igual en `tools/release/construir-apk.sh`, que se puede llamar sin `semantic-release` de por medio.

Queda un número que no se puede mantener al día: sin escritura en el repositorio, `package.json` no puede llevar la versión publicada. Dice `0.0.0-semantic-release`, que es un número que nadie va a confundir con el de una versión. La versión del APK sale de la etiqueta, y la aplicación lee la suya del propio paquete instalado.

Queda también que **la comprobación de la firma dejó de ser a ojo.** La corrida compara la huella SHA-256 del certificado del APK con la del almacén de claves que restauró; si no coinciden, no hay publicación. Antes las imprimía y confiaba en que alguien mirara.

## Alternativas descartadas

**Seguir etiquetando a mano.** Es lo que había. Se descarta por los tres costos de arriba, y sobre todo porque el número de versión quedaba desligado de lo que decían los commits, que es un dato que el repositorio ya produce y ya valida.

**Etiqueta a mano pero con el número calculado.** Una herramienta propuesta que dijera «te toca 0.1.1» y que la persona empujara la etiqueta. Se descarta porque conserva la ceremonia entera y sólo quita la parte fácil.

**Herramienta propia en vez de `semantic-release`.** Unas cien líneas: leer la última etiqueta, listar los commits, decidir el incremento, crear la publicación. Tentador en un repositorio que valora tener pocas dependencias. Se descarta porque el análisis de commits tiene más aristas de las que parece --reversiones, `BREAKING CHANGE:` en el cuerpo, notas de pie-- y porque equivocarse ahí produce un número de versión mal puesto, que en un mecanismo de actualización automática es exactamente el error que no se quiere.
