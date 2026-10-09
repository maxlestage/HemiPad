//! Les apparitions au défilement : chaque bloc marqué `data-reveler` prend la
//! classe `est-visible` quand il entre à l'écran, une seule fois. Les styles
//! décident du mouvement ; animations apaisées, tout est visible d'emblée.

use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;

use crate::dom;

pub struct Revelation {
    observateur: Option<web_sys::IntersectionObserver>,
    _rappel: Option<Closure<dyn FnMut(js_sys::Array, web_sys::IntersectionObserver)>>,
}

impl Revelation {
    pub fn observer() -> Self {
        let rappel = Closure::<dyn FnMut(js_sys::Array, web_sys::IntersectionObserver)>::new(
            |entrees: js_sys::Array, observateur: web_sys::IntersectionObserver| {
                for entree in entrees.iter() {
                    let Ok(entree) = entree.dyn_into::<web_sys::IntersectionObserverEntry>() else {
                        continue;
                    };
                    if entree.is_intersecting() {
                        let cible = entree.target();
                        let _ = cible.class_list().add_1("est-visible");
                        observateur.unobserve(&cible);
                    }
                }
            },
        );
        let options = web_sys::IntersectionObserverInit::new();
        options.set_threshold(&JsValue::from_f64(0.12));
        options.set_root_margin("0px 0px -6% 0px");
        let Ok(observateur) = web_sys::IntersectionObserver::new_with_options(
            rappel.as_ref().unchecked_ref(),
            &options,
        ) else {
            // Sans observateur, tout est montré : rien ne doit rester caché.
            tout_montrer();
            return Revelation {
                observateur: None,
                _rappel: None,
            };
        };
        if let Some(racine) = dom::racine() {
            let _ = racine.class_list().add_1("revelation-active");
        }
        let revelation = Revelation {
            observateur: Some(observateur),
            _rappel: Some(rappel),
        };
        revelation.rafraichir();
        revelation
    }

    /// Observe les blocs apparus depuis (changement de langue, panneau ouvert).
    pub fn rafraichir(&self) {
        let Some(observateur) = &self.observateur else {
            return;
        };
        if let Ok(liste) = dom::document().query_selector_all("[data-reveler]:not(.est-visible)") {
            for i in 0..liste.length() {
                if let Some(element) = liste
                    .item(i)
                    .and_then(|n| n.dyn_into::<web_sys::Element>().ok())
                {
                    observateur.observe(&element);
                }
            }
        }
    }
}

impl Drop for Revelation {
    fn drop(&mut self) {
        if let Some(observateur) = &self.observateur {
            observateur.disconnect();
        }
        if let Some(racine) = dom::racine() {
            let _ = racine.class_list().remove_1("revelation-active");
        }
    }
}

pub fn tout_montrer() {
    if let Some(racine) = dom::racine() {
        let _ = racine.class_list().remove_1("revelation-active");
    }
    if let Ok(liste) = dom::document().query_selector_all("[data-reveler]") {
        for i in 0..liste.length() {
            if let Some(element) = liste
                .item(i)
                .and_then(|n| n.dyn_into::<web_sys::Element>().ok())
            {
                let _ = element.class_list().add_1("est-visible");
            }
        }
    }
}
