//! Une bande qui défile entre deux sections : les machines que HemiPad sait
//! servir. Décorative — la même liste est lisible plus bas, en clair.

use yew::prelude::*;

use crate::consoles::PROFILS;

#[component]
pub fn Bande() -> Html {
    let noms: Vec<&str> = PROFILS.iter().map(|p| p.nom).collect();
    let ligne = || {
        html! {
            <span class="bande-ligne">
                { for noms.iter().map(|nom| html! { <><span class="bande-nom">{ *nom }</span><span class="bande-sep">{ "✛" }</span></> }) }
            </span>
        }
    };
    html! {
        <div class="bande" aria-hidden="true">
            <div class="bande-piste">{ ligne() }{ ligne() }</div>
        </div>
    }
}
