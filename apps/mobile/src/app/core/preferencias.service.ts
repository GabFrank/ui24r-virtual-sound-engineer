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
 * **Es la máquina, ya no una URL.** La ruta del WebSocket lleva dentro un
 * identificador de sesión que se agota al usarlo, así que no hay dirección
 * completa que se pueda guardar. El campo sigue aceptando una `ws://` para
 * apuntar al simulador, que sí la tiene estable.
 */
export const HOST_POR_DEFECTO = '10.10.1.1';

/**
 * Pasa una preferencia vieja al formato nuevo.
 *
 * Quien ya tenía la aplicación guardó `ws://10.10.1.1`, que con el formato
 * nuevo se leería como «simulador» y abriría el transporte equivocado contra
 * una consola real. Se le quita el esquema.
 *
 * **Solo a las direcciones sin puerto.** El simulador se levanta en un puerto
 * —`ws://localhost:8765`— y esas se dejan como están, que es justamente lo que
 * distingue un caso del otro.
 */
export function migrarHost(guardado: string): string {
  const m = /^wss?:\/\/([^/:]+)$/.exec(guardado.trim());
  return m ? m[1]! : guardado;
}

@Injectable({ providedIn: 'root' })
export class Preferencias {
  private leer(clave: string): string | null {
    try { return localStorage.getItem(clave); } catch { return null; }
  }
  private escribir(clave: string, valor: string): void {
    try { localStorage.setItem(clave, valor); } catch { /* sin persistencia, se sigue */ }
  }

  private readonly _host = signal(migrarHost(this.leer(CLAVE_HOST) ?? HOST_POR_DEFECTO));
  readonly host = this._host.asReadonly();

  /**
   * Conectar sola al abrir, contra la última dirección guardada.
   *
   * **Encendida salvo que alguien la apague**, y por eso se compara contra
   * `'no'` y no contra `'si'`: quien abre esta aplicación en un ensayo la abre
   * para ver la consola, y hacerle tocar «Conectar» cada vez es una ceremonia
   * sin sentido tres minutos antes de empezar. Apagarla tiene sentido cuando
   * se trabaja sin consola a mano: el intento falla igual, pero deja un error
   * en pantalla que no viene a cuento.
   */
  private readonly _autoconectar = signal(this.leer(CLAVE_AUTOCONECTAR) !== 'no');
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
