//! Le bouton flottant qui descend d'une section à la suivante, puis ramène
//! en haut au bout du parcours. Une seule main tient le téléphone : un grand
//! bouton au pouce vaut mieux qu'un long glissement.

use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::Element;
use yew::prelude::*;

use crate::anim::defilement;
use crate::dom;
use crate::etat::use_etat;
use crate::i18n::remplir;

fn etapes() -> Vec<Element> {
    let Ok(liste) =
        dom::document().query_selector_all("main > section[id]:not(#ouverture), footer")
    else {
        return Vec::new();
    };
    (0..liste.length())
        .filter_map(|i| liste.item(i))
        .filter_map(|noeud| noeud.dyn_into::<Element>().ok())
        .collect()
}

fn marge(element: &Element) -> f64 {
    dom::fenetre()
        .get_computed_style(element)
        .ok()
        .flatten()
        .and_then(|style| style.get_property_value("scroll-margin-top").ok())
        .and_then(|valeur| valeur.trim_end_matches("px").parse().ok())
        .unwrap_or(0.0)
}

fn arret(element: &Element) -> f64 {
    (dom::haut_absolu(element) - marge(element)).max(0.0)
}

fn prochaine() -> Option<Element> {
    let racine = dom::document().document_element()?;
    let au_bout =
        (dom::defilement() + dom::hauteur_fenetre()).ceil() >= racine.scroll_height() as f64 - 2.0;
    if au_bout {
        return None;
    }
    let y = dom::defilement();
    etapes().into_iter().find(|etape| arret(etape) > y + 24.0)
}

fn nom_de(etape: &Element, pied: &str) -> String {
    if etape.tag_name() == "FOOTER" {
        return pied.to_string();
    }
    etape
        .get_attribute("aria-labelledby")
        .and_then(|id| dom::par_id(&id))
        .and_then(|titre| titre.text_content())
        .map(|texte| texte.split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|texte| !texte.is_empty())
        .unwrap_or_else(|| etape.id())
}

/// Le bouton n'apparaît qu'une fois l'ouverture passée : il ne doit pas
/// recouvrir les boutons d'accueil.
fn present() -> bool {
    match dom::par_id("ouverture") {
        Some(ouverture) => {
            ouverture.get_bounding_client_rect().bottom() < dom::hauteur_fenetre() * 0.5
        }
        None => true,
    }
}

#[component]
pub fn Suivant() -> Html {
    let etat = use_etat();
    let d = etat.dico();
    let cible = use_state_eq(|| None::<(String, String)>);
    let visible = use_state_eq(|| false);
    let annonce = use_state(String::new);

    {
        let cible = cible.clone();
        let visible = visible.clone();
        let pied = d.pager.footer.clone();
        use_effect_with(etat.langue, move |_| {
            let actualiser = move || {
                visible.set(present());
                cible.set(prochaine().map(|etape| {
                    let id = if etape.id().is_empty() {
                        "pied".to_string()
                    } else {
                        etape.id()
                    };
                    (id, nom_de(&etape, &pied))
                }));
            };
            actualiser();
            let image = std::rc::Rc::new(std::cell::Cell::new(0));
            let planifier = {
                let image = image.clone();
                let actualiser = std::rc::Rc::new(actualiser);
                let rappel = {
                    let actualiser = actualiser.clone();
                    Closure::<dyn FnMut()>::new(move || actualiser())
                };
                Closure::<dyn FnMut()>::new(move || {
                    let fenetre = dom::fenetre();
                    let _ = fenetre.cancel_animation_frame(image.get());
                    if let Ok(id) = fenetre.request_animation_frame(rappel.as_ref().unchecked_ref())
                    {
                        image.set(id);
                    }
                })
            };
            let fenetre = dom::fenetre();
            let _ = fenetre
                .add_event_listener_with_callback("scroll", planifier.as_ref().unchecked_ref());
            let _ = fenetre
                .add_event_listener_with_callback("resize", planifier.as_ref().unchecked_ref());
            move || {
                let _ = fenetre.cancel_animation_frame(image.get());
                let _ = fenetre.remove_event_listener_with_callback(
                    "scroll",
                    planifier.as_ref().unchecked_ref(),
                );
                let _ = fenetre.remove_event_listener_with_callback(
                    "resize",
                    planifier.as_ref().unchecked_ref(),
                );
            }
        });
    }

    let aller = {
        let annonce = annonce.clone();
        let reduit = etat.reduit();
        let p = (
            d.pager.top_label.clone(),
            d.pager.arrived.clone(),
            d.pager.footer.clone(),
        );
        Callback::from(move |_| match prochaine() {
            None => {
                defilement::aller_a(0.0, !reduit);
                annonce.set(p.0.clone());
            }
            Some(etape) => {
                defilement::aller_a(arret(&etape), !reduit);
                annonce.set(remplir(&p.1, &[("nom", &nom_de(&etape, &p.2))]));
            }
        })
    };

    let au_bout = cible.is_none();
    let etiquette = match &*cible {
        None => d.pager.top_label.clone(),
        Some((_, nom)) => remplir(&d.pager.next_label, &[("nom", nom)]),
    };
    let destination = match &*cible {
        None => "haut".to_string(),
        Some((id, _)) => id.clone(),
    };
    html! {
        <>
            <button type="button"
                class={classes!("pager", au_bout.then_some("is-top"), (!*visible).then_some("is-away"))}
                onclick={aller} aria-label={etiquette}
                aria-hidden={(!*visible).to_string()} tabindex={if *visible { "0" } else { "-1" }}
                data-pager-target={destination}>
                <span>{ if au_bout { &d.pager.top } else { &d.pager.next } }</span>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
            </button>
            <p class="visually-hidden" role="status" aria-live="polite">{ (*annonce).clone() }</p>
        </>
    }
}
