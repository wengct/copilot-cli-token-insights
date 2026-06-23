# Claude Code Token Insights — 設計文件

## 背景與問題

Claude Code 使用者在每月訂閱制（Max plan）或 API 按量計費下大量使用 token，但缺乏一個直觀的方式了解 token 花在哪裡。CLI 底部的 statusLine 只顯示當前 session 的即時數字，無法回顧歷史趨勢、比較不同專案的消耗、或分析 cache 命中率。

不做的話：使用者只能手動翻 `~/.claude/` 下的 JSONL 原始資料，或等到 rate limit 告警時才意識到消耗過快，無法主動管理使用節奏。

本專案是 [copilot-cli-token-insights](https://github.com/wengct/copilot-cli-token-insights) 的 Claude Code 改造版，1:1 對齊原版功能完整度，資料來源從 Copilot CLI 換成 Claude Code 原生 session 資料。

## 使用者角色

**Claude Code 使用者**：日常使用 Claude Code 進行軟體開發，想了解 token 消耗模式以優化使用習慣（例如哪些 session 消耗最多、cache 是否有效利用、不同模型的開銷差異）。

## 需求情境

- **Claude Code 使用者**：When 我用了一整天的 Claude Code 後想回顧消耗, I want to 看到今天的 token 總量和每個 session 的明細, so I can 知道哪些 session 花了最多 token、是否有浪費。
- **Claude Code 使用者**：When 我想了解這個月的使用趨勢, I want to 看到每日 token 消耗的折線圖和各模型/專案的佔比, so I can 調整使用節奏避免 rate limit。
- **Claude Code 使用者**：When 某個 session 消耗異常高, I want to 展開它的完整對話時間軸, so I can 看到是哪些 tool call 或 prompt 造成的高消耗。
- **Claude Code 使用者**：When 我想估算如果走 API 要花多少錢, I want to 看到用 Anthropic API 定價算出的等效成本, so I can 評估 Max plan 的性價比。

## 設計意圖

- **1:1 仿照原版功能** → 這是 fork 改造，不是新產品。不加新功能，不減現有功能（除了移除 Copilot 特有且 Claude Code 無對應的指標）。
- **不需要 statusLine hook** → Copilot 需要 hook 是因為原生 log 不含 per-turn token 明細。Claude Code 的 session JSONL 每個 assistant message 已有完整 `message.usage`，直接讀即可。移除 shell hook 降低安裝門檻。
- **移除 premium_requests 指標** → Copilot 的 premium request 計數在 Claude Code 無直接對應。rate limit % 概念不同，不硬套。
- **費用用 API 等效成本** → Max plan 是月費制，本地沒有 USD 資料。用 Anthropic 公開 API 定價算「如果走 API 要花多少」，當參考指標。

## User Journey

### Journey 1：使用者 — 查看今日 Token 消耗

前置條件：已用 Claude Code 產生至少一個 session；Dashboard 服務已啟動。

1. 使用者在瀏覽器開啟 `http://localhost:3000`
   → 頁面載入日報看板，顯示今日摘要卡片（total tokens、input/output 比例、cache read 量、estimated cost）
2. 下方顯示今日所有 session 列表（session ID、模型、turn 數、input/output/cache tokens、estimated cost）
   → 可按任意欄位排序
3. 使用者點擊某個 session
   → 側邊抽屜展開該 session 的對話時間軸
4. 時間軸顯示每個 turn：user prompt → assistant reply（含 token 統計）→ tool call 展開（tool name、參數、結果）
5. 頁面每 5/10/30 秒自動更新（可切換頻率）
   → 新的 session 和 token 數據自動刷新

### Journey 2：使用者 — 查看月度趨勢

前置條件：至少有跨越多天的使用資料。

1. 使用者切換到月報頁面
   → 折線圖顯示當月每日 token 消耗趨勢和 session 數變化
2. 下方顯示模型使用佔比（各模型的 session 數、token 量、estimated cost）
3. 下方顯示專案排行（各工作目錄的 session 數和 token 量）
4. 使用者可切換到其他月份查看

### Journey 3：使用者 — 查看 Session 對話時間軸

前置條件：已在日報頁面點擊某個 session。

1. 側邊抽屜展開，頂部顯示 session metadata（模型、project path、git branch、total tokens）
2. 時間軸依序顯示：
   - **User prompt**：使用者輸入的文字
   - **Assistant reply**：AI 回覆文字（Markdown 語法高亮）+ 該 turn 的 output tokens 和 total tokens
   - **Tool call**：工具名稱、輸入參數（可展開）、執行結果（可展開）
3. Context 壓縮事件以系統狀態標記顯示

### Journey 4：使用者 — 手動觸發資料同步

1. 使用者點擊同步按鈕
   → 後端重新掃描 `~/.claude/` 下的新資料，增量寫入 SQLite
   → 頁面刷新顯示最新資料

## 替代流程

- **首次使用無資料**：顯示引導訊息說明資料來源路徑，告知使用 Claude Code 後自動產生資料。
- **切換日期/月份無資料**：顯示「該時段無使用記錄」空狀態。
- **Session JSONL 檔案損壞**：跳過該筆，不影響其他資料載入。

## 錯誤情境

### 系統錯誤
- `~/.claude/` 目錄不存在或權限不足 → 啟動時提示設定 `CLAUDE_DIR` 環境變數
- SQLite DB 損壞 → 手動同步時自動重建

### 使用者誤操作
- 存取不存在的 session ID → 回傳 404 + 友善訊息

## Out of Scope

- 新功能：不加原版沒有的功能（如 rate limit 趨勢圖、session 搜尋、匯出 CSV）
- 多使用者：不考慮多人共用同一台機器的情境
- 遠端資料：不從 Anthropic API 拉取帳單資料，純本地分析
- statusLine hook：不做即時收集，純讀既有檔案

## 整合點

### Claude Code 資料來源（全部為本地檔案，唯讀）

| 資料來源 | 路徑 | 用途 |
|----------|------|------|
| Session JSONL | `~/.claude/projects/{project-slug}/{uuid}.jsonl` | 每個 assistant message 的 token 明細 (input, output, cache_creation, cache_read) + 對話時間軸 |
| Session Meta | `~/.claude/usage-data/session-meta/{uuid}.json` | 預計算的 session 摘要 (project_path, duration, tool_counts, input/output tokens, first_prompt) |
| Token Tracker | `~/.claude/usage-tracker/tokens.jsonl` | 每次 API call 的累計 token 數 (10 萬筆+) |
| Pricing CSV | 本地 `pricing.csv` | Anthropic 模型定價 (Opus/Sonnet/Haiku/Fable, per 1M tokens) |

### Session JSONL 關鍵欄位映射

| 原版 Copilot | Claude Code | 說明 |
|-------------|-------------|------|
| `context_window.total_input_tokens` | `message.usage.input_tokens` | 輸入 token |
| `context_window.total_output_tokens` | `message.usage.output_tokens` | 輸出 token |
| `context_window.total_cache_read_tokens` | `message.usage.cache_read_input_tokens` | Cache 讀取 |
| (無) | `message.usage.cache_creation_input_tokens` | Cache 建立 |
| `cost.total_premium_requests` | (移除) | Claude Code 無對應 |
| `cost.total_api_duration_ms` | (從 timestamp 計算) | 改從 session-meta.duration_minutes 取 |

### Session 時間軸事件映射

| 原版 Copilot event | Claude Code JSONL type | 說明 |
|-------------------|----------------------|------|
| `session.start` | `mode` (第一筆) | Session 開始 |
| `user.message` | `type: "user"` | 使用者訊息 |
| `assistant.message` | `type: "assistant"` | AI 回覆（含 message.usage） |
| `tool.execution_start` + `tool.execution_complete` | `type: "assistant"` 內的 tool_use content block + 後續 `type: "tool_result"` | Tool call |
| `session.compaction_complete` | `type: "summary"` | Context 壓縮 |
| `session.shutdown` | (最後一筆 timestamp) | Session 結束 |

### Anthropic 模型定價 (pricing.csv)

| 模型 | Input (per 1M) | Cache Read (per 1M) | Cache Write (per 1M) | Output (per 1M) |
|------|---------------|--------------------|--------------------|----------------|
| Claude Opus 4 | $15.00 | $1.50 | $18.75 | $75.00 |
| Claude Sonnet 4 | $3.00 | $0.30 | $3.75 | $15.00 |
| Claude Haiku 3.5 | $0.80 | $0.08 | $1.00 | $4.00 |
| Claude Fable 5 | $3.00 | $0.30 | $3.75 | $15.00 |

### 技術約束

- 後端：Rust + Axum（沿用原版）
- 前端：靜態 SPA + Chart.js（沿用原版）
- 資料庫：SQLite 增量同步（沿用原版 byte-offset 機制）
- 運行方式：`cargo run` 啟動本地 server，瀏覽器開 `http://localhost:3000`

## Acceptance Criteria

### 日報看板

- Given Dashboard 已啟動且今日有使用資料
  When 使用者開啟 http://localhost:3000
  Then 顯示今日摘要（total tokens、input/output tokens、cache read tokens、estimated cost）和 session 列表

- Given 今日有多個 session
  When 使用者按 total_tokens 欄位排序
  Then session 列表依 token 數降冪排列

- Given 自動更新開啟（預設 10 秒）
  When Claude Code 產生新的 session 資料
  Then 頁面在下次更新週期自動反映新資料

### 月報看板

- Given 當月有跨多天的使用資料
  When 使用者切換到月報頁面
  Then 顯示每日 token 趨勢折線圖、模型佔比、專案排行

- Given 使用了多個模型（如 Opus + Sonnet）
  When 查看模型使用佔比
  Then 各模型的 session 數、token 量、estimated cost 正確分項顯示

### Session 時間軸

- Given 某 session 包含 user prompt、assistant reply、tool call
  When 使用者在日報頁面點擊該 session
  Then 側邊抽屜展開完整時間軸，依序顯示每個 turn 的 prompt、回覆（Markdown 渲染）、tool call 細節

- Given assistant reply 包含 tool_use content block
  When 時間軸渲染該 turn
  Then tool name、輸入參數、執行結果可展開查看

### 費用估算

- Given pricing.csv 定義了 Anthropic 模型定價
  When 顯示 session 或日報摘要的 estimated cost
  Then 費用 = (uncached_input × input_price + cache_read × cache_read_price + cache_write × cache_write_price + output × output_price) / 1,000,000

### 資料同步

- Given ~/.claude/ 下有新的 session 資料
  When 使用者呼叫 /api/sync 或 Dashboard 自動同步
  Then 新資料增量寫入 SQLite，不重複插入既有記錄

- Given ~/.claude/ 目錄不存在
  When Dashboard 啟動
  Then 顯示錯誤訊息提示設定 CLAUDE_DIR 環境變數

### 無資料狀態

- Given 首次使用，尚無 session 資料
  When 使用者開啟 Dashboard
  Then 顯示引導訊息說明資料來源

## 開放問題

1. Claude Code 的 session JSONL 中 tool call 的事件結構需要在 Architecture 階段確認精確格式（tool_use content block vs 獨立 type）
2. `session-meta/*.json` 的 `input_tokens` / `output_tokens` 和遍歷 JSONL 計算的結果是否一致，需要在實作階段驗證
3. Anthropic 模型定價可能更新，pricing.csv 應易於修改（沿用原版 CSV 機制即可）
