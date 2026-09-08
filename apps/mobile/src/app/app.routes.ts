import type { Routes } from '@angular/router';
import { guardaDeSalida } from './ui';

/**
 * Rutas.
 *
 * Se usa el enrutador y no un conmutador de pestañas por señal, que es lo que
 * había, por tres motivos concretos: el botón de atrás del sistema tiene que
 * funcionar —en Android es un gesto, no un botón, y se usa sin pensar—; una
 * pantalla de edición necesita poder recibir el identificador de lo que edita;
 * y al reanudar la aplicación conviene volver donde estaba.
 *
 * Todo se carga de forma diferida salvo el arranque. No por el peso —la
 * aplicación entera pesa poco— sino porque así la pantalla inicial aparece sin
 * esperar a compilar plantillas que quizá no se usen en toda la sesión.
 */
export const RUTAS: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'sesion' },

  {
    path: 'sesion',
    title: 'Sesión',
    loadComponent: () => import('./sesion/sesion.component').then((m) => m.SesionComponent),
  },
  {
    path: 'sesion/canales',
    title: 'Canales',
    loadComponent: () => import('./channels/channels.component').then((m) => m.ChannelsComponent),
  },
  {
    path: 'sesion/ganancia',
    title: 'Ganancia',
    loadComponent: () => import('./gain/gain.component').then((m) => m.GainComponent),
  },

  {
    path: 'consola',
    title: 'Consola',
    loadComponent: () => import('./telemetry/telemetry.component').then((m) => m.TelemetryComponent),
  },

  {
    path: 'perfiles',
    title: 'Perfiles',
    loadComponent: () => import('./perfiles/perfiles.component').then((m) => m.PerfilesComponent),
  },
  {
    path: 'perfiles/bandas/:id',
    title: 'Banda',
    loadComponent: () => import('./perfiles/banda-edit.component').then((m) => m.BandaEditComponent),
    canDeactivate: [guardaDeSalida],
  },
  {
    path: 'perfiles/locales/:id',
    title: 'Local',
    loadComponent: () => import('./perfiles/local-edit.component').then((m) => m.LocalEditComponent),
    canDeactivate: [guardaDeSalida],
  },
  {
    path: 'perfiles/pa/:id',
    title: 'Sistema de amplificación',
    loadComponent: () => import('./perfiles/pa-edit.component').then((m) => m.PaEditComponent),
    canDeactivate: [guardaDeSalida],
  },

  {
    path: 'historial',
    title: 'Historial',
    loadComponent: () => import('./historial/historial.component').then((m) => m.HistorialComponent),
  },
  {
    path: 'historial/:id',
    title: 'Sesión',
    loadComponent: () => import('./historial/sesion-detalle.component').then((m) => m.SesionDetalleComponent),
  },

  {
    path: 'ajustes',
    title: 'Ajustes',
    loadComponent: () => import('./ajustes/ajustes.component').then((m) => m.AjustesComponent),
  },
  {
    path: 'ajustes/actualizacion',
    title: 'Actualización',
    loadComponent: () => import('./updates/updates.component').then((m) => m.UpdatesComponent),
  },
  {
    path: 'ajustes/diagnostico',
    title: 'Prueba de conexión',
    loadComponent: () => import('./diagnostico/diagnostico.component').then((m) => m.DiagnosticoComponent),
  },

  {
    path: 'diseno',
    title: 'Sistema de diseño',
    loadComponent: () => import('./galeria/galeria.component').then((m) => m.GaleriaComponent),
  },

  // Cualquier otra cosa vuelve al inicio. Una pantalla de «no encontrado» en
  // una aplicación sin enlaces externos solo serviría para dejar al usuario
  // parado en un sitio del que no sabe salir.
  { path: '**', redirectTo: 'sesion' },
];
