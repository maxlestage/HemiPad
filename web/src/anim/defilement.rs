//! Le défilement adouci, à la manière de Lenis.
//!
//! La molette ne saute plus de cent pixels d'un coup : la page glisse vers sa
//! destination, image après image. C'est ce qui rend lisibles les scènes
//! pilotées par le défilement.
//!
//! Seulement là où ça aide : avec une souris ou un trackpad, et animations
//! non apaisées. Au doigt, le défilement natif du téléphone est déjà fluide —
//! et le remplacer serait le dégrader. Clavier, barre de défilement, ancres :
//! rien de tout cela n'est intercepté, le moteur se recale simplement dessus.

use std::cell::RefCell;
use std::rc::Rc;

use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;

use super::Ecouteur;
use crate::dom;

struct Moteur {
    actuel: f64,
    cible: f64,
    anime: bool,
    image: Option<i32>,
    dernier_temps: f64,
    /// Le défilement en cours vient de nous : ne pas s'y recaler.
    par_nous: bool,
}

/// La fonction appelée à chaque image tant que la page glisse.
type Image = Closure<dyn FnMut(f64)>;

thread_local! {
    static MOTEUR: RefCell<Option<Rc<RefCell<Moteur>>>> = const { RefCell::new(None) };
    static BOUCLE: RefCell<Option<Image>> = const { RefCell::new(None) };
    static ECOUTEURS: RefCell<Vec<Ecouteur<web_sys::Event>>> = const { RefCell::new(Vec::new()) };
}

fn hauteur_max() -> f64 {
    let racine = dom::document().document_element();
    racine
        .map(|r| (r.scroll_height() as f64 - dom::hauteur_fenetre()).max(0.0))
        .unwrap_or(0.0)
}

/// Un élément qui défile lui-même (une liste, une zone de code) garde sa
/// molette.
fn defile_lui_meme(cible: Option<web_sys::EventTarget>) -> bool {
    let mut element = cible.and_then(|c| c.dyn_into::<web_sys::Element>().ok());
    while let Some(e) = element {
        if e.has_attribute("data-defilement-natif") {
            return true;
        }
        if e.scroll_height() > e.client_height() + 2 {
            if let Ok(Some(style)) = dom::fenetre().get_computed_style(&e) {
                let debord = style.get_property_value("overflow-y").unwrap_or_default();
                if debord == "auto" || debord == "scroll" {
                    return true;
                }
            }
        }
        element = e.parent_element();
    }
    false
}

fn demarrer_boucle() {
    let deja = MOTEUR.with(|m| {
        m.borrow()
            .as_ref()
            .map(|m| m.borrow().image.is_some())
            .unwrap_or(true)
    });
    if deja {
        return;
    }
    BOUCLE.with(|boucle| {
        if let Some(rappel) = boucle.borrow().as_ref() {
            if let Ok(id) = dom::fenetre().request_animation_frame(rappel.as_ref().unchecked_ref())
            {
                MOTEUR.with(|m| {
                    if let Some(m) = m.borrow().as_ref() {
                        m.borrow_mut().image = Some(id);
                    }
                });
            }
        }
    });
}

fn image(temps: f64) {
    let Some(moteur) = MOTEUR.with(|m| m.borrow().clone()) else {
        return;
    };
    let continuer = {
        let mut m = moteur.borrow_mut();
        m.image = None;
        let dt = if m.dernier_temps > 0.0 {
            ((temps - m.dernier_temps) / 1000.0).min(0.05)
        } else {
            1.0 / 60.0
        };
        m.dernier_temps = temps;
        // Rapprochement exponentiel, indépendant de la cadence d'affichage.
        let k = 1.0 - (-dt * 9.0_f64).exp();
        m.actuel += (m.cible - m.actuel) * k;
        if (m.cible - m.actuel).abs() < 0.4 {
            m.actuel = m.cible;
            m.anime = false;
        }
        m.par_nous = true;
        // Instantané, explicitement : avec `scroll-behavior: smooth`, chaque
        // pas lancerait sa propre animation, aussitôt interrompue par le
        // suivant — la page hoquetait au lieu de glisser.
        let options = web_sys::ScrollToOptions::new();
        options.set_top(m.actuel);
        options.set_behavior(web_sys::ScrollBehavior::Instant);
        dom::fenetre().scroll_to_with_scroll_to_options(&options);
        m.anime
    };
    if continuer {
        demarrer_boucle();
    } else {
        moteur.borrow_mut().dernier_temps = 0.0;
    }
}

/// Branche le défilement adouci, une fois pour toutes.
pub fn activer() {
    if MOTEUR.with(|m| m.borrow().is_some()) {
        return;
    }
    let y = dom::defilement();
    MOTEUR.with(|m| {
        *m.borrow_mut() = Some(Rc::new(RefCell::new(Moteur {
            actuel: y,
            cible: y,
            anime: false,
            image: None,
            dernier_temps: 0.0,
            par_nous: false,
        })))
    });
    BOUCLE.with(|b| *b.borrow_mut() = Some(Closure::new(image)));

    let molette = Closure::<dyn FnMut(web_sys::Event)>::new(|evenement: web_sys::Event| {
        let Some(molette) = evenement.dyn_ref::<web_sys::WheelEvent>() else {
            return;
        };
        // Zoom au trackpad, ou défilement horizontal : pas pour nous.
        if molette.ctrl_key() || molette.delta_x().abs() > molette.delta_y().abs() {
            return;
        }
        if defile_lui_meme(evenement.target()) {
            return;
        }
        let Some(moteur) = MOTEUR.with(|m| m.borrow().clone()) else {
            return;
        };
        evenement.prevent_default();
        let facteur = match molette.delta_mode() {
            1 => 40.0,
            2 => dom::hauteur_fenetre(),
            _ => 1.0,
        };
        {
            let mut m = moteur.borrow_mut();
            if !m.anime {
                m.actuel = dom::defilement();
                m.cible = m.actuel;
            }
            m.cible = (m.cible + molette.delta_y() * facteur).clamp(0.0, hauteur_max());
            m.anime = true;
        }
        demarrer_boucle();
    });

    // Un défilement qui ne vient pas de nous (clavier, barre, ancre) : le
    // moteur s'y recale au lieu de lutter contre.
    let defile = Closure::<dyn FnMut(web_sys::Event)>::new(|_evenement: web_sys::Event| {
        let Some(moteur) = MOTEUR.with(|m| m.borrow().clone()) else {
            return;
        };
        let mut m = moteur.borrow_mut();
        if m.par_nous {
            m.par_nous = false;
            return;
        }
        if !m.anime {
            let y = dom::defilement();
            m.actuel = y;
            m.cible = y;
        }
    });

    let fenetre = dom::fenetre();
    let actif = web_sys::AddEventListenerOptions::new();
    actif.set_passive(false);
    let _ = fenetre.add_event_listener_with_callback_and_add_event_listener_options(
        "wheel",
        molette.as_ref().unchecked_ref(),
        &actif,
    );
    let passif = web_sys::AddEventListenerOptions::new();
    passif.set_passive(true);
    let _ = fenetre.add_event_listener_with_callback_and_add_event_listener_options(
        "scroll",
        defile.as_ref().unchecked_ref(),
        &passif,
    );
    ECOUTEURS.with(|e| {
        let mut e = e.borrow_mut();
        e.push(("wheel", molette));
        e.push(("scroll", defile));
    });
    if let Some(racine) = dom::racine() {
        let _ = racine.class_list().add_1("defilement-doux");
    }
}

/// Débranche tout : animations apaisées, ou passage au doigt.
pub fn desactiver() {
    let fenetre = dom::fenetre();
    ECOUTEURS.with(|e| {
        for (nom, ecouteur) in e.borrow_mut().drain(..) {
            let _ =
                fenetre.remove_event_listener_with_callback(nom, ecouteur.as_ref().unchecked_ref());
        }
    });
    if let Some(moteur) = MOTEUR.with(|m| m.borrow_mut().take()) {
        if let Some(id) = moteur.borrow().image {
            let _ = fenetre.cancel_animation_frame(id);
        }
    }
    BOUCLE.with(|b| *b.borrow_mut() = None);
    if let Some(racine) = dom::racine() {
        let _ = racine.class_list().remove_1("defilement-doux");
    }
}

/// Va à une position : en glissant si le moteur tourne ou si on le demande,
/// d'un coup sinon (animations apaisées).
pub fn aller_a(y: f64, doux: bool) {
    let y = y.clamp(0.0, hauteur_max());
    if let Some(moteur) = MOTEUR.with(|m| m.borrow().clone()) {
        {
            let mut m = moteur.borrow_mut();
            if !m.anime {
                m.actuel = dom::defilement();
            }
            m.cible = y;
            m.anime = true;
        }
        demarrer_boucle();
        return;
    }
    let options = web_sys::ScrollToOptions::new();
    options.set_top(y);
    options.set_behavior(if doux {
        web_sys::ScrollBehavior::Smooth
    } else {
        web_sys::ScrollBehavior::Instant
    });
    dom::fenetre().scroll_to_with_scroll_to_options(&options);
}
