//! L'inclinaison du téléphone, qui fait pencher la scène de grains.
//!
//! Partagée par une simple cellule : la scène la lit à chaque image, sans
//! repasser par l'interface. Sur iOS, l'accès aux capteurs demande une
//! permission, accordée seulement après un geste de la personne : d'où un
//! bouton, jamais une demande à l'ouverture de la page.

use std::cell::{Cell, RefCell};

use js_sys::{Function, Promise, Reflect};
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use wasm_bindgen_futures::JsFuture;

use crate::dom;

/// Au-delà de 25° d'écart avec la position de départ, la scène ne penche
/// plus davantage.
pub const AMPLITUDE_DEGRES: f64 = 25.0;
const ATTENTE_CAPTEUR_MS: u32 = 1500;

thread_local! {
    static INCLINAISON: Cell<(f64, f64)> = const { Cell::new((0.0, 0.0)) };
    static SUIVI: RefCell<Option<Suivi>> = const { RefCell::new(None) };
}

pub fn actuelle() -> (f64, f64) {
    INCLINAISON.with(Cell::get)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EtatOrientation {
    Arrete,
    Demande,
    Actif,
    Refuse,
    SansCapteur,
}

/// L'écart à la position de départ, ramené entre -1 et 1, dans le repère de
/// l'écran tel qu'il est tenu.
pub fn vers_inclinaison(beta: f64, gamma: f64, angle_ecran: f64, repere: (f64, f64)) -> (f64, f64) {
    let d_beta = beta - repere.0;
    let d_gamma = gamma - repere.1;
    let angle = (((angle_ecran / 90.0).round() as i64 * 90) % 360 + 360) % 360;
    let (x, y) = match angle {
        90 => (d_beta, d_gamma),
        180 => (-d_gamma, d_beta),
        270 => (-d_beta, -d_gamma),
        _ => (d_gamma, -d_beta),
    };
    (
        (x / AMPLITUDE_DEGRES).clamp(-1.0, 1.0),
        (y / AMPLITUDE_DEGRES).clamp(-1.0, 1.0),
    )
}

pub fn suivi_possible() -> bool {
    Reflect::has(
        &dom::fenetre(),
        &JsValue::from_str("DeviceOrientationEvent"),
    )
    .unwrap_or(false)
        && dom::media("(pointer: coarse)")
}

fn angle_ecran() -> f64 {
    dom::fenetre()
        .screen()
        .ok()
        .and_then(|ecran| Reflect::get(&ecran, &JsValue::from_str("orientation")).ok())
        .and_then(|orientation| Reflect::get(&orientation, &JsValue::from_str("angle")).ok())
        .and_then(|angle| angle.as_f64())
        .unwrap_or(0.0)
}

struct Suivi {
    lire: Closure<dyn FnMut(web_sys::DeviceOrientationEvent)>,
    _minuterie: gloo_timers::callback::Timeout,
}

/// Démarre le suivi. Rend l'état atteint ; `sans_capteur` est appelé si rien
/// ne répond dans le délai.
pub async fn demarrer(sans_capteur: impl FnOnce() + 'static) -> EtatOrientation {
    let fenetre = dom::fenetre();
    if let Ok(constructeur) = Reflect::get(&fenetre, &JsValue::from_str("DeviceOrientationEvent")) {
        if let Ok(demander) = Reflect::get(&constructeur, &JsValue::from_str("requestPermission")) {
            if let Some(demander) = demander.dyn_ref::<Function>() {
                let accord = match demander
                    .call0(&constructeur)
                    .map(|p| p.dyn_into::<Promise>())
                {
                    Ok(Ok(promesse)) => JsFuture::from(promesse)
                        .await
                        .ok()
                        .and_then(|r| r.as_string()),
                    _ => None,
                };
                if accord.as_deref() != Some("granted") {
                    return EtatOrientation::Refuse;
                }
            }
        }
    }

    arreter();
    let recu = std::rc::Rc::new(Cell::new(false));
    let repere: std::rc::Rc<Cell<Option<(f64, f64)>>> = std::rc::Rc::new(Cell::new(None));
    let lire = {
        let recu = recu.clone();
        Closure::<dyn FnMut(web_sys::DeviceOrientationEvent)>::new(
            move |evenement: web_sys::DeviceOrientationEvent| {
                let (Some(beta), Some(gamma)) = (evenement.beta(), evenement.gamma()) else {
                    return;
                };
                recu.set(true);
                let depart = repere.get().unwrap_or((beta, gamma));
                repere.set(Some(depart));
                INCLINAISON.with(|c| c.set(vers_inclinaison(beta, gamma, angle_ecran(), depart)));
            },
        )
    };
    let _ = fenetre
        .add_event_listener_with_callback("deviceorientation", lire.as_ref().unchecked_ref());
    let minuterie = gloo_timers::callback::Timeout::new(ATTENTE_CAPTEUR_MS, move || {
        if !recu.get() {
            arreter();
            sans_capteur();
        }
    });
    SUIVI.with(|s| {
        *s.borrow_mut() = Some(Suivi {
            lire,
            _minuterie: minuterie,
        })
    });
    if let Some(racine) = dom::racine() {
        let _ = racine.set_attribute("data-inclinaison", "orientation");
    }
    EtatOrientation::Actif
}

pub fn arreter() {
    if let Some(suivi) = SUIVI.with(|s| s.borrow_mut().take()) {
        let _ = dom::fenetre().remove_event_listener_with_callback(
            "deviceorientation",
            suivi.lire.as_ref().unchecked_ref(),
        );
    }
    INCLINAISON.with(|c| c.set((0.0, 0.0)));
    if let Some(racine) = dom::racine() {
        let _ = racine.remove_attribute("data-inclinaison");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn le_repere_de_depart_est_le_zero() {
        assert_eq!(vers_inclinaison(40.0, 10.0, 0.0, (40.0, 10.0)), (0.0, 0.0));
    }

    #[test]
    fn pencher_a_droite_donne_un_x_positif_en_portrait() {
        let (x, y) = vers_inclinaison(40.0, 22.5, 0.0, (40.0, 10.0));
        assert!((x - 0.5).abs() < 1e-9);
        assert_eq!(y, 0.0);
    }

    #[test]
    fn le_paysage_echange_les_axes_et_tout_reste_borne() {
        let (x, _) = vers_inclinaison(52.5, 10.0, 90.0, (40.0, 10.0));
        assert!((x - 0.5).abs() < 1e-9);
        let (x, y) = vers_inclinaison(140.0, -90.0, 0.0, (40.0, 10.0));
        assert_eq!((x, y), (-1.0, -1.0));
    }
}
