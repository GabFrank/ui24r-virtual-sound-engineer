import { InjectionToken } from '@angular/core';
import type { Almacen } from '@vse/store';

/**
 * Ficha de inyección del almacén.
 *
 * El puerto y su semántica viven en `@vse/store`, con tests: SQLite y el
 * navegador tienen que contestar exactamente lo mismo, y la trampa de `null`
 * es demasiado fácil de resolver distinto en cada sitio.
 *
 * Acá solo queda cómo se inyecta.
 */
export const ALMACEN = new InjectionToken<Almacen>('Almacen');
