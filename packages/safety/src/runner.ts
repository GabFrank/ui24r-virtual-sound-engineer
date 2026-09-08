import type { MixerDomainAPI } from '@vse/mixer-adapter';
import { SafetyEngine } from './engine.ts';
import { entradaDesdeCambios, type Diario, type CambioRegistrado } from './journal.ts';
import type { CambioPropuesto, ContextoSeguridad } from './types.ts';

export interface OpcionesEjecutor {
  /** Milisegundos entre escrituras consecutivas (INV-005). */
  readonly pacingMs?: number;
  /** Espera para reintentar la lectura del valor previo. */
  readonly ahora?: () => number;
  readonly dormir?: (ms: number) => Promise<void>;
}

export type ResultadoTransaccion =
  | { readonly estado: 'RECHAZADA'; readonly motivos: readonly string[] }
  | { readonly estado: 'APLICADA'; readonly id: string }
  | { readonly estado: 'PARCIAL'; readonly id: string; readonly aplicados: number; readonly total: number; readonly motivo: string }
  | { readonly estado: 'CONFLICTO'; readonly id: string; readonly path: string; readonly motivo: string }
  | { readonly estado: 'SUSPENDIDA'; readonly id: string; readonly motivo: string };

/**
 * Ejecuta una transacción de principio a fin.
 *
 * El orden no es negociable, y cada paso existe por un caso concreto:
 *
 *  1. **Leer los valores previos de la consola.** No se calculan ni se
 *     suponen: son lo que hay que restaurar si algo sale mal (INV-002).
 *  2. **Pasar por el Safety Engine.** Si rechaza, no se escribe nada.
 *  3. **Escribir el diario antes de tocar la consola** (INV-020).
 *  4. **Escribir de a uno, con espera entre medio**, verificando cada uno
 *     antes del siguiente. Una ráfaga de escrituras sin verificar es cómo se
 *     llega a un estado que nadie sabe reconstruir.
 *  5. **Si algo falla a mitad, no se sigue.** La transacción queda parcial y
 *     el usuario ve exactamente qué se aplicó y qué no.
 */
export class EjecutorDeTransacciones {
  private readonly mixer: MixerDomainAPI;
  private readonly safety: SafetyEngine;
  private readonly diario: Diario;
  private readonly pacingMs: number;
  private readonly dormir: (ms: number) => Promise<void>;

  constructor(
    mixer: MixerDomainAPI,
    safety: SafetyEngine,
    diario: Diario,
    opciones: OpcionesEjecutor = {},
  ) {
    this.mixer = mixer;
    this.safety = safety;
    this.diario = diario;
    this.pacingMs = opciones.pacingMs ?? 100;
    this.dormir = opciones.dormir ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /**
   * Devuelve si la instantánea referenciada existe de verdad en la consola.
   *
   * Si la consulta falla —la conexión se cayó justo ahora— se responde que no
   * está verificada. Es la respuesta segura: sin poder comprobar que existe la
   * red de la que depende el retroceso, no se escribe.
   */
  private async verificarSnapshot(ref: string | null): Promise<boolean> {
    if (ref === null) return false;
    try {
      return (await this.mixer.listarSnapshots()).includes(ref);
    } catch {
      return false;
    }
  }

  async ejecutar(
    id: string,
    sessionId: string,
    razon: string,
    cambios: readonly CambioPropuesto[],
    ctx: ContextoSeguridad,
    opciones: {
      readonly conexionPermiteEscribir: boolean;
      readonly snapshotRef: string | null;
      readonly tipoDeOperacion?: string;
    },
  ): Promise<ResultadoTransaccion> {
    // INV-001: la instantánea se verifica releyendo la lista de la consola,
    // no comprobando que la referencia no sea nula. Alguien pudo borrarla
    // desde el navegador de la consola entre que se guardó y ahora, y ese es
    // exactamente el escenario que la invariante describe.
    const snapshotVerificado = await this.verificarSnapshot(opciones.snapshotRef);

    const veredicto = this.safety.evaluar(cambios, ctx, {
      conexionPermiteEscribir: opciones.conexionPermiteEscribir,
      snapshotVerificado,
      ...(opciones.tipoDeOperacion === undefined
        ? {}
        : { tipoDeOperacion: opciones.tipoDeOperacion }),
    });

    if (!veredicto.permitido) {
      return {
        estado: 'RECHAZADA',
        motivos: veredicto.rechazos.map((r) => `${r.invariante}: ${r.mensaje}`),
      };
    }

    // Los valores previos salen del estado confirmado, que se alimenta solo de
    // mensajes entrantes. Si un parámetro no está ahí, no se escribe: no
    // sabríamos a qué revertir.
    const previos = new Map<string, number>();
    for (const c of cambios) {
      const lectura = this.mixer.leer(c.path);
      if (lectura.storeState !== 'VALID' || lectura.confirmedAt === null) {
        return {
          estado: 'RECHAZADA',
          motivos: [
            `INV-002: ${c.path} no tiene valor confirmado. Sin valor previo leído de la ` +
            'consola no habría a qué revertir, así que no se escribe.',
          ],
        };
      }
      previos.set(c.path, lectura.value);
    }

    const entrada = entradaDesdeCambios(
      id, sessionId, razon, ctx.nivelAutonomia, opciones.snapshotRef, cambios, previos,
    );
    await this.diario.abrir(entrada);
    await this.diario.actualizar(id, { estado: 'APLICANDO' });

    let aplicados = 0;
    for (let i = 0; i < cambios.length; i++) {
      const c = cambios[i]!;
      if (i > 0) await this.dormir(this.pacingMs);

      const resultado = await this.mixer.escribir(c.path, c.valorPropuesto, c.valorEsperado);

      const registrado: CambioRegistrado = {
        path: c.path,
        unidad: c.unidad,
        valorPrevio: previos.get(c.path)!,
        valorEsperado: c.valorEsperado,
        valorEnviado: c.valorPropuesto,
        enviadoEl: new Date().toISOString(),
        confirmadoPor: resultado.confirmedBy,
        verificado: resultado.status === 'APPLIED',
      };
      await this.diario.registrarCambio(id, i, registrado);

      if (resultado.status === 'CONFLICT') {
        await this.diario.actualizar(id, {
          estado: 'CONFLICTO',
          cerradoEl: new Date().toISOString(),
        });
        return {
          estado: 'CONFLICTO',
          id,
          path: c.path,
          motivo: resultado.motivo ?? 'el valor actual no es el esperado',
        };
      }

      if (resultado.status !== 'APPLIED') {
        await this.diario.actualizar(id, {
          estado: 'PARCIAL',
          cerradoEl: new Date().toISOString(),
        });
        return {
          estado: 'PARCIAL',
          id,
          aplicados,
          total: cambios.length,
          motivo: resultado.motivo ?? `escritura en estado ${resultado.status}`,
        };
      }

      aplicados++;
    }

    await this.diario.actualizar(id, {
      estado: 'APLICADA',
      cerradoEl: new Date().toISOString(),
    });
    return { estado: 'APLICADA', id };
  }

  /**
   * Revierte una transacción, cambio por cambio y en orden inverso.
   *
   * Restaura el valor previo **leído de la consola**, no el calculado, y lo
   * verifica por lectura (INV-002). Va en orden inverso porque si dos cambios
   * de la misma transacción se afectan entre sí, deshacerlos en el mismo orden
   * en que se hicieron puede dejar un estado intermedio distinto del original.
   */
  async revertir(id: string): Promise<{ revertidos: number; fallidos: readonly string[] }> {
    const entrada = await this.diario.leer(id);
    if (!entrada) throw new Error(`transacción desconocida: ${id}`);

    const fallidos: string[] = [];
    let revertidos = 0;

    const aplicados = entrada.cambios.filter((c) => c.enviadoEl !== null).reverse();
    for (const c of aplicados) {
      const r = await this.mixer.escribir(c.path, c.valorPrevio, c.valorEnviado);
      if (r.status === 'APPLIED') revertidos++;
      else fallidos.push(`${c.path}: ${r.motivo ?? r.status}`);
    }

    await this.diario.actualizar(id, {
      estado: fallidos.length === 0 ? 'REVERTIDA' : 'PARCIAL',
      cerradoEl: new Date().toISOString(),
    });
    return { revertidos, fallidos };
  }

  /**
   * Al arrancar la aplicación: qué quedó a medio aplicar.
   *
   * **No reaplica nada.** Devuelve la diferencia entre lo que el diario dice
   * que se envió y lo que la consola tiene ahora, para que decida una persona.
   */
  async recuperarTrasCaida(): Promise<readonly {
    id: string;
    razon: string;
    diferencias: readonly { path: string; enviado: number; enConsola: number | null; previo: number }[];
  }[]> {
    const interrumpidas = await this.diario.interrumpidas();
    return interrumpidas.map((e) => ({
      id: e.id,
      razon: e.razon,
      diferencias: e.cambios
        .filter((c) => c.enviadoEl !== null)
        .map((c) => {
          const lectura = this.mixer.leer(c.path);
          return {
            path: c.path,
            enviado: c.valorEnviado,
            enConsola: lectura.confirmedAt === null ? null : lectura.value,
            previo: c.valorPrevio,
          };
        }),
    }));
  }

  /** Una avalancha externa invalida la base de toda transacción abierta (INV-021). */
  async suspenderPorCambioMasivo(motivo: string): Promise<readonly string[]> {
    const abiertas = await this.diario.interrumpidas();
    for (const e of abiertas) {
      await this.diario.actualizar(e.id, { estado: 'SUSPENDIDA' });
    }
    return abiertas.map((e) => e.id);
  }
}
