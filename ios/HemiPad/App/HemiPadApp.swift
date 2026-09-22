import SwiftUI
import UIKit

@main
struct HemiPadApp: App {
    @StateObject private var state = AppState()

    var body: some Scene {
        WindowGroup {
            RootView()
                .hemipadEnvironment(state)
                .preferredColorScheme(.dark)
                .onAppear {
                    state.onAppear()
                    // Une manette ne doit pas laisser l'écran s'éteindre en plein combat.
                    UIApplication.shared.isIdleTimerDisabled = true
                }
                .onDisappear {
                    state.onDisappear()
                    UIApplication.shared.isIdleTimerDisabled = false
                }
        }
    }
}
