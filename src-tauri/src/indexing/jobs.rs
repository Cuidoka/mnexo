use std::sync::{Arc, Mutex, MutexGuard};

use serde::Serialize;
use uuid::Uuid;

use super::control::{ScanControl, ScanProgress};
use crate::sources::SourceError;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum JobState {
    Running,
    Cancelling,
    Publishing,
    Completed,
    Cancelled,
    Failed,
}

impl JobState {
    pub(crate) fn active(self) -> bool {
        matches!(self, Self::Running | Self::Cancelling | Self::Publishing)
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ScanJob {
    pub job_id: String,
    pub source_id: String,
    pub state: JobState,
    pub progress: ScanProgress,
    pub error_code: Option<&'static str>,
}

/// Um único slot: estado em memória, sem histórico ilimitado nem I/O sob o mutex.
#[derive(Clone, Default)]
pub(crate) struct ScanJobs(Arc<Mutex<Option<ScanJob>>>);

impl ScanJobs {
    fn lock(&self) -> Result<MutexGuard<'_, Option<ScanJob>>, SourceError> {
        self.0
            .lock()
            .map_err(|_| SourceError::new("SCAN_UNAVAILABLE"))
    }

    pub(crate) fn status(&self) -> Result<Option<ScanJob>, SourceError> {
        Ok(self.lock()?.clone())
    }

    pub(crate) fn begin(&self, source_id: &str) -> Result<(ScanJob, JobControl), SourceError> {
        let source_id = Uuid::parse_str(source_id)
            .map_err(|_| SourceError::new("SOURCE_NOT_FOUND"))?
            .to_string();
        let mut slot = self.lock()?;
        if slot.as_ref().is_some_and(|job| job.state.active()) {
            return Err(SourceError::new("SCAN_BUSY"));
        }
        let job = ScanJob {
            job_id: Uuid::new_v4().to_string(),
            source_id,
            state: JobState::Running,
            progress: ScanProgress::default(),
            error_code: None,
        };
        *slot = Some(job.clone());
        let control = JobControl {
            jobs: self.clone(),
            job_id: job.job_id.clone(),
        };
        Ok((job, control))
    }

    pub(crate) fn cancel(&self, job_id: &str) -> Result<ScanJob, SourceError> {
        let mut slot = self.lock()?;
        let job = slot
            .as_mut()
            .filter(|job| job.job_id == job_id)
            .ok_or_else(|| SourceError::new("SCAN_NOT_FOUND"))?;
        match job.state {
            JobState::Running => job.state = JobState::Cancelling,
            JobState::Publishing => return Err(SourceError::new("SCAN_FINISHING")),
            _ => {}
        }
        Ok(job.clone())
    }
}

#[derive(Clone)]
pub(crate) struct JobControl {
    jobs: ScanJobs,
    job_id: String,
}

impl JobControl {
    pub(crate) fn finish(&self, result: Result<(), SourceError>) -> Result<(), SourceError> {
        let mut slot = self.jobs.lock()?;
        let job = slot
            .as_mut()
            .filter(|job| job.job_id == self.job_id)
            .ok_or_else(|| SourceError::new("SCAN_NOT_FOUND"))?;
        match result {
            Ok(_) => job.state = JobState::Completed,
            Err(error) if error.code == "SCAN_CANCELLED" => job.state = JobState::Cancelled,
            Err(error) => {
                job.state = JobState::Failed;
                job.error_code = Some(error.code);
            }
        }
        Ok(())
    }
}

impl ScanControl for JobControl {
    fn checkpoint(&self) -> Result<(), SourceError> {
        let slot = self.jobs.lock()?;
        let job = slot
            .as_ref()
            .filter(|job| job.job_id == self.job_id)
            .ok_or_else(|| SourceError::new("SCAN_NOT_FOUND"))?;
        if job.state == JobState::Cancelling {
            return Err(SourceError::new("SCAN_CANCELLED"));
        }
        Ok(())
    }

    fn progress(&self, progress: ScanProgress) -> Result<(), SourceError> {
        let mut slot = self.jobs.lock()?;
        let job = slot
            .as_mut()
            .filter(|job| job.job_id == self.job_id)
            .ok_or_else(|| SourceError::new("SCAN_NOT_FOUND"))?;
        job.progress = progress;
        Ok(())
    }

    fn before_publish(&self) -> Result<(), SourceError> {
        let mut slot = self.jobs.lock()?;
        let job = slot
            .as_mut()
            .filter(|job| job.job_id == self.job_id)
            .ok_or_else(|| SourceError::new("SCAN_NOT_FOUND"))?;
        if job.state == JobState::Cancelling {
            return Err(SourceError::new("SCAN_CANCELLED"));
        }
        // Depois deste ponto cancelar não pode prometer desfazer um COMMIT.
        job.state = JobState::Publishing;
        Ok(())
    }
}

#[cfg(test)]
mod tests;
