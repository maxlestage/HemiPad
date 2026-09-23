import SwiftUI

extension View {
    /// Injecte l'état global **et** les objets observables imbriqués.
    ///
    /// SwiftUI ne propage pas les changements d'un `ObservableObject` contenu
    /// dans un autre : sans cette injection, un appui sur un bouton mettrait à
    /// jour l'arbitre sans jamais redessiner la manette.
    func hemipadEnvironment(_ state: AppState) -> some View {
        self
            .environmentObject(state)
            .environmentObject(state.arbiter)
            .environmentObject(state.transport)
            .environmentObject(state.sticky)
            .environmentObject(state.tilt)
    }
}
