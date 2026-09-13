# El ecualizador de `raw-map.ts` está inventado, y no es un rango flojo: es otra curva

**Encontrado el 2026-09-13**, mirando por qué el manual del fabricante contradecía
al código en el Q y en la ganancia del ecualizador. La contradicción del rango era
la punta; lo que hay abajo es peor.

## Lo que dice el código hoy

```ts
lineal('i.N.eq.b1.freq', 'Hz', 20, 20000, 'DESCONOCIDO', 'SPK-P0.2b'),
lineal('i.N.eq.b1.q',    'Q',  0.3, 10,   'DESCONOCIDO', 'SPK-P0.2b'),
lineal('i.N.eq.b1.gain', 'dB', -15, 15,   'DESCONOCIDO', 'SPK-P0.2b'),
```

`lineal` reparte el rango físico en línea recta sobre el crudo 0..1.

## Lo que dice el propio cliente de la consola

`docs/protocol-spec.md` §6.3, leído del `mixer.html`:

| Parámetro | Rango | Función |
|---|---|---|
| Frecuencia de ecualizador | 20 Hz … 22 050 Hz | **`20·1102,5^V`** |
| Q | 0,05 … 15 | **`0,05·300^V`** |

**Ninguna de las dos es lineal.** Son exponenciales, que es lo normal en audio: el
oído oye la frecuencia y el ancho de banda en proporciones, no en diferencias.

Y el manual del fabricante, que es una **tercera fuente independiente**, coincide:
Q de 0,05 a 15, ganancia de −20 a +20.

## Cuánto erraría

La tabla no es un detalle de precisión. Es la diferencia entre pedir una cosa y
que la consola haga otra:

| Q pedido | crudo que escribiría el código | Q que entiende la consola | factor |
|---|---|---|---|
| 0,5 | 0,0206 | 0,056 | **×0,11** |
| 1 | 0,0722 | 0,075 | **×0,08** |
| 2 | 0,1753 | 0,136 | **×0,07** |
| 4 | 0,3814 | 0,440 | ×0,11 |
| 7 | 0,6907 | 2,570 | ×0,37 |
| 10 | 1,0000 | 15,000 | ×1,50 |

Y la frecuencia:

| Se pide | Crudo que escribe | La consola pone |
|---|---|---|
| 100 Hz | 0,0040 | **21 Hz** |
| 1 000 Hz | 0,0490 | **28 Hz** |
| 5 000 Hz | 0,2492 | **115 Hz** |

**Pedir un corte en 1 kHz pondría un filtro en 28 Hz.** En una sala, eso no es
«un poco desafinado»: es tocar el fondo del espectro mientras uno cree estar
tocando la voz.

## Por qué esto estaba ahí

Las tres entradas están marcadas **`DESCONOCIDO`**, o sea que el archivo **dice**
que no se midieron. Y la cabecera de `RAW_MAP` promete lo contrario:

> *«Está casi vacía a propósito: llenarla con conversiones inventadas sería
> exactamente el riesgo que esta tabla existe para evitar.»*

Tres entradas más abajo, el comentario de las del compresor dice, de las que las
precedían: *«las de antes estaban inventadas. Decían −60..0, 1..20 y −80..0, a
ojo»*. O sea que **este mismo error ya se había encontrado y corregido en las
entradas de al lado, y estas tres quedaron.** Una corrección aplicada donde se
descubrió y no donde se propagó — el patrón que la auditoría robusta nombró.

## Qué hacer

1. **La frecuencia y el Q se reemplazan por las funciones del `mixer.html`**, en
   estado `INFERIDO`, como ya se hizo con las tres del compresor. Dos fuentes
   independientes —el cliente de la consola y el manual— contra un número puesto
   a ojo.
2. **La ganancia queda como está y se marca.** El manual dice ±20 y el código
   ±15, pero ahí hay **una sola** fuente contra el código y el `mixer.html` no da
   fórmula. No se cambia un número inventado por otro: se mide.
3. **Y hay que buscar si `DESCONOCIDO` está haciendo de escudo en otras entradas.**
   La marca dice «no verificado», pero el código igual convierte, y quien llame a
   `toRaw` recibe un número con la misma cara que uno medido.

## Lo que esto deja abierto

Ninguna de las dos funciones del `mixer.html` está **probada contra el aparato**:
el `protocol-spec` las da como «sin probar». Reemplazar una invención por una
lectura del cliente de la consola es mejor, pero sigue sin ser una medición. La
medición es barata —escribir un crudo, leer qué frecuencia informa la consola— y
no hace ruido.
