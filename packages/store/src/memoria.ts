import { consultar } from './consulta.ts';
import type { Almacen, Coleccion, Documento, Filtro } from './tipos.ts';

/**
 * Almacén en memoria.
 *
 * Es la implementación de referencia de la semántica: lo que ésta contesta es
 * lo que las otras tienen que contestar. Se usa tal cual en los tests, y el
 * almacén del navegador la extiende agregándole persistencia.
 */
export class AlmacenEnMemoria implements Almacen {
  protected datos = new Map<Coleccion, Documento[]>();

  get descripcion(): string { return 'memoria'; }

  async abrir(): Promise<void> { /* nada que abrir */ }

  protected leer(coleccion: Coleccion): Documento[] {
    return this.datos.get(coleccion) ?? [];
  }

  protected escribir(coleccion: Coleccion, docs: Documento[]): void {
    this.datos.set(coleccion, docs);
  }

  async guardar(coleccion: Coleccion, doc: Documento): Promise<void> {
    const docs = [...this.leer(coleccion)];
    const i = docs.findIndex((d) => d.id === doc.id);
    if (i >= 0) docs[i] = doc; else docs.push(doc);
    this.escribir(coleccion, docs);
  }

  async obtener(coleccion: Coleccion, id: string): Promise<Documento | null> {
    return this.leer(coleccion).find((d) => d.id === id) ?? null;
  }

  async listar(coleccion: Coleccion, filtro: Filtro = {}): Promise<readonly Documento[]> {
    return consultar(this.leer(coleccion), filtro);
  }

  async borrar(coleccion: Coleccion, id: string): Promise<void> {
    this.escribir(coleccion, this.leer(coleccion).filter((d) => d.id !== id));
  }

  async exportar(): Promise<string> {
    const todo: Record<string, unknown> = {};
    for (const [coleccion, docs] of this.datos) todo[coleccion] = docs;
    return JSON.stringify({ origen: this.descripcion, colecciones: todo });
  }
}
