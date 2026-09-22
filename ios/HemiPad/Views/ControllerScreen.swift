import SwiftUI

/// L'écran manette.
///
/// Rien n'est posé « comme sur une vraie manette » : tout est posé sur les arcs
/// atteignables par le pouce de la main valide, calculés par `ReachEnvelope`.
/// Changer de main ne réorganise pas les boutons — cela retourne l'écran entier.
struct ControllerScreen: View {
    @EnvironmentObject private var state: AppState
    @EnvironmentObject private var arbiter: InputArbiter
    @EnvironmentObject private var tilt: TiltStick
    @State private var directionalMode: DirectionalMode = .stick

    /// Le pouce ne peut pas tenir deux directions à la fois : on choisit.
    enum DirectionalMode: String, CaseIterable, Identifiable {
        case stick
        case dpad

        var id: String { rawValue }
        var label: String { self == .stick ? "Stick" : "Croix" }
        var symbol: String { self == .stick ? "circle.circle" : "dpad" }
    }

    var body: some View {
        GeometryReader { geometry in
            let layout = ControllerLayout.solve(
                profile: state.profile,
                console: state.console,
                size: geometry.size
            )

            ZStack(alignment: .topLeading) {
                reachGuide(layout: layout)

                // Chaque commande est posée sur son arc d'atteinte. Le plan
                // vient de `ControllerLayout`, vérifié par les tests : rien ne
                // sort de l'écran, rien n'en recouvre une autre.
                ForEach(layout.placements) { placement in
                    view(for: placement)
                        .position(placement.center)
                }

                VStack(spacing: 10) {
                    StatusBarView()
                    if let banner = state.banner {
                        bannerView(banner)
                    }
                    HStack(spacing: 8) {
                        modeToggle
                        if state.profile.tiltReplacesSecondStick {
                            tiltIndicator
                        }
                        Spacer()
                    }
                }
                .padding(.horizontal, 14)
                .padding(.top, 8)
            }
            .frame(width: geometry.size.width, height: geometry.size.height)
        }
        .background(AuroraBackground(reducedMotion: state.profile.reducedMotion))
    }

    @ViewBuilder
    private func view(for placement: ControllerLayout.Placement) -> some View {
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
                        .padding(.vertical, 8)
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
        .padding(.vertical, 8)
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
