# Cómo se hizo esta captura, y cómo se repite

Dos programas, separados a propósito: el que **toca la consola una sola vez** y
el que **procesa la evidencia** cuantas veces haga falta sin tocar nada.

## Ejecutar

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"

# 1. Recolecta. Es lo único que abre una conexión.
node tools/inventario/recolector.mjs <ip> <segundos> <carpetaSalida> <carpetaPrivada>

# 2. Construye los entregables desde `_datos.json`. No toca la consola.
node tools/inventario/entregables.mjs <carpetaSalida> <carpetaPrivada>

# 3. Compara contra el inventario estático de 3.5, si se tiene.
node tools/inventario/comparar-35.mjs <carpetaSalida> <ruta-al-md-de-3.5>
```

Dependencias: `acorn` (para el AST) y `@vse/mixer-adapter` (para el transporte
socket.io 0.9). Las dos ya están en el repositorio. `curl` para el HTTP, porque
`fetch` se cuelga con `/raw`: ese recurso es un flujo que no cierra nunca.

## Qué emite el recolector, dicho por adelantado

| | |
|---|---|
| `GET /socket.io/1/` | El apretón de manos. El identificador de sesión es de un solo uso |
| `ALIVE` | Uno por segundo. Es el latido que el protocolo exige: sin él la consola se calla |
| Escrituras de parámetro | **ninguna** |
| `INIT` enviado | **ninguno** |

## Cómo se retira el observador

El recolector **cierra su propia conexión al terminar** (`t.desconectar()`), y no
toca ninguna conexión ajena: no se engancha a la sesión de un navegador, no
reemplaza `receiveMessage` ni ningún setter, y no modifica el prototipo global de
`WebSocket`. Si se interrumpe a mitad, el socket muere con el proceso.

Para comprobar que no quedó nada: la consola no publica presencia —está medido—
así que la forma de verificarlo es que el proceso terminó.

## Dónde quedan los originales

Fuera del repositorio, en la carpeta privada que se pase como cuarto argumento:

- `initparams.original.js` — trae `netConfig` y el identificador de la unidad
- `raw.original.txt` — el volcado completo con **valores**

Sus SHA-256 están en `capture-metadata.json`. **Nada de eso se comparte.** La
entrega de esta carpeta lleva nombres, tipos y procedencia; ningún valor.

## Por qué una conexión propia y no la sesión del navegador

El encargo prefiere observar una sesión oficial existente. No la hay en esta
máquina: la consola se opera desde una tablet y desde su propia pantalla. Abrir
una conexión de sólo escucha fue la única forma de ver el canal de control, y
queda declarado como tal en la metadata y en el inventario.
