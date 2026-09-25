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

/** Identifiants de rapport, les mêmes que dans le descripteur HID. */
#define HEMIPAD_WIRE_REPORT_GAMEPAD 1
#define HEMIPAD_WIRE_REPORT_KEYBOARD 2

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

#ifdef __cplusplus
}
#endif

#endif /* HEMIPAD_WIRE_H */
