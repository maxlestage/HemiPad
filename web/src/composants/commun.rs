//! Briques partagées par les sections.

use yew::prelude::*;

/// Moitié gauche, pleine, croix directionnelle évidée.
pub const CORPS_GAUCHE: &str = "M32 20H20c-7 0-11 4-12.5 11L5.5 41c-1 5.5 2.5 9 6.5 9 3.5 0 6-2.5 8-5.5L22.5 41H32ZM17.2 27.8h3.6v3.8h3.8v3.6h-3.8v3.8h-3.6v-3.8h-3.8v-3.6h3.8Z";
/// Moitié droite, exactement le miroir de la gauche.
pub const CORPS_DROIT: &str =
    "M32 20h12c7 0 11 4 12.5 11L58.5 41c1 5.5-2.5 9-6.5 9-3.5 0-6-2.5-8-5.5L41.5 41H32Z";

#[derive(Properties, PartialEq)]
pub struct MarqueProps {
    #[prop_or_default]
    pub class: Classes,
    /// Variante d'en-tête, sous 32 px : le pointillé n'y serait qu'une
    /// bouillie grise ; trois points pleins gardent la même idée.
    #[prop_or_default]
    pub compacte: bool,
}

/// La marque HemiPad : « la moitié manquante ». Une manette dont une moitié
/// est pleine et l'autre en pointillés — ce que l'application remplace.
#[component]
pub fn Marque(props: &MarqueProps) -> Html {
    html! {
        <svg viewBox="0 0 64 64" class={props.class.clone()} fill="none" aria-hidden="true">
            <path d={CORPS_GAUCHE} fill="currentColor" fill-rule="evenodd" />
            if props.compacte {
                <circle cx="41" cy="24.5" r="3.6" fill="currentColor" opacity="0.45" />
                <circle cx="48" cy="30" r="4.2" fill="currentColor" opacity="0.75" />
                <circle cx="54" cy="38" r="4.8" fill="currentColor" />
            } else {
                <path d={CORPS_DROIT} fill="none" stroke="currentColor" stroke-width="2.6"
                    stroke-linejoin="round" stroke-dasharray="5.5 4.5" opacity="0.6" />
                <circle cx="44.5" cy="29.5" r="3.4" fill="currentColor" opacity="0.9" />
                <circle cx="50.5" cy="35.5" r="3.4" fill="currentColor" opacity="0.6" />
            }
        </svg>
    }
}

/// Un texte découpé en mots, pour qu'ils montent l'un après l'autre quand la
/// section arrive. Chaque mot reste un vrai mot du texte : un lecteur d'écran
/// lit la phrase normalement.
pub fn mots(texte: &str) -> Html {
    let morceaux = texte.split_whitespace().enumerate().map(|(i, mot)| {
        html! {
            <>
                if i > 0 { {" "} }
                <span class="mot"><span class="mot-dedans">{ mot.to_string() }</span></span>
            </>
        }
    });
    html! { <>{ for morceaux }</> }
}

#[derive(Properties, PartialEq)]
pub struct TeteProps {
    pub numero: &'static str,
    pub sur_titre: AttrValue,
    pub titre: AttrValue,
    pub id_titre: &'static str,
    pub chapeau: AttrValue,
}

/// L'en-tête d'une section : son numéro, son nom, son titre et sa phrase.
#[component]
pub fn TeteSection(props: &TeteProps) -> Html {
    html! {
        <header class="section-tete" data-reveler="">
            <p class="sur-titre">
                <span class="numero" aria-hidden="true">{ props.numero }</span>
                { props.sur_titre.clone() }
            </p>
            <h2 id={props.id_titre} class="titre-section">{ mots(&props.titre) }</h2>
            <p class="chapeau">{ props.chapeau.clone() }</p>
        </header>
    }
}

/// Un groupe de boutons à choix unique, comme un sélecteur segmenté d'iOS.
pub fn segmente<T: Copy + PartialEq + 'static>(
    choix: &[(T, String)],
    actuel: T,
    classe: &'static str,
    au_choix: Callback<T>,
) -> Html {
    html! {
        <div class={classes!("segmented", classe)}>
            { for choix.iter().map(|(valeur, etiquette)| {
                let valeur = *valeur;
                let actif = valeur == actuel;
                let au_choix = au_choix.clone();
                html! {
                    <button type="button" class={classes!(actif.then_some("is-active"))}
                        aria-pressed={actif.to_string()}
                        onclick={Callback::from(move |_| au_choix.emit(valeur))}>
                        { etiquette.clone() }
                    </button>
                }
            }) }
        </div>
    }
}

#[cfg(test)]
mod tests {
    use super::{CORPS_DROIT, CORPS_GAUCHE};

    /// La marque existe en trois exemplaires : ici, dans l'outil qui fabrique
    /// les icônes et l'image de partage, et dans la porte d'entrée de
    /// index.html. Des tracés qui divergent donneraient un logo différent
    /// selon l'endroit — le genre d'écart que personne ne remarque avant de
    /// voir les deux côte à côte.
    const OUTIL: &str = include_str!("../../tools/mark.mjs");
    const PAGE: &str = include_str!("../../index.html");

    /// Le tracé `const NOM = '…' + '…'` de l'outil, morceaux recollés.
    fn extraire(source: &str, nom: &str) -> String {
        let debut = source
            .find(&format!("const {nom} ="))
            .unwrap_or_else(|| panic!("tracé {nom} introuvable"));
        let reste = &source[debut..];
        let bloc = &reste[..reste.find("\n\n").unwrap_or(reste.len())];
        bloc.split('\'').skip(1).step_by(2).collect()
    }

    #[test]
    fn les_moities_sont_celles_de_l_outil() {
        assert_eq!(CORPS_GAUCHE, extraire(OUTIL, "LEFT_BODY"));
        assert_eq!(CORPS_DROIT, extraire(OUTIL, "RIGHT_BODY"));
    }

    #[test]
    fn la_porte_trace_la_meme_marque() {
        // La porte trace le corps et la croix séparément : chacun son trait.
        let (corps, croix) =
            CORPS_GAUCHE.split_at(CORPS_GAUCHE.find("ZM").expect("croix évidée") + 1);
        for trace in [corps, croix, CORPS_DROIT] {
            assert!(
                PAGE.contains(&format!("d=\"{trace}\"")),
                "la porte ne trace pas {trace}"
            );
        }
    }

    #[test]
    fn la_moitie_droite_est_le_miroir_de_la_gauche() {
        // Même point de départ, même largeur : une manette asymétrique ne
        // dirait plus « moitié manquante ».
        assert!(CORPS_GAUCHE.starts_with("M32 20") && CORPS_DROIT.starts_with("M32 20"));
        assert!(CORPS_GAUCHE.contains("5.5 41"));
        assert!(CORPS_DROIT.contains("58.5 41"), "64 − 5.5");
    }
}
