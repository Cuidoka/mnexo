use std::{fs, path::PathBuf};

use rusqlite::{params, Connection};
use uuid::Uuid;

use super::super::{test_directory, Storage};
use crate::{
    indexing::walk::{Limits, LocalFs},
    sources::{authorize_selection, display_path, SourceSelections},
};

struct Fixture {
    _temp: tempfile::TempDir,
    storage: Storage,
    root: PathBuf,
    database: PathBuf,
    source: String,
    scan: String,
}

fn prepare() -> Fixture {
    let temp = test_directory();
    let root = temp.path().join("Fixture ç");
    fs::create_dir_all(root.join("Coleção ç/Vazia")).unwrap();
    fs::write(root.join("raiz.txt"), b"1234567").unwrap();
    fs::write(root.join("Coleção ç/áudio.txt"), b"abc").unwrap();
    fs::write(root.join("Coleção ç/zero.bin"), b"").unwrap();
    let root = PathBuf::from(display_path(
        fs::canonicalize(root).unwrap().to_str().unwrap(),
    ));
    let database = temp.path().join("catalog.sqlite3");
    let storage = Storage::new(Some(database.clone()));
    let selections = SourceSelections::default();
    let preview = serde_json::to_value(selections.offer(&root).unwrap()).unwrap();
    let source = authorize_selection(
        &storage,
        &selections,
        preview["selectionToken"].as_str().unwrap(),
    )
    .unwrap();
    let report = storage
        .index_fixture_at(&source.id, &root, &LocalFs, Limits::default())
        .unwrap()
        .last_scan
        .unwrap();
    Fixture {
        _temp: temp,
        storage,
        root,
        database,
        source: source.id,
        scan: report.scan_id,
    }
}

fn reindex(f: &mut Fixture) {
    f.scan = f
        .storage
        .index_fixture_at(&f.source, &f.root, &LocalFs, Limits::default())
        .unwrap()
        .last_scan
        .unwrap()
        .scan_id;
}

#[test]
fn t003_t050_scene_uses_real_saved_nodes_without_changing_database_or_source() {
    let mut f = prepare();
    for index in 0..9 {
        fs::write(f.root.join(format!("cena-{index}.txt")), b"fixture").unwrap();
    }
    reindex(&mut f);
    let before = fs::read(&f.database).unwrap();
    let first = f.storage.scene_projection(&f.source, &f.scan).unwrap();
    assert_eq!(first.nodes.len() + 1, 15);
    assert!(!first.truncated);
    assert_eq!((first.node_limit, first.depth_limit), (100, 3));
    let mut parents = std::collections::HashSet::from([first.root.node.id.clone()]);
    for item in &first.nodes {
        assert!(parents.contains(item.parent_id.as_ref().unwrap()));
        assert!(parents.insert(item.id.clone()));
        let real = f.storage.node_detail(&f.source, &f.scan, &item.id).unwrap();
        assert_eq!(
            serde_json::to_value(&real.node).unwrap(),
            serde_json::to_value(item).unwrap()
        );
    }
    let second = Storage::new(Some(f.database.clone()))
        .scene_projection(&f.source, &f.scan)
        .unwrap();
    assert_eq!(
        serde_json::to_value(first).unwrap(),
        serde_json::to_value(second).unwrap()
    );
    assert_eq!(fs::read(&f.database).unwrap(), before);
    assert_eq!(fs::read(f.root.join("cena-0.txt")).unwrap(), b"fixture");
}

#[test]
fn t050_scene_limits_are_honest_at_100_nodes_and_at_depth_three() {
    let mut f = prepare();
    for index in 0..94 {
        fs::write(f.root.join(format!("cena-{index:03}.txt")), b"").unwrap();
    }
    reindex(&mut f);
    let full = f.storage.scene_projection(&f.source, &f.scan).unwrap();
    assert_eq!(full.nodes.len() + 1, 100);
    assert!(!full.truncated);
    fs::write(f.root.join("excedente.txt"), b"").unwrap();
    reindex(&mut f);
    let limited = f.storage.scene_projection(&f.source, &f.scan).unwrap();
    assert_eq!(limited.nodes.len() + 1, 100);
    assert!(limited.truncated);
    let mut f = prepare();
    fs::create_dir_all(f.root.join("Coleção ç/Vazia/Nível 3/Nível 4")).unwrap();
    reindex(&mut f);
    let limited = f.storage.scene_projection(&f.source, &f.scan).unwrap();
    assert!(limited.truncated);
    assert!(limited.nodes.iter().any(|node| node.title == "Nível 3"));
    assert!(!limited.nodes.iter().any(|node| node.title == "Nível 4"));
}

#[test]
fn t050_scene_rejects_stale_snapshot_revocation_invalid_ids_and_corrupt_path() {
    let mut f = prepare();
    let previous = f.scan.clone();
    reindex(&mut f);
    assert_eq!(
        f.storage
            .scene_projection(&f.source, &previous)
            .unwrap_err()
            .code,
        "INDEX_CHANGED"
    );
    assert_eq!(
        f.storage
            .scene_projection("' OR 1=1", &f.scan)
            .unwrap_err()
            .code,
        "INVALID_CATALOG_REQUEST"
    );
    let connection = Connection::open(&f.database).unwrap();
    connection
        .execute(
            "UPDATE nodes SET fs_path='C:\\fora.txt' WHERE source_id=?1 AND kind='file'",
            [&f.source],
        )
        .unwrap();
    assert_eq!(
        f.storage
            .scene_projection(&f.source, &f.scan)
            .unwrap_err()
            .code,
        "INVALID_CATALOG"
    );
    f.storage.revoke_source(&f.source).unwrap();
    assert_eq!(
        f.storage
            .scene_projection(&f.source, &f.scan)
            .unwrap_err()
            .code,
        "SOURCE_NOT_AUTHORIZED"
    );
}

#[test]
fn t051_scene_serialization_matches_shared_typescript_contract() {
    let f = prepare();
    let expected: serde_json::Value = serde_json::from_str(include_str!(
        "../../../../tests/fixtures/scene-projection.json"
    ))
    .unwrap();
    let root = &expected["root"];
    let text = |value: &serde_json::Value| value.as_str().unwrap().to_owned();
    let connection = Connection::open(&f.database).unwrap();
    connection
        .execute(
            "UPDATE nodes SET scan_id=NULL WHERE source_id=?1",
            [&f.source],
        )
        .unwrap();
    connection
        .execute(
            "INSERT INTO sources(id,root_path,display_name,enabled) VALUES(?1,?2,?3,1)",
            params![
                text(&root["sourceId"]),
                text(&root["sourceRootPath"]),
                text(&root["sourceName"])
            ],
        )
        .unwrap();
    connection.execute("INSERT INTO scan_reports(source_id,scan_id,completed_at,files_count,folders_count,total_bytes,skipped_count,error_count,partial) VALUES(?1,?2,?3,10,2,9007199254740993,0,0,0)", params![text(&root["sourceId"]),text(&root["scanId"]),text(&root["indexedAt"])]).unwrap();
    let mut paths: std::collections::HashMap<String, PathBuf> = std::collections::HashMap::new();
    for item in std::iter::once(&root["node"]).chain(expected["nodes"].as_array().unwrap()) {
        let id = text(&item["id"]);
        let parent = item["parentId"].as_str();
        let path = if let Some(parent) = parent {
            PathBuf::from(paths.get(parent).unwrap()).join(text(&item["title"]))
        } else {
            PathBuf::from(text(&root["path"]))
        };
        paths.insert(id.clone(), path.clone());
        connection.execute("INSERT INTO nodes(id,parent_id,kind,origin,title,source_id,fs_path,fs_path_key,size_bytes,size_partial,fs_modified_at_ms,fs_created_at_ms,scan_id) VALUES(?1,?2,?3,'filesystem',?4,?5,?6,?7,?8,?9,?10,?11,?12)", params![id,parent,text(&item["kind"]),text(&item["title"]),text(&root["sourceId"]),path.to_str().unwrap(),if parent.is_none() { ".".to_owned() } else { id.clone() },text(&item["sizeBytes"]).parse::<i64>().unwrap(),item["sizePartial"].as_bool().unwrap(),item["modifiedAtMs"].as_str(),if parent.is_none() { Some("0") } else { None },text(&root["scanId"])]).unwrap();
    }
    let actual = f
        .storage
        .scene_projection(&text(&root["sourceId"]), &text(&root["scanId"]))
        .unwrap();
    assert_eq!(serde_json::to_value(actual).unwrap(), expected);
}

#[test]
fn t003_t004_t009_t044_navigate_real_index_with_breadcrumbs_parent_and_empty_folder() {
    let f = prepare();
    let before = fs::read(&f.database).unwrap();
    let root = f
        .storage
        .node_children(&f.source, &f.scan, None, None, 50)
        .unwrap();
    assert!(root.folder.parent.is_none());
    assert_eq!(root.folder.node.size_bytes.as_deref(), Some("10"));
    assert_eq!(
        root.items
            .iter()
            .map(|item| item.title.as_str())
            .collect::<Vec<_>>(),
        ["Coleção ç", "raiz.txt"]
    );
    let collection = f
        .storage
        .node_children(&f.source, &f.scan, Some(&root.items[0].id), None, 50)
        .unwrap();
    assert_eq!(
        collection
            .breadcrumbs
            .iter()
            .map(|item| item.title.as_str())
            .collect::<Vec<_>>(),
        ["Fixture ç", "Coleção ç"]
    );
    let file = collection
        .items
        .iter()
        .find(|item| item.title == "áudio.txt")
        .unwrap();
    let detail = f.storage.node_detail(&f.source, &f.scan, &file.id).unwrap();
    assert_eq!(detail.node.kind, "file");
    assert_eq!(detail.node.size_bytes.as_deref(), Some("3"));
    assert_eq!(detail.source_name, "Fixture ç");
    assert_eq!(
        detail.path,
        f.root.join("Coleção ç").join("áudio.txt").to_str().unwrap()
    );
    assert_eq!(
        detail.parent.as_ref().unwrap().id,
        collection.folder.node.id
    );
    assert!(detail.node.modified_at_ms.unwrap().parse::<i128>().is_ok());
    let empty = collection
        .items
        .iter()
        .find(|item| item.title == "Vazia")
        .unwrap();
    let empty = f
        .storage
        .node_children(&f.source, &f.scan, Some(&empty.id), None, 50)
        .unwrap();
    assert!(empty.items.is_empty() && empty.next_cursor.is_none());
    assert_eq!(empty.folder.node.size_bytes.as_deref(), Some("0"));
    assert_eq!(empty.breadcrumbs.len(), 3);
    let zero = collection
        .items
        .iter()
        .find(|item| item.title == "zero.bin")
        .unwrap();
    assert_eq!(
        f.storage
            .node_detail(&f.source, &f.scan, &zero.id)
            .unwrap()
            .node
            .size_bytes
            .as_deref(),
        Some("0")
    );
    assert_eq!(
        f.storage
            .node_children(&f.source, &f.scan, Some(&file.id), None, 50)
            .unwrap_err()
            .code,
        "NOT_A_FOLDER"
    );
    assert_eq!(fs::read(&f.database).unwrap(), before);
    assert_eq!(fs::read(f.root.join("raiz.txt")).unwrap(), b"1234567");
}

#[test]
fn t008_t044_reads_saved_metadata_when_source_file_is_unavailable_after_reopen() {
    let f = prepare();
    let page = f
        .storage
        .node_children(&f.source, &f.scan, None, None, 50)
        .unwrap();
    let file = page.items.iter().find(|item| item.kind == "file").unwrap();
    fs::remove_file(f.root.join("raiz.txt")).unwrap(); // somente o arquivo sintético criado por prepare()
    let reopened = Storage::new(Some(f.database.clone()));
    let detail = reopened.node_detail(&f.source, &f.scan, &file.id).unwrap();
    assert_eq!(detail.node.size_bytes.as_deref(), Some("7"));
    assert_eq!(detail.path, f.root.join("raiz.txt").to_str().unwrap());
    assert_eq!(
        reopened
            .node_children(&f.source, &f.scan, None, None, 50)
            .unwrap()
            .items
            .len(),
        2
    );
}

#[test]
fn t045_bounded_keyset_pagination_has_no_gaps_duplicates_or_client_supplied_sort_key() {
    let mut f = prepare();
    for index in 0..120 {
        fs::write(f.root.join(format!("{index:03} arquivo ç.txt")), b"").unwrap();
    }
    f.scan = f
        .storage
        .index_fixture_at(&f.source, &f.root, &LocalFs, Limits::default())
        .unwrap()
        .last_scan
        .unwrap()
        .scan_id;
    let mut cursor = None;
    let mut all = Vec::new();
    loop {
        let page = f
            .storage
            .node_children(&f.source, &f.scan, None, cursor.as_deref(), 50)
            .unwrap();
        assert!(page.items.len() <= 50);
        all.extend(page.items);
        cursor = page.next_cursor;
        if cursor.is_none() {
            break;
        }
    }
    assert_eq!(all.len(), 122);
    assert_eq!(all[0].kind, "folder");
    assert_eq!(all[1].title, "000 arquivo ç.txt");
    assert_eq!(
        all.iter()
            .map(|item| &item.id)
            .collect::<std::collections::HashSet<_>>()
            .len(),
        122
    );
    for limit in [0, 101, u32::MAX] {
        assert_eq!(
            f.storage
                .node_children(&f.source, &f.scan, None, None, limit)
                .unwrap_err()
                .code,
            "INVALID_PAGE"
        );
    }
    let folder = f
        .storage
        .node_children(&f.source, &f.scan, Some(&all[0].id), None, 50)
        .unwrap();
    assert_eq!(
        f.storage
            .node_children(&f.source, &f.scan, None, Some(&folder.items[0].id), 50)
            .unwrap_err()
            .code,
        "INVALID_CURSOR"
    );
}

#[test]
fn t046_reindex_rejects_old_snapshot_and_retained_nodes_and_revocation_blocks_queries() {
    let mut f = prepare();
    let old = f
        .storage
        .node_children(&f.source, &f.scan, None, None, 50)
        .unwrap();
    let removed = old
        .items
        .iter()
        .find(|item| item.kind == "file")
        .unwrap()
        .id
        .clone();
    fs::remove_file(f.root.join("raiz.txt")).unwrap();
    let previous_scan = f.scan.clone();
    f.scan = f
        .storage
        .index_fixture_at(&f.source, &f.root, &LocalFs, Limits::default())
        .unwrap()
        .last_scan
        .unwrap()
        .scan_id;
    assert_eq!(
        f.storage
            .node_children(&f.source, &previous_scan, None, None, 50)
            .unwrap_err()
            .code,
        "INDEX_CHANGED"
    );
    assert_eq!(
        f.storage
            .node_detail(&f.source, &previous_scan, &removed)
            .unwrap_err()
            .code,
        "INDEX_CHANGED"
    );
    assert_eq!(
        f.storage
            .node_detail(&f.source, &f.scan, &removed)
            .unwrap_err()
            .code,
        "NODE_NOT_FOUND"
    );
    let current = f
        .storage
        .node_children(&f.source, &f.scan, None, None, 50)
        .unwrap();
    assert_eq!(current.folder.node.id, old.folder.node.id);
    f.storage.revoke_source(&f.source).unwrap();
    assert_eq!(
        f.storage
            .node_children(&f.source, &f.scan, None, None, 50)
            .unwrap_err()
            .code,
        "SOURCE_NOT_AUTHORIZED"
    );
    assert_eq!(
        f.storage
            .node_detail(&f.source, &f.scan, &current.folder.node.id)
            .unwrap_err()
            .code,
        "SOURCE_NOT_AUTHORIZED"
    );
}

#[test]
fn t044_t047_nullable_metadata_and_i64_bytes_keep_precision_and_invalid_ids_are_sanitized() {
    let f = prepare();
    let page = f
        .storage
        .node_children(&f.source, &f.scan, None, None, 50)
        .unwrap();
    let file = page.items.iter().find(|item| item.kind == "file").unwrap();
    let connection = Connection::open(&f.database).unwrap();
    connection.execute("UPDATE nodes SET size_bytes=?1, fs_modified_at_ms=NULL, fs_created_at_ms=NULL, size_partial=1 WHERE id=?2",
        params![9_007_199_254_740_993_i64, file.id]).unwrap();
    let detail = f.storage.node_detail(&f.source, &f.scan, &file.id).unwrap();
    assert_eq!(detail.node.size_bytes.as_deref(), Some("9007199254740993"));
    assert!(
        detail.node.size_partial
            && detail.node.modified_at_ms.is_none()
            && detail.created_at_ms.is_none()
    );
    connection
        .execute("UPDATE nodes SET size_bytes=NULL WHERE id=?1", [&file.id])
        .unwrap();
    assert!(f
        .storage
        .node_detail(&f.source, &f.scan, &file.id)
        .unwrap()
        .node
        .size_bytes
        .is_none());
    let error = f
        .storage
        .node_detail(&f.source, &f.scan, "' OR 1=1; --")
        .unwrap_err();
    assert_eq!(
        serde_json::to_value(error).unwrap(),
        serde_json::json!({"code":"INVALID_CATALOG_REQUEST"})
    );
    assert_eq!(
        f.storage
            .node_children(&Uuid::new_v4().to_string(), &f.scan, None, None, 50)
            .unwrap_err()
            .code,
        "SOURCE_NOT_FOUND"
    );
    assert_eq!(
        f.storage
            .node_detail(&f.source, &f.scan, &Uuid::new_v4().to_string())
            .unwrap_err()
            .code,
        "NODE_NOT_FOUND"
    );
}

#[test]
fn t047_cross_source_parent_cycles_and_paths_outside_root_are_not_returned() {
    let f = prepare();
    let page = f
        .storage
        .node_children(&f.source, &f.scan, None, None, 50)
        .unwrap();
    let folder = &page.items[0];
    let file = &page.items[1];
    let connection = Connection::open(&f.database).unwrap();
    let foreign_source = Uuid::new_v4().to_string();
    let foreign_node = Uuid::new_v4().to_string();
    connection.execute("INSERT INTO sources(id,root_path,display_name,enabled) VALUES(?1,'fixture-outro','Outro',1)", [&foreign_source]).unwrap();
    connection.execute("INSERT INTO nodes(id,kind,origin,title,source_id,fs_path,fs_path_key,scan_id) VALUES(?1,'folder','filesystem','Outra fonte',?2,'fora','.',?3)", params![foreign_node, foreign_source, f.scan]).unwrap();
    assert_eq!(
        f.storage
            .node_detail(&f.source, &f.scan, &foreign_node)
            .unwrap_err()
            .code,
        "NODE_NOT_FOUND"
    );
    assert_eq!(
        f.storage
            .node_children(&f.source, &f.scan, None, Some(&foreign_node), 50)
            .unwrap_err()
            .code,
        "INVALID_CURSOR"
    );
    connection
        .execute(
            "UPDATE nodes SET parent_id=?1 WHERE id=?2",
            params![foreign_node, file.id],
        )
        .unwrap();
    assert_eq!(
        f.storage
            .node_detail(&f.source, &f.scan, &file.id)
            .unwrap_err()
            .code,
        "INVALID_CATALOG"
    );
    connection
        .execute(
            "UPDATE nodes SET parent_id=?1 WHERE id=?2",
            params![folder.id, page.folder.node.id],
        )
        .unwrap();
    assert_eq!(
        f.storage
            .node_detail(&f.source, &f.scan, &folder.id)
            .unwrap_err()
            .code,
        "INVALID_CATALOG"
    );
    connection
        .execute(
            "UPDATE nodes SET parent_id=NULL WHERE id=?1",
            [&page.folder.node.id],
        )
        .unwrap();
    connection
        .execute(
            "UPDATE nodes SET fs_path=?1 WHERE id=?2",
            params![
                f.root.parent().unwrap().join("fora.txt").to_str().unwrap(),
                folder.id
            ],
        )
        .unwrap();
    assert_eq!(
        f.storage
            .node_children(&f.source, &f.scan, None, None, 50)
            .unwrap_err()
            .code,
        "INVALID_CATALOG"
    );
}

#[test]
fn t044_no_snapshot_and_no_navigable_root_have_distinct_errors() {
    let f = prepare();
    let connection = Connection::open(&f.database).unwrap();
    connection
        .execute(
            "UPDATE nodes SET scan_id=NULL WHERE source_id=?1",
            [&f.source],
        )
        .unwrap();
    assert_eq!(
        f.storage
            .node_children(&f.source, &f.scan, None, None, 50)
            .unwrap_err()
            .code,
        "INDEX_EMPTY"
    );
    connection
        .execute("DELETE FROM scan_reports WHERE source_id=?1", [&f.source])
        .unwrap();
    assert_eq!(
        f.storage
            .node_children(&f.source, &f.scan, None, None, 50)
            .unwrap_err()
            .code,
        "INDEX_NOT_FOUND"
    );
}

#[test]
fn t048_node_page_contract_matches_shared_typescript_fixture() {
    use crate::catalog::{Breadcrumb, NodeDetail, NodePage, NodeSummary};
    let expected: serde_json::Value =
        serde_json::from_str(include_str!("../../../../tests/fixtures/catalog-page.json")).unwrap();
    let root = "00000000-0000-4000-8000-000000000002";
    let title = "Documentos com espaço";
    let date = Some("1794222000000".to_owned());
    let page = NodePage {
        folder: NodeDetail {
            source_id: "00000000-0000-4000-8000-000000000001".into(),
            scan_id: "00000000-0000-4000-8000-000000000003".into(),
            indexed_at: "2026-11-09T18:00:00.000Z".into(),
            source_name: title.into(),
            source_root_path: r"C:\fixture\Documentos com espaço".into(),
            node: NodeSummary {
                id: root.into(),
                parent_id: None,
                kind: "folder".into(),
                title: title.into(),
                size_bytes: Some("9007199254740993".into()),
                size_partial: false,
                modified_at_ms: date.clone(),
            },
            path: r"C:\fixture\Documentos com espaço".into(),
            created_at_ms: Some("0".into()),
            parent: None,
        },
        breadcrumbs: vec![Breadcrumb {
            id: root.into(),
            title: title.into(),
        }],
        items: vec![
            NodeSummary {
                id: "00000000-0000-4000-8000-000000000005".into(),
                parent_id: Some(root.into()),
                kind: "folder".into(),
                title: "Coleção ç".into(),
                size_bytes: Some("0".into()),
                size_partial: false,
                modified_at_ms: None,
            },
            NodeSummary {
                id: "00000000-0000-4000-8000-000000000006".into(),
                parent_id: Some(root.into()),
                kind: "file".into(),
                title: "áudio com espaço.wav".into(),
                size_bytes: Some("9007199254740993".into()),
                size_partial: false,
                modified_at_ms: date,
            },
        ],
        next_cursor: None,
    };
    assert_eq!(serde_json::to_value(page).unwrap(), expected);
}
