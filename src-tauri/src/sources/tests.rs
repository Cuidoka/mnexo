use super::*;
use crate::storage::test_directory;

fn setup() -> (tempfile::TempDir, Storage, PathBuf) {
    let temp = test_directory();
    let folder = temp.path().join("Pasta com espaço ç");
    fs::create_dir(&folder).unwrap();
    let storage = Storage::new(Some(temp.path().join("sources.sqlite3")));
    (temp, storage, folder)
}

fn select(selections: &SourceSelections, path: &Path) -> FolderSelection {
    let _lease = selections.begin().unwrap();
    selections.offer(path).unwrap()
}

#[test]
fn t001_selection_requires_confirmation_then_persists_without_scan_or_file_changes() {
    let (temp, storage, folder) = setup();
    let original = b"Conteudo sintetico intocado.";
    fs::write(folder.join("notas.txt"), original).unwrap();
    fs::create_dir(folder.join("subpasta vazia")).unwrap();
    let selections = SourceSelections::default();
    let selected = select(&selections, &folder);
    assert!(storage.list_sources().unwrap().is_empty());
    assert_eq!(
        authorize_selection(&storage, &selections, r"C:\inventado")
            .unwrap_err()
            .code,
        "INVALID_SELECTION"
    );

    let source = authorize_selection(&storage, &selections, &selected.selection_token).unwrap();
    assert!(source.authorized);
    assert_eq!(Uuid::parse_str(&source.id).unwrap().get_version_num(), 4);
    assert_eq!(source.root_path, selected.root_path);
    assert_eq!(source.display_name, "Pasta com espaço ç");
    assert_eq!(
        authorize_selection(&storage, &selections, &selected.selection_token)
            .unwrap_err()
            .code,
        "INVALID_SELECTION"
    );
    let reopened = Storage::new(Some(temp.path().join("sources.sqlite3")));
    let saved = reopened.list_sources().unwrap();
    assert_eq!(saved.len(), 1);
    assert_eq!(saved[0].id, source.id);
    assert!(saved[0].authorized);
    assert_eq!(fs::read(folder.join("notas.txt")).unwrap(), original);
    assert!(folder.join("subpasta vazia").is_dir());
    let database = rusqlite::Connection::open(temp.path().join("sources.sqlite3")).unwrap();
    let nodes: u32 = database
        .query_row("SELECT count(*) FROM nodes", [], |row| row.get(0))
        .unwrap();
    assert_eq!(nodes, 0);
}

#[test]
fn t032_cancel_or_new_dialog_invalidates_the_old_token() {
    let (_temp, storage, folder) = setup();
    let selections = SourceSelections::default();
    let first = select(&selections, &folder);
    selections.cancel().unwrap();
    assert_eq!(
        authorize_selection(&storage, &selections, &first.selection_token)
            .unwrap_err()
            .code,
        "INVALID_SELECTION"
    );
    let second = select(&selections, &folder);
    {
        let _lease = selections.begin().unwrap();
    } // diálogo cancelado, sem resultado
    assert_eq!(
        authorize_selection(&storage, &selections, &second.selection_token)
            .unwrap_err()
            .code,
        "INVALID_SELECTION"
    );
    assert!(storage.list_sources().unwrap().is_empty());
}

#[test]
fn t032_only_one_native_picker_can_be_active() {
    let selections = SourceSelections::default();
    let lease = selections.begin().unwrap();
    assert!(matches!(selections.begin(), Err(error) if error.code == "SELECTION_BUSY"));
    drop(lease);
    assert!(selections.begin().is_ok());
}

#[test]
fn t032_rejects_files_missing_and_relative_paths_and_revalidates_before_grant() {
    let (_temp, storage, folder) = setup();
    let selections = SourceSelections::default();
    let file = folder.join("arquivo.txt");
    fs::write(&file, b"fixture").unwrap();
    for path in [&file, &folder.join("ausente"), &PathBuf::from("relativa")] {
        assert_eq!(selections.offer(path).unwrap_err().code, "INVALID_FOLDER");
    }
    let empty = folder.join("temporaria");
    fs::create_dir(&empty).unwrap();
    let selected = select(&selections, &empty);
    fs::remove_dir(&empty).unwrap(); // somente a pasta vazia criada por este teste
    assert_eq!(
        authorize_selection(&storage, &selections, &selected.selection_token)
            .unwrap_err()
            .code,
        "INVALID_FOLDER"
    );
    assert!(storage.list_sources().unwrap().is_empty());
}

#[cfg(windows)]
#[test]
fn t032_network_paths_are_rejected_before_access() {
    assert_eq!(
        validate_folder(Path::new(r"\\servidor-inexistente\share\pasta"))
            .err()
            .unwrap()
            .code,
        "LOCAL_FOLDER_REQUIRED"
    );
}

#[test]
fn t033_same_canonical_folder_has_one_stable_source_id() {
    let (_temp, storage, folder) = setup();
    let selections = SourceSelections::default();
    let first = select(&selections, &folder);
    let first = authorize_selection(&storage, &selections, &first.selection_token).unwrap();
    let equivalent = folder.join(".");
    let second = select(&selections, &equivalent);
    let second = authorize_selection(&storage, &selections, &second.selection_token).unwrap();
    assert_eq!(first.id, second.id);
    assert_eq!(first.created_at, second.created_at);
    assert_eq!(storage.list_sources().unwrap().len(), 1);
}

#[cfg(windows)]
#[test]
fn t033_windows_case_alias_is_not_duplicated() {
    let (_temp, storage, folder) = setup();
    let selections = SourceSelections::default();
    let first = select(&selections, &folder);
    let first = authorize_selection(&storage, &selections, &first.selection_token).unwrap();
    let upper = PathBuf::from(folder.to_str().unwrap().to_uppercase());
    let second = select(&selections, &upper);
    let second = authorize_selection(&storage, &selections, &second.selection_token).unwrap();
    assert_eq!(first.id, second.id);
    assert_eq!(storage.list_sources().unwrap().len(), 1);
}

#[test]
fn t014_revocation_persists_preserves_files_and_reauthorization_reuses_id() {
    let (temp, storage, folder) = setup();
    fs::write(folder.join("preservar.txt"), b"original").unwrap();
    let selections = SourceSelections::default();
    let selection = select(&selections, &folder);
    let source = authorize_selection(&storage, &selections, &selection.selection_token).unwrap();
    let revoked = storage.revoke_source(&source.id).unwrap().unwrap();
    assert!(!revoked.authorized);
    let reopened = Storage::new(Some(temp.path().join("sources.sqlite3")));
    assert!(!reopened.list_sources().unwrap()[0].authorized);
    assert_eq!(fs::read(folder.join("preservar.txt")).unwrap(), b"original");
    assert!(storage.revoke_source("nao-existe").unwrap().is_none());
    let selected = select(&selections, &folder);
    let reauthorized =
        authorize_selection(&storage, &selections, &selected.selection_token).unwrap();
    assert_eq!(reauthorized.id, source.id);
    assert!(reauthorized.authorized);
}

#[test]
fn t014_revocation_does_not_require_the_folder_to_be_online() {
    let (_temp, storage, folder) = setup();
    let selections = SourceSelections::default();
    let selection = select(&selections, &folder);
    let source = authorize_selection(&storage, &selections, &selection.selection_token).unwrap();
    fs::remove_dir(&folder).unwrap();
    assert!(
        !storage
            .revoke_source(&source.id)
            .unwrap()
            .unwrap()
            .authorized
    );
}

#[test]
fn t032_failed_database_does_not_retain_a_reusable_authorization_token() {
    let (_temp, _storage, folder) = setup();
    let selections = SourceSelections::default();
    let selected = select(&selections, &folder);
    let error = authorize_selection(&Storage::new(None), &selections, &selected.selection_token)
        .unwrap_err();
    assert_eq!(error.code, "DATABASE_UNAVAILABLE");
    assert_eq!(
        selections
            .claim(&selected.selection_token)
            .err()
            .unwrap()
            .code,
        "INVALID_SELECTION"
    );
}

#[test]
fn t034_shared_source_contracts_are_camel_case_and_errors_are_sanitized() {
    let expected: serde_json::Value =
        serde_json::from_str(include_str!("../../../tests/fixtures/scan-source.json")).unwrap();
    let source = ScanSource {
        id: "00000000-0000-4000-8000-000000000001".into(),
        root_path: r"C:\fixture\Documentos com espaço".into(),
        display_name: "Documentos com espaço".into(),
        authorized: true,
        created_at: "2026-11-09T12:00:00.000Z".into(),
    };
    assert_eq!(serde_json::to_value(source).unwrap(), expected);
    let expected: serde_json::Value = serde_json::from_str(include_str!(
        "../../../tests/fixtures/folder-selection.json"
    ))
    .unwrap();
    let selection = FolderSelection {
        selection_token: "00000000-0000-4000-8000-000000000002".into(),
        root_path: r"C:\fixture\Documentos com espaço".into(),
        display_name: "Documentos com espaço".into(),
    };
    assert_eq!(serde_json::to_value(selection).unwrap(), expected);
    let private = std::io::Error::new(std::io::ErrorKind::PermissionDenied, "caminho-privado");
    let public = SourceError::database(crate::storage::StorageError::Io(private));
    assert_eq!(
        serde_json::to_value(public).unwrap(),
        serde_json::json!({"code": "DATABASE_UNAVAILABLE"})
    );
}
