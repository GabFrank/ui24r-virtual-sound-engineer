# Camino de usuario

Qué se puede hacer hoy con la aplicación, de principio a fin, sin hardware de
medición. Está verificado automáticamente: `tools/visual/flujo.mjs` recorre
estos veintiún pasos en dos anchos de pantalla y falla si alguno se atasca o si
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

Los dos implementan el mismo puerto, y la **semántica de las consultas vive en
`@vse/store` con tests**, no en cada implementación. La razón es concreta: en
SQL, `columna = NULL` nunca es cierto y hay que escribir `IS NULL`; en
JavaScript, `x === null` sí lo es. Como «la sesión abierta» se busca
precisamente por `cerrada_el IS NULL`, resolverlo por separado en cada sitio
habría hecho que funcionara en el navegador y fallara en la tablet.

## Lo que todavía no hace

Medir. Todo lo que necesita el micrófono, la interfaz de audio y la consola
sigue pendiente de los spikes de fase 0. La aplicación observa, propone y
guarda; no escribe en la consola y no reproduce audio.

## Cómo se verifica

```bash
npm run build:dev -w mobile
node tools/visual/flujo.mjs
```

Deja en `docs/visual/` las capturas `flujo-tablet-*` y `flujo-telefono-*`.
