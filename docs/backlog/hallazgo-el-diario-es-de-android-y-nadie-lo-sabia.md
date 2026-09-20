# Hallazgo: el diario y las mediciones son de Android, así que la escritura no se puede probar sin la tablet

**Medido el 2026-09-20 contra la consola del usuario**, en la primera prueba de
campo de la rampa de monitor. Evidencia: la corrida dejó la pantalla mostrando
`la base no está abierta: llamar a abrir() primero`, y las cuatro claves de la
consola se releyeron por HTTP después y **ninguna había cambiado**.

> ## ESTE HALLAZGO ESPERA AL CAMPO
>
> Por la regla de [`2026-09-17-recapitulacion-y-hoja-de-ruta.md`](../pedidos/2026-09-17-recapitulacion-y-hoja-de-ruta.md):
> está medido, anotado y con su daño máximo. **En la tablet del usuario funciona**,
> que es donde la aplicación se usa. Entra como tarea el día que el campo lo
> traiga, o el día que costar probar la escritura pase a ser el cuello de botella.

## El dato

`DiarioService` y `MedicionesService` inyectan `DatabaseService` **directamente**,
y ése es el SQLite de Capacitor:

```
apps/mobile/src/app/core/diario.service.ts:27      private readonly db = inject(DatabaseService);
apps/mobile/src/app/core/mediciones.service.ts:34  private readonly db = inject(DatabaseService);
```

El resto de la aplicación no hace eso: pasa por el puerto `Almacen`, que
`arranque.ts` abre y que en el navegador resuelve a `AlmacenEnNavegador`. Por eso
los perfiles, la sesión y los canales **sí** funcionan en el navegador, y el
diario no: son dos caminos distintos al almacenamiento y sólo uno tiene versión
de navegador.

`AlmacenEnNavegador extends AlmacenEnMemoria` es un almacén de documentos, no un
motor de SQL, así que **no es cuestión de enchufarlo**: el diario y las
mediciones usan SQL. Arreglarlo es trabajo real sobre una pieza sensible.

## Por qué importa, que no es lo que parece

**No es un defecto de producto.** En la tablet, que es donde el usuario la usa,
funciona. El daño no está ahí.

**El daño es que la cadena que escribe en la consola no se puede ejercitar sin un
aparato Android.** Ni una prueba automática, ni el recorrido visual, ni una
prueba de campo desde esta máquina. O sea que la primera vez que la rampa escriba
de verdad va a ser con el usuario y su consola delante, sin nadie que lo haya
visto antes.

Y explica algo que el proyecto ya se venía preguntando: **por qué esta pieza
llegó tan lejos sin contacto con el campo.** No era sólo que faltara la pantalla;
es que el camino de escritura no tiene forma de correrse fuera de la tablet.

Vale igual para la pantalla de ganancia, que aplica y anota desde el 2026-09-19:
también es Android o nada.

## Daño máximo

**Ninguno para el usuario.** Falla cerrado y antes de escribir: el motor lo
rechaza, la consola no se toca. Se comprobó clave por clave.

Para el proyecto: cada cambio en el camino de escritura se entrega sin haber sido
corrido nunca de punta a punta fuera de la tablet.

## Lo que esto NO dice

- **No dice que el diario esté mal escrito.** Dice que tiene una sola
  implementación de almacenamiento.
- **No dice que la rampa esté rota.** Todo lo que se pudo ejercitar contra la
  consola del usuario funcionó: los 32 caminos leídos, la correspondencia entre
  el número que se ve y la clave que se escribe, el recuento, y el paso que pide
  lo que falta para el techo en vez de 2 dB. Lo que no se ejercitó es la
  escritura.
- **No dice cuánto costaría arreglarlo.** Nadie lo estimó.
