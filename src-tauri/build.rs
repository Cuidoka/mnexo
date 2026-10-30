fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(&["get_app_status"])),
    )
    .expect("Falha na preparação do aplicativo Tauri");
}
