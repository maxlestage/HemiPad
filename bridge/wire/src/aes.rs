//! AES-128, et les modes CTR et CBC, sans dépendance.
//!
//! La lecture à distance de la PlayStation en a besoin : l'association à la
//! console et la session chiffrent avec AES-128. Comme pour SHA-256 et HMAC,
//! l'écrire ici évite une dépendance extérieure des deux côtés du fil, et
//! garde le tout compilable pour l'iPhone sans rien de plus.
//!
//! Écrit d'après la norme (FIPS-197 pour le chiffre, NIST SP 800-38A pour les
//! modes), pas d'après une autre implémentation, et vérifié contre les vecteurs
//! d'essai publiés par le NIST.
//!
//! Ce fichier ne fait que la cryptographie. Le protocole de la console — ses
//! constantes, son déroulé — viendra au-dessus, à part, quand celui-ci sera
//! solide.

const BLOCK: usize = 16;
const ROUNDS: usize = 10;
const EXPANDED: usize = BLOCK * (ROUNDS + 1);

// Table de substitution (S-box), FIPS-197 figure 7.
const SBOX: [u8; 256] = [
    0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
    0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
    0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
    0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
    0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
    0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
    0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
    0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
    0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
    0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
    0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
    0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
    0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
    0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
    0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
    0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16,
];

// S-box inverse, pour le déchiffrement.
const INV_SBOX: [u8; 256] = {
    let mut table = [0u8; 256];
    let mut index = 0;
    while index < 256 {
        table[SBOX[index] as usize] = index as u8;
        index += 1;
    }
    table
};

// Constantes de tour (Rcon), assez pour AES-128.
const RCON: [u8; ROUNDS] = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];

/// Multiplication dans le corps GF(2^8), avec le polynôme d'AES (0x11b).
const fn xtime(value: u8) -> u8 {
    let shifted = value << 1;
    if value & 0x80 != 0 {
        shifted ^ 0x1b
    } else {
        shifted
    }
}

fn mul(mut a: u8, mut b: u8) -> u8 {
    let mut product = 0u8;
    while b != 0 {
        if b & 1 != 0 {
            product ^= a;
        }
        a = xtime(a);
        b >>= 1;
    }
    product
}

/// AES-128 : un jeu de clés étendu, prêt à chiffrer ou déchiffrer des blocs.
pub struct Aes128 {
    round_keys: [u8; EXPANDED],
}

impl Aes128 {
    pub fn new(key: &[u8; BLOCK]) -> Self {
        let mut round_keys = [0u8; EXPANDED];
        round_keys[..BLOCK].copy_from_slice(key);

        let mut i = BLOCK;
        let mut rcon = 0;
        while i < EXPANDED {
            let mut temp = [
                round_keys[i - 4],
                round_keys[i - 3],
                round_keys[i - 2],
                round_keys[i - 1],
            ];
            if i % BLOCK == 0 {
                // Rotation, substitution, puis constante de tour.
                temp.rotate_left(1);
                for byte in &mut temp {
                    *byte = SBOX[*byte as usize];
                }
                temp[0] ^= RCON[rcon];
                rcon += 1;
            }
            for j in 0..4 {
                round_keys[i + j] = round_keys[i + j - BLOCK] ^ temp[j];
            }
            i += 4;
        }
        Self { round_keys }
    }

    /// Chiffre un bloc de 16 octets, sur place.
    pub fn encrypt_block(&self, block: &mut [u8; BLOCK]) {
        self.add_round_key(block, 0);
        for round in 1..ROUNDS {
            Self::sub_bytes(block);
            Self::shift_rows(block);
            Self::mix_columns(block);
            self.add_round_key(block, round);
        }
        Self::sub_bytes(block);
        Self::shift_rows(block);
        self.add_round_key(block, ROUNDS);
    }

    /// Déchiffre un bloc de 16 octets, sur place.
    pub fn decrypt_block(&self, block: &mut [u8; BLOCK]) {
        self.add_round_key(block, ROUNDS);
        for round in (1..ROUNDS).rev() {
            Self::inv_shift_rows(block);
            Self::inv_sub_bytes(block);
            self.add_round_key(block, round);
            Self::inv_mix_columns(block);
        }
        Self::inv_shift_rows(block);
        Self::inv_sub_bytes(block);
        self.add_round_key(block, 0);
    }

    fn add_round_key(&self, block: &mut [u8; BLOCK], round: usize) {
        let key = &self.round_keys[round * BLOCK..round * BLOCK + BLOCK];
        for (byte, k) in block.iter_mut().zip(key.iter()) {
            *byte ^= k;
        }
    }

    fn sub_bytes(block: &mut [u8; BLOCK]) {
        for byte in block.iter_mut() {
            *byte = SBOX[*byte as usize];
        }
    }

    fn inv_sub_bytes(block: &mut [u8; BLOCK]) {
        for byte in block.iter_mut() {
            *byte = INV_SBOX[*byte as usize];
        }
    }

    // L'état est rangé par colonnes : l'octet (ligne r, colonne c) est à 4c+r.
    fn shift_rows(block: &mut [u8; BLOCK]) {
        let original = *block;
        for row in 1..4 {
            for col in 0..4 {
                block[4 * col + row] = original[4 * ((col + row) % 4) + row];
            }
        }
    }

    fn inv_shift_rows(block: &mut [u8; BLOCK]) {
        let original = *block;
        for row in 1..4 {
            for col in 0..4 {
                block[4 * col + row] = original[4 * ((col + 4 - row) % 4) + row];
            }
        }
    }

    fn mix_columns(block: &mut [u8; BLOCK]) {
        for col in 0..4 {
            let base = col * 4;
            let a = [
                block[base],
                block[base + 1],
                block[base + 2],
                block[base + 3],
            ];
            block[base] = xtime(a[0]) ^ (xtime(a[1]) ^ a[1]) ^ a[2] ^ a[3];
            block[base + 1] = a[0] ^ xtime(a[1]) ^ (xtime(a[2]) ^ a[2]) ^ a[3];
            block[base + 2] = a[0] ^ a[1] ^ xtime(a[2]) ^ (xtime(a[3]) ^ a[3]);
            block[base + 3] = (xtime(a[0]) ^ a[0]) ^ a[1] ^ a[2] ^ xtime(a[3]);
        }
    }

    fn inv_mix_columns(block: &mut [u8; BLOCK]) {
        for col in 0..4 {
            let base = col * 4;
            let a = [
                block[base],
                block[base + 1],
                block[base + 2],
                block[base + 3],
            ];
            block[base] = mul(a[0], 14) ^ mul(a[1], 11) ^ mul(a[2], 13) ^ mul(a[3], 9);
            block[base + 1] = mul(a[0], 9) ^ mul(a[1], 14) ^ mul(a[2], 11) ^ mul(a[3], 13);
            block[base + 2] = mul(a[0], 13) ^ mul(a[1], 9) ^ mul(a[2], 14) ^ mul(a[3], 11);
            block[base + 3] = mul(a[0], 11) ^ mul(a[1], 13) ^ mul(a[2], 9) ^ mul(a[3], 14);
        }
    }
}

/// Chiffre (ou déchiffre : l'opération est la même) en mode compteur.
///
/// Le compteur commence à `nonce` et s'incrémente d'un bloc au suivant, en
/// gros-boutiste, comme le décrit NIST SP 800-38A.
pub fn ctr_xor(key: &[u8; BLOCK], nonce: &[u8; BLOCK], data: &mut [u8]) {
    let cipher = Aes128::new(key);
    let mut counter = *nonce;
    for chunk in data.chunks_mut(BLOCK) {
        let mut keystream = counter;
        cipher.encrypt_block(&mut keystream);
        for (byte, k) in chunk.iter_mut().zip(keystream.iter()) {
            *byte ^= k;
        }
        increment_be(&mut counter);
    }
}

/// Incrémente un bloc vu comme un grand nombre gros-boutiste.
fn increment_be(counter: &mut [u8; BLOCK]) {
    for byte in counter.iter_mut().rev() {
        let (next, carry) = byte.overflowing_add(1);
        *byte = next;
        if !carry {
            break;
        }
    }
}

/// Chiffre en CBC. `data` doit être un multiple de 16 octets (le protocole
/// s'en assure avant d'appeler). Rend false sinon, sans rien écrire.
pub fn cbc_encrypt(key: &[u8; BLOCK], iv: &[u8; BLOCK], data: &mut [u8]) -> bool {
    if data.len() % BLOCK != 0 {
        return false;
    }
    let cipher = Aes128::new(key);
    let mut previous = *iv;
    for chunk in data.chunks_mut(BLOCK) {
        let mut block = [0u8; BLOCK];
        block.copy_from_slice(chunk);
        for (byte, p) in block.iter_mut().zip(previous.iter()) {
            *byte ^= p;
        }
        cipher.encrypt_block(&mut block);
        chunk.copy_from_slice(&block);
        previous = block;
    }
    true
}

/// Déchiffre en CBC. Mêmes conditions que `cbc_encrypt`.
pub fn cbc_decrypt(key: &[u8; BLOCK], iv: &[u8; BLOCK], data: &mut [u8]) -> bool {
    if data.len() % BLOCK != 0 {
        return false;
    }
    let cipher = Aes128::new(key);
    let mut previous = *iv;
    for chunk in data.chunks_mut(BLOCK) {
        let mut block = [0u8; BLOCK];
        block.copy_from_slice(chunk);
        let saved = block;
        cipher.decrypt_block(&mut block);
        for (byte, p) in block.iter_mut().zip(previous.iter()) {
            *byte ^= p;
        }
        chunk.copy_from_slice(&block);
        previous = saved;
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bytes(hex: &str) -> Vec<u8> {
        (0..hex.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).unwrap())
            .collect()
    }

    fn block(hex: &str) -> [u8; BLOCK] {
        bytes(hex).try_into().unwrap()
    }

    fn hex(data: &[u8]) -> String {
        data.iter().map(|b| format!("{b:02x}")).collect()
    }

    /// FIPS-197, annexe B : l'exemple pas-à-pas du chiffre.
    #[test]
    fn a_single_block_matches_fips_197() {
        let cipher = Aes128::new(&block("2b7e151628aed2a6abf7158809cf4f3c"));
        let mut data = block("3243f6a8885a308d313198a2e0370734");
        cipher.encrypt_block(&mut data);
        assert_eq!(hex(&data), "3925841d02dc09fbdc118597196a0b32");
        cipher.decrypt_block(&mut data);
        assert_eq!(hex(&data), "3243f6a8885a308d313198a2e0370734");
    }

    /// FIPS-197, annexe C.1 : le vecteur officiel d'AES-128.
    #[test]
    fn the_appendix_c_vector_holds_both_ways() {
        let cipher = Aes128::new(&block("000102030405060708090a0b0c0d0e0f"));
        let mut data = block("00112233445566778899aabbccddeeff");
        cipher.encrypt_block(&mut data);
        assert_eq!(hex(&data), "69c4e0d86a7b0430d8cdb78070b4c55a");
        cipher.decrypt_block(&mut data);
        assert_eq!(hex(&data), "00112233445566778899aabbccddeeff");
    }

    /// NIST SP 800-38A, F.5.1/F.5.2 : CTR-AES128, les quatre blocs.
    #[test]
    fn ctr_matches_nist_sp_800_38a() {
        let key = block("2b7e151628aed2a6abf7158809cf4f3c");
        let nonce = block("f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff");
        let mut data = bytes(concat!(
            "6bc1bee22e409f96e93d7e117393172a",
            "ae2d8a571e03ac9c9eb76fac45af8e51",
            "30c81c46a35ce411e5fbc1191a0a52ef",
            "f69f2445df4f9b17ad2b417be66c3710",
        ));
        ctr_xor(&key, &nonce, &mut data);
        assert_eq!(
            hex(&data),
            concat!(
                "874d6191b620e3261bef6864990db6ce",
                "9806f66b7970fdff8617187bb9fffdff",
                "5ae4df3edbd5d35e5b4f09020db03eab",
                "1e031dda2fbe03d1792170a0f3009cee",
            )
        );
        // Le même appel redéchiffre : CTR est sa propre inverse.
        ctr_xor(&key, &nonce, &mut data);
        assert_eq!(&hex(&data[..16]), "6bc1bee22e409f96e93d7e117393172a");
    }

    /// NIST SP 800-38A, F.2.1/F.2.2 : CBC-AES128.
    #[test]
    fn cbc_matches_nist_sp_800_38a() {
        let key = block("2b7e151628aed2a6abf7158809cf4f3c");
        let iv = block("000102030405060708090a0b0c0d0e0f");
        let plain = bytes(concat!(
            "6bc1bee22e409f96e93d7e117393172a",
            "ae2d8a571e03ac9c9eb76fac45af8e51",
            "30c81c46a35ce411e5fbc1191a0a52ef",
            "f69f2445df4f9b17ad2b417be66c3710",
        ));
        let mut data = plain.clone();
        assert!(cbc_encrypt(&key, &iv, &mut data));
        assert_eq!(
            hex(&data),
            concat!(
                "7649abac8119b246cee98e9b12e9197d",
                "5086cb9b507219ee95db113a917678b2",
                "73bed6b8e3c1743b7116e69e22229516",
                "3ff1caa1681fac09120eca307586e1a7",
            )
        );
        assert!(cbc_decrypt(&key, &iv, &mut data));
        assert_eq!(data, plain);
    }

    #[test]
    fn cbc_refuses_a_ragged_length() {
        let key = block("2b7e151628aed2a6abf7158809cf4f3c");
        let iv = block("00000000000000000000000000000000");
        let mut data = [0u8; 20];
        assert!(!cbc_encrypt(&key, &iv, &mut data));
        assert!(!cbc_decrypt(&key, &iv, &mut data));
    }

    #[test]
    fn ctr_handles_a_partial_final_block() {
        // CTR n'exige pas un multiple de 16 : le dernier bloc peut être court.
        let key = block("2b7e151628aed2a6abf7158809cf4f3c");
        let nonce = block("f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff");
        let mut data = bytes("6bc1bee22e409f96e93d7e1173");
        let original = data.clone();
        ctr_xor(&key, &nonce, &mut data);
        assert_ne!(data, original);
        ctr_xor(&key, &nonce, &mut data);
        assert_eq!(data, original);
    }

    #[test]
    fn the_counter_carries_across_bytes() {
        let mut counter = block("000000000000000000000000000000ff");
        increment_be(&mut counter);
        assert_eq!(hex(&counter), "00000000000000000000000000000100");

        let mut wrap = [0xffu8; BLOCK];
        increment_be(&mut wrap);
        assert_eq!(hex(&wrap), "00000000000000000000000000000000");
    }
}
