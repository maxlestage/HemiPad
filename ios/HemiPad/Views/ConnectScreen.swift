import SwiftUI

/// Choix de la machine et du chemin de connexion.
struct ConnectScreen: View {
    @EnvironmentObject private var state: AppState
    @EnvironmentObject private var transport: TransportCoordinator
    @EnvironmentObject private var bridges: BridgeBrowser

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

                if transport.kind == .bridge {
                    section("Pont HemiPad") {
                        TextField("ws://hemipad-bridge.local:8787", text: $transport.bridgeEndpoint)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .font(.system(.body, design: .monospaced))
                            .padding(12)
                            .background(RoundedRectangle(cornerRadius: 12).fill(Theme.surface))

                        if bridges.found.isEmpty {
                            Text("Recherche des ponts sur le réseau local…")
                                .font(.caption)
                                .foregroundStyle(Theme.secondaryText)
                        } else {
                            ForEach(bridges.found) { bridge in
                                Button {
                                    transport.bridgeEndpoint = bridge.endpoint.absoluteString
                                    transport.connect()
                                } label: {
                                    Label(bridge.name, systemImage: "dot.radiowaves.left.and.right")
                                        .font(.callout)
                                        .padding(10)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        .background(RoundedRectangle(cornerRadius: 12).fill(Theme.surfaceHigh))
                                }
                                .buttonStyle(.plain)
                            }
                        }

                        Button {
                            transport.connect()
                        } label: {
                            Text("Reconnecter")
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
                        Text("Le pont HemiPad rejoue exactement les mêmes rapports HID depuis un boîtier USB. Le code de la manette ne change pas, seul le chemin change.")
                            .font(.caption)
                            .foregroundStyle(Theme.secondaryText)
                        Button {
                            transport.kind = .bridge
                            transport.connect()
                        } label: {
                            Text("Passer au pont")
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
        .onAppear { bridges.start() }
        .onDisappear { bridges.stop() }
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
