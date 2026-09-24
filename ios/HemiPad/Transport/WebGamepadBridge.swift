import CoreGraphics
import Foundation

/// La manette HemiPad, vue par une page web : un « Gamepad » standard.
///
/// La lecture à distance de la Xbox tourne dans une page (xbox.com/play) qui
/// lit les manettes par l'API Gamepad du navigateur. HemiPad y ajoute la
/// sienne : une manette virtuelle, au format standard du W3C, dont l'état
/// vient de l'arbitre d'entrées — les mêmes boutons, les mêmes réglages
/// d'accessibilité qu'en Bluetooth.
///
/// Sécurité : la manette n'existe que sur xbox.com, et la page ne peut
/// naviguer que vers les domaines de Microsoft et de la Xbox. Aucun message
/// ne remonte de la page vers l'application.
enum WebGamepadBridge {
    /// Nombre de boutons : les 17 du format standard, plus « Partage ».
    static let buttonCount = 18

    /// Adresse de départ : la lecture à distance et le cloud de la Xbox.
    static let startURL = URL(string: "https://www.xbox.com/play")!

    /// Domaines où la page peut naviguer : la Xbox et la connexion au compte
    /// Microsoft. Tout le reste s'ouvre dans Safari, hors de HemiPad.
    static let allowedDomains = [
        "xbox.com",
        "xboxlive.com",
        "live.com",
        "microsoft.com",
        "microsoftonline.com",
        "msauth.net",
        "msftauth.net"
    ]

    /// Une navigation est-elle permise dans la vue de jeu ? HTTPS seulement,
    /// et un domaine de la liste ou l'un de ses sous-domaines — jamais
    /// « xbox.com.exemple.fr » ni « faux-xbox.com ».
    static func isAllowed(_ url: URL) -> Bool {
        if url.absoluteString == "about:blank" { return true }
        guard url.scheme?.lowercased() == "https", let host = url.host?.lowercased() else { return false }
        return allowedDomains.contains { host == $0 || host.hasSuffix("." + $0) }
    }

    /// Valeurs des boutons (0…1) dans l'ordre du format standard.
    static func buttons(for state: GamepadState) -> [Double] {
        var values = [Double](repeating: 0, count: buttonCount)
        let mapping: [(Int, ControlID)] = [
            (0, .faceSouth), (1, .faceEast), (2, .faceWest), (3, .faceNorth),
            (4, .shoulderLeft), (5, .shoulderRight),
            (8, .select), (9, .start),
            (10, .stickLeftPress), (11, .stickRightPress),
            (12, .dpadUp), (13, .dpadDown), (14, .dpadLeft), (15, .dpadRight),
            (16, .home), (17, .capture)
        ]
        for (index, control) in mapping where state.isPressed(control) {
            values[index] = 1
        }
        values[6] = clamp(state.leftTrigger, 0, 1)
        values[7] = clamp(state.rightTrigger, 0, 1)
        return values
    }

    /// Axes du format standard : X vers la droite, Y vers le **bas** — à
    /// l'inverse de HemiPad, où Y positif monte.
    static func axes(for state: GamepadState) -> [Double] {
        [
            clamp(Double(state.leftStick.x), -1, 1),
            clamp(Double(-state.leftStick.y), -1, 1),
            clamp(Double(state.rightStick.x), -1, 1),
            clamp(Double(-state.rightStick.y), -1, 1)
        ]
    }

    /// L'appel qui transmet un état à la page. Que des nombres, formatés ici :
    /// rien qui vienne d'ailleurs n'entre dans le script.
    static func updateScript(for state: GamepadState) -> String {
        let buttons = buttons(for: state).map(format).joined(separator: ",")
        let axes = axes(for: state).map(format).joined(separator: ",")
        return "window.__hemipad&&window.__hemipad.update([\(buttons)],[\(axes)])"
    }

    /// Script injecté au chargement de chaque page, avant les siens. Hors de
    /// xbox.com, il ne fait rien.
    static let injectedScript = """
    (() => {
      if (!/(^|\\.)xbox\\.com$/.test(location.hostname)) return
      if (window.__hemipad) return
      const boutons = Array.from({ length: \(buttonCount) }, () => 0)
      const axes = [0, 0, 0, 0]
      let horodatage = performance.now()
      let branchee = false
      const manette = {
        id: 'HemiPad (STANDARD GAMEPAD)',
        index: 0,
        connected: true,
        mapping: 'standard',
        vibrationActuator: null,
        hapticActuators: [],
        get timestamp() { return horodatage },
        get axes() { return axes.slice() },
        get buttons() { return boutons.map((v) => ({ pressed: v > 0.1, touched: v > 0, value: v })) }
      }
      const natives = navigator.getGamepads ? navigator.getGamepads.bind(navigator) : () => []
      navigator.getGamepads = function () {
        const liste = Array.from(natives() || [])
        if (!branchee) return liste
        let place = liste.findIndex((m) => !m)
        if (place === -1) place = liste.length
        manette.index = place
        liste[place] = manette
        return liste
      }
      const annoncer = () => {
        const evenement = new Event('gamepadconnected')
        Object.defineProperty(evenement, 'gamepad', { value: manette })
        window.dispatchEvent(evenement)
      }
      Object.defineProperty(window, '__hemipad', {
        value: Object.freeze({
          update(b, a) {
            for (let i = 0; i < boutons.length; i++) boutons[i] = Number(b[i]) || 0
            for (let i = 0; i < axes.length; i++) axes[i] = Number(a[i]) || 0
            horodatage = performance.now()
            if (!branchee) { branchee = true; annoncer() }
          }
        }),
        writable: false,
        configurable: false
      })
    })()
    """

    // MARK: - Détails

    private static func clamp(_ value: Double, _ low: Double, _ high: Double) -> Double {
        guard value.isFinite else { return 0 }
        return min(max(value, low), high)
    }

    private static func format(_ value: Double) -> String {
        String(format: "%.3f", value)
    }
}
