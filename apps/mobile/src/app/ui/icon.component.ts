import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Iconografía.
 *
 * Los trazados están acá dentro y no en una tipografía de iconos ni en
 * ficheros sueltos, por una razón concreta: la aplicación tiene que arrancar
 * sin red y sin que falte nada. Una tipografía de iconos que no carga deja
 * cuadrados vacíos donde debería estar el paro de emergencia.
 *
 * Todos comparten caja de 24 y trazo de 1,75: a un metro de distancia, un
 * trazo más fino desaparece.
 */
export type NombreDeIcono =
  | 'atras' | 'adelante' | 'cerrar' | 'mas' | 'menos' | 'chequeo' | 'aviso'
  | 'error' | 'info' | 'buscar' | 'ajustes' | 'medidor' | 'canales'
  | 'ganancia' | 'sesion' | 'banda' | 'local' | 'historial' | 'descargar'
  | 'refrescar' | 'paro' | 'conectar' | 'editar' | 'borrar' | 'guardar'
  | 'menu' | 'expandir' | 'contraer';

const TRAZOS: Readonly<Record<NombreDeIcono, string>> = {
  atras: 'M15 6l-6 6 6 6',
  adelante: 'M9 6l6 6-6 6',
  cerrar: 'M6 6l12 12M18 6L6 18',
  mas: 'M12 5v14M5 12h14',
  menos: 'M5 12h14',
  chequeo: 'M4 12.5l5 5L20 6.5',
  aviso: 'M12 3.5L1.7 21h20.6zM12 9.5v5M12 17.6v.1',
  error: 'M12 3a9 9 0 100 18 9 9 0 000-18M12 7.5v6M12 16.4v.1',
  info: 'M12 3a9 9 0 100 18 9 9 0 000-18M12 11v5.5M12 7.6v.1',
  buscar: 'M10.5 3a7.5 7.5 0 100 15 7.5 7.5 0 000-15M21 21l-5.2-5.2',
  ajustes: 'M12 8.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2v.2a2 2 0 11-4 0v-.1a1.7 1.7 0 00-3-1.2l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00-1.2-2.9H3a2 2 0 010-4h.1a1.7 1.7 0 001.2-3l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 002.9-1.2V3a2 2 0 014 0v.1a1.7 1.7 0 003 1.2l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 001.2 2.9h.2a2 2 0 010 4h-.1a1.7 1.7 0 00-1.6 1z',
  medidor: 'M4 20V10M9 20V4M14 20v-7M19 20v-4',
  canales: 'M4 6h16M4 12h16M4 18h16M8 4v4M15 10v4M11 16v4',
  ganancia: 'M3 17l5-5 4 3 8-8M21 7h-5M21 7v5',
  sesion: 'M12 3a9 9 0 100 18 9 9 0 000-18M12 7v5l3.5 2',
  banda: 'M9 18V6l11-2v12M9 18a3 3 0 11-6 0 3 3 0 016 0M20 16a3 3 0 11-6 0 3 3 0 016 0',
  local: 'M3 21V9l9-6 9 6v12M9 21v-7h6v7',
  historial: 'M3 3v6h6M3.5 13a9 9 0 102.6-6.4L3 9M12 7.5V12l3.5 2',
  descargar: 'M12 3v12M7.5 10.5L12 15l4.5-4.5M4 20h16',
  refrescar: 'M20.5 11a8.5 8.5 0 10-1.6 6M20.5 5v6h-6',
  paro: 'M12 3a9 9 0 100 18 9 9 0 000-18M8.5 8.5h7v7h-7z',
  conectar: 'M9 17H6.5a4.5 4.5 0 010-9H9M15 7h2.5a4.5 4.5 0 010 9H15M8 12h8',
  editar: 'M4 20h4L19 9a2.8 2.8 0 10-4-4L4 16v4M14.5 5.5l4 4',
  borrar: 'M4 7h16M9 7V4.5h6V7M6 7l1 13h10l1-13M10 11v5M14 11v5',
  guardar: 'M5 4h11l3 3v13H5zM8 4v6h7V4M8 20v-6h8v6',
  menu: 'M4 7h16M4 12h16M4 17h16',
  expandir: 'M6 9.5l6 6 6-6',
  contraer: 'M6 14.5l6-6 6 6',
};

@Component({
  selector: 'ui-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 24 24" [attr.width]="tamanio()" [attr.height]="tamanio()"
         fill="none" stroke="currentColor" stroke-width="1.75"
         stroke-linecap="round" stroke-linejoin="round"
         aria-hidden="true" focusable="false">
      <path [attr.d]="trazo()" />
    </svg>
  `,
  styles: [`
    :host { display: inline-flex; flex: none; }
    svg { display: block; }
  `],
})
export class IconComponent {
  readonly nombre = input.required<NombreDeIcono>();
  readonly tamanio = input(20);

  /**
   * `computed` y no un método: una función llamada desde la plantilla se
   * reevalúa en cada ciclo de detección de cambios, y estos iconos están en
   * toda la interfaz.
   */
  protected readonly trazo = computed(() => TRAZOS[this.nombre()]);
}
