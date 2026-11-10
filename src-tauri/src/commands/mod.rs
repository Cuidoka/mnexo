use serde::Serialize;
pub(crate) mod catalog;
pub(crate) mod scans;
pub(crate) mod sources;
use tauri::State;

use crate::storage::Storage;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppStatus {
    app_version: &'static str,
    backend_status: BackendStatus,
    database_status: DatabaseStatus,
    schema_version: Option<u32>,
    assistant_status: AssistantStatus,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
enum BackendStatus {
    Ready,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
enum DatabaseStatus {
    Ready,
    Unavailable,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
enum AssistantStatus {
    Disabled,
}

/// MVP-002 / T-025/T-028: só o backend conhece o caminho do banco.
#[tauri::command]
pub(crate) async fn get_app_status(storage: State<'_, Storage>) -> Result<AppStatus, ()> {
    let storage = storage.inner().clone();
    Ok(
        tauri::async_runtime::spawn_blocking(move || read_app_status(&storage))
            .await
            .unwrap_or_else(|_| status_with_schema(None)),
    )
}

fn read_app_status(storage: &Storage) -> AppStatus {
    // Erros internos nunca são serializados, logados ou enviados ao webview.
    status_with_schema(storage.schema_version().ok())
}

fn status_with_schema(schema_version: Option<u32>) -> AppStatus {
    AppStatus {
        app_version: env!("CARGO_PKG_VERSION"),
        backend_status: BackendStatus::Ready,
        database_status: if schema_version.is_some() {
            DatabaseStatus::Ready
        } else {
            DatabaseStatus::Unavailable
        },
        schema_version,
        assistant_status: AssistantStatus::Disabled,
    }
}

#[cfg(test)]
mod tests {
    use super::read_app_status;
    use crate::storage::{test_directory, Storage};

    #[test]
    fn t025_status_matches_shared_contract_and_exposes_only_public_fields() {
        let expected: serde_json::Value =
            serde_json::from_str(include_str!("../../../tests/fixtures/app-status.json"))
                .expect("Fixture de contrato inválida");
        let directory = test_directory();
        let storage = Storage::new(Some(directory.path().join("contract.sqlite3")));
        let actual =
            serde_json::to_value(read_app_status(&storage)).expect("Status não serializável");

        assert_eq!(actual, expected);
    }

    #[test]
    fn t025_storage_failure_has_no_paths_or_internal_error_details() {
        let expected: serde_json::Value = serde_json::from_str(include_str!(
            "../../../tests/fixtures/app-status-unavailable.json"
        ))
        .unwrap();
        let actual = serde_json::to_value(read_app_status(&Storage::new(None))).unwrap();
        assert_eq!(actual, expected);
    }
}
