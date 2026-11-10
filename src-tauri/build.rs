fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "get_app_status",
            "choose_scan_source",
            "cancel_scan_source_selection",
            "add_scan_source",
            "list_scan_sources",
            "revoke_scan_source",
            "index_fixture_source",
        ]),
    ))
    .expect("Falha na preparação do aplicativo Tauri");
}
