import { Injectable, signal } from '@angular/core';

/**
 * Preferencias del dispositivo.
 *
 * Van a `localStorage` y no a la base: son de esta tablet, no de la banda. Si
 * se sincronizaran, cambiar la dirección de la consola en un ensayo cambiaría
 * la de todos los dispositivos, que es lo contrario de lo que hace falta.
 *
 * Cada lectura y cada escritura va protegida: en una ventana privada
 * `localStorage` existe pero lanza al escribir, y una preferencia que no se
 * puede guardar no debe impedir usar la aplicación.
 */

const CLAVE_HOST = 'vse.pref.host';
const CLAVE_AUTOCONECTAR = 'vse.pref.autoconectar';

/**
 * Dirección por defecto de la consola.
 *
 * La Ui24R levanta su propia red y se presenta en 10.10.1.1 cuando se usa como
 * punto de acceso, que es como se usa en un escenario sin red fija.
 *
 * Se guarda la dirección completa del WebSocket y no solo la máquina porque la
 * ruta exacta del protocolo todavía no está confirmada: depende del spike
 * SPK-P0.1. Mientras tanto, el mismo campo sirve para apuntar al simulador.
 */
export const HOST_POR_DEFECTO = 'ws://10.10.1.1';

@Injectable({ providedIn: 'root' })
export class Preferencias {
  private leer(clave: string): string | null {
    try { return localStorage.getItem(clave); } catch { return null; }
  }
  private escribir(clave: string, valor: string): void {
    try { localStorage.setItem(clave, valor); } catch { /* sin persistencia, se sigue */ }
  }

  private readonly _host = signal(this.leer(CLAVE_HOST) ?? HOST_POR_DEFECTO);
  readonly host = this._host.asReadonly();

  private readonly _autoconectar = signal(this.leer(CLAVE_AUTOCONECTAR) === 'si');
  readonly autoconectar = this._autoconectar.asReadonly();

  fijarHost(v: string): void {
    const limpio = v.trim();
    this._host.set(limpio);
    this.escribir(CLAVE_HOST, limpio);
  }

  fijarAutoconectar(v: boolean): void {
    this._autoconectar.set(v);
    this.escribir(CLAVE_AUTOCONECTAR, v ? 'si' : 'no');
  }
}
