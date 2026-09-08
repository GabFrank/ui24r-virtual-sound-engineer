import { Injectable, signal, computed } from '@angular/core';
import {
  PERFILES_DE_CANAL, perfilPorTipo, ui24rInput, makeId,
  type ChannelAssignment, type ChannelProfileType, type MusicalRole,
} from '@vse/domain';
import type { ChannelAssignmentId, BandMemberId } from '@vse/domain';

/**
 * Asignación de canales: qué entrada de la consola es qué instrumento.
 *
 * Sin esto no se puede persistir nada de lo demás. El plan original tenía
 * tipos de canal, perfiles y roles sueltos, pero nada que los uniera con la
 * entrada real de la mesa.
 */
@Injectable({ providedIn: 'root' })
export class BandService {
  readonly perfiles = PERFILES_DE_CANAL;

  private readonly _asignaciones = signal<readonly ChannelAssignment[]>([]);
  readonly asignaciones = this._asignaciones.asReadonly();

  readonly asignados = computed(() => this._asignaciones().length);

  /** Canales marcados como fuente en vivo durante el show. */
  readonly enVivo = computed(() => this._asignaciones().filter((a) => a.isLive));

  asignacionDe(indice: number): ChannelAssignment | undefined {
    return this._asignaciones().find((a) => a.ui24rInputIndex === indice);
  }

  asignar(
    indice: number,
    datos: {
      instrumento: string;
      tipo: ChannelProfileType;
      nombreEnConsola: string;
      isLive: boolean;
      bandMemberId?: BandMemberId | null;
      micModelo?: string | null;
      rol?: MusicalRole;
    },
  ): ChannelAssignment {
    const perfil = perfilPorTipo(datos.tipo);
    const previa = this.asignacionDe(indice);

    const asignacion: ChannelAssignment = {
      id: previa?.id ?? makeId<'ChannelAssignmentId'>('ch') as ChannelAssignmentId,
      ui24rInputIndex: ui24rInput(indice),
      bandMemberId: datos.bandMemberId ?? null,
      instrumento: datos.instrumento,
      channelProfileId: perfil.id,
      defaultRole: datos.rol ?? perfil.defaultRole,
      micModelo: datos.micModelo ?? null,
      nombreEnConsola: datos.nombreEnConsola,
      isLive: datos.isLive,
    };

    this._asignaciones.update((prev) => {
      const resto = prev.filter((a) => a.ui24rInputIndex !== indice);
      return [...resto, asignacion].sort((a, b) => a.ui24rInputIndex - b.ui24rInputIndex);
    });

    return asignacion;
  }

  quitar(indice: number): void {
    this._asignaciones.update((prev) => prev.filter((a) => a.ui24rInputIndex !== indice));
  }

  perfilDe(asignacion: ChannelAssignment) {
    return this.perfiles.find((p) => p.id === asignacion.channelProfileId)!;
  }

  /**
   * Propone una asignación a partir del nombre que ya tiene el canal en la
   * consola. Ahorra la mayor parte del trabajo cuando el usuario ya nombró sus
   * canales, que es lo habitual.
   */
  sugerirTipo(nombreEnConsola: string): ChannelProfileType {
    const n = nombreEnConsola.toUpperCase();
    const reglas: readonly [RegExp, ChannelProfileType][] = [
      [/VOZ PRINCIPAL|LEAD|VOCAL PPAL/, 'LEAD_VOCAL'],
      [/CORO|BACKING|VOZ \d/, 'BACKING_VOCAL'],
      [/GUIT.*AC|ACUSTICA/, 'ACOUSTIC_GUITAR'],
      [/GUIT/, 'ELECTRIC_GUITAR'],
      [/BAJO|BASS/, 'BASS'],
      [/CAJON/, 'CAJON'],
      [/CONGA|BONGO|TUMBA/, 'CONGA'],
      [/SHAKER|PANDER|GUIRO/, 'SHAKER'],
      [/FLAUTA|FLUTE/, 'FLUTE'],
      [/TECLA|KEY|PIANO/, 'KEYBOARD'],
      [/PLAYBACK|PISTA|TRACK/, 'PLAYBACK'],
      [/CHARLA|SPEECH|LOCUTOR/, 'SPEECH'],
    ];
    for (const [re, tipo] of reglas) if (re.test(n)) return tipo;
    return 'CUSTOM';
  }
}
