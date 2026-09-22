import SwiftUI

/// Bandeau d'état : où va le signal, et qu'est-ce qui reste verrouillé.
///
/// Le bouton « Tout relâcher » est volontairement le plus gros élément :
/// c'est la sortie de secours quand un spasme a verrouillé une gâchette.
struct StatusBarView: View {
    @EnvironmentObject private var state: AppState
    @EnvironmentObject private var transport: TransportCoordinator
    @EnvironmentObject private var arbiter: InputArbiter
    @EnvironmentObject private var sticky: StickyModifierEngine

    var body: some View {
        HStack(spacing: 10) {
            Circle()
                .fill(indicatorColor)
                .frame(width: 10, height: 10)
                .overlay(Circle().strokeBorder(.white.opacity(0.35), lineWidth: 1))

            VStack(alignment: .leading, spacing: 1) {
                Text(state.console.displayName)
                    .font(.footnote.weight(.semibold))
                Text(transport.state.label)
                    .font(.caption2)
                    .foregroundStyle(Theme.secondaryText)
                    .lineLimit(1)
            }

            Spacer(minLength: 4)

            if !arbiter.latched.isEmpty || !sticky.effective.isEmpty {
                Button {
                    state.clearEverything()
                } label: {
                    Label("Tout relâcher", systemImage: "hand.raised.slash")
                        .font(.caption.weight(.bold))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(Capsule().fill(Theme.danger.opacity(0.9)))
                        .foregroundStyle(.white)
                }
                .buttonStyle(.plain)
                .accessibilityHint(Text("Relâche tous les boutons et modificateurs verrouillés"))
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Theme.surface.opacity(0.85))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(state.accent.opacity(0.25), lineWidth: 1)
        )
    }

    private var indicatorColor: Color {
        switch transport.state {
        case .connected: return .green
        case .advertising, .connecting, .preparing: return Theme.latchAccent
        case .failed: return Theme.danger
        case .idle: return Theme.secondaryText
        }
    }
}
