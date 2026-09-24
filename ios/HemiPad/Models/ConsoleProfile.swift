import Foundation

/// Machines cibles reconnues par HemiPad.
enum ConsoleTarget: String, Codable, CaseIterable, Identifiable, Sendable {
    case switch2
    case playstation
    case xbox
    case steam
    case retro
    case desktop

    var id: String { rawValue }
}

/// Décrit comment dessiner ET encoder la manette pour une machine donnée.
///
/// Un profil ne change jamais la géométrie accessible (elle vient de
/// `HemiplegiaProfile`) : il ne change que les étiquettes, les couleurs et la
/// table de correspondance HID.
struct ConsoleProfile: Identifiable, Equatable, Sendable {
    let target: ConsoleTarget
    let displayName: String
    /// Sous-titre affiché dans le sélecteur de console.
    let summary: String
    /// Glyphe affiché sur chaque bouton (ex. « A », « ✕ », « B »).
    let glyphs: [ControlID: String]
    /// Teinte d'accent de la machine, en hexadécimal RGB.
    let accentHex: String
    /// Certaines machines n'exposent pas de bouton « capture ».
    let availableControls: Set<ControlID>
    /// Transports connus pour fonctionner avec la machine.
    let recommendedTransports: [TransportKind]
    /// Le clavier code est-il pertinent pour cette cible ?
    let supportsKeyboard: Bool

    var id: String { target.rawValue }

    func glyph(for control: ControlID) -> String {
        glyphs[control] ?? Self.lookGlyphs[control] ?? control.fallbackLabel
    }

    /// L'arc de vision a les mêmes flèches sur toutes les consoles : des
    /// flèches pointillées, pour ne pas les confondre avec la croix.
    static let lookGlyphs: [ControlID: String] = [
        .lookLeft: "⇠", .lookUp: "⇡", .lookDown: "⇣", .lookRight: "⇢"
    ]

    /// La console a-t-elle une caméra à piloter (un stick droit) ? Les jeux
    /// rétro et le clavier d'ordinateur n'en ont pas : ni arc de vision, ni
    /// stick caméra.
    var hasCamera: Bool { has(.lookUp) }

    func has(_ control: ControlID) -> Bool {
        availableControls.contains(control)
    }

    static let allControls = Set(ControlID.allCases)
    static let cameraControls: Set<ControlID> = [.lookLeft, .lookUp, .lookDown, .lookRight]
    /// Jeux rétro et clavier d'ordinateur : ni capture, ni caméra.
    static let withoutCaptureOrCamera = Set(ControlID.allCases)
        .subtracting([.capture])
        .subtracting(cameraControls)

    static let switch2 = ConsoleProfile(
        target: .switch2,
        displayName: "Nintendo Switch",
        summary: "Profil Pro Controller · A/B inversés",
        glyphs: [
            .faceSouth: "B", .faceEast: "A", .faceWest: "Y", .faceNorth: "X",
            .shoulderLeft: "L", .shoulderRight: "R",
            .triggerLeft: "ZL", .triggerRight: "ZR",
            .start: "+", .select: "−", .home: "⌂", .capture: "◉",
            .stickLeftPress: "L3", .stickRightPress: "R3",
            .dpadUp: "▲", .dpadDown: "▼", .dpadLeft: "◀", .dpadRight: "▶"
        ],
        accentHex: "#E60012",
        availableControls: allControls,
        recommendedTransports: [.bluetoothHID],
        supportsKeyboard: false
    )

    static let playstation = ConsoleProfile(
        target: .playstation,
        displayName: "PlayStation",
        summary: "Profil DualSense · symboles ✕ ○ □ △",
        glyphs: [
            .faceSouth: "✕", .faceEast: "○", .faceWest: "□", .faceNorth: "△",
            .shoulderLeft: "L1", .shoulderRight: "R1",
            .triggerLeft: "L2", .triggerRight: "R2",
            .start: "Options", .select: "Créer", .home: "PS", .capture: "Mic",
            .stickLeftPress: "L3", .stickRightPress: "R3",
            .dpadUp: "▲", .dpadDown: "▼", .dpadLeft: "◀", .dpadRight: "▶"
        ],
        accentHex: "#2E6FF2",
        availableControls: allControls,
        recommendedTransports: [.bluetoothHID],
        supportsKeyboard: false
    )

    static let xbox = ConsoleProfile(
        target: .xbox,
        displayName: "Xbox",
        summary: "Profil Series X|S · A/B/X/Y",
        glyphs: [
            .faceSouth: "A", .faceEast: "B", .faceWest: "X", .faceNorth: "Y",
            .shoulderLeft: "LB", .shoulderRight: "RB",
            .triggerLeft: "LT", .triggerRight: "RT",
            .start: "Menu", .select: "Vue", .home: "Xbox", .capture: "Partage",
            .stickLeftPress: "LS", .stickRightPress: "RS",
            .dpadUp: "▲", .dpadDown: "▼", .dpadLeft: "◀", .dpadRight: "▶"
        ],
        accentHex: "#16C60C",
        availableControls: allControls,
        recommendedTransports: [.bluetoothHID],
        supportsKeyboard: false
    )

    static let steam = ConsoleProfile(
        target: .steam,
        displayName: "Steam Deck / PC",
        summary: "Manette XInput + clavier code",
        glyphs: [
            .faceSouth: "A", .faceEast: "B", .faceWest: "X", .faceNorth: "Y",
            .shoulderLeft: "L1", .shoulderRight: "R1",
            .triggerLeft: "L2", .triggerRight: "R2",
            .start: "Start", .select: "Select", .home: "Steam", .capture: "⋯",
            .stickLeftPress: "L3", .stickRightPress: "R3",
            .dpadUp: "▲", .dpadDown: "▼", .dpadLeft: "◀", .dpadRight: "▶"
        ],
        accentHex: "#6C63FF",
        availableControls: allControls,
        recommendedTransports: [.bluetoothHID],
        supportsKeyboard: true
    )

    static let retro = ConsoleProfile(
        target: .retro,
        displayName: "Rétro / Émulateur",
        summary: "8 boutons, pensé pour les jeux 2D",
        glyphs: [
            .faceSouth: "B", .faceEast: "A", .faceWest: "Y", .faceNorth: "X",
            .shoulderLeft: "L", .shoulderRight: "R",
            .triggerLeft: "L2", .triggerRight: "R2",
            .start: "Start", .select: "Select", .home: "Menu",
            .stickLeftPress: "L3", .stickRightPress: "R3",
            .dpadUp: "▲", .dpadDown: "▼", .dpadLeft: "◀", .dpadRight: "▶"
        ],
        accentHex: "#FF8A00",
        availableControls: withoutCaptureOrCamera,
        recommendedTransports: [.bluetoothHID],
        supportsKeyboard: true
    )

    static let desktop = ConsoleProfile(
        target: .desktop,
        displayName: "Ordinateur (clavier)",
        summary: "Clavier de code à une main + pavé souris",
        glyphs: [
            .faceSouth: "Entrée", .faceEast: "Échap", .faceWest: "Tab", .faceNorth: "Suppr",
            .shoulderLeft: "⌘", .shoulderRight: "⌥",
            .triggerLeft: "⇧", .triggerRight: "⌃",
            .start: "F5", .select: "F2", .home: "Bureau",
            .stickLeftPress: "Clic", .stickRightPress: "Clic droit",
            .dpadUp: "↑", .dpadDown: "↓", .dpadLeft: "←", .dpadRight: "→"
        ],
        accentHex: "#00E5FF",
        availableControls: withoutCaptureOrCamera,
        recommendedTransports: [.bluetoothHID],
        supportsKeyboard: true
    )

    static let all: [ConsoleProfile] = [.switch2, .playstation, .xbox, .steam, .retro, .desktop]

    static func profile(for target: ConsoleTarget) -> ConsoleProfile {
        all.first { $0.target == target } ?? .steam
    }
}

// MARK: - Bluetooth direct

/// Ce que la console accepte en Bluetooth, et le chemin qui marche.
///
/// Dit franchement : certaines consoles n'acceptent que leurs propres
/// manettes, et aucune application ne peut les convaincre du contraire. Plutôt
/// que de laisser chercher en vain, HemiPad le dit, et montre le chemin qui
/// marche sans rien acheter quand il en existe un.
struct BluetoothReach: Equatable, Sendable {
    /// La console reçoit-elle HemiPad directement en Bluetooth ?
    let acceptsDirect: Bool
    /// Une phrase : accepté ou refusé, et pourquoi.
    let verdict: String
    /// Le chemin qui marche, étape par étape.
    let steps: [String]
    /// Un réglage de la console elle-même qui aide à jouer d'une main.
    let consoleSetting: String?
}

extension ConsoleProfile {
    var bluetoothReach: BluetoothReach {
        switch target {
        case .switch2:
            return BluetoothReach(
                acceptsDirect: false,
                verdict: "Bluetooth direct refusé par la console : la Switch n'accepte que les manettes Nintendo et celles qu'elle a certifiées. Aucune application iPhone ou iPad ne peut s'y connecter.",
                steps: [
                    "La Switch n'a ni lecture à distance ni application pour ordinateur : il n'existe pas de chemin sans matériel.",
                    "Si le jeu existe aussi sur ordinateur ou sur Android, jouez-y avec HemiPad en Bluetooth direct."
                ],
                consoleSetting: "Sur la console : Paramètres de la console › Manettes et capteurs › Changer l'assignation des boutons, pour rassembler les commandes utiles sous une main."
            )
        case .playstation:
            return BluetoothReach(
                acceptsDirect: false,
                verdict: "Bluetooth direct refusé par la console : la PS5 n'accepte que les manettes PlayStation et quelques manettes sous licence.",
                steps: [
                    "Sur la PS5 : Paramètres › Système › Lecture à distance › Activer la lecture à distance.",
                    "Sur un ordinateur Windows ou Linux, installez chiaki-ng, gratuit et libre : il affiche la PS5 et lui relaie la manette.",
                    "Appairez HemiPad à l'ordinateur en Bluetooth direct, puis ouvrez la PS5 dans chiaki-ng : chaque appui part vers la console, avec le léger délai de la lecture à distance."
                ],
                consoleSetting: "Sur la console : Paramètres › Accessibilité › Manettes › Attributions personnalisées des touches."
            )
        case .xbox:
            return BluetoothReach(
                acceptsDirect: false,
                verdict: "Bluetooth direct refusé par la console : la Xbox n'appaire aucune manette en Bluetooth, elle ne parle que son propre protocole sans fil.",
                steps: [
                    "Sur la Xbox : Paramètres › Appareils et connexions › Fonctionnalités à distance › Activer les fonctionnalités à distance.",
                    "Sur un PC Windows, ouvrez l'application Xbox (gratuite), choisissez la console, puis Lecture à distance.",
                    "Appairez HemiPad au PC en Bluetooth direct. Si l'application ne réagit pas, lancez-la depuis Steam (gratuit) : Steam présente toute manette comme une manette Xbox."
                ],
                consoleSetting: nil
            )
        case .steam:
            return BluetoothReach(
                acceptsDirect: true,
                verdict: "Bluetooth direct accepté : Windows, Linux et le Steam Deck appairent HemiPad comme une manette.",
                steps: [
                    "Sur la machine : réglages Bluetooth › ajouter un appareil › HemiPad.",
                    "Dans Steam, la manette apparaît dans Paramètres › Manette : attribuez les touches une fois, Steam s'en souvient."
                ],
                consoleSetting: nil
            )
        case .retro:
            return BluetoothReach(
                acceptsDirect: true,
                verdict: "Bluetooth direct accepté : les émulateurs sur ordinateur (Windows, Linux) et sur Android reçoivent HemiPad comme une manette.",
                steps: [
                    "Sur la machine : réglages Bluetooth › ajouter un appareil › HemiPad.",
                    "Dans l'émulateur, attribuez les touches une fois : il s'en souvient."
                ],
                consoleSetting: nil
            )
        case .desktop:
            return BluetoothReach(
                acceptsDirect: true,
                verdict: "Bluetooth direct accepté : Windows, Linux et Android reçoivent HemiPad comme un clavier.",
                steps: [
                    "Sur la machine : réglages Bluetooth › ajouter un appareil › HemiPad."
                ],
                consoleSetting: nil
            )
        }
    }
}
