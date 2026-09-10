import { Injectable, inject } from '@angular/core';
import type { Diario, EntradaDiario, CambioRegistrado } from '@vse/safety';
import { DatabaseService } from './database.service';

/**
 * El diario de transacciones, guardado en la base de datos.
 *
 * **Por qué no alcanza con el que ya existía.** `DiarioEnMemoria` sirve para
 * los tests y para el simulador, pero un diario que se borra al cerrar la
 * aplicación no cumple lo que el diario existe para cumplir: ADR-013 pide
 * anotar **antes** de escribir para que, si la aplicación se cae con una
 * transacción a medio aplicar, al volver se sepa qué quedó tocado. Si el
 * registro vive en memoria, la caída se lleva justamente la información que
 * hacía falta.
 *
 * La tabla `transaction_journal` está en el esquema desde la primera
 * migración. Lo que faltaba era esto.
 *
 * **El detalle de los cambios va como JSON en `datos`.** El esquema tiene
 * columnas para lo que se consulta —estado, sesión, fechas— y el resto se
 * guarda entero. Es a propósito: la forma de `CambioRegistrado` la manda el
 * paquete de seguridad, y normalizarla en columnas obligaría a migrar la base
 * cada vez que ese paquete agregue un campo, para consultas que nadie hace.
 */
@Injectable({ providedIn: 'root' })
export class DiarioService implements Diario {
  private readonly db = inject(DatabaseService);

  async abrir(entrada: EntradaDiario): Promise<void> {
    await this.db.ejecutar(
      `INSERT INTO transaction_journal
         (id, session_id, state, snapshot_ref, creado_el, cerrado_el, datos)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        entrada.id, entrada.sessionId, entrada.estado, entrada.snapshotRef,
        entrada.creadoEl, entrada.cerradoEl, JSON.stringify(entrada),
      ],
    );
  }

  /**
   * Actualiza una entrada abierta.
   *
   * Se relee y se vuelve a escribir entera en vez de parchear el JSON: son
   * transacciones de a una y unos pocos cambios cada una, así que la
   * simplicidad vale más que el ahorro. Si la entrada no está, no se inventa
   * una: que falte es un defecto y esconderlo lo volvería invisible.
   */
  async actualizar(id: string, cambios: Partial<EntradaDiario>): Promise<void> {
    const previa = await this.leer(id);
    if (previa === undefined) throw new Error(`no hay entrada de diario con id ${id}`);
    const nueva: EntradaDiario = { ...previa, ...cambios };
    await this.db.ejecutar(
      `UPDATE transaction_journal
          SET state = ?, snapshot_ref = ?, cerrado_el = ?, datos = ?
        WHERE id = ?`,
      [nueva.estado, nueva.snapshotRef, nueva.cerradoEl, JSON.stringify(nueva), id],
    );
  }

  async registrarCambio(id: string, indice: number, cambio: CambioRegistrado): Promise<void> {
    const previa = await this.leer(id);
    if (previa === undefined) throw new Error(`no hay entrada de diario con id ${id}`);
    const cambios = [...previa.cambios];
    cambios[indice] = cambio;
    await this.actualizar(id, { cambios });
  }

  async leer(id: string): Promise<EntradaDiario | undefined> {
    const filas = await this.db.consultar<{ datos: string }>(
      'SELECT datos FROM transaction_journal WHERE id = ?', [id],
    );
    const fila = filas[0];
    return fila === undefined ? undefined : JSON.parse(fila.datos) as EntradaDiario;
  }

  /**
   * Las que quedaron a medio aplicar tras una caída.
   *
   * Una transacción que se abrió y nunca se cerró es exactamente eso: la
   * aplicación anotó que iba a escribir y no llegó a anotar cómo terminó. Al
   * arrancar hay que releer la consola antes de confiar en nada.
   */
  async interrumpidas(): Promise<readonly EntradaDiario[]> {
    const filas = await this.db.consultar<{ datos: string }>(
      `SELECT datos FROM transaction_journal
        WHERE cerrado_el IS NULL
        ORDER BY creado_el`,
    );
    return filas.map((f) => JSON.parse(f.datos) as EntradaDiario);
  }
}
