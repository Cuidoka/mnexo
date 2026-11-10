use std::{
    fs::{self, Metadata},
    io,
    path::{Path, PathBuf},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use crate::sources::SourceError;

use super::control::{ScanControl, ScanProgress};
use super::ScanIssue;

pub(crate) trait MetadataFs {
    fn metadata(&self, path: &Path) -> io::Result<Metadata>;
    fn entries(&self, path: &Path) -> io::Result<Box<dyn Iterator<Item = io::Result<PathBuf>>>>;
}

pub(crate) struct LocalFs;
impl MetadataFs for LocalFs {
    fn metadata(&self, path: &Path) -> io::Result<Metadata> {
        fs::symlink_metadata(path)
    }
    fn entries(&self, path: &Path) -> io::Result<Box<dyn Iterator<Item = io::Result<PathBuf>>>> {
        Ok(Box::new(
            fs::read_dir(path)?.map(|entry| entry.map(|entry| entry.path())),
        ))
    }
}

pub(crate) struct Limits {
    pub entries: u32,
    pub depth: usize,
    pub duration: Duration,
}
impl Default for Limits {
    fn default() -> Self {
        Self {
            entries: 1_000,
            depth: 16,
            duration: Duration::from_secs(5),
        }
    }
}

pub(crate) struct MetadataNode {
    pub path: String,
    pub key: String,
    pub title: String,
    pub folder: bool,
    pub parent: Option<usize>,
    pub bytes: i64,
    pub created_ms: Option<String>,
    pub modified_ms: Option<String>,
    pub partial: bool,
}

pub(crate) struct Snapshot {
    pub nodes: Vec<MetadataNode>,
    pub files: u32,
    pub folders: u32,
    pub skipped: u32,
    pub errors: u32,
    pub issues: Vec<ScanIssue>,
}

pub(crate) fn is_link(metadata: &Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes() & 0x400 != 0 {
            return true;
        }
    }
    metadata.file_type().is_symlink()
}

fn excluded(path: &Path, metadata: &Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        // Hidden, system e offline: não abrir placeholders nem pastas protegidas.
        if metadata.file_attributes() & (0x2 | 0x4 | 0x1000) != 0 {
            return true;
        }
    }
    let _ = metadata;
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| {
            name.starts_with('.')
                || matches!(
                    name.to_ascii_lowercase().as_str(),
                    "node_modules" | "target" | "cache" | "caches" | "__pycache__"
                )
        })
}

// A raiz é fixa e local. Recusar links também nos ancestrais antes de enumerar.
pub(crate) fn validate_root(root: &Path, stored: &str) -> Result<(), SourceError> {
    let mut ancestors: Vec<_> = root.ancestors().collect();
    ancestors.reverse();
    for ancestor in ancestors {
        let metadata =
            fs::symlink_metadata(ancestor).map_err(|_| SourceError::new("FIXTURE_UNAVAILABLE"))?;
        if is_link(&metadata) || !metadata.is_dir() {
            return Err(SourceError::new("FIXTURE_UNAVAILABLE"));
        }
    }
    let canonical = fs::canonicalize(root).map_err(|_| SourceError::new("FIXTURE_UNAVAILABLE"))?;
    if canonical != Path::new(stored) {
        return Err(SourceError::new("FIXTURE_ONLY"));
    }
    Ok(())
}

fn milliseconds(time: io::Result<SystemTime>) -> Option<String> {
    time.ok().map(|time| match time.duration_since(UNIX_EPOCH) {
        Ok(duration) => duration.as_millis().to_string(),
        Err(error) => format!("-{}", error.duration().as_millis()),
    })
}

impl Snapshot {
    fn issue(&mut self, root: &Path, path: &Path, code: &str) {
        self.errors += 1;
        if self.issues.len() < 100 {
            self.issues.push(ScanIssue {
                relative_path: path
                    .strip_prefix(root)
                    .ok()
                    .filter(|relative| !relative.as_os_str().is_empty())
                    .map(|relative| relative.to_string_lossy().into_owned())
                    .unwrap_or_else(|| ".".into()),
                code: code.into(),
            });
        }
    }
}

struct Walker<'a, F, G> {
    root: &'a Path,
    filesystem: &'a F,
    guard: G,
    limits: Limits,
    started: Instant,
    visited: u32,
    stopped: bool,
    snapshot: Snapshot,
    control: &'a dyn ScanControl,
    file_bytes: i64,
}

impl<F: MetadataFs, G: Fn() -> Result<(), SourceError>> Walker<'_, F, G> {
    fn checkpoint(&self) -> Result<(), SourceError> {
        self.control.progress(ScanProgress {
            visited_entries: self.visited,
            files_count: self.snapshot.files,
            folders_count: self.snapshot.folders,
            total_bytes: self.file_bytes.to_string(),
            skipped_count: self.snapshot.skipped,
            error_count: self.snapshot.errors,
        })?;
        self.control.checkpoint()?;
        (self.guard)()
    }

    fn visit(
        &mut self,
        path: &Path,
        parent: Option<usize>,
        depth: usize,
    ) -> Result<(), SourceError> {
        self.checkpoint()?;
        if self.stopped {
            return Ok(());
        }
        if self.visited >= self.limits.entries || self.started.elapsed() >= self.limits.duration {
            self.snapshot.issue(self.root, path, "SCAN_LIMIT");
            self.stopped = true;
            return Ok(());
        }
        self.visited += 1;
        let metadata_result = self.filesystem.metadata(path);
        self.checkpoint()?;
        let metadata = match metadata_result {
            Ok(metadata) => metadata,
            Err(_) => {
                self.snapshot.issue(self.root, path, "METADATA_UNAVAILABLE");
                self.snapshot.skipped += 1;
                return Ok(());
            }
        };
        let skip = if is_link(&metadata) {
            Some("LINK_SKIPPED")
        } else if parent.is_some() && excluded(path, &metadata) {
            Some("EXCLUDED_ENTRY")
        } else if !metadata.is_dir() && !metadata.is_file() {
            Some("UNSUPPORTED_TYPE")
        } else {
            None
        };
        if let Some(code) = skip {
            self.snapshot.issue(self.root, path, code);
            self.snapshot.skipped += 1;
            return Ok(());
        }
        let Some(path_text) = path.to_str() else {
            self.snapshot.issue(self.root, path, "INVALID_NAME");
            self.snapshot.skipped += 1;
            return Ok(());
        };
        let folder = metadata.is_dir();
        let bytes = if folder {
            0
        } else {
            match i64::try_from(metadata.len()) {
                Ok(bytes) => bytes,
                Err(_) => {
                    self.snapshot.issue(self.root, path, "SIZE_OVERFLOW");
                    self.snapshot.skipped += 1;
                    return Ok(());
                }
            }
        };
        let created_ms = milliseconds(metadata.created());
        let modified_ms = milliseconds(metadata.modified());
        let partial = created_ms.is_none() || modified_ms.is_none();
        if partial {
            self.snapshot.issue(self.root, path, "DATES_UNAVAILABLE");
        }
        let index = self.snapshot.nodes.len();
        let key = path
            .strip_prefix(self.root)
            .expect("Caminho interno fora da raiz");
        self.snapshot.nodes.push(MetadataNode {
            path: path_text.into(),
            key: if parent.is_none() {
                ".".into()
            } else {
                key.to_str().unwrap().into()
            },
            title: path
                .file_name()
                .unwrap_or(path.as_os_str())
                .to_str()
                .unwrap()
                .into(),
            folder,
            parent,
            bytes,
            created_ms,
            modified_ms,
            partial,
        });
        if folder {
            self.snapshot.folders += 1;
        } else {
            self.snapshot.files += 1;
            self.file_bytes = self
                .file_bytes
                .checked_add(bytes)
                .unwrap_or(self.file_bytes);
        }
        if folder {
            let before = self.snapshot.errors;
            if depth >= self.limits.depth {
                self.snapshot.issue(self.root, path, "DEPTH_LIMIT");
            } else {
                self.checkpoint()?;
                // Revalidar os pais antes de cada abertura de diretório.
                let mut safe = true;
                for ancestor in path
                    .ancestors()
                    .take_while(|ancestor| ancestor.starts_with(self.root))
                {
                    self.checkpoint()?;
                    if !self
                        .filesystem
                        .metadata(ancestor)
                        .is_ok_and(|meta| meta.is_dir() && !is_link(&meta))
                    {
                        safe = false;
                        break;
                    }
                }
                if !safe {
                    self.snapshot.issue(self.root, path, "DIRECTORY_CHANGED");
                } else {
                    self.checkpoint()?;
                    let entries_result = self.filesystem.entries(path);
                    self.checkpoint()?;
                    match entries_result {
                        Err(_) => self.snapshot.issue(self.root, path, "DIRECTORY_UNREADABLE"),
                        Ok(mut entries) => {
                            loop {
                                self.checkpoint()?;
                                if self.stopped {
                                    break;
                                }
                                let entry = entries.next();
                                self.checkpoint()?;
                                let Some(entry) = entry else {
                                    break;
                                };
                                match entry {
                                    Ok(child) if child.parent() == Some(path) => {
                                        self.visit(&child, Some(index), depth + 1)?
                                    }
                                    _ => self.snapshot.issue(self.root, path, "ENTRY_UNREADABLE"),
                                }
                                // Erros de iterador também consomem orçamento.
                                if self.snapshot.errors >= self.limits.entries {
                                    self.snapshot.issue(self.root, path, "SCAN_LIMIT");
                                    self.stopped = true;
                                }
                            }
                        }
                    }
                }
            }
            self.snapshot.nodes[index].partial |= self.snapshot.errors > before;
        }
        if let Some(parent) = parent {
            let total = self.snapshot.nodes[parent]
                .bytes
                .checked_add(self.snapshot.nodes[index].bytes);
            if let Some(total) = total {
                self.snapshot.nodes[parent].bytes = total;
            } else {
                self.snapshot.issue(self.root, path, "SIZE_OVERFLOW");
                self.snapshot.nodes[parent].partial = true;
            }
            self.snapshot.nodes[parent].partial |= self.snapshot.nodes[index].partial;
        }
        Ok(())
    }
}

#[cfg(test)]
pub(crate) fn collect<F: MetadataFs, G: Fn() -> Result<(), SourceError>>(
    root: &Path,
    filesystem: &F,
    guard: G,
    limits: Limits,
) -> Result<Snapshot, SourceError> {
    collect_controlled(
        root,
        filesystem,
        guard,
        limits,
        &super::control::Uncontrolled,
    )
}

pub(crate) fn collect_controlled<F: MetadataFs, G: Fn() -> Result<(), SourceError>>(
    root: &Path,
    filesystem: &F,
    guard: G,
    limits: Limits,
    control: &dyn ScanControl,
) -> Result<Snapshot, SourceError> {
    let mut walker = Walker {
        control,
        file_bytes: 0,
        root,
        filesystem,
        guard,
        limits,
        started: Instant::now(),
        visited: 0,
        stopped: false,
        snapshot: Snapshot {
            nodes: Vec::new(),
            files: 0,
            folders: 0,
            skipped: 0,
            errors: 0,
            issues: Vec::new(),
        },
    };
    walker.visit(root, None, 0)?;
    walker.checkpoint()?;
    Ok(walker.snapshot)
}
