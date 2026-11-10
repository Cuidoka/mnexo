pub(crate) mod walk;

use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::sources::display_path;

pub(crate) fn fixture_path() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("Projeto sem diretório pai")
        .join(".tools/fixtures/mvp-004")
}

pub(crate) fn fixture_eligible(storage_path: &str) -> bool {
    Path::new(&display_path(storage_path)) == fixture_path()
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ScanIssue {
    pub relative_path: String,
    pub code: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ScanReport {
    pub source_id: String,
    pub scan_id: String,
    pub completed_at: String,
    pub files_count: u32,
    /// Inclui a própria raiz, mesmo vazia.
    pub folders_count: u32,
    /// Decimal para não perder precisão em JavaScript.
    pub total_bytes: String,
    pub skipped_count: u32,
    pub error_count: u32,
    pub partial: bool,
    pub issues: Vec<ScanIssue>,
    pub issues_truncated: bool,
}

#[cfg(test)]
mod tests;
