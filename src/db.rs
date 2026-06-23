use rusqlite::{params, Connection};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

pub fn get_claude_dir() -> Result<PathBuf, String> {
    if let Ok(val) = std::env::var("CLAUDE_DIR") {
        let p = PathBuf::from(val);
        if p.exists() {
            return Ok(p);
        }
    }
    if let Some(home) = dirs::home_dir() {
        let p = home.join(".claude");
        if p.exists() {
            return Ok(p);
        }
    }
    Err("無法定位 ~/.claude 資料夾，請設定 CLAUDE_DIR 環境變數。".to_string())
}

pub fn get_db_conn() -> Result<Connection, String> {
    let claude_dir = get_claude_dir()?;
    let db_path = claude_dir.join("claude_code_token_insights.db");
    Connection::open(&db_path).map_err(|e| format!("無法開啟資料庫: {}", e))
}

pub fn init_db(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS sessions (
            session_id TEXT PRIMARY KEY,
            date TEXT NOT NULL,
            start_time TEXT NOT NULL,
            project_path TEXT,
            model TEXT,
            first_prompt TEXT,
            duration_minutes REAL,
            user_message_count INTEGER,
            input_tokens INTEGER NOT NULL DEFAULT 0,
            output_tokens INTEGER NOT NULL DEFAULT 0,
            cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
            cache_read_tokens INTEGER NOT NULL DEFAULT 0,
            total_tokens INTEGER NOT NULL DEFAULT 0,
            cost_usd REAL NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(date);
        CREATE INDEX IF NOT EXISTS idx_sessions_start_time ON sessions(start_time);
    ",
    )
    .map_err(|e| format!("建立資料表失敗: {}", e))
}

fn truncate_str(s: &str, max_bytes: usize) -> &str {
    if s.len() <= max_bytes {
        return s;
    }
    let mut end = max_bytes;
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    &s[..end]
}

fn is_skill_text(text: &str) -> bool {
    if text.starts_with("Base directory for this skill:") {
        return true;
    }
    // Skill instructions are structured markdown docs (# Title + ## Section)
    if text.starts_with("# ") && truncate_str(text, 500).contains("\n## ") {
        return true;
    }
    false
}

fn parse_date_from_iso(iso: &str) -> String {
    iso.get(..10).unwrap_or("").to_string()
}

/// Find the JSONL file for a session across all project directories
pub fn find_session_jsonl(claude_dir: &Path, session_id: &str) -> Option<PathBuf> {
    let projects_dir = claude_dir.join("projects");
    if let Ok(entries) = fs::read_dir(&projects_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let jsonl = path.join(format!("{}.jsonl", session_id));
                if jsonl.exists() {
                    return Some(jsonl);
                }
            }
        }
    }
    None
}

/// Read the JSONL and compute per-session token totals (taking the max usage per unique uuid)
pub fn compute_session_tokens(jsonl_path: &Path) -> (i64, i64, i64, i64, String) {
    let content = match fs::read_to_string(jsonl_path) {
        Ok(c) => c,
        Err(_) => return (0, 0, 0, 0, String::new()),
    };

    // Each assistant message may be streamed as multiple lines with the same uuid.
    // We take the last line per uuid (it has the final usage).
    let mut uuid_to_usage: std::collections::HashMap<String, Value> =
        std::collections::HashMap::new();
    let mut model = String::new();

    for line in content.lines() {
        let obj: Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let t = obj.get("type").and_then(|v| v.as_str()).unwrap_or("");
        if t != "assistant" {
            continue;
        }
        let uuid = obj
            .get("uuid")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        if uuid.is_empty() {
            continue;
        }
        if model.is_empty() || model == "<synthetic>" {
            if let Some(m) = obj
                .get("message")
                .and_then(|m| m.get("model"))
                .and_then(|v| v.as_str())
            {
                if m != "<synthetic>" {
                    model = m.to_string();
                }
            }
        }
        if let Some(usage) = obj.get("message").and_then(|m| m.get("usage")) {
            uuid_to_usage.insert(uuid, usage.clone());
        }
    }

    let mut input: i64 = 0;
    let mut output: i64 = 0;
    let mut cache_creation: i64 = 0;
    let mut cache_read: i64 = 0;

    for usage in uuid_to_usage.values() {
        input += usage
            .get("input_tokens")
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        output += usage
            .get("output_tokens")
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        cache_creation += usage
            .get("cache_creation_input_tokens")
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        cache_read += usage
            .get("cache_read_input_tokens")
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
    }

    (input, output, cache_creation, cache_read, model)
}

fn load_pricing() -> Vec<(String, f64, f64, f64, f64)> {
    let mut rules = Vec::new();
    let p = PathBuf::from("pricing.csv");
    let content = match fs::read_to_string(&p) {
        Ok(c) => c,
        Err(_) => return rules,
    };
    for line in content.lines().skip(1) {
        let parts: Vec<&str> = line.split(',').collect();
        if parts.len() < 7 {
            continue;
        }
        let name = parts[0].trim().to_lowercase();
        let input: f64 = parts[3].trim().parse().unwrap_or(0.0);
        let cache_read: f64 = parts[4].trim().parse().unwrap_or(0.0);
        let cache_write: f64 = parts[5].trim().parse().unwrap_or(0.0);
        let output: f64 = parts[6].trim().parse().unwrap_or(0.0);
        rules.push((name, input, cache_read, cache_write, output));
    }
    rules
}

fn compute_cost(model: &str, input: i64, output: i64, cache_creation: i64, cache_read: i64) -> f64 {
    let pricing = load_pricing();
    let model_lower = model.to_lowercase().replace(' ', "-");
    let rule = pricing.iter().find(|(name, ..)| {
        let name_normalized = name.replace(' ', "-");
        model_lower.contains(&name_normalized)
    });
    if let Some((_, input_price, cache_read_price, cache_write_price, output_price)) = rule {
        let cost = (input as f64 * input_price
            + output as f64 * output_price
            + cache_creation as f64 * cache_write_price
            + cache_read as f64 * cache_read_price)
            / 1_000_000.0;
        return cost;
    }
    0.0
}

pub fn sync_session_meta(conn: &Connection) -> Result<usize, String> {
    let claude_dir = get_claude_dir()?;
    let mut synced = 0;

    // Phase 1: Sync from session-meta JSON files (fast path, has pre-computed metadata)
    let meta_dir = claude_dir.join("usage-data").join("session-meta");
    if let Ok(entries) = fs::read_dir(&meta_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }

            let content = match fs::read_to_string(&path) {
                Ok(c) => c,
                Err(_) => continue,
            };
            let meta: Value = match serde_json::from_str(&content) {
                Ok(v) => v,
                Err(_) => continue,
            };

            let session_id = match meta.get("session_id").and_then(|v| v.as_str()) {
                Some(id) => id.to_string(),
                None => continue,
            };

            let exists: bool = conn
                .query_row(
                    "SELECT COUNT(*) FROM sessions WHERE session_id = ?1",
                    params![session_id],
                    |row| row.get::<_, i64>(0),
                )
                .unwrap_or(0)
                > 0;
            if exists {
                continue;
            }

            let start_time = meta
                .get("start_time")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if start_time.is_empty() {
                continue;
            }
            let date = parse_date_from_iso(&start_time);

            let project_path = meta
                .get("project_path")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let first_prompt = meta
                .get("first_prompt")
                .and_then(|v| v.as_str())
                .map(|s| truncate_str(s, 500).to_string());
            let duration_minutes = meta.get("duration_minutes").and_then(|v| v.as_f64());
            let user_message_count = meta.get("user_message_count").and_then(|v| v.as_i64());
            let meta_input = meta
                .get("input_tokens")
                .and_then(|v| v.as_i64())
                .unwrap_or(0);
            let meta_output = meta
                .get("output_tokens")
                .and_then(|v| v.as_i64())
                .unwrap_or(0);

            let (jsonl_input, jsonl_output, cache_creation, cache_read, model_from_jsonl) =
                if let Some(jsonl_path) = find_session_jsonl(&claude_dir, &session_id) {
                    compute_session_tokens(&jsonl_path)
                } else {
                    (0, 0, 0, 0, String::new())
                };

            let (final_input, final_output) = if jsonl_input > 0 || jsonl_output > 0 {
                (jsonl_input, jsonl_output)
            } else {
                (meta_input, meta_output)
            };

            let total = final_input + final_output + cache_creation + cache_read;
            let model = if model_from_jsonl.is_empty() {
                String::new()
            } else {
                model_from_jsonl
            };
            let cost = compute_cost(
                &model,
                final_input,
                final_output,
                cache_creation,
                cache_read,
            );

            conn.execute(
                "INSERT OR IGNORE INTO sessions
                 (session_id, date, start_time, project_path, model, first_prompt,
                  duration_minutes, user_message_count,
                  input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens,
                  total_tokens, cost_usd)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)",
                params![
                    session_id,
                    date,
                    start_time,
                    project_path,
                    model,
                    first_prompt,
                    duration_minutes,
                    user_message_count,
                    final_input,
                    final_output,
                    cache_creation,
                    cache_read,
                    total,
                    cost
                ],
            )
            .map_err(|e| format!("Insert session failed: {}", e))?;

            synced += 1;
        }
    }

    // Phase 2: Scan JSONL files directly (for sessions without session-meta)
    let projects_dir = claude_dir.join("projects");
    if let Ok(proj_entries) = fs::read_dir(&projects_dir) {
        for proj_entry in proj_entries.flatten() {
            let proj_path = proj_entry.path();
            if !proj_path.is_dir() {
                continue;
            }

            let jsonl_entries = match fs::read_dir(&proj_path) {
                Ok(e) => e,
                Err(_) => continue,
            };

            for jsonl_entry in jsonl_entries.flatten() {
                let jsonl_path = jsonl_entry.path();
                if jsonl_path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                    continue;
                }

                let session_id = match jsonl_path.file_stem().and_then(|s| s.to_str()) {
                    Some(s) => s.to_string(),
                    None => continue,
                };

                // Extract metadata directly from JSONL
                let content = match fs::read_to_string(&jsonl_path) {
                    Ok(c) => c,
                    Err(_) => continue,
                };

                let mut start_time = String::new();
                let mut first_prompt: Option<String> = None;
                let mut user_count: i64 = 0;
                let mut model = String::new();
                let mut cwd: Option<String> = None;
                let mut uuid_to_usage: std::collections::HashMap<String, Value> =
                    std::collections::HashMap::new();

                for line in content.lines() {
                    let obj: Value = match serde_json::from_str(line) {
                        Ok(v) => v,
                        Err(_) => continue,
                    };
                    let t = obj.get("type").and_then(|v| v.as_str()).unwrap_or("");

                    // First timestamp is session start
                    if start_time.is_empty() {
                        if let Some(ts) = obj.get("timestamp").and_then(|v| v.as_str()) {
                            start_time = ts.to_string();
                        }
                    }

                    match t {
                        "system" => {
                            if cwd.is_none() {
                                if let Some(c) = obj.get("cwd").and_then(|v| v.as_str()) {
                                    cwd = Some(c.to_string());
                                }
                            }
                        }
                        "user" => {
                            if let Some(msg) = obj.get("message") {
                                if let Some(content_arr) =
                                    msg.get("content").and_then(|c| c.as_array())
                                {
                                    for block in content_arr {
                                        if block.get("type").and_then(|v| v.as_str())
                                            == Some("text")
                                        {
                                            user_count += 1;
                                            if first_prompt.is_none() {
                                                let text = block
                                                    .get("text")
                                                    .and_then(|v| v.as_str())
                                                    .unwrap_or("");
                                                if !is_skill_text(text) {
                                                    first_prompt =
                                                        Some(truncate_str(text, 500).to_string());
                                                }
                                            }
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                        "assistant" => {
                            let uuid = obj
                                .get("uuid")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();
                            if uuid.is_empty() {
                                continue;
                            }
                            if model.is_empty() || model == "<synthetic>" {
                                if let Some(m) = obj
                                    .get("message")
                                    .and_then(|m| m.get("model"))
                                    .and_then(|v| v.as_str())
                                {
                                    if m != "<synthetic>" {
                                        model = m.to_string();
                                    }
                                }
                            }
                            if let Some(usage) = obj.get("message").and_then(|m| m.get("usage")) {
                                uuid_to_usage.insert(uuid, usage.clone());
                            }
                        }
                        _ => {}
                    }
                }

                if start_time.is_empty() {
                    continue;
                }

                // Skip non-Claude sessions (e.g., Codex CLI, other tools sharing ~/.claude/projects/)
                if !model.is_empty() && !model.starts_with("claude-") {
                    continue;
                }

                let date = parse_date_from_iso(&start_time);

                let project_path = cwd;

                let mut input: i64 = 0;
                let mut output: i64 = 0;
                let mut cache_creation: i64 = 0;
                let mut cache_read: i64 = 0;
                for usage in uuid_to_usage.values() {
                    input += usage
                        .get("input_tokens")
                        .and_then(|v| v.as_i64())
                        .unwrap_or(0);
                    output += usage
                        .get("output_tokens")
                        .and_then(|v| v.as_i64())
                        .unwrap_or(0);
                    cache_creation += usage
                        .get("cache_creation_input_tokens")
                        .and_then(|v| v.as_i64())
                        .unwrap_or(0);
                    cache_read += usage
                        .get("cache_read_input_tokens")
                        .and_then(|v| v.as_i64())
                        .unwrap_or(0);
                }

                let total = input + output + cache_creation + cache_read;
                let cost = compute_cost(&model, input, output, cache_creation, cache_read);

                conn.execute(
                    "INSERT OR REPLACE INTO sessions
                     (session_id, date, start_time, project_path, model, first_prompt,
                      duration_minutes, user_message_count,
                      input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens,
                      total_tokens, cost_usd)
                     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)",
                    params![
                        session_id,
                        date,
                        start_time,
                        project_path,
                        model,
                        first_prompt,
                        None::<f64>, // duration_minutes unknown from JSONL
                        user_count,
                        input,
                        output,
                        cache_creation,
                        cache_read,
                        total,
                        cost
                    ],
                )
                .map_err(|e| format!("Insert session (jsonl) failed: {}", e))?;

                synced += 1;
            }
        }
    }

    Ok(synced)
}
