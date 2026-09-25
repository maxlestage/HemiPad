/*
 * Le même trajet que fera Swift, mais en C : sceller, ouvrir, vérifier.
 *
 * Ce programme ne teste pas la cryptographie — les tests Rust s'en chargent.
 * Il vérifie l'autre chose, celle qui casserait en silence : que l'en-tête
 * hemipad_wire.h décrit exactement la bibliothèque liée. Une signature qui
 * diverge ne se voit pas à la compilation de Rust, seulement ici.
 */

#include <stdio.h>
#include <string.h>

#include "hemipad_wire.h"

static int failures = 0;

static void check(int condition, const char *label) {
    if (condition) {
        printf("  ok   %s\n", label);
    } else {
        printf("  ECHEC %s\n", label);
        failures++;
    }
}

int main(void) {
    check(hemipad_wire_abi_version() == 1, "version de l'ABI");
    check(hemipad_wire_frame_len() == 44, "taille d'une trame");
    check(hemipad_wire_key_len() == 32, "taille du secret");
    check(hemipad_wire_payload_len(HEMIPAD_WIRE_REPORT_GAMEPAD) == 9, "manette : 9 octets");
    check(hemipad_wire_payload_len(HEMIPAD_WIRE_REPORT_KEYBOARD) == 8, "clavier : 8 octets");
    check(hemipad_wire_payload_len(42) == 0, "rapport inconnu : 0");

    uint8_t key[32];
    memset(key, 0xA5, sizeof key);
    const uint8_t manette[9] = {128, 128, 200, 60, 0, 255, 8, 0x01, 0x80};
    uint8_t frame[64];

    int32_t sealed = hemipad_wire_seal(key, sizeof key, HEMIPAD_WIRE_REPORT_GAMEPAD,
                                       manette, sizeof manette, 7,
                                       frame, hemipad_wire_frame_len());
    check(sealed == HEMIPAD_WIRE_OK, "sceller une trame");
    check(memcmp(frame, "HPB1", 4) == 0, "la trame porte sa marque");

    uint8_t report_id = 0;
    uint8_t payload[12];
    size_t payload_len = 0;
    uint64_t counter = 0;
    int32_t opened = hemipad_wire_open(key, sizeof key, frame, hemipad_wire_frame_len(), 6,
                                       &report_id, payload, sizeof payload,
                                       &payload_len, &counter);
    check(opened == HEMIPAD_WIRE_OK, "ouvrir la trame");
    check(report_id == HEMIPAD_WIRE_REPORT_GAMEPAD, "le rapport est reconnu");
    check(counter == 7, "le compteur revient intact");
    check(payload_len == sizeof manette, "la longueur revient intacte");
    check(memcmp(payload, manette, sizeof manette) == 0, "les octets reviennent intacts");

    /* Rejouée : refusée. */
    int32_t replayed = hemipad_wire_open(key, sizeof key, frame, hemipad_wire_frame_len(), 7,
                                         NULL, payload, sizeof payload, NULL, NULL);
    check(replayed == HEMIPAD_WIRE_REPLAY, "une trame rejouée est refusée");

    /* Modifiée : refusée. */
    frame[18] ^= 0xFF;
    int32_t forged = hemipad_wire_open(key, sizeof key, frame, hemipad_wire_frame_len(), 6,
                                       NULL, payload, sizeof payload, NULL, NULL);
    check(forged == HEMIPAD_WIRE_SIGNATURE, "une trame modifiée est refusée");

    /* Les deux chemins de sortie portent les mêmes octets de manette. */
    uint8_t emballe[16];
    int32_t par_usb = hemipad_wire_wrap_output(HEMIPAD_WIRE_OUTPUT_USB,
                                               HEMIPAD_WIRE_REPORT_GAMEPAD,
                                               manette, sizeof manette,
                                               emballe, sizeof emballe);
    check(par_usb == 10, "emballage USB : 10 octets");
    check(emballe[0] == HEMIPAD_WIRE_REPORT_GAMEPAD, "USB commence par l'identifiant");
    check(memcmp(emballe + 1, manette, sizeof manette) == 0, "USB porte le rapport");

    int32_t par_bluetooth = hemipad_wire_wrap_output(HEMIPAD_WIRE_OUTPUT_BLUETOOTH,
                                                     HEMIPAD_WIRE_REPORT_GAMEPAD,
                                                     manette, sizeof manette,
                                                     emballe, sizeof emballe);
    check(par_bluetooth == 11, "emballage Bluetooth : 11 octets");
    check(emballe[0] == 0xA1, "Bluetooth commence par l'en-tête HIDP");
    check(emballe[1] == HEMIPAD_WIRE_REPORT_GAMEPAD, "puis l'identifiant");
    check(memcmp(emballe + 2, manette, sizeof manette) == 0, "Bluetooth porte le meme rapport");

    check(hemipad_wire_max_output_len() == 11, "place a prevoir");
    check(hemipad_wire_wrap_output(9, HEMIPAD_WIRE_REPORT_GAMEPAD, manette, sizeof manette,
                                   emballe, sizeof emballe) == HEMIPAD_WIRE_UNKNOWN_OUTPUT,
          "un chemin inconnu est refuse");

    /* Pointeur nul : un code, pas un plantage. */
    int32_t empty = hemipad_wire_seal(NULL, 32, HEMIPAD_WIRE_REPORT_GAMEPAD,
                                      manette, sizeof manette, 1, frame, sizeof frame);
    check(empty == HEMIPAD_WIRE_NULL_POINTER, "un pointeur nul est refusé sans plantage");

    if (failures > 0) {
        printf("\n%d vérification(s) en échec\n", failures);
        return 1;
    }
    printf("\nABI C conforme à l'en-tête.\n");
    return 0;
}
