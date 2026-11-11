use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NodeSummary {
    pub id: String,
    pub parent_id: Option<String>,
    pub kind: String,
    pub title: String,
    pub size_bytes: Option<String>,
    pub size_partial: bool,
    pub modified_at_ms: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Breadcrumb {
    pub id: String,
    pub title: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NodeDetail {
    pub source_id: String,
    pub scan_id: String,
    pub indexed_at: String,
    pub source_name: String,
    pub source_root_path: String,
    pub node: NodeSummary,
    pub path: String,
    pub created_at_ms: Option<String>,
    pub parent: Option<Breadcrumb>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NodePage {
    pub folder: NodeDetail,
    pub breadcrumbs: Vec<Breadcrumb>,
    pub items: Vec<NodeSummary>,
    pub next_cursor: Option<String>,
}

/// RF-003 / T-050: projeção de um único snapshot; a raiz conta no limite.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SceneProjection {
    pub root: NodeDetail,
    pub breadcrumbs: Vec<Breadcrumb>,
    pub nodes: Vec<NodeSummary>,
    pub node_limit: usize,
    pub depth_limit: usize,
    pub truncated: bool,
}
