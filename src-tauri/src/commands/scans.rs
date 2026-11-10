use tauri::State;

use crate::{
    indexing::jobs::{ScanJob, ScanJobs},
    sources::SourceError,
    storage::Storage,
};

#[tauri::command]
pub(crate) fn start_scan(
    source_id: String,
    storage: State<'_, Storage>,
    jobs: State<'_, ScanJobs>,
) -> Result<ScanJob, SourceError> {
    let (job, control) = jobs.begin(&source_id)?;
    let storage = storage.inner().clone();
    // Devolver o job sem aguardar enumeração ou SQLite. Monitorar também falha do worker.
    tauri::async_runtime::spawn(async move {
        let worker_control = control.clone();
        let result = tauri::async_runtime::spawn_blocking(move || {
            storage.index_fixture_controlled(&source_id, &worker_control)
        })
        .await
        .unwrap_or_else(|_| Err(SourceError::new("SCAN_UNAVAILABLE")));
        let _ = control.finish(result);
    });
    Ok(job)
}

#[tauri::command]
pub(crate) fn get_scan_status(jobs: State<'_, ScanJobs>) -> Result<Option<ScanJob>, SourceError> {
    jobs.status()
}

#[tauri::command]
pub(crate) fn cancel_scan(
    job_id: String,
    jobs: State<'_, ScanJobs>,
) -> Result<ScanJob, SourceError> {
    jobs.cancel(&job_id)
}
