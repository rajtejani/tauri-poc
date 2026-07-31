use crate::models::LogEntry;
use parking_lot::Mutex;
use serde_json::Value;
use std::sync::Arc;
use uuid::Uuid;

#[derive(Clone, Default)]
pub struct Logger {
    inner: Arc<Mutex<LoggerInner>>,
}

struct LoggerInner {
    entries: Vec<LogEntry>,
    max_entries: usize,
    push: Option<Arc<dyn Fn(LogEntry) + Send + Sync>>,
}

impl Default for LoggerInner {
    fn default() -> Self {
        Self {
            entries: Vec::new(),
            max_entries: 200,
            push: None,
        }
    }
}

impl Logger {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn on_entry<F>(&self, cb: F)
    where
        F: Fn(LogEntry) + Send + Sync + 'static,
    {
        self.inner.lock().push = Some(Arc::new(cb));
    }

    fn log(&self, level: &str, message: impl Into<String>, meta: Option<Value>) {
        let entry = LogEntry {
            id: Uuid::new_v4().to_string(),
            level: level.to_string(),
            message: message.into(),
            timestamp: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
            meta,
        };
        {
            let mut inner = self.inner.lock();
            inner.entries.push(entry.clone());
            if inner.entries.len() > inner.max_entries {
                let drain = inner.entries.len() - inner.max_entries;
                inner.entries.drain(0..drain);
            }
            if let Some(push) = &inner.push {
                push(entry.clone());
            }
        }
        println!(
            "[{}] [{}] {} {}",
            entry.timestamp,
            level.to_uppercase(),
            entry.message,
            entry
                .meta
                .as_ref()
                .map(|m| m.to_string())
                .unwrap_or_default()
        );
    }

    pub fn info(&self, message: impl Into<String>, meta: Option<Value>) {
        self.log("info", message, meta);
    }

    pub fn warn(&self, message: impl Into<String>, meta: Option<Value>) {
        self.log("warn", message, meta);
    }

    pub fn error(&self, message: impl Into<String>, meta: Option<Value>) {
        self.log("error", message, meta);
    }

    pub fn success(&self, message: impl Into<String>, meta: Option<Value>) {
        self.log("success", message, meta);
    }

    pub fn get_recent(&self, n: usize) -> Vec<LogEntry> {
        let inner = self.inner.lock();
        inner.entries.iter().rev().take(n).cloned().collect()
    }
}
