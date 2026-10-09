//! Petits accès au navigateur, partagés par tout le site.
//!
//! Le site vit dans un navigateur : ces fonctions ne paniquent jamais quand
//! quelque chose manque (stockage bloqué, API absente). Elles rendent `None`
//! ou ne font rien, et la page continue.

use wasm_bindgen::JsCast;
use web_sys::{Document, Element, HtmlElement, Window};

pub fn fenetre() -> Window {
    web_sys::window().expect("une fenêtre")
}

pub fn document() -> Document {
    fenetre().document().expect("un document")
}

pub fn racine() -> Option<HtmlElement> {
    document().document_element()?.dyn_into().ok()
}

/// Lit une valeur dans le stockage local. Un stockage bloqué (navigation
/// privée, réglage du navigateur) rend `None`, sans erreur.
pub fn lire(cle: &str) -> Option<String> {
    fenetre()
        .local_storage()
        .ok()
        .flatten()?
        .get_item(cle)
        .ok()
        .flatten()
}

pub fn ecrire(cle: &str, valeur: &str) {
    if let Some(stockage) = fenetre().local_storage().ok().flatten() {
        let _ = stockage.set_item(cle, valeur);
    }
}

/// Une requête média, et sa valeur actuelle.
pub fn media(requete: &str) -> bool {
    fenetre()
        .match_media(requete)
        .ok()
        .flatten()
        .map(|liste| liste.matches())
        .unwrap_or(false)
}

pub fn maintenant() -> f64 {
    fenetre().performance().map(|p| p.now()).unwrap_or(0.0)
}

pub fn par_id(id: &str) -> Option<Element> {
    document().get_element_by_id(id)
}

pub fn largeur_fenetre() -> f64 {
    fenetre()
        .inner_width()
        .ok()
        .and_then(|v| v.as_f64())
        .unwrap_or(1024.0)
}

pub fn hauteur_fenetre() -> f64 {
    fenetre()
        .inner_height()
        .ok()
        .and_then(|v| v.as_f64())
        .unwrap_or(768.0)
}

pub fn defilement() -> f64 {
    fenetre().scroll_y().unwrap_or(0.0)
}

/// La position d'un élément dans la page, en pixels depuis le haut.
pub fn haut_absolu(element: &Element) -> f64 {
    element.get_bounding_client_rect().top() + defilement()
}

/// Un pointeur précis (souris, trackpad) : c'est là qu'ont un sens le curseur
/// dessiné et le défilement adouci. Au doigt, on garde le natif.
pub fn pointeur_fin() -> bool {
    media("(hover: hover) and (pointer: fine)")
}
