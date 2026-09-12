import {
  ownership, esEscribible, verificarLimite,
  maximoDeParametros, Q_MINIMO_SALIDA, REALCE_MAXIMO_SALA_DB,
} from '@vse/domain';
import { ecualizacionPermitida, admiteFactorDeCalidad } from '@vse/domain';
import { clasificarRuta } from '@vse/mixer-adapter';
import type { ParameterKind } from '@vse/domain';
import type { CambioPropuesto, ContextoSeguridad, Rechazo, Veredicto } from './types.ts';

/**
 * Safety Engine.
 *
 * Tiene autoridad sobre cualquier asistente: puede rechazar cualquier cambio,
 * y ningún asistente puede saltárselo. La razón no es jerárquica sino
 * práctica: los asistentes razonan sobre sonido, y el sonido a veces sugiere
 * mover algo que en ese momento no se debe tocar. Alguien tiene que saber que
 * el show ya empezó, que la ganancia quedó congelada al grabar, o que ese
 * auxiliar es el monitor del cantante.
 *
 * Cada regla cita la invariante que la origina, y ese identificador viaja
 * hasta el registro y hasta el mensaje que ve el usuario: cuando algo se
 * rechaza, se puede saber exactamente por qué y buscarlo en la documentación.
 */
export class SafetyEngine {
  private bloqueado = false;

  /** Escrituras que pasan incluso con el paro de emergencia activo (INV-019). */
  private static readonly LISTA_BLANCA: ReadonlySet<string> = new Set([
    'MEDIA_STOP', 'MTK_STOP', 'MUTE_PLAYER', 'ROLLBACK',
    'RESTAURAR_RESERVA', 'RESTAURAR_MUTES',
  ]);

  bloquear(): void { this.bloqueado = true; }
  desbloquear(): void { this.bloqueado = false; }
  get estaBloqueado(): boolean { return this.bloqueado; }

  esDeSeguridad(tipo: string): boolean {
    return SafetyEngine.LISTA_BLANCA.has(tipo);
  }

  /**
   * Evalúa una transacción completa.
   *
   * Devuelve **todos** los motivos de rechazo, no el primero. Si una
   * transacción viola tres reglas, quien la propuso necesita ver las tres:
   * arreglar una y volver a chocar con la siguiente es una forma lenta y
   * frustrante de descubrir lo mismo.
   */
  evaluar(
    cambios: readonly CambioPropuesto[],
    ctx: ContextoSeguridad,
    opciones: {
      readonly conexionPermiteEscribir: boolean;
      readonly snapshotVerificado: boolean;
      /**
       * Tipo de operación, para la lista blanca del paro de emergencia.
       *
       * Sin este dato, `evaluar` rechazaba **todo** con el paro activo,
       * incluido un retroceso. La lista blanca estaba escrita y no la
       * consultaba nadie: el retroceso funcionaba durante el paro por omisión
       * —porque no pasaba por el motor—, no por diseño.
       */
      readonly tipoDeOperacion?: string;
    },
  ): Veredicto {
    const rechazos: Rechazo[] = [];

    // Una transacción sin cambios no es una transacción. Aprobarla dejaba
    // pasar un veredicto favorable incluso en modos donde el máximo es cero.
    if (cambios.length === 0) {
      return {
        permitido: false,
        rechazos: [{
          codigo: 'DEMASIADOS_PARAMETROS',
          invariante: 'INV-005',
          mensaje: 'la transacción no propone ningún cambio',
          path: null,
        }],
      };
    }

    const deSeguridad = opciones.tipoDeOperacion !== undefined
      && this.esDeSeguridad(opciones.tipoDeOperacion);

    if (this.bloqueado && !deSeguridad) {
      rechazos.push({
        codigo: 'BLOQUEADO',
        invariante: 'INV-019',
        mensaje: 'el paro de emergencia está activo: solo pasan las escrituras de seguridad',
        path: null,
      });
    }

    if (!opciones.conexionPermiteEscribir) {
      rechazos.push({
        codigo: 'CONEXION',
        invariante: 'INV-017',
        mensaje: 'la conexión no está estable o el estado confirmado no es válido',
        path: null,
      });
    }

    if (!opciones.snapshotVerificado) {
      rechazos.push({
        codigo: 'SIN_INSTANTANEA',
        invariante: 'INV-001',
        mensaje: 'no hay instantánea previa verificada en la lista de la consola',
        path: null,
      });
    }

    if (ctx.nivelAutonomia === 'ASSISTED' && !ctx.aprobacionExplicita) {
      rechazos.push({
        codigo: 'SIN_APROBACION',
        invariante: 'INV-025',
        mensaje: 'el modo asistido exige una acción explícita del usuario por cada cambio',
        path: null,
      });
    }

    if (ctx.nivelAutonomia === 'AUTO' && ctx.confianza !== 'HIGH') {
      rechazos.push({
        codigo: 'CONFIANZA_INSUFICIENTE',
        invariante: 'INV-024',
        mensaje: `el modo automático exige confianza alta, y esta recomendación es ${ctx.confianza}`,
        path: null,
      });
    }

    // Las clases **reales**, derivadas de la ruta, no las declaradas. La
    // exención de sistema se concede por lo que la transacción toca y no por
    // cómo se llama a sí misma: `tipoDeOperacion` es una cadena libre que
    // provee quien propone.
    const clasesReales = cambios
      .map((c) => clasificarRuta(c.path))
      .filter((k): k is ParameterKind => k !== null);
    const maximo = maximoDeParametros(
      ctx.nivelAutonomia, opciones.tipoDeOperacion, clasesReales,
    );
    if (cambios.length > maximo) {
      rechazos.push({
        codigo: 'DEMASIADOS_PARAMETROS',
        invariante: 'INV-005',
        mensaje: `${cambios.length} parámetros en una transacción ${ctx.nivelAutonomia}, el máximo es ${maximo}`,
        path: null,
      });
    }

    // **Un solo silencio de canal por transacción.** ADR-027 lo abrió para el
    // diagnóstico de realimentación, y la cuenta importa: silenciar dos canales
    // a la vez rompe el experimento —si la banda sostenida se cae, no se sabe
    // cuál de los dos la sostenía— además de dejar a dos músicos sin su canal.
    //
    // **Va acá y no en la tabla de límites.** El límite por transacción acota la
    // MAGNITUD de un cambio, y un silencio no tiene magnitud: es binario. La
    // primera versión declaró `porTransaccion: 1` creyendo que eso lo hacía
    // cumplir, y el propio test lo desmintió: dos silencios pasaban, porque cada
    // uno cumplía el tope por separado y la cuenta la miraba otra regla.
    const silencios = cambios.filter((c) => clasificarRuta(c.path) === 'CHANNEL_MUTE').length;
    if (silencios > 1) {
      rechazos.push({
        codigo: 'DEMASIADOS_PARAMETROS',
        invariante: 'INV-005',
        mensaje: `${silencios} silencios de canal en una transacción: se silencia de a uno, o el experimento no dice cuál era`,
        path: null,
      });
    }

    for (const c of cambios) rechazos.push(...this.evaluarCambio(c, ctx));

    return rechazos.length === 0 ? { permitido: true } : { permitido: false, rechazos };
  }

  private evaluarCambio(c: CambioPropuesto, ctx: ContextoSeguridad): Rechazo[] {
    const salida: Rechazo[] = [];

    // Primero: que la ruta y la clase declarada digan lo mismo.
    //
    // INV-008 e INV-010 están enunciadas sobre RUTAS, pero el motor decidía
    // con la clase que declaraba quien proponía el cambio. Una auditoría lo
    // comprobó ejecutando: un envío a un auxiliar de monitor etiquetado como
    // fader de canal pasaba con permitido true. Era una comprobación de
    // honestidad, no un guardia: bastaba un error de tipeo en un asistente.
    const claseReal = clasificarRuta(c.path);
    if (claseReal === null) {
      salida.push({
        codigo: 'RUTA_DESCONOCIDA',
        invariante: 'INV-008',
        mensaje:
          `la ruta ${c.path} no corresponde a ningún parámetro conocido. ` +
          'Escribir en una ruta que el dominio no sabe clasificar es escribir a ciegas',
        path: c.path,
      });
      return salida;
    }
    if (claseReal !== c.kind) {
      salida.push({
        codigo: 'RUTA_INCONSISTENTE',
        invariante: 'INV-008',
        mensaje:
          `la ruta ${c.path} es de tipo ${claseReal}, pero el cambio se declaró ` +
          `como ${c.kind}. Manda la ruta`,
        path: c.path,
      });
      return salida;
    }

    const duenio = ownership(c.kind);

    if (duenio.owner === 'USER_ONLY') {
      salida.push({
        codigo: 'PARAMETRO_DEL_USUARIO',
        // La específica si la hay; si no, la de propiedad. Estaba fija en
        // INV-008 y un arreglo del 2026-09-10 afirmó en cuatro lugares --commit,
        // comentario del código, comentario del test y CHANGELOG-- que la
        // alimentación fantasma ya se rechazaba citando INV-007. No era cierto.
        invariante: duenio.invariante ?? 'INV-008',
        mensaje: `${c.kind} pertenece al usuario y la aplicación nunca lo escribe. ${duenio.nota}`,
        path: c.path,
      });
      return salida; // Sin sentido seguir evaluando algo que no se escribe nunca.
    }

    if (!esEscribible(c.kind)) {
      salida.push({
        codigo: 'PARAMETRO_NO_ESCRIBIBLE',
        invariante: 'INV-008',
        mensaje: `${c.kind} todavía no es escribible en esta versión. ${duenio.nota}`,
        path: c.path,
      });
      return salida;
    }

    // **El silencio de canal, en todo estado menos el show.** ADR-027 lo abrió
    // para el diagnóstico de realimentación: silenciar un candidato y ver si la
    // banda sostenida se cae es la única forma de pasar de indicios a un
    // experimento.
    //
    // **La primera versión de esta guarda cerraba también `FULL_BAND` y
    // `RINGOUT`, y estaba mal.** Los dos son etapas del soundcheck —prueba de
    // banda completa y caza de realimentación—, no del modo live, y el usuario
    // autorizó el soundcheck entero. Peor: `RINGOUT` es literalmente el estado
    // de cazar acoples, así que el diagnóstico que ADR-027 existe para habilitar
    // quedaba rechazado justo donde más aplica. Lo encontró una auditoría de
    // fidelidad, comparando la regla contra lo que el usuario había dicho.
    //
    // **Y el comentario citaba al usuario con una frase que el usuario nunca
    // dijo.** Era una paráfrasis mía entre comillas, en el comentario que
    // justifica una guarda de seguridad. Lo que dijo está en
    // `docs/pedidos/00-lo-que-dijo-el-usuario.md`, y lo que dijo es que el
    // bloqueo sólo existía pensando en el modo live.
    if (c.kind === 'CHANNEL_MUTE' && ctx.sessionState === 'SHOW') {
      salida.push({
        codigo: 'ESTADO_DE_SESION',
        invariante: 'INV-006',
        mensaje: `el silencio de canal no se escribe durante el show, y la sesión está en ${ctx.sessionState}`,
        path: c.path,
      });
    }

    // **El envío a monitor, con el techo que puso el usuario.** ADR-028.
    //
    // Eligiendo entre opciones, el usuario fijó hasta dónde volver a subir un
    // envío que se bajó para cazar un acople: «*Hasta donde estaba antes de que
    // yo lo bajara, y ni un paso más*». Eso no es un tope de magnitud --de eso
    // se ocupa INV-004-- sino un **techo absoluto por ruta**.
    //
    // **El techo sólo existe si la aplicación bajó ese envío.** Si nadie bajó
    // nada, la ruta no figura en `techoPorRuta` y se sube libremente hasta los
    // topes de magnitud. La primera versión lo anotaba en la primera escritura
    // fuera cual fuera, y con todos los auxiliares abajo al empezar el
    // soundcheck la aplicación no podía levantar ninguno: el techo quedaba
    // clavado en el piso. Lo encontró el usuario preguntando exactamente eso.
    //
    // Ver `techoPorRuta` en `ContextoSeguridad` para qué queda sin cubrir.
    //
    // **Que no haya tope al bajar también es decisión del agente.** Al usuario
    // se le preguntó una sola cosa, «techo al subir»; nunca se le ofreció un
    // piso y no dijo nada al respecto. El razonamiento --bajar de más molesta al
    // músico, subir de más le puede arruinar el oído o disparar el acople que se
    // estaba cazando-- es mío. La primera versión de este comentario lo firmaba
    // como «deliberada y del usuario», y lo encontró una auditoría de fidelidad.
    //
    // Una ruta sin entrada en `techoPorRuta` no tiene techo propio: es la
    // primera vez que se la toca y todavía no hay «donde estaba».
    if (c.kind === 'MONITOR_AUX_SEND') {
      // **Sólo el nivel, y esto casi se abre de más.** `clasificar-ruta` mete
      // cinco hojas bajo este `kind` --`value`, `mute`, `pan`, `post` y
      // `postproc`-- porque INV-010 razona sobre el conjunto de rutas de
      // monitor, y ahí las cinco cuentan. Pero abrir el `kind` las abriría las
      // cinco, y **el usuario autorizó el nivel**: «Sí, y también para el ajuste
      // normal de monitores».
      //
      // `post` y `postproc` no son nivel: deciden si el envío se deriva antes o
      // después del fader y del procesamiento. La medición 95 del 2026-09-12
      // mostró qué significa eso en el audio --con `postproc = 1` el monitor
      // sigue al ecualizador dB por dB-- así que escribirlas es recablear el
      // monitor del músico, no ajustarlo. `mute` lo deja sin nada y `pan` lo
      // mueve de lado.
      //
      // Lo encontró el test que cuenta las rutas escribibles, que existe
      // exactamente para esto: el salto habría sido de +1200 en vez de +240.
      // **Lista blanca, no lista negra.** La primera versión comprobaba
      // `/\.value$/`, o sea protegía por lo que la ruta **no** es. Bajo este
      // `kind` cae también `a.N.mix` --el fader del auxiliar entero, el volumen
      // de esa cuña-- y quedaba rechazado sólo por no terminar en `.value`, que
      // es un accidente del nombre y no una regla. Se nombra lo que se abre.
      if (!/^i\.\d+\.aux\.\d+\.value$/.test(c.path)) {
        salida.push({
          codigo: 'PARAMETRO_NO_ESCRIBIBLE',
          invariante: 'INV-010',
          mensaje: 'del envío a monitor sólo se escribe el nivel del canal '
            + `(\`i.N.aux.M.value\`): \`mute\`, \`pan\`, \`post\`, \`postproc\` y el `
            + `fader del bus son del usuario (${c.path})`,
          path: c.path,
        });
      }
      const techo = ctx.techoPorRuta.get(c.path);
      if (techo !== undefined && c.magnitudPropuesta > techo) {
        salida.push({
          codigo: 'DELTA_EXCEDIDO',
          invariante: 'INV-010',
          mensaje: `el envío a monitor no sube más allá de donde estaba: `
            + `${c.magnitudPropuesta} ${c.unidad} pedidos contra un techo de ${techo}`,
          path: c.path,
        });
      }
      // Y no durante el show, por el mismo motivo que ADR-027: el usuario
      // autorizó el soundcheck, y el modo live es una función que no existe.
      if (ctx.sessionState === 'SHOW') {
        salida.push({
          codigo: 'ESTADO_DE_SESION',
          invariante: 'INV-010',
          mensaje: `el envío a monitor no se escribe durante el show, y la sesión está en ${ctx.sessionState}`,
          path: c.path,
        });
      }
    }

    // La ganancia de entrada solo se toca durante la configuración de canales,
    // y nunca con una toma grabada: la grabación es posterior al preamplificador,
    // así que cambiarla haría que la toma deje de representar al show.
    if (c.kind === 'PREAMP_GAIN') {
      if (ctx.sessionState !== 'CHANNEL_SETUP') {
        salida.push({
          codigo: 'ESTADO_DE_SESION',
          invariante: 'INV-006',
          mensaje: `la ganancia de entrada solo se escribe en configuración de canales, y la sesión está en ${ctx.sessionState}`,
          path: c.path,
        });
      }
      if (ctx.hayTakeDeSoundcheckActivo) {
        salida.push({
          codigo: 'TAKE_ACTIVO',
          invariante: 'INV-006',
          mensaje:
            'hay una toma de soundcheck activa. La grabación es posterior al ' +
            'preamplificador: cambiar la ganancia haría que la toma deje de representar al show',
          path: c.path,
        });
      }
    }

    // La ecualización de salida solo se escribe sobre los buses que el perfil
    // del sistema de amplificación declara. Escribir en otro bus podría estar
    // tocando un monitor.
    if (c.kind === 'OUTPUT_EQ') {
      // **Se compara el BUS, no la ruta completa, y el cambio no es cosmético.**
      // Antes era `busesDeSalidaPermitidos.has(c.path)`: igualdad exacta contra
      // un conjunto que el único test del proyecto llenaba con
      // `m.eq.b1.gain` --una ruta que **no existe en la consola**--. El
      // ecualizador de un bus de salida no es paramétrico: el general es un
      // gráfico de 31 bandas por lado (`m.eq.peak.l.0`…`.30`), setenta claves en
      // total. Enumerarlas en una lista blanca no era viable, y por eso la lista
      // terminó con una ruta inventada que nadie ejercitó contra el aparato.
      //
      // El perfil del sistema de amplificación declara **buses**, que es lo que
      // un técnico sabe decir; `prefijosPermitidos` traduce, y esa traducción
      // está contrastada contra las 6732 claves del inventario.
      if (ctx.busesDeSalidaPermitidos.size === 0) {
        // **«No hay perfil» y «el bus está mal» no son lo mismo, y decían lo
        // mismo.** Hoy la aplicación construye este conjunto vacío siempre --el
        // puente desde `PAProfile.outputBuses` no existe-- así que toda
        // ecualización de sala se rechaza. Eso es correcto, pero el mensaje
        // mandaba a revisar el bus cuando lo que falta es el perfil entero.
        salida.push({
          codigo: 'SIN_PERFIL_DE_SALA',
          invariante: 'INV-008',
          mensaje:
            'no hay ningún bus de salida declarado: sin perfil del sistema de '
            + 'amplificación no se ecualiza la sala',
          path: c.path,
        });
      } else if (!ecualizacionPermitida(c.path, ctx.busesDeSalidaPermitidos)) {
        salida.push({
          codigo: 'BUS_NO_PERMITIDO',
          invariante: 'INV-008',
          mensaje: `${c.path} no está entre los buses de salida declarados en el perfil del sistema`,
          path: c.path,
        });
      }

      // Un filtro estrecho de realce en un bus de salida es el camino corto al
      // acople. Las dos constantes existían en el dominio desde el principio y
      // ninguna regla las consultaba.
      // **Sobre esta consola esta regla no se dispara nunca, y hay que decirlo.**
      // El ecualizador de salida es gráfico: no tiene factor de calidad, así que
      // `c.q` es `undefined` siempre. La cláusula sigue teniendo sentido para un
      // paramétrico de salida, que la Ui24R no tiene, y por eso se conserva.
      //
      // El peligro que INV-004 quiere evitar --un realce estrecho sobre el
      // sistema-- en un gráfico de 31 bandas lo acota el realce máximo de abajo,
      // que sí se consulta. `admiteFactorDeCalidad` deja el dato al lado del
      // código en vez de en una nota al pie.
      if (c.q !== undefined && admiteFactorDeCalidad(c.path) && c.q < Q_MINIMO_SALIDA) {
        salida.push({
          codigo: 'Q_DEMASIADO_ESTRECHO',
          invariante: 'INV-004',
          mensaje:
            `Q de ${c.q} en un bus de salida: el mínimo es ${Q_MINIMO_SALIDA}. ` +
            'Un filtro estrecho de realce sobre el sistema es el camino corto al acople',
          path: c.path,
        });
      }
      // **En decibeles, no en crudo.** `REALCE_MAXIMO_SALA_DB` vale 2 y el
      // crudo de una banda del gráfico no llega a 2 nunca, así que sobre el
      // crudo esta comprobación tampoco se disparaba.
      const realce = c.magnitudPropuesta - c.magnitudEsperada;
      if (realce > REALCE_MAXIMO_SALA_DB) {
        salida.push({
          codigo: 'REALCE_EXCESIVO',
          invariante: 'INV-004',
          mensaje:
            `realce de ${realce.toFixed(1)} dB sobre el sistema: el máximo es ` +
            `${REALCE_MAXIMO_SALA_DB}. La corrección de sala atenúa, no realza`,
          path: c.path,
        });
      }
    }

    // **El delta va en la unidad que LIMITES declara, no en crudo.** Ver
    // `CambioPropuesto.magnitudPropuesta`: durante meses esto restaba crudos y
    // los comparaba contra decibeles, así que el tope de INV-004 dejaba pasar
    // el recorrido entero del previo.
    const delta = c.magnitudPropuesta - c.magnitudEsperada;
    const limite = verificarLimite({
      kind: c.kind,
      deltaSolicitado: delta,
      acumuladoEnSesion: ctx.acumuladoPorRuta.get(c.path) ?? 0,
      hayMedicionPosterior: ctx.rutasConMedicionPosterior.has(c.path),
      esPrimerCambioDelParametro: !ctx.rutasYaTocadas.has(c.path),
    });

    if (!limite.permitido) {
      const mapa: Record<string, { codigo: Rechazo['codigo']; inv: string }> = {
        DELTA_CAP: { codigo: 'DELTA_EXCEDIDO', inv: 'INV-004' },
        CUMULATIVE_CAP: { codigo: 'ACUMULADO_EXCEDIDO', inv: 'INV-004' },
        SIN_MEDICION_INTERMEDIA: { codigo: 'SIN_MEDICION_INTERMEDIA', inv: 'INV-004' },
        SIN_LIMITE_DECLARADO: { codigo: 'PARAMETRO_NO_ESCRIBIBLE', inv: 'INV-004' },
      };
      const m = mapa[limite.codigo]!;
      salida.push({
        codigo: m.codigo,
        invariante: m.inv,
        mensaje: limite.mensaje,
        path: c.path,
      });
    }

    return salida;
  }
}
