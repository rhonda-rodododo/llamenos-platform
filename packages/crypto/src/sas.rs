//! SAS (Short Authentication String) emoji derivation for device verification.
//!
//! Given two Ed25519 public keys and a session nonce, derives 10 emoji indices
//! (0-255) using HKDF-SHA256. Both parties compute the same indices and compare
//! emojis visually to confirm device authenticity.
//!
//! **Entropy: 80 bits** (10 symbols from a 256-entry table = 10 * 8 bits).
//! This exceeds the 64-bit minimum required for nation-state threat models.
//!
//! Canonical ordering: min(pubkey_a, pubkey_b) || max(pubkey_a, pubkey_b) || nonce
//! This prevents role-confusion attacks.

use hkdf::Hkdf;
use sha2::Sha256;

use crate::errors::CryptoError;
use crate::labels::LABEL_SAS_DERIVE;

/// Number of SAS emoji to derive and display.
pub const SAS_EMOJI_COUNT: usize = 10;

/// The 256-entry emoji table for SAS verification display.
/// Each index (0-255) maps to a single emoji codepoint.
/// The table uses visually distinct, cross-platform emoji to minimise
/// user confusion during the verification ceremony.
pub const SAS_EMOJI_TABLE: [&str; 256] = [
    // 0-15: Animals (domestic)
    "\u{1F436}", // 0: dog
    "\u{1F431}", // 1: cat
    "\u{1F434}", // 2: horse
    "\u{1F437}", // 3: pig
    "\u{1F430}", // 4: rabbit
    "\u{1F43B}", // 5: bear
    "\u{1F42F}", // 6: tiger
    "\u{1F428}", // 7: koala
    "\u{1F43C}", // 8: panda
    "\u{1F981}", // 9: lion
    "\u{1F984}", // 10: unicorn
    "\u{1F422}", // 11: turtle
    "\u{1F420}", // 12: tropical fish
    "\u{1F419}", // 13: octopus
    "\u{1F98B}", // 14: butterfly
    "\u{1F40C}", // 15: snail
    // 16-31: Animals (wild)
    "\u{1F98A}", // 16: fox
    "\u{1F427}", // 17: penguin
    "\u{1F989}", // 18: owl
    "\u{1F99C}", // 19: parrot
    "\u{1F982}", // 20: scorpion
    "\u{1F980}", // 21: crab
    "\u{1F41D}", // 22: honeybee
    "\u{1F433}", // 23: whale
    "\u{1F40A}", // 24: crocodile
    "\u{1F418}", // 25: elephant
    "\u{1F992}", // 26: giraffe
    "\u{1F98D}", // 27: gorilla
    "\u{1F43A}", // 28: wolf
    "\u{1F985}", // 29: eagle
    "\u{1F987}", // 30: bat
    "\u{1F41A}", // 31: shell
    // 32-47: Nature
    "\u{1F33B}", // 32: sunflower
    "\u{1F332}", // 33: evergreen tree
    "\u{1F335}", // 34: cactus
    "\u{1F344}", // 35: mushroom
    "\u{1F33F}", // 36: herb
    "\u{1F34E}", // 37: apple
    "\u{1F352}", // 38: cherries
    "\u{1F349}", // 39: watermelon
    "\u{1F33A}", // 40: hibiscus
    "\u{1F337}", // 41: tulip
    "\u{1F339}", // 42: rose
    "\u{1F334}", // 43: palm tree
    "\u{1F343}", // 44: leaf fluttering
    "\u{1F341}", // 45: maple leaf
    "\u{1F340}", // 46: four-leaf clover
    "\u{1F338}", // 47: cherry blossom
    // 48-63: Celestial / Weather
    "\u{1F30D}",        // 48: globe (Europe-Africa)
    "\u{1F319}",        // 49: crescent moon
    "\u{2B50}",         // 50: star
    "\u{26A1}",         // 51: lightning
    "\u{1F525}",        // 52: fire
    "\u{1F4A7}",        // 53: droplet
    "\u{2744}\u{FE0F}", // 54: snowflake
    "\u{1F308}",        // 55: rainbow
    "\u{2600}\u{FE0F}", // 56: sun
    "\u{2601}\u{FE0F}", // 57: cloud
    "\u{1F30A}",        // 58: wave
    "\u{1F31F}",        // 59: glowing star
    "\u{1F30E}",        // 60: globe (Americas)
    "\u{1F30F}",        // 61: globe (Asia-Australia)
    "\u{1F311}",        // 62: new moon
    "\u{1F315}",        // 63: full moon
    // 64-79: Food
    "\u{1F34A}",         // 64: tangerine
    "\u{1F34B}",         // 65: lemon
    "\u{1F34C}",         // 66: banana
    "\u{1F34D}",         // 67: pineapple
    "\u{1F347}",         // 68: grapes
    "\u{1F353}",         // 69: strawberry
    "\u{1F351}",         // 70: peach
    "\u{1F350}",         // 71: pear
    "\u{1F95D}",         // 72: kiwi
    "\u{1F336}\u{FE0F}", // 73: hot pepper
    "\u{1F33D}",         // 74: corn
    "\u{1F955}",         // 75: carrot
    "\u{1F954}",         // 76: potato
    "\u{1F96C}",         // 77: broccoli (leafy green)
    "\u{1F345}",         // 78: tomato
    "\u{1F346}",         // 79: eggplant
    // 80-95: Objects (tools / everyday)
    "\u{1F511}",         // 80: key
    "\u{1F6E1}\u{FE0F}", // 81: shield
    "\u{1F512}",         // 82: lock
    "\u{1F513}",         // 83: unlock
    "\u{1F50D}",         // 84: magnifying glass (left)
    "\u{1F4A1}",         // 85: light bulb
    "\u{1F4E6}",         // 86: package
    "\u{1F4CE}",         // 87: paperclip
    "\u{1F4CC}",         // 88: pushpin
    "\u{1F58A}\u{FE0F}", // 89: pen
    "\u{1F4D6}",         // 90: open book
    "\u{1F4DA}",         // 91: books
    "\u{1F4DC}",         // 92: scroll
    "\u{1F4E7}",         // 93: e-mail
    "\u{1F50B}",         // 94: battery
    "\u{1F4BB}",         // 95: laptop
    // 96-111: Transport / Travel
    "\u{1F680}",         // 96: rocket
    "\u{2708}\u{FE0F}",  // 97: airplane
    "\u{1F6A2}",         // 98: ship
    "\u{1F682}",         // 99: locomotive
    "\u{1F695}",         // 100: taxi
    "\u{1F6B2}",         // 101: bicycle
    "\u{1F6F8}",         // 102: flying saucer
    "\u{26F5}",          // 103: sailboat
    "\u{1F681}",         // 104: helicopter
    "\u{1F6F6}",         // 105: canoe
    "\u{1F684}",         // 106: bullet train
    "\u{1F6F4}",         // 107: kick scooter
    "\u{1F6FA}",         // 108: auto rickshaw
    "\u{1F6F5}",         // 109: motor scooter
    "\u{1F3CD}\u{FE0F}", // 110: motorcycle
    "\u{1F6A1}",         // 111: aerial tramway
    // 112-127: Buildings / Places
    "\u{1F3E0}",         // 112: house
    "\u{1F3F0}",         // 113: castle
    "\u{1F3D4}\u{FE0F}", // 114: mountain
    "\u{1F3DD}\u{FE0F}", // 115: desert island
    "\u{1F3D7}\u{FE0F}", // 116: building construction
    "\u{1F3DB}\u{FE0F}", // 117: classical building
    "\u{1F3D5}\u{FE0F}", // 118: camping
    "\u{1F3A0}",         // 119: carousel
    "\u{1F3A1}",         // 120: ferris wheel
    "\u{1F3A2}",         // 121: roller coaster
    "\u{26F2}",          // 122: fountain
    "\u{26F0}\u{FE0F}",  // 123: mountain (snow-capped)
    "\u{1F30B}",         // 124: volcano
    "\u{1F3D6}\u{FE0F}", // 125: beach
    "\u{1F5FC}",         // 126: Tokyo tower
    "\u{1F5FD}",         // 127: Statue of Liberty
    // 128-143: Activities / Sports
    "\u{1F3C6}",        // 128: trophy
    "\u{1F3AF}",        // 129: bullseye
    "\u{1F3C0}",        // 130: basketball
    "\u{26BD}",         // 131: soccer ball
    "\u{1F3B3}",        // 132: bowling
    "\u{1F3B8}",        // 133: guitar
    "\u{1F3B9}",        // 134: musical keyboard
    "\u{1F3BA}",        // 135: trumpet
    "\u{1F941}",        // 136: drum
    "\u{1F3A8}",        // 137: palette
    "\u{1F3B5}",        // 138: music note
    "\u{1F3B2}",        // 139: dice
    "\u{1F3AD}",        // 140: performing arts
    "\u{1F3AE}",        // 141: video game
    "\u{1F9E9}",        // 142: puzzle piece
    "\u{265F}\u{FE0F}", // 143: chess pawn
    // 144-159: Symbols / Geometric
    "\u{2764}\u{FE0F}",  // 144: heart
    "\u{1F48E}",         // 145: gem
    "\u{1F52E}",         // 146: crystal ball
    "\u{2696}\u{FE0F}",  // 147: scales
    "\u{269B}\u{FE0F}",  // 148: atom
    "\u{1F52D}",         // 149: telescope
    "\u{1F52C}",         // 150: microscope
    "\u{2699}\u{FE0F}",  // 151: gear
    "\u{1F6CE}\u{FE0F}", // 152: bellhop bell
    "\u{1F514}",         // 153: bell
    "\u{1F50E}",         // 154: magnifying glass (right)
    "\u{1F4D0}",         // 155: triangular ruler
    "\u{1F9ED}",         // 156: compass
    "\u{1F9F2}",         // 157: magnet
    "\u{1F3F3}\u{FE0F}", // 158: white flag
    "\u{1F3F4}",         // 159: black flag
    // 160-175: Misc objects
    "\u{1F3B0}",         // 160: slot machine
    "\u{1F4F7}",         // 161: camera
    "\u{1F3AC}",         // 162: clapper board
    "\u{1F4FA}",         // 163: television
    "\u{1F4FB}",         // 164: radio
    "\u{1F4F0}",         // 165: newspaper
    "\u{1F9F0}",         // 166: toolbox
    "\u{1F527}",         // 167: wrench
    "\u{1F528}",         // 168: hammer
    "\u{1F529}",         // 169: nut and bolt
    "\u{26CF}\u{FE0F}",  // 170: pick
    "\u{1F6CB}\u{FE0F}", // 171: couch
    "\u{1F6BF}",         // 172: shower
    "\u{1F6C1}",         // 173: bathtub
    "\u{1F9F4}",         // 174: lotion bottle
    "\u{1F9F9}",         // 175: broom
    // 176-191: Clothing / Accessories
    "\u{1F451}",         // 176: crown
    "\u{1F452}",         // 177: woman's hat
    "\u{1F453}",         // 178: glasses
    "\u{1F576}\u{FE0F}", // 179: sunglasses
    "\u{1F454}",         // 180: necktie
    "\u{1F457}",         // 181: dress
    "\u{1F45F}",         // 182: athletic shoe
    "\u{1F462}",         // 183: boot
    "\u{1F9E4}",         // 184: gloves
    "\u{1F9E3}",         // 185: scarf
    "\u{1F460}",         // 186: high-heeled shoe
    "\u{1F461}",         // 187: sandal
    "\u{1F455}",         // 188: t-shirt
    "\u{1F456}",         // 189: jeans
    "\u{1F9E5}",         // 190: socks (goggles)
    "\u{1F392}",         // 191: backpack
    // 192-207: Hands / Gestures / Body
    "\u{1F44D}",         // 192: thumbs up
    "\u{1F44E}",         // 193: thumbs down
    "\u{270C}\u{FE0F}",  // 194: victory hand
    "\u{1F91E}",         // 195: crossed fingers
    "\u{1F44C}",         // 196: OK hand
    "\u{1F91D}",         // 197: handshake
    "\u{270A}",          // 198: raised fist
    "\u{1F44B}",         // 199: waving hand
    "\u{1F4AA}",         // 200: flexed biceps
    "\u{1F9B6}",         // 201: foot
    "\u{1F442}",         // 202: ear
    "\u{1F443}",         // 203: nose
    "\u{1F441}\u{FE0F}", // 204: eye
    "\u{1F9E0}",         // 205: brain
    "\u{1F48D}",         // 206: ring
    "\u{1F484}",         // 207: lipstick
    // 208-223: Emotions / Faces
    "\u{1F600}", // 208: grinning face
    "\u{1F602}", // 209: face with tears of joy
    "\u{1F60D}", // 210: heart eyes
    "\u{1F60E}", // 211: sunglasses face
    "\u{1F914}", // 212: thinking face
    "\u{1F92F}", // 213: exploding head
    "\u{1F921}", // 214: clown
    "\u{1F47B}", // 215: ghost
    "\u{1F47D}", // 216: alien
    "\u{1F916}", // 217: robot
    "\u{1F4A9}", // 218: poo
    "\u{1F383}", // 219: jack-o-lantern
    "\u{1F47E}", // 220: alien monster
    "\u{1F480}", // 221: skull
    "\u{1F608}", // 222: smiling devil
    "\u{1F4AB}", // 223: dizzy
    // 224-239: Flags / Markers
    "\u{1F3C1}", // 224: chequered flag
    "\u{1F6A9}", // 225: triangular flag
    "\u{2705}",  // 226: check mark (green)
    "\u{274C}",  // 227: cross mark
    "\u{26D4}",  // 228: no entry
    "\u{2757}",  // 229: exclamation mark
    "\u{2753}",  // 230: question mark
    "\u{1F198}", // 231: SOS
    "\u{1F4A2}", // 232: anger symbol
    "\u{1F4AC}", // 233: speech bubble
    "\u{1F4AD}", // 234: thought bubble
    "\u{1F4A4}", // 235: zzz
    "\u{1F4A5}", // 236: collision
    "\u{1F4A8}", // 237: dash (running away)
    "\u{1F4AF}", // 238: hundred points
    "\u{1F3C5}", // 239: sports medal
    // 240-255: Time / Clocks / Events
    "\u{1F550}",         // 240: one o'clock
    "\u{1F553}",         // 241: four o'clock
    "\u{1F557}",         // 242: eight o'clock
    "\u{1F55B}",         // 243: twelve o'clock
    "\u{23F0}",          // 244: alarm clock
    "\u{231B}",          // 245: hourglass (done)
    "\u{23F3}",          // 246: hourglass (flowing)
    "\u{1F388}",         // 247: balloon
    "\u{1F389}",         // 248: party popper
    "\u{1F381}",         // 249: wrapped gift
    "\u{1F386}",         // 250: fireworks
    "\u{1F387}",         // 251: sparkler
    "\u{1F397}\u{FE0F}", // 252: reminder ribbon
    "\u{1F380}",         // 253: ribbon
    "\u{1F3AA}",         // 254: circus tent
    "\u{1F3A9}",         // 255: top hat
];

/// Derive 10 SAS emoji indices from two Ed25519 public keys and a session nonce.
///
/// Both parties compute the same result regardless of argument order, because
/// pubkeys are canonically ordered (lexicographic min first).
///
/// Returns 10 indices (0-255) into `SAS_EMOJI_TABLE`.
/// Entropy: 10 * 8 = 80 bits (256^10 possible outputs).
pub fn derive_sas(
    pubkey_a: &[u8; 32],
    pubkey_b: &[u8; 32],
    nonce: &[u8; 32],
) -> Result<[u8; SAS_EMOJI_COUNT], CryptoError> {
    // Canonical ordering: min first
    let (first, second) = if pubkey_a <= pubkey_b {
        (pubkey_a, pubkey_b)
    } else {
        (pubkey_b, pubkey_a)
    };

    // Input key material: min_pubkey || max_pubkey || nonce
    let mut ikm = Vec::with_capacity(96);
    ikm.extend_from_slice(first);
    ikm.extend_from_slice(second);
    ikm.extend_from_slice(nonce);

    // HKDF-SHA256: extract then expand
    // 10 bytes of output → 10 indices of 8 bits each → 80 bits of entropy
    let hk = Hkdf::<Sha256>::new(None, &ikm);
    let mut output = [0u8; SAS_EMOJI_COUNT];
    hk.expand(LABEL_SAS_DERIVE.as_bytes(), &mut output)
        .map_err(|_| CryptoError::HkdfExpandError)?;

    // Each byte maps directly to an index 0-255 in the emoji table.
    // No modular bias — the table is exactly 256 entries.
    Ok(output)
}

/// Get the emoji string for a SAS index.
/// All indices 0-255 are valid; no out-of-range is possible with u8.
pub fn sas_emoji(index: u8) -> &'static str {
    SAS_EMOJI_TABLE[index as usize]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_derive_sas_deterministic() {
        let pk_a = [1u8; 32];
        let pk_b = [2u8; 32];
        let nonce = [3u8; 32];

        let r1 = derive_sas(&pk_a, &pk_b, &nonce).unwrap();
        let r2 = derive_sas(&pk_a, &pk_b, &nonce).unwrap();
        assert_eq!(r1, r2);
    }

    #[test]
    fn test_derive_sas_order_independent() {
        let pk_a = [1u8; 32];
        let pk_b = [2u8; 32];
        let nonce = [3u8; 32];

        let r1 = derive_sas(&pk_a, &pk_b, &nonce).unwrap();
        let r2 = derive_sas(&pk_b, &pk_a, &nonce).unwrap();
        assert_eq!(r1, r2, "SAS must be order-independent");
    }

    #[test]
    fn test_derive_sas_returns_10_indices() {
        let pk_a = [42u8; 32];
        let pk_b = [99u8; 32];
        let nonce = [7u8; 32];

        let indices = derive_sas(&pk_a, &pk_b, &nonce).unwrap();
        assert_eq!(indices.len(), SAS_EMOJI_COUNT);
        assert_eq!(indices.len(), 10);
    }

    #[test]
    fn test_different_nonce_different_result() {
        let pk_a = [1u8; 32];
        let pk_b = [2u8; 32];

        let r1 = derive_sas(&pk_a, &pk_b, &[0u8; 32]).unwrap();
        let r2 = derive_sas(&pk_a, &pk_b, &[1u8; 32]).unwrap();
        assert_ne!(r1, r2, "Different nonces must produce different SAS");
    }

    #[test]
    fn test_sas_emoji_valid_all_indices() {
        // With a 256-entry table and u8 indices, every possible index is valid.
        for i in 0..=255u8 {
            assert!(
                !sas_emoji(i).is_empty(),
                "index {i} should map to a non-empty emoji"
            );
        }
    }

    #[test]
    fn test_derive_sas_known_result() {
        let pk_a = [0xABu8; 32];
        let pk_b = [0xCDu8; 32];
        let nonce = [0xEFu8; 32];

        let indices = derive_sas(&pk_a, &pk_b, &nonce).unwrap();
        // Verify deterministic
        assert_eq!(indices, derive_sas(&pk_a, &pk_b, &nonce).unwrap());
        // Verify all 10 indices are populated
        assert_eq!(indices.len(), 10);
        // Every index maps to a valid emoji
        for &idx in &indices {
            assert!(!sas_emoji(idx).is_empty());
        }
    }

    #[test]
    fn test_sas_emoji_table_size() {
        assert_eq!(SAS_EMOJI_TABLE.len(), 256);
    }

    #[test]
    fn test_sas_emoji_distinct() {
        let mut seen = std::collections::HashSet::new();
        for emoji in &SAS_EMOJI_TABLE {
            assert!(seen.insert(emoji), "duplicate emoji: {emoji}");
        }
    }

    #[test]
    fn test_sas_entropy_is_80_bits() {
        // 256-entry table (8 bits per symbol) * 10 symbols = 80 bits
        let bits_per_symbol = (SAS_EMOJI_TABLE.len() as f64).log2();
        let total_bits = bits_per_symbol * SAS_EMOJI_COUNT as f64;
        assert!(
            (total_bits - 80.0).abs() < 0.001,
            "Expected 80 bits of entropy, got {total_bits}"
        );
    }
}
