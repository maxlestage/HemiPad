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

    @State private var directionalMode: DirectionalMode = .stick
    @State private var selectedKey: String?
    @State private var drag: DragState?

    /// Le pouce ne peut pas tenir deux directions à la fois : on choisit.
    enum DirectionalMode: String, CaseIterable, Identifiable {
        case stick
        case dpad

        var id: String { rawValue }
        var label: String { self == .stick ? "Stick" : "Croix" }
        var symbol: String { self == .stick ? "circle.circle" : "dpad" }
    }

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
                if state.profile.layoutMode == .arc {
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
                    if state.isEditingLayout {
                        editingBar(layout: layout)
                    } else {
                        HStack(spacing: 10) {
                            modeToggle
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
            .sheet(item: Binding(
                get: { selectedKey.map(EditorTarget.init(key:)) },
                set: { selectedKey = $0?.key }
            )) { target in
                editor(for: target.key)
            }
        }
        .background(AuroraBackground(reducedMotion: state.profile.reducedMotion))
    }

    /// Identifiant transportable vers la feuille de réglages.
    private struct EditorTarget: Identifiable {
        let key: String
        var id: String { key }
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
            directionalWidget(size: placement.size.width)
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
            isSelected: selectedKey == placement.id,
            overlaps: overlaps
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
        .onTapGesture { selectedKey = placement.id }
        .accessibilityElement()
        .accessibilityLabel(Text(label(for: placement.element)))
        .accessibilityHint(Text(
            state.profile.layoutMode == .free
                ? "Faites glisser pour déplacer, touchez pour régler."
                : "Touchez pour régler cette commande."
        ))
        .accessibilityAddTraits(.isButton)
        .accessibilityAction { selectedKey = placement.id }
    }

    private func hiddenChip(_ placement: ControllerLayout.Placement) -> some View {
        StaticControlView(
            element: placement.element,
            glyph: glyph(for: placement.element),
            size: placement.size,
            accent: state.accent,
            isHidden: true
        )
        .contentShape(Rectangle())
        .onTapGesture { selectedKey = placement.id }
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
                guard state.profile.layoutMode == .free else { return }
                selectedKey = nil
                drag = DragState(key: placement.id, translation: value.translation)
            }
            .onEnded { value in
                guard state.profile.layoutMode == .free else {
                    state.banner = "Passez en disposition libre pour déplacer les commandes."
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
        guard let control = element.control else { return "Stick ou croix directionnelle" }
        return control.fallbackLabel
    }

    @ViewBuilder
    private func editor(for key: String) -> some View {
        let element = ControllerLayout.allElements(for: state.console)
            .first { $0.key == key } ?? .directional
        ControlEditorView(
            key: key,
            title: label(for: element),
            glyph: glyph(for: element),
            element: element
        )
        .hemipadEnvironment(state)
    }

    @ViewBuilder
    private func directionalWidget(size: CGFloat) -> some View {
        switch directionalMode {
        case .stick:
            ThumbstickView(
                id: .left,
                size: size,
                accent: state.accent,
                value: arbiter.state.leftStick,
                autoCenter: state.profile.stickAutoCenter,
                onMove: { arbiter.moveStick(.left, to: $0) },
                onRelease: { arbiter.releaseStick(.left) },
                onRecenter: { arbiter.centerStick(.left) }
            )
        case .dpad:
            DPadView(
                size: size,
                accent: state.accent,
                pressed: arbiter.state.pressed,
                onPress: { state.press($0) },
                onRelease: { state.release($0) }
            )
        }
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
            HStack(spacing: 10) {
                Button {
                    state.isEditingLayout = false
                    selectedKey = nil
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

            Text(editingHint(layout: layout))
                .font(.caption)
                .foregroundStyle(layout.overlapping.isEmpty ? Theme.secondaryText : Theme.danger)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 16).fill(Theme.surface.opacity(0.92)))
    }

    private func editingHint(layout: ControllerLayout.Solution) -> String {
        if !layout.overlapping.isEmpty {
            return "\(layout.overlapping.count) commandes se chevauchent : elles resteront difficiles à viser."
        }
        return state.profile.layoutMode == .free
            ? "Faites glisser une commande pour la placer, touchez-la pour la régler."
            : "Touchez une commande pour la régler. Passez en disposition libre pour la déplacer."
    }

    private var modeToggle: some View {
        HStack(spacing: 0) {
            ForEach(DirectionalMode.allCases) { mode in
                Button {
                    directionalMode = mode
                    arbiter.centerStick(.left)
                    Haptics.shared.latch()
                } label: {
                    Label(mode.label, systemImage: mode.symbol)
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 10)
                        .background(
                            Capsule().fill(
                                directionalMode == mode ? state.accent.opacity(0.9) : Color.clear
                            )
                        )
                        .foregroundStyle(directionalMode == mode ? Theme.background : Theme.secondaryText)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(3)
        .background(Capsule().fill(Theme.surface.opacity(0.85)))
        .accessibilityLabel(Text("Commande directionnelle"))
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
