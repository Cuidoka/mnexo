use std::{
    fs, io,
    path::{Path, PathBuf},
    time::Duration,
};

use rusqlite::Connection;

use super::{
    walk::{self, Limits, LocalFs, MetadataFs},
    ScanIssue, ScanReport,
};
use crate::{
    sources::{authorize_selection, SourceSelections},
    storage::{test_directory, Storage},
};

fn setup() -> (tempfile::TempDir, Storage, PathBuf, String) {
    let temp = test_directory();
    let root = temp.path().join("Fixture ç com espaço");
    fs::create_dir_all(root.join("Coleção ç/Vazia")).unwrap();
    fs::write(root.join("raiz.txt"), b"1234567").unwrap();
    fs::write(root.join("Coleção ç/áudio.txt"), b"abc").unwrap();
    fs::write(root.join("Coleção ç/zero.bin"), b"").unwrap();
    let root = PathBuf::from(crate::sources::display_path(
        fs::canonicalize(root).unwrap().to_str().unwrap(),
    ));
    let storage = Storage::new(Some(temp.path().join("index.sqlite3")));
    let selections = SourceSelections::default();
    let preview = selections.offer(&root).unwrap();
    let token = serde_json::to_value(preview).unwrap()["selectionToken"]
        .as_str()
        .unwrap()
        .to_owned();
    let source = authorize_selection(&storage, &selections, &token).unwrap();
    (temp, storage, root, source.id)
}

fn report(storage: &Storage, id: &str, root: &Path) -> ScanReport {
    storage
        .index_fixture_at(id, root, &LocalFs, Limits::default())
        .unwrap()
        .last_scan
        .unwrap()
}

#[test]
fn t002_t003_t004_t008_metadata_hierarchy_totals_empty_unicode_and_reopen_without_source_writes() {
    let (temp, storage, root, id) = setup();
    let before = fs::metadata(root.join("raiz.txt"))
        .unwrap()
        .modified()
        .unwrap();
    let result = report(&storage, &id, &root);
    assert_eq!(
        (
            result.files_count,
            result.folders_count,
            result.total_bytes.as_str()
        ),
        (3, 3, "10")
    );
    assert!(!result.partial);
    assert!(result.issues.is_empty());
    let connection = Connection::open(temp.path().join("index.sqlite3")).unwrap();
    let (title, parent, bytes, created, modified): (String, String, i64, String, String) =
        connection
            .query_row(
                "SELECT n.title, p.title, n.size_bytes, n.fs_created_at_ms, n.fs_modified_at_ms
         FROM nodes n JOIN nodes p ON n.parent_id = p.id WHERE n.title = 'áudio.txt'",
                [],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                    ))
                },
            )
            .unwrap();
    assert_eq!(
        (title.as_str(), parent.as_str(), bytes),
        ("áudio.txt", "Coleção ç", 3)
    );
    assert!(created.parse::<i128>().is_ok() && modified.parse::<i128>().is_ok());
    let empty: (i64, bool) = connection
        .query_row(
            "SELECT size_bytes, size_partial FROM nodes WHERE title = 'Vazia'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert_eq!(empty, (0, false));
    let zero: i64 = connection
        .query_row(
            "SELECT size_bytes FROM nodes WHERE title = 'zero.bin'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(zero, 0);
    let integrity: String = connection
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .unwrap();
    assert_eq!(integrity, "ok");
    assert_eq!(
        connection
            .query_row("SELECT count(*) FROM pragma_foreign_key_check", [], |row| {
                row.get::<_, u32>(0)
            })
            .unwrap(),
        0
    );
    let reopened = Storage::new(Some(temp.path().join("index.sqlite3")));
    let saved = reopened
        .list_sources()
        .unwrap()
        .remove(0)
        .last_scan
        .unwrap();
    assert_eq!(saved.scan_id, result.scan_id);
    assert_eq!(saved.total_bytes, "10");
    assert_eq!(fs::read(root.join("raiz.txt")).unwrap(), b"1234567");
    assert_eq!(fs::read(root.join("Coleção ç/áudio.txt")).unwrap(), b"abc");
    assert_eq!(
        fs::metadata(root.join("raiz.txt"))
            .unwrap()
            .modified()
            .unwrap(),
        before
    );
}

#[test]
fn t036_reindex_preserves_ids_and_marks_current_snapshot_without_deleting_old_nodes() {
    let (temp, storage, root, id) = setup();
    let first = report(&storage, &id, &root);
    let connection = Connection::open(temp.path().join("index.sqlite3")).unwrap();
    let root_id: String = connection
        .query_row("SELECT id FROM nodes WHERE fs_path_key = '.'", [], |row| {
            row.get(0)
        })
        .unwrap();
    fs::remove_file(root.join("raiz.txt")).unwrap(); // arquivo criado exclusivamente por setup()
    let next = report(&storage, &id, &root);
    assert_ne!(first.scan_id, next.scan_id);
    assert_eq!((next.files_count, next.total_bytes.as_str()), (2, "3"));
    assert_eq!(
        connection
            .query_row("SELECT id FROM nodes WHERE fs_path_key = '.'", [], |row| {
                row.get::<_, String>(0)
            })
            .unwrap(),
        root_id
    );
    assert_eq!(connection.query_row("SELECT count(*) FROM nodes n JOIN scan_reports r ON n.source_id=r.source_id AND n.scan_id=r.scan_id", [], |row| row.get::<_, u32>(0)).unwrap(), 5);
    assert_eq!(
        connection
            .query_row("SELECT count(*) FROM nodes", [], |row| row.get::<_, u32>(0))
            .unwrap(),
        6
    );
}

struct FaultFs {
    blocked: PathBuf,
    iterator_error: bool,
}
impl MetadataFs for FaultFs {
    fn metadata(&self, path: &Path) -> io::Result<fs::Metadata> {
        if path.file_name().is_some_and(|name| name == "raiz.txt") && self.iterator_error {
            Err(io::Error::new(io::ErrorKind::NotFound, "detalhe-privado"))
        } else {
            LocalFs.metadata(path)
        }
    }
    fn entries(&self, path: &Path) -> io::Result<Box<dyn Iterator<Item = io::Result<PathBuf>>>> {
        if path == self.blocked {
            if self.iterator_error {
                return Ok(Box::new(std::iter::once(Err(io::Error::new(
                    io::ErrorKind::PermissionDenied,
                    "detalhe-privado",
                )))));
            }
            return Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "detalhe-privado",
            ));
        }
        LocalFs.entries(path)
    }
}

#[test]
fn t005_unreadable_directory_is_partial_and_does_not_abort_other_entries() {
    let (temp, storage, root, id) = setup();
    let faulty = FaultFs {
        blocked: root.join("Coleção ç"),
        iterator_error: false,
    };
    let result = storage
        .index_fixture_at(&id, &root, &faulty, Limits::default())
        .unwrap()
        .last_scan
        .unwrap();
    assert_eq!(
        (
            result.files_count,
            result.folders_count,
            result.total_bytes.as_str()
        ),
        (1, 2, "7")
    );
    assert!(result.partial);
    assert_eq!(result.issues[0].code, "DIRECTORY_UNREADABLE");
    assert_eq!(result.issues[0].relative_path, "Coleção ç");
    assert!(!serde_json::to_string(&result)
        .unwrap()
        .contains("detalhe-privado"));
    let connection = Connection::open(temp.path().join("index.sqlite3")).unwrap();
    assert_eq!(
        connection
            .query_row(
                "SELECT count(*) FROM nodes WHERE kind='folder' AND size_partial=1",
                [],
                |row| row.get::<_, u32>(0)
            )
            .unwrap(),
        2
    );
    let saved = storage.list_sources().unwrap().remove(0).last_scan.unwrap();
    assert_eq!(saved.issues[0].code, "DIRECTORY_UNREADABLE");
}

#[test]
fn t005_metadata_and_iterator_errors_are_reported_without_internal_details() {
    let (_temp, storage, root, id) = setup();
    let faulty = FaultFs {
        blocked: root.join("Coleção ç"),
        iterator_error: true,
    };
    let result = storage
        .index_fixture_at(&id, &root, &faulty, Limits::default())
        .unwrap()
        .last_scan
        .unwrap();
    assert_eq!(result.error_count, 2);
    assert_eq!(result.skipped_count, 1);
    assert!(result
        .issues
        .iter()
        .any(|issue| issue.code == "ENTRY_UNREADABLE"));
    assert!(result
        .issues
        .iter()
        .any(|issue| issue.code == "METADATA_UNAVAILABLE"));
}

#[test]
fn t037_unauthorized_unknown_and_nonfixture_sources_cannot_start_scanning() {
    let (_temp, storage, root, id) = setup();
    assert_eq!(storage.index_fixture(&id).unwrap_err().code, "FIXTURE_ONLY");
    assert_eq!(
        storage.index_fixture("inventado").unwrap_err().code,
        "SOURCE_NOT_FOUND"
    );
    storage.revoke_source(&id).unwrap();
    assert_eq!(
        storage
            .index_fixture_at(&id, &root, &LocalFs, Limits::default())
            .unwrap_err()
            .code,
        "SOURCE_NOT_AUTHORIZED"
    );
    assert!(storage.list_sources().unwrap()[0].last_scan.is_none());
}

struct RevokeFs<'a> {
    storage: &'a Storage,
    id: &'a str,
}
impl MetadataFs for RevokeFs<'_> {
    fn metadata(&self, path: &Path) -> io::Result<fs::Metadata> {
        LocalFs.metadata(path)
    }
    fn entries(&self, path: &Path) -> io::Result<Box<dyn Iterator<Item = io::Result<PathBuf>>>> {
        self.storage.revoke_source(self.id).unwrap();
        LocalFs.entries(path)
    }
}

#[test]
fn t014_t037_revocation_during_scan_preserves_previous_snapshot() {
    let (_temp, storage, root, id) = setup();
    let first = report(&storage, &id, &root);
    let filesystem = RevokeFs {
        storage: &storage,
        id: &id,
    };
    assert_eq!(
        storage
            .index_fixture_at(&id, &root, &filesystem, Limits::default())
            .unwrap_err()
            .code,
        "SOURCE_NOT_AUTHORIZED"
    );
    let saved = storage.list_sources().unwrap().remove(0);
    assert!(!saved.authorized);
    assert_eq!(saved.last_scan.unwrap().scan_id, first.scan_id);
}

#[test]
fn t029_t036_publication_failure_rolls_back_nodes_and_report_together() {
    let (temp, storage, root, id) = setup();
    let first = report(&storage, &id, &root);
    let connection = Connection::open(temp.path().join("index.sqlite3")).unwrap();
    connection.execute_batch("CREATE TRIGGER reject_report BEFORE UPDATE ON scan_reports BEGIN SELECT RAISE(ABORT, 'falha sintetica'); END;").unwrap();
    fs::write(root.join("novo.txt"), b"novo").unwrap();
    assert_eq!(
        storage
            .index_fixture_at(&id, &root, &LocalFs, Limits::default())
            .unwrap_err()
            .code,
        "DATABASE_UNAVAILABLE"
    );
    assert_eq!(
        storage
            .list_sources()
            .unwrap()
            .remove(0)
            .last_scan
            .unwrap()
            .scan_id,
        first.scan_id
    );
    assert_eq!(
        connection
            .query_row(
                "SELECT count(*) FROM nodes WHERE title='novo.txt'",
                [],
                |row| row.get::<_, u32>(0)
            )
            .unwrap(),
        0
    );
}

#[test]
fn t038_quotas_exclusions_and_bounded_error_sample_make_partial_reports() {
    let (_temp, storage, root, id) = setup();
    fs::create_dir(root.join("node_modules")).unwrap();
    fs::write(root.join("node_modules/never.txt"), b"ignorar").unwrap();
    for index in 0..110 {
        fs::write(root.join(format!(".segredo-{index}")), b"nao ler").unwrap();
    }
    let result = report(&storage, &id, &root);
    assert_eq!(
        (
            result.skipped_count,
            result.error_count,
            result.issues.len()
        ),
        (111, 111, 100)
    );
    assert!(result.issues_truncated && result.partial);
    assert_eq!(result.total_bytes, "10");
    let limited = storage
        .index_fixture_at(
            &id,
            &root,
            &LocalFs,
            Limits {
                entries: 2,
                ..Limits::default()
            },
        )
        .unwrap()
        .last_scan
        .unwrap();
    assert!(limited.partial && limited.files_count + limited.folders_count <= 2);
    assert!(limited
        .issues
        .iter()
        .any(|issue| issue.code == "SCAN_LIMIT"));
    let deep = storage
        .index_fixture_at(
            &id,
            &root,
            &LocalFs,
            Limits {
                depth: 0,
                ..Limits::default()
            },
        )
        .unwrap()
        .last_scan
        .unwrap();
    assert_eq!(deep.issues[0].code, "DEPTH_LIMIT");
    let timed = walk::collect(
        &root,
        &LocalFs,
        || Ok(()),
        Limits {
            duration: Duration::ZERO,
            ..Limits::default()
        },
    )
    .unwrap();
    assert!(timed.nodes.is_empty());
    assert_eq!(timed.issues[0].code, "SCAN_LIMIT");
}

#[cfg(windows)]
#[test]
fn t006_real_junctions_to_parent_and_external_fixture_are_not_followed() {
    let (temp, storage, root, id) = setup();
    let outside = temp.path().join("fora");
    fs::create_dir(&outside).unwrap();
    let outside = PathBuf::from(crate::sources::display_path(
        fs::canonicalize(outside).unwrap().to_str().unwrap(),
    ));
    fs::write(outside.join("fora.txt"), b"fora do escopo").unwrap();
    for (name, target) in [("loop", &root), ("externo", &outside)] {
        let link = root.join(name);
        let output = std::process::Command::new("cmd")
            .args(["/c", "mklink", "/J"])
            .arg(&link)
            .arg(target)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
    }
    let result = report(&storage, &id, &root);
    assert_eq!(
        (result.total_bytes.as_str(), result.skipped_count),
        ("10", 2)
    );
    assert_eq!(
        result
            .issues
            .iter()
            .filter(|issue| issue.code == "LINK_SKIPPED")
            .count(),
        2
    );
    assert!(walk::validate_root(&root.join("externo"), outside.to_str().unwrap()).is_err());
    // Remover somente as junções criadas neste teste, sem recursão no destino.
    fs::remove_dir(root.join("loop")).unwrap();
    fs::remove_dir(root.join("externo")).unwrap();
    assert!(outside.join("fora.txt").is_file());
}

#[test]
fn t039_report_contract_preserves_decimal_bytes_and_safe_issue_codes() {
    let expected: serde_json::Value =
        serde_json::from_str(include_str!("../../../tests/fixtures/scan-report.json")).unwrap();
    let actual = ScanReport {
        source_id: "00000000-0000-4000-8000-000000000001".into(),
        scan_id: "00000000-0000-4000-8000-000000000003".into(),
        completed_at: "2026-11-09T15:00:00.000Z".into(),
        files_count: 2,
        folders_count: 3,
        total_bytes: "9007199254740993".into(),
        skipped_count: 1,
        error_count: 1,
        partial: true,
        issues: vec![ScanIssue {
            relative_path: "atalho".into(),
            code: "LINK_SKIPPED".into(),
        }],
        issues_truncated: false,
    };
    assert_eq!(serde_json::to_value(actual).unwrap(), expected);
}
