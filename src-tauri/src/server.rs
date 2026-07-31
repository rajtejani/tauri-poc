use crate::db::{self, DbHandle};
use crate::logger::Logger;
use crate::models::*;
use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use parking_lot::Mutex;
use serde::Deserialize;
use socketioxide::{
    extract::{AckSender, Data, SocketRef},
    layer::SocketIoLayer,
    SocketIo,
};
use std::net::SocketAddr;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tower_http::cors::{Any, CorsLayer};
use uuid::Uuid;

#[derive(Clone)]
pub struct ServerRuntime {
    pub db: DbHandle,
    pub logger: Logger,
    pub app: AppHandle,
    pub io: SocketIo,
    pub status: Arc<Mutex<ServerFlags>>,
}

#[derive(Default)]
pub struct ServerFlags {
    pub running: bool,
    pub started_at: Option<String>,
    pub ip_address: String,
}

#[derive(Clone)]
struct HttpState {
    runtime: ServerRuntime,
}

pub fn local_ip_address() -> String {
    local_ip_address::local_ip()
        .map(|ip| ip.to_string())
        .unwrap_or_else(|_| "127.0.0.1".to_string())
}

pub fn notify_status_changed(app: &AppHandle) {
    let _ = app.emit("status:changed", ());
}

pub fn notify_task_updated(app: &AppHandle, task: &Task) {
    let _ = app.emit(
        "tasks:updated",
        TaskUpdatedEvent {
            task: task.clone(),
        },
    );
    notify_status_changed(app);
}

pub fn broadcast_task_created(runtime: &ServerRuntime, task: &Task) {
    let _ = runtime.io.emit("task:created", task);
    let _ = db::mark_task_synced(&runtime.db, &task.id);
    notify_task_updated(&runtime.app, task);
}

pub fn broadcast_task_updated(runtime: &ServerRuntime, task: &Task) {
    let _ = runtime.io.emit("task:updated", task);
    let _ = db::mark_task_synced(&runtime.db, &task.id);
    notify_task_updated(&runtime.app, task);
}

pub fn broadcast_task_deleted(runtime: &ServerRuntime, task: &Task) {
    let _ = runtime.io.emit("task:deleted", task);
    let _ = db::mark_task_synced(&runtime.db, &task.id);
    notify_task_updated(&runtime.app, task);
}

fn broadcast_device_list(runtime: &ServerRuntime) {
    if let Ok(devices) = db::get_connected_devices(&runtime.db) {
        let _ = runtime
            .io
            .emit("devices:list", serde_json::json!({ "devices": devices }));
    }
}

fn apply_mutation(
    runtime: &ServerRuntime,
    socket: &SocketRef,
    payload: TaskMutationPayload,
    broadcast_event: &str,
    ack: AckSender,
) {
    match db::upsert_task_from_remote(&runtime.db, payload.task.clone(), &runtime.logger) {
        Ok(result) => {
            let response = MutationAck {
                operation_id: payload.operation_id,
                success: true,
                conflict: if result.conflict { Some(true) } else { None },
                resolved_task: if result.conflict {
                    Some(result.task.clone())
                } else {
                    None
                },
                error: None,
            };
            let _ = ack.send(&response);
            if result.applied {
                let event = broadcast_event.to_string();
                let _ = socket.broadcast().emit(event, &result.task);
                runtime.logger.success(
                    format!("Task mutation applied ({broadcast_event})"),
                    Some(serde_json::json!({ "id": result.task.id })),
                );
                notify_task_updated(&runtime.app, &result.task);
            } else if result.conflict {
                runtime.logger.info(
                    "Task mutation conflict — host version kept",
                    Some(serde_json::json!({ "id": payload.task.id })),
                );
            }
        }
        Err(err) => {
            runtime
                .logger
                .error("Task mutation failed", Some(serde_json::json!({ "error": err })));
            let _ = ack.send(&MutationAck {
                operation_id: payload.operation_id,
                success: false,
                conflict: None,
                resolved_task: None,
                error: Some(err),
            });
        }
    }
}

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "status": "ok",
        "timestamp": chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
    }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TasksQuery {
    limit: Option<i64>,
    cursor_updated_at: Option<String>,
    cursor_id: Option<String>,
    filter: Option<String>,
}

async fn api_tasks(
    State(state): State<HttpState>,
    Query(q): Query<TasksQuery>,
) -> Result<Json<TaskListPage>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    let cursor = match (q.cursor_updated_at, q.cursor_id) {
        (Some(updated_at), Some(id)) => Some(TaskCursor { updated_at, id }),
        _ => None,
    };
    match db::get_tasks_page(
        &state.runtime.db,
        TaskListQuery {
            limit: q.limit,
            cursor,
            filter: q.filter,
        },
    ) {
        Ok(page) => Ok(Json(page)),
        Err(err) => Err((
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": "Failed to fetch tasks", "details": err })),
        )),
    }
}

async fn api_devices(
    State(state): State<HttpState>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    match db::get_connected_devices(&state.runtime.db) {
        Ok(devices) => Ok(Json(serde_json::json!({ "devices": devices }))),
        Err(err) => Err((
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": "Failed to fetch devices", "details": err })),
        )),
    }
}

pub async fn start_server(runtime: ServerRuntime, layer: SocketIoLayer) {
    let io = runtime.io.clone();
    let rt = runtime.clone();

    io.ns("/", move |socket: SocketRef| {
        let runtime = rt.clone();
        let socket_id = socket.id.to_string();
        runtime
            .logger
            .info("Socket connected", Some(serde_json::json!({ "socketId": socket_id })));

        let current_device = Arc::new(Mutex::new(None::<String>));

        {
            let runtime = runtime.clone();
            let device_slot = current_device.clone();
            socket.on(
                "device:connect",
                move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
                    register_device(&runtime, &socket, &device_slot, payload);
                },
            );
        }

        {
            let runtime = runtime.clone();
            let device_slot = current_device.clone();
            socket.on(
                "device:register",
                move |socket: SocketRef, Data::<serde_json::Value>(payload), ack: AckSender| {
                    register_device(&runtime, &socket, &device_slot, payload);
                    let _ = ack.send(&serde_json::json!({
                        "success": true,
                        "serverTime": chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
                        "message": "Device registered successfully",
                    }));
                },
            );
        }

        socket.on("heartbeat", |_socket: SocketRef, ack: AckSender| {
            let _ = ack.send(&serde_json::json!({
                "serverTime": chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
            }));
        });

        {
            let runtime = runtime.clone();
            socket.on(
                "sync:request",
                move |_socket: SocketRef, Data::<SyncRequestPayload>(payload), ack: AckSender| {
                    match db::get_tasks_for_sync_page(
                        &runtime.db,
                        payload.since.as_deref(),
                        payload.cursor.as_ref(),
                        payload.limit.unwrap_or(SYNC_TASK_PAGE_SIZE),
                    ) {
                        Ok((tasks, has_more, next_cursor)) => {
                            runtime.logger.info(
                                "Sync page",
                                Some(serde_json::json!({
                                    "deviceId": payload.device_id,
                                    "count": tasks.len(),
                                    "hasMore": has_more,
                                    "since": payload.since,
                                })),
                            );
                            let _ = ack.send(&SyncResponsePayload {
                                tasks,
                                server_time: chrono::Utc::now()
                                    .to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
                                has_more,
                                next_cursor,
                            });
                        }
                        Err(err) => {
                            runtime.logger.error(
                                "Sync failed",
                                Some(serde_json::json!({ "error": err })),
                            );
                            let _ = ack.send(&SyncResponsePayload {
                                tasks: vec![],
                                server_time: chrono::Utc::now()
                                    .to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
                                has_more: false,
                                next_cursor: None,
                            });
                        }
                    }
                },
            );
        }

        {
            let runtime = runtime.clone();
            socket.on(
                "task:create",
                move |socket: SocketRef, Data::<TaskMutationPayload>(payload), ack: AckSender| {
                    apply_mutation(&runtime, &socket, payload, "task:created", ack);
                },
            );
        }
        {
            let runtime = runtime.clone();
            socket.on(
                "task:update",
                move |socket: SocketRef, Data::<TaskMutationPayload>(payload), ack: AckSender| {
                    apply_mutation(&runtime, &socket, payload, "task:updated", ack);
                },
            );
        }
        {
            let runtime = runtime.clone();
            socket.on(
                "task:delete",
                move |socket: SocketRef, Data::<TaskMutationPayload>(payload), ack: AckSender| {
                    apply_mutation(&runtime, &socket, payload, "task:deleted", ack);
                },
            );
        }

        {
            let runtime = runtime.clone();
            socket.on("task:list", move |socket: SocketRef, ack: AckSender| {
                match db::get_tasks_page(
                    &runtime.db,
                    TaskListQuery {
                        limit: Some(UI_TASK_PAGE_SIZE),
                        cursor: None,
                        filter: None,
                    },
                ) {
                    Ok(page) => {
                        let _ = ack.send(&page);
                        let _ = socket.emit("task:list", &page);
                    }
                    Err(err) => {
                        let _ = ack.send(&serde_json::json!({ "error": err }));
                    }
                }
            });
        }

        {
            let runtime = runtime.clone();
            let device_slot = current_device.clone();
            socket.on_disconnect(move |socket: SocketRef| {
                if let Some(device_id) = device_slot.lock().clone() {
                    let _ = db::set_device_disconnected(&runtime.db, &device_id, &runtime.logger);
                    runtime.logger.warn(
                        "Client disconnected",
                        Some(serde_json::json!({ "deviceId": device_id })),
                    );
                    broadcast_device_list(&runtime);
                    notify_status_changed(&runtime.app);
                } else {
                    runtime.logger.warn(
                        "Unknown socket disconnected",
                        Some(serde_json::json!({ "socketId": socket.id.to_string() })),
                    );
                }
            });
        }
    });

    let http_state = HttpState {
        runtime: runtime.clone(),
    };

    let app = Router::new()
        .route("/health", get(health))
        .route("/api/tasks", get(api_tasks))
        .route("/api/devices", get(api_devices))
        .with_state(http_state)
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
        .layer(layer);

    let addr = SocketAddr::from(([0, 0, 0, 0], PORT));
    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(err) => {
            runtime.logger.error(
                "Server error",
                Some(serde_json::json!({ "error": err.to_string() })),
            );
            {
                let mut flags = runtime.status.lock();
                flags.running = false;
            }
            notify_status_changed(&runtime.app);
            return;
        }
    };

    {
        let mut flags = runtime.status.lock();
        flags.running = true;
        flags.started_at = Some(
            chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        );
        flags.ip_address = local_ip_address();
    }
    runtime.logger.success(
        format!("Server started on port {PORT}"),
        Some(serde_json::json!({ "ip": local_ip_address() })),
    );
    notify_status_changed(&runtime.app);

    if let Err(err) = axum::serve(listener, app).await {
        runtime.logger.error(
            "Server error",
            Some(serde_json::json!({ "error": err.to_string() })),
        );
        let mut flags = runtime.status.lock();
        flags.running = false;
    }
}

fn register_device(
    runtime: &ServerRuntime,
    socket: &SocketRef,
    device_slot: &Arc<Mutex<Option<String>>>,
    payload: serde_json::Value,
) {
    let device_id = payload
        .get("deviceId")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    let name = payload
        .get("name")
        .and_then(|v| v.as_str())
        .or_else(|| payload.get("deviceName").and_then(|v| v.as_str()))
        .map(|s| s.to_string())
        .unwrap_or_else(|| format!("Device-{}", &device_id[..6.min(device_id.len())]));

    let device_type = payload
        .get("type")
        .and_then(|v| v.as_str())
        .or_else(|| payload.get("platform").and_then(|v| v.as_str()))
        .unwrap_or("mobile")
        .to_string();

    match db::upsert_device(
        &runtime.db,
        &device_id,
        &name,
        &device_type,
        true,
        &runtime.logger,
    ) {
        Ok(device) => {
            *device_slot.lock() = Some(device_id.clone());
            runtime.logger.success(
                "Client connected",
                Some(serde_json::json!({ "deviceId": device_id, "name": device.name })),
            );
            let _ = socket.emit("device:connected", serde_json::json!({ "device": device }));
            broadcast_device_list(runtime);
            notify_status_changed(&runtime.app);
        }
        Err(err) => {
            runtime.logger.error(
                "Device registration failed",
                Some(serde_json::json!({ "error": err })),
            );
        }
    }
}
