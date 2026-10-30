-- MVP-002 / RNF-004 / T-028: base do catálogo, sem autorizar ou indexar fontes.
CREATE TABLE sources (
    id TEXT PRIMARY KEY NOT NULL,
    root_path TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE nodes (
    id TEXT PRIMARY KEY NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('file', 'folder', 'idea', 'memory')),
    origin TEXT NOT NULL CHECK (origin IN ('filesystem', 'personal')),
    title TEXT NOT NULL,
    parent_id TEXT REFERENCES nodes(id) ON DELETE RESTRICT,
    source_id TEXT REFERENCES sources(id) ON DELETE RESTRICT,
    fs_path TEXT,
    fs_path_key TEXT,
    size_bytes INTEGER CHECK (size_bytes IS NULL OR size_bytes >= 0),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (source_id, fs_path_key),
    CHECK (parent_id IS NULL OR parent_id <> id),
    CHECK (
        (origin = 'filesystem' AND kind IN ('file', 'folder')
            AND source_id IS NOT NULL AND fs_path IS NOT NULL AND fs_path_key IS NOT NULL)
        OR
        (origin = 'personal' AND kind IN ('idea', 'memory')
            AND source_id IS NULL AND fs_path IS NULL AND fs_path_key IS NULL
            AND size_bytes IS NULL)
    )
) STRICT;

CREATE INDEX nodes_parent_idx ON nodes(parent_id);
CREATE INDEX nodes_source_idx ON nodes(source_id);
