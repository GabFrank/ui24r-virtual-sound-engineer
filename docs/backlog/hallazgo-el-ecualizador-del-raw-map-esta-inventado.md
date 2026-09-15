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

## Primero, cuánto NO erraría hoy

**La vía de escritura está cerrada, y este documento decía lo contrario.** Su
primera versión afirmaba que pedir un corte en 1 kHz pondría un filtro en 28 Hz.
Es falso hoy, y hay que decirlo antes que nada:

- `aRaw()` **rechaza toda entrada que no esté en `PROBADO`**, y las tres del
  ecualizador están en `DESCONOCIDO`. Devuelve `NO_PROBADO` y no convierte.
- `rutasProbadas()` devuelve **la lista vacía**: hoy no hay **ninguna** ruta
  escribible por vía cruda, y un test lo fija.
- Y `RAW_MAP` **no la consume nadie** todavía fuera de sus propios tests.

O sea que el riesgo en producción es **cero hoy**. Lo que sigue es un defecto
latente, y vale igual — pero por otro motivo que el que este documento decía.

## Cuánto erraría el día que se habilite

El peligro no es la escritura de hoy: es **el día que alguien mida el ecualizador
y ponga la entrada en `PROBADO`**. La forma natural de «verificar un rango» es
comprobar los extremos, y los extremos **no delatan la curva**: una recta y una
exponencial que comparten los dos extremos se separan brutalmente en el medio.

Con los rangos puestos a ojo, ni siquiera los extremos coinciden:

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

Pedir un corte en 1 kHz aterrizaría en **28 Hz**. En una sala eso no es «un poco
desafinado»: es tocar el fondo del espectro creyendo que se toca la voz. **Esto
no puede pasar hoy** —`aRaw` lo frena— y por eso el arreglo es barato ahora y
caro después.

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
   a ojo. El estado no cambia lo que se puede escribir —`INFERIDO` tampoco
   escribe— pero **cambia lo que la tabla dice de sí misma**, y el día que alguien
   mida va a estar mirando la curva correcta en vez de una recta.
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


---

# Hecho el 2026-09-13, y lo que apareció al hacerlo

**La frecuencia y el Q ahora usan las funciones del `mixer.html`**, en `INFERIDO`,
por `deLaConsola()` — el mismo ayudante que ya existía para las tres del
compresor. La ganancia y el pasa-altos quedaron como estaban, por lo dicho arriba:
una sola fuente contra el código no alcanza para cambiar un número.

**Y el arreglo lleva una guarda que mira el medio de la curva**, no los extremos.
Comprobado revirtiendo la entrada a propósito a una recta **con los mismos
extremos**: el test falla. Un test que nunca se vio fallar no es un control.

## Lo que apareció: `INFERIDO` estaba tapando algo peor que `DESCONOCIDO`

El tercer punto del plan era mirar si `DESCONOCIDO` hacía de escudo en otras
entradas. La respuesta es **no** — pero `INFERIDO` sí, y peor.

`i.N.dyn.threshold` figuraba como **`INFERIDO`**, o sea «leída del cliente, nadie
la comprobó». Es falso desde el 2026-09-12: **la medición 97 la midió contra el
aparato y la tumbó.** Y el `protocol-spec` §6.3 hizo exactamente esta distinción
ese mismo día:

> *«"No probado" y "refutado" no son lo mismo, y este encabezado los confundía.
> Un lector que ve "no probado" supone que la fórmula es lo mejor que hay; con
> "refutado" sabe que usarla es peor que no tener nada.»*

**Esa corrección se aplicó en el `protocol-spec` y no en `raw-map.ts`.** Es el
patrón que la auditoría robusta ya había nombrado: *una corrección se aplica donde
se descubre, no donde se propagó.* Van tres veces.

Y la causa raíz no era el descuido: **el tipo no tenía cómo decirlo.** El estado
sólo admitía `PROBADO | INFERIDO | DESCONOCIDO`, así que no había manera de
escribir «se midió y falló» aunque alguien quisiera.

### Qué se hizo

- **`REFUTADO` entra al tipo**, con la diferencia escrita en el propio campo.
- `i.N.dyn.threshold` queda marcado, con el rango declarado por lo que es: **la
  fórmula refutada evaluada en 0 y en 1**, no un rango medido.
- **`aRaw` distingue los dos casos, porque el consejo es opuesto.** Con
  `NO_PROBADO` la salida razonable es proponer el valor absoluto para aplicarlo a
  mano. Con `REFUTADO` no se propone nada: el número tendría cara de medido y se
  sabe incorrecto.
- **La puerta comparte la función refutada** —`i.N.gate.thresh` usa la misma
  recta `96a − 90`— y eso queda escrito **sin** declararla refutada: la 97 midió
  el compresor, no la puerta, y decir más sería afirmar lo que no se midió.

## Lo que sigue abierto

- **Ninguna de las dos curvas del ecualizador está medida.** `INFERIDO` es mejor
  que una invención, no es evidencia. La medición es barata y no hace ruido:
  escribir un crudo y leer qué informa la consola.
- **La ganancia del ecualizador**: manual ±20, código ±15, sin fórmula del
  cliente. Una sola fuente contra el código. Se mide.
- **El pasa-altos** sigue como recta de 20 a 400 Hz, que es un marcador de sitio.
  Casi seguro es exponencial como las otras dos, y eso es una sospecha, no un dato.
- **Y la puerta**, que se apoya en la recta que falló al lado.
