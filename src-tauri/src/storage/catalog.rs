use std::{
    collections::{HashSet, VecDeque},
    path::{Component, Path},
};

use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use super::{Storage, StorageError};
use crate::{
    catalog::{Breadcrumb, NodeDetail, NodePage, NodeSummary, SceneProjection},
    sources::{display_path, SourceError},
};

const COLUMNS: &str = "id, parent_id, kind, title, size_bytes, size_partial, fs_modified_at_ms, fs_path, fs_created_at_ms, fs_path_key";

struct Context {
    source_id: String,
    scan_id: String,
    indexed_at: String,
    name: String,
    root: String,
}
struct Node {
    summary: NodeSummary,
    path: String,
    created_ms: Option<String>,
    key: String,
}

fn database(error: rusqlite::Error) -> SourceError {
    SourceError::database(StorageError::from(error))
}
fn uuid(value: &str) -> Result<String, SourceError> {
    Uuid::parse_str(value)
        .map(|id| id.to_string())
        .map_err(|_| SourceError::new("INVALID_CATALOG_REQUEST"))
}

fn context(
    connection: &Connection,
    source_id: &str,
    scan_id: &str,
) -> Result<Context, SourceError> {
    let source: Option<(String, String, bool)> = connection
        .query_row(
            "SELECT display_name, root_path, enabled FROM sources WHERE id=?1",
            [source_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
        .map_err(database)?;
    let (name, root, enabled) = source.ok_or_else(|| SourceError::new("SOURCE_NOT_FOUND"))?;
    if !enabled {
        return Err(SourceError::new("SOURCE_NOT_AUTHORIZED"));
    }
    let report: Option<(String, String)> = connection
        .query_row(
            "SELECT scan_id, completed_at FROM scan_reports WHERE source_id=?1",
            [source_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(database)?;
    let (current, indexed_at) = report.ok_or_else(|| SourceError::new("INDEX_NOT_FOUND"))?;
    if current != scan_id {
        return Err(SourceError::new("INDEX_CHANGED"));
    }
    Ok(Context {
        source_id: source_id.into(),
        scan_id: current,
        indexed_at,
        name,
        root: display_path(&root),
    })
}

fn row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Node> {
    Ok(Node {
        summary: NodeSummary {
            id: row.get(0)?,
            parent_id: row.get(1)?,
            kind: row.get(2)?,
            title: row.get(3)?,
            size_bytes: row.get::<_, Option<i64>>(4)?.map(|bytes| bytes.to_string()),
            size_partial: row.get(5)?,
            modified_at_ms: row.get(6)?,
        },
        path: display_path(&row.get::<_, String>(7)?),
        created_ms: row.get(8)?,
        key: row.get(9)?,
    })
}

fn validate_path(node: &Node, context: &Context) -> Result<(), SourceError> {
    let path = Path::new(&node.path);
    if !path.is_absolute()
        || !path.starts_with(&context.root)
        || path
            .components()
            .any(|component| matches!(component, Component::ParentDir))
    {
        return Err(SourceError::new("INVALID_CATALOG"));
    }
    Ok(())
}

fn node(connection: &Connection, context: &Context, id: &str) -> Result<Node, SourceError> {
    let sql = format!(
        "SELECT {COLUMNS} FROM nodes WHERE id=?1 AND source_id=?2 AND scan_id=?3
        AND origin='filesystem' AND kind IN ('file','folder')"
    );
    let node = connection
        .query_row(&sql, params![id, context.source_id, context.scan_id], row)
        .optional()
        .map_err(database)?
        .ok_or_else(|| SourceError::new("NODE_NOT_FOUND"))?;
    validate_path(&node, context)?;
    Ok(node)
}

fn breadcrumbs(
    connection: &Connection,
    context: &Context,
    item: &Node,
) -> Result<Vec<Breadcrumb>, SourceError> {
    let mut chain = vec![Breadcrumb {
        id: item.summary.id.clone(),
        title: item.summary.title.clone(),
    }];
    let mut seen = HashSet::from([item.summary.id.clone()]);
    let mut parent_id = item.summary.parent_id.clone();
    let mut child_path = item.path.clone();
    let mut root_key = item.key.clone();
    let mut root_kind = item.summary.kind.clone();
    while let Some(id) = parent_id {
        if chain.len() >= 32 || !seen.insert(id.clone()) {
            return Err(SourceError::new("INVALID_CATALOG"));
        }
        let parent = node(connection, context, &id).map_err(|error| {
            if error.code == "NODE_NOT_FOUND" {
                SourceError::new("INVALID_CATALOG")
            } else {
                error
            }
        })?;
        if parent.summary.kind != "folder"
            || Path::new(&child_path).parent() != Some(Path::new(&parent.path))
        {
            return Err(SourceError::new("INVALID_CATALOG"));
        }
        chain.push(Breadcrumb {
            id: parent.summary.id,
            title: parent.summary.title,
        });
        parent_id = parent.summary.parent_id;
        child_path = parent.path;
        root_key = parent.key;
        root_kind = parent.summary.kind;
    }
    if root_key != "."
        || root_kind != "folder"
        || Path::new(&child_path) != Path::new(&context.root)
    {
        return Err(SourceError::new("INVALID_CATALOG"));
    }
    chain.reverse();
    Ok(chain)
}

fn detail(context: &Context, item: Node, chain: &[Breadcrumb]) -> NodeDetail {
    let parent = chain.len().checked_sub(2).map(|index| Breadcrumb {
        id: chain[index].id.clone(),
        title: chain[index].title.clone(),
    });
    NodeDetail {
        source_id: context.source_id.clone(),
        scan_id: context.scan_id.clone(),
        indexed_at: context.indexed_at.clone(),
        source_name: context.name.clone(),
        source_root_path: context.root.clone(),
        node: item.summary,
        path: item.path,
        created_at_ms: item.created_ms,
        parent,
    }
}

impl Storage {
    pub(crate) fn scene_projection(
        &self,
        source_id: &str,
        scan_id: &str,
        folder_id: Option<&str>,
    ) -> Result<SceneProjection, SourceError> {
        const NODE_LIMIT: usize = 100;
        const DEPTH_LIMIT: usize = 3;
        let (source_id, scan_id) = (uuid(source_id)?, uuid(scan_id)?);
        let folder_id = folder_id.map(uuid).transpose()?;
        let mut handle = self.database().map_err(SourceError::database)?;
        let transaction = handle.connection.transaction().map_err(database)?;
        let context = context(&transaction, &source_id, &scan_id)?;
        let sql = format!(
            "SELECT {COLUMNS} FROM nodes WHERE source_id=?1 AND scan_id=?2
            AND fs_path_key='.' AND parent_id IS NULL AND kind='folder' AND origin='filesystem'"
        );
        let root = if let Some(id) = folder_id {
            node(&transaction, &context, &id)?
        } else {
            transaction
                .query_row(&sql, params![source_id, scan_id], row)
                .optional()
                .map_err(database)?
                .ok_or_else(|| SourceError::new("INDEX_EMPTY"))?
        };
        if root.summary.kind != "folder" {
            return Err(SourceError::new("NOT_A_FOLDER"));
        }
        validate_path(&root, &context)?;
        let chain = breadcrumbs(&transaction, &context, &root)?;
        let mut queue = VecDeque::from([(root.summary.id.clone(), root.path.clone(), 0)]);
        let mut seen = HashSet::from([root.summary.id.clone()]);
        let mut nodes = Vec::new();
        let mut truncated = false;
        let sql = format!(
            "SELECT {COLUMNS} FROM nodes WHERE source_id=?1 AND scan_id=?2
            AND parent_id=?3 AND origin='filesystem' AND kind IN ('folder','file')
            ORDER BY CASE kind WHEN 'folder' THEN 0 ELSE 1 END, title COLLATE BINARY, id LIMIT ?4"
        );
        let mut statement = transaction.prepare(&sql).map_err(database)?;
        while let Some((parent_id, parent_path, depth)) = queue.pop_front() {
            let remaining = if depth == DEPTH_LIMIT {
                0
            } else {
                NODE_LIMIT - 1 - nodes.len()
            };
            // Mesmo no limite, ler um sentinela permite anunciar truncamento sem inventar contagens.
            let children = statement
                .query_map(
                    params![source_id, scan_id, parent_id, (remaining + 1) as u32],
                    row,
                )
                .map_err(database)?
                .collect::<rusqlite::Result<Vec<_>>>()
                .map_err(database)?;
            truncated |= children.len() > remaining;
            for item in children.into_iter().take(remaining) {
                validate_path(&item, &context)?;
                if !seen.insert(item.summary.id.clone())
                    || Path::new(&item.path).parent() != Some(Path::new(&parent_path))
                {
                    return Err(SourceError::new("INVALID_CATALOG"));
                }
                if item.summary.kind == "folder" {
                    queue.push_back((item.summary.id.clone(), item.path, depth + 1));
                }
                nodes.push(item.summary);
            }
        }
        Ok(SceneProjection {
            root: detail(&context, root, &chain),
            breadcrumbs: chain,
            nodes,
            node_limit: NODE_LIMIT,
            depth_limit: DEPTH_LIMIT,
            truncated,
        })
    }

    pub(crate) fn node_detail(
        &self,
        source_id: &str,
        scan_id: &str,
        node_id: &str,
    ) -> Result<NodeDetail, SourceError> {
        let (source_id, scan_id, node_id) = (uuid(source_id)?, uuid(scan_id)?, uuid(node_id)?);
        let mut database_handle = self.database().map_err(SourceError::database)?;
        let transaction = database_handle.connection.transaction().map_err(database)?;
        let context = context(&transaction, &source_id, &scan_id)?;
        let item = node(&transaction, &context, &node_id)?;
        let chain = breadcrumbs(&transaction, &context, &item)?;
        Ok(detail(&context, item, &chain))
    }

    pub(crate) fn node_children(
        &self,
        source_id: &str,
        scan_id: &str,
        folder_id: Option<&str>,
        cursor: Option<&str>,
        limit: u32,
    ) -> Result<NodePage, SourceError> {
        if !(1..=100).contains(&limit) {
            return Err(SourceError::new("INVALID_PAGE"));
        }
        let (source_id, scan_id) = (uuid(source_id)?, uuid(scan_id)?);
        let folder_id = folder_id.map(uuid).transpose()?;
        let cursor = cursor.map(uuid).transpose()?;
        let mut database_handle = self.database().map_err(SourceError::database)?;
        let transaction = database_handle.connection.transaction().map_err(database)?;
        let context = context(&transaction, &source_id, &scan_id)?;
        let folder = match folder_id {
            Some(id) => node(&transaction, &context, &id)?,
            None => {
                let sql = format!("SELECT {COLUMNS} FROM nodes WHERE source_id=?1 AND scan_id=?2
                    AND fs_path_key='.' AND parent_id IS NULL AND kind='folder' AND origin='filesystem'");
                let item = transaction
                    .query_row(&sql, params![source_id, scan_id], row)
                    .optional()
                    .map_err(database)?
                    .ok_or_else(|| SourceError::new("INDEX_EMPTY"))?;
                validate_path(&item, &context)?;
                item
            }
        };
        if folder.summary.kind != "folder" {
            return Err(SourceError::new("NOT_A_FOLDER"));
        }
        let chain = breadcrumbs(&transaction, &context, &folder)?;
        let after = if let Some(id) = cursor {
            let item = node(&transaction, &context, &id).map_err(|error| {
                if error.code == "NODE_NOT_FOUND" {
                    SourceError::new("INVALID_CURSOR")
                } else {
                    error
                }
            })?;
            if item.summary.parent_id.as_deref() != Some(&folder.summary.id) {
                return Err(SourceError::new("INVALID_CURSOR"));
            }
            (
                i32::from(item.summary.kind != "folder"),
                item.summary.title,
                item.summary.id,
            )
        } else {
            (-1, String::new(), String::new())
        };
        // Ordenação/keyset fixos, usando o título obtido no banco; o cursor externo é somente UUID.
        let sql = format!(
            "SELECT {COLUMNS} FROM nodes WHERE source_id=?1 AND scan_id=?2 AND parent_id=?3
            AND origin='filesystem' AND kind IN ('folder','file')
            AND (CASE kind WHEN 'folder' THEN 0 ELSE 1 END, title COLLATE BINARY, id) > (?4, ?5, ?6)
            ORDER BY CASE kind WHEN 'folder' THEN 0 ELSE 1 END, title COLLATE BINARY, id LIMIT ?7"
        );
        let mut statement = transaction.prepare(&sql).map_err(database)?;
        let mut nodes = statement
            .query_map(
                params![
                    source_id,
                    scan_id,
                    folder.summary.id,
                    after.0,
                    after.1,
                    after.2,
                    limit + 1
                ],
                row,
            )
            .map_err(database)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(database)?;
        let has_more = nodes.len() > limit as usize;
        if has_more {
            nodes.pop();
        }
        for item in &nodes {
            validate_path(item, &context)?;
            if Path::new(&item.path).parent() != Some(Path::new(&folder.path)) {
                return Err(SourceError::new("INVALID_CATALOG"));
            }
        }
        let next_cursor = if has_more {
            nodes.last().map(|node| node.summary.id.clone())
        } else {
            None
        };
        Ok(NodePage {
            folder: detail(&context, folder, &chain),
            breadcrumbs: chain,
            items: nodes.into_iter().map(|node| node.summary).collect(),
            next_cursor,
        })
    }
}

#[cfg(test)]
mod tests;
