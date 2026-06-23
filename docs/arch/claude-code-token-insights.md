# Architecture: Claude Code Token Insights

## 概述

將 copilot-cli-token-insights fork 改造為讀取 Claude Code 原生 session 資料的 token 分析儀表板。核心策略是**雙層資料架構**：用 `session-meta/*.json` 做快速概覽（日報/月報），用 session JSONL 做按需時間軸還原。這避免了對全量 JSONL 做增量同步的複雜度，利用 Claude Code 已經預計算好的摘要資料。

關鍵技術決策：
- 移除 shell hook 收集層，改為直接讀取 `~/.claude/` 下的原生檔案
- SQLite schema 重設計：以 session 為主體（而非 per-turn entry），搭配 session-meta 預計算欄位
- Session 時間軸不入 SQLite，每次按需從 JSONL 即時 parse
- 費用計算加入 cache_creation 維度（Anthropic 特有，比 input 貴 25%）

## Files to Create / Modify

### 新建

| File | Purpose |
|------|---------|
| `pricing.csv` | Anthropic 模型定價表（覆寫原版 GPT 定價） |

### 修改

| File | Change |
|------|--------|
| `Cargo.toml` | package name 改為 `claude-code-token-insights` |
| `src/main.rs` | 重寫資料讀取層、API handler、session timeline parser、pricing 邏輯 |
| `src/db.rs` | 重寫 SQLite schema 和同步邏輯（session-meta → SQLite） |
| `static/index.html` | 品牌文字、title、setup guide modal 內容、pricing modal |
| `static/app.js` | i18n 字典、timeline 渲染 event mapping、品牌文字、cost 計算欄位 |
| `static/styles.css` | 極少改動（品牌色可選） |

### 移除

| File | Reason |
|------|--------|
| `shell/statusline-token.sh` | Claude Code 不需要 hook 收集 |
| `shell/copilot-insights.service` | systemd service 檔，重建時更名即可 |

## Responsibility Map

| 元件 | 層級 | 負責 | 不碰 |
|------|------|------|------|
| `src/main.rs` — `get_claude_dir()` | Infra | 定位 `~/.claude/` 路徑 | 資料解析 |
| `src/main.rs` — `scan_session_metas()` | Data | 掃描 session-meta JSON、解析為 SessionMeta struct | SQLite 寫入 |
| `src/main.rs` — `parse_session_jsonl()` | Data | 按需解析單個 session JSONL 為 Timeline | 彙總統計 |
| `src/main.rs` — API handlers | API | 從 SQLite 查詢 → 組裝 JSON response | 資料解析、前端渲染 |
| `src/main.rs` — `calculate_cost()` | Business | 依模型+token 分項算 estimated cost | 資料讀取 |
| `src/db.rs` — `sync_sessions()` | Sync | session-meta → SQLite 增量同步 | JSONL 解析 |
| `static/app.js` — `renderTimeline()` | View | 將 API 回傳的 timeline 渲染為 DOM | API 呼叫 |
| `static/app.js` — `loadUsageData()` | ViewModel | fetch API → 驅動 render 函數 | DOM 操作 |

## Interface Design

### Rust Structs

```rust
// session-meta/*.json 對應
struct SessionMeta {
    session_id: String,
    project_path: String,
    start_time: String,
    duration_minutes: f64,
    user_message_count: u32,
    assistant_message_count: u32,
    tool_counts: HashMap<String, u32>,
    input_tokens: u64,
    output_tokens: u64,
    first_prompt: String,
    lines_added: u32,
    lines_removed: u32,
    files_modified: u32,
}

// 從 session JSONL 的 assistant message.usage 萃取
struct TokenUsage {
    input_tokens: u64,
    output_tokens: u64,
    cache_creation_input_tokens: u64,
    cache_read_input_tokens: u64,
}

// SQLite 中的 session 記錄
struct SessionEntry {
    session_id: String,
    date: String,                  // YYYY-MM-DD (from start_time)
    project_path: String,
    start_time: String,
    duration_minutes: f64,
    model: String,                 // 從 JSONL 第一個 assistant message 取
    user_message_count: u32,
    assistant_message_count: u32,
    input_tokens: u64,
    output_tokens: u64,
    cache_creation_tokens: u64,    // 需從 JSONL 彙總（session-meta 無此欄位）
    cache_read_tokens: u64,        // 需從 JSONL 彙總（session-meta 無此欄位）
    first_prompt: String,
    cost_usd: f64,                 // 計算後存入
}
```

### API Endpoints（保持原版 path 不變）

```
GET /api/dates           → { dates: ["2026-06-23", ...] }
GET /api/usage/:date     → { date, summary: DaySummary, sessions: [SessionSummary] }
GET /api/months          → { months: ["2026-06", ...] }
GET /api/monthly/:ym     → { year_month, summary, daily_breakdown, top_models, top_projects }
GET /api/session/:id     → { session_id, metadata, timeline: [TimelineItem] }
GET /api/pricing         → [PricingEntry]
GET /api/sync            → { status, message }
GET /api/setup-info      → { claude_dir, claude_dir_exists }
```

### API Response 變更

**DaySummary**（移除 premium_requests，加 cache_creation）：
```rust
struct DaySummary {
    total_sessions: usize,
    total_tokens: u64,           // input + output
    total_input_tokens: u64,
    total_output_tokens: u64,
    total_cache_creation_tokens: u64,  // 新增：Anthropic 特有
    total_cache_read_tokens: u64,
    total_duration_minutes: f64,       // 改：從 ms 改為 minutes（session-meta 單位）
    total_cost_usd: f64,
    // 移除：total_requests (premium_requests)
    // 移除：total_reasoning_tokens (Claude 無此概念)
}
```

**SessionSummary**（對應 session-meta 欄位）：
```rust
struct SessionSummary {
    session_id: String,
    first_prompt: String,          // 替代 session_name
    project_path: String,          // 替代 cwd
    model: String,
    total_tokens: u64,
    total_input_tokens: u64,
    total_output_tokens: u64,
    total_cache_creation_tokens: u64,
    total_cache_read_tokens: u64,
    user_message_count: u32,       // 替代 max_turn_no
    start_time: String,            // 替代 timestamp
    duration_minutes: f64,
    cost_usd: f64,
}
```

**TimelineItem**（適配 Claude Code JSONL 格式）：
```rust
enum TimelineItem {
    UserPrompt {
        timestamp: String,
        prompt: String,             // message.content (text blocks joined)
        uuid: String,
    },
    AssistantReply {
        timestamp: String,
        reply: String,              // text content blocks joined
        model: String,              // message.model
        usage: Option<TokenUsage>,  // message.usage
        tool_calls: Vec<ToolCall>,  // tool_use content blocks
        uuid: String,
    },
    ToolResult {
        timestamp: String,
        tool_use_id: String,        // 配對用
        tool_name: String,          // 從對應的 tool_use 取
        result: serde_json::Value,  // toolUseResult
        is_error: bool,
    },
    SystemStatus {
        timestamp: String,
        status_type: String,        // "session_start" | "session_end"
        message: String,
    },
}

struct ToolCall {
    id: String,
    name: String,
    input: serde_json::Value,
}
```

## Data Flow

### Flow 1：資料同步（對應 Journey 4）

```
啟動 / GET /api/sync
  → scan ~/.claude/usage-data/session-meta/*.json
    → 篩選：mtime > last_synced_time 的檔案（增量）
    → parse 每個 JSON → SessionMeta struct
  → 對每個新/更新的 session：
    → 找對應的 session JSONL (掃描 ~/.claude/projects/*/{session_id}.jsonl)
    → parse JSONL 萃取：model (第一個 assistant message)、
      cache_creation_tokens / cache_read_tokens (加總所有 assistant message.usage)
    → calculate_cost(model, input, output, cache_creation, cache_read)
    → INSERT OR REPLACE INTO sessions
  → 更新 sync_state.last_synced_time
```

### Flow 2：日報查詢（對應 Journey 1）

```
GET /api/usage/2026-06-23
  → (先觸發 sync)
  → SELECT * FROM sessions WHERE date = '2026-06-23'
  → 彙總 DaySummary（SUM tokens, COUNT sessions）
  → 組裝 SessionSummary 列表（按 start_time DESC）
  ← JSON { date, summary, sessions }
```

### Flow 3：月報查詢（對應 Journey 2）

```
GET /api/monthly/2026-06
  → SELECT * FROM sessions WHERE date LIKE '2026-06-%'
  → 按 date GROUP BY → daily_breakdown
  → 按 model GROUP BY → top_models
  → 按 project_path GROUP BY → top_projects
  → 彙總月 summary
  ← JSON { year_month, summary, daily_breakdown, top_models, top_projects }
```

### Flow 4：Session 時間軸（對應 Journey 3）

```
GET /api/session/{uuid}
  → 在 ~/.claude/projects/*/ 下找 {uuid}.jsonl
  → 逐行 parse：
    → type "user" + message.content[type=text] → UserPrompt
    → type "user" + message.content[type=tool_result] → ToolResult
    → type "assistant" + message.content → 分離 text blocks 和 tool_use blocks
      → text → AssistantReply.reply
      → tool_use → AssistantReply.tool_calls[]
      → message.usage → AssistantReply.usage
    → 第一筆 timestamp → SystemStatus(session_start)
    → 最後一筆 timestamp → SystemStatus(session_end)
  → 配對 ToolResult.tool_use_id → 對應 ToolCall 的 name
  → 組裝 metadata（model, project_path, total tokens from SQLite）
  ← JSON { session_id, metadata, timeline }
```

## Build Sequence

### Phase 1：後端資料層（Additive）

重寫 `src/db.rs` 和 `src/main.rs` 的資料讀取部分。

1. `Cargo.toml` — 改 package name
2. `src/main.rs` — `get_claude_dir()` 替代 `get_copilot_dir()`
3. `src/db.rs` — 新 SQLite schema（`sessions` 表 + `sync_state` 表）+ `sync_sessions()` 同步邏輯
4. `src/main.rs` — `scan_session_metas()` + session JSONL 解析 + `calculate_cost()`

驗證點：`cargo build` 通過，`sync_sessions()` 能正確掃描本地 `~/.claude/` 並寫入 SQLite。

### Phase 2：後端 API 層（Breaking — 回應格式變更）

重寫所有 API handler 使用新 schema。

1. `get_available_dates` / `get_usage_details` — 從 sessions 表查詢
2. `get_available_months` / `get_monthly_details` — 月報彙總
3. `get_session_details` — session JSONL → timeline parser
4. `get_pricing` / `trigger_manual_sync` / `get_setup_info` — 更新

驗證點：`cargo run` 後用 curl 打每個 endpoint，確認回傳結構正確。

### Phase 3：定價表（Additive）

1. `pricing.csv` — 寫入 Anthropic 模型定價
2. `src/main.rs` — `load_pricing_rules()` 適配新 CSV 欄位（加 cache_write 列）
3. `src/main.rs` — `calculate_cost()` 加入 cache_creation 計算

驗證點：`GET /api/pricing` 回傳正確的 Anthropic 定價。

### Phase 4：前端適配（Breaking — 需配合 Phase 2）

1. `static/index.html` — 品牌文字、title、setup guide modal、pricing modal
2. `static/app.js` — i18n 字典更新（~100 keys）、`renderTimeline()` 適配新 event 格式、cost 欄位更新（加 cache_creation）、移除 premium_requests / reasoning_tokens 相關 UI
3. `static/styles.css` — 極少改動（品牌色可選）

驗證點：瀏覽器開 `http://localhost:3000`，日報/月報/session 時間軸都能正常顯示。

### Phase 5：清理

1. 移除 `shell/` 目錄
2. 更新 `README.md`

## Infra Reuse

### 原版可複用的架構

| 元件 | 路徑 | 複用方式 |
|------|------|---------|
| Axum server 骨架 | `src/main.rs:37-57` | Route 定義和 static file serving 原封不動 |
| SQLite byte-offset 同步概念 | `src/db.rs:78-228` | 改為 mtime-based 同步（session-meta 是獨立 JSON 檔，非 append-only JSONL） |
| Chart.js 雙軸圖表 | `static/app.js` renderChart/renderMonthlyChart | 只改欄位名（cache_read → cache_creation + cache_read） |
| 表格排序 | `static/app.js` sortAndRender* | 改欄位名即可 |
| Live refresh 機制 | `static/app.js` toggleLiveRefresh 系列 | 完全複用 |
| 主題切換 | `static/app.js` initThemeToggle | 完全複用 |
| i18n 框架 | `static/app.js` t()/updateLanguageUI | 換字典內容，框架不動 |
| Toast 通知 | `static/app.js` showNotification | 完全複用 |
| Drawer/Modal 交互 | `static/app.js` + CSS | 完全複用 |

### 原版需替換的模式

| 原版 | Claude Code 版 | 原因 |
|------|---------------|------|
| Shell hook → per-day JSONL → byte-offset sync | session-meta JSON → mtime sync | Claude Code 原生寫資料，不需要 hook |
| `~/.copilot/usage/usage-YYYY-MM-DD.jsonl` | `~/.claude/usage-data/session-meta/*.json` | 資料來源完全不同 |
| `~/.copilot/session-state/{id}/events.jsonl` | `~/.claude/projects/{slug}/{uuid}.jsonl` | 時間軸資料來源不同 |
| `parse_usage_entries()` 多格式 JSONL parser | `scan_session_metas()` 單格式 JSON parser | 資料格式更簡單 |
| per-turn entry in SQLite (session_id + turn_no) | per-session entry in SQLite (session_id PK) | 粒度不同：概覽用 session 級，時間軸按需 parse |
| delta_tokens 計算 | 直接用 session-meta 的 input/output totals | session-meta 已預計算，不需要自己算 delta |

## Test Strategy

### Unit Test 邊界

| 目標 | 測試行為 |
|------|---------|
| `parse_session_meta(json_str)` | valid JSON → SessionMeta struct with all fields |
| `parse_session_meta(json_str)` | missing optional fields → defaults (0, empty string) |
| `calculate_cost(model, tokens)` | Opus pricing: 1M input + 500K cache_creation + 200K cache_read + 100K output → 正確 USD |
| `calculate_cost(model, tokens)` | unknown model → fallback to Sonnet pricing |
| `parse_timeline_line(json_line)` | assistant message with tool_use → AssistantReply with tool_calls populated |
| `parse_timeline_line(json_line)` | user message with tool_result → ToolResult with correct tool_use_id |
| `parse_timeline_line(json_line)` | user message with text content → UserPrompt |
| `match_model_pricing(model_str)` | "claude-opus-4-6" → Opus rule; "claude-sonnet-4-6" → Sonnet rule |

### Integration Test 邊界

| Journey 步驟 | Test Chain |
|-------------|-----------|
| 同步 → 日報顯示 | 放置 fixture session-meta JSON + session JSONL → POST /api/sync → GET /api/dates → date present → GET /api/usage/:date → session 在列表中且 tokens 正確 |
| 日報 → session 時間軸 | GET /api/usage/:date → 取 session_id → GET /api/session/:id → timeline 包含 UserPrompt + AssistantReply + ToolResult 且 tool_use_id 配對正確 |
| 多 session 同步 → 月報彙總 | 放置跨多天的 fixture → sync → GET /api/monthly/:ym → daily_breakdown 天數正確、top_models 包含 fixture 中的模型、top_projects 包含 fixture 中的 project_path |
| 費用計算端到端 | 放置 known-token-count fixture → sync → GET /api/usage/:date → session.cost_usd 等於手算值 |

### Mock 決策

| 項目 | Mock / Real | 原因 |
|------|------------|------|
| SQLite DB | Real | 驗證 schema 和 query 正確性 |
| `~/.claude/` 檔案系統 | Fixture（temp dir） | 測試不應讀取真實使用者資料；用 fixture 確保可重現 |
| Pricing CSV | Real | 檔案小且是靜態資料 |

### Fixture 設計

```
tests/fixtures/
  session-meta/
    test-session-1.json     # 基本 session（single model, few turns）
    test-session-2.json     # 高消耗 session（large tokens）
    test-session-3.json     # 不同模型 + 不同 project_path
  projects/
    -test-project/
      test-session-1.jsonl  # 完整對話（user + assistant + tool_use + tool_result）
      test-session-2.jsonl  # 純文字對話（無 tool call）
```

### Coverage 要求

核心邏輯（parser、cost calculation、sync）≥ 90%，整體 ≥ 80%。

## 開放問題

1. **session-meta 的 input/output_tokens 是否包含 cache tokens？** 需在 Phase 1 實作時驗證。如果不包含，cache_creation 和 cache_read 只能從 JSONL 彙總，同步會稍慢。
2. **大量 session-meta 的 sync 效能**：目前約有數百個 session-meta JSON。用 mtime 篩選應足夠，但如果未來累積到數千個，可能需要加 index 或改用 inotify/fsevents watch。
3. **session JSONL 的定位**：session-meta 的 session_id 和 JSONL 檔名（UUID）相同，但 JSONL 散佈在 `~/.claude/projects/*/` 下多個目錄。需要建立一個 session_id → JSONL path 的 lookup（sync 時順便做）。
