import SwiftUI
import UIKit
import WebKit

/// La Xbox, jouée depuis HemiPad : la lecture à distance de Microsoft
/// (xbox.com/play) en dessous, les commandes HemiPad par-dessus.
///
/// Aucune console n'accepte HemiPad en Bluetooth ; la lecture à distance, si.
/// Le jeu s'affiche sur cet écran, et chaque appui part vers la Xbox par la
/// page de Microsoft, sans PC ni achat.
///
/// Deux modes, pour que les doigts ne se trompent pas de cible :
/// - « Page » : on se connecte au compte Microsoft et on choisit la console ;
/// - « Manette » : les commandes HemiPad pilotent le jeu.
struct RemotePlayScreen: View {
    @EnvironmentObject private var state: AppState
    @EnvironmentObject private var transport: TransportCoordinator
    @Environment(\.dismiss) private var dismiss
    @StateObject private var page = RemotePlayPage()
    @State private var showsController = false

    var body: some View {
        ZStack(alignment: .top) {
            RemotePlayWebView(page: page)
                .ignoresSafeArea()

            if showsController {
                ControllerScreen(overlaysGame: true)
                    .opacity(0.85)
                    .padding(.top, 56)
            }

            toolbar
        }
        .background(Color.black.ignoresSafeArea())
        .onAppear {
            // Pendant une partie, l'écran ne doit pas s'éteindre.
            UIApplication.shared.isIdleTimerDisabled = true
            transport.gamepadMirror = { [weak page] gamepad in
                page?.send(gamepad)
            }
        }
        .onDisappear {
            UIApplication.shared.isIdleTimerDisabled = false
            transport.gamepadMirror = nil
            state.arbiter.releaseAll()
        }
    }

    private var toolbar: some View {
        HStack(spacing: 10) {
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.headline)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(.ultraThinMaterial))
            }
            .accessibilityLabel(Text("Fermer la lecture à distance"))

            Picker("Mode", selection: $showsController) {
                Text("Page").tag(false)
                Text("Manette").tag(true)
            }
            .pickerStyle(.segmented)
            .frame(maxWidth: 260)
            .onChange(of: showsController) { _ in
                // Changer de mode ne doit jamais laisser un bouton enfoncé.
                state.arbiter.releaseAll()
                Haptics.shared.latch()
            }

            Spacer(minLength: 0)

            Button {
                page.reload()
            } label: {
                Image(systemName: "arrow.clockwise")
                    .font(.headline)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(.ultraThinMaterial))
            }
            .accessibilityLabel(Text("Recharger la page"))
        }
        .foregroundStyle(Theme.primaryText)
        .padding(.horizontal, 12)
        .padding(.top, 6)
        .tint(state.accent)
    }
}

/// La page de lecture à distance, et ce qu'on lui envoie.
@MainActor
final class RemotePlayPage: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate {
    let webView: WKWebView

    /// `loadsStartPage` : faux dans les tests, pour ne rien charger.
    init(loadsStartPage: Bool = true) {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        // Le jeton d'identité de Safari : la page de Microsoft sert la
        // lecture à distance aux navigateurs qu'elle connaît.
        configuration.applicationNameForUserAgent = "Version/18.0 Mobile/15E148 Safari/604.1"
        let script = WKUserScript(
            source: WebGamepadBridge.injectedScript,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        configuration.userContentController.addUserScript(script)
        webView = WKWebView(frame: .zero, configuration: configuration)
        super.init()
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        if loadsStartPage {
            webView.load(URLRequest(url: WebGamepadBridge.startURL))
        }
    }

    func send(_ gamepad: GamepadState) {
        guard let host = webView.url?.host?.lowercased(),
              host == "xbox.com" || host.hasSuffix(".xbox.com") else { return }
        webView.evaluateJavaScript(WebGamepadBridge.updateScript(for: gamepad), completionHandler: nil)
    }

    func reload() {
        if webView.url == nil {
            webView.load(URLRequest(url: WebGamepadBridge.startURL))
        } else {
            webView.reload()
        }
    }

    // MARK: - Navigation bornée

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        // Les cadres internes (vérifications de connexion) suivent leurs
        // propres règles ; seule la page principale est bornée.
        guard navigationAction.targetFrame?.isMainFrame ?? true,
              let url = navigationAction.request.url else {
            decisionHandler(.allow)
            return
        }
        if WebGamepadBridge.isAllowed(url) {
            decisionHandler(.allow)
        } else {
            // Hors de Microsoft et de la Xbox : Safari, jamais dans HemiPad.
            // Et seulement sur un lien touché : une page ou une redirection
            // ne peut pas, d'elle-même, faire sortir de l'application.
            if url.scheme?.lowercased() == "https", navigationAction.navigationType == .linkActivated {
                UIApplication.shared.open(url)
            }
            decisionHandler(.cancel)
        }
    }

    /// Une fenêtre surgissante (connexion au compte) s'ouvre dans la même
    /// vue, sous les mêmes règles.
    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if let url = navigationAction.request.url, WebGamepadBridge.isAllowed(url) {
            webView.load(navigationAction.request)
        }
        return nil
    }
}

private struct RemotePlayWebView: UIViewRepresentable {
    let page: RemotePlayPage

    func makeUIView(context: Context) -> WKWebView { page.webView }
    func updateUIView(_ webView: WKWebView, context: Context) {}
}
