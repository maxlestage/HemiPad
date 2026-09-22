import Foundation

/// Modificateurs clavier HID (octet 0 du rapport).
struct KeyModifier: OptionSet, Hashable, Codable, Sendable {
    let rawValue: UInt8

    static let leftControl  = KeyModifier(rawValue: 1 << 0)
    static let leftShift    = KeyModifier(rawValue: 1 << 1)
    static let leftAlt      = KeyModifier(rawValue: 1 << 2)
    static let leftGUI      = KeyModifier(rawValue: 1 << 3)
    static let rightControl = KeyModifier(rawValue: 1 << 4)
    static let rightShift   = KeyModifier(rawValue: 1 << 5)
    static let rightAlt     = KeyModifier(rawValue: 1 << 6)
    static let rightGUI     = KeyModifier(rawValue: 1 << 7)

    /// Étiquette courte affichée sur la touche collante correspondante.
    var shortLabel: String {
        switch self {
        case .leftControl, .rightControl: return "ctrl"
        case .leftShift, .rightShift: return "⇧"
        case .leftAlt, .rightAlt: return "⌥"
        case .leftGUI, .rightGUI: return "⌘"
        default: return "mod"
        }
    }

    static let stickyOrder: [KeyModifier] = [.leftShift, .leftControl, .leftAlt, .leftGUI]
}

/// Codes d'usage HID (page 0x07) pour les touches dont HemiPad a besoin.
enum KeyUsage: UInt8, Codable, CaseIterable, Sendable {
    case a = 0x04, b, c, d, e, f, g, h, i, j, k, l, m
    case n, o, p, q, r, s, t, u, v, w, x, y, z
    case one = 0x1E, two, three, four, five, six, seven, eight, nine, zero
    case enter = 0x28
    case escape = 0x29
    case backspace = 0x2A
    case tab = 0x2B
    case space = 0x2C
    case minus = 0x2D
    case equal = 0x2E
    case leftBracket = 0x2F
    case rightBracket = 0x30
    case backslash = 0x31
    case semicolon = 0x33
    case quote = 0x34
    case grave = 0x35
    case comma = 0x36
    case period = 0x37
    case slash = 0x38
    case capsLock = 0x39
    case f1 = 0x3A, f2, f3, f4, f5, f6, f7, f8, f9, f10, f11, f12
    case printScreen = 0x46
    case home = 0x4A
    case pageUp = 0x4B
    case delete = 0x4C
    case end = 0x4D
    case pageDown = 0x4E
    case rightArrow = 0x4F
    case leftArrow = 0x50
    case downArrow = 0x51
    case upArrow = 0x52
}

/// Une frappe = un usage + d'éventuels modificateurs implicites.
struct Keystroke: Equatable, Codable, Sendable {
    let usage: KeyUsage
    var modifiers: KeyModifier = []

    init(_ usage: KeyUsage, modifiers: KeyModifier = []) {
        self.usage = usage
        self.modifiers = modifiers
    }
}

extension Keystroke {
    /// Table caractère → frappe, pour taper du texte (macros, extraits de code).
    /// Basée sur une disposition US, la seule garantie par le protocole HID.
    static func stroke(for character: Character) -> Keystroke? {
        if let lower = character.lowercased().first,
           lower.isLetter,
           let ascii = lower.asciiValue,
           ascii >= 97, ascii <= 122 {
            let usage = KeyUsage(rawValue: KeyUsage.a.rawValue + (ascii - 97))
            guard let usage else { return nil }
            let needsShift = character.isUppercase
            return Keystroke(usage, modifiers: needsShift ? .leftShift : [])
        }

        switch character {
        case "1": return Keystroke(.one)
        case "2": return Keystroke(.two)
        case "3": return Keystroke(.three)
        case "4": return Keystroke(.four)
        case "5": return Keystroke(.five)
        case "6": return Keystroke(.six)
        case "7": return Keystroke(.seven)
        case "8": return Keystroke(.eight)
        case "9": return Keystroke(.nine)
        case "0": return Keystroke(.zero)
        case "\n": return Keystroke(.enter)
        case "\t": return Keystroke(.tab)
        case " ": return Keystroke(.space)
        case "-": return Keystroke(.minus)
        case "_": return Keystroke(.minus, modifiers: .leftShift)
        case "=": return Keystroke(.equal)
        case "+": return Keystroke(.equal, modifiers: .leftShift)
        case "[": return Keystroke(.leftBracket)
        case "{": return Keystroke(.leftBracket, modifiers: .leftShift)
        case "]": return Keystroke(.rightBracket)
        case "}": return Keystroke(.rightBracket, modifiers: .leftShift)
        case "\\": return Keystroke(.backslash)
        case "|": return Keystroke(.backslash, modifiers: .leftShift)
        case ";": return Keystroke(.semicolon)
        case ":": return Keystroke(.semicolon, modifiers: .leftShift)
        case "'": return Keystroke(.quote)
        case "\"": return Keystroke(.quote, modifiers: .leftShift)
        case "`": return Keystroke(.grave)
        case "~": return Keystroke(.grave, modifiers: .leftShift)
        case ",": return Keystroke(.comma)
        case "<": return Keystroke(.comma, modifiers: .leftShift)
        case ".": return Keystroke(.period)
        case ">": return Keystroke(.period, modifiers: .leftShift)
        case "/": return Keystroke(.slash)
        case "?": return Keystroke(.slash, modifiers: .leftShift)
        case "!": return Keystroke(.one, modifiers: .leftShift)
        case "@": return Keystroke(.two, modifiers: .leftShift)
        case "#": return Keystroke(.three, modifiers: .leftShift)
        case "$": return Keystroke(.four, modifiers: .leftShift)
        case "%": return Keystroke(.five, modifiers: .leftShift)
        case "^": return Keystroke(.six, modifiers: .leftShift)
        case "&": return Keystroke(.seven, modifiers: .leftShift)
        case "*": return Keystroke(.eight, modifiers: .leftShift)
        case "(": return Keystroke(.nine, modifiers: .leftShift)
        case ")": return Keystroke(.zero, modifiers: .leftShift)
        default: return nil
        }
    }

    /// Découpe une chaîne en frappes ; les caractères non représentables sur
    /// une disposition US sont ignorés plutôt que d'envoyer du bruit.
    static func strokes(for text: String) -> [Keystroke] {
        text.compactMap { stroke(for: $0) }
    }
}
