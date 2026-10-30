use rusqlite::{Connection, TransactionBehavior};

use super::StorageError;

pub(super) const APPLICATION_ID: i32 = 0x4d4e4558; // MNEX

pub(super) struct Migration {
    pub version: u32,
    pub sql: &'static str,
}

pub(super) const MIGRATIONS: &[Migration] = &[Migration {
    version: 1,
    sql: include_str!("../../migrations/001_initial.sql"),
}];

/// Versão e DDL são confirmados na mesma transação; falha implica rollback.
pub(super) fn apply(
    connection: &mut Connection,
    migrations: &[Migration],
) -> Result<u32, StorageError> {
    for (index, migration) in migrations.iter().enumerate() {
        if usize::try_from(migration.version).ok() != Some(index + 1) {
            return Err(StorageError::InvalidMigrations);
        }
    }

    // A versão é lida depois de obter o lock: duas aberturas iniciais não migram juntas.
    let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let raw_version: i64 =
        transaction.pragma_query_value(None, "user_version", |row| row.get(0))?;
    let mut version = u32::try_from(raw_version).map_err(|_| StorageError::InvalidVersion)?;
    let latest = migrations.last().map_or(0, |migration| migration.version);

    if version > latest {
        return Err(StorageError::UnsupportedVersion(version));
    }

    let application_id: i32 =
        transaction.pragma_query_value(None, "application_id", |row| row.get(0))?;
    if (version > 0 && application_id != APPLICATION_ID)
        || (version == 0 && application_id != 0 && application_id != APPLICATION_ID)
    {
        return Err(StorageError::UnrecognizedDatabase);
    }

    if version == 0 {
        let objects: u32 = transaction.query_row(
            "SELECT count(*) FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*'",
            [],
            |row| row.get(0),
        )?;
        if objects != 0 {
            return Err(StorageError::UnrecognizedDatabase);
        }
    }

    for migration in migrations
        .iter()
        .filter(|migration| migration.version > version)
    {
        transaction.execute_batch(migration.sql)?;
        transaction.pragma_update(None, "user_version", migration.version)?;
    }

    version = latest;
    if application_id == 0 {
        transaction.pragma_update(None, "application_id", APPLICATION_ID)?;
    }
    transaction.commit()?;
    Ok(version)
}
