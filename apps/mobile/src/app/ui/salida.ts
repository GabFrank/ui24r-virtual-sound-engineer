import { signal, type Signal } from '@angular/core';
import type { CanDeactivateFn } from '@angular/router';

/**
 * Salir de una pantalla de edición con cambios sin guardar.
 *
 * Los formularios de esta aplicación **no guardan en cada tecla** —un nombre a
 * medio escribir no debe quedar guardado— así que salir sin tocar «Guardar»
 * pierde todo lo escrito. Antes se perdía en silencio, y no hace falta un
 * descuido para llegar ahí: el botón «Volver» y el gesto de atrás de Android
 * hacen exactamente eso.
 *
 * Se pregunta, no se impide. Alguien que abrió una banda por error tiene que
 * poder salir, y la respuesta por defecto es quedarse.
 */
export interface PuedeSalir {
  /** `true` para salir; una promesa si hay que preguntar antes. */
  puedeSalir(): boolean | Promise<boolean>;
}

export const guardaDeSalida: CanDeactivateFn<PuedeSalir> = (componente) =>
  componente.puedeSalir();

/**
 * El estado de esa pregunta.
 *
 * La promesa se resuelve cuando alguien toca un botón del diálogo. Si la
 * pantalla se destruye con la pregunta abierta —no debería, pero el router es
 * el router— `cancelar()` la resuelve como «quedarse», que es la respuesta que
 * no pierde nada. Está para llamarse desde `ngOnDestroy`; el comentario la
 * describía y la clase no la tenía, que es peor que no tener la red: se lee
 * como que el caso está cubierto.
 */
export class SalidaSinGuardar {
  private readonly _abierto = signal(false);
  private resolver: ((salir: boolean) => void) | null = null;

  readonly abierto: Signal<boolean> = this._abierto.asReadonly();

  preguntar(): Promise<boolean> {
    // Si ya había una pregunta abierta, la anterior se resuelve como quedarse
    // antes de abrir la nueva: dejar una promesa sin resolver deja al router
    // esperando para siempre.
    this.resolver?.(false);
    this._abierto.set(true);
    return new Promise<boolean>((r) => { this.resolver = r; });
  }

  /**
   * Resuelve como «quedarse» una pregunta que quedó abierta.
   *
   * Sin esto, una pantalla destruida con el diálogo abierto deja la promesa de
   * `preguntar()` sin resolver, y el router esperando para siempre.
   */
  cancelar(): void {
    if (this.resolver !== null) this.responder(false);
  }

  responder(salir: boolean): void {
    this._abierto.set(false);
    const r = this.resolver;
    this.resolver = null;
    r?.(salir);
  }
}
