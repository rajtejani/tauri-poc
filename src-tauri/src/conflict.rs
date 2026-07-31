use crate::models::Task;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConflictWinner {
    Local,
    Remote,
}

/// Last-Write-Wins — mirrors the Electron/mobile conflictResolver.
pub fn resolve_conflict(local: &Task, remote: &Task) -> ConflictWinner {
    if remote.version != local.version {
        return if remote.version > local.version {
            ConflictWinner::Remote
        } else {
            ConflictWinner::Local
        };
    }
    if remote.updated_at != local.updated_at {
        return if remote.updated_at > local.updated_at {
            ConflictWinner::Remote
        } else {
            ConflictWinner::Local
        };
    }
    if remote.device_id >= local.device_id {
        ConflictWinner::Remote
    } else {
        ConflictWinner::Local
    }
}
