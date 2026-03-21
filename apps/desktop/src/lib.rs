mod crypto;

use tauri::{Emitter, Manager};

use crate::crypto::CryptoState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
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
        .plugin(tauri_plugin_process::init());

    // Updater disabled for Flatpak builds (Flatpak has its own update mechanism)
    #[cfg(feature = "updater")]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    builder
        // Register CryptoState as managed state
        .manage(CryptoState::new())
        .setup(|app| {
            // System tray setup
            use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
            use tauri::tray::TrayIconBuilder;

            let show_hide =
                MenuItem::with_id(app, "show_hide", "Show / Hide", true, None::<&str>)?;
            #[cfg(feature = "updater")]
            let check_updates = MenuItem::with_id(
                app,
                "check_updates",
                "Check for Updates\u{2026}",
                true,
                None::<&str>,
            )?;
            let about = MenuItem::with_id(
                app,
                "about",
                &format!("About Hotline v{}", env!("CARGO_PKG_VERSION")),
                true,
                None::<&str>,
            )?;
            let separator = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Hotline", true, None::<&str>)?;

            #[cfg(feature = "updater")]
            let menu = Menu::with_items(
                app,
                &[&show_hide, &separator, &check_updates, &about, &separator, &quit],
            )?;
            #[cfg(not(feature = "updater"))]
            let menu =
                Menu::with_items(app, &[&show_hide, &separator, &about, &separator, &quit])?;

            TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("Hotline")
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "show_hide" => {
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                                let _ = window.unminimize();
                            }
                        }
                    }
                    #[cfg(feature = "updater")]
                    "check_updates" => {
                        // Emit event to frontend so the UI can show update progress
                        let _ = app.emit("check-for-updates", ());
                    }
                    "about" => {
                        // Show the main window with focus (about info shown in-app)
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                            let _ = app.emit("navigate", "/settings");
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
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::DoubleClick { .. } = event {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                            let _ = window.unminimize();
                        }
                    }
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
            crypto::decrypt_call_record_from_state,
            crypto::decrypt_legacy_note_from_state,
            crypto::decrypt_transcription_from_state,
            crypto::encrypt_draft_from_state,
            crypto::decrypt_draft_from_state,
            crypto::encrypt_export_from_state,
            crypto::sign_nostr_event_from_state,
            crypto::decrypt_file_metadata_from_state,
            crypto::unwrap_file_key_from_state,
            crypto::unwrap_hub_key_from_state,
            crypto::rewrap_file_key_from_state,
            crypto::encrypt_nsec_for_provisioning,
            crypto::decrypt_provisioned_nsec,
            crypto::generate_keypair_and_load,
            crypto::generate_backup_from_state,
            crypto::generate_ephemeral_keypair,
            // Stateless commands — public-key-only, validation, or sign-in flow only
            crypto::ecies_wrap_key,
            crypto::encrypt_note,
            crypto::encrypt_message,
            crypto::pubkey_from_nsec,
            crypto::verify_schnorr,
            crypto::is_valid_nsec,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
