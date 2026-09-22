import SwiftUI

/// Rendu d'une commande sans aucune interaction de jeu.
///
/// En édition, on ne veut surtout pas qu'un appui parte vers la console : on
/// dessine la même chose, mais inerte, avec les marques propres à l'édition
/// (sélection, chevauchement, commande masquée).
struct StaticControlView: View {
    let element: ControllerLayout.Element
    let glyph: String
    let size: CGSize
    let accent: Color
    var isSelected: Bool = false
    var overlaps: Bool = false
    var isHidden: Bool = false

    private var isPill: Bool {
        if case .pill = element { return true }
        return false
    }

    var body: some View {
        let shape = ControlShape(isPill: isPill)
        return ZStack {
            shape
                .fill(Theme.surface.opacity(isHidden ? 0.3 : 0.92))
            shape
                .strokeBorder(
                    borderColor,
                    style: StrokeStyle(lineWidth: borderWidth, dash: isHidden ? [5, 4] : [])
                )

            if case .directional = element {
                Circle()
                    .fill(accent.opacity(isHidden ? 0.25 : 0.7))
                    .frame(width: size.width * 0.34, height: size.width * 0.34)
            } else {
                Text(glyph)
                    .font(.system(size: isPill ? size.height * 0.42 : size.width * 0.34, weight: .semibold, design: .rounded))
                    .minimumScaleFactor(0.4)
                    .lineLimit(1)
                    .padding(.horizontal, 6)
                    .foregroundStyle(Theme.primaryText.opacity(isHidden ? 0.45 : 1))
            }

            if isHidden {
                Image(systemName: "eye.slash.fill")
                    .font(.system(size: min(size.width, size.height) * 0.26))
                    .foregroundStyle(Theme.secondaryText)
            }
        }
        .frame(width: size.width, height: size.height)
    }

    private var borderColor: Color {
        if isSelected { return accent }
        if overlaps { return Theme.danger }
        return accent.opacity(0.35)
    }

    private var borderWidth: CGFloat {
        isSelected ? 4 : (overlaps ? 3 : 1.5)
    }
}

/// Cercle ou gélule, selon la commande.
///
/// Un `@ViewBuilder` ne sait pas produire une `Shape` : il faut une forme
/// unique qui décide elle-même de son tracé, et qui reste « insettable » pour
/// que `strokeBorder` dessine le trait à l'intérieur.
struct ControlShape: InsettableShape {
    let isPill: Bool
    var insetAmount: CGFloat = 0

    func path(in rect: CGRect) -> Path {
        let inner = rect.insetBy(dx: insetAmount, dy: insetAmount)
        return isPill ? Capsule().path(in: inner) : Circle().path(in: inner)
    }

    func inset(by amount: CGFloat) -> ControlShape {
        ControlShape(isPill: isPill, insetAmount: insetAmount + amount)
    }
}

/// Réglages d'une commande : visible, mode d'appui, taille, position.
///
/// Une seule commande à la fois, en grand, atteignable au pouce — c'est le
/// même principe que le reste de l'application, appliqué à son propre écran de
/// réglage.
struct ControlEditorView: View {
    @EnvironmentObject private var state: AppState
    @Environment(\.dismiss) private var dismiss

    let key: String
    let title: String
    let glyph: String
    let element: ControllerLayout.Element

    private var preference: ControlPreference {
        state.profile.preference(key)
    }

    private var isDirectionalPad: Bool {
        element.control?.isDirectionalPad ?? false
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    header

                    group("Affichage") {
                        Toggle("Afficher cette commande", isOn: visibleBinding)
                        caption("Une commande masquée libère de la place : les autres peuvent alors grossir.")
                    }

                    group("Mode d'appui") {
                        // Une liste de boutons plutôt qu'un sélecteur segmenté :
                        // quatre choix ne tiennent pas côte à côte, et chacun
                        // mérite une cible large.
                        VStack(spacing: 8) {
                            activationRow(nil, label: "Réglage général")
                            ForEach(ActivationMode.allCases) { mode in
                                activationRow(mode, label: mode.label)
                            }
                        }

                        if isDirectionalPad {
                            caption("Une direction reste toujours en appui direct : la verrouiller ferait tourner le personnage en rond.")
                        } else {
                            caption(preference.activation?.explanation ?? "Cette commande suit le mode choisi dans les réglages généraux.")
                        }
                    }

                    group("Taille") {
                        HStack {
                            Text("Grossissement")
                            Spacer()
                            Text(String(format: "×%.2f", preference.sizeScale))
                                .font(.caption.monospacedDigit())
                                .foregroundStyle(Theme.secondaryText)
                        }
                        Slider(value: sizeBinding, in: 0.7...2, step: 0.05)
                        caption("Appliqué en plus de la taille générale des cibles.")
                    }

                    if state.profile.layoutMode == .free {
                        group("Position") {
                            if preference.freePosition == nil {
                                caption("Position automatique. Faites glisser la commande sur l'écran manette pour la placer vous-même.")
                            } else {
                                Button(role: .destructive) {
                                    state.updateControl(key) { $0.freePosition = nil }
                                } label: {
                                    Label("Remettre à sa place automatique", systemImage: "arrow.uturn.backward")
                                }
                            }
                        }
                    }

                    Button(role: .destructive) {
                        state.updateControl(key) { $0 = .default }
                    } label: {
                        Text("Réinitialiser cette commande")
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(RoundedRectangle(cornerRadius: 14).fill(Theme.surfaceHigh))
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(Theme.danger)
                }
                .padding(18)
            }
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Terminé") { dismiss() }
                }
            }
        }
        .tint(state.accent)
    }

    private var header: some View {
        HStack(spacing: 14) {
            StaticControlView(
                element: element,
                glyph: glyph,
                size: CGSize(width: 64, height: element.isPillElement ? 32 : 64),
                accent: state.accent,
                isHidden: !preference.isVisible
            )
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.headline)
                Text(state.profile.activation(for: key).label)
                    .font(.caption)
                    .foregroundStyle(Theme.secondaryText)
            }
            Spacer()
        }
    }

    private func activationRow(_ mode: ActivationMode?, label: String) -> some View {
        let isSelected = preference.activation == mode
        return Button {
            state.updateControl(key) { $0.activation = mode }
        } label: {
            HStack {
                Text(label)
                Spacer()
                if isSelected {
                    Image(systemName: "checkmark.circle.fill").foregroundStyle(state.accent)
                }
            }
            .padding(.horizontal, 14)
            .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(isSelected ? state.accent.opacity(0.14) : Theme.surfaceHigh.opacity(0.7))
            )
        }
        .buttonStyle(.plain)
        .disabled(isDirectionalPad && mode != nil)
        .opacity(isDirectionalPad && mode != nil ? 0.4 : 1)
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
    }

    // MARK: - Liaisons

    private var visibleBinding: Binding<Bool> {
        Binding(
            get: { state.profile.preference(key).isVisible },
            set: { newValue in state.updateControl(key) { $0.isVisible = newValue } }
        )
    }

    private var activationBinding: Binding<ActivationMode?> {
        Binding(
            get: { state.profile.preference(key).activation },
            set: { newValue in state.updateControl(key) { $0.activation = newValue } }
        )
    }

    private var sizeBinding: Binding<Double> {
        Binding(
            get: { Double(state.profile.preference(key).sizeScale) },
            set: { newValue in state.updateControl(key) { $0.sizeScale = CGFloat(newValue) } }
        )
    }

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
}

extension ControllerLayout.Element {
    var isPillElement: Bool {
        if case .pill = self { return true }
        return false
    }
}
