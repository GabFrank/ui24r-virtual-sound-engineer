# Micrófonos: qué cambia con cada uno, y qué no

**Fase futura, anotada ahora a propósito.** El registro de micrófonos no está
construido. Esto existe porque la decisión de *dónde viven ciertos números* tiene
consecuencias hoy: cada constante global que se agregue mientras tanto es una que
después hay que mover.

## La idea, tal como se planteó

El usuario registra un micrófono. Si es el primero, el asistente tiene una batería
de pruebas: le pide que **posicione el equipo de una forma concreta**, corre las
mediciones y guarda el resultado. Para el siguiente micrófono se puede repetir
igual, o partir del anterior como punto de comparación —que es más rápido y
además es la única forma honesta de decir «este entrega 6 dB menos que aquel»—.

En el pendrive de la consola pueden vivir **archivos de referencia que definamos
nosotros**: un ruido rosa, barridos, tonos de nivel conocido. Eso quita la
interfaz externa del medio y hace la calibración repetible sin depender de qué
computadora esté conectada.

## El límite, que la interfaz tiene que decir

Sin una referencia plana o un calibrador en algún punto, lo que se mide es la
respuesta de **toda la cadena** —micrófono, parlante, sala, previo— y no la del
micrófono. Está medido: ver la curva con ruido rosa en
[SPK-P0.5](spikes/SPK-P0.5-analysis-bus.md).

Eso alcanza para **repetibilidad** —«hoy responde igual que ayer»— y para
**comparar micrófonos entre sí**. No alcanza para verdad absoluta. Una pantalla
que diga «calibrado» a secas promete algo que no tiene.

Y la aplicación **no puede detectar el cambio de micrófono**: lo declara el
usuario al elegir cuál está puesto. Ahí sí puede ofrecer correr la calibración.

## Qué números se mueven al micrófono, y cuáles no

Se revisaron las 29 constantes con unidad física del proyecto. La división no cae
donde uno esperaría, y es una buena noticia:

### Los absolutos van al micrófono

Todo lo que dice «por debajo de esto no hay señal útil» depende de qué entrega el
micrófono y con cuánta ganancia:

| Constante | Hoy | Qué es |
|---|---|---|
| `PISO_DE_RUIDO_DB` | −60 | Debajo de esto es piso de ruido, no señal |
| `PISO_PARA_SOSPECHAR_DB` | −60 | Un canal más bajo que esto no puede estar realimentando |
| `UMBRAL_SILENCIO_DB` | −50 | «No entró nada» contra «entró muy bajo» |
| `NIVEL_MINIMO_PARA_CONFIRMAR_DB` | −50 | Debajo de esto el medidor no puede confirmar una escritura |
| `PISO_UTIL_DB` | 12 | Debajo de esto, una banda del analizador no cuenta |

### Los diferenciales se quedan globales

Y acá está lo que achica el problema: **casi todo el motor de realimentación
compara una banda contra sus propias vecinas o contra su propio pasado**, no
contra un absoluto.

| Constante | Hoy | Por qué aguanta |
|---|---|---|
| `MARGEN_SOBRE_VECINAS_DB` | 9 | Compara con ±4 bandas, que es un tercio de octava. La coloración de un micrófono es suave a esa escala: sube o baja a la banda y a sus vecinas casi igual, y la diferencia se conserva |
| `MARGEN_SOSTENIDO_DB` | 6 | Compara la banda con **ella misma** unos instantes antes |
| `TOLERANCIA_CONFIRMACION_DB` | 1,5 | Compara el cambio observado con el esperado, los dos en el mismo punto |
| `TOLERANCIA_OBJETIVO_DB`, `MEJORA_MINIMA_DB`, `DELTA_MAXIMO_DB` | 2, 1, 3 | Decisiones de producto sobre cuánto mover algo |

### Y los del aparato no se mueven nunca

`RTA_DB_POR_BYTE`, `RTA_BANDAS`, el recorrido del fader, la curva de ganancia, el
reparto de bytes de `VU2`: son propiedades de la Ui24R y valen igual con
cualquier micrófono enchufado.

## La regla que queda

**Absolutos por micrófono, diferenciales globales.** Cinco constantes se mueven,
no veintinueve, y las cinco son de la misma familia —pisos—. Mientras el registro
no exista, la consecuencia práctica es una sola: **cuando se agregue un número
nuevo, preguntar si es un piso**. Si lo es, no enterrarlo como constante global,
porque va a haber que sacarlo de ahí.
