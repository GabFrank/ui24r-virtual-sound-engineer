import { AlmacenEnMemoria, type Coleccion, type Documento } from '@vse/store';

/**
 * Almacén del navegador: la semántica de memoria, más persistencia.
 *
 * **No es el almacén del producto.** Existe para que la aplicación se pueda
 * recorrer entera en un navegador de escritorio: desarrollo diario y pruebas
 * del camino de usuario. En la tablet manda SQLite.
 *
 * Extiende la implementación de referencia en vez de reimplementarla, para que
 * el filtrado y el orden sean literalmente el mismo código que se prueba.
 *
 * Se eligió `localStorage` sobre IndexedDB porque es síncrono y los volúmenes
 * acá son de perfiles y sesiones, no de mediciones — las mediciones necesitan
 * hardware, y para entonces el camino es el nativo. Si algún día esto guarda
 * espectros, hay que cambiarlo.
 */
export class AlmacenEnNavegador extends AlmacenEnMemoria {
  private readonly prefijo = 'vse.almacen.';

  override get descripcion(): string { return 'navegador (localStorage)'; }

  override async abrir(): Promise<void> {
    // Se comprueba que se pueda escribir: en una ventana privada
    // `localStorage` existe pero lanza al escribir, y es mejor enterarse al
    // arrancar que al guardar la primera sesión.
    const prueba = `${this.prefijo}__prueba`;
    try {
      localStorage.setItem(prueba, '1');
      localStorage.removeItem(prueba);
    } catch {
      throw new Error('El navegador no deja guardar datos. ¿Ventana privada?');
    }
  }

  protected override leer(coleccion: Coleccion): Documento[] {
    const cacheado = this.datos.get(coleccion);
    if (cacheado !== undefined) return cacheado;
    const crudo = localStorage.getItem(this.prefijo + coleccion);
    let docs: Documento[] = [];
    if (crudo !== null) {
      try {
        const v: unknown = JSON.parse(crudo);
        if (Array.isArray(v)) docs = v as Documento[];
      } catch {
        // Un almacén corrupto no debe impedir arrancar: se descarta la
        // colección y se sigue. Perder datos de prueba en el navegador no
        // tiene consecuencias; no arrancar antes de un ensayo, sí.
      }
    }
    this.datos.set(coleccion, docs);
    return docs;
  }

  protected override escribir(coleccion: Coleccion, docs: Documento[]): void {
    this.datos.set(coleccion, docs);
    try {
      localStorage.setItem(this.prefijo + coleccion, JSON.stringify(docs));
    } catch {
      // Sin espacio o sin permiso: se conserva en memoria y la sesión sigue.
    }
  }
}
