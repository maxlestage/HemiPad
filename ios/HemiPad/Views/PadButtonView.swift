import SwiftUI

/// Un bouton de manette.
///
/// Trois états visuels distincts, jamais uniquement par la couleur :
/// repos (trait fin), enfoncé (remplissage), verrouillé (trait épais + point).
/// Le survol prolongé dessine un anneau de progression.
struct PadButtonView: View {
    let control: ControlID
    let glyph: String
    let size: CGFloat
    let accent: Color
    let isPressed: Bool
    let isLatched: Bool
    let dwellProgress: Double
    let onPress: () -> Void
    let onRelease: () -> Void

    @State private var isTouching = false

    var body: some View {
        ZStack {
            Circle()
                .fill(isPressed ? accent.opacity(0.85) : Theme.surface.opacity(0.92))
            Circle()
                .strokeBorder(
                    isLatched ? Theme.latchAccent : accent.opacity(isPressed ? 0.9 : 0.45),
                    lineWidth: isLatched ? 4 : 1.5
                )
            if dwellProgress > 0 {
                Circle()
                    .trim(from: 0, to: dwellProgress)
                    .stroke(Theme.latchAccent, style: StrokeStyle(lineWidth: 5, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .padding(2)
            }
            Text(glyph)
                .font(.system(size: size * 0.34, weight: .semibold, design: .rounded))
                .minimumScaleFactor(0.4)
                .foregroundStyle(isPressed ? Theme.background : Theme.primaryText)
                .padding(size * 0.14)
            if isLatched {
                Circle()
                    .fill(Theme.latchAccent)
                    .frame(width: size * 0.12, height: size * 0.12)
                    .offset(y: size * 0.32)
            }
        }
        .frame(width: size, height: size)
        .contentShape(Circle())
        .scaleEffect(isPressed ? 0.94 : 1)
        .animation(.easeOut(duration: 0.08), value: isPressed)
        .gesture(
            // minimumDistance 0 : le doigt n'a pas besoin d'être stable pour
            // déclencher, et un glissement hors du bouton relâche proprement.
            DragGesture(minimumDistance: 0)
                .onChanged { _ in
                    guard !isTouching else { return }
                    isTouching = true
                    onPress()
                }
                .onEnded { _ in
                    isTouching = false
                    onRelease()
                }
        )
        .accessibilityElement()
        .accessibilityLabel(Text(glyph == control.fallbackLabel ? glyph : "\(glyph), \(control.fallbackLabel)"))
        .accessibilityAddTraits(isPressed ? [.isButton, .isSelected] : .isButton)
        .accessibilityAction { onPress(); onRelease() }
    }
}

/// Petit bouton système (Start, Select, Accueil, Capture) : même logique, forme
/// en gélule pour être reconnaissable au toucher comme à l'œil.
struct PillButtonView: View {
    let control: ControlID
    let glyph: String
    let width: CGFloat
    let accent: Color
    let isPressed: Bool
    let isLatched: Bool
    let onPress: () -> Void
    let onRelease: () -> Void

    @State private var isTouching = false

    var body: some View {
        Text(glyph)
            .font(.system(size: 13, weight: .semibold, design: .rounded))
            .lineLimit(1)
            .minimumScaleFactor(0.5)
            .padding(.horizontal, 10)
            .frame(width: width, height: 38)
            .background(
                Capsule().fill(isPressed ? accent.opacity(0.85) : Theme.surface.opacity(0.9))
            )
            .overlay(
                Capsule().strokeBorder(
                    isLatched ? Theme.latchAccent : accent.opacity(0.4),
                    lineWidth: isLatched ? 3 : 1
                )
            )
            .foregroundStyle(isPressed ? Theme.background : Theme.primaryText)
            .contentShape(Capsule())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { _ in
                        guard !isTouching else { return }
                        isTouching = true
                        onPress()
                    }
                    .onEnded { _ in
                        isTouching = false
                        onRelease()
                    }
            )
            .accessibilityElement()
            .accessibilityLabel(Text(control.fallbackLabel))
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { onPress(); onRelease() }
    }
}
