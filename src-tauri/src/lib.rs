mod commands;
mod storage;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let path = app
                .path()
                .app_local_data_dir()
                .ok()
                .map(|directory| directory.join("mnexo.sqlite3"));
            app.manage(storage::Storage::new(path));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![commands::get_app_status])
        .run(tauri::generate_context!())
        .expect("Falha ao iniciar o MNEXO");
}
