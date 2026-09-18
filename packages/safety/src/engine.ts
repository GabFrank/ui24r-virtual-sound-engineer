import {
  ownership, esEscribible, verificarLimite,
  maximoDeParametros, Q_MINIMO_SALIDA, REALCE_MAXIMO_SALA_DB,
} from '@vse/domain';
import { ecualizacionPermitida, admiteFactorDeCalidad } from '@vse/domain';
import { clasificarRuta, esNivelDeEnvioAMonitor } from '@vse/mixer-adapter';
import { verificarAtadura, verificarAtaduraDelOrigen } from './magnitud-atada.ts';
import type { ParameterKind, ResultadoLimite } from '@vse/domain';
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

    // **La misma ruta dos veces en una transacción multiplica todos los topes.**
    //
    // `evaluarCambio` juzga cada cambio contra un `ctx` que **no se actualiza
    // entre uno y otro**: el acumulado, las rutas ya tocadas y las que tienen
    // medición posterior son las de antes de empezar. Así que N cambios
    // encadenados sobre la misma ruta cobran cada uno el presupuesto entero:
    // **ni el tope por paso ni el acumulado acotan lo que de verdad se mueve.**
    // Y si esa ruta no venía tocada en la sesión, `esPrimerCambioDelParametro`
    // es verdadero para todos y tampoco se exige escuchar en el medio. (Esa
    // última cláusula vale sólo para ese caso: con la ruta ya tocada y sin
    // medición anotada, los cambios se rechazan por `SIN_MEDICION_INTERMEDIA`.
    // La conclusión se sostiene por los dos caminos, pero la primera redacción
    // enunció el mecanismo de más y lo corrigió una auditoría.)
    //
    // **Medido por una auditoría adversarial el 2026-09-17b: cuatro pasos
    // honestos de 2 dB en una sola transacción mueven la cuña 8 dB, con el tope
    // por transacción en 2.** No hace falta mentir ningún número: los cuatro
    // cambios son coherentes con el crudo, cada uno pasa la atadura de los dos
    // extremos y cada uno cabe en su tope. Lo que nadie sumaba era la cadena.
    //
    // **Se rechaza en vez de acumular, y la razón no es la comodidad.** INV-004
    // exige una medición entre un cambio y el siguiente sobre el mismo
    // parámetro, y **dentro de una transacción no hay dónde medir**: es una
    // ráfaga de escrituras, y la escucha del músico ocurre entre transacciones.
    // Acumular dejaría pasar una rampa entera sin escuchar, con la suma dentro
    // del tope, que es exactamente lo que ADR-034 no quiere: lo que hace de la
    // subida una rampa y no una corrida es la escucha, no el tamaño del paso.
    //
    // **Y los cambios intermedios SÍ suenan, que es lo que vuelve real el
    // argumento.** La primera redacción de este comentario decía que «lo único
    // que llega al aire es el último, así que el intermedio es una escritura
    // que no se justifica», y una auditoría lo midió con el ejecutor real: el
    // ejecutor escribe **todos** los cambios, en orden, con su espera entre uno
    // y otro. Los cuatro llegaron a la consola, separados por ~101 ms. O sea
    // que el hallazgo no era un salto de 8 dB sino **una rampa de 312 ms en la
    // cuña de un músico sin una sola escucha en el medio** — peor, y mucho más
    // parecido a lo que ADR-034 describe. Lo único que *queda* es el último;
    // los otros se oyen.
    //
    // **Lo que esta guarda NO convierte en escucha, y hay que decirlo porque el
    // argumento se apoya ahí.** Rechazar la ráfaga obliga a partirla en
    // transacciones, y **hoy nada comprueba que entre transacción y transacción
    // se haya escuchado de verdad**: `historialDeLaSesion` sólo mira que
    // `medicionPosteriorId` no sea nulo, sin fecha, sin cruzarlo contra una
    // `Measurement` real y sin ningún espaciado de reloj entre transacciones.
    // Medido: anotando la medición, quince transacciones mueven **28,5 dB en 19
    // ms**, y lo que corta no es ningún freno de INV-004 sino el techo de
    // nominal. No está expuesto porque en producción nadie llena ese campo
    // todavía; queda como tarea, y es la que le da sentido a ésta.
    //
    // **Es la misma forma que el silencio de acá arriba** —una regla sobre la
    // COMPOSICIÓN de la transacción, que la tabla de límites no puede expresar
    // porque mira un cambio por vez— y por eso vive al lado.
    //
    // **Lo que esta guarda NO cierra, con todas las letras y con los números.**
    // Cuenta por la cadena de la ruta, igual que `acumuladoPorRuta`,
    // `techoPorRuta` y `rutasYaTocadas`. Así que **dos claves distintas que
    // llegan al mismo parlante se le escapan**, y hay tres casos conocidos:
    //
    // - **El alias con ceros**, que para el envío a monitor ya cierra la forma
    //   canónica de `esNivelDeEnvioAMonitor` y para otras familias no. Medido:
    //   `hw.0.gain` más sus alias `hw.00.gain`, `hw.000.gain` y `hw.0000.gain`,
    //   3 dB cada uno, pasan en **una** transacción —12 dB con el tope en 3— y
    //   en ráfaga llegan a **36 dB con el acumulado por sesión en 6**. Es la
    //   ganancia del previo, o sea **el único parámetro que la aplicación mueve
    //   hoy de punta a punta**. Lo que lo tapa no es una guarda sino un
    //   accidente: el alias no tiene valor confirmado y el ejecutor lo rechaza
    //   por INV-002.
    // - **El enlace estéreo de `fmalcher`**, donde una sola llamada de «poner el
    //   nivel del envío» escribe hasta cuatro `i.N.aux.M.value` distintos.
    //   Anotado desde antes en `docs/referencia/trabajo-previo-de-terceros.md`.
    // - **Familias distintas sobre el mismo parlante**: `i.3.mix` más
    //   `i.3.eq.b1.gain` más `i.3.aux.1.value` pasan juntos, y con el envío
    //   post-fader y post-proceso —lo que midió el ítem 95— eso son hasta 9 dB
    //   en la cuña del músico en una transacción. **El tope es por clave y el
    //   oído es por parlante**, y ésa es la forma general de los tres.
    //
    // Los tres quedan como tareas, medidos.
    const vecesPorRuta = new Map<string, number>();
    for (const c of cambios) vecesPorRuta.set(c.path, (vecesPorRuta.get(c.path) ?? 0) + 1);
    for (const [ruta, veces] of vecesPorRuta) {
      if (veces <= 1) continue;
      rechazos.push({
        codigo: 'RUTA_REPETIDA',
        invariante: 'INV-004',
        mensaje: `${ruta} aparece ${veces} veces en la misma transacción: cada una `
          + 'cobraría el tope entero y ninguna exigiría escuchar en el medio, así que '
          + 'el movimiento real no quedaría acotado por nada. Va de a un cambio por '
          + 'ruta, y se vuelve a escuchar antes del siguiente',
        path: ruta,
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

    // **La magnitud que se juzga tiene que ser la que va al cable.**
    //
    // Todo lo que sigue --los topes, el techo por ruta, el límite acumulado--
    // mira `magnitudPropuesta`, y hasta hoy nada la ataba a `valorPropuesto`. Una
    // auditoría lo demostró midiendo: **una escritura de recorrido completo,
    // crudo 0 a 1, aprobada bajo un techo de −6 dB declarando magnitudes −31 a
    // −30.** El motor miraba los decibeles declarados y dejaba pasar el recorrido
    // entero del parámetro.
    //
    // No se podía cerrar antes porque atar necesita la ley de conversión medida,
    // y `rutasProbadas()` devolvía la lista vacía. La medición 101 midió dos.
    //
    // **Y una ruta sin ley medida no se rechaza.** Rechazar bloquearía casi todo
    // el aparato; lo que cambia es que la diferencia deja de ser silenciosa.
    {
      const atadura = verificarAtadura(c.path, c.valorPropuesto, c.magnitudPropuesta, c.unidad);
      if (!atadura.atada && atadura.codigo !== 'SIN_LEY_VERIFICADA') {
        salida.push({
          codigo: 'MAGNITUD_NO_ATADA',
          invariante: 'INV-004',
          mensaje: atadura.motivo,
          path: c.path,
        });
        return salida; // Sin sentido juzgar topes sobre un número que no es el que se escribe.
      }
    }

    // **Y de dónde venía, que es la otra mitad y faltaba.**
    //
    // Los topes de INV-004 no acotan el destino: acotan el **movimiento**, que
    // es `magnitudPropuesta - magnitudEsperada`. Atar sólo el destino deja esa
    // resta apoyada en un número que nadie comprueba, y la auditoría del
    // 2026-09-17 lo midió: **un salto de 31 dB en la cuña de un músico pasa el
    // tope de 2 dB por paso declarando que venía de un decibel más abajo.**
    //
    // **Lo que esto ata es el puente, y hay que decir dónde cierra la cadena,
    // porque no es acá.** Los dos números que se comparan --`valorEsperado` y
    // `magnitudEsperada`-- **los declara el mismo llamador**: el motor no lee la
    // consola en ningún punto de `evaluar`. Así que un llamador que mienta los
    // dos de forma coherente sigue sacando `permitido: true`, medido.
    //
    // Quien ata el crudo a la realidad es el **adaptador, y después**: compara
    // `valorEsperado` contra el estado confirmado justo antes de enviar y
    // devuelve `CONFLICT` sin escribir (INV-011, `coincideConEsperado`). De ahí
    // sale la garantía que sí se sostiene, y conviene enunciarla sobre el cable
    // y no sobre el veredicto: **ninguna escritura sale de acá con el movimiento
    // mal medido.** O el origen declarado es el de verdad --y entonces esta
    // guarda comprueba sus decibeles-- o no lo es, y la escritura no sale.
    //
    // **Lo que cerró este paso, entonces, es el hueco entre las dos:** declarar
    // el crudo de partida verdadero, para que el adaptador lo acepte, y los
    // decibeles de partida falsos, para que el motor mida mal. Eso pasaba
    // entero, con la escritura saliendo al cable.
    //
    // Una auditoría de fidelidad corrigió esta frase el mismo día que se
    // escribió: decía «la cadena queda entera» y presentaba como propiedad del
    // motor algo que es del adaptador, dos pasos más abajo. Es la forma de error
    // que este proyecto repite --escribir la garantía antes de que exista-- y
    // acá lo que faltaba no era la garantía sino la precisión sobre quién la da.
    //
    // **Y hoy es más urgente que cuando se encontró.** ADR-034 suspende el
    // presupuesto acumulado mientras la cuña no tiene nivel establecido, así
    // que durante toda la subida el tope por paso es el **único** freno sobre
    // la brusquedad. Es además lo que el `CHANGELOG` le promete al usuario.
    //
    // **Va con código propio y no con `MAGNITUD_NO_ATADA`.** Son dos defectos
    // distintos —uno escribe un número que el motor no juzgó, el otro juzga un
    // movimiento que no es el que ocurre— y con el mismo código un test del
    // origen pasaría por lo que frenó el destino. Es la misma razón por la que
    // `TECHO_ABSOLUTO` no es `DELTA_EXCEDIDO`.
    {
      const origen = verificarAtaduraDelOrigen(
        c.path, c.valorEsperado, c.magnitudEsperada, c.unidad,
      );
      if (!origen.atada && origen.codigo !== 'SIN_LEY_VERIFICADA') {
        salida.push({
          codigo: 'ORIGEN_NO_ATADO',
          invariante: 'INV-004',
          mensaje: origen.motivo,
          path: c.path,
        });
        return salida; // Sin sentido juzgar topes sobre un movimiento que no es el real.
      }
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
      //
      // **Y la lista blanca es una función, no una expresión regular.** Lo era,
      // y una auditoría midió lo que dejaba pasar: `i.24.aux.0.value` --un canal
      // que esta consola no tiene--, `i.99.aux.99.value` y
      // `i.0003.aux.0000000001.value`. El `\d+` sin cota es correcto para
      // *clasificar* por familia y no sirve para *permitir*.
      //
      // Lo grave era el alias: `techoPorRuta`, `acumuladoPorRuta` y
      // `rutasYaTocadas` se indexan por la **cadena cruda**, así que con un
      // techo puesto en `i.3.aux.1.value` pedir `i.03.aux.1.value` pasaba --la
      // misma ruta que suena en la sala, alcanzada por una clave que el estado
      // no reconoce--. `esNivelDeEnvioAMonitor` exige la forma canónica y los
      // rangos reales, que es la única forma con la que el estado por ruta
      // puede contar.
      if (!esNivelDeEnvioAMonitor(c.path)) {
        salida.push({
          codigo: 'PARAMETRO_NO_ESCRIBIBLE',
          invariante: 'INV-010',
          mensaje: 'del envío a monitor sólo se escribe el nivel del canal '
            + `(\`i.N.aux.M.value\`): \`mute\`, \`pan\`, \`post\`, \`postproc\` y el `
            + `fader del bus son del usuario (${c.path})`,
          path: c.path,
        });
      }
      // **Sin `?.` esto estalla con un llamador sin tipos.** Falla cerrado --el
      // `evaluar` no devuelve permiso-- pero el registro que alguien lee después
      // de un show dice `TypeError` en vez de decir qué se rechazó y por qué.
      // Lo marcó una auditoría de seguridad, y el caso real ya ocurrió:
      // `tools/inventario/permisos.ts` estalló así durante cuatro días.
      const techo = ctx.techoPorRuta?.get(c.path);
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
      //
      // **Sólo `SHOW`, y no `ESTADOS_EN_VIVO`.** El dominio define
      // `ESTADOS_EN_VIVO = ['FULL_BAND', 'RINGOUT', 'SHOW']` y ninguna regla de
      // seguridad lo consulta; una auditoría lo marcó preguntando si para el
      // envío a monitor se había heredado el criterio sin razonarlo. Se razonó
      // ahora, y la respuesta es que para **este** parámetro corresponde `SHOW`
      // solo:
      //
      // - `FULL_BAND` es el soundcheck con la banda entera tocando, que es
      //   **exactamente cuándo se ajusta un monitor**. Cerrarlo dejaría la
      //   categoría abierta sólo cuando no hay nadie toando, o sea inútil para
      //   lo que el usuario pidió.
      // - `RINGOUT` es la caza de acoples, que es el otro momento en que el
      //   usuario baja un monitor a propósito.
      // - `SHOW` es el público en la sala. Ahí el operador no está mirando la
      //   pantalla de la aplicación y un cambio sorpresa en la cuña de un
      //   músico no tiene quien lo atrape.
      //
      // Lo que separa a los dos primeros del tercero no es «en vivo» sino
      // **quién está mirando**. `ESTADOS_EN_VIVO` sirve para otras cosas --avisar
      // de una escritura, exigir confirmación-- y usarlo acá cerraría el caso
      // principal. Si alguna vez hace falta un criterio más fino, es una
      // decisión de producto y va con su ADR.
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
      // La unidad que declara quien propone, para que `verificarLimite` pueda
      // comparar especies antes de comparar numeros.
      unidad: c.unidad,
      // **A cuánto quedaría**, que es contra lo que se compara un techo. Es la
      // misma magnitud que el motor usa más arriba para `techoPorRuta`, que es el
      // otro tope sobre el DESTINO.
      //
      // Este comentario decía «y para el realce de sala: los tres son topes sobre
      // el destino», y es falso: el realce es `magnitudPropuesta -
      // magnitudEsperada`, o sea un tope sobre el MOVIMIENTO. Se contradecía con
      // la distinción que este mismo cambio introduce en `Limite.techoAbsoluto`
      // --«unos acotan cuánto se mueve, éste acota dónde queda; son especies
      // distintas»--. Lo marcó una auditoría de fidelidad el 2026-09-17.
      magnitudResultante: c.magnitudPropuesta,
      // **Sin `?.` y sin `?? true`, a propósito.** Un contexto sin este conjunto
      // es un llamador que no se enteró de que existe, y lo que tiene que pasar
      // ahí es un `TypeError` ruidoso y no una suspensión silenciosa del
      // presupuesto acumulado. `techoPorRuta` eligió lo contrario --y con razón,
      // porque ahí fallar cerrado es no tener techo-- pero acá el campo ausente
      // AFLOJA, así que esconderlo sería abrir la puerta que ADR-034 acota.
      nivelEstablecido: ctx.rutasConNivelEstablecido.has(c.path),
    });

    if (!limite.permitido) {
      // **El tipo del mapa es exhaustivo, y antes era `Record<string, …>`.**
      // Con `string` como clave, agregar un codigo de rechazo en `limits.ts` no
      // rompia nada al compilar: el `mapa[limite.codigo]!` devolvia `undefined`
      // y el `!` lo tapaba, asi que el motor estallaba con un `TypeError` en
      // ejecucion. Paso el 2026-09-12 al agregar `UNIDAD_NO_DECLARADA`, y **la
      // suite quedo verde**: ningun test proponia un cambio con la unidad mal
      // declarada POR EL MOTOR --el del dominio llama a `verificarLimite`
      // directo--. Lo encontro `tools/inventario/permisos.ts` al correrlo.
      //
      // Con la clave derivada del tipo, un codigo nuevo sin traduccion es un
      // error de compilacion. Es la diferencia entre un mapa y una tabla de
      // traduccion obligatoria.
      type CodigoDeLimite = Extract<ResultadoLimite, { permitido: false }>['codigo'];
      const mapa: Record<CodigoDeLimite, { codigo: Rechazo['codigo']; inv: string }> = {
        DELTA_CAP: { codigo: 'DELTA_EXCEDIDO', inv: 'INV-004' },
        CUMULATIVE_CAP: { codigo: 'ACUMULADO_EXCEDIDO', inv: 'INV-004' },
        SIN_MEDICION_INTERMEDIA: { codigo: 'SIN_MEDICION_INTERMEDIA', inv: 'INV-004' },
        SIN_LIMITE_DECLARADO: { codigo: 'PARAMETRO_NO_ESCRIBIBLE', inv: 'INV-004' },
        // Declarar una unidad distinta de la del tope es proponer un cambio que
        // el motor no puede juzgar, asi que se rechaza por la misma invariante
        // que exige que el tope exista.
        UNIDAD_NO_DECLARADA: { codigo: 'PARAMETRO_NO_ESCRIBIBLE', inv: 'INV-004' },
        // El techo de nominal del envío a monitor (ADR-034). **INV-010 y no
        // INV-004**: los topes de INV-004 acotan el movimiento, y éste sale de la
        // invariante que gobierna qué puede hacer la aplicación con la cuña de un
        // músico. Hoy `MONITOR_AUX_SEND` es el único tipo que declara techo; si
        // alguna vez lo declara otro, esta fila tiene que dejar de ser una sola.
        TECHO_ABSOLUTO: { codigo: 'TECHO_ABSOLUTO', inv: 'INV-010' },
        // No declarar a cuánto quedaría un parámetro que tiene techo es la misma
        // especie de error que declarar mal la unidad: el motor no puede juzgar.
        SIN_MAGNITUD_RESULTANTE: { codigo: 'PARAMETRO_NO_ESCRIBIBLE', inv: 'INV-004' },
        // Una magnitud que no es un número no es un cambio que el motor pueda
        // juzgar, y antes las pasaba todas. Ver el comentario en `limits.ts`.
        MAGNITUD_NO_NUMERICA: { codigo: 'MAGNITUD_NO_ATADA', inv: 'INV-004' },
      };
      const m = mapa[limite.codigo];
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
