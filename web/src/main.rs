//! Le site vitrine de HemiPad, en Rust (Yew), compilé en WebAssembly.

mod anim;
mod apercu;
mod app;
mod composants;
mod consoles;
mod dom;
mod etat;
mod i18n;
mod solveur;

fn main() {
    let racine = dom::par_id("racine").expect("l'élément #racine");
    yew::Renderer::<app::App>::with_root(racine).render();
}
