mod commands;
mod indexing;
mod sources;
mod storage;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let path = app
                .path()
                .app_local_data_dir()
                .ok()
                .map(|directory| directory.join("mnexo.sqlite3"));
            app.manage(storage::Storage::new(path));
            app.manage(sources::SourceSelections::default());
            app.manage(indexing::jobs::ScanJobs::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_app_status,
            commands::sources::choose_scan_source,
            commands::sources::cancel_scan_source_selection,
            commands::sources::add_scan_source,
            commands::sources::list_scan_sources,
            commands::sources::revoke_scan_source,
            commands::scans::start_scan,
            commands::scans::get_scan_status,
            commands::scans::cancel_scan,
        ])
        .run(tauri::generate_context!())
        .expect("Falha ao iniciar o MNEXO");
}
