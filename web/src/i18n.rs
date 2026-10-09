//! Les textes du site, en trois langues.
//!
//! Chaque langue est un fichier JSON (`web/i18n/*.json`) compilé dans le
//! programme : pas de requête réseau pour changer de langue, et une faute de
//! structure fait échouer les tests, pas la page.

use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;

use serde::Deserialize;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Langue {
    Fr,
    En,
    Es,
}

pub const LANGUES: [Langue; 3] = [Langue::Fr, Langue::En, Langue::Es];

impl Langue {
    pub fn code(self) -> &'static str {
        match self {
            Langue::Fr => "fr",
            Langue::En => "en",
            Langue::Es => "es",
        }
    }

    pub fn depuis_code(code: &str) -> Option<Self> {
        LANGUES.into_iter().find(|langue| langue.code() == code)
    }

    fn source(self) -> &'static str {
        match self {
            Langue::Fr => include_str!("../i18n/fr.json"),
            Langue::En => include_str!("../i18n/en.json"),
            Langue::Es => include_str!("../i18n/es.json"),
        }
    }
}

thread_local! {
    static CACHE: RefCell<HashMap<Langue, Rc<Dico>>> = RefCell::new(HashMap::new());
}

/// Le dictionnaire d'une langue, lu une seule fois.
pub fn dico(langue: Langue) -> Rc<Dico> {
    CACHE.with(|cache| {
        cache
            .borrow_mut()
            .entry(langue)
            .or_insert_with(|| {
                Rc::new(serde_json::from_str(langue.source()).expect("dictionnaire valide"))
            })
            .clone()
    })
}

/// Un texte qui dépend d'un nombre : « 1 actif », « 2 actifs ».
#[derive(Debug, Deserialize, PartialEq)]
pub struct Pluriel {
    one: String,
    other: String,
}

impl Pluriel {
    pub fn n(&self, nombre: usize) -> String {
        let modele = if nombre == 1 { &self.one } else { &self.other };
        modele.replace("{n}", &nombre.to_string())
    }
}

/// Remplace `{cle}` par sa valeur.
pub fn remplir(modele: &str, valeurs: &[(&str, &str)]) -> String {
    valeurs
        .iter()
        .fold(modele.to_string(), |texte, (cle, valeur)| {
            texte.replace(&format!("{{{cle}}}"), valeur)
        })
}

#[derive(Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Dico {
    pub locale_name: String,
    pub locale_switch_label: String,
    pub meta: Meta,
    pub nav: Nav,
    pub film: Film,
    pub hero: Hero,
    pub pager: Pager,
    pub demo: Demo,
    pub features: Features,
    pub keyboard: Keyboard,
    pub consoles: Consoles,
    pub architecture: Architecture,
    pub share: Share,
    pub install: Install,
    pub footer: Footer,
    pub control_names: HashMap<String, String>,
}

impl Dico {
    pub fn nom_commande<'a>(&'a self, id: &'a str) -> &'a str {
        self.control_names.get(id).map(String::as_str).unwrap_or(id)
    }
}

#[derive(Debug, Deserialize, PartialEq)]
pub struct Meta {
    pub title: String,
    pub description: String,
}

#[derive(Debug, Deserialize, PartialEq)]
pub struct Nav {
    pub label: String,
    pub demo: String,
    pub accessibility: String,
    pub keyboard: String,
    pub consoles: String,
    pub tech: String,
    pub skip: String,
}

/// L'ouverture : le film de grains piloté par le défilement.
#[derive(Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Film {
    pub label: String,
    pub skip: String,
    pub scroll: String,
    pub stations: Vec<String>,
    pub canvas_label: String,
}

#[derive(Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Hero {
    pub eyebrow: String,
    pub title_lead: String,
    pub title_accent: String,
    pub lede: String,
    pub lede_strong: String,
    pub primary: String,
    pub secondary: String,
    pub stats: Vec<Stat>,
    pub tilt: Tilt,
}

#[derive(Debug, Deserialize, PartialEq)]
pub struct Stat {
    pub label: String,
    pub value: String,
}

#[derive(Debug, Deserialize, PartialEq)]
pub struct Tilt {
    pub follow: String,
    pub following: String,
    pub asking: String,
    pub denied: String,
    pub unavailable: String,
}

#[derive(Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Pager {
    pub next: String,
    pub next_label: String,
    pub top: String,
    pub top_label: String,
    pub arrived: String,
    pub footer: String,
}

#[derive(Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Demo {
    pub eyebrow: String,
    pub title: String,
    pub lede: String,
    pub hand: String,
    pub hand_left: String,
    pub hand_right: String,
    pub target_size: String,
    pub unit: String,
    pub downscaled: String,
    pub activation: String,
    pub console: String,
    pub release_all: String,
    pub connected: String,
    pub layout: DemoLayout,
    pub spacing: String,
    pub spacing_hint: String,
    pub tightened: String,
    pub edit: DemoEdit,
    pub own_layout: OwnLayout,
    pub device: DemoDevice,
    pub control: DemoControl,
    pub active: Pluriel,
    pub screen_label: String,
    pub modes: Vec<Mode>,
}

#[derive(Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DemoLayout {
    pub label: String,
    pub arc: String,
    pub free: String,
    pub arc_detail: String,
    pub free_detail: String,
}

#[derive(Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DemoEdit {
    pub start: String,
    pub done: String,
    pub hint: String,
    pub hint_free: String,
    pub overlap: Pluriel,
    pub reset_positions: String,
}

#[derive(Debug, Deserialize, PartialEq)]
pub struct OwnLayout {
    pub label: String,
    pub on: String,
    pub off: String,
}

#[derive(Debug, Deserialize, PartialEq)]
pub struct DemoDevice {
    pub label: String,
    pub ipad: String,
    pub iphone: String,
    pub hint: String,
}

#[derive(Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DemoControl {
    pub settings: String,
    pub visibility: String,
    pub show: String,
    pub hide: String,
    pub hidden_badge: String,
    pub activation: String,
    pub inherit: String,
    pub size: String,
    pub reposition: String,
    pub reset: String,
    pub close: String,
    pub lock: String,
    pub unlock: String,
    pub locked_badge: String,
    pub locked_hint: String,
    pub selection: Pluriel,
    pub deselect: String,
    pub multiple: Pluriel,
}

#[derive(Debug, Deserialize, PartialEq)]
pub struct Mode {
    pub id: String,
    pub label: String,
    pub detail: String,
}

#[derive(Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Features {
    pub eyebrow: String,
    pub title: String,
    pub lede: String,
    pub problem_tag: String,
    pub answer_tag: String,
    pub items: Vec<Feature>,
}

#[derive(Debug, Deserialize, PartialEq)]
pub struct Feature {
    pub icon: String,
    pub title: String,
    pub problem: String,
    pub answer: String,
}

#[derive(Debug, Deserialize, PartialEq)]
pub struct Keyboard {
    pub eyebrow: String,
    pub title: String,
    pub lede: String,
    pub output: String,
    pub waiting: String,
    pub states: KeyStates,
    pub space: String,
    pub backspace: String,
    pub macros: Vec<Macro>,
}

#[derive(Debug, Deserialize, PartialEq)]
pub struct KeyStates {
    pub free: String,
    pub armed: String,
    pub locked: String,
}

#[derive(Debug, Deserialize, PartialEq)]
pub struct Macro {
    pub title: String,
    pub detail: String,
}

#[derive(Debug, Deserialize, PartialEq)]
pub struct Consoles {
    pub eyebrow: String,
    pub title: String,
    pub lede: String,
    pub summaries: HashMap<String, String>,
}

#[derive(Debug, Deserialize, PartialEq)]
pub struct Architecture {
    pub eyebrow: String,
    pub title: String,
    pub lede: String,
    pub paths: Vec<PathCopy>,
    pub routes: Routes,
    pub specs: Vec<Stat>,
}

#[derive(Debug, Deserialize, PartialEq)]
pub struct PathCopy {
    pub title: String,
    pub subtitle: String,
    #[serde(default)]
    pub kind: Option<String>,
    pub steps: Vec<String>,
    pub note: String,
}

#[derive(Debug, Deserialize, PartialEq)]
pub struct Routes {
    pub title: String,
    pub lede: String,
    pub items: Vec<Route>,
}

#[derive(Debug, Deserialize, PartialEq)]
pub struct Route {
    pub name: String,
    pub verdict: String,
    pub steps: Vec<String>,
    pub note: String,
}

#[derive(Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Share {
    pub eyebrow: String,
    pub title: String,
    pub lede: String,
    pub button: String,
    pub copied: String,
    pub copy: String,
    pub card_role: String,
    pub tagline: String,
}

#[derive(Debug, Deserialize, PartialEq)]
pub struct Install {
    pub button: String,
    pub hint: String,
    pub installed: String,
}

#[derive(Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Footer {
    pub tagline: String,
    pub body: String,
    pub credits_title: String,
    pub credits_role: String,
    pub author: String,
    pub sections: Vec<FooterSection>,
    pub language_title: String,
    pub theme_title: String,
    pub themes: Choix3,
    pub motion_title: String,
    pub motions: Motions,
    pub rights: String,
    pub proprietary: String,
    pub trademarks: String,
    pub updated: String,
}

#[derive(Debug, Deserialize, PartialEq)]
pub struct FooterSection {
    pub title: String,
    pub links: Vec<Lien>,
}

#[derive(Debug, Deserialize, PartialEq)]
pub struct Lien {
    pub label: String,
    pub href: String,
}

#[derive(Debug, Deserialize, PartialEq)]
pub struct Choix3 {
    pub auto: String,
    pub light: String,
    pub dark: String,
}

#[derive(Debug, Deserialize, PartialEq)]
pub struct Motions {
    pub auto: String,
    pub full: String,
    pub reduced: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn les_trois_langues_se_lisent() {
        for langue in LANGUES {
            let d = dico(langue);
            assert!(!d.meta.title.is_empty(), "{:?}", langue);
            assert_eq!(d.demo.modes.len(), 3);
            assert_eq!(d.features.items.len(), 9);
            assert_eq!(d.architecture.routes.items.len(), 3);
        }
    }

    #[test]
    fn les_langues_ont_la_meme_forme() {
        let fr = dico(Langue::Fr);
        for langue in [Langue::En, Langue::Es] {
            let d = dico(langue);
            assert_eq!(
                d.film.stations.len(),
                fr.film.stations.len(),
                "{:?}",
                langue
            );
            assert_eq!(d.hero.stats.len(), fr.hero.stats.len());
            assert_eq!(d.keyboard.macros.len(), fr.keyboard.macros.len());
            assert_eq!(d.architecture.specs.len(), fr.architecture.specs.len());
            assert_eq!(d.footer.sections.len(), fr.footer.sections.len());
            let mut a: Vec<_> = d.control_names.keys().collect();
            let mut b: Vec<_> = fr.control_names.keys().collect();
            a.sort();
            b.sort();
            assert_eq!(a, b, "{:?}", langue);
            for (x, y) in d.demo.modes.iter().zip(&fr.demo.modes) {
                assert_eq!(x.id, y.id);
            }
        }
    }

    #[test]
    fn les_pluriels_et_les_modeles_se_remplissent() {
        let fr = dico(Langue::Fr);
        assert_eq!(fr.demo.active.n(1), "1 actif");
        assert_eq!(fr.demo.active.n(3), "3 actifs");
        assert_eq!(
            remplir(&fr.pager.arrived, &[("nom", "Démo")]),
            "Section : Démo"
        );
    }
}
