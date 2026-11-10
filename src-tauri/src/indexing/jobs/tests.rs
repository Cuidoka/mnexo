use std::{
    fs, io,
    path::{Path, PathBuf},
    sync::mpsc,
    thread,
    time::Duration,
};

use super::*;
use crate::indexing::{
    tests::setup,
    walk::{Limits, LocalFs, MetadataFs},
};

const SOURCE: &str = "00000000-0000-4000-8000-000000000001";

#[test]
fn t007_t041_only_one_active_job_and_cancellation_requires_worker_acknowledgement() {
    let jobs = ScanJobs::default();
    assert!(jobs.status().unwrap().is_none());
    let (job, control) = jobs.begin(SOURCE).unwrap();
    assert!(matches!(jobs.begin(SOURCE), Err(error) if error.code == "SCAN_BUSY"));
    assert_eq!(jobs.cancel("outro").unwrap_err().code, "SCAN_NOT_FOUND");
    assert_eq!(
        jobs.cancel(&job.job_id).unwrap().state,
        JobState::Cancelling
    );
    assert_eq!(
        jobs.cancel(&job.job_id).unwrap().state,
        JobState::Cancelling
    );
    assert_eq!(control.checkpoint().unwrap_err().code, "SCAN_CANCELLED");
    assert!(matches!(jobs.begin(SOURCE), Err(error) if error.code == "SCAN_BUSY"));
    control
        .finish(Err(SourceError::new("SCAN_CANCELLED")))
        .unwrap();
    assert_eq!(jobs.status().unwrap().unwrap().state, JobState::Cancelled);
    let (next, _) = jobs.begin(SOURCE).unwrap();
    assert_ne!(next.job_id, job.job_id);
    assert_eq!(jobs.cancel(&job.job_id).unwrap_err().code, "SCAN_NOT_FOUND");
    assert_eq!(jobs.status().unwrap().unwrap().state, JobState::Running);
    assert_eq!(next.progress.visited_entries, 0);
}

struct BlockedFs {
    block: PathBuf,
    entered: mpsc::Sender<()>,
    resume: mpsc::Receiver<()>,
}
impl MetadataFs for BlockedFs {
    fn metadata(&self, path: &Path) -> io::Result<fs::Metadata> {
        if path == self.block {
            self.entered.send(()).unwrap();
            self.resume.recv_timeout(Duration::from_secs(5)).unwrap();
        }
        LocalFs.metadata(path)
    }
    fn entries(&self, path: &Path) -> io::Result<Box<dyn Iterator<Item = io::Result<PathBuf>>>> {
        LocalFs.entries(path)
    }
}

#[test]
fn t007_t008_status_and_cancel_respond_while_io_is_blocked_then_restart_preserves_previous_index() {
    let (_temp, storage, root, id) = setup();
    let first = storage
        .index_fixture_at(&id, &root, &LocalFs, Limits::default())
        .unwrap()
        .last_scan
        .unwrap();
    let jobs = ScanJobs::default();
    let (job, control) = jobs.begin(&id).unwrap();
    let (entered_tx, entered_rx) = mpsc::channel();
    let (resume_tx, resume_rx) = mpsc::channel();
    let worker_storage = storage.clone();
    let worker_root = root.clone();
    let worker_id = id.clone();
    let worker = thread::spawn(move || {
        let filesystem = BlockedFs {
            block: worker_root.join("raiz.txt"),
            entered: entered_tx,
            resume: resume_rx,
        };
        let result = worker_storage.index_fixture_at_controlled(
            &worker_id,
            &worker_root,
            &filesystem,
            Limits::default(),
            &control,
        );
        let code = result.as_ref().err().map(|error| error.code);
        control.finish(result).unwrap();
        code
    });
    entered_rx.recv_timeout(Duration::from_secs(5)).unwrap();
    let (response_tx, response_rx) = mpsc::channel();
    let observer_jobs = jobs.clone();
    let job_id = job.job_id.clone();
    let observer = thread::spawn(move || {
        let progress = observer_jobs.status().unwrap().unwrap().progress;
        let changed = observer_jobs.cancel(&job_id).unwrap();
        response_tx
            .send((progress.visited_entries, changed.state))
            .unwrap();
    });
    // O controle responde sem esperar a liberação do I/O de cinco segundos.
    let (visited, state) = response_rx.recv_timeout(Duration::from_secs(2)).unwrap();
    assert!(visited > 0);
    assert_eq!(state, JobState::Cancelling);
    assert_eq!(jobs.status().unwrap().unwrap().state, JobState::Cancelling);
    assert_eq!(storage.schema_version().unwrap(), 2); // outro acesso local continua disponível
    assert_eq!(
        storage.list_sources().unwrap()[0]
            .last_scan
            .as_ref()
            .unwrap()
            .scan_id,
        first.scan_id
    );
    resume_tx.send(()).unwrap();
    observer.join().unwrap();
    assert_eq!(worker.join().unwrap(), Some("SCAN_CANCELLED"));
    assert_eq!(jobs.status().unwrap().unwrap().state, JobState::Cancelled);
    assert_eq!(
        storage.list_sources().unwrap()[0]
            .last_scan
            .as_ref()
            .unwrap()
            .scan_id,
        first.scan_id
    );
    let (next, control) = jobs.begin(&id).unwrap();
    let result =
        storage.index_fixture_at_controlled(&id, &root, &LocalFs, Limits::default(), &control);
    control.finish(result).unwrap();
    let finished = jobs.status().unwrap().unwrap();
    assert_eq!(finished.state, JobState::Completed);
    assert_eq!(
        (
            finished.progress.visited_entries,
            finished.progress.files_count,
            finished.progress.folders_count
        ),
        (6, 3, 3)
    );
    assert_eq!(finished.progress.total_bytes, "10");
    assert_ne!(next.job_id, job.job_id);
    assert_ne!(
        storage.list_sources().unwrap()[0]
            .last_scan
            .as_ref()
            .unwrap()
            .scan_id,
        first.scan_id
    );
    assert!(ScanJobs::default().status().unwrap().is_none());
    assert_eq!(fs::read(root.join("raiz.txt")).unwrap(), b"1234567");
}

struct BoundaryControl {
    inner: JobControl,
    jobs: ScanJobs,
    id: String,
    late: bool,
}
impl ScanControl for BoundaryControl {
    fn checkpoint(&self) -> Result<(), SourceError> {
        self.inner.checkpoint()
    }
    fn progress(&self, progress: ScanProgress) -> Result<(), SourceError> {
        self.inner.progress(progress)
    }
    fn before_publish(&self) -> Result<(), SourceError> {
        if self.late {
            self.inner.before_publish()?;
            assert_eq!(
                self.jobs.cancel(&self.id).unwrap_err().code,
                "SCAN_FINISHING"
            );
            Ok(())
        } else {
            self.jobs.cancel(&self.id)?;
            self.inner.before_publish()
        }
    }
}

#[test]
fn t007_t041_cancel_at_publication_boundary_discards_work_but_late_cancel_does_not_claim_rollback()
{
    let (_temp, storage, root, id) = setup();
    let first = storage
        .index_fixture_at(&id, &root, &LocalFs, Limits::default())
        .unwrap()
        .last_scan
        .unwrap();
    let jobs = ScanJobs::default();
    for late in [false, true] {
        let (job, control) = jobs.begin(&id).unwrap();
        let boundary = BoundaryControl {
            inner: control.clone(),
            jobs: jobs.clone(),
            id: job.job_id,
            late,
        };
        let result =
            storage.index_fixture_at_controlled(&id, &root, &LocalFs, Limits::default(), &boundary);
        if !late {
            assert_eq!(result.as_ref().unwrap_err().code, "SCAN_CANCELLED");
        }
        control.finish(result).unwrap();
        let saved = storage.list_sources().unwrap().remove(0).last_scan.unwrap();
        if late {
            assert_eq!(jobs.status().unwrap().unwrap().state, JobState::Completed);
            assert_ne!(saved.scan_id, first.scan_id);
        } else {
            assert_eq!(jobs.status().unwrap().unwrap().state, JobState::Cancelled);
            assert_eq!(saved.scan_id, first.scan_id);
        }
    }
}

#[test]
fn t037_t041_job_failure_reports_safe_code_and_releases_the_slot() {
    let (_temp, storage, root, id) = setup();
    storage.revoke_source(&id).unwrap();
    let jobs = ScanJobs::default();
    let (_, control) = jobs.begin(&id).unwrap();
    let result =
        storage.index_fixture_at_controlled(&id, &root, &LocalFs, Limits::default(), &control);
    control.finish(result).unwrap();
    let job = jobs.status().unwrap().unwrap();
    assert_eq!(job.state, JobState::Failed);
    assert_eq!(job.error_code, Some("SOURCE_NOT_AUTHORIZED"));
    assert!(jobs.begin(&id).is_ok());
    assert!(storage.list_sources().unwrap()[0].last_scan.is_none());
}

#[test]
fn t042_job_contract_is_shared_with_typescript_and_keeps_decimal_precision() {
    let expected: serde_json::Value =
        serde_json::from_str(include_str!("../../../../tests/fixtures/scan-job.json")).unwrap();
    let job = ScanJob {
        job_id: "00000000-0000-4000-8000-000000000004".into(),
        source_id: SOURCE.into(),
        state: JobState::Running,
        error_code: None,
        progress: ScanProgress {
            visited_entries: 6,
            files_count: 3,
            folders_count: 3,
            total_bytes: "9007199254740993".into(),
            skipped_count: 0,
            error_count: 0,
        },
    };
    assert_eq!(serde_json::to_value(job).unwrap(), expected);
}
