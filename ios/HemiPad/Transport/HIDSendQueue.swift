import Foundation

/// La file des rapports HID en attente, quand la radio ne suit pas.
///
/// `updateValue` refuse un rapport dès que la file d'émission de CoreBluetooth
/// est pleine — ce qui arrive vite : un geste produit des dizaines de rapports
/// par seconde, une liaison Bluetooth basse consommation en passe bien moins.
/// Le rapport refusé était jeté. Or le dernier rapport d'un geste, c'est très
/// souvent le relâchement : le jeter laissait le bouton enfoncé côté console,
/// le personnage continuait de courir.
///
/// Deux règles, parce que les deux rapports ne disent pas la même chose :
///
/// - **La manette décrit un état.** Seul le plus récent compte : un nouvel état
///   remplace celui qui attendait encore. Rien de périmé ne part, et l'état
///   final — boutons relâchés compris — part toujours.
/// - **Le clavier décrit des événements.** Un appui puis un relâchement, c'est
///   une lettre ; n'en garder que le dernier, c'est la perdre. Les rapports
///   clavier partent donc tous, dans l'ordre. Si la file déborde quand même,
///   ce sont les plus anciens qui tombent : le dernier, l'état actuel du
///   clavier, reste.
struct HIDSendQueue {
    struct Entry: Equatable {
        let reportID: HIDReportDescriptors.ReportID
        let payload: [UInt8]
    }

    private(set) var entries: [Entry] = []
    let keyboardCapacity: Int

    init(keyboardCapacity: Int = 64) {
        self.keyboardCapacity = max(1, keyboardCapacity)
    }

    var isEmpty: Bool { entries.isEmpty }

    mutating func enqueue(_ reportID: HIDReportDescriptors.ReportID, payload: [UInt8]) {
        switch reportID {
        case .gamepad:
            entries.removeAll { $0.reportID == .gamepad }
            entries.append(Entry(reportID: .gamepad, payload: payload))
        case .keyboard:
            entries.append(Entry(reportID: .keyboard, payload: payload))
            var excess = entries.filter { $0.reportID == .keyboard }.count - keyboardCapacity
            while excess > 0, let oldest = entries.firstIndex(where: { $0.reportID == .keyboard }) {
                entries.remove(at: oldest)
                excess -= 1
            }
        }
    }

    /// Émet dans l'ordre tant que `send` accepte, et garde le reste pour le
    /// prochain « prêt » de la radio.
    mutating func drain(_ send: (Entry) -> Bool) {
        while let first = entries.first {
            guard send(first) else { return }
            entries.removeFirst()
        }
    }

    mutating func removeAll() {
        entries.removeAll()
    }
}
