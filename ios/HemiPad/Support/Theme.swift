import SwiftUI

/// Palette et styles partagés.
///
/// Fond très sombre, accents lumineux : le contraste reste lisible en plein
/// jour comme le soir, et les cibles se détachent sans dépendre de la couleur
/// seule (chaque état a aussi une forme ou une épaisseur de trait distincte).
enum Theme {
    static let background = Color(red: 0.04, green: 0.05, blue: 0.09)
    static let surface = Color(red: 0.09, green: 0.10, blue: 0.16)
    static let surfaceHigh = Color(red: 0.14, green: 0.16, blue: 0.24)
    static let primaryText = Color.white
    static let secondaryText = Color(white: 0.68)
    static let accent = Color(red: 0.0, green: 0.90, blue: 1.0)
    static let latchAccent = Color(red: 1.0, green: 0.71, blue: 0.20)
    static let danger = Color(red: 1.0, green: 0.35, blue: 0.42)

    static func color(hex: String) -> Color {
        var value = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        if value.count == 3 {
            value = value.map { "\($0)\($0)" }.joined()
        }
        guard value.count == 6, let number = UInt32(value, radix: 16) else { return accent }
        return Color(
            red: Double((number >> 16) & 0xFF) / 255,
            green: Double((number >> 8) & 0xFF) / 255,
            blue: Double(number & 0xFF) / 255
        )
    }

    static let cardRadius: CGFloat = 20
}

/// Fond animé discret. Se fige complètement si la personne a demandé des
/// animations réduites (réglage HemiPad ou réglage système).
struct AuroraBackground: View {
    var reducedMotion: Bool

    private var refreshInterval: Double? {
        reducedMotion ? nil : 1.0 / 20.0
    }

    var body: some View {
        TimelineView(.animation(minimumInterval: refreshInterval, paused: reducedMotion)) { timeline in
            Canvas { context, size in
                let t = reducedMotion ? 0 : timeline.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 60)
                context.fill(Path(CGRect(origin: .zero, size: size)), with: .color(Theme.background))
                for index in 0..<3 {
                    let offset = CGFloat(index) * 2.1
                    let x = size.width * (0.5 + 0.28 * cos(CGFloat(t) * 0.12 + offset))
                    let y = size.height * (0.35 + 0.24 * sin(CGFloat(t) * 0.09 + offset))
                    let radius = min(size.width, size.height) * 0.55
                    let rect = CGRect(x: x - radius, y: y - radius, width: radius * 2, height: radius * 2)
                    let colors: [Color] = [Theme.accent.opacity(0.22), Color.clear]
                    context.fill(
                        Path(ellipseIn: rect),
                        with: .radialGradient(
                            Gradient(colors: index == 1 ? [Theme.latchAccent.opacity(0.16), .clear] : colors),
                            center: CGPoint(x: x, y: y),
                            startRadius: 0,
                            endRadius: radius
                        )
                    )
                }
            }
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }
}
