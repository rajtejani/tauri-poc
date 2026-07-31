use crate::conflict::{resolve_conflict, ConflictWinner};
use crate::logger::Logger;
use crate::models::*;
use parking_lot::Mutex;
use rusqlite::{params, Connection, OptionalExtension};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use uuid::Uuid;

pub type DbHandle = Arc<Mutex<Connection>>;

pub fn open_database(app_data_dir: &Path, logger: &Logger) -> Result<(DbHandle, PathBuf), String> {
    std::fs::create_dir_all(app_data_dir).map_err(|e| e.to_string())?;
    let db_path = app_data_dir.join("app.db");
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| e.to_string())?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|e| e.to_string())?;

    create_tables(&conn)?;
    ensure_task_indexes(&conn)?;
    purge_load_test_seed_data(&conn, logger)?;

    logger.info(
        "Database initialized",
        Some(serde_json::json!({ "path": db_path.display().to_string() })),
    );

    Ok((Arc::new(Mutex::new(conn)), db_path))
}

fn create_tables(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS devices (
          id        TEXT PRIMARY KEY,
          name      TEXT NOT NULL,
          type      TEXT NOT NULL DEFAULT 'unknown',
          connected INTEGER NOT NULL DEFAULT 0,
          lastSeen  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS tasks (
          id          TEXT PRIMARY KEY,
          title       TEXT NOT NULL,
          description TEXT,
          completed   INTEGER NOT NULL DEFAULT 0,
          created_at  TEXT NOT NULL,
          updated_at  TEXT NOT NULL,
          version     INTEGER NOT NULL DEFAULT 1,
          device_id   TEXT NOT NULL,
          deleted_at  TEXT,
          is_synced   INTEGER NOT NULL DEFAULT 0
        );
        "#,
    )
    .map_err(|e| e.to_string())
}

fn ensure_task_indexes(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        CREATE INDEX IF NOT EXISTS idx_tasks_list
          ON tasks(deleted_at, updated_at DESC, id DESC);
        CREATE INDEX IF NOT EXISTS idx_tasks_sync
          ON tasks(updated_at ASC, id ASC);
        "#,
    )
    .map_err(|e| e.to_string())
}

fn purge_load_test_seed_data(conn: &Connection, logger: &Logger) -> Result<(), String> {
    let deleted = conn
        .execute("DELETE FROM tasks WHERE id LIKE 'loadtest_%'", [])
        .map_err(|e| e.to_string())?;
    if deleted > 0 {
        logger.info(
            "Purged load-test seed tasks",
            Some(serde_json::json!({ "deleted": deleted })),
        );
    }
    Ok(())
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn map_task(row: &rusqlite::Row<'_>) -> rusqlite::Result<Task> {
    Ok(Task {
        id: row.get(0)?,
        title: row.get(1)?,
        description: row.get(2)?,
        completed: row.get::<_, i64>(3)? == 1,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
        version: row.get(6)?,
        device_id: row.get(7)?,
        deleted_at: row.get(8)?,
    })
}

fn map_device(row: &rusqlite::Row<'_>) -> rusqlite::Result<Device> {
    Ok(Device {
        id: row.get(0)?,
        name: row.get(1)?,
        device_type: row.get(2)?,
        connected: row.get::<_, i64>(3)? == 1,
        last_seen: row.get(4)?,
    })
}

pub fn upsert_device(
    db: &DbHandle,
    id: &str,
    name: &str,
    device_type: &str,
    connected: bool,
    logger: &Logger,
) -> Result<Device, String> {
    let now = now_iso();
    let conn = db.lock();
    conn.execute(
        r#"
        INSERT INTO devices (id, name, type, connected, lastSeen)
        VALUES (?1, ?2, ?3, ?4, ?5)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          type = excluded.type,
          connected = excluded.connected,
          lastSeen = excluded.lastSeen
        "#,
        params![id, name, device_type, if connected { 1 } else { 0 }, now],
    )
    .map_err(|e| e.to_string())?;

    logger.info(
        "DB write: upsert device",
        Some(serde_json::json!({ "id": id, "name": name })),
    );

    conn.query_row(
        "SELECT id, name, type, connected, lastSeen FROM devices WHERE id = ?1",
        params![id],
        map_device,
    )
    .map_err(|e| e.to_string())
}

pub fn set_device_disconnected(db: &DbHandle, id: &str, logger: &Logger) -> Result<(), String> {
    let conn = db.lock();
    conn.execute(
        "UPDATE devices SET connected = 0, lastSeen = ?1 WHERE id = ?2",
        params![now_iso(), id],
    )
    .map_err(|e| e.to_string())?;
    logger.info(
        "DB write: device disconnected",
        Some(serde_json::json!({ "id": id })),
    );
    Ok(())
}

pub fn get_all_devices(db: &DbHandle) -> Result<Vec<Device>, String> {
    let conn = db.lock();
    let mut stmt = conn
        .prepare("SELECT id, name, type, connected, lastSeen FROM devices ORDER BY lastSeen DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], map_device)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

pub fn get_connected_devices(db: &DbHandle) -> Result<Vec<Device>, String> {
    let conn = db.lock();
    let mut stmt = conn
        .prepare(
            "SELECT id, name, type, connected, lastSeen FROM devices WHERE connected = 1 ORDER BY lastSeen DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], map_device)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

fn get_task_by_id(conn: &Connection, id: &str) -> Result<Option<Task>, String> {
    conn.query_row(
        "SELECT id, title, description, completed, created_at, updated_at, version, device_id, deleted_at FROM tasks WHERE id = ?1",
        params![id],
        map_task,
    )
    .optional()
    .map_err(|e| e.to_string())
}

fn insert_task(conn: &Connection, task: &Task, synced: bool) -> Result<(), String> {
    conn.execute(
        r#"
        INSERT INTO tasks (id, title, description, completed, created_at, updated_at, version, device_id, deleted_at, is_synced)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
        "#,
        params![
            task.id,
            task.title,
            task.description,
            if task.completed { 1 } else { 0 },
            task.created_at,
            task.updated_at,
            task.version,
            task.device_id,
            task.deleted_at,
            if synced { 1 } else { 0 },
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn replace_task(conn: &Connection, task: &Task, synced: bool) -> Result<(), String> {
    conn.execute(
        r#"
        UPDATE tasks SET
          title = ?2,
          description = ?3,
          completed = ?4,
          created_at = ?5,
          updated_at = ?6,
          version = ?7,
          device_id = ?8,
          deleted_at = ?9,
          is_synced = ?10
        WHERE id = ?1
        "#,
        params![
            task.id,
            task.title,
            task.description,
            if task.completed { 1 } else { 0 },
            task.created_at,
            task.updated_at,
            task.version,
            task.device_id,
            task.deleted_at,
            if synced { 1 } else { 0 },
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn upsert_task_from_remote(
    db: &DbHandle,
    incoming: Task,
    logger: &Logger,
) -> Result<UpsertResult, String> {
    let conn = db.lock();
    let existing = get_task_by_id(&conn, &incoming.id)?;
    if existing.is_none() {
        insert_task(&conn, &incoming, true)?;
        logger.info(
            "DB write: insert remote task",
            Some(serde_json::json!({ "id": incoming.id })),
        );
        return Ok(UpsertResult {
            task: incoming,
            applied: true,
            conflict: false,
        });
    }

    let local = existing.unwrap();
    if resolve_conflict(&local, &incoming) == ConflictWinner::Remote {
        replace_task(&conn, &incoming, true)?;
        logger.info(
            "DB write: apply remote task",
            Some(serde_json::json!({ "id": incoming.id, "version": incoming.version })),
        );
        return Ok(UpsertResult {
            task: incoming,
            applied: true,
            conflict: false,
        });
    }

    Ok(UpsertResult {
        task: local,
        applied: false,
        conflict: true,
    })
}

pub fn create_task(
    db: &DbHandle,
    title: String,
    description: Option<String>,
    logger: &Logger,
) -> Result<Task, String> {
    let now = now_iso();
    let task = Task {
        id: Uuid::new_v4().to_string(),
        title,
        description,
        completed: false,
        created_at: now.clone(),
        updated_at: now,
        version: 1,
        device_id: DESKTOP_DEVICE_ID.to_string(),
        deleted_at: None,
    };
    {
        let conn = db.lock();
        insert_task(&conn, &task, false)?;
    }
    logger.info(
        "DB write: create task",
        Some(serde_json::json!({ "id": task.id, "title": task.title })),
    );
    Ok(task)
}

pub fn update_task(
    db: &DbHandle,
    id: &str,
    title: Option<String>,
    description: Option<Option<String>>,
    completed: Option<bool>,
    logger: &Logger,
) -> Result<Option<Task>, String> {
    let conn = db.lock();
    let existing = match get_task_by_id(&conn, id)? {
        Some(t) if t.deleted_at.is_none() => t,
        _ => return Ok(None),
    };

    let now = now_iso();
    let task = Task {
        id: existing.id.clone(),
        title: title.unwrap_or(existing.title),
        description: match description {
            Some(d) => d,
            None => existing.description,
        },
        completed: completed.unwrap_or(existing.completed),
        created_at: existing.created_at,
        updated_at: now,
        version: existing.version + 1,
        device_id: DESKTOP_DEVICE_ID.to_string(),
        deleted_at: None,
    };
    replace_task(&conn, &task, false)?;
    logger.info(
        "DB write: update task",
        Some(serde_json::json!({ "id": id })),
    );
    Ok(Some(task))
}

pub fn delete_task(db: &DbHandle, id: &str, logger: &Logger) -> Result<Option<Task>, String> {
    let conn = db.lock();
    let existing = match get_task_by_id(&conn, id)? {
        Some(t) if t.deleted_at.is_none() => t,
        _ => return Ok(None),
    };
    let now = now_iso();
    let task = Task {
        updated_at: now.clone(),
        version: existing.version + 1,
        device_id: DESKTOP_DEVICE_ID.to_string(),
        deleted_at: Some(now),
        ..existing
    };
    replace_task(&conn, &task, false)?;
    logger.info(
        "DB write: tombstone task",
        Some(serde_json::json!({ "id": id })),
    );
    Ok(Some(task))
}

pub fn get_task_counts(db: &DbHandle) -> Result<(i64, i64, i64), String> {
    let conn = db.lock();
    conn.query_row(
        r#"
        SELECT
          COUNT(*) AS totalCount,
          COALESCE(SUM(CASE WHEN completed = 0 THEN 1 ELSE 0 END), 0) AS pendingCount,
          COALESCE(SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END), 0) AS completedCount
        FROM tasks WHERE deleted_at IS NULL
        "#,
        [],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )
    .map_err(|e| e.to_string())
}

pub fn get_tasks_page(db: &DbHandle, query: TaskListQuery) -> Result<TaskListPage, String> {
    let limit = query
        .limit
        .unwrap_or(UI_TASK_PAGE_SIZE)
        .clamp(1, 500);
    let filter = query.filter.unwrap_or_else(|| "all".to_string());
    let filter_sql = match filter.as_str() {
        "pending" => "AND completed = 0",
        "completed" => "AND completed = 1",
        _ => "",
    };
    let (total_count, pending_count, completed_count) = get_task_counts(db)?;
    let conn = db.lock();

    let mut rows = Vec::new();
    if let Some(cursor) = query.cursor {
        let sql = format!(
            r#"
            SELECT id, title, description, completed, created_at, updated_at, version, device_id, deleted_at
            FROM tasks
            WHERE deleted_at IS NULL {filter_sql}
              AND (updated_at < ?1 OR (updated_at = ?1 AND id < ?2))
            ORDER BY updated_at DESC, id DESC
            LIMIT ?3
            "#
        );
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let mapped = stmt
            .query_map(params![cursor.updated_at, cursor.id, limit + 1], map_task)
            .map_err(|e| e.to_string())?;
        for row in mapped {
            rows.push(row.map_err(|e| e.to_string())?);
        }
    } else {
        let sql = format!(
            r#"
            SELECT id, title, description, completed, created_at, updated_at, version, device_id, deleted_at
            FROM tasks
            WHERE deleted_at IS NULL {filter_sql}
            ORDER BY updated_at DESC, id DESC
            LIMIT ?1
            "#
        );
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let mapped = stmt
            .query_map(params![limit + 1], map_task)
            .map_err(|e| e.to_string())?;
        for row in mapped {
            rows.push(row.map_err(|e| e.to_string())?);
        }
    }

    let has_more = rows.len() as i64 > limit;
    if has_more {
        rows.truncate(limit as usize);
    }
    let next_cursor = rows.last().map(|t| TaskCursor {
        updated_at: t.updated_at.clone(),
        id: t.id.clone(),
    });

    Ok(TaskListPage {
        tasks: rows,
        total_count,
        pending_count,
        completed_count,
        has_more,
        next_cursor,
        error: None,
    })
}

pub fn get_tasks_for_sync_page(
    db: &DbHandle,
    since: Option<&str>,
    cursor: Option<&TaskCursor>,
    limit: i64,
) -> Result<(Vec<Task>, bool, Option<TaskCursor>), String> {
    let page_size = limit.clamp(1, 1000);
    let conn = db.lock();
    let mut rows = Vec::new();

    match (cursor, since) {
        (Some(c), Some(s)) => {
            let mut stmt = conn
                .prepare(
                    r#"
                    SELECT id, title, description, completed, created_at, updated_at, version, device_id, deleted_at
                    FROM tasks
                    WHERE updated_at > ?1
                      AND (updated_at > ?2 OR (updated_at = ?2 AND id > ?3))
                    ORDER BY updated_at ASC, id ASC
                    LIMIT ?4
                    "#,
                )
                .map_err(|e| e.to_string())?;
            let mapped = stmt
                .query_map(params![s, c.updated_at, c.id, page_size + 1], map_task)
                .map_err(|e| e.to_string())?;
            for row in mapped {
                rows.push(row.map_err(|e| e.to_string())?);
            }
        }
        (Some(c), None) => {
            let mut stmt = conn
                .prepare(
                    r#"
                    SELECT id, title, description, completed, created_at, updated_at, version, device_id, deleted_at
                    FROM tasks
                    WHERE updated_at > ?1 OR (updated_at = ?1 AND id > ?2)
                    ORDER BY updated_at ASC, id ASC
                    LIMIT ?3
                    "#,
                )
                .map_err(|e| e.to_string())?;
            let mapped = stmt
                .query_map(params![c.updated_at, c.id, page_size + 1], map_task)
                .map_err(|e| e.to_string())?;
            for row in mapped {
                rows.push(row.map_err(|e| e.to_string())?);
            }
        }
        (None, Some(s)) => {
            let mut stmt = conn
                .prepare(
                    r#"
                    SELECT id, title, description, completed, created_at, updated_at, version, device_id, deleted_at
                    FROM tasks
                    WHERE updated_at > ?1
                    ORDER BY updated_at ASC, id ASC
                    LIMIT ?2
                    "#,
                )
                .map_err(|e| e.to_string())?;
            let mapped = stmt
                .query_map(params![s, page_size + 1], map_task)
                .map_err(|e| e.to_string())?;
            for row in mapped {
                rows.push(row.map_err(|e| e.to_string())?);
            }
        }
        (None, None) => {
            let mut stmt = conn
                .prepare(
                    r#"
                    SELECT id, title, description, completed, created_at, updated_at, version, device_id, deleted_at
                    FROM tasks
                    ORDER BY updated_at ASC, id ASC
                    LIMIT ?1
                    "#,
                )
                .map_err(|e| e.to_string())?;
            let mapped = stmt
                .query_map(params![page_size + 1], map_task)
                .map_err(|e| e.to_string())?;
            for row in mapped {
                rows.push(row.map_err(|e| e.to_string())?);
            }
        }
    }

    let has_more = rows.len() as i64 > page_size;
    if has_more {
        rows.truncate(page_size as usize);
    }
    let next_cursor = rows.last().map(|t| TaskCursor {
        updated_at: t.updated_at.clone(),
        id: t.id.clone(),
    });
    Ok((rows, has_more, next_cursor))
}

pub fn get_pending_sync_count(db: &DbHandle) -> Result<i64, String> {
    let conn = db.lock();
    conn.query_row(
        "SELECT COUNT(*) FROM tasks WHERE is_synced = 0 AND deleted_at IS NULL",
        [],
        |row| row.get(0),
    )
    .map_err(|e| e.to_string())
}

pub fn mark_task_synced(db: &DbHandle, id: &str) -> Result<(), String> {
    let conn = db.lock();
    conn.execute("UPDATE tasks SET is_synced = 1 WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
