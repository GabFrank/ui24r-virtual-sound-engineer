import { Capacitor } from '@capacitor/core';
import { DatabaseService } from '../database.service';
import type { Almacen } from '@vse/store';
import { ALMACEN } from './almacen';
import { AlmacenEnNavegador } from './almacen-navegador';
import { AlmacenSqlite } from './almacen-sqlite';

/**
 * Elige el almacén según dónde se esté ejecutando.
 *
 * La decisión se toma acá y en un solo sitio. Que cada servicio pregunte si
 * está en Android es cómo se llega a que la mitad de la aplicación funcione en
 * el navegador y la otra mitad no.
 */
export function proveerAlmacen() {
  return {
    provide: ALMACEN,
    useFactory: (base: DatabaseService): Almacen =>
      Capacitor.isNativePlatform() ? new AlmacenSqlite(base) : new AlmacenEnNavegador(),
    deps: [DatabaseService],
  };
}
