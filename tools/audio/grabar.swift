import AVFoundation
import Foundation

// Graba de una entrada de audio a un WAV, y dice qué capturó.
//
// **Por qué un programa propio y no `ffmpeg`.** Dos razones, y la segunda es la
// que importa. La primera es práctica: el `ffmpeg` de esta máquina está roto por
// un choque de versiones de `jpeg-xl`, y arreglarlo es tocar el Homebrew del
// usuario para nada.
//
// La segunda es de método. Esto va a ser **un instrumento de medición**: lo que
// grabe se va a comparar contra los medidores de la consola para decidir si
// coinciden. Un instrumento cuyo funcionamiento uno no puede inspeccionar no
// sirve para refutar nada — y este proyecto ya tiene documentado lo que pasa
// cuando el instrumento es una caja negra en la que uno confía.
//
// Acá se ve todo: qué dispositivo, qué frecuencia de muestreo, cuántos canales,
// y que no se toca ni una muestra entre la entrada y el archivo.
//
// **Y no reproduce nada.** Grabar y reproducir en el mismo proceso invita a
// cerrar un lazo por descuido; el tono lo manda `afplay` aparte.
//
// Uso:
//   grabar <segundos> <salida.wav> [parte-del-nombre-del-dispositivo]

struct Argumentos {
    let segundos: Double
    let salida: URL
    let dispositivo: String?
}

func abortar(_ mensaje: String) -> Never {
    FileHandle.standardError.write(("ERROR: " + mensaje + "\n").data(using: .utf8)!)
    // Código 2, igual que las guardas de los guiones de medición: 1 es «midió y
    // falló el criterio», 2 es «no se midió».
    exit(2)
}

func leerArgumentos() -> Argumentos {
    let a = CommandLine.arguments
    guard a.count >= 3 else {
        abortar("uso: grabar <segundos> <salida.wav> [parte-del-nombre-del-dispositivo]")
    }
    guard let seg = Double(a[1]), seg > 0, seg <= 3600 else {
        abortar("los segundos tienen que ser un número entre 0 y 3600, y llegó «\(a[1])»")
    }
    return Argumentos(
        segundos: seg,
        salida: URL(fileURLWithPath: a[2]),
        dispositivo: a.count > 3 && !a[3].isEmpty ? a[3] : nil
    )
}

/// Elige el dispositivo de entrada, **y falla si el pedido no está**.
///
/// No cae al de por omisión cuando no encuentra el pedido: grabar del micrófono
/// de la Mac creyendo que se graba de la Scarlett produce un archivo plausible y
/// falso, que es la peor clase de dato.
func elegirEntrada(_ parte: String?) throws -> AudioDeviceID {
    var tamaño = UInt32(MemoryLayout<AudioDeviceID>.size)
    var idPorOmision = AudioDeviceID(0)
    var dir = AudioObjectPropertyAddress(
        mSelector: kAudioHardwarePropertyDefaultInputDevice,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain)

    guard let buscado = parte else {
        AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject),
                                   &dir, 0, nil, &tamaño, &idPorOmision)
        return idPorOmision
    }

    // La lista completa, para poder decir qué había cuando no está el pedido.
    var dirLista = AudioObjectPropertyAddress(
        mSelector: kAudioHardwarePropertyDevices,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain)
    var bytes: UInt32 = 0
    AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject),
                                   &dirLista, 0, nil, &bytes)
    let cuantos = Int(bytes) / MemoryLayout<AudioDeviceID>.size
    var ids = [AudioDeviceID](repeating: 0, count: cuantos)
    AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject),
                               &dirLista, 0, nil, &bytes, &ids)

    var nombres: [String] = []
    for id in ids {
        var dirNombre = AudioObjectPropertyAddress(
            mSelector: kAudioObjectPropertyName,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain)
        // **`Unmanaged<CFString>?` y no `CFString`.** CoreAudio devuelve una
        // referencia retenida, y pasarle una `CFString` por referencia le da un
        // puntero a un objeto en vez de un lugar donde escribir uno: el nombre
        // sale basura. Con un nombre basura, la guarda de «no encontré la
        // interfaz» deja de guardar nada -- justo la guarda que existe para que
        // nadie grabe del micrófono de la Mac creyendo que graba de la Scarlett.
        var nombre: Unmanaged<CFString>?
        var t = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
        guard AudioObjectGetPropertyData(id, &dirNombre, 0, nil, &t, &nombre) == noErr,
              let cf = nombre?.takeRetainedValue()
        else { continue }
        let s = cf as String
        nombres.append(s)
        if s.lowercased().contains(buscado.lowercased()) { return id }
    }
    abortar("no hay ningún dispositivo cuyo nombre contenga «\(buscado)». "
            + "Los que hay: \(nombres.joined(separator: " · ")). "
            + "No se graba del dispositivo por omisión: un archivo del micrófono "
            + "de la Mac creyendo que es de la interfaz es un dato plausible y falso.")
}

let args = leerArgumentos()
let motor = AVAudioEngine()

if let parte = args.dispositivo {
    let id = try elegirEntrada(parte)
    var idVar = id
    let unidad = motor.inputNode.audioUnit!
    let r = AudioUnitSetProperty(unidad,
                                 kAudioOutputUnitProperty_CurrentDevice,
                                 kAudioUnitScope_Global, 0,
                                 &idVar, UInt32(MemoryLayout<AudioDeviceID>.size))
    if r != noErr { abortar("no se pudo fijar el dispositivo de entrada (error \(r))") }
}

let formato = motor.inputNode.inputFormat(forBus: 0)
guard formato.channelCount > 0, formato.sampleRate > 0 else {
    abortar("la entrada no declara ni canales ni frecuencia de muestreo. "
            + "¿Está conectada la interfaz, y macOS le dio permiso de micrófono a la terminal?")
}

print("dispositivo de entrada: \(args.dispositivo ?? "(el de por omisión)")")
print("formato: \(formato.channelCount) canal(es) a \(Int(formato.sampleRate)) Hz")
print("grabando \(args.segundos) s -> \(args.salida.path)")

// **Se guarda en el formato de la entrada**, sin conversión de frecuencia ni de
// profundidad. Cada conversión es una oportunidad de meter un error de escala,
// que es exactamente el error que este proyecto ya pagó tres veces.
let ajustes: [String: Any] = [
    AVFormatIDKey: kAudioFormatLinearPCM,
    AVLinearPCMBitDepthKey: 32,
    AVLinearPCMIsFloatKey: true,
    AVLinearPCMIsNonInterleaved: false,
    AVSampleRateKey: formato.sampleRate,
    AVNumberOfChannelsKey: formato.channelCount,
]
// **Opcional y `var`, para poder cerrarlo a mano.** `AVAudioFile` escribe el
// tamaño en la cabecera recién cuando se destruye, y un `let` de nivel superior
// vive hasta que el proceso termina: ahí ya nadie corre el destructor.
//
// El resultado era un archivo con los datos completos en el disco --2,1 MB-- y
// una cabecera que decía `RIFF 4088` y `audio bytes: 0`. O sea **un archivo que
// existe, pesa lo correcto y es ilegible**, que es justo la clase de defecto
// que este proyecto persigue: el que se ve bien hasta que alguien lo abre.
var archivo: AVAudioFile?
do {
    archivo = try AVAudioFile(forWriting: args.salida, settings: ajustes,
                              commonFormat: .pcmFormatFloat32, interleaved: false)
} catch {
    abortar("no se pudo abrir el archivo de salida: \(error)")
}

// Pico por canal, para que la salida diga qué capturó sin abrir el archivo.
var picos = [Float](repeating: 0, count: Int(formato.channelCount))
var muestras = 0

motor.inputNode.installTap(onBus: 0, bufferSize: 4096, format: formato) { buffer, _ in
    do { try archivo?.write(from: buffer) } catch { return }
    muestras += Int(buffer.frameLength)
    guard let datos = buffer.floatChannelData else { return }
    for c in 0..<Int(buffer.format.channelCount) {
        var pico = picos[c]
        for i in 0..<Int(buffer.frameLength) {
            let v = abs(datos[c][i])
            if v > pico { pico = v }
        }
        picos[c] = pico
    }
}

do { try motor.start() } catch {
    abortar("no se pudo arrancar la captura: \(error). "
            + "Si dice «permiso», hay que darle acceso al micrófono a la terminal "
            + "en Ajustes del Sistema > Privacidad y seguridad > Micrófono.")
}

Thread.sleep(forTimeInterval: args.segundos)
motor.inputNode.removeTap(onBus: 0)
motor.stop()

// **Cerrar el archivo ANTES de informar.** Soltar la referencia corre el
// destructor, que es lo único que escribe el tamaño en la cabecera. Y se
// comprueba: un archivo cuyo tamaño en disco no coincide con las muestras
// capturadas no se declara bueno.
archivo = nil

let esperados = 44 + muestras * Int(formato.channelCount) * 4
let enDisco = (try? FileManager.default.attributesOfItem(atPath: args.salida.path)[.size] as? Int) ?? nil
if let real = enDisco, abs(real - esperados) > 4096 {
    abortar("el archivo quedo en \(real) bytes y las \(muestras) muestras capturadas "
            + "pedian unos \(esperados). La cabecera no se cerro bien y el archivo no "
            + "es confiable: no se usa para medir.")
}

print("muestras capturadas: \(muestras) (\(String(format: "%.2f", Double(muestras) / formato.sampleRate)) s)")
for (c, p) in picos.enumerated() {
    let db = p > 0 ? 20 * log10(Double(p)) : -Double.infinity
    print(String(format: "  canal %d: pico %.6f = %.2f dBFS", c + 1, p, db))
}
// **Silencio absoluto es un resultado, no un éxito.** Un archivo de ceros se ve
// igual que uno bueno hasta que alguien lo mira, así que se dice acá.
if picos.allSatisfy({ $0 == 0 }) {
    print("AVISO: todos los canales en cero. No entró señal por ninguna entrada.")
}
