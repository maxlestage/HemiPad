import SwiftUI

/// Une étape d'un guide : un titre court, un détail.
struct GuideStep: Identifiable {
    let id = UUID()
    let title: String
    let detail: String
}

/// Un guide pas à pas, plein écran.
///
/// Le même écran sert à tout ce qui s'explique en quelques étapes : jouer à la
/// PS5 par lecture à distance, monter le boîtier. Un seul composant, pour que
/// la présentation reste la même partout et qu'il n'y ait qu'un endroit à
/// soigner pour l'accessibilité.
struct GuideScreen: View {
    let title: String
    let intro: String
    let steps: [GuideStep]
    /// Une remarque de bas de page, honnête sur les limites.
    let footnote: String?
    /// Un lien facultatif, montré en toutes lettres (jamais caché derrière un
    /// mot) pour qu'on puisse le recopier.
    let link: String?

    @EnvironmentObject private var state: AppState
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header

                ForEach(Array(steps.enumerated()), id: \.element.id) { index, step in
                    stepRow(number: index + 1, step: step)
                }

                if let link {
                    linkRow(link)
                }

                if let footnote {
                    Text(footnote)
                        .font(.caption)
                        .foregroundStyle(Theme.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 4)
                }

                doneButton
            }
            .padding(18)
        }
        .background(AuroraBackground(reducedMotion: state.profile.reducedMotion))
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(title)
                    .font(.title2.weight(.bold))
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 8)
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark")
                        .font(.headline)
                        .frame(width: 44, height: 44)
                        .background(Circle().fill(Theme.surfaceHigh))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text("Fermer"))
            }
            Text(intro)
                .font(.callout)
                .foregroundStyle(Theme.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func stepRow(number: Int, step: GuideStep) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Text("\(number)")
                .font(.body.weight(.bold).monospacedDigit())
                .frame(width: 34, height: 34)
                .background(Circle().fill(state.accent))
                .foregroundStyle(Theme.background)
            VStack(alignment: .leading, spacing: 4) {
                Text(step.title)
                    .font(.body.weight(.semibold))
                Text(step.detail)
                    .font(.callout)
                    .foregroundStyle(Theme.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(RoundedRectangle(cornerRadius: Theme.cardRadius).fill(Theme.surface))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Text("Étape \(number). \(step.title). \(step.detail)"))
    }

    /// Un lien montré en toutes lettres : sélectionnable, recopiable, jamais
    /// masqué derrière un mot cliquable.
    private func linkRow(_ link: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("À installer")
                .font(.caption.weight(.bold))
                .foregroundStyle(Theme.secondaryText)
            Text(link)
                .font(.callout.monospaced())
                .textSelection(.enabled)
                .foregroundStyle(state.accent)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(RoundedRectangle(cornerRadius: Theme.cardRadius).fill(Theme.surfaceHigh))
    }

    private var doneButton: some View {
        Button {
            dismiss()
        } label: {
            Text("J'ai compris")
                .font(.callout.weight(.semibold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(RoundedRectangle(cornerRadius: 14).fill(state.accent))
                .foregroundStyle(Theme.background)
        }
        .buttonStyle(.plain)
        .padding(.top, 6)
    }
}

extension GuideScreen {
    /// Jouer à la PS5, d'une main, par la lecture à distance officielle de
    /// Sony. Aucun contournement : c'est la voie que Sony ouvre à ses
    /// utilisateurs. Il faut un ordinateur pour faire le relais.
    static var playstationRemotePlay: GuideScreen {
        GuideScreen(
            title: "Jouer à la PS5",
            intro: "La PS5 n'accepte pas de manette d'une autre marque, ni en Bluetooth ni par câble. Mais sa lecture à distance, elle, est ouverte : un ordinateur fait le relais, et HemiPad pilote la console. Sans rien acheter.",
            steps: [
                GuideStep(
                    title: "Activer la lecture à distance sur la PS5",
                    detail: "Sur la console : Paramètres › Système › Lecture à distance › Activer la lecture à distance."
                ),
                GuideStep(
                    title: "Installer chiaki-ng sur un ordinateur",
                    detail: "Windows, macOS ou Linux. C'est un logiciel gratuit et libre qui affiche la PS5 sur l'ordinateur et lui relaie la manette."
                ),
                GuideStep(
                    title: "Connecter son compte dans chiaki-ng",
                    detail: "Suivez l'association proposée par chiaki-ng : elle utilise votre compte PlayStation et un code que la console affiche. C'est votre console, votre compte."
                ),
                GuideStep(
                    title: "Appairer HemiPad à l'ordinateur",
                    detail: "En Bluetooth direct : sur l'ordinateur, ajoutez la manette « HemiPad ». Elle y apparaît comme une manette ordinaire."
                ),
                GuideStep(
                    title: "Ouvrir la PS5 dans chiaki-ng",
                    detail: "Le jeu s'affiche sur l'ordinateur, et vos appuis partent vers la console, avec le léger délai de la lecture à distance."
                ),
            ],
            footnote: "Réglage utile côté console : Paramètres › Accessibilité › Manettes › Attributions personnalisées des touches, pour rassembler les commandes sous une main. La lecture à distance dépend de Sony ; HemiPad ne fait que la manette.",
            link: "chiaki-ng — https://streetpea.github.io/chiaki-ng/"
        )
    }

    /// Monter et appairer le boîtier, qui débloque la Switch (et sert de relais
    /// pour toute machine, sans fil ou par câble).
    static func bridgeSetup(secretPlaceholder: Bool) -> GuideScreen {
        GuideScreen(
            title: "Le boîtier HemiPad",
            intro: "Un petit appareil posé près de la console. HemiPad lui envoie les commandes par le Wi-Fi ; lui se présente à la console comme une manette, en Bluetooth ou par câble. C'est ce qui débloque la Switch.",
            steps: [
                GuideStep(
                    title: "Une carte compatible",
                    detail: "Un Raspberry Pi Zero 2 W suffit, et c'est le moins cher. Il faut du Bluetooth et un port USB capable du mode « périphérique »."
                ),
                GuideStep(
                    title: "Installer le logiciel du boîtier",
                    detail: "Sur la carte : récupérez le dossier bridge/, puis lancez sudo ./scripts/installer-boitier.sh et redémarrez. Tout est décrit dans bridge/README.md."
                ),
                GuideStep(
                    title: "Recopier le secret partagé",
                    detail: "L'installation affiche un secret de 64 caractères. Collez-le dans HemiPad, avec l'adresse du boîtier, dans la section « Le boîtier » de l'écran Connexion."
                ),
                GuideStep(
                    title: "Sans fil, ou par câble",
                    detail: "Sans fil : cherchez une manette depuis la console, elle voit « HemiPad ». Par câble : branchez le boîtier au port USB de la console. HemiPad prend le chemin disponible, tout seul."
                ),
            ],
            footnote: secretPlaceholder
                ? "Le boîtier n'est pas encore appairé : renseignez son adresse et son secret dans « Le boîtier ». Tout ce qui passe par le Wi-Fi est signé ; personne d'autre sur le réseau ne peut jouer à votre place."
                : "Le boîtier est appairé. Tout ce qui passe par le Wi-Fi est signé ; personne d'autre sur le réseau ne peut jouer à votre place.",
            link: nil
        )
    }
}
