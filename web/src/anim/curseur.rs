//! Le curseur dessiné et les boutons aimantés.
//!
//! Un point suit la souris au plus près, un anneau le rejoint avec un léger
//! retard ; l'anneau grossit sur ce qui se clique. Les éléments marqués
//! `data-aimant` se laissent attirer de quelques pixels vers le pointeur.
//!
//! Le vrai curseur n'est jamais masqué : le dessin s'ajoute, il ne remplace
//! rien. Au doigt, ou animations apaisées, rien de tout cela ne tourne.

use std::cell::RefCell;
use std::rc::Rc;

use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{Element, HtmlElement};

use super::{Boucle, Ecouteur};
use crate::dom;

struct Etat {
    souris: (f64, f64),
    point: (f64, f64),
    anneau: (f64, f64),
    survol: bool,
    visible: bool,
    aimante: Option<HtmlElement>,
    image: Option<i32>,
}

pub struct Curseur {
    etat: Rc<RefCell<Etat>>,
    ecouteurs: Vec<(web_sys::EventTarget, Ecouteur<web_sys::Event>)>,
    boucle: Boucle<dyn FnMut()>,
}

const CLIQUABLE: &str = "a, button, [role=button], input, label, summary, [data-aimant]";

fn element(selecteur: &str) -> Option<HtmlElement> {
    dom::document()
        .query_selector(selecteur)
        .ok()
        .flatten()?
        .dyn_into()
        .ok()
}

fn relacher(aimante: &HtmlElement) {
    let _ = aimante.style().remove_property("--ax");
    let _ = aimante.style().remove_property("--ay");
    let _ = aimante.class_list().remove_1("est-aimante");
}

impl Curseur {
    pub fn demarrer() -> Option<Self> {
        let point = element(".curseur-point")?;
        let anneau = element(".curseur-anneau")?;
        let etat = Rc::new(RefCell::new(Etat {
            souris: (-100.0, -100.0),
            point: (-100.0, -100.0),
            anneau: (-100.0, -100.0),
            survol: false,
            visible: false,
            aimante: None,
            image: None,
        }));
        let boucle: Boucle<dyn FnMut()> = Rc::new(RefCell::new(None));

        // Une image : le point colle, l'anneau suit, puis on s'arrête dès
        // que tout est immobile — pas d'animation qui tourne pour rien.
        {
            let etat = etat.clone();
            let boucle_interne = boucle.clone();
            *boucle.borrow_mut() = Some(Closure::new(move || {
                let mut e = etat.borrow_mut();
                e.image = None;
                e.point = e.souris;
                let (sx, sy) = e.souris;
                e.anneau.0 += (sx - e.anneau.0) * 0.18;
                e.anneau.1 += (sy - e.anneau.1) * 0.18;
                let _ = point.style().set_property(
                    "transform",
                    &format!("translate3d({:.1}px,{:.1}px,0)", e.point.0, e.point.1),
                );
                let _ = anneau.style().set_property(
                    "transform",
                    &format!("translate3d({:.1}px,{:.1}px,0)", e.anneau.0, e.anneau.1),
                );
                let reste = (sx - e.anneau.0).abs() + (sy - e.anneau.1).abs() > 0.3;
                if reste {
                    if let Some(rappel) = boucle_interne.borrow().as_ref() {
                        e.image = dom::fenetre()
                            .request_animation_frame(rappel.as_ref().unchecked_ref())
                            .ok();
                    }
                }
            }));
        }

        let relancer = {
            let etat = etat.clone();
            let boucle = boucle.clone();
            move || {
                if etat.borrow().image.is_some() {
                    return;
                }
                if let Some(rappel) = boucle.borrow().as_ref() {
                    etat.borrow_mut().image = dom::fenetre()
                        .request_animation_frame(rappel.as_ref().unchecked_ref())
                        .ok();
                }
            }
        };

        let mut ecouteurs = Vec::new();
        let document: web_sys::EventTarget = dom::document().into();

        let deplacement = {
            let etat = etat.clone();
            let relancer = relancer.clone();
            Closure::<dyn FnMut(web_sys::Event)>::new(move |evenement: web_sys::Event| {
                let Some(souris) = evenement.dyn_ref::<web_sys::PointerEvent>() else {
                    return;
                };
                if souris.pointer_type() != "mouse" {
                    return;
                }
                let (x, y) = (souris.client_x() as f64, souris.client_y() as f64);
                let cible = evenement
                    .target()
                    .and_then(|c| c.dyn_into::<Element>().ok());
                let cliquable = cible
                    .as_ref()
                    .and_then(|c| c.closest(CLIQUABLE).ok().flatten());
                let aimant = cible
                    .as_ref()
                    .and_then(|c| c.closest("[data-aimant]").ok().flatten())
                    .and_then(|a| a.dyn_into::<HtmlElement>().ok());
                {
                    let mut e = etat.borrow_mut();
                    e.souris = (x, y);
                    if !e.visible {
                        e.visible = true;
                        e.anneau = (x, y);
                        if let Some(racine) = dom::racine() {
                            let _ = racine.class_list().add_1("curseur-visible");
                        }
                    }
                    let survol = cliquable.is_some();
                    if survol != e.survol {
                        e.survol = survol;
                        if let Some(racine) = dom::racine() {
                            let _ = racine
                                .class_list()
                                .toggle_with_force("curseur-survol", survol);
                        }
                    }
                    // L'aimant : l'élément se décale vers le pointeur, d'une
                    // fraction de l'écart, par une propriété à lui (`translate`)
                    // qui ne touche pas à ses autres transformations.
                    if e.aimante.as_ref() != aimant.as_ref() {
                        if let Some(ancien) = e.aimante.take() {
                            relacher(&ancien);
                        }
                        e.aimante = aimant.clone();
                    }
                    if let Some(a) = &aimant {
                        let r = a.get_bounding_client_rect();
                        let dx = x - (r.left() + r.width() / 2.0);
                        let dy = y - (r.top() + r.height() / 2.0);
                        let _ = a.class_list().add_1("est-aimante");
                        let _ = a
                            .style()
                            .set_property("--ax", &format!("{:.1}px", dx * 0.22));
                        let _ = a
                            .style()
                            .set_property("--ay", &format!("{:.1}px", dy * 0.3));
                    }
                }
                relancer();
            })
        };
        let _ = document
            .add_event_listener_with_callback("pointermove", deplacement.as_ref().unchecked_ref());
        ecouteurs.push((document.clone(), ("pointermove", deplacement)));

        let sortie = {
            let etat = etat.clone();
            Closure::<dyn FnMut(web_sys::Event)>::new(move |_| {
                let mut e = etat.borrow_mut();
                e.visible = false;
                if let Some(a) = e.aimante.take() {
                    relacher(&a);
                }
                if let Some(racine) = dom::racine() {
                    let _ = racine
                        .class_list()
                        .remove_2("curseur-visible", "curseur-survol");
                }
            })
        };
        let _ = document
            .add_event_listener_with_callback("mouseleave", sortie.as_ref().unchecked_ref());
        ecouteurs.push((document.clone(), ("mouseleave", sortie)));

        let appui = Closure::<dyn FnMut(web_sys::Event)>::new(move |_| {
            if let Some(racine) = dom::racine() {
                let _ = racine.class_list().add_1("curseur-appui");
            }
        });
        let _ = document
            .add_event_listener_with_callback("pointerdown", appui.as_ref().unchecked_ref());
        ecouteurs.push((document.clone(), ("pointerdown", appui)));
        let lacher = Closure::<dyn FnMut(web_sys::Event)>::new(move |_| {
            if let Some(racine) = dom::racine() {
                let _ = racine.class_list().remove_1("curseur-appui");
            }
        });
        let _ =
            document.add_event_listener_with_callback("pointerup", lacher.as_ref().unchecked_ref());
        ecouteurs.push((document, ("pointerup", lacher)));

        if let Some(racine) = dom::racine() {
            let _ = racine.class_list().add_1("curseur-actif");
        }
        Some(Curseur {
            etat,
            ecouteurs,
            boucle,
        })
    }
}

impl Drop for Curseur {
    fn drop(&mut self) {
        for (cible, (nom, ecouteur)) in &self.ecouteurs {
            let _ =
                cible.remove_event_listener_with_callback(nom, ecouteur.as_ref().unchecked_ref());
        }
        let mut e = self.etat.borrow_mut();
        if let Some(id) = e.image.take() {
            let _ = dom::fenetre().cancel_animation_frame(id);
        }
        if let Some(a) = e.aimante.take() {
            relacher(&a);
        }
        self.boucle.borrow_mut().take();
        if let Some(racine) = dom::racine() {
            let liste = racine.class_list();
            for classe in [
                "curseur-actif",
                "curseur-visible",
                "curseur-survol",
                "curseur-appui",
            ] {
                let _ = liste.remove_1(classe);
            }
        }
    }
}
