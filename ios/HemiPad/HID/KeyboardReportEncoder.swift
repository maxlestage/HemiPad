import Foundation

/// Construit les rapports clavier de 8 octets.
///
/// Le clavier HID est un tableau : jusqu'à six touches simultanées, plus un
/// octet de modificateurs. HemiPad n'envoie jamais plus d'une touche « normale »
/// à la fois (une seule main, un seul doigt), mais l'encodeur reste générique
/// pour les macros qui enchaînent des accords.
struct KeyboardReportEncoder {
    static let payloadLength = 8
    static let maxSimultaneousKeys = 6

    func encode(modifiers: KeyModifier, keys: [KeyUsage]) -> [UInt8] {
        var report = [UInt8](repeating: 0, count: Self.payloadLength)
        report[0] = modifiers.rawValue
        report[1] = 0 // octet réservé
        for (index, key) in keys.prefix(Self.maxSimultaneousKeys).enumerated() {
            report[2 + index] = key.rawValue
        }
        return report
    }

    /// Rapport « toutes touches relâchées ».
    func releaseAll() -> [UInt8] {
        [UInt8](repeating: 0, count: Self.payloadLength)
    }

    /// Paire appui/relâchement pour une frappe unique.
    func pressAndRelease(_ stroke: Keystroke, heldModifiers: KeyModifier = []) -> [[UInt8]] {
        let modifiers = heldModifiers.union(stroke.modifiers)
        return [
            encode(modifiers: modifiers, keys: [stroke.usage]),
            releaseAll()
        ]
    }
}
