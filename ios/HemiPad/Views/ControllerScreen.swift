import Foundation
import SwiftUI

/// L'écran manette.
///
/// En disposition automatique, rien n'est posé « comme sur une vraie manette » :
/// tout est posé sur les arcs atteignables par le pouce de la main valide.
/// En disposition libre, c'est la personne qui place chaque commande — l'arc
/// servant de point de départ.
///
/// Le mode édition change la nature des appuis : ils ne partent plus vers la
/// console, ils déplacent et règlent. Il fallait cette séparation nette, sinon
/// régler sa manette en pleine partie envoie des coups dans le jeu.
struct ControllerScreen: View {
    @EnvironmentObject private var state: AppState
    @EnvironmentObject private var arbiter: InputArbiter
    @EnvironmentObject private var tilt: TiltStick
    /// Posée sur la lecture à distance, la manette laisse voir le jeu.
    private let overlaysGame: Bool

    init(overlaysGame: Bool = false) {
        self.overlaysGame = overlaysGame
    }

    /// Plusieurs commandes peuvent être sélectionnées : verrouiller les deux
    /// gâchettes ou masquer les quatre boutons système se fait alors d'un
    /// geste, pas de quatre allers-retours.
    @State private var selectedKeys: Set<String> = []
    @State private var showEditor = false
    @State private var drag: DragState?

    private struct DragState {
        let key: String
        var translation: CGSize
    }

    var body: some View {
        GeometryReader { geometry in
            let layout = ControllerLayout.solve(
                profile: state.profile,
                console: state.console,
                size: geometry.size
            )
            let overlapping = state.isEditingLayout ? layout.overlapping : []

            ZStack(alignment: .topLeading) {
                if state.profile.layoutMode == .arc && !overlaysGame {
                    reachGuide(layout: layout)
                }

                ForEach(layout.placements) { placement in
                    view(
                        for: placement,
                        overlaps: overlapping.contains(placement.id),
                        in: geometry.size
                    )
                    .position(center(of: placement))
                }

                if state.isEditingLayout {
                    ForEach(hiddenPlacements(in: geometry.size), id: \.id) { placement in
                        hiddenChip(placement)
                            .position(placement.center)
                    }
                }

                VStack(spacing: 10) {
                    StatusBarView()
                    if let banner = state.banner {
                        bannerView(banner)
                    }
                    if layout.cameraArcFolded {
                        // Dit pourquoi l'arc de vision manque, et ce qui reste
                        // pour viser.
                        Text("Écran trop petit : l'arc de vision est replié. La visée par inclinaison et le stick caméra restent disponibles.")
                            .font(.caption2)
                            .foregroundStyle(Theme.secondaryText)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    if state.isEditingLayout {
                        editingBar(layout: layout)
                    } else {
                        HStack(spacing: 10) {
                            if state.profile.tiltReplacesSecondStick {
                                tiltIndicator
                            }
                            Spacer(minLength: 0)
                            editButton
                        }
                    }
                }
                .padding(.horizontal, 14)
                .padding(.top, 8)
            }
            .frame(width: geometry.size.width, height: geometry.size.height)
            .animation(.easeOut(duration: 0.18), value: state.profile.layoutMode)
            .sheet(isPresented: $showEditor) {
                editor(for: orderedSelection)
            }
        }
        .background {
            if !overlaysGame {
                AuroraBackground(reducedMotion: state.profile.reducedMotion)
            }
        }
    }

    /// Sélection dans l'ordre d'affichage : une liste stable se lit mieux
    /// qu'un ensemble dont l'ordre change à chaque rendu.
    private var orderedSelection: [String] {
        ControllerLayout.allElements(for: state.console)
            .map(\.key)
            .filter { selectedKeys.contains($0) }
    }

    private func toggleSelection(_ key: String) {
        if selectedKeys.contains(key) {
            selectedKeys.remove(key)
        } else {
            selectedKeys.insert(key)
        }
        Haptics.shared.press()
    }

    // MARK: - Placement

    private func center(of placement: ControllerLayout.Placement) -> CGPoint {
        guard let drag, drag.key == placement.id else { return placement.center }
        return CGPoint(
            x: placement.center.x + drag.translation.width,
            y: placement.center.y + drag.translation.height
        )
    }

    /// Commandes masquées, rangées en bas de l'écran pendant l'édition : on ne
    /// peut pas réafficher ce qu'on ne voit plus.
    private func hiddenPlacements(in size: CGSize) -> [ControllerLayout.Placement] {
        let hidden = ControllerLayout.allElements(for: state.console)
            .filter { !state.profile.isVisible($0.key) }
        guard !hidden.isEmpty else { return [] }
        let side: CGFloat = 52
        let spacing: CGFloat = 12
        let total = CGFloat(hidden.count) * side + CGFloat(hidden.count - 1) * spacing
        let startX = max(side / 2 + 8, (size.width - total) / 2 + side / 2)
        return hidden.enumerated().map { index, element in
            ControllerLayout.Placement(
                element: element,
                center: CGPoint(
                    x: startX + CGFloat(index) * (side + spacing),
                    y: size.height - side / 2 - 12
                ),
                size: CGSize(width: side, height: element.isPillElement ? side * 0.6 : side)
            )
        }
    }

    // MARK: - Vues de commandes

    @ViewBuilder
    private func view(
        for placement: ControllerLayout.Placement,
        overlaps: Bool,
        in bounds: CGSize
    ) -> some View {
        if state.isEditingLayout {
            editable(placement, overlaps: overlaps, in: bounds)
        } else {
            live(placement)
        }
    }

    @ViewBuilder
    private func live(_ placement: ControllerLayout.Placement) -> some View {
        switch placement.element {
        case .directional:
            ThumbstickView(
                id: .left,
                size: placement.size.width,
                accent: state.accent,
                value: arbiter.state.leftStick,
                autoCenter: state.profile.stickAutoCenter,
                onMove: { arbiter.moveStick(.left, to: $0) },
                onRelease: { arbiter.releaseStick(.left) },
                onRecenter: { arbiter.centerStick(.left) }
            )
        case .cameraStick:
            // Le second stick, pour la caméra : « en cas où », quand les
            // boutons de l'arc de vision sont trop grossiers pour viser.
            ThumbstickView(
                id: .right,
                size: placement.size.width,
                accent: state.accent,
                value: arbiter.state.rightStick,
                autoCenter: state.profile.stickAutoCenter,
                onMove: { arbiter.moveStick(.right, to: $0) },
                onRelease: { arbiter.releaseStick(.right) },
                onRecenter: { arbiter.centerStick(.right) }
            )
        case .dpad:
            // Le stick et la croix sont tous deux à l'écran, comme sur la
            // manette d'origine : passer de l'un à l'autre ne coûte plus un
            // appui sur un sélecteur. Qui n'en veut qu'un masque l'autre.
            DPadView(
                size: placement.size.width,
                accent: state.accent,
                pressed: arbiter.state.pressed,
                onPress: { state.press($0) },
                onRelease: { state.release($0) }
            )
        case .button(let control):
            padButton(control, size: placement.size.width)
        case .pill(let control):
            PillButtonView(
                control: control,
                glyph: state.console.glyph(for: control),
                width: placement.size.width,
                accent: state.accent,
                isPressed: arbiter.state.isPressed(control),
                isLatched: arbiter.latched.contains(control),
                onPress: { state.press(control) },
                onRelease: { state.release(control) }
            )
        }
    }

    private func editable(
        _ placement: ControllerLayout.Placement,
        overlaps: Bool,
        in bounds: CGSize
    ) -> some View {
        StaticControlView(
            element: placement.element,
            glyph: glyph(for: placement.element),
            size: placement.size,
            accent: state.accent,
            isSelected: selectedKeys.contains(placement.id),
            overlaps: overlaps,
            isLocked: state.profile.isLocked(placement.id)
        )
        .overlay(alignment: .topTrailing) {
            Image(systemName: "slider.horizontal.3")
                .font(.system(size: 11, weight: .bold))
                .padding(5)
                .background(Circle().fill(state.accent))
                .foregroundStyle(Theme.background)
                .offset(x: 4, y: -4)
        }
        .contentShape(Rectangle())
        .gesture(dragGesture(for: placement, in: bounds))
        .onTapGesture { toggleSelection(placement.id) }
        .accessibilityElement()
        .accessibilityLabel(Text(label(for: placement.element)))
        .accessibilityHint(Text(
            state.profile.layoutMode == .free
                ? "Faites glisser pour déplacer, touchez pour régler."
                : "Touchez pour régler cette commande."
        ))
        .accessibilityAddTraits(
            selectedKeys.contains(placement.id) ? [.isButton, .isSelected] : .isButton
        )
        .accessibilityAction { toggleSelection(placement.id) }
    }

    private func hiddenChip(_ placement: ControllerLayout.Placement) -> some View {
        StaticControlView(
            element: placement.element,
            glyph: glyph(for: placement.element),
            size: placement.size,
            accent: state.accent,
            isSelected: selectedKeys.contains(placement.id),
            isHidden: true,
            isLocked: state.profile.isLocked(placement.id)
        )
        .contentShape(Rectangle())
        .onTapGesture { toggleSelection(placement.id) }
        .accessibilityElement()
        .accessibilityLabel(Text("\(label(for: placement.element)), masquée"))
        .accessibilityHint(Text("Touchez pour la réafficher ou la régler."))
    }

    /// Glissement d'une commande. Réservé à la disposition libre : en mode
    /// automatique, une position choisie serait effacée au prochain calcul.
    private func dragGesture(
        for placement: ControllerLayout.Placement,
        in bounds: CGSize
    ) -> some Gesture {
        DragGesture(minimumDistance: 6)
            .onChanged { value in
                guard state.profile.layoutMode == .free,
                      !state.profile.isLocked(placement.id) else { return }
                drag = DragState(key: placement.id, translation: value.translation)
            }
            .onEnded { value in
                guard state.profile.layoutMode == .free else {
                    state.banner = "Passez en disposition libre pour déplacer les commandes."
                    return
                }
                guard !state.profile.isLocked(placement.id) else {
                    state.banner = "Cette commande est verrouillée. Déverrouillez-la pour la déplacer."
                    Haptics.shared.warning()
                    return
                }
                let moved = CGPoint(
                    x: placement.center.x + value.translation.width,
                    y: placement.center.y + value.translation.height
                )
                let clamped = ControllerLayout.clamp(moved, size: placement.size, in: bounds)
                state.moveControl(placement.id, to: clamped, in: bounds)
                drag = nil
                Haptics.shared.latch()
            }
    }

    private func glyph(for element: ControllerLayout.Element) -> String {
        guard let control = element.control else { return "" }
        return state.console.glyph(for: control)
    }

    private func label(for element: ControllerLayout.Element) -> String {
        switch element {
        case .directional: return "Stick"
        case .dpad: return "Croix directionnelle"
        case .cameraStick: return "Stick caméra"
        case .button(let control), .pill(let control): return control.fallbackLabel
        }
    }

    @ViewBuilder
    private func editor(for keys: [String]) -> some View {
        let element = ControllerLayout.allElements(for: state.console)
            .first { $0.key == keys.first } ?? .directional
        ControlEditorView(
            keys: keys.isEmpty ? [ControlKey.directional] : keys,
            title: keys.count > 1 ? "\(keys.count) commandes" : label(for: element),
            glyph: glyph(for: element),
            element: element
        )
        .hemipadEnvironment(state)
    }

    private func padButton(_ control: ControlID, size: CGFloat) -> some View {
        PadButtonView(
            control: control,
            glyph: state.console.glyph(for: control),
            size: size,
            accent: state.accent,
            isPressed: arbiter.state.isPressed(control),
            isLatched: arbiter.latched.contains(control),
            dwellProgress: arbiter.dwellProgress[control] ?? 0,
            onPress: { state.press(control) },
            onRelease: { state.release(control) }
        )
    }

    /// Trace discrètement les arcs d'atteinte : utile pendant le réglage, et
    /// rassurant ensuite — on voit que rien n'est posé hors de portée.
    private func reachGuide(layout: ControllerLayout.Solution) -> some View {
        let envelope = layout.envelope
        return Path { path in
            for radius in layout.radii where radius > 0 {
                let start = envelope.angle(index: 0, count: 2)
                let end = envelope.angle(index: 1, count: 2)
                path.addArc(
                    center: envelope.pivot,
                    radius: radius,
                    startAngle: .radians(Double(min(start, end))),
                    endAngle: .radians(Double(max(start, end))),
                    clockwise: false
                )
            }
        }
        .stroke(state.accent.opacity(0.08), lineWidth: 1)
        .accessibilityHidden(true)
    }

    // MARK: - Barres

    private var editButton: some View {
        Button {
            state.isEditingLayout = true
            selectedKeys = []
            arbiter.releaseAll()
            Haptics.shared.latch()
        } label: {
            Label("Modifier", systemImage: "slider.horizontal.3")
                .font(.caption.weight(.semibold))
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(Capsule().fill(Theme.surface.opacity(0.9)))
        }
        .buttonStyle(.plain)
        .foregroundStyle(Theme.secondaryText)
        .accessibilityHint(Text("Déplacer, masquer ou régler chaque commande"))
    }

    private func editingBar(layout: ControllerLayout.Solution) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if !selectedKeys.isEmpty {
                selectionBar
            }

            HStack(spacing: 10) {
                Button {
                    state.isEditingLayout = false
                    selectedKeys = []
                    drag = nil
                    Haptics.shared.success()
                } label: {
                    Text("Terminé")
                        .font(.callout.weight(.bold))
                        .padding(.horizontal, 18)
                        .padding(.vertical, 12)
                        .background(Capsule().fill(state.accent))
                        .foregroundStyle(Theme.background)
                }
                .buttonStyle(.plain)

                if state.profile.layoutMode == .free {
                    Button {
                        state.resetFreePositions()
                    } label: {
                        Label("Tout replacer", systemImage: "arrow.uturn.backward")
                            .font(.caption.weight(.semibold))
                            .padding(.horizontal, 14)
                            .padding(.vertical, 12)
                            .background(Capsule().fill(Theme.surfaceHigh))
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(Theme.secondaryText)
                }
                Spacer(minLength: 0)
            }

            Text(selectedKeys.isEmpty ? editingHint(layout: layout) : selectionHint)
                .font(.caption)
                .foregroundStyle(layout.overlapping.isEmpty ? Theme.secondaryText : Theme.danger)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 16).fill(Theme.surface.opacity(0.92)))
    }

    /// Actions qui s'appliquent d'un coup à toute la sélection.
    private var selectionBar: some View {
        let keys = orderedSelection
        let allLocked = keys.allSatisfy { state.profile.isLocked($0) }
        let allHidden = keys.allSatisfy { !state.profile.isVisible($0) }

        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                Text("\(keys.count) sélectionnée\(keys.count > 1 ? "s" : "")")
                    .font(.caption.weight(.bold))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(Capsule().fill(state.accent.opacity(0.2)))
                    .foregroundStyle(state.accent)

                selectionAction(
                    allLocked ? "Déverrouiller" : "Verrouiller",
                    systemImage: allLocked ? "lock.open" : "lock"
                ) {
                    state.setLocked(!allLocked, for: keys)
                }

                selectionAction(
                    allHidden ? "Afficher" : "Masquer",
                    systemImage: allHidden ? "eye" : "eye.slash"
                ) {
                    state.setVisible(allHidden, for: keys)
                }

                selectionAction("Régler", systemImage: "slider.horizontal.3") {
                    showEditor = true
                }

                selectionAction("Désélectionner", systemImage: "xmark") {
                    selectedKeys = []
                }
            }
            .padding(.vertical, 2)
        }
    }

    private func selectionAction(
        _ title: String,
        systemImage: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
                .font(.caption.weight(.semibold))
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(Capsule().fill(Theme.surfaceHigh))
        }
        .buttonStyle(.plain)
        .foregroundStyle(Theme.primaryText)
    }

    private var selectionHint: String {
        let locked = orderedSelection.filter { state.profile.isLocked($0) }.count
        if locked == orderedSelection.count && locked > 0 {
            return "Sélection verrouillée : ces commandes ne bougeront plus."
        }
        return "Touchez d'autres commandes pour les ajouter à la sélection."
    }

    private func editingHint(layout: ControllerLayout.Solution) -> String {
        if !layout.overlapping.isEmpty {
            return "\(layout.overlapping.count) commandes se chevauchent : elles resteront difficiles à viser."
        }
        return state.profile.layoutMode == .free
            ? "Faites glisser une commande pour la placer, touchez-la pour la régler."
            : "Touchez une commande pour la régler. Passez en disposition libre pour la déplacer."
    }

    private var tiltIndicator: some View {
        HStack(spacing: 6) {
            Image(systemName: "gyroscope")
            Text("Visée inclinaison")
                .font(.caption2.weight(.semibold))
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 10)
        .background(Capsule().fill(Theme.surface.opacity(0.85)))
        .foregroundStyle(tilt.isAvailable ? Theme.secondaryText : Theme.danger)
        .onTapGesture {
            tilt.calibrate()
            Haptics.shared.success()
        }
        .accessibilityLabel(Text("Recalibrer la visée par inclinaison"))
    }

    private func bannerView(_ text: String) -> some View {
        Text(text)
            .font(.caption.weight(.medium))
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 12).fill(Theme.surfaceHigh.opacity(0.9)))
            .onTapGesture { state.banner = nil }
            .task {
                try? await Task.sleep(nanoseconds: 4_000_000_000)
                state.banner = nil
            }
    }
}

#Preview {
    ControllerScreen()
        .hemipadEnvironment(AppState.preview)
}
