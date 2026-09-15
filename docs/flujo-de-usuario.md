# Camino de usuario

Qué se puede hacer hoy con la aplicación, de principio a fin, sin hardware de
medición. Está verificado automáticamente: `tools/visual/flujo.mjs` recorre
estos veintiocho pasos en dos anchos de pantalla y falla si alguno se atasca o si
la consola del navegador registra un error.

```
Primera vez
  └─ Perfiles
       ├─ Banda ─────────── nombre, integrantes e instrumentos
       ├─ Local ─────────── tipo, dimensiones, curva objetivo, notas
       └─ Amplificación ─── cajas, rango útil, componentes y sus buses
Sesión
  └─ Empezar ───────────── elegir banda y local
       ├─ Avanzar de estado según la tabla de transiciones del dominio
       ├─ Canales ───────── qué entrada es qué instrumento
       ├─ Ganancia ──────── cuánto margen tiene cada canal
       └─ Cerrar ────────── irreversible, con confirmación
Historial
  └─ Detalle ───────────── solo lectura, exportable
Ajustes
  ├─ Consola ───────────── dirección y conexión
  ├─ Actualización ─────── versiones nuevas desde el repositorio
  └─ Datos ─────────────── dónde se guardan y cuántos hay
```

## Decisiones que se notan al usarlo

**No se puede abrir una sesión sin banda y sin local.** La pantalla no bloquea
con un error: dice qué falta y lleva a Perfiles. Sin saber quién toca ni dónde,
no hay con qué comparar lo que se mida después.

**Crear un local crea también un sistema de amplificación si no hay ninguno.**
Un local no se entiende sin saber qué equipo hay, y obligar a crear dos cosas
en orden antes de poder crear la que se quería es la clase de fricción que hace
que alguien abandone la configuración a medias.

**Cerrar la sesión no está entre los botones de «qué sigue».** La tabla de
transiciones permite ir a `CLOSED` desde casi cualquier estado, pero cerrar es
irreversible y tiene su propia acción con confirmación. Ofrecerlo como un botón
más, al lado de «Configuración», invitaría a cerrarla por error justo cuando se
intenta avanzar.

**La ganancia dice cuándo está congelada.** Solo se toca en configuración de
canales (INV-006). En el resto de los estados la tarjeta lo dice, en vez de
dejar un botón que no responde.

**Las dimensiones del local son opcionales y lo dicen.** Pedirlas obligatorias
llevaría a que alguien las invente antes de un show, y una sala declarada de
ocho por seis cuando son veinte por doce es peor que no tener el dato: la
aplicación calcularía modos propios que no existen. Se piden las tres o
ninguna, porque con dos no se calcula nada.

**Una sesión cerrada no se edita.** Si se pudiera, el historial dejaría de ser
un registro de lo que pasó para ser una opinión sobre lo que pasó.

## Dónde se guarda

| Dónde corre | Almacén | Para qué |
|---|---|---|
| Tablet (Android) | SQLite | El del producto. |
| Navegador | `localStorage` | Desarrollo y pruebas del camino de usuario. |

Los dos implementan el mismo puerto y **los dos toman la semántica de
`@vse/store`**: la de navegador usa `consultar()`, y la de SQLite arma sus
sentencias con `sentenciaListar()` y compañía. La clase de Android no decide
nada, solo ejecuta el texto.

La razón es concreta. En SQL, `columna = NULL` nunca es cierto y hay que
escribir `IS NULL`; en JavaScript, `x === null` sí lo es. Y al ordenar, SQLite
trata `NULL` como el valor más bajo, mientras que en estas listas un documento
sin el dato por el que se ordena tiene que quedar último en los dos sentidos.
Mientras cada implementación resolvía eso por su cuenta, la segunda diferencia
existía de verdad y no la veía nadie: la única forma de comprobar una consulta
de la tablet era leerla.

Ahora `packages/store/test/sql.test.ts` crea una base SQLite real con las
mismas migraciones, corre el mismo SQL y compara resultado a resultado con el
almacén en memoria, que es la implementación de referencia. También comprueba
que cada columna de índice declarada exista en su tabla: el DDL y la lista de
índices son dos textos separados que tienen que decir lo mismo.

Lo que todavía no se aplica: el esquema declara claves foráneas, pero en la
tablet nadie ejecuta `PRAGMA foreign_keys = ON`, así que no se cumplen. Las
pruebas sí las aplican —`node:sqlite` las trae encendidas— de modo que los
datos de prueba siempre tienen padre.

## Lo que todavía no hace

Medir. Todo lo que necesita el micrófono, la interfaz de audio y la consola
sigue pendiente de los spikes de fase 0. La aplicación observa, propone y
guarda; no escribe en la consola y no reproduce audio.

## Cómo se verifica

```bash
npm run build:dev -w mobile
node tools/visual/flujo.mjs
```

Deja las capturas `flujo-tablet-*` y `flujo-telefono-*` en `tools/visual/out/`, que no está versionado. Lo que hay en `docs/visual/` es una copia manual: al cambiar el recorrido hay que volver a copiarlas, o quedan describiendo pasos que ya no existen.
