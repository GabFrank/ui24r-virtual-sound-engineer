# Hallazgo: la guarda que ata la magnitud al crudo no podía disparar nunca

**Encontrado el 2026-09-13**, al preparar P1 —el llamador del monitor—.

## Qué estaba roto

`RAW_MAP` indexa sus entradas por **plantillas**: `i.N.eq.b1.freq`. Y `entrada()`
era un `Map.get` de la cadena cruda:

```ts
export function entrada(path: string): RawMapEntry | undefined {
  return PORPATH.get(path);
}
```

O sea que **`entrada('i.3.eq.b1.freq')` devolvía `undefined`**, y lo mismo para
los veinticuatro canales. Medido:

```
entrada('i.N.eq.b1.freq') -> PROBADO
entrada('i.3.eq.b1.freq') -> undefined
aRaw('i.3.eq.b1.freq', 1000) -> SIN_MAPEO, «no se escribe»
```

## Lo que eso dejaba abierto

**`verificarAtadura` estaba enchufada al motor y no podía disparar.** Esa función
existe para cerrar un agujero que una auditoría de seguridad había *demostrado
explotable*: una escritura de recorrido completo —crudo 0 a 1— aprobada bajo un
techo de −6 dB declarando magnitudes de −31 a −30. El motor miraba los decibeles
declarados, los encontraba razonables, y dejaba pasar el parámetro entero.

Su primer paso es `entrada(path)` con la ruta **concreta**. Con `undefined`
devuelve `SIN_LEY_VERIFICADA`, que el propio módulo documenta así:

> *«Devuelve `SIN_LEY_VERIFICADA` cuando no hay con qué contestar. **Eso no es un
> rechazo**.»*

Así que para toda ruta real el motor seguía juzgando lo que el llamador declara,
que es exactamente la situación que la guarda se escribió para terminar.

**Y las cuatro leyes del ecualizador medidas contra el filtro real no servían
para escribir nada.** `aRaw` contestaba «no se escribe» en los 24 canales.

## Por qué nadie lo vio

**Ningún llamador de producción usa `aRaw` ni `entrada`.** Los únicos usos están
en las pruebas, y las pruebas usan la **plantilla**, que sí resolvía. El módulo
se probaba contra la forma que nunca va a llegar desde el motor.

Es la forma que este proyecto ya tiene nombrada: **la capa que justifica estaba
bien y la que implementa no conectaba**. El docblock de `magnitud-atada` describe
con precisión un mecanismo que no ocurría.

## El arreglo

`canonizarRuta(ruta)` lleva la ruta concreta a su plantilla, con las mismas
reglas que `esNivelDeEnvioAMonitor` y por los mismos motivos:

- **forma canónica**: `i.03.…` no resuelve. El techo por ruta, el acumulado y las
  rutas ya tocadas se indexan por la cadena cruda, así que un alias con ceros
  sería la misma ruta que suena en la sala alcanzada por una clave que el estado
  no cuenta;
- **índice en el rango real**: `i.24.…` no resuelve, porque dar una conversión
  para un canal que la consola no tiene es escribir a ciegas;
- **falla cerrado** ante un índice de familia que nadie acotó (`a.4.mix`,
  `f.1.aux.2.value`): devuelve `undefined` en vez de adivinar;
- **todo segmento es un identificador o un número**. Sin esto `i. 3.eq.b1.freq`
  —con un espacio— se devolvía intacta: basura, pero con forma de éxito. Lo
  encontró la prueba, no yo.

`entrada()` acepta las dos formas: la plantilla es el nombre del catálogo y la
concreta es lo que llega del motor.

## Comprobado

Con el arreglo, sobre un canal real:

| caso | antes | ahora |
|---|---|---|
| crudo coherente con la magnitud | `SIN_LEY_VERIFICADA` | **ATADA** |
| crudo 1,0 declarando 1000 Hz | `SIN_LEY_VERIFICADA` | **MAGNITUD_NO_COINCIDE** |
| unidad equivocada | `SIN_LEY_VERIFICADA` | **UNIDAD_NO_COINCIDE** |
| canal inexistente (`i.99`) | `SIN_LEY_VERIFICADA` | `SIN_LEY_VERIFICADA` |

La última fila es correcta y no un resto: para una ruta que la consola no publica
no hay ley que aplicar, y el rechazo de esa escritura es de otro control.

## Lo que sigue abierto

- **La tabla sólo tiene diez plantillas, todas `i.N.*`.** El canonizador sabe de
  canales y auxiliares; las demás familias fallan cerrado hasta que alguien mida
  y acote.
- **`i.N.aux.M.value` todavía no está en la tabla**, así que las 240 rutas de
  monitor —las que la aplicación va a escribir— siguen sin atar. Es lo próximo, y
  ahora la ley está medida (ítem 104).
