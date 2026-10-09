use crate::db;
use crate::models::*;
use crate::server::{
    broadcast_task_created, broadcast_task_deleted, broadcast_task_updated, local_ip_address,
    ServerRuntime,
};
use tauri::State;

#[tauri::command]
pub fn get_app_status(runtime: State<'_, ServerRuntime>) -> Result<AppStatus, String> {
    let flags = runtime.status.lock();
    let devices = db::get_connected_devices(&runtime.db)?;
    let pending = db::get_pending_sync_count(&runtime.db)?;
    Ok(AppStatus {
        server: ServerStatus {
            running: flags.running,
            port: PORT,
            ip_address: if flags.ip_address.is_empty() {
                local_ip_address()
            } else {
                flags.ip_address.clone()
            },
            started_at: flags.started_at.clone(),
        },
        database: DatabaseStatus {
            connected: true,
            path: "app.db".to_string(),
            size: None,
        },
        connected_devices: devices,
        pending_sync_count: pending,
        logs: runtime.logger.get_recent(50),
    })
}

#[tauri::command]
pub fn get_tasks(
    runtime: State<'_, ServerRuntime>,
    query: Option<TaskListQuery>,
) -> TaskListPage {
    match db::get_tasks_page(&runtime.db, query.unwrap_or_default()) {
        Ok(page) => page,
        Err(err) => {
            runtime
                .logger
                .error("IPC GET_TASKS failed", Some(serde_json::json!({ "error": err })));
            TaskListPage {
                tasks: vec![],
                total_count: 0,
                pending_count: 0,
                completed_count: 0,
                has_more: false,
                next_cursor: None,
                error: Some(err),
            }
        }
    }
}

#[tauri::command]
pub fn create_task(
    runtime: State<'_, ServerRuntime>,
    input: CreateTaskInput,
) -> Result<serde_json::Value, String> {
    match db::create_task(
        &runtime.db,
        input.title,
        input.description,
        &runtime.logger,
    ) {
        Ok(task) => {
            broadcast_task_created(&runtime, &task);
            Ok(serde_json::json!({ "task": task }))
        }
        Err(err) => {
            runtime
                .logger
                .error("IPC CREATE_TASK failed", Some(serde_json::json!({ "error": err })));
            Ok(serde_json::json!({ "error": err }))
        }
    }
}

#[tauri::command]
pub fn update_task(
    runtime: State<'_, ServerRuntime>,
    input: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let id = input
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "missing id".to_string())?
        .to_string();

    let title = input
        .get("title")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    // Distinguish omitted vs explicit null (Electron Partial semantics).
    let description = if input.get("description").is_none() {
        None
    } else if input.get("description").map(|v| v.is_null()).unwrap_or(false) {
        Some(None)
    } else {
        Some(
            input
                .get("description")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
        )
    };

    let completed = input.get("completed").and_then(|v| v.as_bool());

    match db::update_task(
        &runtime.db,
        &id,
        title,
        description,
        completed,
        &runtime.logger,
    ) {
        Ok(Some(task)) => {
            broadcast_task_updated(&runtime, &task);
            Ok(serde_json::json!({ "task": task }))
        }
        Ok(None) => Ok(serde_json::json!({ "task": null })),
        Err(err) => {
            runtime
                .logger
                .error("IPC UPDATE_TASK failed", Some(serde_json::json!({ "error": err })));
            Ok(serde_json::json!({ "error": err }))
        }
    }
}

#[tauri::command]
pub fn delete_task(
    runtime: State<'_, ServerRuntime>,
    id: String,
) -> Result<serde_json::Value, String> {
    match db::delete_task(&runtime.db, &id, &runtime.logger) {
        Ok(Some(task)) => {
            broadcast_task_deleted(&runtime, &task);
            Ok(serde_json::json!({ "success": true }))
        }
        Ok(None) => Ok(serde_json::json!({ "success": false })),
        Err(err) => {
            runtime
                .logger
                .error("IPC DELETE_TASK failed", Some(serde_json::json!({ "error": err })));
            Ok(serde_json::json!({ "success": false, "error": err }))
        }
    }
}

#[tauri::command]
pub fn get_devices(runtime: State<'_, ServerRuntime>) -> Result<serde_json::Value, String> {
    match db::get_all_devices(&runtime.db) {
        Ok(devices) => Ok(serde_json::json!({ "devices": devices })),
        Err(err) => {
            runtime
                .logger
                .error("IPC GET_DEVICES failed", Some(serde_json::json!({ "error": err })));
            Ok(serde_json::json!({ "devices": [], "error": err }))
        }
    }
}

#[tauri::command]
pub async fn scan_network_printers() -> Result<Vec<String>, String> {
    crate::printers::scan_local_printers().await
}

#[tauri::command]
pub fn discover_usb_printers() -> Result<Vec<crate::printers::UsbPrinterInfo>, String> {
    crate::printers::discover_usb_printers()
}

#[tauri::command]
pub fn get_printers_config(app_handle: tauri::AppHandle) -> Result<Vec<crate::printers::PrinterConfig>, String> {
    crate::printers::load_printers(&app_handle)
}

#[tauri::command]
pub fn save_printers_config(
    app_handle: tauri::AppHandle,
    printers: Vec<crate::printers::PrinterConfig>,
) -> Result<(), String> {
    crate::printers::save_printers(&app_handle, printers)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn print_receipt(
    width: String,
    connection_type: Option<String>,
    ip: Option<String>,
    port: Option<u16>,
    name: Option<String>,
) -> Result<(), String> {
    let connection = connection_type.unwrap_or_else(|| "network".to_string());
    crate::printers::print_escpos_receipt(
        &width,
        &connection,
        ip.as_deref(),
        port,
        name.as_deref(),
    )
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn print_raster(
    width_dots: u32,
    height: u32,
    rows: Vec<u8>,
    mode: Option<String>,
    connection_type: Option<String>,
    ip: Option<String>,
    port: Option<u16>,
    name: Option<String>,
) -> Result<(), String> {
    let connection = connection_type.unwrap_or_else(|| "network".to_string());
    let raster_mode = crate::printers::parse_raster_mode(mode.as_deref());
    let payload = crate::printers::RasterPayload {
        width_dots,
        height,
        rows,
    };
    crate::printers::print_escpos_raster(
        payload,
        raster_mode,
        &connection,
        ip.as_deref(),
        port,
        name.as_deref(),
    )
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn print_selftest(
    connection_type: Option<String>,
    ip: Option<String>,
    port: Option<u16>,
    name: Option<String>,
) -> Result<(), String> {
    let connection = connection_type.unwrap_or_else(|| "network".to_string());
    crate::printers::print_selftest(
        &connection,
        ip.as_deref(),
        port,
        name.as_deref(),
    )
    .await
}

