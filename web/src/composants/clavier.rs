//! Coder à une main : les modificateurs se composent l'un après l'autre.

use std::collections::BTreeSet;

use yew::prelude::*;

use super::commun::TeteSection;
use crate::etat::use_etat;

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum Modificateur {
    Cmd,
    Maj,
    Ctrl,
    Alt,
}

const MODIFICATEURS: [(Modificateur, &str); 4] = [
    (Modificateur::Cmd, "⌘"),
    (Modificateur::Maj, "⇧"),
    (Modificateur::Ctrl, "ctrl"),
    (Modificateur::Alt, "⌥"),
];

const TOUCHES: [&str; 12] = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l"];

#[derive(Clone, PartialEq, Default)]
struct Clavier {
    armes: BTreeSet<Modificateur>,
    verrouilles: BTreeSet<Modificateur>,
    historique: Vec<String>,
}

impl Clavier {
    fn effectifs(&self) -> BTreeSet<Modificateur> {
        self.armes.union(&self.verrouilles).copied().collect()
    }

    /// Un appui arme, un second verrouille, un troisième libère.
    fn toucher_modificateur(&mut self, m: Modificateur) {
        if self.verrouilles.remove(&m) {
            return;
        }
        if self.armes.remove(&m) {
            self.verrouilles.insert(m);
            return;
        }
        self.armes.insert(m);
    }

    fn taper(&mut self, touche: &str, affichage: Option<&str>) {
        let effectifs = self.effectifs();
        let mut parties: Vec<String> = MODIFICATEURS
            .iter()
            .filter(|(m, _)| effectifs.contains(m))
            .map(|(_, etiquette)| etiquette.to_string())
            .collect();
        let majuscule = effectifs.contains(&Modificateur::Maj);
        parties.push(match affichage {
            Some(texte) => texte.to_string(),
            None if majuscule => touche.to_uppercase(),
            None => touche.to_string(),
        });
        self.historique.push(parties.join(" "));
        if self.historique.len() > 6 {
            self.historique.remove(0);
        }
        self.armes.clear();
    }
}

#[component]
pub fn SectionClavier() -> Html {
    let d = use_etat().dico();
    let k = &d.keyboard;
    let clavier = use_state(Clavier::default);
    let effectifs = clavier.effectifs();
    let majuscule = effectifs.contains(&Modificateur::Maj);

    let taper = |touche: &'static str, affichage: Option<String>| {
        let clavier = clavier.clone();
        Callback::from(move |_| {
            let mut suivant = (*clavier).clone();
            suivant.taper(touche, affichage.as_deref());
            clavier.set(suivant);
        })
    };

    html! {
        <section class="section keyboard" id="clavier" aria-labelledby="clavier-titre">
            <TeteSection numero="03" sur_titre={k.eyebrow.clone()} titre={k.title.clone()}
                id_titre="clavier-titre" chapeau={k.lede.clone()} />
            <div class="keyboard-panel" data-reveler="">
                <div class="keyboard-output" aria-live="polite">
                    <span class="prompt">{ &k.output }</span>
                    if clavier.historique.is_empty() {
                        <code class="empty">{ &k.waiting }</code>
                    } else {
                        <ul>
                            { for clavier.historique.iter().map(|entree| html! { <li><code>{ entree }</code></li> }) }
                        </ul>
                    }
                </div>

                <div class="modifier-row">
                    { for MODIFICATEURS.iter().map(|(m, etiquette)| {
                        let m = *m;
                        let arme = clavier.armes.contains(&m);
                        let verrouille = clavier.verrouilles.contains(&m);
                        let onclick = {
                            let clavier = clavier.clone();
                            Callback::from(move |_| {
                                let mut suivant = (*clavier).clone();
                                suivant.toucher_modificateur(m);
                                clavier.set(suivant);
                            })
                        };
                        html! {
                            <button type="button"
                                class={classes!("modifier", arme.then_some("is-armed"), verrouille.then_some("is-locked"))}
                                aria-pressed={(arme || verrouille).to_string()} {onclick} data-aimant="">
                                { *etiquette }
                                <span class="modifier-state">
                                    { if verrouille { &k.states.locked } else if arme { &k.states.armed } else { &k.states.free } }
                                </span>
                            </button>
                        }
                    }) }
                </div>

                <div class="key-grid">
                    { for TOUCHES.iter().map(|touche| html! {
                        <button type="button" class="key" onclick={taper(touche, None)}>
                            { if majuscule { touche.to_uppercase() } else { touche.to_string() } }
                        </button>
                    }) }
                </div>

                <div class="key-actions">
                    <button type="button" class="key key-wide" onclick={taper("space", Some(k.space.clone()))}>{ &k.space }</button>
                    <button type="button" class="key key-wide" onclick={taper("backspace", Some(k.backspace.clone()))}>{ &k.backspace }</button>
                </div>

                <ul class="macro-row">
                    { for k.macros.iter().map(|m| html! {
                        <li>
                            <span class="macro-title">{ &m.title }</span>
                            <span class="macro-detail">{ &m.detail }</span>
                        </li>
                    }) }
                </ul>
            </div>
        </section>
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn un_modificateur_arme_puis_verrouille_puis_libere() {
        let mut c = Clavier::default();
        c.toucher_modificateur(Modificateur::Cmd);
        assert!(c.armes.contains(&Modificateur::Cmd));
        c.toucher_modificateur(Modificateur::Cmd);
        assert!(c.verrouilles.contains(&Modificateur::Cmd) && c.armes.is_empty());
        c.toucher_modificateur(Modificateur::Cmd);
        assert!(c.effectifs().is_empty());
    }

    #[test]
    fn les_modificateurs_se_composent_l_un_apres_l_autre() {
        let mut c = Clavier::default();
        c.toucher_modificateur(Modificateur::Cmd);
        c.toucher_modificateur(Modificateur::Maj);
        c.taper("p", None);
        assert_eq!(c.historique, ["⌘ ⇧ P"]);
        // Armés, ils retombent après une frappe ; verrouillés, ils restent.
        assert!(c.armes.is_empty());
    }
}
