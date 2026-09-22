import SwiftUI

/// Calibration de la zone d'atteinte.
///
/// On ne demande pas à la personne de comprendre « pivot », « rayon » ou
/// « ouverture angulaire » : on lui demande de balayer l'écran avec son pouce,
/// comme elle le ferait en jouant. La géométrie se déduit du geste.
struct CalibrationView: View {
    @EnvironmentObject private var state: AppState
    @Environment(\.dismiss) private var dismiss

    @State private var samples: [CGPoint] = []
    @State private var isRecording = false

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                Theme.background.ignoresSafeArea()

                // Trace du geste.
                Path { path in
                    guard let first = samples.first else { return }
                    path.move(to: first)
                    for point in samples.dropFirst() {
                        path.addLine(to: point)
                    }
                }
                .stroke(state.accent.opacity(0.8), style: StrokeStyle(lineWidth: 10, lineCap: .round, lineJoin: .round))

                // Aperçu de l'enveloppe obtenue.
                if samples.count > 8 {
                    let envelope = computedEnvelope(size: geometry.size)
                    Circle()
                        .strokeBorder(Theme.latchAccent.opacity(0.5), lineWidth: 2)
                        .frame(width: envelope.outerRadius * 2, height: envelope.outerRadius * 2)
                        .position(envelope.pivot)
                        .accessibilityHidden(true)
                }

                VStack(spacing: 14) {
                    Text("Balayez l'écran avec votre pouce")
                        .font(.title3.weight(.bold))
                    Text("Posez la main comme pour jouer, puis dessinez un arc, du plus près au plus loin. Levez le doigt quand c'est fini.")
                        .font(.callout)
                        .foregroundStyle(Theme.secondaryText)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 24)
                    Spacer()
                    HStack(spacing: 10) {
                        Button("Annuler") { dismiss() }
                            .buttonStyle(.bordered)
                        Button("Recommencer") { samples = [] }
                            .buttonStyle(.bordered)
                            .disabled(samples.isEmpty)
                        Button("Enregistrer") {
                            apply(size: geometry.size)
                            Haptics.shared.success()
                            dismiss()
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(samples.count <= 8)
                    }
                    .padding(.bottom, 24)
                }
                .padding(.top, 40)
            }
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { gesture in
                        if !isRecording {
                            isRecording = true
                            samples = []
                        }
                        samples.append(gesture.location)
                    }
                    .onEnded { _ in isRecording = false }
            )
        }
        .tint(state.accent)
    }

    /// Déduit le pivot et les rayons du nuage de points.
    ///
    /// Le pivot est estimé sous le point le plus bas du tracé, décalé vers le
    /// bord de la main : c'est approximativement l'articulation du pouce.
    private func computedEnvelope(size: CGSize) -> (pivot: CGPoint, innerRadius: CGFloat, outerRadius: CGFloat, span: CGFloat) {
        guard !samples.isEmpty else {
            return (CGPoint(x: size.width * 0.88, y: size.height * 0.92), 40, 200, .pi / 2.4)
        }
        let lowest = samples.max { $0.y < $1.y } ?? samples[0]
        let edgeX: CGFloat = state.profile.dominantHand == .right ? size.width * 0.94 : size.width * 0.06
        let pivot = CGPoint(x: edgeX, y: min(size.height * 0.98, lowest.y + 40))

        let distances = samples.map { hypot($0.x - pivot.x, $0.y - pivot.y) }
        let inner = distances.min() ?? 40
        let outer = distances.max() ?? 200

        let angles = samples.map { ReachEnvelope.normalize(atan2($0.y - pivot.y, $0.x - pivot.x) + .pi / 2) }
        let span = max((angles.max() ?? 0) - (angles.min() ?? 0), .pi / 6) / 2

        return (pivot, max(inner, 32), max(outer, inner + 80), min(span, .pi / 1.8))
    }

    private func apply(size: CGSize) {
        let result = computedEnvelope(size: size)
        let reference = min(size.width, size.height * 0.8)
        var profile = state.profile
        let normalizedX = result.pivot.x / size.width
        profile.thumbPivot = CGPoint(
            x: state.profile.dominantHand == .right ? normalizedX : 1 - normalizedX,
            y: result.pivot.y / size.height
        )
        profile.innerReach = result.innerRadius / reference
        profile.outerReach = result.outerRadius / reference
        profile.reachSpan = result.span
        state.profile = profile
    }
}

#Preview {
    CalibrationView()
        .hemipadEnvironment(AppState.preview)
}
