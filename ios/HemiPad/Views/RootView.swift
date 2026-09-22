import SwiftUI

/// Navigation principale.
///
/// La barre d'onglets est placée en bas et reste atteignable : c'est l'endroit
/// le plus proche du pouce sur un téléphone tenu à une main. L'écran manette
/// est l'onglet par défaut parce que c'est celui qu'on ouvre en urgence.
struct RootView: View {
    @EnvironmentObject private var state: AppState
    @State private var tab: Tab = .controller

    enum Tab: String, CaseIterable, Identifiable {
        case controller
        case keyboard
        case connect
        case settings

        var id: String { rawValue }

        var title: String {
            switch self {
            case .controller: return "Manette"
            case .keyboard: return "Clavier"
            case .connect: return "Connexion"
            case .settings: return "Réglages"
            }
        }

        var symbol: String {
            switch self {
            case .controller: return "gamecontroller.fill"
            case .keyboard: return "keyboard.fill"
            case .connect: return "antenna.radiowaves.left.and.right"
            case .settings: return "slider.horizontal.3"
            }
        }
    }

    private var tabs: [Tab] {
        // Le clavier n'a de sens que sur une machine qui en accepte un.
        state.console.supportsKeyboard ? Tab.allCases : Tab.allCases.filter { $0 != .keyboard }
    }

    var body: some View {
        VStack(spacing: 0) {
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            tabBar
        }
        .background(Theme.background.ignoresSafeArea())
        .onChange(of: tab) { _ in
            // Changer d'écran ne doit jamais laisser un bouton coincé.
            state.arbiter.clearLatches()
        }
    }

    @ViewBuilder
    private var content: some View {
        switch tab {
        case .controller: ControllerScreen()
        case .keyboard: KeyboardScreen()
        case .connect: ConnectScreen()
        case .settings: SettingsScreen()
        }
    }

    private var tabBar: some View {
        HStack(spacing: 6) {
            ForEach(tabs) { item in
                Button {
                    tab = item
                    Haptics.shared.latch()
                } label: {
                    VStack(spacing: 3) {
                        Image(systemName: item.symbol)
                            .font(.system(size: 18, weight: .semibold))
                        Text(item.title)
                            .font(.system(size: 10, weight: .semibold))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(
                        RoundedRectangle(cornerRadius: 14)
                            .fill(tab == item ? state.accent.opacity(0.2) : Color.clear)
                    )
                    .foregroundStyle(tab == item ? state.accent : Theme.secondaryText)
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(tab == item ? [.isButton, .isSelected] : .isButton)
            }
        }
        .padding(.horizontal, 10)
        .padding(.top, 6)
        .background(.ultraThinMaterial)
    }
}

#Preview {
    RootView()
        .hemipadEnvironment(AppState.preview)
}
