mod migrations;

use std::{
    fmt, fs,
    path::{Path, PathBuf},
    time::Duration,
};

use rusqlite::Connection;

/// Caminho interno resolvido pelo Tauri; nunca recebido do frontend.
#[derive(Clone)]
pub(crate) struct Storage {
    path: Option<PathBuf>,
}

impl Storage {
    pub(crate) fn new(path: Option<PathBuf>) -> Self {
        Self { path }
    }

    /// Cada tentativa reabre o banco; uma falha transitória não fica cacheada.
    pub(crate) fn schema_version(&self) -> Result<u32, StorageError> {
        let path = self.path.as_deref().ok_or(StorageError::PathUnavailable)?;
        Database::open(path)?.schema_version()
    }
}

struct Database {
    connection: Connection,
}

impl Database {
    fn open(path: &Path) -> Result<Self, StorageError> {
        let parent = path
            .parent()
            .filter(|parent| !parent.as_os_str().is_empty())
            .ok_or(StorageError::PathUnavailable)?;
        fs::create_dir_all(parent)?;
        let mut connection = Connection::open(path)?;
        connection.busy_timeout(Duration::from_secs(2))?;
        connection.pragma_update(None, "foreign_keys", true)?;
        let foreign_keys: u32 =
            connection.pragma_query_value(None, "foreign_keys", |row| row.get(0))?;
        if foreign_keys != 1 {
            return Err(StorageError::ForeignKeysDisabled);
        }

        migrations::apply(&mut connection, migrations::MIGRATIONS)?;

        // Não anunciar pronto se o arquivo informar versão 1 mas não contiver o catálogo.
        connection.prepare(
            "SELECT id, root_path, display_name, enabled, created_at FROM sources LIMIT 0",
        )?;
        connection.prepare(
            "SELECT id, kind, origin, title, parent_id, source_id, fs_path, fs_path_key,
                    size_bytes, created_at FROM nodes LIMIT 0",
        )?;

        Ok(Self { connection })
    }

    fn schema_version(&self) -> Result<u32, StorageError> {
        Ok(self
            .connection
            .pragma_query_value(None, "user_version", |row| row.get(0))?)
    }
}

#[derive(Debug)]
pub(crate) enum StorageError {
    Io(std::io::Error),
    Sqlite(rusqlite::Error),
    PathUnavailable,
    ForeignKeysDisabled,
    InvalidVersion,
    InvalidMigrations,
    UnsupportedVersion(u32),
    UnrecognizedDatabase,
}

impl fmt::Display for StorageError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let message = match self {
            Self::Io(_) | Self::Sqlite(_) => "Banco local indisponível",
            Self::PathUnavailable => "Diretório local indisponível",
            Self::ForeignKeysDisabled => "Integridade referencial indisponível",
            Self::InvalidVersion => "Versão de banco incompatível",
            Self::UnsupportedVersion(version) => {
                return write!(formatter, "Versão de banco incompatível: {version}");
            }
            Self::InvalidMigrations => "Sequência de migrações inválida",
            Self::UnrecognizedDatabase => "Banco não reconhecido",
        };
        formatter.write_str(message)
    }
}

impl std::error::Error for StorageError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::Sqlite(error) => Some(error),
            _ => None,
        }
    }
}

impl From<rusqlite::Error> for StorageError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Sqlite(error)
    }
}

impl From<std::io::Error> for StorageError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error)
    }
}

#[cfg(test)]
pub(crate) fn test_directory() -> tempfile::TempDir {
    let base = Path::new(env!("CARGO_MANIFEST_DIR")).join("../.tools/test-data");
    fs::create_dir_all(&base).expect("Diretório de fixtures indisponível");
    tempfile::Builder::new()
        .prefix("mvp-002-")
        .tempdir_in(base)
        .unwrap()
}

#[cfg(test)]
mod tests;
