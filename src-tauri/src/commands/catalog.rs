use tauri::State;

use crate::{
    catalog::{NodeDetail, NodePage, SceneProjection},
    sources::SourceError,
    storage::Storage,
};

#[tauri::command]
pub(crate) async fn get_scene_projection(
    source_id: String,
    scan_id: String,
    storage: State<'_, Storage>,
) -> Result<SceneProjection, SourceError> {
    let storage = storage.inner().clone();
    tauri::async_runtime::spawn_blocking(move || storage.scene_projection(&source_id, &scan_id))
        .await
        .map_err(|_| SourceError::new("CATALOG_UNAVAILABLE"))?
}

#[tauri::command]
pub(crate) async fn get_node_children(
    source_id: String,
    scan_id: String,
    folder_id: Option<String>,
    cursor: Option<String>,
    limit: u32,
    storage: State<'_, Storage>,
) -> Result<NodePage, SourceError> {
    let storage = storage.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        storage.node_children(
            &source_id,
            &scan_id,
            folder_id.as_deref(),
            cursor.as_deref(),
            limit,
        )
    })
    .await
    .map_err(|_| SourceError::new("CATALOG_UNAVAILABLE"))?
}

#[tauri::command]
pub(crate) async fn get_node_detail(
    source_id: String,
    scan_id: String,
    node_id: String,
    storage: State<'_, Storage>,
) -> Result<NodeDetail, SourceError> {
    let storage = storage.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        storage.node_detail(&source_id, &scan_id, &node_id)
    })
    .await
    .map_err(|_| SourceError::new("CATALOG_UNAVAILABLE"))?
}
