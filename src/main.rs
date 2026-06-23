use axum::{
    extract::Path,
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use serde::Serialize;
use std::{
    collections::HashMap,
    fs::{self, File},
    io::{BufRead, BufReader},
    path::PathBuf,
};
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;
use rusqlite::params;
mod db;

#[tokio::main]
async fn main() {
    if let Ok(conn) = db::get_db_conn() {
        if let Err(e) = db::init_db(&conn) {
            eprintln!("初始化 SQLite 失敗: {}", e);
        } else if let Err(e) = db::sync_session_meta(&conn) {
            eprintln!("初次同步 session-meta 失敗: {}", e);
        } else {
            println!("SQLite 已完成增量同步！");
        }
    } else {
        eprintln!("無法連接 SQLite，請確認 ~/.claude 是否存在或設定 CLAUDE_DIR");
    }

    let app = Router::new()
        .route("/api/dates", get(get_available_dates))
        .route("/api/setup-info", get(get_setup_info))
        .route("/api/usage/:date", get(get_usage_details))
        .route("/api/session/:session_id", get(get_session_details))
        .route("/api/months", get(get_available_months))
        .route("/api/monthly/:year_month", get(get_monthly_details))
        .route("/api/pricing", get(get_pricing))
        .route("/api/sync", get(trigger_manual_sync))
        .nest_service("/static", ServeDir::new("static"))
        .fallback_service(ServeDir::new("static"))
        .layer(CorsLayer::permissive());

    let port = std::env::var("PORT").unwrap_or_else(|_| "3000".to_string());
    let addr = format!("127.0.0.1:{}", port);
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    println!("Claude Code Token Insights running at: http://localhost:{}", port);
    axum::serve(listener, app).await.unwrap();
}

// =========================================================================
// GET /api/setup-info
// =========================================================================
#[derive(Serialize)]
struct SetupInfoResponse {
    claude_dir: String,
    claude_dir_exists: bool,
}

async fn get_setup_info() -> impl IntoResponse {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/home/user"));
    let claude_dir_path = home.join(".claude");
    let claude_dir_exists = claude_dir_path.exists();
    let claude_dir = std::env::var("CLAUDE_DIR")
        .unwrap_or_else(|_| claude_dir_path.to_string_lossy().into_owned());
    Json(SetupInfoResponse { claude_dir, claude_dir_exists })
}

// =========================================================================
// GET /api/dates
// =========================================================================
#[derive(Serialize)]
struct DateListResponse { dates: Vec<String> }

async fn get_available_dates() -> impl IntoResponse {
    let _ = tokio::task::spawn_blocking(|| {
        if let Ok(conn) = db::get_db_conn() { let _ = db::sync_session_meta(&conn); }
    }).await;

    let res: Result<Vec<String>, String> = tokio::task::spawn_blocking(|| {
        let conn = db::get_db_conn()?;
        let mut stmt = conn.prepare(
            "SELECT DISTINCT date FROM sessions ORDER BY date DESC"
        ).map_err(|e| e.to_string())?;
        let dates = stmt.query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .flatten().collect();
        Ok(dates)
    }).await.unwrap_or_else(|_| Err("執行緒失敗".to_string()));

    match res {
        Ok(dates) => Json(DateListResponse { dates }).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e}))).into_response(),
    }
}

// =========================================================================
// GET /api/usage/:date
// =========================================================================
#[derive(Serialize, Clone)]
struct SessionSummary {
    session_id: String,
    date: String,
    start_time: String,
    project_path: Option<String>,
    model: String,
    first_prompt: Option<String>,
    duration_minutes: Option<f64>,
    user_message_count: Option<i64>,
    total_input_tokens: i64,
    total_output_tokens: i64,
    total_cache_creation_tokens: i64,
    total_cache_read_tokens: i64,
    total_tokens: i64,
    cost_usd: f64,
}

#[derive(Serialize)]
struct DaySummary {
    total_sessions: usize,
    total_tokens: i64,
    total_input_tokens: i64,
    total_output_tokens: i64,
    total_cache_creation_tokens: i64,
    total_cache_read_tokens: i64,
    total_cost_usd: f64,
    total_duration_minutes: f64,
}

#[derive(Serialize)]
struct UsageDetailsResponse {
    date: String,
    summary: DaySummary,
    sessions: Vec<SessionSummary>,
}

async fn get_usage_details(Path(date): Path<String>) -> impl IntoResponse {
    let date_clone = date.clone();
    let res: Result<Vec<SessionSummary>, String> = tokio::task::spawn_blocking(move || {
        let conn = db::get_db_conn()?;
        let mut stmt = conn.prepare(
            "SELECT session_id, date, start_time, project_path, model, first_prompt,
                    duration_minutes, user_message_count,
                    input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens,
                    total_tokens, cost_usd
             FROM sessions WHERE date = ?1 ORDER BY start_time ASC"
        ).map_err(|e| e.to_string())?;
        let sessions: Vec<SessionSummary> = stmt.query_map(params![date_clone], |row| {
            Ok(SessionSummary {
                session_id: row.get(0)?,
                date: row.get(1)?,
                start_time: row.get(2)?,
                project_path: row.get(3)?,
                model: row.get::<_,Option<String>>(4)?.unwrap_or_default(),
                first_prompt: row.get(5)?,
                duration_minutes: row.get(6)?,
                user_message_count: row.get(7)?,
                total_input_tokens: row.get(8)?,
                total_output_tokens: row.get(9)?,
                total_cache_creation_tokens: row.get(10)?,
                total_cache_read_tokens: row.get(11)?,
                total_tokens: row.get(12)?,
                cost_usd: row.get(13)?,
            })
        }).map_err(|e| e.to_string())?
        .flatten().collect();
        Ok(sessions)
    }).await.unwrap_or_else(|_| Err("執行緒失敗".to_string()));

    match res {
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e}))).into_response(),
        Ok(sessions) => {
            if sessions.is_empty() {
                return (StatusCode::NOT_FOUND, Json(serde_json::json!({"error": "找不到該日期的資料"}))).into_response();
            }
            let total_sessions = sessions.len();
            let total_tokens: i64 = sessions.iter().map(|s| s.total_tokens).sum();
            let total_input_tokens: i64 = sessions.iter().map(|s| s.total_input_tokens).sum();
            let total_output_tokens: i64 = sessions.iter().map(|s| s.total_output_tokens).sum();
            let total_cache_creation_tokens: i64 = sessions.iter().map(|s| s.total_cache_creation_tokens).sum();
            let total_cache_read_tokens: i64 = sessions.iter().map(|s| s.total_cache_read_tokens).sum();
            let total_cost_usd: f64 = sessions.iter().map(|s| s.cost_usd).sum();
            let total_duration_minutes: f64 = sessions.iter().filter_map(|s| s.duration_minutes).sum();
            let summary = DaySummary {
                total_sessions, total_tokens, total_input_tokens, total_output_tokens,
                total_cache_creation_tokens, total_cache_read_tokens, total_cost_usd, total_duration_minutes,
            };
            Json(UsageDetailsResponse { date, summary, sessions }).into_response()
        }
    }
}

// =========================================================================
// GET /api/session/:session_id  — timeline from JSONL
// =========================================================================
#[derive(Serialize)]
struct SessionTimelineResponse {
    session_id: String,
    metadata: HashMap<String, serde_json::Value>,
    timeline: Vec<TimelineItem>,
}

#[derive(Serialize)]
#[serde(tag = "event_type", content = "event_data")]
enum TimelineItem {
    UserPrompt {
        timestamp: String,
        prompt: String,
        turn_no: u32,
    },
    AssistantReply {
        timestamp: String,
        reply: String,
        model: String,
        usage: serde_json::Value,
        tool_calls: Vec<serde_json::Value>,
        turn_no: u32,
    },
    ToolResult {
        timestamp: String,
        tool_use_id: String,
        tool_name: String,
        is_error: bool,
        result: serde_json::Value,
        turn_no: u32,
    },
    SystemStatus {
        timestamp: String,
        status_type: String,
        message: String,
    },
}

async fn get_session_details(Path(session_id): Path<String>) -> impl IntoResponse {
    let claude_dir = match db::get_claude_dir() {
        Ok(d) => d,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e}))).into_response(),
    };

    let jsonl_path = match db::find_session_jsonl(&claude_dir, &session_id) {
        Some(p) => p,
        None => return (StatusCode::NOT_FOUND, Json(serde_json::json!({"error": format!("找不到 Session {} 的 JSONL", session_id)}))).into_response(),
    };

    let file = match File::open(&jsonl_path) {
        Ok(f) => f,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": format!("開啟檔案失敗: {}", e)}))).into_response(),
    };

    // Also load session-meta for metadata
    let meta_path = claude_dir.join("usage-data").join("session-meta").join(format!("{}.json", session_id));
    let mut metadata: HashMap<String, serde_json::Value> = HashMap::new();
    if let Ok(content) = fs::read_to_string(&meta_path) {
        if let Ok(meta) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(pp) = meta.get("project_path") { metadata.insert("project_path".to_string(), pp.clone()); }
            if let Some(dm) = meta.get("duration_minutes") { metadata.insert("duration_minutes".to_string(), dm.clone()); }
            if let Some(st) = meta.get("start_time") { metadata.insert("start_time".to_string(), st.clone()); }
        }
    }

    let reader = BufReader::new(file);
    let mut timeline: Vec<TimelineItem> = Vec::new();
    let mut turn_no: u32 = 0;

    // Track seen UUIDs to deduplicate streamed assistant messages
    // For each uuid, keep the last line (final state)
    let assistant_lines: Vec<(String, String)> = Vec::new(); // (uuid, line)
    let mut ordered_uuids: Vec<String> = Vec::new();
    let mut uuid_to_last_line: HashMap<String, String> = HashMap::new();
    let mut all_lines: Vec<String> = Vec::new();

    for line_result in reader.lines() {
        let line = match line_result { Ok(l) => l, Err(_) => continue };
        let obj: serde_json::Value = match serde_json::from_str(&line) { Ok(v) => v, Err(_) => continue };
        let t = obj.get("type").and_then(|v| v.as_str()).unwrap_or("");
        let uuid = obj.get("uuid").and_then(|v| v.as_str()).unwrap_or("").to_string();
        if t == "assistant" && !uuid.is_empty() {
            if !ordered_uuids.contains(&uuid) {
                ordered_uuids.push(uuid.clone());
                all_lines.push(format!("__ASSISTANT__{}", uuid));
            }
            uuid_to_last_line.insert(uuid, line);
        } else {
            all_lines.push(line);
        }
        let _ = assistant_lines; // suppress warning
    }

    // Now process in order
    let mut tool_name_map: HashMap<String, String> = HashMap::new(); // tool_use_id -> tool_name

    for raw in &all_lines {
        if let Some(uuid) = raw.strip_prefix("__ASSISTANT__") {
            let line = match uuid_to_last_line.get(uuid) { Some(l) => l, None => continue };
            let obj: serde_json::Value = match serde_json::from_str(line) { Ok(v) => v, Err(_) => continue };
            let msg = match obj.get("message") { Some(m) => m, None => continue };
            let timestamp = obj.get("timestamp").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let model = msg.get("model").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let usage = msg.get("usage").cloned().unwrap_or(serde_json::Value::Null);
            let content = msg.get("content").and_then(|v| v.as_array()).cloned().unwrap_or_default();

            let mut text_parts: Vec<String> = Vec::new();
            let mut tool_calls: Vec<serde_json::Value> = Vec::new();

            for block in &content {
                let block_type = block.get("type").and_then(|v| v.as_str()).unwrap_or("");
                match block_type {
                    "text" => {
                        if let Some(t) = block.get("text").and_then(|v| v.as_str()) {
                            text_parts.push(t.to_string());
                        }
                    }
                    "thinking" => {}
                    "tool_use" => {
                        let tool_id = block.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                        let tool_name = block.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                        if !tool_id.is_empty() {
                            tool_name_map.insert(tool_id.clone(), tool_name.clone());
                        }
                        let tc = serde_json::json!({
                            "id": tool_id,
                            "name": tool_name,
                            "input": block.get("input").cloned().unwrap_or(serde_json::Value::Null)
                        });
                        tool_calls.push(tc);
                    }
                    _ => {}
                }
            }

            let reply = text_parts.join("\n");
            timeline.push(TimelineItem::AssistantReply {
                timestamp,
                reply,
                model,
                usage,
                tool_calls,
                turn_no,
            });
        } else {
            let obj: serde_json::Value = match serde_json::from_str(raw) { Ok(v) => v, Err(_) => continue };
            let t = obj.get("type").and_then(|v| v.as_str()).unwrap_or("");
            let timestamp = obj.get("timestamp").and_then(|v| v.as_str()).unwrap_or("").to_string();

            match t {
                "user" => {
                    let msg = match obj.get("message") { Some(m) => m, None => continue };
                    let content = msg.get("content");
                    match content {
                        Some(serde_json::Value::String(s)) => {
                            if s.is_empty() { continue; }
                            turn_no += 1;
                            timeline.push(TimelineItem::UserPrompt {
                                timestamp,
                                prompt: s.clone(),
                                turn_no,
                            });
                        }
                        Some(serde_json::Value::Array(arr)) => {
                            let mut prompt_text = String::new();
                            let mut tool_results: Vec<(String, bool, serde_json::Value)> = Vec::new();

                            for block in arr {
                                let block_type = block.get("type").and_then(|v| v.as_str()).unwrap_or("");
                                match block_type {
                                    "text" => {
                                        if let Some(s) = block.get("text").and_then(|v| v.as_str()) {
                                            prompt_text.push_str(s);
                                        }
                                    }
                                    "tool_result" => {
                                        let tool_use_id = block.get("tool_use_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                        let is_error = block.get("is_error").and_then(|v| v.as_bool()).unwrap_or(false);
                                        let result_content = block.get("content").cloned().unwrap_or(serde_json::Value::Null);
                                        let result = serde_json::json!({
                                            "toolUseResult": {
                                                "stdout": if let Some(s) = result_content.as_str() { s.to_string() }
                                                          else { serde_json::to_string(&result_content).unwrap_or_default() },
                                                "stderr": ""
                                            }
                                        });
                                        tool_results.push((tool_use_id, is_error, result));
                                    }
                                    _ => {}
                                }
                            }

                            if !prompt_text.is_empty() {
                                turn_no += 1;
                                timeline.push(TimelineItem::UserPrompt {
                                    timestamp: timestamp.clone(),
                                    prompt: prompt_text,
                                    turn_no,
                                });
                            }

                            for (tool_use_id, is_error, result) in tool_results {
                                let tool_name = tool_name_map.get(&tool_use_id).cloned().unwrap_or_default();
                                timeline.push(TimelineItem::ToolResult {
                                    timestamp: timestamp.clone(),
                                    tool_use_id,
                                    tool_name,
                                    is_error,
                                    result,
                                    turn_no,
                                });
                            }
                        }
                        _ => {}
                    }
                }
                "summary" => {
                    timeline.push(TimelineItem::SystemStatus {
                        timestamp,
                        status_type: "session_compaction".to_string(),
                        message: "會話狀態壓縮完成 (Session Compaction Completed)".to_string(),
                    });
                }
                _ => {}
            }
        }
    }

    // Compute metadata token totals from timeline
    let mut total_input: i64 = 0;
    let mut total_output: i64 = 0;
    let mut total_cache_creation: i64 = 0;
    let mut total_cache_read: i64 = 0;
    for item in &timeline {
        if let TimelineItem::AssistantReply { usage, .. } = item {
            total_input += usage.get("input_tokens").and_then(|v| v.as_i64()).unwrap_or(0);
            total_output += usage.get("output_tokens").and_then(|v| v.as_i64()).unwrap_or(0);
            total_cache_creation += usage.get("cache_creation_input_tokens").and_then(|v| v.as_i64()).unwrap_or(0);
            total_cache_read += usage.get("cache_read_input_tokens").and_then(|v| v.as_i64()).unwrap_or(0);
        }
    }
    metadata.insert("total_tokens".to_string(), serde_json::json!(total_input + total_output + total_cache_creation + total_cache_read));
    metadata.insert("total_input_tokens".to_string(), serde_json::json!(total_input));
    metadata.insert("total_output_tokens".to_string(), serde_json::json!(total_output));
    metadata.insert("total_cache_creation_tokens".to_string(), serde_json::json!(total_cache_creation));
    metadata.insert("total_cache_read_tokens".to_string(), serde_json::json!(total_cache_read));

    Json(SessionTimelineResponse { session_id, metadata, timeline }).into_response()
}

// =========================================================================
// GET /api/months
// =========================================================================
#[derive(Serialize)]
struct MonthListResponse { months: Vec<String> }

async fn get_available_months() -> impl IntoResponse {
    let res: Result<Vec<String>, String> = tokio::task::spawn_blocking(|| {
        let conn = db::get_db_conn()?;
        let mut stmt = conn.prepare(
            "SELECT DISTINCT substr(date, 1, 7) as ym FROM sessions ORDER BY ym DESC"
        ).map_err(|e| e.to_string())?;
        let months = stmt.query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .flatten().collect();
        Ok(months)
    }).await.unwrap_or_else(|_| Err("執行緒失敗".to_string()));
    match res {
        Ok(months) => Json(MonthListResponse { months }).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e}))).into_response(),
    }
}

// =========================================================================
// GET /api/monthly/:year_month
// =========================================================================
#[derive(Serialize)]
struct MonthlySummary {
    total_sessions: i64,
    total_tokens: i64,
    total_input_tokens: i64,
    total_output_tokens: i64,
    total_cache_creation_tokens: i64,
    total_cache_read_tokens: i64,
    total_cost_usd: f64,
    total_duration_minutes: f64,
}

#[derive(Serialize)]
struct DailyBreakdown {
    date: String,
    total_sessions: i64,
    total_tokens: i64,
    total_input_tokens: i64,
    total_output_tokens: i64,
    total_cache_creation_tokens: i64,
    total_cache_read_tokens: i64,
    cost_usd: f64,
}

#[derive(Serialize)]
struct ModelEntry {
    model: String,
    session_count: i64,
    total_tokens: i64,
    total_cache_read_tokens: i64,
    cost_usd: f64,
}

#[derive(Serialize)]
struct ProjectEntry {
    project: String,
    session_count: i64,
    total_tokens: i64,
    total_cache_read_tokens: i64,
}

#[derive(Serialize)]
struct MonthlyResponse {
    year_month: String,
    summary: MonthlySummary,
    daily_breakdown: Vec<DailyBreakdown>,
    top_models: Vec<ModelEntry>,
    top_projects: Vec<ProjectEntry>,
}

async fn get_monthly_details(Path(year_month): Path<String>) -> impl IntoResponse {
    let ym = year_month.clone();
    let res: Result<MonthlyResponse, String> = tokio::task::spawn_blocking(move || {
        let conn = db::get_db_conn()?;
        let pattern = format!("{}%", ym);

        // Summary
        let summary: MonthlySummary = {
            let row = conn.query_row(
                "SELECT COUNT(*), SUM(total_tokens), SUM(input_tokens), SUM(output_tokens),
                        SUM(cache_creation_tokens), SUM(cache_read_tokens),
                        SUM(cost_usd), SUM(COALESCE(duration_minutes, 0))
                 FROM sessions WHERE date LIKE ?1",
                params![pattern],
                |row| Ok((
                    row.get::<_,i64>(0)?, row.get::<_,i64>(1)?, row.get::<_,i64>(2)?,
                    row.get::<_,i64>(3)?, row.get::<_,i64>(4)?, row.get::<_,i64>(5)?,
                    row.get::<_,f64>(6)?, row.get::<_,f64>(7)?
                ))
            ).map_err(|e| e.to_string())?;
            MonthlySummary {
                total_sessions: row.0, total_tokens: row.1, total_input_tokens: row.2,
                total_output_tokens: row.3, total_cache_creation_tokens: row.4,
                total_cache_read_tokens: row.5, total_cost_usd: row.6, total_duration_minutes: row.7,
            }
        };

        // Daily breakdown
        let daily_breakdown: Vec<DailyBreakdown> = {
            let mut stmt_d = conn.prepare(
                "SELECT date, COUNT(*), SUM(total_tokens), SUM(input_tokens), SUM(output_tokens),
                        SUM(cache_creation_tokens), SUM(cache_read_tokens), SUM(cost_usd)
                 FROM sessions WHERE date LIKE ?1 GROUP BY date ORDER BY date ASC"
            ).map_err(|e| e.to_string())?;
            let rows_d: Vec<DailyBreakdown> = stmt_d.query_map(params![pattern], |row: &rusqlite::Row| {
                Ok(DailyBreakdown {
                    date: row.get(0)?, total_sessions: row.get(1)?,
                    total_tokens: row.get(2)?, total_input_tokens: row.get(3)?,
                    total_output_tokens: row.get(4)?, total_cache_creation_tokens: row.get(5)?,
                    total_cache_read_tokens: row.get(6)?, cost_usd: row.get(7)?,
                })
            }).map_err(|e: rusqlite::Error| e.to_string())?.flatten().collect();
            rows_d
        };

        // Top models
        let top_models: Vec<ModelEntry> = {
            let mut stmt_m = conn.prepare(
                "SELECT COALESCE(model,'unknown'), COUNT(*), SUM(total_tokens),
                        SUM(cache_read_tokens), SUM(cost_usd)
                 FROM sessions WHERE date LIKE ?1
                 GROUP BY model ORDER BY SUM(total_tokens) DESC LIMIT 20"
            ).map_err(|e| e.to_string())?;
            let rows_m: Vec<ModelEntry> = stmt_m.query_map(params![pattern], |row: &rusqlite::Row| {
                Ok(ModelEntry {
                    model: row.get(0)?, session_count: row.get(1)?,
                    total_tokens: row.get(2)?, total_cache_read_tokens: row.get(3)?, cost_usd: row.get(4)?,
                })
            }).map_err(|e: rusqlite::Error| e.to_string())?.flatten().collect();
            rows_m
        };

        // Top projects
        let top_projects: Vec<ProjectEntry> = {
            let mut stmt_p = conn.prepare(
                "SELECT COALESCE(project_path,'(no project)'), COUNT(*), SUM(total_tokens),
                        SUM(cache_read_tokens)
                 FROM sessions WHERE date LIKE ?1
                 GROUP BY project_path ORDER BY SUM(total_tokens) DESC LIMIT 20"
            ).map_err(|e| e.to_string())?;
            let rows_p: Vec<ProjectEntry> = stmt_p.query_map(params![pattern], |row: &rusqlite::Row| {
                Ok(ProjectEntry {
                    project: row.get(0)?, session_count: row.get(1)?,
                    total_tokens: row.get(2)?, total_cache_read_tokens: row.get(3)?,
                })
            }).map_err(|e: rusqlite::Error| e.to_string())?.flatten().collect();
            rows_p
        };

        Ok(MonthlyResponse { year_month: ym, summary, daily_breakdown, top_models, top_projects })
    }).await.unwrap_or_else(|_| Err("執行緒失敗".to_string()));

    match res {
        Ok(data) => Json(data).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e}))).into_response(),
    }
}

// =========================================================================
// GET /api/pricing
// =========================================================================
#[derive(Serialize)]
struct PricingEntry {
    model_name: String,
    deployment_type: String,
    unit: String,
    input_price: f64,
    cache_read_price: f64,
    cache_write_price: f64,
    output_price: f64,
}

async fn get_pricing() -> impl IntoResponse {
    let p = PathBuf::from("pricing.csv");
    let content = match fs::read_to_string(&p) {
        Ok(c) => c,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": "pricing.csv not found"}))).into_response(),
    };
    let mut entries: Vec<PricingEntry> = Vec::new();
    for line in content.lines().skip(1) {
        let parts: Vec<&str> = line.split(',').collect();
        if parts.len() < 7 { continue; }
        entries.push(PricingEntry {
            model_name: parts[0].trim().to_string(),
            deployment_type: parts[1].trim().to_string(),
            unit: parts[2].trim().to_string(),
            input_price: parts[3].trim().parse().unwrap_or(0.0),
            cache_read_price: parts[4].trim().parse().unwrap_or(0.0),
            cache_write_price: parts[5].trim().parse().unwrap_or(0.0),
            output_price: parts[6].trim().parse().unwrap_or(0.0),
        });
    }
    Json(entries).into_response()
}

// =========================================================================
// GET /api/sync
// =========================================================================
async fn trigger_manual_sync() -> impl IntoResponse {
    let res = tokio::task::spawn_blocking(|| {
        let conn = db::get_db_conn().map_err(|e| e)?;
        db::sync_session_meta(&conn)
    }).await.unwrap_or_else(|_| Err("執行緒失敗".to_string()));
    match res {
        Ok(n) => Json(serde_json::json!({"synced": n, "message": format!("同步完成，新增 {} 筆記錄", n)})).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e}))).into_response(),
    }
}
