#!/usr/bin/env node
/**
 * La aplicación guarda lo que escucha, y anota en la transacción cuál fue.
 *
 * **El defecto que cierra, que estuvo abierto y en verde.** El motor de seguridad
 * exige una medición entre un cambio y el siguiente sobre el mismo parámetro y la
 * resuelve contra la tabla `measurement`, pidiendo el identificador exacto que la
 * transacción declara en `medicionPosteriorId`. Hasta el 2026-09-19 la aplicación
 * medía después de aplicar —para contarle al usuario si había servido—, **tiraba
 * la ventana y no anotaba nada**, así que el segundo ajuste sobre el mismo canal
 * se rechazaba siempre con `SIN_MEDICION_INTERMEDIA`.
 *
 * Son **dos mitades y ninguna sirve sola**: una tabla llena de mediciones con
 * `medicionPosteriorId` en nulo da el mismo veredicto que la tabla vacía, y una
 * transacción que anota un identificador que no se guardó, también. Por eso esta
 * guarda mira las dos.
 *
 * **Por qué hace falta una guarda y no alcanza con un test.** Las dos mitades son
 * una línea cada una, en un servicio y en un componente de Angular. Los tests de
 * la cadena —`la-escucha-se-guarda-y-se-anota.test.ts`— prueban el mapeo, el SQL
 * real y el veredicto del motor, y **siguen pasando enteros si alguien borra
 * cualquiera de las dos llamadas**: probarían la maquinaria con nadie usándola.
 * Un test del servicio necesitaría montar el inyector de Angular, que este
 * repositorio no monta en ningún test. La guarda mira lo único que importa: **que
 * producción siga llamando**.
 *
 * Es del mismo género que `validate-mediciones-al-historial.mjs`, y por el mismo
 * motivo escrito: una comprobación que llega después del hecho es un reproche, no
 * una guarda. Ésta corre con `verificar`.
 *
 * ## Lo que esta guarda NO caza, dicho con todas las letras
 *
 * **Porque mira texto y no flujo**, y decirlo importa más que ampliarla: una
 * guarda que se lee como defensa y no puede disparar manda al que audita a buscar
 * protección donde no hay ninguna. Una auditoría adversarial del 2026-09-19 la
 * burló por varias vías; dos se taparon —la mención en una cadena de texto y el
 * `//` pegado a dos puntos— y **estas dos no tienen arreglo por texto**:
 *
 * - **La llamada está y siempre pasa `null`.** `anotarEscucha(res.id, null)`
 *   cuenta como llamada y no anota nunca nada. Es la regresión **más plausible**
 *   de las dos, porque se parece a un arreglo.
 * - **La llamada está pero dentro de código muerto**, por ejemplo un `if (false)`,
 *   o pasando la medición **anterior** al cambio en vez de la posterior.
 *
 * Las tres pasan además la suite entera, porque ningún test monta el inyector de
 * Angular. Lo que sí las caza es leer las diez líneas de `aplicar()` en la
 * pantalla de ganancia, y por eso están nombradas acá: para que quien las lea
 * sepa qué mirar.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { centinela, intentar, ProblemaDeLaGuarda } from './guarda.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Dónde se mira: **`apps/` y `packages/` enteros**, no una lista de carpetas.
 *
 * Lo aprendió la guarda de al lado por la vía cara: listaba tres carpetas a mano,
 * una auditoría movió el archivo con el defecto a un paquete que no estaba en la
 * lista, y **la guarda salió en verde con el defecto puesto**. Una guarda que sólo
 * mira donde el defecto ya estuvo no protege del defecto que se mueve.
 */
const ZONAS = ['apps', 'packages'];

/**
 * Las dos mitades, cada una con lo que hay que encontrar y qué se rompe si no
 * está.
 *
 * **Se busca la LLAMADA y no el nombre**, y la primera versión de esta guarda
 * buscaba el nombre: contaba dos aciertos de `anotarEscucha` —la definición del
 * método y la llamada del componente— así que **borrar la llamada dejaba uno y la
 * guarda seguía en verde con el defecto puesto**. Es el agujero que esta guarda
 * dice tapar, cometido al escribirla, y es la tercera vez en el repositorio: una
 * guarda que no cubre su caso motivador es decorado.
 *
 * El punto de adelante es lo que las distingue: una llamada a un método es
 * `this.algo.anotarEscucha(`, y **una definición nunca lleva punto**.
 *
 * Renombrar una de estas funciones deja la guarda sin nada que mirar, y eso **no
 * la deja en verde**: el conteo en cero es un error, que es la decisión correcta
 * —quien renombra tiene que decir quién protege ahora ese cableado—.
 */
const MITADES = [
  {
    que: 'guardar la escucha',
    // La define el asistente de captura y la llama él mismo, así que basta con que
    // la llamada exista: lo que se vigila es que el resultado de la captura siga
    // pasando por ahí.
    patron: /\.\s*guardarLaEscucha\s*\(/,
    porque:
      'nadie guarda la ventana que se acaba de escuchar. Sin fila en `measurement` el ' +
      'motor no tiene qué resolver, y el ajuste siguiente sobre el mismo canal se ' +
      'rechaza con SIN_MEDICION_INTERMEDIA aunque el músico haya tocado.',
  },
  {
    que: 'anotar la escucha en la transacción',
    patron: /\.\s*anotarEscucha\s*\(/,
    porque:
      'nadie le dice al motor cuál fue la medición. El motor no busca «alguna ' +
      'medición posterior»: resuelve el identificador que la transacción declara, así ' +
      'que sin anotarlo la tabla llena da el mismo veredicto que la tabla vacía.',
  },
];

/**
 * Y la tercera comprobación, que no es una llamada sino el contenido.
 *
 * `anotarEscucha` podría existir, llamarse, y **no escribir el campo**: quedaría
 * un nombre que promete algo que no hace, que es la forma de defecto que este
 * repositorio ya encontró en un test cuyo nombre afirmaba lo que no probaba.
 */
const CAMPO = 'medicionPosteriorId';

/**
 * Y la cuarta, que es una regla de convivencia: **quien guarda una escucha tiene
 * que haber mirado si la consola estaba ahí**.
 *
 * **El defecto que cierra, medido el 2026-09-19.** `MixerService` sólo vacía la
 * lista de canales cuando el usuario desconecta a propósito. Si la conexión se cae
 * sola, los últimos niveles quedan ahí y la captura muestrea dieciocho segundos de
 * un número muerto: eso se guardaba como una escucha de 17,95 segundos y el motor
 * autorizaba el paso siguiente **con cero segundos de música**.
 *
 * Se tapó por dos lados —el dato, exigiendo que el medidor se haya movido; y la
 * causa, no guardando nada si la consola no está conectada al terminar— y **este
 * segundo lado no lo cubre ningún test**, porque vive en un servicio con decorador
 * de Angular. De ahí la regla: el archivo que llama a `guardarLaEscucha` tiene que
 * consultar también `permiteEscribir`. Comprobar que existan por separado no
 * alcanzaría —hay otro sitio que consulta la conexión, así que el conteo global
 * nunca llegaría a cero—, y es la misma forma de agujero que esta guarda ya se
 * comió una vez contando definiciones como llamadas.
 */
const GUARDA_DE_CONEXION = /\.\s*permiteEscribir\s*\(/;

/**
 * Y la quinta: **la cuña se escucha sobre su propio medidor, no sólo sobre el del
 * músico.**
 *
 * **El defecto que cierra, y es específico del envío a monitor.** Las cuatro
 * reglas de arriba se cumplen enteras con una escucha copiada de la ganancia:
 * hay quien guarda, hay quien anota, se escribe el campo y se mira la conexión.
 * Y sin embargo la garantía sería falsa, porque el medidor del canal **no se
 * entera del envío**: la ganancia está aguas arriba de él, el envío a una cuña
 * deriva del canal hacia el bus y está antes del fader. Con ese solo medidor la
 * aplicación podría afirmar «acá se escuchó» sobre una cuña muda, paso tras paso,
 * hasta el techo de nominal.
 *
 * Por eso se vigila que producción siga pasando la serie de la cuña. Es la
 * decisión del usuario del 2026-09-19, ADR-036, y **ningún test la puede
 * proteger**: los tests prueban que el mapeo decide bien cuando le dan las dos
 * series, y siguen pasando enteros si el servicio deja de darle la segunda.
 *
 * **Y esta guarda se comió su propio agujero al escribirse, por cuarta vez en el
 * repositorio.** La primera versión buscaba `muestrasDeLaCuna\s*:` en el archivo
 * entero y contaba archivos: con eso, **borrar la línea que la pasa dejaba la
 * guarda en verde**, porque el mismo servicio declara un campo privado con ese
 * nombre y el archivo seguía coincidiendo. Es exactamente la forma que ya tuvo
 * contando la definición de `anotarEscucha` como llamada. Se probó mutando, que es
 * lo único que lo muestra.
 *
 * **Y la segunda versión seguía teniendo el mismo agujero, más fino.** Distinguía
 * la declaración por la palabra de adelante —`private`, `readonly`—, así que la
 * declaración del tipo se salvaba **por casualidad**: dice `readonly` dos veces.
 * Escrita como `muestrasDeLaCuna?: MuestraVu[];`, que es forma perfectamente
 * normal, volvía a contar como pase. Y además bastaba **un literal con esa clave
 * en cualquier archivo de `apps/`** —una línea de registro, un archivo muerto—
 * para satisfacerla con el pase borrado. Las dos las midió una auditoría
 * adversarial el 2026-09-19.
 *
 * Hoy se distingue por dos cosas que no dependen de ningún modificador: **una
 * declaración termina en `;` y un pase en `,`**, y el archivo **tiene que llamar
 * además a `medicionDeLaCaptura`**, que es adonde la serie tiene que llegar para
 * que sirva de algo. Un literal suelto en otro archivo ya no alcanza.
 *
 * **Lo que esta regla NO caza**, por lo mismo que las otras: mira texto, así que
 * una llamada que pase la serie de la cuña **vacía**, o la misma serie del canal
 * dos veces, la satisface. La segunda es la regresión plausible, porque parece un
 * arreglo; y lo que la caza es leer `recolectar` en el servicio de la cuña, que
 * empuja las dos en el mismo tic.
 */
const SERIE_DE_LA_CUNA = /\bmuestrasDeLaCuna\s*\??\s*:/;

/**
 * Lo que convierte una coincidencia en una declaración y no en un pase.
 *
 * **El punto y coma, y no la palabra de adelante.** Un miembro de interfaz y un
 * campo de clase terminan en `;`; una propiedad de objeto literal, en `,`. No
 * depende de que nadie conserve un `readonly`, y **no produce el falso positivo**
 * que la versión anterior daba con un pase escrito `… as readonly MuestraVu[],`.
 */
const ES_DECLARACION = /;\s*$/;

/** Adonde la serie tiene que llegar para que pasarla signifique algo. */
const DESTINO_DE_LA_SERIE = /\bmedicionDeLaCaptura\s*\(/;

/** Los `.ts` de una carpeta, recursivo, sin `node_modules` ni tests. */
function archivos(dir) {
  const salida = [];
  let entradas;
  try {
    entradas = readdirSync(dir);
  } catch {
    throw new ProblemaDeLaGuarda(
      `la zona '${relative(RAIZ, dir)}' no existe. Si se movió, hay que actualizar ` +
      'ZONAS en esta guarda: si no, deja de mirar y nadie se entera.',
    );
  }
  for (const e of entradas) {
    const ruta = join(dir, e);
    if (statSync(ruta).isDirectory()) {
      if (e === 'node_modules' || e === 'test' || e === 'dist') continue;
      salida.push(...archivos(ruta));
    } else if (e.endsWith('.ts') && !e.endsWith('.test.ts')) {
      salida.push(ruta);
    }
  }
  return salida;
}

/**
 * El texto sin comentarios **ni cadenas**.
 *
 * **Es lo que impide que la guarda se satisfaga con una mención.** La guarda de al
 * lado se conformaba con una línea de comentario que nombrara la función: se podía
 * renombrar la función de verdad, dejar el comentario, y la guarda volvía a verde
 * comprobando cero llamadas.
 *
 * **Y las cadenas se sacan desde el 2026-09-19, porque una auditoría adversarial
 * burló esto por ahí**: borrada la llamada de verdad, dejar
 * `"...this.aplicador.anotarEscucha(...)"` dentro de un literal de texto en
 * cualquier archivo dejaba la guarda en verde. Una mención en una cadena es
 * exactamente lo mismo que una mención en un comentario.
 *
 * **Lo del esquema de URL también salió de ahí.** Esto excluía todo `//`
 * precedido de dos puntos, para no comerse `https://`; la misma auditoría escribió
 * `a:// await this.aplicador.anotarEscucha(...)`, que comenta la línea de verdad y
 * la guarda no la sacaba. Ahora se excluye sólo lo que tiene forma de esquema.
 */
function sinComentariosNiCadenas(texto) {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:\w])\/\/[^\n]*/g, '$1')
    .replace(/(^|[^:\w])[a-z][a-z0-9+.-]*:\/\/[^\n]*/gi, '$1')
    .replace(/`(?:\\.|[^`\\])*`/g, "''")
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\.|[^"\\\n])*"/g, "''");
}

const problemas = [];

const ok = intentar(() => {
  let mirados = 0;
  const encontrados = new Map(MITADES.map((m) => [m.que, 0]));
  let campoEscrito = 0;
  let guardanEscucha = 0;
  let pasanLaSerieDeLaCuna = 0;
  const sinMirarLaConexion = [];

  for (const zona of ZONAS) {
    for (const ruta of archivos(join(RAIZ, zona))) {
      mirados++;
      const texto = sinComentariosNiCadenas(readFileSync(ruta, 'utf8'));

      for (const mitad of MITADES) {
        for (const linea of texto.split('\n')) {
          if (mitad.patron.test(linea)) {
            encontrados.set(mitad.que, encontrados.get(mitad.que) + 1);
          }
        }
      }

      // El campo, escrito y no sólo declarado. `packages/safety` lo declara y lo
      // nace en nulo: lo que hace falta es que **la aplicación** lo escriba.
      if (zona === 'apps' && texto.includes(CAMPO)) campoEscrito++;

      // **La serie de la cuña: se busca PASARLA, línea por línea.** Mirar el
      // archivo entero contaba la declaración del campo privado del propio
      // servicio, así que borrar el pase dejaba la guarda en verde. Se acota a
      // `apps` porque quien captura es la aplicación.
      if (zona === 'apps' && DESTINO_DE_LA_SERIE.test(texto)) {
        for (const linea of texto.split('\n')) {
          if (SERIE_DE_LA_CUNA.test(linea) && !ES_DECLARACION.test(linea)) {
            pasanLaSerieDeLaCuna++;
          }
        }
      }

      // Y la convivencia: quien guarda una escucha mira la conexión.
      if (MITADES[0].patron.test(texto)) {
        guardanEscucha++;
        if (!GUARDA_DE_CONEXION.test(texto)) sinMirarLaConexion.push(relative(RAIZ, ruta));
      }
    }
  }

  // **El centinela, porque una guarda que no vio nada no está en verde: está
  // ciega.** El mínimo va a mano: uno calculado de lo que se recorre encoge junto
  // con ello y no es un mínimo.
  centinela(mirados, 100, 'archivos de producción');

  for (const mitad of MITADES) {
    if (encontrados.get(mitad.que) === 0) {
      problemas.push(
        `nadie llama a lo que hace «${mitad.que}» en producción: ${mitad.porque}`,
      );
    }
  }

  for (const ruta of sinMirarLaConexion) {
    problemas.push(
      `${ruta} guarda una escucha y no consulta permiteEscribir(). Con la consola ` +
      'caída los medidores quedan congelados en su último valor y la ventana parece ' +
      'una fuente estable: medido, se guardaba como 17,95 s de música con cero ' +
      'segundos de música, y el motor autorizaba el paso siguiente.',
    );
  }

  if (guardanEscucha === 0) {
    problemas.push(
      'ningún archivo de producción guarda una escucha, así que la regla de mirar la ' +
      'conexión no se comprobó en ninguno. O se renombró la función, o se movió el ' +
      'código: en los dos casos hay que decidir quién protege eso ahora.',
    );
  }

  // Con cero, lo que puede quedar es la declaración del tipo y nadie que la use:
  // exactamente el estado del que esta pieza salió.
  if (pasanLaSerieDeLaCuna === 0) {
    problemas.push(
      'ningún archivo de la aplicación le pasa a una escucha el medidor de la cuña. ' +
      'El medidor del canal NO se entera del envío a monitor --está aguas arriba, y ' +
      'el envío deriva hacia el bus antes del fader--, así que con ese solo medidor ' +
      'la aplicación puede afirmar que escuchó sobre una cuña muda, paso tras paso, ' +
      'hasta el techo de nominal. Es la decisión del usuario del 2026-09-19, ADR-036.',
    );
  }

  if (campoEscrito === 0) {
    problemas.push(
      `ningún archivo de la aplicación menciona ${CAMPO}. El campo lo declara el ` +
      'paquete de seguridad y nace en nulo; quien lo tiene que escribir es la ' +
      'aplicación, cuando la escucha ocurre.',
    );
  }

  console.log(
    `guarda de la escucha: ${mirados} archivo(s) de producción, ` +
    MITADES.map((m) => `${m.que}: ${encontrados.get(m.que)} llamada(s)`).join(', ') +
    `, ${CAMPO} en ${campoEscrito} archivo(s) de la aplicación`
    + `, ${guardanEscucha} que guarda(n) escucha y mira(n) la conexión`
    // **Se imprime, y antes no.** Sin este número, quien lee la salida no puede
    // saber si la regla de la cuña vio un pase o cuarenta: sólo se enteraría al
    // llegar a cero, que es tarde. Lo marcó una auditoría adversarial el
    // 2026-09-19.
    + `, ${pasanLaSerieDeLaCuna} que pasa(n) el medidor de la cuña.`,
  );
}, (e) => problemas.push(e.message));

if (problemas.length > 0) {
  console.error(`guarda de la escucha: ${problemas.length} problema(s).`);
  for (const p of problemas) console.error(`  - ${p}`);
  process.exit(1);
}

if (!ok) process.exit(1);
