import Foundation
import SwiftUI

/// Stick analogique tactile.
///
/// Deux comportements réglables comptent ici pour une main unique :
/// le retour au centre automatique (désactivable pour « garder la position »
/// sans maintenir le doigt) et le filtrage du tremblement, appliqué en amont
/// par `InputArbiter`.
struct ThumbstickView: View {
    let id: StickID
    let size: CGFloat
    let accent: Color
    let value: CGPoint
    let autoCenter: Bool
    let onMove: (CGPoint) -> Void
    let onRelease: () -> Void
    let onRecenter: () -> Void

    private var knobSize: CGFloat { size * 0.42 }
    private var travel: CGFloat { (size - knobSize) / 2 }

    var body: some View {
        ZStack {
            Circle()
                .fill(Theme.surface.opacity(0.75))
            Circle()
                .strokeBorder(accent.opacity(0.35), lineWidth: 1.5)
            // Croix de repère : indique le centre sans dépendre de la couleur.
            Path { path in
                path.move(to: CGPoint(x: size / 2 - 8, y: size / 2))
                path.addLine(to: CGPoint(x: size / 2 + 8, y: size / 2))
                path.move(to: CGPoint(x: size / 2, y: size / 2 - 8))
                path.addLine(to: CGPoint(x: size / 2, y: size / 2 + 8))
            }
            .stroke(accent.opacity(0.35), lineWidth: 1)

            Circle()
                .fill(
                    RadialGradient(
                        colors: [accent.opacity(0.95), accent.opacity(0.55)],
                        center: .topLeading,
                        startRadius: 2,
                        endRadius: knobSize
                    )
                )
                .frame(width: knobSize, height: knobSize)
                .offset(x: value.x * travel, y: -value.y * travel)
                .shadow(color: accent.opacity(0.4), radius: 10)
                .animation(.interactiveSpring(response: 0.18, dampingFraction: 0.8), value: value)
        }
        .frame(width: size, height: size)
        .contentShape(Circle())
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { gesture in
                    let dx = (gesture.location.x - size / 2) / travel
                    let dy = -(gesture.location.y - size / 2) / travel
                    onMove(InputArbiter.clampToUnitCircle(CGPoint(x: dx, y: dy)))
                }
                .onEnded { _ in onRelease() }
        )
        .overlay(alignment: .bottom) {
            if !autoCenter {
                Button(action: onRecenter) {
                    Label("Recentrer", systemImage: "scope")
                        .font(.caption2.weight(.semibold))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(Capsule().fill(Theme.surfaceHigh))
                }
                .buttonStyle(.plain)
                .foregroundStyle(Theme.secondaryText)
                .offset(y: 22)
            }
        }
        .accessibilityElement()
        .accessibilityLabel(Text(id.label))
        .accessibilityValue(Text("Horizontal \(Int(value.x * 100)) pour cent, vertical \(Int(value.y * 100)) pour cent"))
        .accessibilityAdjustableAction { direction in
            let step: CGFloat = 0.25
            var next = value
            switch direction {
            case .increment: next.x = min(1, next.x + step)
            case .decrement: next.x = max(-1, next.x - step)
            @unknown default: break
            }
            onMove(next)
        }
    }
}

/// Croix directionnelle en un seul bloc : le doigt glisse d'une direction à
/// l'autre sans lever, ce qui évite de rater une diagonale.
struct DPadView: View {
    let size: CGFloat
    let accent: Color
    let pressed: Set<ControlID>
    let onPress: (ControlID) -> Void
    let onRelease: (ControlID) -> Void

    @State private var active: Set<ControlID> = []

    var body: some View {
        ZStack {
            Circle().fill(Theme.surface.opacity(0.8))
            Circle().strokeBorder(accent.opacity(0.35), lineWidth: 1.5)
            ForEach(Self.directions, id: \.control) { direction in
                Image(systemName: direction.symbol)
                    .font(.system(size: size * 0.16, weight: .bold))
                    .foregroundStyle(
                        pressed.contains(direction.control) ? Theme.background : Theme.primaryText
                    )
                    .frame(width: size * 0.34, height: size * 0.34)
                    .background(
                        Circle().fill(
                            pressed.contains(direction.control) ? accent.opacity(0.9) : Color.clear
                        )
                    )
                    .offset(x: direction.offset.x * size * 0.3, y: direction.offset.y * size * 0.3)
            }
        }
        .frame(width: size, height: size)
        .contentShape(Circle())
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { gesture in update(for: gesture.location) }
                .onEnded { _ in clear() }
        )
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text("Croix directionnelle"))
        .accessibilityHint(Text("Glissez vers une direction. Le doigt peut passer d'une direction à l'autre sans lever."))
    }

    /// Convertit la position du doigt en une ou deux directions (diagonales
    /// incluses) : le centre est une zone morte généreuse.
    private func update(for location: CGPoint) {
        let dx = location.x - size / 2
        let dy = location.y - size / 2
        let distance = sqrt(dx * dx + dy * dy)
        guard distance > size * 0.14 else {
            clear()
            return
        }
        var next: Set<ControlID> = []
        let threshold = size * 0.06
        if dy < -threshold { next.insert(.dpadUp) }
        if dy > threshold { next.insert(.dpadDown) }
        if dx < -threshold { next.insert(.dpadLeft) }
        if dx > threshold { next.insert(.dpadRight) }

        for control in next.subtracting(active) { onPress(control) }
        for control in active.subtracting(next) { onRelease(control) }
        active = next
    }

    private func clear() {
        for control in active { onRelease(control) }
        active = []
    }

    private struct Direction {
        let control: ControlID
        let symbol: String
        let offset: CGPoint
    }

    private static let directions: [Direction] = [
        Direction(control: .dpadUp, symbol: "chevron.up", offset: CGPoint(x: 0, y: -1)),
        Direction(control: .dpadDown, symbol: "chevron.down", offset: CGPoint(x: 0, y: 1)),
        Direction(control: .dpadLeft, symbol: "chevron.left", offset: CGPoint(x: -1, y: 0)),
        Direction(control: .dpadRight, symbol: "chevron.right", offset: CGPoint(x: 1, y: 0))
    ]
}
