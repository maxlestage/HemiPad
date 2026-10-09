//! Le mouvement du site : défilement adouci, curseur, apparitions, et le
//! film de grains de l'ouverture.

pub mod curseur;
pub mod defilement;
pub mod film;
pub mod formes;
pub mod inclinaison;
pub mod revelation;

use std::cell::RefCell;
use std::rc::Rc;

use wasm_bindgen::closure::Closure;

/// Une boucle d'images qui se relance elle-même : la fermeture se garde dans
/// une cellule partagée pour pouvoir se redemander à chaque image.
pub type Boucle<F> = Rc<RefCell<Option<Closure<F>>>>;

/// Un écouteur posé sur la fenêtre, gardé pour être retiré ensuite.
pub type Ecouteur<E> = (&'static str, Closure<dyn FnMut(E)>);
