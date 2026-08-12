mod commands;
mod conflict;
mod db;
mod logger;
mod models;
mod printers;
mod server;

use crate::logger::Logger;
use crate::server::{start_server, ServerFlags, ServerRuntime};
use parking_lot::Mutex;
use socketioxide::SocketIo;
use std::sync::Arc;
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let logger = Logger::new();
            let app_handle = app.handle().clone();
            let logger_for_events = logger.clone();
            logger_for_events.on_entry(move |entry| {
                let _ = app_handle.emit("log:entry", entry);
            });

            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| e.to_string())?;

            let (db, _db_path) = db::open_database(&data_dir, &logger)?;

            let (layer, io) = SocketIo::new_layer();
            let status = Arc::new(Mutex::new(ServerFlags::default()));

            let runtime = ServerRuntime {
                db,
                logger: logger.clone(),
                app: app.handle().clone(),
                io,
                status,
            };

            app.manage(runtime.clone());

            let runtime_for_server = runtime.clone();
            tauri::async_runtime::spawn(async move {
                start_server(runtime_for_server, layer).await;
            });

            logger.success("Main window ready", None);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_app_status,
            commands::get_tasks,
            commands::create_task,
            commands::update_task,
            commands::delete_task,
            commands::get_devices,
            commands::scan_network_printers,
            commands::discover_usb_printers,
            commands::get_printers_config,
            commands::save_printers_config,
            commands::print_receipt,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
