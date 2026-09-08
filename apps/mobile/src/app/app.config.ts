import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding, withHashLocation } from '@angular/router';
import { RUTAS } from './app.routes';
import { proveerAlmacen } from './core/almacen/almacen.provider';
import { proveerArranque } from './core/arranque';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(
      RUTAS,
      // Rutas por fragmento y no por historial: la aplicación se sirve desde
      // el sistema de ficheros dentro de Capacitor, donde no hay servidor que
      // reescriba las rutas. Sin esto, recargar en /historial da un 404.
      withHashLocation(),
      // Los parámetros de la ruta llegan como `input()` al componente, sin
      // tener que inyectar ActivatedRoute y suscribirse en cada pantalla.
      withComponentInputBinding(),
    ),
    proveerAlmacen(),
    proveerArranque(),
  ],
};
