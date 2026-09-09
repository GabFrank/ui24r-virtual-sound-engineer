# Política de confirmación de escrituras

**Incompleto a propósito.** Este documento es el resultado de SPK-ACK-POLICY. Ya no está vacío
—el mecanismo está elegido y medido— pero todavía no es una política: falta la tabla parámetro a
método y el texto normativo de INV-011.

## Lo que ya está decidido

El protocolo no tiene confirmación explícita de escritura, y **la consola tampoco devuelve eco**:
está medido, no supuesto. Escribe, aplica, y le manda el cambio a todos los clientes **menos al
que lo originó**.

**El mecanismo de confirmación es una segunda conexión testigo**, elegida el 2026-09-09 y medida
contra la consola:

| | |
|---|---|
| Dos conexiones del mismo proceso, ¿son dos clientes para la consola? | **Sí** |
| ¿En cuánto ve el testigo una escritura hecha por la principal? | **27 ms** |
| Con tres clientes, ¿cuántas veces llega la difusión? | **una a cada uno menos al origen**: 0 líneas el que escribe, 1 cada uno de los otros dos |

Se eligió sobre las alternativas porque los medidores solo confirman fader, silencio y ganancia
—y solo con señal presente—, y porque confirmar por `INIT` cuesta el volcado entero por cada
escritura, lo que no sobrevive a una transacción de varias escrituras secuenciales.

**Lo que cuesta:** el testigo es una conexión de verdad, así que **recibe el volcado completo al
conectar y después los flujos de medidores**, igual que la conexión principal. El protocolo no
tiene suscripción selectiva; lo que se puede es descartar temprano en el cliente. Y suma una
instancia más que la detección de presencia de INV-032 tiene que poder distinguir de un segundo
operador real.

**Lo que el testigo no puede quitar:** los mensajes de la consola no identifican al emisor, así
que el testigo confirma que **la consola difundió esa ruta con ese valor**, no que la línea sea
nuestra. Es la ambigüedad que ADR-005 ya asume, reducida a milisegundos pero no eliminada. El
texto de INV-011 tiene que decirlo en vez de prometer certeza.

El razonamiento completo, con las cuatro opciones y por qué cayeron tres, está en
[SPK-ACK-POLICY](spikes/SPK-ACK-POLICY.md). La ADR que lo fija está en redacción por separado y,
cuando exista, manda sobre este documento.

## Qué falta

- **La tabla de parámetro a método de confirmación**, fila por fila de la matriz de capacidades.
  El testigo cubre todo lo que la consola difunda, pero eso está comprobado en cuatro rutas, no
  en la matriz entera.
- **El texto normativo definitivo de INV-011**, que además tiene que decir qué pasa cuando el
  testigo se cae en medio de una transacción: es un modo de fallo que las otras opciones no
  tenían.

## Regla provisional

Hasta que las dos cosas de arriba existan, **ninguna historia con capacidad de escritura se
implementa**. Elegir el mecanismo no habilita a escribir: habilita a escribir la política.
