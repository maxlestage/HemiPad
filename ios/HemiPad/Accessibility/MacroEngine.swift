import Foundation

/// Une macro : une suite de frappes ou d'appuis déclenchée par une seule cible.
///
/// Pour du code, une main suffit rarement à écrire `func () {}` ; une macro
/// l'écrit d'un coup et replace le curseur. Pour le jeu, elle enchaîne un
/// combo qui demanderait trois doigts.
struct Macro: Identifiable, Codable, Equatable, Sendable {
    enum Step: Codable, Equatable, Sendable {
        /// Texte tapé caractère par caractère.
        case text(String)
        /// Frappe unique avec modificateurs (raccourci).
        case shortcut(Keystroke)
        /// Appui manette maintenu pendant une durée.
        case hold(ControlID, seconds: TimeInterval)
        /// Pause entre deux étapes.
        case pause(seconds: TimeInterval)
        /// Recule le curseur de n caractères (pour se placer entre des accolades).
        case moveLeft(Int)
    }

    var id: UUID = UUID()
    var title: String
    var subtitle: String
    var steps: [Step]
    /// Une macro « code » n'apparaît que sur l'écran clavier.
    var isCodeMacro: Bool

    static let codeDefaults: [Macro] = [
        Macro(
            title: "()",
            subtitle: "Parenthèses + curseur au milieu",
            steps: [.text("()"), .moveLeft(1)],
            isCodeMacro: true
        ),
        Macro(
            title: "{}",
            subtitle: "Bloc + curseur au milieu",
            steps: [.text("{}"), .moveLeft(1)],
            isCodeMacro: true
        ),
        Macro(
            title: "[]",
            subtitle: "Crochets + curseur au milieu",
            steps: [.text("[]"), .moveLeft(1)],
            isCodeMacro: true
        ),
        Macro(
            title: "=>",
            subtitle: "Fonction fléchée",
            steps: [.text(" => ")],
            isCodeMacro: true
        ),
        Macro(
            title: "Sauver",
            subtitle: "Ctrl/⌘ + S",
            steps: [.shortcut(Keystroke(.s, modifiers: .leftGUI))],
            isCodeMacro: true
        ),
        Macro(
            title: "Annuler",
            subtitle: "Ctrl/⌘ + Z",
            steps: [.shortcut(Keystroke(.z, modifiers: .leftGUI))],
            isCodeMacro: true
        ),
        Macro(
            title: "Palette",
            subtitle: "⌘ + ⇧ + P",
            steps: [.shortcut(Keystroke(.p, modifiers: [.leftGUI, .leftShift]))],
            isCodeMacro: true
        ),
        Macro(
            title: "Terminal",
            subtitle: "Ctrl + ` ",
            steps: [.shortcut(Keystroke(.grave, modifiers: .leftControl))],
            isCodeMacro: true
        )
    ]

    static let gameDefaults: [Macro] = [
        Macro(
            title: "Sprint saut",
            subtitle: "Maintien gâchette + saut",
            steps: [.hold(.triggerLeft, seconds: 0.6), .pause(seconds: 0.05), .hold(.faceSouth, seconds: 0.12)],
            isCodeMacro: false
        ),
        Macro(
            title: "Viser tirer",
            subtitle: "Visée puis tir court",
            steps: [.hold(.triggerLeft, seconds: 0.35), .hold(.triggerRight, seconds: 0.15)],
            isCodeMacro: false
        ),
        Macro(
            title: "Pause",
            subtitle: "Ouvre le menu du jeu",
            steps: [.hold(.start, seconds: 0.1)],
            isCodeMacro: false
        )
    ]
}

/// Exécute les macros en série, sans bloquer l'interface.
@MainActor
final class MacroRunner: ObservableObject {
    @Published private(set) var running: Macro.ID?

    private let keyboardSender: (Keystroke) async -> Void
    private let controlSender: (ControlID, Bool) -> Void

    init(
        keyboardSender: @escaping (Keystroke) async -> Void,
        controlSender: @escaping (ControlID, Bool) -> Void
    ) {
        self.keyboardSender = keyboardSender
        self.controlSender = controlSender
    }

    func run(_ macro: Macro) {
        guard running == nil else { return }
        running = macro.id
        Task { [weak self] in
            guard let self else { return }
            for step in macro.steps {
                await self.perform(step)
            }
            await MainActor.run { self.running = nil }
        }
    }

    private func perform(_ step: Macro.Step) async {
        switch step {
        case .text(let text):
            for stroke in Keystroke.strokes(for: text) {
                await keyboardSender(stroke)
                try? await Task.sleep(nanoseconds: 12_000_000)
            }
        case .shortcut(let stroke):
            await keyboardSender(stroke)
        case .hold(let control, let seconds):
            controlSender(control, true)
            try? await Task.sleep(nanoseconds: UInt64(max(seconds, 0) * 1_000_000_000))
            controlSender(control, false)
        case .pause(let seconds):
            try? await Task.sleep(nanoseconds: UInt64(max(seconds, 0) * 1_000_000_000))
        case .moveLeft(let count):
            for _ in 0..<max(count, 0) {
                await keyboardSender(Keystroke(.leftArrow))
                try? await Task.sleep(nanoseconds: 12_000_000)
            }
        }
    }
}
