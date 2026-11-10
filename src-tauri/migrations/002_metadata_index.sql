ALTER TABLE nodes ADD COLUMN fs_created_at_ms TEXT;
ALTER TABLE nodes ADD COLUMN fs_modified_at_ms TEXT;
ALTER TABLE nodes ADD COLUMN size_partial INTEGER NOT NULL DEFAULT 0 CHECK (size_partial IN (0, 1));
ALTER TABLE nodes ADD COLUMN scan_id TEXT;
CREATE INDEX nodes_scan_idx ON nodes(source_id, scan_id);

CREATE TABLE scan_reports (
    source_id TEXT PRIMARY KEY NOT NULL REFERENCES sources(id) ON DELETE RESTRICT,
    scan_id TEXT NOT NULL,
    completed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    files_count INTEGER NOT NULL CHECK (files_count >= 0),
    folders_count INTEGER NOT NULL CHECK (folders_count >= 0),
    total_bytes INTEGER NOT NULL CHECK (total_bytes >= 0),
    skipped_count INTEGER NOT NULL CHECK (skipped_count >= 0),
    error_count INTEGER NOT NULL CHECK (error_count >= 0),
    partial INTEGER NOT NULL CHECK (partial IN (0, 1))
) STRICT;

CREATE TABLE scan_issues (
    source_id TEXT NOT NULL REFERENCES scan_reports(source_id) ON DELETE RESTRICT,
    ordinal INTEGER NOT NULL CHECK (ordinal >= 0 AND ordinal < 100),
    relative_path TEXT NOT NULL,
    code TEXT NOT NULL,
    PRIMARY KEY (source_id, ordinal)
) STRICT;
