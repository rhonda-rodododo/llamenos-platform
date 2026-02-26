//! Tauri command wrappers around llamenos-core crypto operations.
//!
//! Each command delegates to the shared llamenos-core crate, providing
//! native-speed crypto to the frontend via Tauri's IPC.

use llamenos_core::{
    auth, ecies, encryption, keys,
};

// Re-export types for serde bridging with the frontend
pub use llamenos_core::ecies::{KeyEnvelope, RecipientKeyEnvelope};
pub use llamenos_core::encryption::{EncryptedKeyData, EncryptedMessage, EncryptedNote};
pub use llamenos_core::keys::KeyPair;

fn err_str(e: impl std::fmt::Display) -> String {
    e.to_string()
}

#[tauri::command]
pub fn ecies_wrap_key(
    key_hex: String,
    recipient_pubkey: String,
    label: String,
) -> Result<KeyEnvelope, String> {
    let key_bytes = hex::decode(&key_hex).map_err(|e| err_str(e))?;
    if key_bytes.len() != 32 {
        return Err("Key must be 32 bytes".into());
    }
    let mut key = [0u8; 32];
    key.copy_from_slice(&key_bytes);
    ecies::ecies_wrap_key(&key, &recipient_pubkey, &label).map_err(err_str)
}

#[tauri::command]
pub fn ecies_unwrap_key(
    envelope: KeyEnvelope,
    secret_key_hex: String,
    label: String,
) -> Result<String, String> {
    let key = ecies::ecies_unwrap_key(&envelope, &secret_key_hex, &label).map_err(err_str)?;
    Ok(hex::encode(key))
}

#[tauri::command]
pub fn encrypt_note(
    payload_json: String,
    author_pubkey: String,
    admin_pubkeys: Vec<String>,
) -> Result<EncryptedNote, String> {
    encryption::encrypt_note(&payload_json, &author_pubkey, &admin_pubkeys).map_err(err_str)
}

#[tauri::command]
pub fn decrypt_note(
    encrypted_content: String,
    envelope: KeyEnvelope,
    secret_key_hex: String,
) -> Result<String, String> {
    encryption::decrypt_note(&encrypted_content, &envelope, &secret_key_hex).map_err(err_str)
}

#[tauri::command]
pub fn encrypt_message(
    plaintext: String,
    reader_pubkeys: Vec<String>,
) -> Result<EncryptedMessage, String> {
    encryption::encrypt_message(&plaintext, &reader_pubkeys).map_err(err_str)
}

#[tauri::command]
pub fn decrypt_message(
    encrypted_content: String,
    reader_envelopes: Vec<RecipientKeyEnvelope>,
    secret_key_hex: String,
    reader_pubkey: String,
) -> Result<String, String> {
    encryption::decrypt_message(
        &encrypted_content,
        &reader_envelopes,
        &secret_key_hex,
        &reader_pubkey,
    )
    .map_err(err_str)
}

#[tauri::command]
pub fn create_auth_token(
    secret_key_hex: String,
    timestamp: u64,
    method: String,
    path: String,
) -> Result<String, String> {
    let token = auth::create_auth_token(&secret_key_hex, timestamp, &method, &path)
        .map_err(err_str)?;
    serde_json::to_string(&token).map_err(err_str)
}

#[tauri::command]
pub fn encrypt_with_pin(
    nsec: String,
    pin: String,
    pubkey_hex: String,
) -> Result<EncryptedKeyData, String> {
    encryption::encrypt_with_pin(&nsec, &pin, &pubkey_hex).map_err(err_str)
}

#[tauri::command]
pub fn decrypt_with_pin(data: EncryptedKeyData, pin: String) -> Result<String, String> {
    encryption::decrypt_with_pin(&data, &pin).map_err(err_str)
}

#[tauri::command]
pub fn generate_keypair() -> Result<KeyPair, String> {
    Ok(keys::generate_keypair())
}

#[tauri::command]
pub fn get_public_key(secret_key_hex: String) -> Result<String, String> {
    keys::get_public_key(&secret_key_hex).map_err(err_str)
}

#[tauri::command]
pub fn verify_schnorr(
    message_hex: String,
    signature_hex: String,
    pubkey_hex: String,
) -> Result<bool, String> {
    auth::verify_schnorr(&message_hex, &signature_hex, &pubkey_hex).map_err(err_str)
}
