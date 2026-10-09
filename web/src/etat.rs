//! Les réglages du visiteur : langue, thème, animations, main valide et
//! appareil. Ils vivent dans un seul état partagé, sont gardés dans le
//! stockage local (mêmes clés que l'ancien site : rien n'est perdu) et
//! appliqués au document.

use std::rc::Rc;

use yew::prelude::*;

use crate::dom;
use crate::i18n::{dico, Dico, Langue, LANGUES};
use crate::solveur::Main;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ChoixTheme {
    Auto,
    Clair,
    Sombre,
}

impl ChoixTheme {
    pub const TOUS: [ChoixTheme; 3] = [ChoixTheme::Auto, ChoixTheme::Clair, ChoixTheme::Sombre];

    pub fn code(self) -> &'static str {
        match self {
            ChoixTheme::Auto => "auto",
            ChoixTheme::Clair => "light",
            ChoixTheme::Sombre => "dark",
        }
    }

    fn depuis_code(code: &str) -> Option<Self> {
        Self::TOUS.into_iter().find(|c| c.code() == code)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ChoixMouvement {
    Auto,
    Anime,
    Apaise,
}

impl ChoixMouvement {
    pub const TOUS: [ChoixMouvement; 3] = [
        ChoixMouvement::Auto,
        ChoixMouvement::Anime,
        ChoixMouvement::Apaise,
    ];

    pub fn code(self) -> &'static str {
        match self {
            ChoixMouvement::Auto => "auto",
            ChoixMouvement::Anime => "full",
            ChoixMouvement::Apaise => "reduced",
        }
    }

    fn depuis_code(code: &str) -> Option<Self> {
        Self::TOUS.into_iter().find(|c| c.code() == code)
    }
}

/// Deux appareils, l'iPad en premier : posé sur une table ou un support, il
/// libère la main valide du poids de l'appareil, et son écran offre des
/// cibles bien plus grandes.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Appareil {
    Ipad,
    Iphone,
}

impl Appareil {
    pub const TOUS: [Appareil; 2] = [Appareil::Ipad, Appareil::Iphone];

    pub fn code(self) -> &'static str {
        match self {
            Appareil::Ipad => "ipad",
            Appareil::Iphone => "iphone",
        }
    }

    fn depuis_code(code: &str) -> Option<Self> {
        Self::TOUS.into_iter().find(|c| c.code() == code)
    }
}

const CLE_LANGUE: &str = "hemipad.locale";
const CLE_THEME: &str = "hemipad.theme";
const CLE_MOUVEMENT: &str = "hemipad.motion";
const CLE_MAIN: &str = "hemipad.main";
const CLE_APPAREIL: &str = "hemipad.appareil";

#[derive(Clone, Debug, PartialEq)]
pub struct Reglages {
    pub langue: Langue,
    pub theme: ChoixTheme,
    pub mouvement: ChoixMouvement,
    pub main: Main,
    pub appareil: Appareil,
    pub systeme_clair: bool,
    pub systeme_reduit: bool,
}

impl Reglages {
    /// Ce que le visiteur a déjà choisi, sinon ce que son système préfère.
    pub fn initiaux() -> Self {
        Reglages {
            langue: dom::lire(CLE_LANGUE)
                .and_then(|code| Langue::depuis_code(&code))
                .unwrap_or_else(langue_du_navigateur),
            theme: dom::lire(CLE_THEME)
                .and_then(|code| ChoixTheme::depuis_code(&code))
                .unwrap_or(ChoixTheme::Auto),
            mouvement: dom::lire(CLE_MOUVEMENT)
                .and_then(|code| ChoixMouvement::depuis_code(&code))
                .unwrap_or(ChoixMouvement::Auto),
            main: dom::lire(CLE_MAIN)
                .and_then(|code| Main::depuis_code(&code))
                .unwrap_or(Main::Droite),
            appareil: dom::lire(CLE_APPAREIL)
                .and_then(|code| Appareil::depuis_code(&code))
                .unwrap_or(Appareil::Ipad),
            systeme_clair: dom::media("(prefers-color-scheme: light)"),
            systeme_reduit: dom::media("(prefers-reduced-motion: reduce)"),
        }
    }

    /// Les animations sont-elles apaisées ? Le choix du visiteur l'emporte
    /// sur celui du système.
    pub fn reduit(&self) -> bool {
        match self.mouvement {
            ChoixMouvement::Auto => self.systeme_reduit,
            ChoixMouvement::Anime => false,
            ChoixMouvement::Apaise => true,
        }
    }

    pub fn sombre(&self) -> bool {
        match self.theme {
            ChoixTheme::Auto => !self.systeme_clair,
            ChoixTheme::Clair => false,
            ChoixTheme::Sombre => true,
        }
    }

    pub fn dico(&self) -> Rc<Dico> {
        dico(self.langue)
    }
}

fn langue_du_navigateur() -> Langue {
    let navigateur = dom::fenetre().navigator();
    let mut candidates: Vec<String> = navigateur
        .languages()
        .iter()
        .filter_map(|valeur| valeur.as_string())
        .collect();
    if let Some(langue) = navigateur.language() {
        candidates.push(langue);
    }
    candidates
        .iter()
        .find_map(|code| {
            let court = code.split('-').next().unwrap_or("").to_lowercase();
            LANGUES.into_iter().find(|langue| langue.code() == court)
        })
        .unwrap_or(Langue::Fr)
}

pub enum Action {
    Langue(Langue),
    Theme(ChoixTheme),
    Mouvement(ChoixMouvement),
    Main(Main),
    Appareil(Appareil),
    SystemeClair(bool),
    SystemeReduit(bool),
}

impl Reducible for Reglages {
    type Action = Action;

    fn reduce(self: Rc<Self>, action: Action) -> Rc<Self> {
        let mut suivant = (*self).clone();
        match action {
            Action::Langue(langue) => {
                suivant.langue = langue;
                dom::ecrire(CLE_LANGUE, langue.code());
            }
            Action::Theme(theme) => {
                suivant.theme = theme;
                dom::ecrire(CLE_THEME, theme.code());
            }
            Action::Mouvement(mouvement) => {
                suivant.mouvement = mouvement;
                dom::ecrire(CLE_MOUVEMENT, mouvement.code());
            }
            Action::Main(main) => {
                suivant.main = main;
                dom::ecrire(CLE_MAIN, main.code());
            }
            Action::Appareil(appareil) => {
                suivant.appareil = appareil;
                dom::ecrire(CLE_APPAREIL, appareil.code());
            }
            Action::SystemeClair(clair) => suivant.systeme_clair = clair,
            Action::SystemeReduit(reduit) => suivant.systeme_reduit = reduit,
        }
        if suivant == *self {
            self
        } else {
            Rc::new(suivant)
        }
    }
}

pub type Etat = UseReducerHandle<Reglages>;

/// Les réglages, depuis n'importe quel composant.
#[hook]
pub fn use_etat() -> Etat {
    use_context::<Etat>().expect("les réglages sont fournis par l'application")
}

/// Applique les réglages au document : thème, langue, animations, titre.
pub fn appliquer(reglages: &Reglages) {
    let Some(racine) = dom::racine() else { return };
    let _ = racine.set_attribute("data-theme", reglages.theme.code());
    let _ = racine.set_attribute(
        "data-motion",
        if reglages.reduit() { "reduced" } else { "full" },
    );
    let _ = racine.set_attribute("lang", reglages.langue.code());
    let _ = racine.style().set_property(
        "color-scheme",
        if reglages.sombre() { "dark" } else { "light" },
    );
    let document = dom::document();
    let d = reglages.dico();
    document.set_title(&d.meta.title);
    if let Ok(Some(meta)) = document.query_selector("meta[name=\"description\"]") {
        let _ = meta.set_attribute("content", &d.meta.description);
    }
    if let Ok(Some(meta)) = document.query_selector("meta[name=\"theme-color\"]") {
        let _ = meta.set_attribute(
            "content",
            if reglages.sombre() {
                "#05060d"
            } else {
                "#f4f6fc"
            },
        );
    }
}
