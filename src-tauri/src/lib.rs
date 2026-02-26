mod crypto;

use tauri::Manager;

use crate::crypto::CryptoState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_stronghold::Builder::new(|password| {
                // PBKDF2-SHA256 with 600K iterations — matches web app's key derivation.
                // Domain-separated salt prevents cross-application brute-force reuse.
                use hmac::Hmac;
                use pbkdf2::pbkdf2;
                use sha2::Sha256;

                let salt = b"llamenos:stronghold:v1";
                let mut kek = vec![0u8; 32];
                pbkdf2::<Hmac<Sha256>>(password.as_bytes(), salt, 600_000, &mut kek)
                    .expect("PBKDF2 derivation failed");
                kek
            })
            .build(),
        )
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Focus existing window when second instance launched
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
                // Visual feedback: unminimize if minimized
                let _ = window.unminimize();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // Register CryptoState as managed state
        .manage(CryptoState::new())
        .setup(|app| {
            // System tray setup
            use tauri::menu::{Menu, MenuItem};
            use tauri::tray::TrayIconBuilder;

            let show = MenuItem::with_id(app, "show", "Show Hotline", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;

            TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("Hotline")
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        // Zeroize crypto state before exit
                        if let Some(state) = app.try_state::<CryptoState>() {
                            state.lock();
                        }
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            // Lock crypto state when window is destroyed (app closing)
            let app_handle = app.handle().clone();
            if let Some(window) = app.get_webview_window("main") {
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::Destroyed = event {
                        if let Some(state) = app_handle.try_state::<CryptoState>() {
                            state.lock();
                        }
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Stateful commands (nsec stays in Rust — preferred on desktop)
            crypto::unlock_with_pin,
            crypto::import_key_to_state,
            crypto::lock_crypto,
            crypto::is_crypto_unlocked,
            crypto::get_public_key_from_state,
            crypto::create_auth_token_from_state,
            crypto::ecies_unwrap_key_from_state,
            crypto::decrypt_note_from_state,
            crypto::decrypt_message_from_state,
            // Stateless commands (original — secret key passed as argument)
            crypto::ecies_wrap_key,
            crypto::ecies_unwrap_key,
            crypto::encrypt_note,
            crypto::decrypt_note,
            crypto::encrypt_message,
            crypto::decrypt_message,
            crypto::create_auth_token,
            crypto::encrypt_with_pin,
            crypto::decrypt_with_pin,
            crypto::generate_keypair,
            crypto::get_public_key,
            crypto::verify_schnorr,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
