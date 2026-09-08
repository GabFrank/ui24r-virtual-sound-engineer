import { computed, signal, type Signal, type WritableSignal } from '@angular/core';

/**
 * Estado «tocado» de un campo de formulario.
 *
 * Existe porque las pantallas de edición mostraban el error desde la primera
 * pulsación, y peor: un formulario recién abierto y vacío ya aparecía en rojo
 * con «El nombre no puede quedar vacío» antes de que el usuario escribiera
 * nada. La intención estaba escrita en el propio componente —«se guarda al
 * confirmar para que las validaciones no disparen mientras el usuario todavía
 * está tecleando»— y el comportamiento era el contrario.
 *
 * La regla que implementa: **un error se muestra cuando el campo se abandona,
 * o cuando se intenta guardar.** Nunca antes.
 */
export class CamposTocados {
  private readonly tocados: WritableSignal<ReadonlySet<string>> = signal(new Set());
  private readonly intentoDeGuardar = signal(false);

  /** Llamar desde `(blur)` del control. */
  marcar(campo: string): void {
    this.tocados.update((s) => new Set(s).add(campo));
  }

  /** Al intentar guardar, todos los errores pasan a ser visibles. */
  intentarGuardar(): void {
    this.intentoDeGuardar.set(true);
  }

  reiniciar(): void {
    this.tocados.set(new Set());
    this.intentoDeGuardar.set(false);
  }

  /**
   * Envuelve una señal de error para que solo se vea cuando corresponde.
   *
   * El error sigue existiendo para decidir si se puede guardar: lo que cambia
   * es únicamente si se muestra.
   */
  visible(campo: string, error: Signal<string | null>): Signal<string | null> {
    return computed(() => {
      if (!this.intentoDeGuardar() && !this.tocados().has(campo)) return null;
      return error();
    });
  }
}
