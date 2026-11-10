use tauri::{AppHandle, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
use uuid::Uuid;

use crate::{
    sources::{authorize_selection, FolderSelection, ScanSource, SourceError, SourceSelections},
    storage::Storage,
};

#[tauri::command]
pub(crate) async fn choose_scan_source(
    app: AppHandle,
    window: WebviewWindow,
    selections: State<'_, SourceSelections>,
) -> Result<Option<FolderSelection>, SourceError> {
    let selections = selections.inner().clone();
    let lease = selections.begin()?;
    let dialog = app
        .dialog()
        .file()
        .set_parent(&window)
        .set_title("Selecionar pasta para o MNEXO")
        .set_can_create_directories(false);
    tauri::async_runtime::spawn_blocking(move || {
        let _lease = lease;
        match dialog.blocking_pick_folder() {
            None => Ok(None),
            Some(path) => {
                let path = path
                    .into_path()
                    .map_err(|_| SourceError::new("INVALID_FOLDER"))?;
                selections.offer(&path).map(Some)
            }
        }
    })
    .await
    .map_err(|_| SourceError::new("SELECTION_UNAVAILABLE"))?
}

#[tauri::command]
pub(crate) fn cancel_scan_source_selection(
    selections: State<'_, SourceSelections>,
) -> Result<(), SourceError> {
    selections.cancel()
}

#[tauri::command]
pub(crate) async fn add_scan_source(
    selection_token: String,
    storage: State<'_, Storage>,
    selections: State<'_, SourceSelections>,
) -> Result<ScanSource, SourceError> {
    let storage = storage.inner().clone();
    let selections = selections.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        authorize_selection(&storage, &selections, &selection_token)
    })
    .await
    .map_err(|_| SourceError::new("DATABASE_UNAVAILABLE"))?
}

#[tauri::command]
pub(crate) async fn list_scan_sources(
    storage: State<'_, Storage>,
) -> Result<Vec<ScanSource>, SourceError> {
    let storage = storage.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        storage.list_sources().map_err(SourceError::database)
    })
    .await
    .map_err(|_| SourceError::new("DATABASE_UNAVAILABLE"))?
}

#[tauri::command]
pub(crate) async fn revoke_scan_source(
    source_id: String,
    storage: State<'_, Storage>,
) -> Result<ScanSource, SourceError> {
    let id = Uuid::parse_str(&source_id)
        .map_err(|_| SourceError::new("SOURCE_NOT_FOUND"))?
        .to_string();
    let storage = storage.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        storage
            .revoke_source(&id)
            .map_err(SourceError::database)?
            .ok_or_else(|| SourceError::new("SOURCE_NOT_FOUND"))
    })
    .await
    .map_err(|_| SourceError::new("DATABASE_UNAVAILABLE"))?
}
