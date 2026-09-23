import SwiftUI

/// Choix de la machine et du chemin de connexion.
struct ConnectScreen: View {
    @EnvironmentObject private var state: AppState
    @EnvironmentObject private var transport: TransportCoordinator

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                StatusBarView()

                section("Console") {
                    ForEach(ConsoleProfile.all) { profile in
                        Button {
                            state.consoleTarget = profile.target
                            Haptics.shared.success()
                        } label: {
                            HStack(spacing: 12) {
                                RoundedRectangle(cornerRadius: 10)
                                    .fill(Theme.color(hex: profile.accentHex))
                                    .frame(width: 6, height: 38)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(profile.displayName)
                                        .font(.body.weight(.semibold))
                                    Text(profile.summary)
                                        .font(.caption)
                                        .foregroundStyle(Theme.secondaryText)
                                }
                                Spacer()
                                if state.consoleTarget == profile.target {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundStyle(Theme.color(hex: profile.accentHex))
                                }
                            }
                            .padding(12)
                            .background(
                                RoundedRectangle(cornerRadius: Theme.cardRadius)
                                    .fill(Theme.surface.opacity(state.consoleTarget == profile.target ? 1 : 0.6))
                            )
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(state.consoleTarget == profile.target ? [.isButton, .isSelected] : .isButton)
                    }
                }

                section("Chemin de connexion") {
                    ForEach(TransportKind.allCases) { kind in
                        Button {
                            transport.kind = kind
                            transport.connect()
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                HStack {
                                    Text(kind.label).font(.body.weight(.semibold))
                                    Spacer()
                                    if transport.kind == kind {
                                        Image(systemName: "checkmark.circle.fill")
                                            .foregroundStyle(state.accent)
                                    }
                                }
                                Text(kind.detail)
                                    .font(.caption)
                                    .foregroundStyle(Theme.secondaryText)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            .padding(12)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(
                                RoundedRectangle(cornerRadius: Theme.cardRadius)
                                    .fill(Theme.surface.opacity(transport.kind == kind ? 1 : 0.6))
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }

                if transport.kind == .bluetoothHID {
                    section("Avec quoi ça marche") {
                        VStack(alignment: .leading, spacing: 10) {
                            Label("Ordinateurs Windows et Linux, appareils Android : l'appareil s'y appaire comme une manette Bluetooth, sans boîtier ni câble.", systemImage: "checkmark.circle.fill")
                            Label("Switch, PS5 et Xbox n'acceptent en Bluetooth que leurs propres manettes : aucune manette d'une autre marque ne s'y connecte directement.", systemImage: "xmark.circle.fill")
                        }
                        .font(.caption)
                        .foregroundStyle(Theme.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                    }

                    section("Le nom que verra la machine") {
                        // HemiPad s'annonce sous son propre nom, mais une fois
                        // appairée, la machine lit le nom de l'appareil, que
                        // seul iOS fixe. Le renommer est gratuit et définitif.
                        Text("Pendant la recherche, la machine voit « HemiPad ». Après l'appairage, elle affiche le nom de l'appareil : pour qu'elle ne voie jamais « iPhone » ni « iPad », renommez-le « HemiPad » dans Réglages › Général › Informations › Nom.")
                            .font(.caption)
                            .foregroundStyle(Theme.secondaryText)
                            .fixedSize(horizontal: false, vertical: true)
                        Button {
                            transport.connect()
                        } label: {
                            Text("Relancer l'annonce Bluetooth")
                                .font(.callout.weight(.semibold))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                                .background(RoundedRectangle(cornerRadius: 14).fill(state.accent))
                                .foregroundStyle(Theme.background)
                        }
                        .buttonStyle(.plain)
                    }
                }

                if case .failed(let reason) = transport.state {
                    VStack(alignment: .leading, spacing: 8) {
                        Label(reason, systemImage: "exclamationmark.triangle.fill")
                            .font(.callout.weight(.semibold))
                            .foregroundStyle(Theme.danger)
                        Button {
                            transport.retry()
                        } label: {
                            Text("Réessayer")
                                .font(.callout.weight(.semibold))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                                .background(RoundedRectangle(cornerRadius: 12).fill(Theme.surfaceHigh))
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(14)
                    .background(RoundedRectangle(cornerRadius: Theme.cardRadius).fill(Theme.danger.opacity(0.12)))
                }
            }
            .padding(14)
        }
        .background(AuroraBackground(reducedMotion: state.profile.reducedMotion))
    }

    @ViewBuilder
    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title.uppercased())
                .font(.caption.weight(.bold))
                .foregroundStyle(Theme.secondaryText)
                .accessibilityAddTraits(.isHeader)
            content()
        }
    }
}

#Preview {
    ConnectScreen()
        .hemipadEnvironment(AppState.preview)
}
