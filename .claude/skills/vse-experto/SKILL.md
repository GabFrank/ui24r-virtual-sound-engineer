---
name: vse-experto
description: Conocimiento experto del Ui24R Virtual Sound Engineer — cómo está construido, por qué está construido así, cómo se usa y qué reglas no se pueden romper. Usar al implementar, revisar o explicar cualquier parte de este proyecto.
---

# Experto en el Ui24R Virtual Sound Engineer

> **Cómo se trabaja acá está aparte.** Esta skill dice qué es el proyecto y para quién. Las reglas de commit, de documentación, de medición y de trato con la consola del usuario están en la skill **`vse-disciplina`**, y se aplican siempre, no solo cuando se pregunte por el proceso.

## Qué es esto

Un ingeniero de sonido virtual asistido por medición para consolas **Soundcraft Ui24R**.

No reemplaza a un ingeniero de sonido. Le da a **un músico que al mismo tiempo canta, toca, dirige y opera la consola** un sistema que escucha, mide, compara, explica, sugiere, aplica cambios controlados y verifica si realmente mejoraron el sonido.

Ese usuario condiciona todas las decisiones. Está de pie, a un metro de una tablet, con poca luz, a veces con un instrumento en una mano, y siempre con menos tiempo del que quisiera. Cuando dudes de una decisión de diseño o de producto, preguntate qué le sirve **a él, en el escenario, tres minutos antes de empezar**.

## Las cinco reglas que gobiernan el repositorio

Están en el README y no son decorativas. Cualquier cambio que las contradiga es un cambio equivocado, por bueno que parezca.

1. **Nada se asume del protocolo.** Ninguna función se implementa sobre un parámetro que no esté probado en `docs/capability-matrix.md`.
2. **Nada se escribe sin invariante.** Toda escritura a la consola pasa por el Safety Engine y está cubierta por una invariante de `docs/safety-invariants.md` con su test.
3. **Ningún asistente habla con la consola.** Solo `MixerDomainAPI` escribe, y solo por el camino `Assistant → Recommendation → Transaction → SafetyEngine → write()`.
4. **Primero medir, después corregir.** Cada corrección automática guarda estado, aplica un cambio pequeño, vuelve a medir y revierte si empeoró.
5. **La autoridad es humana.** La automatización avanza OBSERVAR → SUGERIR → ASISTIDO → AUTOMÁTICO CONTROLADO, y nunca salta etapas.

## Estado real, hoy

La aplicación **no escribe nada en la consola y no reproduce audio**. Observa, propone y guarda. Todo lo que necesita el micrófono de medición, la interfaz de audio o la verificación del protocolo está pendiente de los spikes de fase 0.

Lo que sí funciona de punta a punta, sin hardware:

```
Perfiles (banda, local, sistema de amplificación)
  → Sesión (crear, avanzar de estado, cerrar)
    → Canales (qué entrada es qué instrumento)
    → Ganancia (cuánto margen tiene cada canal)
  → Historial (solo lectura, exportable)
Ajustes (consola, actualización, datos)
```

Más: telemetría en vivo contra la consola o el simulador, paro de emergencia, y actualización de la aplicación desde GitHub.

## Mapa del código

| Ruta | Qué hay | Regla |
|---|---|---|
| `packages/domain` | Entidades, reglas, validación, constructores | Sin dependencias de framework. Los valores por defecto son decisiones del dominio y viven acá. |
| `packages/mixer-adapter` | Protocolo, estado confirmado, adaptador | **Único** punto que habla con la consola. |
| `packages/safety` | Motor de seguridad, diario, ejecutor de transacciones | Tiene autoridad sobre cualquier asistente. |
| `packages/assistants` | Análisis y propuestas | Funciones puras. No tocan la consola ni la base. |
| `packages/logging` | Registro, sumideros y lectura del registro guardado | Depende del almacén y de nada más. |
| `packages/store` | Puerto de almacén, esquema de la base y semántica de consulta | La verdad sobre qué contesta una consulta. Incluye el SQL, para poder probarlo. |
| `packages/updater` | Política de actualización | TypeScript puro, sin red ni Android. |
| `packages/dsp-contract` | Tipos del puente con el motor de audio nativo | Todavía sin implementación. |
| `apps/mobile/src/app/core` | Servicios transversales | Base, registro, conexión, sesión, repositorios. |
| `apps/mobile/src/app/ui` | Primitivas del sistema de diseño | Ver `docs/design-system.md`. |
| `apps/mobile/android` | Plataforma Capacitor y complemento de actualización | Java, no Kotlin: no hay cadena de Kotlin configurada. |
| `tools/mixer-sim` | Simulador de la consola | **Reproduce nuestras hipótesis, no el protocolo.** |
| `tools/visual` | Capturas y recorrido del camino de usuario | `flujo.mjs` falla si un paso se atasca. |

## Convenciones que hay que respetar

### Idioma
Español rioplatense en el dominio, en la interfaz y en los comentarios. Identificadores genéricos en inglés cuando ya son términos del oficio (`SessionState`, `ChannelAssignment`). Los mensajes de error se le muestran al usuario: tienen que decir **qué se esperaba**, no «valor inválido».

### Angular
- Componentes autónomos, señales, `ChangeDetectionStrategy.OnPush` siempre.
- **Nunca llamar funciones ni getters desde una plantilla.** Se reevalúan en cada ciclo de detección de cambios. Si la plantilla necesita algo calculado, va en un `computed()`. Esto ya se violó tres veces y costó cuarenta y ocho llamadas por ciclo en la pantalla de telemetría.
- Nada de valores literales de color, espacio o tamaño en un componente: todo sale de las fichas de `src/styles/_tokens.scss`.
- Los parámetros de ruta llegan como `input()` gracias a `withComponentInputBinding`.

### TypeScript
- Los paquetes se importan por sus fuentes, con extensión `.ts` explícita en los imports relativos. Lo exige el modo de eliminación de tipos de Node, que es con lo que corren los tests.
- **Sin propiedades declaradas en el constructor** (`constructor(private readonly x: T)`): ese modo de Node no las admite.
- `strict` con `noUncheckedIndexedAccess` y `exactOptionalPropertyTypes`.

### Commits
Conventional Commits. **El ámbito nombra el módulo, no el hito**: `feat(assistants)`, no `feat(mvp0)`. Los ámbitos válidos están en `commitlint.config.js`.

### Pruebas
`node --test --experimental-strip-types`. Cada test lleva en el nombre el identificador de la invariante que cubre, cuando corresponde. Un test que pasa contra el simulador **no cierra ninguna invariante**.

## Las trampas que ya mordieron

Cada una de estas costó tiempo. Están acá para que no vuelva a pasar.

**El signo de la propuesta de ganancia.** Con el pico a −4 dBFS proponía *subir* la ganancia, empujando hacia la saturación el canal que ya estaba cerca. La resta estaba invertida. Hay un test que exige bajar cuando el pico está alto, y un comentario junto a la línea.

**`null` en SQL contra `null` en JavaScript.** `columna = NULL` nunca es cierto en SQL; `x === null` sí lo es en JavaScript. «La sesión abierta» se busca por `cerrada_el IS NULL`. Y al ordenar, SQLite trata `NULL` como el valor más bajo mientras que la referencia lo manda al final en los dos sentidos. Por eso el esquema **y el SQL** viven en `packages/store`: `test/sql.test.ts` los corre contra SQLite real y compara resultado a resultado con el almacén en memoria. El almacén de Android solo ejecuta el texto.

**Invariantes vivas pero inertes.** INV-034 estaba escrita, probada y no se disparaba nunca, porque el campo del que dependía no lo poblaba nadie. Cuando agregues una invariante, verificá que algo real la active.

**El volcado inicial parecía una avalancha.** Al conectar, la consola manda su estado entero. El detector de cambios masivos lo leía como «alguien recuperó una instantánea». Se resuelve con `volcadoIniciado()`.

**La misma regla implementada dos veces.** El adaptador calculaba bien la conexión inestable y la interfaz tenía una segunda copia rota. El adaptador es la única fuente.

**Nombres de clase que colisionan.** Uno de los tonos de aviso se llama «aviso» y la clase base del componente también: `.aviso.aviso` coincidía con cualquier mensaje y todos salían en ámbar.

**Elementos fijos que tapan contenido.** El paro de emergencia y la barra inferior flotan. Cualquier página que termine en un botón tiene que reservar `--zona-inferior`.

**Firma de Android.** El sistema solo reemplaza una aplicación por otra firmada con la **misma clave**. Sin un almacén de claves fijo guardado como secreto, ninguna actualización funciona y el mensaje que ve el usuario es «aplicación no instalada», que no explica nada.

**Un número escrito a mano en la documentación se pudre.** La cuenta de tests estuvo en 220 cuando eran 283, se corrigió a 293, y dos PR después ya eran 298. La corrección dura hasta el siguiente PR que agregue un test. Cuando un dato cambia cada semana y nada lo comprueba, la respuesta no es corregirlo otra vez: es no afirmarlo, y decir dónde se consulta. Los números que sí valen la pena escribir son los que cambian con una decisión —cuántas invariantes hay, cuántos gates— porque cambiarlos es parte de tomar la decisión.

**Una comprobación puede estar calibrada por debajo de la regla.** El recorrido medía el paro del diálogo con un umbral de 44 px cuando INV-019 exige 64, así que aprobaba un botón de 48. Se había corregido antes un caso de 60 px argumentando que «cuatro píxeles no valen debilitar una invariante», y se dejó pasar uno de dieciséis. Cuando escribas la comprobación, copiá el número de la regla, no uno parecido.

**Una comprobación puede comprobar menos de lo que dice.** El validador de identificadores reconocía ocho familias como definición y comprobaba tres como referencia: spikes, epics, historias, riesgos y decisiones no se comparaban contra nada, y así sobrevivió una cita a EP-09 —que no existe— en un documento que el script daba por validado. Cuando agregues una comprobación, comprobá también su cobertura: no alcanza con que falle cuando debe, tiene que mirar todo lo que dice mirar.

**Los mapas de código de scripts rompen la compilación de desarrollo.** Con `allowImportingTsExtensions`, el compilador pierde `src/main.ts`. Están apagados a propósito en `angular.json`.

## Cómo se trabaja

```bash
npm run verificar          # todo lo que comprueba la integración continua
npm run verificar:commits  # los mensajes de esta rama, contra main

npm run lint          # chequeo de tipos completo + compilación de la app
npm test              # los tests de los paquetes y de los ayudantes de la app
npm run test:dsp      # 48 de procesamiento de señal
npm run validate:docs # identificadores de la documentación
npm run validate:templates  # acentos graves y llamadas desde plantilla
npm run validate:limites    # límites entre paquetes

npm run build:dev -w mobile          # compilación con la galería de diseño
node tools/visual/flujo.mjs          # 28 pasos del camino de usuario, 2 anchos
node tools/visual/capture.mjs        # escenarios del protocolo + sistema de diseño
node tools/mixer-sim/src/server.mjs  # simulador de la consola
```

**Antes de abrir un PR**: `npm run verificar` y `npm run verificar:commits`. Si tocaste interfaz, además las capturas.

Las ramas salen de `main` y entran por PR. `main` está protegida.

## Cómo se usa la aplicación

**La primera vez**, en este orden, porque cada paso depende del anterior:

1. **Perfiles → Banda.** Nombre e integrantes con sus instrumentos. Sirve para poder decir «el micrófono de Ana» en vez de «el canal 3».
2. **Perfiles → Amplificación.** Cajas y **rango útil**. El rango útil es el dato que impide que la aplicación proponga corregir donde el equipo no entrega nada; declararlo de más produce correcciones absurdas y potencialmente destructivas.
3. **Perfiles → Local.** Tipo, dimensiones (opcionales, y mejor vacías que inventadas) y curva objetivo.
4. **Ajustes → Consola.** La dirección. La Ui24R levanta su propia red y se presenta en `ws://10.10.1.1`.

**En cada show:**

1. **Sesión → Empezar**, eligiendo banda y local.
2. Avanzar de estado según lo que se vaya haciendo. La pantalla dice qué se puede hacer en cada estado.
3. **Canales**: asignar y marcar los que llevan **fuente en vivo**. Esa marca no es informativa: protege cuando se active el modo de reproducción, que sustituye las entradas por pistas grabadas.
4. **Ganancia**: medir canal por canal. Solo se ajusta en configuración de canales (INV-006): al grabar una toma, cambiarla haría que la toma dejara de representar al show.
5. Al terminar, **cerrar la sesión**. Es irreversible y queda en el historial.

**El paro de emergencia** está en todas las pantallas. Hace lo local primero, sin red, en menos de 200 ms. **No silencia el general ni los canales**: un paro que apaga el show entero es peor que el problema que resuelve, y nadie lo usaría.

## Cuándo consultar qué documento

| Pregunta | Documento |
|---|---|
| ¿Por qué se decidió así? | `docs/adr/` |
| ¿Qué no se puede hacer nunca? | `docs/safety-invariants.md` |
| ¿Qué sabemos del protocolo? | `docs/capability-matrix.md` |
| ¿Qué falta medir para desbloquear X? | `docs/spikes/`, `docs/gates/` |
| ¿Cómo se ve y por qué? | `docs/design-system.md` |
| ¿Qué puede hacer el usuario hoy? | `docs/flujo-de-usuario.md` |
| ¿Cómo se publica una versión? | `docs/actualizacion-en-app.md` |
| ¿Qué falló antes y cómo se vio? | `docs/visual/README.md` |

## Lo que nunca hay que hacer

1. Escribir en la consola fuera del camino `Assistant → Recommendation → Transaction → SafetyEngine → write()`.
2. Marcar una invariante como cerrada por pasar contra el simulador.
3. Implementar sobre un parámetro del protocolo que ningún spike verificó.
4. Llamar funciones o getters desde una plantilla de Angular.
5. Escribir un color, un espacio o un tamaño literal en un componente.
6. Cambiar el nombre de los artefactos de publicación (`vse-<version>.apk` y su `.sha256`) sin actualizar el actualizador: la detección se rompe en silencio.
7. Versionar un almacén de claves o cualquier secreto. El repositorio es público.
8. Editar una migración de base ya publicada. Se agrega otra.
9. Empujar sin correr `npm run lint` y `npm test`.
