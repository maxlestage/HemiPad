//! L'application : les réglages partagés, puis la page.

use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use yew::prelude::*;

use std::cell::RefCell;
use std::rc::Rc;

use crate::anim::curseur::Curseur;
use crate::anim::defilement;
use crate::anim::revelation::{tout_montrer, Revelation};
use crate::composants::accessibilite::Accessibilite;
use crate::composants::bande::Bande;
use crate::composants::clavier::SectionClavier;
use crate::composants::demo::Demo;
use crate::composants::entete::Entete;
use crate::composants::ouverture::Ouverture;
use crate::composants::partage::Partage;
use crate::composants::pied::Pied;
use crate::composants::profils::Profils;
use crate::composants::suivant::Suivant;
use crate::composants::technique::Technique;
use crate::dom;
use crate::etat::{appliquer, Action, Etat, Reglages};

#[component]
pub fn App() -> Html {
    let etat = use_reducer(Reglages::initiaux);

    // Les réglages s'appliquent au document à chaque changement.
    {
        let reglages = (*etat).clone();
        use_effect_with(reglages, appliquer);
    }

    // Le système change d'avis (thème, animations) : on suit.
    {
        let etat = etat.clone();
        use_effect_with((), move |_| {
            let ecouteurs = suivre_le_systeme(&etat);
            ouvrir_la_porte();
            enregistrer_service_worker();
            move || drop(ecouteurs)
        });
    }

    html! {
        <ContextProvider<Etat> context={etat}>
            <Page />
        </ContextProvider<Etat>>
    }
}

#[component]
fn Page() -> Html {
    let etat = crate::etat::use_etat();
    let d = etat.dico();
    let reduit = etat.reduit();

    // Le mouvement : défilement adouci et curseur, seulement avec un pointeur
    // précis et des animations permises ; apparitions au défilement sinon
    // tout de suite visibles.
    {
        use_effect_with(reduit, move |reduit| {
            let actif = !*reduit && dom::pointeur_fin();
            let curseur = if actif {
                defilement::activer();
                Curseur::demarrer()
            } else {
                defilement::desactiver();
                None
            };
            move || drop(curseur)
        });
    }
    let revelation: Rc<RefCell<Option<Revelation>>> = use_mut_ref(|| None);
    {
        let revelation = revelation.clone();
        use_effect_with((reduit, etat.langue), move |(reduit, _)| {
            if *reduit {
                revelation.borrow_mut().take();
                tout_montrer();
            } else {
                let mut r = revelation.borrow_mut();
                match r.as_ref() {
                    Some(existante) => existante.rafraichir(),
                    None => *r = Some(Revelation::observer()),
                }
            }
        });
    }

    html! {
        <div class="page" id="haut">
            <a class="skip-link" href="#demo">{ &d.nav.skip }</a>
            <div class="grain" aria-hidden="true"></div>
            <div class="curseur-anneau" aria-hidden="true"></div>
            <div class="curseur-point" aria-hidden="true"></div>
            <Entete />
            <main>
                <Ouverture />
                <Bande />
                <Demo />
                <Accessibilite />
                <SectionClavier />
                <Profils />
                <Technique />
                <Partage />
            </main>
            <Pied />
            <Suivant />
        </div>
    }
}

type Ecouteur = Closure<dyn FnMut(web_sys::MediaQueryListEvent)>;

/// Garde les écouteurs vivants tant que l'application l'est.
struct Ecouteurs(Vec<(web_sys::MediaQueryList, Ecouteur)>);

impl Drop for Ecouteurs {
    fn drop(&mut self) {
        for (liste, ecouteur) in &self.0 {
            let _ = liste
                .remove_event_listener_with_callback("change", ecouteur.as_ref().unchecked_ref());
        }
    }
}

fn suivre_le_systeme(etat: &Etat) -> Ecouteurs {
    let mut ecouteurs = Vec::new();
    type Requete = (&'static str, fn(bool) -> Action);
    let requetes: [Requete; 2] = [
        ("(prefers-color-scheme: light)", Action::SystemeClair),
        ("(prefers-reduced-motion: reduce)", Action::SystemeReduit),
    ];
    for (requete, action) in requetes {
        let Some(liste) = dom::fenetre().match_media(requete).ok().flatten() else {
            continue;
        };
        let etat = etat.clone();
        let ecouteur: Ecouteur = Closure::new(move |evenement: web_sys::MediaQueryListEvent| {
            etat.dispatch(action(evenement.matches()));
        });
        let _ = liste.add_event_listener_with_callback("change", ecouteur.as_ref().unchecked_ref());
        ecouteurs.push((liste, ecouteur));
    }
    Ecouteurs(ecouteurs)
}

/// Le programme est prêt : la porte s'ouvre. Elle reste au moins le temps
/// que le signe se trace, pour ne pas clignoter sur une connexion rapide.
fn ouvrir_la_porte() {
    // 1,6 s depuis l'ouverture de la page : le temps que le signe se trace
    // et que le compte atteigne cent.
    let reste = (1600.0 - dom::maintenant()).max(0.0) as u32;
    gloo_timers::callback::Timeout::new(reste, || {
        if let Some(racine) = dom::racine() {
            let _ = racine.class_list().add_1("programme-pret");
        }
    })
    .forget();
}

/// Le site s'installe et reste lisible hors connexion.
fn enregistrer_service_worker() {
    let navigateur = dom::fenetre().navigator();
    if js_sys::Reflect::has(&navigateur, &JsValue::from_str("serviceWorker")).unwrap_or(false) {
        let _ = navigateur.service_worker().register("/sw.js");
    }
}
