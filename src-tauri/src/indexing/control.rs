use serde::Serialize;

use crate::sources::SourceError;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ScanProgress {
    pub visited_entries: u32,
    pub files_count: u32,
    pub folders_count: u32,
    pub total_bytes: String,
    pub skipped_count: u32,
    pub error_count: u32,
}

impl Default for ScanProgress {
    fn default() -> Self {
        Self {
            visited_entries: 0,
            files_count: 0,
            folders_count: 0,
            total_bytes: "0".into(),
            skipped_count: 0,
            error_count: 0,
        }
    }
}

pub(crate) trait ScanControl {
    fn checkpoint(&self) -> Result<(), SourceError>;
    fn progress(&self, progress: ScanProgress) -> Result<(), SourceError>;
    fn before_publish(&self) -> Result<(), SourceError>;
}

#[cfg(test)]
pub(crate) struct Uncontrolled;
#[cfg(test)]
impl ScanControl for Uncontrolled {
    fn checkpoint(&self) -> Result<(), SourceError> {
        Ok(())
    }
    fn progress(&self, _: ScanProgress) -> Result<(), SourceError> {
        Ok(())
    }
    fn before_publish(&self) -> Result<(), SourceError> {
        Ok(())
    }
}
