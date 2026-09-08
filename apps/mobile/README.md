# Aplicación móvil

Angular 18 con componentes autónomos y señales, empaquetada con Capacitor 6
para Android. Es la única aplicación del repositorio.

## Comandos

```bash
npm run start      -w mobile   # servidor de desarrollo en http://localhost:4200
npm run build      -w mobile   # compilación de publicación
npm run build:dev  -w mobile   # compilación de desarrollo, con la galería de diseño
npm run lint       -w mobile   # chequeo de tipos completo + compilación
npm run sync       -w mobile   # copia el contenido web al proyecto Android
```

`npm run lint` corre `tsc --noEmit` **además** de la compilación de Angular, y
no por gusto: Angular solo compila lo que se alcanza desde el arranque, así que
un fichero que todavía nadie importa puede tener un error de tipos y pasar
inadvertido. Ya ocurrió una vez, con una llamada a `exportToJson` sobre el
objeto equivocado.

## Estructura

```
src/app/
  core/       servicios transversales: base de datos, registro, conexión, seguridad
  ui/         primitivas del sistema de diseño (ver docs/design-system.md)
  galeria/    referencia viva del sistema de diseño; el enlace del menú solo
              aparece en desarrollo, la ruta /diseno existe en las dos
  shell/      contenedor, navegación y paro de emergencia
  telemetry/  medidores en vivo
  channels/   asignación de canales
  gain/       asistente de ganancia
  updates/    actualización de la aplicación
src/styles/   fichas de diseño, base y utilidades
```

## Dos cosas que sorprenden

**Los mapas de código de scripts están apagados en desarrollo.** No es un
descuido. La aplicación importa los paquetes del espacio de trabajo por sus
fuentes en TypeScript, lo que obliga a `allowImportingTsExtensions`. Con esa
opción activada y los mapas de scripts encendidos, el compilador de Angular
falla con «File 'src/main.ts' is missing from the TypeScript compilation» y no
compila nada. Los mapas de estilos sí quedan encendidos, y el código de
desarrollo no se minimiza, así que se sigue pudiendo depurar. Está en
`angular.json`, en la configuración `development`.

**El presupuesto de estilos por componente está en 4 kB y no en 2.** Las
primitivas del sistema de diseño superan el valor por defecto, que está pensado
para detectar hojas de estilo que se van de las manos dentro de una pantalla.
Una primitiva que define cuatro variantes y su comportamiento en dos tamaños de
pantalla ocupa más, y está bien que ocupe más: es el precio de que las pantallas
que la usan casi no tengan estilos propios.
