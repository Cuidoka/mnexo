use std::{
    sync::{Arc, Barrier},
    thread,
};

use rusqlite::{params, Connection};

use super::{
    migrations::{self, Migration},
    test_directory, Database, Storage, StorageError,
};

const SOURCE_ID: &str = "00000000-0000-4000-8000-000000000001";
const ROOT_ID: &str = "00000000-0000-4000-8000-000000000002";
const FILE_ID: &str = "00000000-0000-4000-8000-000000000003";

fn insert_fixture(connection: &Connection) {
    connection
        .execute(
            "INSERT INTO sources (id, root_path, display_name) VALUES (?1, ?2, ?3)",
            params![SOURCE_ID, r"C:\fixture\Documentos com espaço", "Coleção ç"],
        )
        .unwrap();
    connection
        .execute(
            "INSERT INTO nodes (id, kind, origin, title, source_id, fs_path, fs_path_key)
         VALUES (?1, 'folder', 'filesystem', 'Pasta vazia ç', ?2, ?3, ?4)",
            params![
                ROOT_ID,
                SOURCE_ID,
                r"C:\fixture\Documentos com espaço",
                "fixture-root"
            ],
        )
        .unwrap();
    connection
        .execute(
            "INSERT INTO nodes (id, kind, origin, title, parent_id, source_id,
                            fs_path, fs_path_key, size_bytes)
         VALUES (?1, 'file', 'filesystem', 'áudio de teste.wav', ?2, ?3, ?4, ?5, ?6)",
            params![
                FILE_ID,
                ROOT_ID,
                SOURCE_ID,
                r"C:\fixture\Documentos com espaço\áudio de teste.wav",
                "fixture-file",
                9_007_199_254_740_993_i64
            ],
        )
        .unwrap();
}

fn assert_integrity(connection: &Connection) {
    let integrity: String = connection
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .unwrap();
    assert_eq!(integrity, "ok");
    let violations: u32 = connection
        .query_row("SELECT count(*) FROM pragma_foreign_key_check", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(violations, 0);
}

fn assert_foreign_key_error(result: rusqlite::Result<usize>) {
    assert!(
        matches!(result,
            Err(rusqlite::Error::SqliteFailure(error, _))
            if error.extended_code == rusqlite::ffi::SQLITE_CONSTRAINT_FOREIGNKEY
        ),
        "Erro observado: {result:?}"
    );
}

#[test]
fn t028_clean_database_migrates_without_inserting_or_authorizing_sources() {
    let directory = test_directory();
    let database = Database::open(&directory.path().join("clean.sqlite3")).unwrap();
    assert_eq!(database.schema_version().unwrap(), 1);
    let connection = &database.connection;
    for table in ["sources", "nodes"] {
        let count: u32 = connection
            .query_row(&format!("SELECT count(*) FROM {table}"), [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 0);
    }
    let foreign_keys: u32 = connection
        .pragma_query_value(None, "foreign_keys", |row| row.get(0))
        .unwrap();
    assert_eq!(foreign_keys, 1);
    assert_integrity(connection);
}

#[test]
fn t028_reopen_preserves_unicode_hierarchy_and_integer_precision() {
    let directory = test_directory();
    let path = directory.path().join("persistência com espaço.sqlite3");
    let database = Database::open(&path).unwrap();
    insert_fixture(&database.connection);
    drop(database);

    // Duas reaberturas exercitam migração idempotente e a configuração por conexão.
    for _ in 0..2 {
        let database = Database::open(&path).unwrap();
        let connection = &database.connection;
        assert_eq!(database.schema_version().unwrap(), 1);
        let (title, parent_id, size): (String, String, i64) = connection
            .query_row(
                "SELECT title, parent_id, size_bytes FROM nodes WHERE id = ?1",
                [FILE_ID],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(title, "áudio de teste.wav");
        assert_eq!(parent_id, ROOT_ID);
        assert_eq!(size, 9_007_199_254_740_993_i64);
        let enabled: u32 = connection
            .query_row(
                "SELECT enabled FROM sources WHERE id = ?1",
                [SOURCE_ID],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(enabled, 0);
        // SQLite implementa ON DELETE RESTRICT com o código estendido TRIGGER (1811).
        let deletion = connection.execute("DELETE FROM sources WHERE id = ?1", [SOURCE_ID]);
        assert!(
            matches!(deletion,
                Err(rusqlite::Error::SqliteFailure(error, _))
                if error.extended_code == rusqlite::ffi::SQLITE_CONSTRAINT_TRIGGER
            ),
            "Exclusão deveria ser restringida: {deletion:?}"
        );
        let foreign_keys: u32 = connection
            .pragma_query_value(None, "foreign_keys", |row| row.get(0))
            .unwrap();
        assert_eq!(foreign_keys, 1);
        assert_integrity(connection);
    }
}

#[test]
fn t028_foreign_keys_reject_missing_source_and_parent() {
    let directory = test_directory();
    let database = Database::open(&directory.path().join("foreign-keys.sqlite3")).unwrap();
    let connection = &database.connection;
    assert_foreign_key_error(connection.execute(
        "INSERT INTO nodes (id, kind, origin, title, source_id, fs_path, fs_path_key)
         VALUES ('orphan', 'folder', 'filesystem', 'Órfão', 'missing', 'fixture', 'fixture')",
        [],
    ));
    assert_foreign_key_error(connection.execute(
        "INSERT INTO nodes (id, kind, origin, title, parent_id)
         VALUES ('idea', 'idea', 'personal', 'Ideia sintética', 'missing')",
        [],
    ));
    assert_integrity(connection);
}

#[test]
fn t028_domain_constraints_reject_invalid_origins_sizes_and_duplicate_paths() {
    let directory = test_directory();
    let database = Database::open(&directory.path().join("constraints.sqlite3")).unwrap();
    let connection = &database.connection;
    insert_fixture(connection);
    assert!(connection
        .execute(
            "INSERT INTO nodes (id, kind, origin, title)
         VALUES ('invalid', 'file', 'personal', 'Tipo inválido')",
            [],
        )
        .is_err());
    assert!(connection
        .execute("UPDATE nodes SET size_bytes = -1 WHERE id = ?1", [FILE_ID])
        .is_err());
    assert!(connection
        .execute(
            "UPDATE nodes SET fs_path_key = 'fixture-root' WHERE id = ?1",
            [FILE_ID]
        )
        .is_err());
    assert!(connection
        .execute("UPDATE nodes SET parent_id = id WHERE id = ?1", [ROOT_ID])
        .is_err());
    assert_integrity(connection);
}

#[test]
fn t029_failed_upgrade_rolls_back_ddl_data_and_schema_version() {
    let directory = test_directory();
    let mut database = Database::open(&directory.path().join("rollback.sqlite3")).unwrap();
    insert_fixture(&database.connection);
    let attempted = [
        Migration {
            version: 1,
            sql: migrations::MIGRATIONS[0].sql,
        },
        Migration {
            version: 2,
            sql: "CREATE TABLE rollback_probe (id INTEGER PRIMARY KEY);
             UPDATE sources SET display_name = 'Alteração incompleta';
             INSERT INTO table_that_does_not_exist VALUES (1);",
        },
    ];
    assert!(migrations::apply(&mut database.connection, &attempted).is_err());
    assert_eq!(database.schema_version().unwrap(), 1);
    let name: String = database
        .connection
        .query_row(
            "SELECT display_name FROM sources WHERE id = ?1",
            [SOURCE_ID],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(name, "Coleção ç");
    let probe: u32 = database
        .connection
        .query_row(
            "SELECT count(*) FROM sqlite_schema WHERE name = 'rollback_probe'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(probe, 0);
    assert_integrity(&database.connection);
}

#[test]
fn t029_failed_initial_migration_does_not_leave_partial_schema() {
    let directory = test_directory();
    let mut connection =
        Connection::open(directory.path().join("initial-failure.sqlite3")).unwrap();
    let attempted = [
        Migration {
            version: 1,
            sql: migrations::MIGRATIONS[0].sql,
        },
        Migration {
            version: 2,
            sql: "INVALID SQL;",
        },
    ];
    assert!(migrations::apply(&mut connection, &attempted).is_err());
    let version: u32 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .unwrap();
    assert_eq!(version, 0);
    let objects: u32 = connection
        .query_row(
            "SELECT count(*) FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(objects, 0);
}

#[test]
fn t029_newer_database_is_rejected_without_downgrading_or_changing_data() {
    let directory = test_directory();
    let path = directory.path().join("future.sqlite3");
    let database = Database::open(&path).unwrap();
    insert_fixture(&database.connection);
    database
        .connection
        .pragma_update(None, "user_version", 99)
        .unwrap();
    drop(database);
    assert!(matches!(
        Database::open(&path),
        Err(StorageError::UnsupportedVersion(99))
    ));
    let connection = Connection::open(&path).unwrap();
    let version: u32 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .unwrap();
    assert_eq!(version, 99);
    let count: u32 = connection
        .query_row("SELECT count(*) FROM nodes", [], |row| row.get(0))
        .unwrap();
    assert_eq!(count, 2);
}

#[test]
fn t029_unrecognized_database_is_preserved() {
    let directory = test_directory();
    let path = directory.path().join("unrecognized.sqlite3");
    let connection = Connection::open(&path).unwrap();
    connection.execute_batch("CREATE TABLE sqliteXfixture_notes (body TEXT); INSERT INTO sqliteXfixture_notes VALUES ('Preservar');").unwrap();
    drop(connection);
    assert!(matches!(
        Database::open(&path),
        Err(StorageError::UnrecognizedDatabase)
    ));
    let connection = Connection::open(&path).unwrap();
    let body: String = connection
        .query_row("SELECT body FROM sqliteXfixture_notes", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(body, "Preservar");
    let version: u32 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .unwrap();
    assert_eq!(version, 0);
}

#[test]
fn t029_invalid_file_is_not_replaced() {
    let directory = test_directory();
    let path = directory.path().join("invalid.sqlite3");
    let content = b"Fixture sintetica que nao e um banco SQLite.";
    std::fs::write(&path, content).unwrap();
    assert!(Database::open(&path).is_err());
    assert_eq!(std::fs::read(&path).unwrap(), content);
}

#[test]
fn t029_claimed_schema_without_tables_is_not_reported_ready() {
    let directory = test_directory();
    let path = directory.path().join("missing-tables.sqlite3");
    let connection = Connection::open(&path).unwrap();
    connection.pragma_update(None, "user_version", 1).unwrap();
    connection
        .pragma_update(None, "application_id", migrations::APPLICATION_ID)
        .unwrap();
    drop(connection);
    assert!(Database::open(&path).is_err());
}

#[test]
fn t029_database_with_same_version_and_columns_but_no_application_id_is_rejected() {
    let directory = test_directory();
    let path = directory.path().join("foreign-application.sqlite3");
    let connection = Connection::open(&path).unwrap();
    connection
        .execute_batch(migrations::MIGRATIONS[0].sql)
        .unwrap();
    connection.pragma_update(None, "user_version", 1).unwrap();
    drop(connection);
    assert!(matches!(
        Database::open(&path),
        Err(StorageError::UnrecognizedDatabase)
    ));
    let connection = Connection::open(path).unwrap();
    let application_id: i32 = connection
        .pragma_query_value(None, "application_id", |row| row.get(0))
        .unwrap();
    assert_eq!(application_id, 0);
}

#[test]
fn t028_concurrent_first_open_applies_migration_once() {
    let directory = test_directory();
    let path = directory.path().join("concurrent.sqlite3");
    let barrier = Arc::new(Barrier::new(2));
    let workers: Vec<_> = (0..2)
        .map(|_| {
            let path = path.clone();
            let barrier = Arc::clone(&barrier);
            thread::spawn(move || {
                barrier.wait();
                Storage::new(Some(path)).schema_version().unwrap()
            })
        })
        .collect();
    for worker in workers {
        assert_eq!(worker.join().unwrap(), 1);
    }
    assert_integrity(&Database::open(&path).unwrap().connection);
}

#[test]
fn t029_locked_database_can_be_retried_after_the_lock_is_released() {
    let directory = test_directory();
    let path = directory.path().join("busy.sqlite3");
    let storage = Storage::new(Some(path.clone()));
    assert_eq!(storage.schema_version().unwrap(), 1);
    let connection = Connection::open(&path).unwrap();
    connection.execute_batch("BEGIN EXCLUSIVE;").unwrap();
    assert!(storage.schema_version().is_err());
    connection.execute_batch("ROLLBACK;").unwrap();
    assert_eq!(storage.schema_version().unwrap(), 1);
}

#[test]
fn t030_bundled_fts5_queries_updates_deletes_and_persists_synthetic_text() {
    let directory = test_directory();
    let path = directory.path().join("fts.sqlite3");
    let database = Database::open(&path).unwrap();
    database
        .connection
        .execute_batch(
            "CREATE VIRTUAL TABLE fixture_knowledge_fts USING fts5(title, body_md,
            tokenize = 'unicode61 remove_diacritics 2');",
        )
        .unwrap();
    database
        .connection
        .execute(
            "INSERT INTO fixture_knowledge_fts (title, body_md) VALUES (?1, ?2)",
            params![
                "Álbum de memórias",
                "Ideia sintética com áudio e acentuação."
            ],
        )
        .unwrap();
    drop(database);

    let database = Database::open(&path).unwrap();
    let connection = &database.connection;
    let hits =
        |query: &str| -> u32 {
            connection.query_row(
            "SELECT count(*) FROM fixture_knowledge_fts WHERE fixture_knowledge_fts MATCH ?1",
            [query], |row| row.get(0),
        ).unwrap()
        };
    assert_eq!(hits("memorias"), 1);
    assert_eq!(hits("acentuacao"), 1);
    connection
        .execute(
            "UPDATE fixture_knowledge_fts SET title = ?1, body_md = ?2 WHERE rowid = 1",
            params!["Projeto orbital", "Outro texto sintético."],
        )
        .unwrap();
    assert_eq!(hits("memorias"), 0);
    assert_eq!(hits("orbital"), 1);
    connection
        .execute("DELETE FROM fixture_knowledge_fts WHERE rowid = 1", [])
        .unwrap();
    assert_eq!(hits("orbital"), 0);
    connection
        .execute_batch(
            "INSERT INTO fixture_knowledge_fts(fixture_knowledge_fts) VALUES ('integrity-check');",
        )
        .unwrap();
    assert_integrity(connection);
}
