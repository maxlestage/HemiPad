import SwiftUI

/// Réglages d'accessibilité.
///
/// Chaque réglage est accompagné de la raison pour laquelle il existe :
/// une personne qui découvre l'application doit pouvoir décider sans essayer
/// les vingt combinaisons possibles.
struct SettingsScreen: View {
    @EnvironmentObject private var state: AppState
    @State private var showCalibration = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                StatusBarView()

                group("Main") {
                    Picker("Main valide", selection: $state.profile.dominantHand) {
                        ForEach(DominantHand.allCases) { hand in
                            Text(hand.label).tag(hand)
                        }
                    }
                    .pickerStyle(.segmented)

                    Button {
                        showCalibration = true
                    } label: {
                        Label("Calibrer la zone d'atteinte", systemImage: "hand.draw")
                            .font(.callout.weight(.semibold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(RoundedRectangle(cornerRadius: 14).fill(state.accent))
                            .foregroundStyle(Theme.background)
                    }
                    .buttonStyle(.plain)
                    caption("Tracez un arc avec le pouce : les commandes se replacent sur ce que la main atteint vraiment.")
                }

                group("Disposition") {
                    Picker("Disposition", selection: layoutModeBinding) {
                        ForEach(LayoutMode.allCases) { mode in
                            Text(mode.label).tag(mode)
                        }
                    }
                    .pickerStyle(.segmented)
                    caption(state.profile.layoutMode.explanation)

                    // Une disposition par console, seulement si on le veut.
                    Toggle("Disposition propre à \(state.console.displayName)", isOn: Binding(
                        get: { state.profile.hasOwnLayout },
                        set: { state.profile.setOwnLayout($0) }
                    ))
                    caption(state.profile.hasOwnLayout
                        ? "Cette console garde sa disposition : masquer, déplacer ou agrandir une commande ne touche qu'elle. Désactiver lui rend la disposition commune."
                        : "Toutes les consoles partagent la même disposition. Activez pour que celle-ci garde la sienne, en partant de la disposition commune.")

                    if state.console.hasCamera {
                        Toggle("Arc de vision", isOn: visibilityBinding(for: ControlID.lookControls.map(ControlKey.key(for:))))
                        caption("Quatre boutons qui déplacent le champ de vision, comme le stick droit : tenir pour tourner la caméra.")
                        Toggle("Stick caméra", isOn: visibilityBinding(for: [ControlKey.cameraStick]))
                        caption("Un second stick, pour les mouvements fins de la caméra. Masqué par défaut : l'arc de vision fait le même travail avec des boutons.")
                    }

                    slider(
                        "Espacement des commandes",
                        cgValue: $state.profile.controlSpacing,
                        range: 1.1...2
                    )
                    caption("Écart minimal entre deux voisines, en proportion de leur taille. Quand l'écran est étroit, c'est l'écart qui cède en premier, pour garder les commandes grandes.")

                    if !state.profile.hiddenKeys.isEmpty {
                        Text("\(state.profile.hiddenKeys.count) commande(s) masquée(s)")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Theme.latchAccent)
                        caption("Touchez « Modifier » sur l'écran manette pour les retrouver en bas de l'écran.")
                    }

                    HStack(spacing: 10) {
                        Button {
                            state.resetFreePositions()
                        } label: {
                            Text("Replacer tout")
                                .font(.caption.weight(.semibold))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                                .background(RoundedRectangle(cornerRadius: 12).fill(Theme.surfaceHigh))
                        }
                        .buttonStyle(.plain)

                        Button {
                            state.resetControlPreferences()
                        } label: {
                            Text("Réglages par commande")
                                .font(.caption.weight(.semibold))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                                .background(RoundedRectangle(cornerRadius: 12).fill(Theme.surfaceHigh))
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(Theme.danger)
                    }
                    caption("Chaque commande garde son mode d'appui, sa taille et sa visibilité propres : réglez-les depuis l'écran manette, bouton « Modifier ».")
                }

                group("Préréglages") {
                    HStack(spacing: 8) {
                        presetButton("Standard", profile: .default)
                        presetButton("Fatigue", profile: .lowEffort)
                        presetButton("Tremblements", profile: .tremorControl)
                    }
                    caption("Un préréglage ne touche ni à la main choisie ni à la calibration.")
                }

                group("Appui") {
                    Picker("Mode d'appui", selection: $state.profile.activationMode) {
                        ForEach(ActivationMode.allCases) { mode in
                            Text(mode.label).tag(mode)
                        }
                    }
                    .pickerStyle(.segmented)
                    caption(state.profile.activationMode.explanation)

                    if state.profile.activationMode == .dwell {
                        slider("Durée de survol", value: $state.profile.dwellDuration, range: 0.2...1.2, unit: "s")
                    }
                    slider("Anti-rebond", value: $state.profile.debounceInterval, range: 0...0.5, unit: "s")
                    caption("Ignore les appuis involontaires qui suivent immédiatement un appui volontaire.")

                    Toggle("Répétition automatique", isOn: $state.profile.autoRepeat)
                    if state.profile.autoRepeat {
                        slider("Cadence", value: $state.profile.autoRepeatInterval, range: 0.03...0.3, unit: "s")
                    }
                }

                group("Visée et déplacement") {
                    slider("Filtre anti-tremblement", value: $state.profile.tremorDamping, range: 0...1)
                    slider("Zone morte", value: $state.profile.stickDeadzone, range: 0...0.5)
                    Toggle("Retour au centre automatique", isOn: $state.profile.stickAutoCenter)
                    caption("Désactivé, le stick garde sa position : on avance sans maintenir le doigt.")
                    Toggle("Visée par inclinaison", isOn: $state.profile.tiltReplacesSecondStick)
                    caption("Remplace le second stick, injouable avec une seule main.")
                    if state.profile.tiltReplacesSecondStick {
                        slider("Sensibilité", value: $state.profile.tiltSensitivity, range: 0.4...3)
                    }
                    if state.console.hasCamera {
                        slider("Vitesse de l'arc de vision", value: $state.profile.cameraButtonSpeed, range: 0.2...1)
                        caption("À quelle vitesse la caméra tourne quand on tient un bouton de vision. Plus lente, elle se dose mieux.")
                    }
                }

                group("Clavier") {
                    Toggle("Modificateurs collants", isOn: $state.profile.stickyModifiers)
                    caption("⌘ puis ⇧ puis P, au lieu des trois en même temps. Double appui pour verrouiller.")
                    slider("Expiration", value: $state.profile.stickyTimeout, range: 2...20, unit: "s")
                }

                group("Confort") {
                    // Réglée en points, de 44 à 150 : c'est l'unité que la
                    // légende annonce, plutôt qu'un coefficient sans repère.
                    slider(
                        "Taille des cibles",
                        value: Binding(
                            get: { Double(state.profile.baseTargetSize) },
                            set: { state.profile.targetScale = CGFloat($0.rounded()) / 56 }
                        ),
                        range: 44...Double(HemiplegiaProfile.maximumTargetSize),
                        unit: "pt",
                        decimals: 0
                    )
                    caption("Si l'écran est trop petit, l'écart entre les commandes se resserre d'abord ; elles ne rétrécissent qu'ensuite — jamais sous 44 points — plutôt qu'une ne disparaisse.")
                    Toggle("Retour haptique", isOn: $state.profile.hapticsEnabled)
                    Toggle("Animations réduites", isOn: $state.profile.reducedMotion)
                }
            }
            .padding(14)
            .tint(state.accent)
        }
        .background(AuroraBackground(reducedMotion: state.profile.reducedMotion))
        .sheet(isPresented: $showCalibration) {
            CalibrationView()
                .hemipadEnvironment(state)
        }
    }

    /// Affiche ou masque d'un geste plusieurs commandes (l'arc de vision, le
    /// stick caméra), dans la disposition de la console en cours.
    private func visibilityBinding(for keys: [String]) -> Binding<Bool> {
        Binding(
            get: { keys.contains { state.profile.isVisible($0) } },
            set: { visible in
                for key in keys {
                    state.profile.updatePreference(for: key) { $0.isVisible = visible }
                }
            }
        )
    }

    private var layoutModeBinding: Binding<LayoutMode> {
        Binding(
            get: { state.profile.layoutMode },
            set: { state.setLayoutMode($0) }
        )
    }

    // MARK: - Briques

    @ViewBuilder
    private func group<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title.uppercased())
                .font(.caption.weight(.bold))
                .foregroundStyle(Theme.secondaryText)
                .accessibilityAddTraits(.isHeader)
            content()
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: Theme.cardRadius).fill(Theme.surface.opacity(0.7)))
    }

    private func caption(_ text: String) -> some View {
        Text(text)
            .font(.caption)
            .foregroundStyle(Theme.secondaryText)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func slider(
        _ title: String,
        value: Binding<Double>,
        range: ClosedRange<Double>,
        unit: String = "",
        decimals: Int = 2
    ) -> some View {
        let number = String(format: "%.\(decimals)f", value.wrappedValue)
        return VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text(title).font(.callout)
                Spacer()
                Text(unit.isEmpty ? number : "\(number) \(unit)")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(Theme.secondaryText)
            }
            Slider(value: value, in: range)
                .accessibilityLabel(Text(title))
        }
    }

    /// Variante pour les réglages géométriques stockés en `CGFloat`.
    /// Étiquette distincte : deux surcharges `value:` seraient ambiguës, Swift
    /// convertissant implicitement `CGFloat` et `Double`.
    private func slider(
        _ title: String,
        cgValue value: Binding<CGFloat>,
        range: ClosedRange<Double>,
        unit: String = ""
    ) -> some View {
        slider(
            title,
            value: Binding(
                get: { Double(value.wrappedValue) },
                set: { value.wrappedValue = CGFloat($0) }
            ),
            range: range,
            unit: unit
        )
    }

    private func presetButton(_ title: String, profile: HemiplegiaProfile) -> some View {
        Button {
            state.applyPreset(profile)
        } label: {
            Text(title)
                .font(.caption.weight(.semibold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(RoundedRectangle(cornerRadius: 12).fill(Theme.surfaceHigh))
        }
        .buttonStyle(.plain)
    }
}

#Preview {
    SettingsScreen()
        .hemipadEnvironment(AppState.preview)
}
