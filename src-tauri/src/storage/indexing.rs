use std::path::Path;

use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use uuid::Uuid;

use crate::{
    indexing::{
        self,
        walk::{self, Limits, LocalFs, MetadataFs, Snapshot},
        ScanIssue, ScanReport,
    },
    sources::{ScanSource, SourceError},
};

use super::{Storage, StorageError};

pub(super) fn read_report(
    connection: &Connection,
    source_id: &str,
) -> Result<Option<ScanReport>, StorageError> {
    let report = connection
        .query_row(
            "SELECT scan_id, completed_at, files_count, folders_count, total_bytes,
            skipped_count, error_count, partial FROM scan_reports WHERE source_id = ?1",
            [source_id],
            |row| {
                Ok(ScanReport {
                    source_id: source_id.into(),
                    scan_id: row.get(0)?,
                    completed_at: row.get(1)?,
                    files_count: row.get(2)?,
                    folders_count: row.get(3)?,
                    total_bytes: row.get::<_, i64>(4)?.to_string(),
                    skipped_count: row.get(5)?,
                    error_count: row.get(6)?,
                    partial: row.get(7)?,
                    issues: Vec::new(),
                    issues_truncated: false,
                })
            },
        )
        .optional()?;
    if let Some(mut report) = report {
        let mut statement = connection.prepare(
            "SELECT relative_path, code FROM scan_issues WHERE source_id = ?1 ORDER BY ordinal",
        )?;
        report.issues = statement
            .query_map([source_id], |row| {
                Ok(ScanIssue {
                    relative_path: row.get(0)?,
                    code: row.get(1)?,
                })
            })?
            .collect::<rusqlite::Result<_>>()?;
        report.issues_truncated = report.error_count as usize > report.issues.len();
        Ok(Some(report))
    } else {
        Ok(None)
    }
}

fn require_authorized(
    connection: &Connection,
    source_id: &str,
    root: &str,
) -> Result<(), SourceError> {
    let current: Option<(String, bool)> = connection
        .query_row(
            "SELECT root_path, enabled FROM sources WHERE id = ?1",
            [source_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(StorageError::from)
        .map_err(SourceError::database)?;
    match current {
        None => Err(SourceError::new("SOURCE_NOT_FOUND")),
        Some((path, true)) if path == root => Ok(()),
        _ => Err(SourceError::new("SOURCE_NOT_AUTHORIZED")),
    }
}

fn save_snapshot(
    connection: &mut Connection,
    source_id: &str,
    root: &str,
    snapshot: Snapshot,
) -> Result<(), SourceError> {
    let save = |connection: &mut Connection| -> Result<(), StorageError> {
        let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
        // A autorização precisa continuar válida ao publicar o índice.
        let authorized: bool = transaction.query_row(
            "SELECT EXISTS(SELECT 1 FROM sources WHERE id = ?1 AND root_path = ?2 AND enabled = 1)",
            params![source_id, root],
            |row| row.get(0),
        )?;
        if !authorized {
            return Err(StorageError::AuthorizationRevoked);
        }
        let scan_id = Uuid::new_v4().to_string();
        let mut ids: Vec<String> = Vec::with_capacity(snapshot.nodes.len());
        for node in &snapshot.nodes {
            let id = transaction
                .query_row(
                    "SELECT id FROM nodes WHERE source_id = ?1 AND fs_path_key = ?2",
                    params![source_id, node.key],
                    |row| row.get::<_, String>(0),
                )
                .optional()?
                .unwrap_or_else(|| Uuid::new_v4().to_string());
            let parent_id = node.parent.map(|parent| ids[parent].as_str());
            transaction.execute(
                "INSERT INTO nodes (id, kind, origin, title, parent_id, source_id, fs_path,
                    fs_path_key, size_bytes, fs_created_at_ms, fs_modified_at_ms, size_partial, scan_id)
                 VALUES (?1, ?2, 'filesystem', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
                 ON CONFLICT(source_id, fs_path_key) DO UPDATE SET kind = excluded.kind,
                    title = excluded.title, parent_id = excluded.parent_id, fs_path = excluded.fs_path,
                    size_bytes = excluded.size_bytes, fs_created_at_ms = excluded.fs_created_at_ms,
                    fs_modified_at_ms = excluded.fs_modified_at_ms, size_partial = excluded.size_partial,
                    scan_id = excluded.scan_id",
                params![id, if node.folder { "folder" } else { "file" }, node.title,
                    parent_id, source_id, node.path, node.key, node.bytes, node.created_ms,
                    node.modified_ms, node.partial, scan_id],
            )?;
            ids.push(id);
        }
        let bytes = snapshot.nodes.first().map_or(0, |root| root.bytes);
        transaction.execute(
            "INSERT INTO scan_reports (source_id, scan_id, files_count, folders_count, total_bytes,
                 skipped_count, error_count, partial) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(source_id) DO UPDATE SET scan_id = excluded.scan_id,
                 completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), files_count = excluded.files_count,
                 folders_count = excluded.folders_count, total_bytes = excluded.total_bytes,
                 skipped_count = excluded.skipped_count, error_count = excluded.error_count, partial = excluded.partial",
            params![source_id, scan_id, snapshot.files, snapshot.folders, bytes,
                snapshot.skipped, snapshot.errors, snapshot.errors > 0],
        )?;
        transaction.execute("DELETE FROM scan_issues WHERE source_id = ?1", [source_id])?;
        for (ordinal, issue) in snapshot.issues.iter().enumerate() {
            transaction.execute(
                "INSERT INTO scan_issues (source_id, ordinal, relative_path, code) VALUES (?1, ?2, ?3, ?4)",
                params![source_id, ordinal as u32, issue.relative_path, issue.code],
            )?;
        }
        transaction.commit()?;
        Ok(())
    };
    save(connection).map_err(|error| match error {
        StorageError::AuthorizationRevoked => SourceError::new("SOURCE_NOT_AUTHORIZED"),
        other => SourceError::database(other),
    })
}

impl Storage {
    pub(crate) fn index_fixture(&self, source_id: &str) -> Result<ScanSource, SourceError> {
        self.index_fixture_at(
            source_id,
            &indexing::fixture_path(),
            &LocalFs,
            Limits::default(),
        )
    }

    // O caminho nunca é argumento IPC. Testes usam somente suas próprias fixtures temporárias.
    pub(crate) fn index_fixture_at<F: MetadataFs>(
        &self,
        source_id: &str,
        fixture: &Path,
        filesystem: &F,
        limits: Limits,
    ) -> Result<ScanSource, SourceError> {
        let id = Uuid::parse_str(source_id)
            .map_err(|_| SourceError::new("SOURCE_NOT_FOUND"))?
            .to_string();
        let mut database = self.database().map_err(SourceError::database)?;
        let root: String = database
            .connection
            .query_row(
                "SELECT root_path FROM sources WHERE id = ?1",
                [&id],
                |row| row.get(0),
            )
            .optional()
            .map_err(StorageError::from)
            .map_err(SourceError::database)?
            .ok_or_else(|| SourceError::new("SOURCE_NOT_FOUND"))?;
        require_authorized(&database.connection, &id, &root)?;
        if Path::new(&crate::sources::display_path(&root)) != fixture {
            return Err(SourceError::new("FIXTURE_ONLY"));
        }
        walk::validate_root(fixture, &root)?;
        let snapshot = walk::collect(
            fixture,
            filesystem,
            || require_authorized(&database.connection, &id, &root),
            limits,
        )?;
        save_snapshot(&mut database.connection, &id, &root, snapshot)?;
        self.list_sources()
            .map_err(SourceError::database)?
            .into_iter()
            .find(|source| source.id == id)
            .ok_or_else(|| SourceError::new("SOURCE_NOT_FOUND"))
    }
}
