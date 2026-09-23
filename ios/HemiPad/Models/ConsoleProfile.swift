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
        glyphs[control] ?? control.fallbackLabel
    }

    func has(_ control: ControlID) -> Bool {
        availableControls.contains(control)
    }

    static let allControls = Set(ControlID.allCases)
    static let withoutCapture = Set(ControlID.allCases).subtracting([.capture])

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
        availableControls: withoutCapture,
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
        availableControls: withoutCapture,
        recommendedTransports: [.bluetoothHID],
        supportsKeyboard: true
    )

    static let all: [ConsoleProfile] = [.switch2, .playstation, .xbox, .steam, .retro, .desktop]

    static func profile(for target: ConsoleTarget) -> ConsoleProfile {
        all.first { $0.target == target } ?? .steam
    }
}
