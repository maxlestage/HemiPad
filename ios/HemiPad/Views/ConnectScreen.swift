import SwiftUI

/// Choix de la machine et du chemin de connexion.
struct ConnectScreen: View {
    @EnvironmentObject private var state: AppState
    @EnvironmentObject private var transport: TransportCoordinator
    /// La machine qu'on est en train de renommer, et le nom en cours de saisie.
    @State private var renaming: RememberedMachine?
    @State private var draftName = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                StatusBarView()

                if !state.machines.isEmpty {
                    section("Machines mémorisées") {
                        ForEach(state.machines) { machine in
                            machineRow(machine)
                        }
                        Text("Chaque machine garde son nom et son profil de console : quand elle se reconnecte, HemiPad la reconnaît et reprend son profil. Tout reste sur l'appareil.")
                            .font(.caption)
                            .foregroundStyle(Theme.secondaryText)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }

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
                                    directBadge(profile.bluetoothReach)
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

                reachSection(state.console)

                if transport.kind == .bluetoothHID {
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
        .alert("Nommer la machine", isPresented: Binding(
            get: { renaming != nil },
            set: { if !$0 { renaming = nil } }
        )) {
            TextField("PC du salon", text: $draftName)
            Button("Enregistrer") {
                if let machine = renaming {
                    state.renameMachine(machine.id, to: draftName)
                }
                renaming = nil
            }
            Button("Annuler", role: .cancel) { renaming = nil }
        } message: {
            Text("C'est le nom sous lequel HemiPad l'affichera quand elle se connecte.")
        }
    }

    private func machineRow(_ machine: RememberedMachine) -> some View {
        let isConnected = transport.connectedMachine == machine.id
        let consoleName = machine.console.map { ConsoleProfile.profile(for: $0).displayName } ?? "Aucun profil"
        return HStack(spacing: 12) {
            Image(systemName: isConnected ? "dot.radiowaves.left.and.right" : "desktopcomputer")
                .foregroundStyle(isConnected ? state.accent : Theme.secondaryText)
                .frame(width: 26)
            VStack(alignment: .leading, spacing: 2) {
                Text(machine.displayName)
                    .font(.body.weight(.semibold))
                Text(isConnected
                     ? "Connectée · \(consoleName)"
                     : "\(machine.lastConnection.formatted(.relative(presentation: .named))) · \(consoleName)")
                    .font(.caption)
                    .foregroundStyle(Theme.secondaryText)
                Text(machine.connectionCount > 1 ? "\(machine.connectionCount) connexions" : "1 connexion")
                    .font(.caption2)
                    .foregroundStyle(Theme.secondaryText)
            }
            Spacer()
            Menu {
                Button {
                    draftName = machine.name ?? ""
                    renaming = machine
                } label: {
                    Label("Renommer", systemImage: "pencil")
                }
                Menu {
                    ForEach(ConsoleProfile.all) { profile in
                        Button {
                            state.setConsole(profile.target, forMachine: machine.id)
                            if isConnected { state.consoleTarget = profile.target }
                        } label: {
                            if machine.console == profile.target {
                                Label(profile.displayName, systemImage: "checkmark")
                            } else {
                                Text(profile.displayName)
                            }
                        }
                    }
                } label: {
                    Label("Profil de console", systemImage: "gamecontroller")
                }
                Button(role: .destructive) {
                    state.forgetMachine(machine.id)
                } label: {
                    Label("Oublier cette machine", systemImage: "trash")
                }
            } label: {
                Image(systemName: "ellipsis.circle")
                    .font(.title3)
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel(Text("Réglages de \(machine.displayName)"))
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: Theme.cardRadius)
                .fill(Theme.surface.opacity(isConnected ? 1 : 0.6))
        )
        .accessibilityElement(children: .contain)
    }

    /// Accepté ou refusé en Bluetooth direct, d'un coup d'œil.
    private func directBadge(_ reach: BluetoothReach) -> some View {
        Label(
            reach.acceptsDirect ? "Bluetooth direct" : "Bluetooth direct refusé par la console",
            systemImage: reach.acceptsDirect ? "checkmark.circle.fill" : "xmark.circle.fill"
        )
        .font(.caption2.weight(.semibold))
        .foregroundStyle(reach.acceptsDirect ? Theme.secondaryText : Theme.danger)
    }

    /// Pour la console choisie : ce qu'elle accepte, et le chemin qui marche.
    private func reachSection(_ console: ConsoleProfile) -> some View {
        let reach = console.bluetoothReach
        return section("Avec \(console.displayName)") {
            VStack(alignment: .leading, spacing: 12) {
                Label(reach.verdict, systemImage: reach.acceptsDirect ? "checkmark.circle.fill" : "xmark.circle.fill")
                    .font(.callout.weight(.semibold))
                    .foregroundStyle(reach.acceptsDirect ? Theme.primaryText : Theme.danger)

                Text(reach.acceptsDirect ? "Appairer" : "Ce qui marche à la place")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Theme.secondaryText)
                ForEach(Array(reach.steps.enumerated()), id: \.offset) { index, step in
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Text("\(index + 1)")
                            .font(.caption.weight(.bold).monospacedDigit())
                            .frame(width: 22, height: 22)
                            .background(Circle().fill(Theme.surfaceHigh))
                        Text(step)
                            .font(.caption)
                    }
                    .accessibilityElement(children: .combine)
                }

                if let setting = reach.consoleSetting {
                    Label(setting, systemImage: "hand.raised.fill")
                        .font(.caption)
                        .foregroundStyle(Theme.secondaryText)
                }
            }
            .fixedSize(horizontal: false, vertical: true)
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: Theme.cardRadius)
                    .fill(reach.acceptsDirect ? Theme.surface : Theme.danger.opacity(0.12))
            )
        }
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
