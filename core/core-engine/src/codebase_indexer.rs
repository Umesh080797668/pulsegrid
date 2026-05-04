use sqlx::PgPool;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tree_sitter::{Node, Parser};
use walkdir::WalkDir;

#[derive(Debug, Clone, serde::Serialize)]
struct FunctionSignature {
    name: String,
    signature: String,
    line: usize,
}

#[derive(Debug, Clone, Copy)]
enum IndexLanguage {
    Rust,
    TypeScript,
    Java,
}

impl IndexLanguage {
    fn as_str(self) -> &'static str {
        match self {
            IndexLanguage::Rust => "rust",
            IndexLanguage::TypeScript => "typescript",
            IndexLanguage::Java => "java",
        }
    }
}

pub fn spawn_codebase_indexer(pool: PgPool) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(900));
        loop {
            interval.tick().await;
            match rebuild_codebase_index(&pool).await {
                Ok(count) => tracing::info!(indexed_files = count, "codebase index rebuild complete"),
                Err(error) => tracing::error!(error = %error, "codebase index rebuild failed"),
            }
        }
    });
}

pub async fn rebuild_codebase_index(pool: &PgPool) -> Result<usize, Box<dyn std::error::Error + Send + Sync>> {
    let repo_root = resolve_repo_root()?;
    let git_sha = resolve_git_sha(&repo_root);

    let mut indexed = 0usize;

    for entry in WalkDir::new(&repo_root)
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|e| e.file_type().is_file())
    {
        let path = entry.path();

        if should_skip_path(path, &repo_root) {
            continue;
        }

        let Some(language) = language_for_path(path) else {
            continue;
        };

        let content = match std::fs::read_to_string(path) {
            Ok(content) => content,
            Err(_) => continue,
        };

        if content.trim().is_empty() {
            continue;
        }

        let signatures = match extract_function_signatures(language, &content) {
            Ok(sig) => sig,
            Err(_) => continue,
        };

        if signatures.is_empty() {
            continue;
        }

        let patterns = build_error_patterns(path, &signatures);
        let rel_path = path
            .strip_prefix(&repo_root)
            .unwrap_or(path)
            .to_string_lossy()
            .replace('\\', "/");

        let function_sigs = serde_json::to_value(&signatures)?;

        sqlx::query(
            r#"
            INSERT INTO guard.codebase_index
                (file_path, language, function_sigs, error_patterns, last_indexed_at, git_sha)
            VALUES ($1, $2, $3, $4, NOW(), $5)
            ON CONFLICT (file_path)
            DO UPDATE SET
                language = EXCLUDED.language,
                function_sigs = EXCLUDED.function_sigs,
                error_patterns = EXCLUDED.error_patterns,
                last_indexed_at = NOW(),
                git_sha = EXCLUDED.git_sha
            "#,
        )
        .bind(rel_path)
        .bind(language.as_str())
        .bind(function_sigs)
        .bind(patterns)
        .bind(&git_sha)
        .execute(pool)
        .await?;

        indexed += 1;
    }

    Ok(indexed)
}

fn resolve_repo_root() -> Result<PathBuf, Box<dyn std::error::Error + Send + Sync>> {
    let mut current = std::env::current_dir()?;

    loop {
        if current.join(".git").exists() {
            return Ok(current);
        }

        if current.join("core").exists() && current.join("guard").exists() {
            return Ok(current);
        }

        if !current.pop() {
            break;
        }
    }

    Ok(std::env::current_dir()?)
}

fn resolve_git_sha(repo_root: &Path) -> String {
    std::process::Command::new("git")
        .arg("rev-parse")
        .arg("HEAD")
        .current_dir(repo_root)
        .output()
        .ok()
        .and_then(|output| {
            if output.status.success() {
                Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
            } else {
                None
            }
        })
        .filter(|sha| !sha.is_empty())
        .unwrap_or_else(|| "unknown".to_string())
}

fn should_skip_path(path: &Path, repo_root: &Path) -> bool {
    let rel = path
        .strip_prefix(repo_root)
        .unwrap_or(path)
        .to_string_lossy()
        .to_lowercase();

    rel.contains("/target/")
        || rel.contains("/node_modules/")
        || rel.contains("/build/")
        || rel.contains("/dist/")
        || rel.contains("/core-vault/")
        || rel.contains("/vault/")
        || rel.contains("/auth/")
}

fn language_for_path(path: &Path) -> Option<IndexLanguage> {
    let ext = path.extension()?.to_string_lossy().to_lowercase();
    match ext.as_str() {
        "rs" => Some(IndexLanguage::Rust),
        "ts" | "tsx" => Some(IndexLanguage::TypeScript),
        "java" => Some(IndexLanguage::Java),
        _ => None,
    }
}

fn extract_function_signatures(
    language: IndexLanguage,
    source: &str,
) -> Result<Vec<FunctionSignature>, Box<dyn std::error::Error + Send + Sync>> {
    let mut parser = Parser::new();

    match language {
        IndexLanguage::Rust => parser.set_language(&tree_sitter_rust::LANGUAGE.into())?,
        IndexLanguage::TypeScript => {
            parser.set_language(&tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into())?
        }
        IndexLanguage::Java => parser.set_language(&tree_sitter_java::LANGUAGE.into())?,
    }

    let Some(tree) = parser.parse(source, None) else {
        return Ok(vec![]);
    };

    let mut signatures = Vec::new();
    let mut stack = vec![tree.root_node()];

    while let Some(node) = stack.pop() {
        let kind = node.kind();
        match language {
            IndexLanguage::Rust if kind == "function_item" => {
                if let Some(sig) = build_rust_signature(node, source) {
                    signatures.push(sig);
                }
            }
            IndexLanguage::TypeScript
                if kind == "function_declaration" || kind == "method_definition" =>
            {
                if let Some(sig) = build_typescript_signature(node, source) {
                    signatures.push(sig);
                }
            }
            IndexLanguage::Java
                if kind == "method_declaration" || kind == "constructor_declaration" =>
            {
                if let Some(sig) = build_java_signature(node, source) {
                    signatures.push(sig);
                }
            }
            _ => {}
        }

        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            stack.push(child);
        }
    }

    Ok(signatures)
}

fn build_rust_signature(node: Node<'_>, source: &str) -> Option<FunctionSignature> {
    let name = node.child_by_field_name("name")?;
    let params = node.child_by_field_name("parameters")?;
    let return_type = node
        .child_by_field_name("return_type")
        .map(|n| normalize_ws(&node_text(n, source)))
        .unwrap_or_default();

    let name_text = node_text(name, source);
    let params_text = normalize_ws(&node_text(params, source));
    let signature = if return_type.is_empty() {
        format!("fn {}{}", name_text, params_text)
    } else {
        format!("fn {}{} -> {}", name_text, params_text, return_type)
    };

    Some(FunctionSignature {
        name: name_text,
        signature,
        line: node.start_position().row + 1,
    })
}

fn build_typescript_signature(node: Node<'_>, source: &str) -> Option<FunctionSignature> {
    let name_node = node.child_by_field_name("name")?;
    let params_node = node.child_by_field_name("parameters")?;

    let name_text = normalize_ws(&node_text(name_node, source));
    let params = normalize_ws(&node_text(params_node, source));
    let return_type = node
        .child_by_field_name("return_type")
        .map(|n| normalize_ws(&node_text(n, source)))
        .unwrap_or_default();

    let signature = if return_type.is_empty() {
        format!("function {}{}", name_text, params)
    } else {
        format!("function {}{}: {}", name_text, params, return_type)
    };

    Some(FunctionSignature {
        name: name_text,
        signature,
        line: node.start_position().row + 1,
    })
}

fn build_java_signature(node: Node<'_>, source: &str) -> Option<FunctionSignature> {
    let name_node = node.child_by_field_name("name")?;
    let params_node = node.child_by_field_name("parameters")?;

    let name_text = normalize_ws(&node_text(name_node, source));
    let params = normalize_ws(&node_text(params_node, source));
    let return_type = node
        .child_by_field_name("type")
        .map(|n| normalize_ws(&node_text(n, source)))
        .unwrap_or_default();

    let signature = if return_type.is_empty() {
        format!("{}{}", name_text, params)
    } else {
        format!("{} {}{}", return_type, name_text, params)
    };

    Some(FunctionSignature {
        name: name_text,
        signature,
        line: node.start_position().row + 1,
    })
}

fn node_text(node: Node<'_>, source: &str) -> String {
    source
        .get(node.start_byte()..node.end_byte())
        .unwrap_or_default()
        .to_string()
}

fn normalize_ws(input: &str) -> String {
    input
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string()
}

fn build_error_patterns(path: &Path, signatures: &[FunctionSignature]) -> Vec<String> {
    let mut patterns = std::collections::HashSet::new();

    if let Some(file_name) = path.file_name().and_then(|f| f.to_str()) {
        patterns.insert(file_name.to_lowercase());
    }

    for sig in signatures {
        for token in sig
            .signature
            .split(|c: char| !c.is_alphanumeric() && c != '_')
            .filter(|token| token.len() >= 4)
        {
            patterns.insert(token.to_lowercase());
        }

        patterns.insert(sig.name.to_lowercase());
    }

    patterns.extend([
        "panic".to_string(),
        "oom".to_string(),
        "timeout".to_string(),
        "unhandled".to_string(),
        "exception".to_string(),
    ]);

    patterns.into_iter().collect()
}
