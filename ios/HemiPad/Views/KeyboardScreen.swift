import SwiftUI

/// Clavier de code à une main.
///
/// Le clavier système d'iOS suppose deux pouces et une disposition figée. Ici,
/// trois choix changent tout : les touches sont rangées du côté de la main
/// valide, les modificateurs sont collants (⌘ puis ⇧ puis P, jamais les trois
/// ensemble), et les caractères les plus coûteux à taper en code — accolades,
/// flèches, point-virgule — sont des macros d'un seul appui.
struct KeyboardScreen: View {
    @EnvironmentObject private var state: AppState
    @EnvironmentObject private var sticky: StickyModifierEngine
    @EnvironmentObject private var transport: TransportCoordinator

    @State private var page: KeyPage = .letters

    enum KeyPage: String, CaseIterable, Identifiable {
        case letters
        case symbols
        case navigation

        var id: String { rawValue }
        var label: String {
            switch self {
            case .letters: return "abc"
            case .symbols: return "#+="
            case .navigation: return "↑↓"
            }
        }
    }

    var body: some View {
        VStack(spacing: 12) {
            StatusBarView()
            macroStrip
            pagePicker
            keyGrid
            bottomRow
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: alignmentForHand)
        .background(AuroraBackground(reducedMotion: state.profile.reducedMotion))
    }

    /// Le clavier se colle au bord de la main valide : un pouce droit n'ira
    /// jamais chercher une touche collée au bord gauche de l'écran.
    private var alignmentForHand: Alignment {
        state.profile.dominantHand == .right ? .bottomTrailing : .bottomLeading
    }

    // MARK: - Bandes

    private var macroStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(state.macros.filter(\.isCodeMacro)) { macro in
                    Button {
                        state.run(macro)
                    } label: {
                        VStack(spacing: 2) {
                            Text(macro.title)
                                .font(.system(size: 16, weight: .bold, design: .monospaced))
                            Text(macro.subtitle)
                                .font(.system(size: 9))
                                .foregroundStyle(Theme.secondaryText)
                                .lineLimit(1)
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(RoundedRectangle(cornerRadius: 12).fill(Theme.surface))
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .strokeBorder(state.accent.opacity(0.3), lineWidth: 1)
                        )
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(Text("\(macro.title). \(macro.subtitle)"))
                }
            }
            .padding(.vertical, 2)
        }
        .frame(height: 56)
    }

    private var pagePicker: some View {
        HStack(spacing: 8) {
            ForEach(KeyPage.allCases) { item in
                Button {
                    page = item
                    Haptics.shared.latch()
                } label: {
                    Text(item.label)
                        .font(.system(size: 15, weight: .semibold, design: .monospaced))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(
                            RoundedRectangle(cornerRadius: 12)
                                .fill(page == item ? state.accent.opacity(0.85) : Theme.surface)
                        )
                        .foregroundStyle(page == item ? Theme.background : Theme.primaryText)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var keyGrid: some View {
        let keys = Self.keys(for: page)
        let columns = Array(
            repeating: GridItem(.flexible(), spacing: 8),
            count: page == .navigation ? 4 : 6
        )
        return LazyVGrid(columns: columns, spacing: 8) {
            ForEach(keys, id: \.id) { key in
                KeyCapView(
                    key: key,
                    height: max(48, state.profile.baseTargetSize * 0.85),
                    accent: state.accent
                ) {
                    state.sendKeystroke(key.stroke)
                }
            }
        }
    }

    private var bottomRow: some View {
        HStack(spacing: 8) {
            ForEach(KeyModifier.stickyOrder, id: \.rawValue) { modifier in
                Button {
                    state.toggleModifier(modifier)
                } label: {
                    Text(modifier.shortLabel)
                        .font(.system(size: 15, weight: .bold, design: .rounded))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(
                            RoundedRectangle(cornerRadius: 14)
                                .fill(background(for: modifier))
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 14)
                                .strokeBorder(
                                    sticky.locked.contains(modifier) ? Theme.latchAccent : .clear,
                                    lineWidth: 3
                                )
                        )
                        .foregroundStyle(
                            sticky.effective.contains(modifier) ? Theme.background : Theme.primaryText
                        )
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text(modifier.shortLabel))
                .accessibilityValue(Text(modifierState(modifier)))
                .accessibilityHint(Text("Double appui pour verrouiller"))
            }

            Button {
                state.sendKeystroke(Keystroke(.space))
            } label: {
                Image(systemName: "space")
                    .font(.system(size: 16, weight: .semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(RoundedRectangle(cornerRadius: 14).fill(Theme.surfaceHigh))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text("Espace"))

            Button {
                state.sendKeystroke(Keystroke(.backspace))
            } label: {
                Image(systemName: "delete.left")
                    .font(.system(size: 16, weight: .semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(RoundedRectangle(cornerRadius: 14).fill(Theme.surfaceHigh))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text("Effacer"))
        }
    }

    private func background(for modifier: KeyModifier) -> Color {
        if sticky.locked.contains(modifier) { return Theme.latchAccent.opacity(0.9) }
        if sticky.armed.contains(modifier) { return state.accent.opacity(0.85) }
        return Theme.surface
    }

    private func modifierState(_ modifier: KeyModifier) -> String {
        if sticky.locked.contains(modifier) { return "verrouillé" }
        if sticky.armed.contains(modifier) { return "armé pour la prochaine touche" }
        return "inactif"
    }

    // MARK: - Dispositions

    struct Key: Identifiable {
        let id: String
        let label: String
        let stroke: Keystroke
        var isWide = false

        init(_ label: String, _ stroke: Keystroke, isWide: Bool = false) {
            id = label
            self.label = label
            self.stroke = stroke
            self.isWide = isWide
        }
    }

    /// Les lettres suivent l'ordre alphabétique et non QWERTY : à une main et
    /// sans mémoire musculaire de clavier, chercher « où est le W » coûte plus
    /// cher que balayer un ordre connu de tout le monde.
    static func keys(for page: KeyPage) -> [Key] {
        switch page {
        case .letters:
            let letters = "abcdefghijklmnopqrstuvwxyz"
            var keys = letters.compactMap { character -> Key? in
                guard let stroke = Keystroke.stroke(for: character) else { return nil }
                return Key(String(character), stroke)
            }
            keys.append(contentsOf: [
                Key("↵", Keystroke(.enter)),
                Key("⇥", Keystroke(.tab)),
                Key("esc", Keystroke(.escape)),
                Key(".", Keystroke(.period))
            ])
            return keys
        case .symbols:
            let symbols = "0123456789_-=+/*<>(){}[];:'\"`~!?#$%&|\\.,@^"
            return symbols.compactMap { character in
                guard let stroke = Keystroke.stroke(for: character) else { return nil }
                return Key(String(character), stroke)
            }
        case .navigation:
            return [
                Key("↑", Keystroke(.upArrow)),
                Key("↓", Keystroke(.downArrow)),
                Key("←", Keystroke(.leftArrow)),
                Key("→", Keystroke(.rightArrow)),
                Key("⇱", Keystroke(.home)),
                Key("⇲", Keystroke(.end)),
                Key("⇞", Keystroke(.pageUp)),
                Key("⇟", Keystroke(.pageDown)),
                Key("⌫", Keystroke(.backspace)),
                Key("⌦", Keystroke(.delete)),
                Key("↵", Keystroke(.enter)),
                Key("esc", Keystroke(.escape)),
                Key("F2", Keystroke(.f2)),
                Key("F5", Keystroke(.f5)),
                Key("F11", Keystroke(.f11)),
                Key("F12", Keystroke(.f12))
            ]
        }
    }
}

/// Une touche. Grande, lisible, avec un retour d'appui immédiat : le doigt qui
/// revient d'un aller-retour long a besoin de savoir qu'il a touché juste.
struct KeyCapView: View {
    let key: KeyboardScreen.Key
    let height: CGFloat
    let accent: Color
    let action: () -> Void

    @State private var isPressed = false

    var body: some View {
        Text(key.label)
            .font(.system(size: 17, weight: .medium, design: .monospaced))
            .frame(maxWidth: .infinity)
            .frame(height: height)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(isPressed ? accent.opacity(0.85) : Theme.surface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .strokeBorder(accent.opacity(0.18), lineWidth: 1)
            )
            .foregroundStyle(isPressed ? Theme.background : Theme.primaryText)
            .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { _ in
                        guard !isPressed else { return }
                        isPressed = true
                        action()
                    }
                    .onEnded { _ in isPressed = false }
            )
            .accessibilityElement()
            .accessibilityLabel(Text(key.label))
            .accessibilityAddTraits(.isKeyboardKey)
            .accessibilityAction(.default, action)
    }
}

#Preview {
    KeyboardScreen()
        .hemipadEnvironment(AppState.preview)
}
