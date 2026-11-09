use rusqlite::params;
use uuid::Uuid;

use super::{Database, Storage, StorageError};
use crate::sources::{display_path, ScanSource, SelectedFolder};

fn source_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ScanSource> {
    let path: String = row.get(1)?;
    Ok(ScanSource {
        id: row.get(0)?,
        root_path: display_path(&path),
        display_name: row.get(2)?,
        authorized: row.get(3)?,
        created_at: row.get(4)?,
    })
}

impl Storage {
    fn database(&self) -> Result<Database, StorageError> {
        Database::open(self.path.as_deref().ok_or(StorageError::PathUnavailable)?)
    }

    pub(crate) fn list_sources(&self) -> Result<Vec<ScanSource>, StorageError> {
        let database = self.database()?;
        let mut statement = database.connection.prepare(
            "SELECT id, root_path, display_name, enabled, created_at FROM sources
             ORDER BY created_at, id",
        )?;
        let sources = statement
            .query_map([], source_row)?
            .collect::<rusqlite::Result<_>>()?;
        Ok(sources)
    }

    pub(crate) fn authorize_folder(
        &self,
        folder: &SelectedFolder,
    ) -> Result<ScanSource, StorageError> {
        let database = self.database()?;
        Ok(database.connection.query_row(
            "INSERT INTO sources (id, root_path, display_name, enabled)
             VALUES (?1, ?2, ?3, 1)
             ON CONFLICT(root_path) DO UPDATE SET enabled = 1, display_name = excluded.display_name
             RETURNING id, root_path, display_name, enabled, created_at",
            params![
                Uuid::new_v4().to_string(),
                folder.storage_path,
                folder.display_name
            ],
            source_row,
        )?)
    }

    pub(crate) fn revoke_source(&self, id: &str) -> Result<Option<ScanSource>, StorageError> {
        use rusqlite::OptionalExtension;
        let database = self.database()?;
        Ok(database
            .connection
            .query_row(
                "UPDATE sources SET enabled = 0 WHERE id = ?1
             RETURNING id, root_path, display_name, enabled, created_at",
                [id],
                source_row,
            )
            .optional()?)
    }
}
