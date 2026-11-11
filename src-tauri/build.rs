fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "get_app_status",
            "choose_scan_source",
            "cancel_scan_source_selection",
            "add_scan_source",
            "list_scan_sources",
            "revoke_scan_source",
            "start_scan",
            "get_scan_status",
            "cancel_scan",
            "get_node_children",
            "get_node_detail",
            "get_scene_projection",
        ]),
    ))
    .expect("Falha na preparação do aplicativo Tauri");
}
