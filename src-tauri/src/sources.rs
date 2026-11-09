use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

use serde::Serialize;
use uuid::Uuid;

use crate::storage::Storage;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ScanSource {
    pub id: String,
    pub root_path: String,
    pub display_name: String,
    pub authorized: bool,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FolderSelection {
    selection_token: String,
    root_path: String,
    display_name: String,
}

#[derive(Debug, Serialize)]
pub(crate) struct SourceError {
    pub code: &'static str,
}

impl SourceError {
    pub(crate) fn new(code: &'static str) -> Self {
        Self { code }
    }
    pub(crate) fn database(_: crate::storage::StorageError) -> Self {
        Self::new("DATABASE_UNAVAILABLE")
    }
}

#[derive(Clone)]
pub(crate) struct SelectedFolder {
    canonical_path: PathBuf,
    pub storage_path: String,
    pub display_name: String,
}

pub(crate) fn display_path(path: &str) -> String {
    #[cfg(windows)]
    if let Some(local_path) = path.strip_prefix(r"\\?\") {
        return local_path.to_owned();
    }
    path.to_owned()
}

fn validate_folder(path: &Path) -> Result<SelectedFolder, SourceError> {
    if !path.is_absolute() {
        return Err(SourceError::new("INVALID_FOLDER"));
    }
    #[cfg(windows)]
    {
        use std::path::{Component, Prefix};
        if !matches!(path.components().next(), Some(Component::Prefix(prefix))
            if matches!(prefix.kind(), Prefix::Disk(_) | Prefix::VerbatimDisk(_)))
        {
            return Err(SourceError::new("LOCAL_FOLDER_REQUIRED"));
        }
    }
    let metadata = fs::symlink_metadata(path).map_err(|_| SourceError::new("INVALID_FOLDER"))?;
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes() & 0x400 != 0 {
            // FILE_ATTRIBUTE_REPARSE_POINT
            return Err(SourceError::new("LINK_NOT_SUPPORTED"));
        }
    }
    if metadata.file_type().is_symlink() {
        return Err(SourceError::new("LINK_NOT_SUPPORTED"));
    }
    if !metadata.is_dir() {
        return Err(SourceError::new("INVALID_FOLDER"));
    }
    let canonical_path = fs::canonicalize(path).map_err(|_| SourceError::new("INVALID_FOLDER"))?;
    let storage_path = canonical_path
        .to_str()
        .ok_or_else(|| SourceError::new("INVALID_FOLDER"))?
        .to_owned();
    let display_name = canonical_path
        .file_name()
        .and_then(|name| name.to_str())
        .map(str::to_owned)
        .unwrap_or_else(|| display_path(&storage_path));
    Ok(SelectedFolder {
        canonical_path,
        storage_path,
        display_name,
    })
}

#[derive(Default)]
struct SelectionSlot {
    picking: bool,
    pending: Option<(String, SelectedFolder)>,
}

#[derive(Clone, Default)]
pub(crate) struct SourceSelections(Arc<Mutex<SelectionSlot>>);

pub(crate) struct PickerLease(SourceSelections);

impl Drop for PickerLease {
    fn drop(&mut self) {
        if let Ok(mut slot) = self.0 .0.lock() {
            slot.picking = false;
        }
    }
}

impl SourceSelections {
    pub(crate) fn begin(&self) -> Result<PickerLease, SourceError> {
        let mut slot = self
            .0
            .lock()
            .map_err(|_| SourceError::new("SELECTION_UNAVAILABLE"))?;
        if slot.picking {
            return Err(SourceError::new("SELECTION_BUSY"));
        }
        slot.pending = None;
        slot.picking = true;
        Ok(PickerLease(self.clone()))
    }

    /// Chamado apenas com o resultado do diálogo Rust, nunca com caminho do webview.
    pub(crate) fn offer(&self, path: &Path) -> Result<FolderSelection, SourceError> {
        let folder = validate_folder(path)?;
        let token = Uuid::new_v4().to_string();
        let selection = FolderSelection {
            selection_token: token.clone(),
            root_path: display_path(&folder.storage_path),
            display_name: folder.display_name.clone(),
        };
        self.0
            .lock()
            .map_err(|_| SourceError::new("SELECTION_UNAVAILABLE"))?
            .pending = Some((token, folder));
        Ok(selection)
    }

    pub(crate) fn cancel(&self) -> Result<(), SourceError> {
        self.0
            .lock()
            .map_err(|_| SourceError::new("SELECTION_UNAVAILABLE"))?
            .pending = None;
        Ok(())
    }

    fn claim(&self, token: &str) -> Result<SelectedFolder, SourceError> {
        let selected = {
            let mut slot = self
                .0
                .lock()
                .map_err(|_| SourceError::new("SELECTION_UNAVAILABLE"))?;
            match slot.pending.as_ref() {
                Some((expected, _)) if expected == token => slot.pending.take().unwrap().1,
                _ => return Err(SourceError::new("INVALID_SELECTION")),
            }
        };
        let current = validate_folder(&selected.canonical_path)?;
        if current.storage_path != selected.storage_path {
            return Err(SourceError::new("INVALID_SELECTION"));
        }
        Ok(current)
    }
}

pub(crate) fn authorize_selection(
    storage: &Storage,
    selections: &SourceSelections,
    token: &str,
) -> Result<ScanSource, SourceError> {
    let folder = selections.claim(token)?;
    storage
        .authorize_folder(&folder)
        .map_err(SourceError::database)
}

#[cfg(test)]
mod tests;
