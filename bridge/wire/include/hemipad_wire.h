/*
 * ABI C de la bibliothèque de trames HemiPad, écrite en Rust.
 *
 * C'est par ce fichier que l'application iOS parle au code Rust : le pont
 * d'en-têtes de l'application l'inclut, et Swift appelle ces fonctions comme
 * n'importe quelle fonction C.
 *
 * Aucune de ces fonctions ne lève d'exception ni n'alloue de mémoire : elles
 * écrivent dans les tampons fournis et rendent un code. Tout code négatif est
 * un refus, décrit par les constantes HEMIPAD_WIRE_*.
 */

#ifndef HEMIPAD_WIRE_H
#define HEMIPAD_WIRE_H

#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/** Tout s'est bien passé. */
#define HEMIPAD_WIRE_OK 0
/** Un pointeur attendu était nul. */
#define HEMIPAD_WIRE_NULL_POINTER (-1)
/** Le secret partagé n'a pas la bonne taille. */
#define HEMIPAD_WIRE_KEY_LENGTH (-2)
/** La charge utile n'a pas la longueur attendue pour ce rapport. */
#define HEMIPAD_WIRE_PAYLOAD_LENGTH (-3)
/** Le tampon de sortie est trop petit. */
#define HEMIPAD_WIRE_OUTPUT_TOO_SMALL (-4)
/** La trame n'a pas la bonne taille. */
#define HEMIPAD_WIRE_FRAME_LENGTH (-5)
/** Ce n'est pas une trame HemiPad, ou pas cette version du format. */
#define HEMIPAD_WIRE_MAGIC (-6)
/** Identifiant de rapport inconnu. */
#define HEMIPAD_WIRE_UNKNOWN_REPORT (-7)
/** Signature fausse : la trame ne vient pas de l'appareil appairé. */
#define HEMIPAD_WIRE_SIGNATURE (-8)
/** Compteur déjà vu : trame rejouée. */
#define HEMIPAD_WIRE_REPLAY (-9)
/** Chemin de sortie inconnu. */
#define HEMIPAD_WIRE_UNKNOWN_OUTPUT (-10)

/** Identifiants de rapport, les mêmes que dans le descripteur HID. */
#define HEMIPAD_WIRE_REPORT_GAMEPAD 1
#define HEMIPAD_WIRE_REPORT_KEYBOARD 2

/** Par où sort un rapport, une fois arrivé au boîtier. */
#define HEMIPAD_WIRE_OUTPUT_USB 0
#define HEMIPAD_WIRE_OUTPUT_BLUETOOTH 1

/**
 * Version de l'ABI de la bibliothèque liée. L'application la compare à celle
 * qu'elle attend : mieux vaut refuser de démarrer le pont que de décaler les
 * octets en pleine partie.
 */
int32_t hemipad_wire_abi_version(void);

/** Taille d'une trame, en octets. */
size_t hemipad_wire_frame_len(void);

/** Taille du secret partagé, en octets. */
size_t hemipad_wire_key_len(void);

/** Longueur utile attendue pour un rapport, ou 0 si l'identifiant est inconnu. */
size_t hemipad_wire_payload_len(uint8_t report_id);

/**
 * Scelle un rapport dans une trame prête à envoyer.
 *
 * @param counter doit augmenter à chaque trame : c'est ce qui interdit de
 *                rejouer une trame capturée sur le réseau.
 * @param out     reçoit hemipad_wire_frame_len() octets.
 * @return HEMIPAD_WIRE_OK, ou un code négatif.
 */
int32_t hemipad_wire_seal(const uint8_t *key,
                          size_t key_len,
                          uint8_t report_id,
                          const uint8_t *payload,
                          size_t payload_len,
                          uint64_t counter,
                          uint8_t *out,
                          size_t out_len);

/**
 * Ouvre une trame reçue, après en avoir vérifié la signature et le compteur.
 *
 * Les pointeurs de sortie out_report_id, out_payload_len et out_counter
 * peuvent être nuls si l'appelant ne s'y intéresse pas.
 *
 * @param last_counter dernier compteur accepté ; une trame qui ne le dépasse
 *                     pas est refusée.
 * @return HEMIPAD_WIRE_OK, ou un code négatif.
 */
int32_t hemipad_wire_open(const uint8_t *key,
                          size_t key_len,
                          const uint8_t *frame,
                          size_t frame_len,
                          uint64_t last_counter,
                          uint8_t *out_report_id,
                          uint8_t *out_payload,
                          size_t out_payload_capacity,
                          size_t *out_payload_len,
                          uint64_t *out_counter);

/** Place à prévoir pour un rapport emballé, quel que soit le chemin. */
size_t hemipad_wire_max_output_len(void);

/**
 * Emballe un rapport pour le chemin par lequel il sortira.
 *
 * Les deux chemins portent les mêmes octets de manette ; le Bluetooth demande
 * un octet d'en-tête de plus, que la console attend.
 *
 * @return le nombre d'octets écrits dans out, ou un code négatif.
 */
int32_t hemipad_wire_wrap_output(uint8_t output,
                                 uint8_t report_id,
                                 const uint8_t *payload,
                                 size_t payload_len,
                                 uint8_t *out,
                                 size_t out_len);

/* ------------------------------------------------------- choix du chemin */

/** Par où partent les commandes. */
#define HEMIPAD_WIRE_PATH_NONE 0
/** L'appareil s'annonce lui-même comme manette Bluetooth. */
#define HEMIPAD_WIRE_PATH_DIRECT 1
/** Par le boîtier, joint en Wi-Fi. */
#define HEMIPAD_WIRE_PATH_BRIDGE 2

/**
 * Place à réserver pour l'état du choix.
 *
 * La structure reste opaque : l'appelant lui réserve de la place, la
 * bibliothèque seule sait ce qu'il y a dedans. Un champ ajouté plus tard ne
 * casse donc rien, tant que la taille tient — ce que hemipad_wire_chooser_size()
 * permet de vérifier au démarrage.
 */
#define HEMIPAD_WIRE_CHOOSER_CAPACITY 64

typedef struct {
    /* Des entiers de 64 bits plutôt que des octets : l'alignement vient tout
       seul, sans _Alignas, et Swift importe la structure sans hésiter. */
    uint64_t opaque[HEMIPAD_WIRE_CHOOSER_CAPACITY / 8];
} HemipadChooser;

/** Taille réellement occupée. Doit tenir dans HEMIPAD_WIRE_CHOOSER_CAPACITY. */
size_t hemipad_wire_chooser_size(void);

/** Prépare un choix de chemin neuf. */
void hemipad_wire_chooser_init(HemipadChooser *chooser);

/**
 * Règle les deux délais, en millisecondes : combien de temps le chemin direct
 * doit tenir avant de reprendre la main, et le silence du boîtier toléré.
 *
 * Remet aussi l'état à neuf.
 */
void hemipad_wire_chooser_set_timings(HemipadChooser *chooser,
                                      uint64_t settle_ms,
                                      uint64_t bridge_timeout_ms);

/** Une machine s'est abonnée, ou détachée, en Bluetooth direct. */
void hemipad_wire_chooser_set_direct(HemipadChooser *chooser,
                                     bool connected,
                                     uint64_t now_ms);

/** Le boîtier vient de répondre. */
void hemipad_wire_chooser_bridge_seen(HemipadChooser *chooser, uint64_t now_ms);

/**
 * Le chemin à prendre maintenant : HEMIPAD_WIRE_PATH_*.
 *
 * La décision ne dépend que de l'état et de l'heure, jamais de l'ordre des
 * appels : on peut l'appeler à chaque envoi sans rien fausser.
 */
uint8_t hemipad_wire_chooser_path(HemipadChooser *chooser, uint64_t now_ms);

#ifdef __cplusplus
}
#endif

#endif /* HEMIPAD_WIRE_H */
