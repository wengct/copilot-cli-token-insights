// Globals
let tokenChartInstance = null;
let monthlyChartInstance = null;
let activeTab = 'daily';
let currentChartSessions = [];
let currentMonthlyBreakdown = [];
let currentSessionTotalTokens = 0;
let currentSessionCacheTokens = 0;
let currentSessionCacheCreationTokens = 0;
let currentSessionInputTokens = 0;
let currentSessionOutputTokens = 0;
let currentSessionProjectPath = '';
let currentSessionModel = '';
let availableDates = [];
let pricingRules = [];

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

let currentSessions = [];
let currentSortColumn = 'start_time';
let currentSortDirection = 'desc';

let monthlyDailySortColumn = 'date';
let monthlyDailySortDirection = 'desc';

let liveRefreshTimer = null;
let liveProgressTimer = null;
let refreshInterval = 10000;

let currentLang = localStorage.getItem('lang') || 'zh-TW';
let currentUsageData = null;
let currentMonthlyData = null;

const i18n = {
  'zh-TW': {
    title: 'Claude Code Token Insights Dashboard',
    tab_daily: '📊 每日即時',
    tab_monthly: '📅 月度彙整',
    select_date: '選擇日期',
    today_btn: '今日',
    detected_new_day: '已跨日，自動切換至新的一天：',
    select_month: '選擇月份',
    loading: '載入中...',
    no_logs: '無使用日誌記錄',
    no_month_logs: '無月份日誌記錄',
    reload_data: '重新載入數據',
    live_refresh: '即時自動刷新',
    refresh_interval: '刷新頻率:',
    seconds: '秒',
    status_preparing: '準備中...',
    status_monitoring: '監控中 (將於 {sec}s 後刷新)',
    status_failed: '更新失敗，等待下一次嘗試...',
    quick_stats_title: '當日彙整指標',
    stat_total_sessions: '總 Session 數',
    stat_total_tokens: '總 Token 消耗',
    stat_cache_read: '快取讀取: {val}',
    stat_api_duration: '累積時間',
    select_date_prompt: '請選擇日期以載入數據',
    header_description: '監控您本地每天使用 Claude Code 的 Token 與會話詳細數據',
    setup_guide: '啟用教學',
    setup_guide_title: '啟用教學',
    theme_toggle_title_dark: '切換至淺色主題',
    theme_toggle_title_light: '切換至深色主題',
    total_tokens_label: '總消耗 Token',
    input_tokens_label: '輸入 Token',
    output_tokens_label: '輸出 Token',
    cache_creation_tokens_label: '快取建立 Token',
    cache_read_label: '快取讀取',
    ratio_label: '佔比',
    total_label: '總計',
    chart_daily_title: 'Token 消耗趨勢與快取狀況',
    chart_token_label: 'Session 總 Token',
    chart_cache_label: '快取讀取 Token',
    chart_turn_label: '對話 Turn 數',
    chart_monthly_title: '單月每日 Token 消耗與會話數趨勢',
    chart_monthly_token_label: '月總 Token 消耗',
    chart_monthly_session_label: '每日會話數',
    sessions_table_title: '今日會話列表 (Sessions)',
    col_session: '會話',
    col_model: 'Model',
    col_turns: 'Turn 數',
    col_input: '輸入',
    col_output: '輸出',
    col_cache_creation: '快取建立',
    col_cache: '快取讀取',
    col_total: '總計',
    col_cost: '估算費用',
    col_duration: '時長',
    col_time: '時間',
    estimated_cost_label: '估算費用',
    stat_cost_desc: '基於 pricing.csv 的估計金額',
    btn_pricing_sheet: '費用標準',
    pricing_sheet_title: '💰 Anthropic Claude Code 費用標準表',
    pricing_intro: '此費用為本地估算，單價依據 <code>pricing.csv</code> 載入。單位為 1M Tokens (每百萬個 Token) 的美金價格：',
    placeholder_select_date: '請先在左側選擇一個日期',
    placeholder_no_sessions: '今日無任何會話記錄',
    monthly_tokens_label: '月總消耗 Token',
    monthly_input_label: '月輸入 Token',
    monthly_output_label: '月輸出 Token',
    monthly_sessions_label: '月總會話數',
    monthly_duration: '累積時長: {val}',
    monthly_projects_title: '🏢 最常活動的專案目錄',
    monthly_models_title: '🤖 使用的模型佔比',
    col_rank: '排名',
    col_project_path: '專案路徑',
    col_sessions_count: '會話數',
    placeholder_no_projects: '本月無任何專案記錄',
    placeholder_no_models: '本月無模型數據',
    drawer_category: '會話對話重建',
    drawer_project_path: '專案路徑',
    drawer_model: 'Model',
    drawer_input: '輸入',
    drawer_output: '輸出',
    drawer_cache_creation: '快取建立',
    drawer_cache: '快取讀取',
    drawer_total: '總計',
    drawer_loading: '對話時間軸還原中...',
    drawer_load_failed_cleaned: '無法載入此 Session 事件，可能對應的 JSONL 檔案已被系統清理。',
    drawer_load_failed: '載入時間軸失敗。',
    drawer_no_events: '此會話無任何事件記錄',
    sender_user: '👤 USER',
    sender_agent: '🤖 CLAUDE',
    thinking_tools: '思考中：調用工具指令...',
    copy_markdown: '複製 Markdown',
    copy_markdown_title: '複製 LLM 回答的原始 Markdown 內容',
    expand_reply: '展開回覆',
    collapse_reply: '收摺回覆',
    no_returned_data: '無回傳資料',
    data_truncated: '... [資料過長已被看板截斷顯示] ...',
    tool_calls_label: '工具調用 (Tool Calls)',
    tool_result: '執行輸出 (Result)',
    session_started: '會話開始 (Session Started)',
    session_ended: '會話結束 (Session Ended)',
    session_compaction: '會話狀態壓縮完成 (Session Compaction Completed)',
    reload_success: '數據已成功重新整理',
    reload_failed: '重新整理失敗',
    monthly_reload_success: '月度數據已成功重新整理',
    live_refresh_enabled: '即時自動重新整理已開啟',
    live_refresh_disabled: '即時自動重新整理已關閉',
    live_refresh_failed: '即時刷新失敗:',
    date_not_found: '找不到該日期的數據',
    load_failed: '讀取數據失敗',
    server_conn_failed: '無法連接到伺服器 API',
    month_not_found: '找不到該月份的數據',
    monthly_load_failed: '載入月份彙整數據失敗',
    copy_success: '✅ 已複製！',
    copy_failed: '複製失敗，請手動選取複製',
    setup_modal_title: '⚙️ Claude Code Token Insights 啟用教學',
    setup_modal_intro: '本 Dashboard 自動從 <code>~/.claude/</code> 讀取 Claude Code 的原生 session 資料，無需額外設定 hook 或腳本。',
    setup_step_1: '<span>1️⃣</span> 1. 安裝 Rust',
    setup_step_1_desc: '確保您的系統已安裝 Rust。若尚未安裝，請執行：',
    btn_copy_cmd: '📋 複製指令',
    setup_step_2: '<span>2️⃣</span> 2. 啟動 Dashboard',
    setup_step_2_desc: '在專案目錄下執行：',
    setup_step_3: '<span>3️⃣</span> 3. 開啟瀏覽器',
    setup_step_3_desc: '在瀏覽器中開啟：',
    setup_data_hint_title: '💡 資料來源說明：',
    setup_data_hint_desc: 'Dashboard 自動從 <code>~/.claude/</code> 讀取資料。若您的 Claude Code 資料存放在其他位置，可設定 <code>CLAUDE_DIR</code> 環境變數指定路徑。',
    empty_title: '歡迎使用 Claude Code Token Insights Dashboard',
    empty_desc: '我們偵測到您的 <code>~/.claude/</code> 本地目錄中目前沒有 session 資料。請先使用 Claude Code 產生會話後，再點擊下方按鈕同步資料。',
    btn_empty_setup: '⚙️ 查看啟用教學',
    btn_empty_refresh: '🔄 重新整理檢查',
    usage_report: '使用量報告：',
    loading_prefix: '載入中: ',
    loading_month_prefix: '載入月份數據中: ',
    monthly_report: '月度統計報告：',
    cache_prefix: '快取: ',
    sync_db: '同步資料',
    sync_db_title: '立即同步 Claude Code session 資料到 SQLite 資料庫',
    sync_db_loading: '正在同步資料到資料庫...',
    sync_db_success: '資料庫同步成功！',
    sync_db_failed: '同步失敗: ',
    monthly_daily_summary_title: '📅 當月每日彙總',
    col_date: '日期',
    placeholder_no_daily_summary: '本月無每日彙總數據',
  },
  'en': {
    title: 'Claude Code Token Insights Dashboard',
    tab_daily: '📊 Daily Real-time',
    tab_monthly: '📅 Monthly Summary',
    select_date: 'Select Date',
    today_btn: 'Today',
    detected_new_day: 'Cross-day detected, auto switching to: ',
    select_month: 'Select Month',
    loading: 'Loading...',
    no_logs: 'No usage logs found',
    no_month_logs: 'No monthly logs found',
    reload_data: 'Reload Data',
    live_refresh: 'Live Auto-refresh',
    refresh_interval: 'Refresh Rate:',
    seconds: 's',
    status_preparing: 'Preparing...',
    status_monitoring: 'Monitoring (refresh in {sec}s)',
    status_failed: 'Update failed, waiting for next try...',
    quick_stats_title: 'Daily Summary Metrics',
    stat_total_sessions: 'Total Sessions',
    stat_total_tokens: 'Total Tokens',
    stat_cache_read: 'Cache Read: {val}',
    stat_api_duration: 'Total Duration',
    select_date_prompt: 'Please select a date to load data',
    header_description: 'Monitor daily tokens and session details of Claude Code locally',
    setup_guide: 'Setup Guide',
    setup_guide_title: 'Setup Guide',
    theme_toggle_title_dark: 'Switch to Light Theme',
    theme_toggle_title_light: 'Switch to Dark Theme',
    total_tokens_label: 'Total Tokens',
    input_tokens_label: 'Input Tokens',
    output_tokens_label: 'Output Tokens',
    cache_creation_tokens_label: 'Cache Creation Tokens',
    cache_read_label: 'Cache Read',
    ratio_label: 'Ratio',
    total_label: 'Total',
    chart_daily_title: 'Token Consumption Trend & Cache Status',
    chart_token_label: 'Session Total Tokens',
    chart_cache_label: 'Cache Read Tokens',
    chart_turn_label: 'Session Turns',
    chart_monthly_title: 'Daily Token & Session Trend of the Month',
    chart_monthly_token_label: 'Monthly Total Tokens',
    chart_monthly_session_label: 'Daily Sessions',
    sessions_table_title: 'Daily Session List (Sessions)',
    col_session: 'Session',
    col_model: 'Model',
    col_turns: 'Turns',
    col_input: 'Input',
    col_output: 'Output',
    col_cache_creation: 'Cache Creation',
    col_cache: 'Cache Read',
    col_total: 'Total',
    col_cost: 'Est. Cost',
    col_duration: 'Duration',
    col_time: 'Time',
    estimated_cost_label: 'Est. Cost',
    stat_cost_desc: 'Estimated based on pricing.csv',
    btn_pricing_sheet: 'Pricing Rates',
    pricing_sheet_title: '💰 Anthropic Claude Code Pricing Rates',
    pricing_intro: 'This cost is locally estimated based on rates loaded from <code>pricing.csv</code>. Rates are in USD per 1M Tokens:',
    placeholder_select_date: 'Please select a date on the left',
    placeholder_no_sessions: 'No session records found today',
    monthly_tokens_label: 'Monthly Total Tokens',
    monthly_input_label: 'Monthly Input Tokens',
    monthly_output_label: 'Monthly Output Tokens',
    monthly_sessions_label: 'Monthly Total Sessions',
    monthly_duration: 'Duration: {val}',
    monthly_projects_title: '🏢 Most Active Project Directories',
    monthly_models_title: '🤖 Model Usage Breakdown',
    col_rank: 'Rank',
    col_project_path: 'Project Path',
    col_sessions_count: 'Sessions',
    placeholder_no_projects: 'No project activity recorded this month',
    placeholder_no_models: 'No model usage data this month',
    drawer_category: 'Session Reconstruction',
    drawer_project_path: 'Project Path',
    drawer_model: 'Model',
    drawer_input: 'Input',
    drawer_output: 'Output',
    drawer_cache_creation: 'Cache Creation',
    drawer_cache: 'Cache Read',
    drawer_total: 'Total',
    drawer_loading: 'Reconstructing session timeline...',
    drawer_load_failed_cleaned: 'Failed to load session events. The JSONL file might have been cleaned up.',
    drawer_load_failed: 'Failed to load timeline.',
    drawer_no_events: 'No event logs found in this session',
    sender_user: '👤 USER',
    sender_agent: '🤖 CLAUDE',
    thinking_tools: 'Thinking: Calling tool commands...',
    copy_markdown: 'Copy Markdown',
    copy_markdown_title: 'Copy raw Markdown response',
    expand_reply: 'Expand Reply',
    collapse_reply: 'Collapse Reply',
    no_returned_data: 'No returned data',
    data_truncated: '... [Data too long, truncated] ...',
    tool_calls_label: 'Tool Calls',
    tool_result: 'Result',
    session_started: 'Session Started',
    session_ended: 'Session Ended',
    session_compaction: 'Session Compaction Completed',
    reload_success: 'Data refreshed successfully',
    reload_failed: 'Failed to refresh data',
    monthly_reload_success: 'Monthly data refreshed successfully',
    live_refresh_enabled: 'Live auto-refresh enabled',
    live_refresh_disabled: 'Live auto-refresh disabled',
    live_refresh_failed: 'Live refresh failed:',
    date_not_found: 'Data for the specified date not found',
    load_failed: 'Failed to read data',
    server_conn_failed: 'Unable to connect to server API',
    month_not_found: 'Data for the specified month not found',
    monthly_load_failed: 'Failed to load monthly aggregated data',
    copy_success: '✅ Copied!',
    copy_failed: 'Failed to copy, please select and copy manually',
    setup_modal_title: '⚙️ Claude Code Token Insights Setup Guide',
    setup_modal_intro: 'This dashboard automatically reads Claude Code native session data from <code>~/.claude/</code>. No shell hooks or scripts required.',
    setup_step_1: '<span>1️⃣</span> 1. Install Rust',
    setup_step_1_desc: 'Ensure Rust is installed. If not, run:',
    btn_copy_cmd: '📋 Copy Command',
    setup_step_2: '<span>2️⃣</span> 2. Start the Dashboard',
    setup_step_2_desc: 'In the project directory, run:',
    setup_step_3: '<span>3️⃣</span> 3. Open in Browser',
    setup_step_3_desc: 'Open in your browser:',
    setup_data_hint_title: '💡 Data Source Note:',
    setup_data_hint_desc: 'The dashboard reads data from <code>~/.claude/</code> automatically. Set the <code>CLAUDE_DIR</code> environment variable if needed.',
    empty_title: 'Welcome to Claude Code Token Insights Dashboard',
    empty_desc: 'No session data found in <code>~/.claude/</code>. Please use Claude Code to generate sessions first.',
    btn_empty_setup: '⚙️ View Setup Guide',
    btn_empty_refresh: '🔄 Reload and Check',
    usage_report: 'Usage Report: ',
    loading_prefix: 'Loading: ',
    loading_month_prefix: 'Loading Monthly Data: ',
    monthly_report: 'Monthly Report: ',
    cache_prefix: 'Cache: ',
    sync_db: 'Sync Data',
    sync_db_title: 'Sync Claude Code session data to SQLite database now',
    sync_db_loading: 'Syncing data to database...',
    sync_db_success: 'Database synced successfully!',
    sync_db_failed: 'Sync failed: ',
    monthly_daily_summary_title: '📅 Daily Summary of the Month',
    col_date: 'Date',
    placeholder_no_daily_summary: 'No daily summary data this month',
  }
};

function t(key) {
  return i18n[currentLang][key] || i18n['zh-TW'][key] || key;
}

function updateLanguageUI() {
  document.title = t('title');
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.innerHTML = t(key);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    el.title = t(key);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    el.placeholder = t(key);
  });
  const langSelect = document.getElementById('lang-select');
  if (langSelect) langSelect.value = currentLang;
  const themeBtn = document.getElementById('theme-toggle-btn');
  if (themeBtn) {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    themeBtn.title = currentTheme === 'dark' ? t('theme_toggle_title_dark') : t('theme_toggle_title_light');
  }
  const emptyContainer = document.getElementById('empty-state-container');
  if (emptyContainer && !emptyContainer.classList.contains('hidden')) {
    toggleEmptyState(true);
  }
}

document.addEventListener('DOMContentLoaded', () => { initApp(); });


// =========================================================================
// App Initialization & Event Listeners
// =========================================================================
function initApp() {
  const dateSelect = document.getElementById('date-select');
  const monthSelect = document.getElementById('month-select');
  const closeDrawerBtn = document.getElementById('close-drawer-btn');
  const drawerOverlay = document.getElementById('timeline-drawer');
  const tabBtnDaily = document.getElementById('tab-btn-daily');
  const tabBtnMonthly = document.getElementById('tab-btn-monthly');
  const liveToggle = document.getElementById('live-toggle');
  const liveInterval = document.getElementById('live-interval');

  const langSelect = document.getElementById('lang-select');
  if (langSelect) {
    langSelect.value = currentLang;
    langSelect.addEventListener('change', (e) => {
      currentLang = e.target.value;
      localStorage.setItem('lang', currentLang);
      updateLanguageUI();
      if (activeTab === 'daily' && currentUsageData) renderDashboard(currentUsageData);
      else if (activeTab === 'monthly' && currentMonthlyData) renderMonthlyDashboard(currentMonthlyData);
    });
  }

  fetchDates();
  fetchMonths();
  updateLanguageUI();

  tabBtnDaily.addEventListener('click', () => switchTab('daily'));
  tabBtnMonthly.addEventListener('click', () => switchTab('monthly'));

  dateSelect.addEventListener('change', (e) => { if (e.target.value) loadUsageData(e.target.value); });
  dateSelect.addEventListener('click', (e) => {
    if (typeof e.target.showPicker === 'function') {
      try { e.target.showPicker(); } catch (err) { console.warn('showPicker not supported:', err); }
    }
  });

  const btnToday = document.getElementById('btn-today');
  if (btnToday) {
    btnToday.addEventListener('click', async () => {
      const todayStr = getLocalDateString();
      if (dateSelect) dateSelect.value = todayStr;
      await loadUsageData(todayStr);
      showNotification(`${t('today_btn')} ${todayStr}`, 'success');
    });
  }

  monthSelect.addEventListener('change', (e) => { if (e.target.value) loadMonthlyData(e.target.value); });

  const btnReloadDaily = document.getElementById('btn-reload-daily');
  if (btnReloadDaily) {
    btnReloadDaily.addEventListener('click', async () => {
      btnReloadDaily.classList.add('loading');
      try { await reloadDailyData(); showNotification(t('reload_success'), 'success'); }
      catch (err) { showNotification(t('reload_failed'), 'error'); }
      finally { btnReloadDaily.classList.remove('loading'); }
    });
  }

  const btnReloadMonthly = document.getElementById('btn-reload-monthly');
  if (btnReloadMonthly) {
    btnReloadMonthly.addEventListener('click', async () => {
      btnReloadMonthly.classList.add('loading');
      try { await reloadMonthlyData(); showNotification(t('monthly_reload_success'), 'success'); }
      catch (err) { showNotification(t('reload_failed'), 'error'); }
      finally { btnReloadMonthly.classList.remove('loading'); }
    });
  }

  const btnSyncDb = document.getElementById('btn-sync-db');
  if (btnSyncDb) {
    btnSyncDb.addEventListener('click', async () => {
      btnSyncDb.classList.add('loading');
      btnSyncDb.disabled = true;
      showNotification(t('sync_db_loading'), 'info');
      try {
        const res = await fetch('/api/sync');
        if (res.ok) {
          showNotification(t('sync_db_success'), 'success');
          if (activeTab === 'daily') await reloadDailyData(); else await reloadMonthlyData();
          await fetchDates(); await fetchMonths();
        } else {
          let errMsg = res.statusText;
          try { const data = await res.json(); if (data && data.error) errMsg = data.error; } catch (_) {}
          showNotification(t('sync_db_failed') + errMsg, 'error');
        }
      } catch (err) {
        showNotification(t('sync_db_failed') + err.message, 'error');
      } finally {
        btnSyncDb.classList.remove('loading');
        btnSyncDb.disabled = false;
      }
    });
  }

  liveToggle.addEventListener('change', (e) => toggleLiveRefresh(e.target.checked));
  liveInterval.addEventListener('change', (e) => {
    refreshInterval = parseInt(e.target.value, 10);
    if (liveToggle.checked) startLiveRefresh();
  });

  closeDrawerBtn.addEventListener('click', closeDrawer);
  drawerOverlay.addEventListener('click', (e) => { if (e.target === drawerOverlay) closeDrawer(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeDrawer(); closeSetupModal(); closePricingModal(); } });

  const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
  const appContainer = document.querySelector('.app-container');
  if (sidebarToggleBtn && appContainer) {
    sidebarToggleBtn.addEventListener('click', () => appContainer.classList.toggle('sidebar-collapsed'));
    if (window.innerWidth <= 1024) appContainer.classList.add('sidebar-collapsed');
  }

  initThemeToggle();
  initTableSorting();
  initSetupGuide();
  fetchPricingRules();
  initPricingModal();
}

// =========================================================================
// Tab Switching
// =========================================================================
function switchTab(tab) {
  if (activeTab === tab) return;
  activeTab = tab;

  const tabBtnDaily = document.getElementById('tab-btn-daily');
  const tabBtnMonthly = document.getElementById('tab-btn-monthly');
  const dailySelector = document.getElementById('daily-selector-section');
  const monthlySelector = document.getElementById('monthly-selector-section');
  const quickStats = document.getElementById('quick-stats-section');
  const dailyView = document.getElementById('daily-view-container');
  const monthlyView = document.getElementById('monthly-view-container');

  if (tab === 'daily') {
    tabBtnDaily.classList.add('active'); tabBtnMonthly.classList.remove('active');
    dailySelector.classList.remove('hidden'); monthlySelector.classList.add('hidden');
    quickStats.classList.remove('hidden'); dailyView.classList.remove('hidden'); monthlyView.classList.add('hidden');
    const dateSelect = document.getElementById('date-select');
    if (dateSelect.value) loadUsageData(dateSelect.value);
  } else {
    const liveToggle = document.getElementById('live-toggle');
    if (liveToggle.checked) { liveToggle.checked = false; toggleLiveRefresh(false); }
    tabBtnDaily.classList.remove('active'); tabBtnMonthly.classList.add('active');
    dailySelector.classList.add('hidden'); monthlySelector.classList.remove('hidden');
    quickStats.classList.add('hidden'); dailyView.classList.add('hidden'); monthlyView.classList.remove('hidden');
    const monthSelect = document.getElementById('month-select');
    if (monthSelect.value) loadMonthlyData(monthSelect.value); else fetchMonths();
  }
}

// =========================================================================
// Live Auto-Refresh
// =========================================================================
function toggleLiveRefresh(enabled) {
  const panel = document.getElementById('live-settings-panel');
  const dateSelect = document.getElementById('date-select');
  const btnToday = document.getElementById('btn-today');
  if (enabled) {
    panel.style.display = 'block';
    dateSelect.disabled = true;
    if (btnToday) btnToday.disabled = true;
    const todayStr = getLocalDateString();
    dateSelect.value = todayStr;
    loadUsageData(todayStr);
    startLiveRefresh();
    showNotification(t('live_refresh_enabled'), 'success');
  } else {
    panel.style.display = 'none';
    dateSelect.disabled = false;
    if (btnToday) btnToday.disabled = false;
    stopLiveRefresh();
    showNotification(t('live_refresh_disabled'), 'info');
  }
}

function startLiveRefresh() {
  stopLiveRefresh();
  const intervalInput = document.getElementById('live-interval');
  refreshInterval = parseInt(intervalInput.value, 10);
  const statusText = document.getElementById('live-status-text');
  const progressBar = document.getElementById('refresh-progress');
  progressBar.style.width = '0%';
  let startTime = Date.now();
  liveProgressTimer = setInterval(() => {
    let elapsed = Date.now() - startTime;
    progressBar.style.width = `${Math.min((elapsed / refreshInterval) * 100, 100)}%`;
    statusText.textContent = t('status_monitoring').replace('{sec}', Math.max(Math.ceil((refreshInterval - elapsed) / 1000), 0));
  }, 100);
  liveRefreshTimer = setInterval(async () => {
    startTime = Date.now();
    progressBar.style.width = '0%';
    await refreshLiveData();
  }, refreshInterval);
}

function stopLiveRefresh() {
  if (liveRefreshTimer) { clearInterval(liveRefreshTimer); liveRefreshTimer = null; }
  if (liveProgressTimer) { clearInterval(liveProgressTimer); liveProgressTimer = null; }
  const progressBar = document.getElementById('refresh-progress');
  if (progressBar) progressBar.style.width = '0%';
}

async function refreshLiveData() {
  try {
    const res = await fetch('/api/dates');
    const data = await res.json();
    availableDates = data.dates || [];
    const dateSelect = document.getElementById('date-select');
    const todayStr = getLocalDateString();
    if (availableDates.length > 0) dateSelect.min = availableDates[availableDates.length - 1];
    dateSelect.max = todayStr;
    if (dateSelect.value !== todayStr) {
      dateSelect.value = todayStr;
      showNotification(`${t('detected_new_day')}${todayStr}`, 'info');
    }
    await loadUsageData(dateSelect.value);
  } catch (err) {
    const statusText = document.getElementById('live-status-text');
    if (statusText) statusText.textContent = t('status_failed');
  }
}

// =========================================================================
// Fetch Dates
// =========================================================================
async function fetchDates(selectedDate = null) {
  try {
    const res = await fetch('/api/dates');
    const data = await res.json();
    const dateSelect = document.getElementById('date-select');
    availableDates = data.dates || [];
    if (availableDates.length === 0) { toggleEmptyState(true); return; }
    toggleEmptyState(false);
    const oldestDate = availableDates[availableDates.length - 1];
    const newestDate = availableDates[0];
    const todayStr = getLocalDateString();
    dateSelect.min = oldestDate;
    dateSelect.max = todayStr;
    let dateToLoad = selectedDate;
    if (!dateToLoad) {
      const liveToggle = document.getElementById('live-toggle');
      dateToLoad = (liveToggle && liveToggle.checked) ? todayStr : newestDate;
    }
    dateSelect.value = dateToLoad;
    await loadUsageData(dateToLoad);
  } catch (err) {
    showNotification(t('server_conn_failed'), 'error');
  }
}

async function reloadDailyData() {
  const dateSelect = document.getElementById('date-select');
  await fetchDates(dateSelect.value);
}

async function loadUsageData(date) {
  try {
    document.getElementById('current-date-title').innerHTML = `<span class="title-icon">⌛</span> <span class="title-text">${t('loading_prefix')}${date}...</span>`;
    const res = await fetch(`/api/usage/${date}`);
    if (res.status === 404) { showNotification(t('date_not_found'), 'error'); return; }
    const data = await res.json();
    renderDashboard(data);
  } catch (err) {
    showNotification(t('load_failed'), 'error');
  }
}

// =========================================================================
// Render Dashboard
// =========================================================================
function renderDashboard(data) {
  currentUsageData = data;
  const { date, summary, sessions } = data;
  document.getElementById('current-date-title').innerHTML = `<span class="title-icon">📅</span> <span class="title-text">${t('usage_report')}${date}</span>`;
  const firstModel = sessions && sessions.length > 0 ? sessions[0].model : '';
  const versionBadge = document.getElementById('copilot-version-badge');
  if (versionBadge) versionBadge.textContent = firstModel || '--';

  document.getElementById('mini-sessions').textContent = summary.total_sessions;
  document.getElementById('mini-tokens').textContent = formatToken(summary.total_tokens);
  document.getElementById('mini-cache').textContent = `${t('cache_read_label')}: ${formatToken(summary.total_cache_read_tokens)}`;
  document.getElementById('mini-cost').textContent = formatCost(summary.total_cost_usd || 0);
  document.getElementById('mini-duration').textContent = formatDurationMinutes(summary.total_duration_minutes);

  document.getElementById('stat-total-tokens').textContent = formatToken(summary.total_tokens);
  document.getElementById('stat-cache-read').textContent = `${t('cache_read_label')}: ${formatToken(summary.total_cache_read_tokens)} (${calculatePercentage(summary.total_cache_read_tokens, summary.total_tokens)})`;
  document.getElementById('stat-input-tokens').textContent = formatToken(summary.total_input_tokens);
  document.getElementById('stat-input-pct').textContent = `${t('ratio_label')}: ${calculatePercentage(summary.total_input_tokens, summary.total_tokens)}`;
  document.getElementById('stat-output-tokens').textContent = formatToken(summary.total_output_tokens);
  document.getElementById('stat-output-pct').textContent = `${t('ratio_label')}: ${calculatePercentage(summary.total_output_tokens, summary.total_tokens)}`;
  document.getElementById('stat-cache-creation-tokens').textContent = formatToken(summary.total_cache_creation_tokens || 0);
  document.getElementById('stat-cache-creation-pct').textContent = `${t('ratio_label')}: ${calculatePercentage(summary.total_cache_creation_tokens || 0, summary.total_tokens)}`;
  document.getElementById('stat-total-cost').textContent = formatCost(summary.total_cost_usd || 0);

  renderChart(sessions);
  currentSessions = [...sessions];
  sortAndRenderSessionTable();
}

// =========================================================================
// Chart
// =========================================================================
function renderChart(sessions) {
  const canvas = document.getElementById('tokenChart');
  const sortedSessions = [...sessions].sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
  const displaySessions = sortedSessions.slice(-15);
  currentChartSessions = displaySessions;

  const labels = displaySessions.map((s) => {
    const timeStr = s.start_time ? formatLocalTime(s.start_time, false) : '';
    const name = (s.first_prompt || '').substring(0, 10);
    return `${timeStr} (${name}...)`;
  });
  const tokenData = displaySessions.map(s => s.total_tokens);
  const cacheData = displaySessions.map(s => s.total_cache_read_tokens || 0);
  const turnData = displaySessions.map(s => s.user_message_count || 0);

  if (tokenChartInstance) {
    tokenChartInstance.data.labels = labels;
    tokenChartInstance.data.datasets[0].label = t('chart_token_label');
    tokenChartInstance.data.datasets[1].label = t('chart_cache_label');
    tokenChartInstance.data.datasets[2].label = t('chart_turn_label');
    tokenChartInstance.data.datasets[0].data = tokenData;
    tokenChartInstance.data.datasets[1].data = cacheData;
    tokenChartInstance.data.datasets[2].data = turnData;
    if (tokenChartInstance.options.scales.y.title) tokenChartInstance.options.scales.y.title.text = t('col_total');
    if (tokenChartInstance.options.scales.y1.title) tokenChartInstance.options.scales.y1.title.text = t('col_turns');
    tokenChartInstance.update(); return;
  }

  tokenChartInstance = new Chart(canvas, {
    type: 'bar', data: { labels,
      datasets: [
        { label: t('chart_token_label'), data: tokenData, backgroundColor: 'rgba(0, 242, 254, 0.22)', borderColor: '#00f2fe', borderWidth: 1.5, borderRadius: 6, yAxisID: 'y', grouped: false, barPercentage: 0.8 },
        { label: t('chart_cache_label'), data: cacheData, backgroundColor: 'rgba(129, 140, 248, 0.75)', borderColor: '#818cf8', borderWidth: 1.5, borderRadius: 6, yAxisID: 'y', grouped: false, barPercentage: 0.8 },
        { label: t('chart_turn_label'), data: turnData, type: 'line', borderColor: '#9b51e0', backgroundColor: 'rgba(155, 81, 224, 0.2)', borderWidth: 2, pointBackgroundColor: '#9b51e0', pointRadius: 4, tension: 0.3, yAxisID: 'y1' }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      onClick: (event, elements) => {
        if (elements && elements.length > 0) {
          const s = currentChartSessions[elements[0].index];
          if (s) openSessionTimeline(s.session_id, s.first_prompt, s.total_tokens, s.total_cache_read_tokens, s.total_cache_creation_tokens, s.total_input_tokens, s.total_output_tokens, s.project_path, s.model);
        }
      },
      onHover: (event, activeElements) => { canvas.style.cursor = activeElements.length ? 'pointer' : 'default'; },
      plugins: {
        legend: { labels: { color: '#f3f4f6', font: { family: 'Outfit' } } },
        tooltip: { padding: 12, backgroundColor: 'rgba(15, 18, 29, 0.95)', titleColor: '#00f2fe', bodyColor: '#f3f4f6', borderColor: 'rgba(255, 255, 255, 0.1)', borderWidth: 1,
          callbacks: { label: (context) => { const label = context.dataset.label || ''; const value = context.parsed.y; return label.includes('Token') ? `${label}: ${formatToken(value)} (${formatNumber(value)})` : `${label}: ${formatNumber(value)}`; } }
        }
      },
      scales: {
        x: { stacked: false, grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#9ca3af', font: { size: 10 } } },
        y: { stacked: false, type: 'linear', position: 'left', grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#9ca3af', callback: (value) => formatToken(value) }, title: { display: true, text: t('col_total'), color: '#f3f4f6' } },
        y1: { stacked: false, type: 'linear', position: 'right', grid: { drawOnChartArea: false }, ticks: { color: '#9ca3af', stepSize: 1 }, title: { display: true, text: t('col_turns') } }
      }
    }
  });
  updateChartsTheme(document.documentElement.getAttribute('data-theme') || 'dark');
}

// =========================================================================
// Table Sorting
// =========================================================================
function initTableSorting() {
  document.querySelectorAll('.premium-table th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const column = th.getAttribute('data-sort');
      const tableType = th.getAttribute('data-table');
      if (tableType === 'monthly') {
        if (monthlyDailySortColumn === column) monthlyDailySortDirection = monthlyDailySortDirection === 'asc' ? 'desc' : 'asc';
        else { monthlyDailySortColumn = column; monthlyDailySortDirection = 'desc'; }
        sortAndRenderMonthlyDailyTable();
      } else {
        if (currentSortColumn === column) currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
        else {
          currentSortColumn = column;
          const numericColumns = ['user_message_count','total_input_tokens','total_output_tokens','total_cache_creation_tokens','total_cache_read_tokens','total_tokens','duration_minutes'];
          currentSortDirection = numericColumns.includes(column) ? 'desc' : 'asc';
        }
        sortAndRenderSessionTable();
      }
    });
  });
}

function sortAndRenderSessionTable() {
  if (!currentSessions || currentSessions.length === 0) { renderSessionTable([]); return; }
  currentSessions.sort((a, b) => {
    let valA = a[currentSortColumn] ?? 0;
    let valB = b[currentSortColumn] ?? 0;
    if (typeof valA === 'string' && typeof valB === 'string') return currentSortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    return currentSortDirection === 'asc' ? valA - valB : valB - valA;
  });
  renderSessionTable(currentSessions);
  updateSortHeadersUI();
}

function updateSortHeadersUI() {
  document.querySelectorAll('.premium-table th.sortable:not([data-table="monthly"])').forEach(th => {
    const column = th.getAttribute('data-sort');
    const icon = th.querySelector('.sort-icon');
    if (!icon) return;
    th.classList.remove('sorted-asc', 'sorted-desc');
    if (column === currentSortColumn) {
      th.classList.add(currentSortDirection === 'asc' ? 'sorted-asc' : 'sorted-desc');
      icon.innerHTML = currentSortDirection === 'asc' ? '▴' : '▾';
    } else { icon.innerHTML = '<span class="sort-icon-placeholder">▴▾</span>'; }
  });
}

// =========================================================================
// Session Table
// =========================================================================
function renderSessionTable(sessions) {
  const tbody = document.getElementById('session-list-body');
  document.getElementById('session-count').textContent = `${sessions.length} Sessions`;
  tbody.innerHTML = '';
  if (sessions.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" class="placeholder-text">${t('placeholder_no_sessions')}</td></tr>`;
    return;
  }
  sessions.forEach(s => {
    const tr = document.createElement('tr');
    const timeFormatted = s.start_time ? formatLocalTime(s.start_time, true) : '-';
    const displayName = s.first_prompt || s.session_id;
    tr.innerHTML = `
      <td class="session-name-cell" title="${escapeHtml(displayName)}">${escapeHtml(displayName)}<span class="session-id-sub">${s.session_id}</span></td>
      <td><span class="badge highlight">${escapeHtml(s.model)}</span></td>
      <td><span class="badge">${s.user_message_count || 0}</span></td>
      <td style="color: var(--text-secondary);">${formatToken(s.total_input_tokens || 0)}</td>
      <td style="color: var(--text-secondary);">${formatToken(s.total_output_tokens || 0)}</td>
      <td style="color: #a78bfa;">${formatToken(s.total_cache_creation_tokens || 0)}</td>
      <td style="color: #34d399;">${formatToken(s.total_cache_read_tokens || 0)}</td>
      <td style="font-weight: 700; color: #fbbf24;">${formatToken(s.total_tokens)}</td>
      <td style="font-weight: 700; color: var(--accent-cyan);">${formatCost(s.cost_usd || 0)}</td>
      <td>${formatDurationMinutes(s.duration_minutes)}</td>
      <td style="color: var(--text-secondary);">${timeFormatted}</td>
    `;
    tr.addEventListener('click', () => openSessionTimeline(s.session_id, s.first_prompt, s.total_tokens, s.total_cache_read_tokens, s.total_cache_creation_tokens, s.total_input_tokens, s.total_output_tokens, s.project_path, s.model));
    tbody.appendChild(tr);
  });
}

// =========================================================================
// Session Timeline
// =========================================================================
async function openSessionTimeline(sessionId, firstPrompt, totalTokens, cacheReadTokens, cacheCreationTokens, inputTokens, outputTokens, projectPath, model) {
  const drawerOverlay = document.getElementById('timeline-drawer');
  const timelineContainer = document.getElementById('timeline-items');

  currentSessionTotalTokens = totalTokens || 0;
  currentSessionCacheTokens = cacheReadTokens || 0;
  currentSessionCacheCreationTokens = cacheCreationTokens || 0;
  currentSessionInputTokens = inputTokens || 0;
  currentSessionOutputTokens = outputTokens || 0;
  currentSessionProjectPath = projectPath || '';
  currentSessionModel = model || '';

  let displayName = firstPrompt || sessionId || '';
  if (displayName.length > 100) displayName = displayName.substring(0, 100) + '...';
  const nameEl = document.getElementById('drawer-session-name');
  nameEl.textContent = displayName;
  nameEl.title = firstPrompt || '';
  document.getElementById('drawer-session-id').textContent = sessionId;

  document.getElementById('meta-cwd').textContent = projectPath || '-';
  document.getElementById('meta-cwd').title = projectPath || '';
  document.getElementById('meta-model').textContent = model || '-';
  document.getElementById('meta-tokens').textContent = formatToken(totalTokens || 0);
  document.getElementById('meta-cache').textContent = formatToken(cacheReadTokens || 0);
  document.getElementById('meta-cache-creation').textContent = formatToken(cacheCreationTokens || 0);
  document.getElementById('meta-input').textContent = formatToken(inputTokens || 0);
  document.getElementById('meta-output').textContent = formatToken(outputTokens || 0);

  timelineContainer.innerHTML = `<div class="placeholder-text">${t('drawer_loading')}</div>`;
  drawerOverlay.classList.add('active');

  try {
    const res = await fetch(`/api/session/${sessionId}`);
    if (res.status === 404) {
      timelineContainer.innerHTML = `<div class="placeholder-text" style="color: var(--neon-red);">${t('drawer_load_failed_cleaned')}</div>`;
      return;
    }
    renderTimeline(await res.json());
  } catch (err) {
    timelineContainer.innerHTML = `<div class="placeholder-text" style="color: var(--neon-red);">${t('drawer_load_failed')}</div>`;
  }
}

function closeDrawer() { document.getElementById('timeline-drawer').classList.remove('active'); }

// =========================================================================
// Render Timeline
// =========================================================================
function renderTimeline(data) {
  const { metadata, timeline } = data;
  const timelineContainer = document.getElementById('timeline-items');
  timelineContainer.innerHTML = '';

  const finalProjectPath = metadata.project_path || currentSessionProjectPath || '-';
  const finalModel = metadata.model || currentSessionModel || '-';
  document.getElementById('meta-cwd').textContent = finalProjectPath;
  document.getElementById('meta-cwd').title = finalProjectPath;
  document.getElementById('meta-model').textContent = finalModel;

  document.getElementById('meta-tokens').textContent = formatToken(metadata.total_tokens || currentSessionTotalTokens || 0);
  document.getElementById('meta-cache').textContent = formatToken(metadata.total_cache_read_tokens || currentSessionCacheTokens || 0);
  document.getElementById('meta-cache-creation').textContent = formatToken(metadata.total_cache_creation_tokens || currentSessionCacheCreationTokens || 0);
  document.getElementById('meta-input').textContent = formatToken(metadata.total_input_tokens || currentSessionInputTokens || 0);
  document.getElementById('meta-output').textContent = formatToken(metadata.total_output_tokens || currentSessionOutputTokens || 0);

  if (!timeline || timeline.length === 0) {
    timelineContainer.innerHTML = `<div class="placeholder-text">${t('drawer_no_events')}</div>`;
    return;
  }

  let currentTurnNo = 1;
  let isFirstPrompt = true;

  timeline.forEach(item => {
    const timeStr = item.event_data.timestamp ? formatLocalTime(item.event_data.timestamp, true) : '';
    const div = document.createElement('div');
    div.className = 'timeline-item-wrapper';

    switch (item.event_type) {
      case 'UserPrompt': {
        if (!isFirstPrompt) currentTurnNo++;
        isFirstPrompt = false;
        const prompt = item.event_data.prompt;
        div.innerHTML = `
          <div class="timeline-dot"></div>
          <div class="user-bubble">
            <div class="bubble-header">
              <div class="header-left"><span class="turn-no-badge">#${currentTurnNo}</span><span class="sender">${t('sender_user')}</span></div>
              <span class="time">${timeStr}</span>
            </div>
            <div class="prompt-content-wrapper">
              <div class="prompt-text collapsed">${escapeHtml(prompt)}</div>
              <button class="prompt-toggle-btn"><span class="btn-text">${t('expand_reply')}</span> <span class="arrow">▼</span></button>
            </div>
          </div>`;
        const promptText = div.querySelector('.prompt-text');
        const promptToggleBtn = div.querySelector('.prompt-toggle-btn');
        if (promptText && promptToggleBtn) {
          promptToggleBtn.addEventListener('click', () => {
            const collapsed = promptText.classList.contains('collapsed');
            promptText.classList.toggle('collapsed', !collapsed);
            promptText.classList.toggle('expanded', collapsed);
            promptToggleBtn.classList.toggle('expanded', collapsed);
            promptToggleBtn.querySelector('.btn-text').textContent = collapsed ? t('collapse_reply') : t('expand_reply');
            promptToggleBtn.querySelector('.arrow').textContent = collapsed ? '▲' : '▼';
          });
        }
        break;
      }

      case 'AssistantReply': {
        const replyMarkdown = item.event_data.reply;
        const model = item.event_data.model;
        const usage = item.event_data.usage || {};
        const outTokens = usage.output_tokens;
        const inTokens = usage.input_tokens;
        const cacheReadTokens = usage.cache_read_input_tokens;
        const cacheCreationTokens = usage.cache_creation_input_tokens;
        const totalTokens = (inTokens || outTokens) ? ((inTokens || 0) + (outTokens || 0)) : null;
        const toolCalls = item.event_data.tool_calls || [];

        let replyHtml = (!replyMarkdown && toolCalls.length > 0)
          ? `<span style="font-style: italic; color: var(--text-muted);">${t('thinking_tools')}</span>`
          : marked.parse(replyMarkdown || '');

        let tokenBadge = '';
        if (totalTokens || inTokens || outTokens || cacheReadTokens || cacheCreationTokens) {
          tokenBadge = `<div class="turn-token-stats">
            ${inTokens ? `<span class="token-badge input" title="Input">In: ${formatToken(inTokens)}</span>` : ''}
            ${outTokens ? `<span class="token-badge output" title="Output">Out: ${formatToken(outTokens)}</span>` : ''}
            ${cacheCreationTokens ? `<span class="token-badge reasoning" title="Cache Creation">Cache+: ${formatToken(cacheCreationTokens)}</span>` : ''}
            ${cacheReadTokens ? `<span class="token-badge cache" title="Cache Read">Cache: ${formatToken(cacheReadTokens)}</span>` : ''}
            ${totalTokens ? `<span class="token-badge total" title="Total">Total: ${formatToken(totalTokens)}</span>` : ''}
          </div>`;
        }

        let toolCallsHtml = '';
        if (toolCalls.length > 0) {
          toolCallsHtml = '<div class="tool-calls-list">';
          toolCalls.forEach(tc => {
            const inputStr = tc.input ? JSON.stringify(tc.input, null, 2) : '{}';
            const truncInput = inputStr.length > 1000 ? inputStr.substring(0, 1000) + '\n' + t('data_truncated') : inputStr;
            toolCallsHtml += `<div class="tool-call-item"><div class="tool-header" style="cursor:pointer;">🔧 <span class="tool-name">${escapeHtml(tc.name)}</span><span class="toggle-icon">▶</span></div><div class="tool-details" style="display:none;"><div class="detail-section"><pre><code>${escapeHtml(truncInput)}</code></pre></div></div></div>`;
          });
          toolCallsHtml += '</div>';
        }

        const copyButtonHtml = replyMarkdown ? `<button class="copy-markdown-btn" title="${t('copy_markdown_title')}">📋 <span class="btn-text">${t('copy_markdown')}</span></button>` : '';

        div.innerHTML = `
          <div class="timeline-dot"></div>
          <div class="assistant-bubble">
            <div class="bubble-header">
              <div class="header-left"><span class="turn-no-badge">#${currentTurnNo}</span><span class="sender">${t('sender_agent')} (${escapeHtml(model || '')})</span></div>
              <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">${copyButtonHtml}<span class="time">${timeStr}</span></div>
            </div>
            ${tokenBadge}
            <div class="reply-content-wrapper">
              <div class="reply-content collapsed">${replyHtml}</div>
              <button class="reply-toggle-btn"><span class="btn-text">${t('expand_reply')}</span> <span class="arrow">▼</span></button>
            </div>
            ${toolCallsHtml}
          </div>`;

        div.querySelectorAll('.tool-call-item .tool-header').forEach(header => {
          header.addEventListener('click', () => {
            const details = header.closest('.tool-call-item').querySelector('.tool-details');
            const icon = header.querySelector('.toggle-icon');
            const hidden = details.style.display === 'none';
            details.style.display = hidden ? 'block' : 'none';
            if (icon) icon.textContent = hidden ? '▼' : '▶';
          });
        });

        const replyContent = div.querySelector('.reply-content');
        const toggleBtn = div.querySelector('.reply-toggle-btn');
        if (replyContent && toggleBtn) {
          toggleBtn.addEventListener('click', () => {
            const collapsed = replyContent.classList.contains('collapsed');
            replyContent.classList.toggle('collapsed', !collapsed);
            replyContent.classList.toggle('expanded', collapsed);
            toggleBtn.classList.toggle('expanded', collapsed);
            toggleBtn.querySelector('.btn-text').textContent = collapsed ? t('collapse_reply') : t('expand_reply');
            toggleBtn.querySelector('.arrow').textContent = collapsed ? '▲' : '▼';
          });
        }

        if (replyMarkdown) {
          const copyBtn = div.querySelector('.copy-markdown-btn');
          if (copyBtn) {
            copyBtn.addEventListener('click', () => {
              navigator.clipboard.writeText(replyMarkdown).then(() => {
                const btnTextEl = copyBtn.querySelector('.btn-text');
                const orig = btnTextEl ? btnTextEl.textContent : '';
                if (btnTextEl) btnTextEl.textContent = t('copy_success');
                copyBtn.classList.add('copied');
                setTimeout(() => { if (btnTextEl) btnTextEl.textContent = orig; copyBtn.classList.remove('copied'); }, 2000);
              }).catch(() => showNotification(t('copy_failed'), 'error'));
            });
          }
        }
        break;
      }

      case 'ToolResult': {
        const toolName = item.event_data.tool_name;
        const result = item.event_data.result;
        const isError = item.event_data.is_error || false;
        let resultStr = t('no_returned_data');
        if (result) {
          if (result.toolUseResult) {
            const tr = result.toolUseResult;
            resultStr = tr.stdout || (tr.stderr ? `[stderr] ${tr.stderr}` : JSON.stringify(tr, null, 2));
          } else if (result.content) resultStr = result.content;
          else resultStr = JSON.stringify(result, null, 2);
        }
        const truncResult = resultStr.length > 1500 ? resultStr.substring(0, 1500) + '\n' + t('data_truncated') : resultStr;
        div.innerHTML = `
          <div class="timeline-dot"></div>
          <div class="tool-step-bubble">
            <div class="tool-header">
              <div class="tool-info">🔧 <span class="tool-name">${escapeHtml(toolName || '')}</span><span class="${isError ? 'badge error' : 'badge success'}">${isError ? 'Error' : 'Success'}</span></div>
              <span class="toggle-icon">▶</span>
            </div>
            <div class="tool-details">
              <div class="detail-section"><span>${t('tool_result')}</span><pre><code>${escapeHtml(truncResult)}</code></pre></div>
            </div>
          </div>`;
        const header = div.querySelector('.tool-header');
        header.addEventListener('click', () => {
          const bubble = header.closest('.tool-step-bubble');
          bubble.classList.toggle('expanded');
          header.querySelector('.toggle-icon').textContent = bubble.classList.contains('expanded') ? '▼' : '▶';
        });
        break;
      }

      case 'SystemStatus': {
        let message = item.event_data.message;
        if (message === '會話開始 (Session Started)') message = t('session_started');
        else if (message === '會話結束 (Session Ended)') message = t('session_ended');
        else if (message === '會話狀態壓縮完成 (Session Compaction Completed)') message = t('session_compaction');
        const emoji = item.event_data.status_type === 'session_compaction' ? '🗜️' : '⚙️';
        div.innerHTML = `<div class="timeline-dot"></div><div class="system-bubble"><div class="system-badge">${emoji} ${escapeHtml(message)} <span class="time">${timeStr}</span></div></div>`;
        break;
      }
    }
    timelineContainer.appendChild(div);
  });
}

// =========================================================================
// Helpers
// =========================================================================
function formatNumber(num) {
  if (num === null || num === undefined) return '-';
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatToken(num) {
  if (num === null || num === undefined) return '-';
  const n = Number(num);
  if (isNaN(n)) return '-';
  if (n >= 1000000) { const v = n / 1000000; return (v % 1 === 0 ? v : v.toFixed(1)) + 'm'; }
  if (n >= 1000) { const v = n / 1000; return (v % 1 === 0 ? v : v.toFixed(1)) + 'k'; }
  return n.toString();
}

function calculatePercentage(part, total) {
  if (!total) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}

function formatDurationMinutes(minutes) {
  if (minutes === null || minutes === undefined || minutes === 0) return '-';
  const m = Number(minutes);
  if (isNaN(m) || m <= 0) return '-';
  if (m < 1) return `${Math.round(m * 60)}s`;
  const totalSecsInt = Math.floor(m * 60);
  const hours = Math.floor(totalSecsInt / 3600);
  const mins = Math.floor((totalSecsInt % 3600) / 60);
  const secs = totalSecsInt % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(mins)}:${pad(secs)}` : `${mins}:${pad(secs)}`;
}

function formatLocalTime(isoString, includeSeconds = true) {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    const h = pad(date.getHours()), m = pad(date.getMinutes());
    return includeSeconds ? `${h}:${m}:${pad(date.getSeconds())}` : `${h}:${m}`;
  } catch (err) { return ''; }
}

function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// =========================================================================
// Monthly Data
// =========================================================================
async function fetchMonths(selectedMonth = null) {
  try {
    const res = await fetch('/api/months');
    const data = await res.json();
    const monthSelect = document.getElementById('month-select');
    monthSelect.innerHTML = '';
    if (!data.months || data.months.length === 0) {
      monthSelect.innerHTML = `<option value="" disabled selected>${t('no_month_logs')}</option>`;
      return;
    }
    let monthToLoad = data.months[0];
    let hasSelected = false;
    data.months.forEach((month) => {
      const opt = document.createElement('option');
      opt.value = month; opt.textContent = month;
      if (selectedMonth && month === selectedMonth) { opt.selected = true; monthToLoad = month; hasSelected = true; }
      monthSelect.appendChild(opt);
    });
    if (!hasSelected && monthSelect.options.length > 0) monthSelect.options[0].selected = true;
    if (activeTab === 'monthly') await loadMonthlyData(monthToLoad);
  } catch (err) { showNotification(t('load_failed'), 'error'); }
}

async function reloadMonthlyData() {
  await fetchMonths(document.getElementById('month-select').value);
}

async function loadMonthlyData(month) {
  try {
    document.getElementById('current-date-title').innerHTML = `<span class="title-icon">⌛</span> <span class="title-text">${t('loading_month_prefix')}${month}...</span>`;
    const res = await fetch(`/api/monthly/${month}`);
    if (res.status === 404) { showNotification(t('month_not_found'), 'error'); return; }
    renderMonthlyDashboard(await res.json());
  } catch (err) { showNotification(t('monthly_load_failed'), 'error'); }
}

function renderMonthlyDashboard(data) {
  currentMonthlyData = data;
  const { year_month, summary, daily_breakdown, top_models, top_projects } = data;

  document.getElementById('current-date-title').innerHTML = `<span class="title-icon">📅</span> <span class="title-text">${t('monthly_report')}${year_month}</span>`;
  document.getElementById('copilot-version-badge').textContent = 'Monthly Summary';

  document.getElementById('monthly-stat-total-tokens').textContent = formatToken(summary.total_tokens);
  document.getElementById('monthly-stat-cache-read').textContent = `${t('cache_read_label')}: ${formatToken(summary.total_cache_read_tokens)} (${calculatePercentage(summary.total_cache_read_tokens, summary.total_tokens)})`;
  document.getElementById('monthly-stat-input-tokens').textContent = formatToken(summary.total_input_tokens);
  document.getElementById('monthly-stat-input-pct').textContent = `${t('ratio_label')}: ${calculatePercentage(summary.total_input_tokens, summary.total_tokens)}`;
  document.getElementById('monthly-stat-output-tokens').textContent = formatToken(summary.total_output_tokens);
  document.getElementById('monthly-stat-output-pct').textContent = `${t('ratio_label')}: ${calculatePercentage(summary.total_output_tokens, summary.total_tokens)}`;
  document.getElementById('monthly-stat-sessions').textContent = summary.total_sessions;
  document.getElementById('monthly-stat-duration').textContent = t('monthly_duration').replace('{val}', formatDurationMinutes(summary.total_duration_minutes || 0));
  document.getElementById('monthly-stat-total-cost').textContent = formatCost(summary.total_cost_usd || 0);

  renderMonthlyChart(daily_breakdown);
  renderMonthlyProjectsTable(top_projects);
  renderMonthlyModelsTable(top_models);
  monthlyDailySortColumn = 'date'; monthlyDailySortDirection = 'desc';
  sortAndRenderMonthlyDailyTable();
}

function renderMonthlyChart(dailyBreakdown) {
  currentMonthlyBreakdown = dailyBreakdown;
  const canvas = document.getElementById('monthlyTokenChart');
  const labels = dailyBreakdown.map(e => e.date.substring(5));
  const tokenData = dailyBreakdown.map(e => e.total_tokens);
  const cacheData = dailyBreakdown.map(e => e.total_cache_read_tokens || 0);
  const sessionData = dailyBreakdown.map(e => e.total_sessions);

  if (monthlyChartInstance) {
    monthlyChartInstance.data.labels = labels;
    monthlyChartInstance.data.datasets[0].label = t('chart_monthly_token_label');
    monthlyChartInstance.data.datasets[1].label = t('chart_cache_label');
    monthlyChartInstance.data.datasets[2].label = t('chart_monthly_session_label');
    monthlyChartInstance.data.datasets[0].data = tokenData;
    monthlyChartInstance.data.datasets[1].data = cacheData;
    monthlyChartInstance.data.datasets[2].data = sessionData;
    if (monthlyChartInstance.options.scales.y.title) monthlyChartInstance.options.scales.y.title.text = t('col_total');
    if (monthlyChartInstance.options.scales.y1.title) monthlyChartInstance.options.scales.y1.title.text = t('col_sessions_count');
    monthlyChartInstance.update(); return;
  }

  monthlyChartInstance = new Chart(canvas, {
    type: 'bar', data: { labels,
      datasets: [
        { label: t('chart_monthly_token_label'), data: tokenData, backgroundColor: 'rgba(0, 242, 254, 0.22)', borderColor: '#00f2fe', borderWidth: 1.5, borderRadius: 6, yAxisID: 'y', grouped: false, barPercentage: 0.8 },
        { label: t('chart_cache_label'), data: cacheData, backgroundColor: 'rgba(129, 140, 248, 0.75)', borderColor: '#818cf8', borderWidth: 1.5, borderRadius: 6, yAxisID: 'y', grouped: false, barPercentage: 0.8 },
        { label: t('chart_monthly_session_label'), data: sessionData, type: 'line', borderColor: '#ff4b5c', backgroundColor: 'rgba(255, 75, 92, 0.2)', borderWidth: 2, pointBackgroundColor: '#ff4b5c', pointRadius: 4, tension: 0.2, yAxisID: 'y1' }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      onClick: (event, elements) => {
        if (elements && elements.length > 0) {
          const entry = currentMonthlyBreakdown[elements[0].index];
          if (entry && entry.date) switchToDailyDate(entry.date);
        }
      },
      onHover: (event, activeElements) => { canvas.style.cursor = activeElements.length ? 'pointer' : 'default'; },
      plugins: {
        legend: { labels: { color: '#f3f4f6', font: { family: 'Outfit' } } },
        tooltip: { padding: 12, backgroundColor: 'rgba(15, 18, 29, 0.95)', titleColor: '#00f2fe', bodyColor: '#f3f4f6', borderColor: 'rgba(255, 255, 255, 0.1)', borderWidth: 1,
          callbacks: { label: (context) => { const label = context.dataset.label || ''; const value = context.parsed.y; return label.includes('Token') ? `${label}: ${formatToken(value)} (${formatNumber(value)})` : `${label}: ${formatNumber(value)}`; } }
        }
      },
      scales: {
        x: { stacked: false, grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#9ca3af', font: { size: 10 } } },
        y: { stacked: false, type: 'linear', position: 'left', grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#9ca3af', callback: (value) => formatToken(value) }, title: { display: true, text: t('col_total'), color: '#f3f4f6' } },
        y1: { stacked: false, type: 'linear', position: 'right', grid: { drawOnChartArea: false }, ticks: { color: '#9ca3af', stepSize: 1 }, title: { display: true, text: t('col_sessions_count') } }
      }
    }
  });
  updateChartsTheme(document.documentElement.getAttribute('data-theme') || 'dark');
}

function renderMonthlyProjectsTable(projects) {
  const tbody = document.getElementById('monthly-projects-body');
  tbody.innerHTML = '';
  if (projects.length === 0) { tbody.innerHTML = `<tr><td colspan="4" class="placeholder-text">${t('placeholder_no_projects')}</td></tr>`; return; }
  projects.slice(0, 15).forEach((p, idx) => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'default';
    tr.innerHTML = `
      <td style="text-align:center;"><span class="badge ${idx < 3 ? 'highlight' : ''}">${idx + 1}</span></td>
      <td class="cwd-cell" title="${escapeHtml(p.project)}" style="max-width:250px;">${escapeHtml(p.project)}</td>
      <td><span class="badge">${p.session_count} Sessions</span></td>
      <td style="font-weight:700;color:var(--accent-cyan);">${formatToken(p.total_tokens)}${p.total_cache_read_tokens ? `<div style="font-size:0.72rem;font-weight:normal;color:#a5b4fc;margin-top:3px;">${t('cache_prefix')}${formatToken(p.total_cache_read_tokens)}</div>` : ''}</td>`;
    tbody.appendChild(tr);
  });
}

function renderMonthlyModelsTable(models) {
  const tbody = document.getElementById('monthly-models-body');
  tbody.innerHTML = '';
  if (models.length === 0) { tbody.innerHTML = `<tr><td colspan="5" class="placeholder-text">${t('placeholder_no_models')}</td></tr>`; return; }
  models.forEach((m, idx) => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'default';
    tr.innerHTML = `
      <td style="text-align:center;"><span class="badge ${idx < 3 ? 'highlight' : ''}">${idx + 1}</span></td>
      <td><span class="badge highlight">${escapeHtml(m.model)}</span></td>
      <td><span class="badge">${m.session_count} Sessions</span></td>
      <td style="font-weight:700;color:var(--accent-purple);">${formatToken(m.total_tokens)}${m.total_cache_read_tokens ? `<div style="font-size:0.72rem;font-weight:normal;color:#a5b4fc;margin-top:3px;">${t('cache_prefix')}${formatToken(m.total_cache_read_tokens)}</div>` : ''}</td>
      <td style="font-weight:700;color:var(--neon-gold);">${formatCost(m.cost_usd || 0)}</td>`;
    tbody.appendChild(tr);
  });
}

function renderMonthlyDailySummaryTable(dailyBreakdown) {
  const tbody = document.getElementById('monthly-daily-summary-body');
  tbody.innerHTML = '';
  if (!dailyBreakdown || dailyBreakdown.length === 0) { tbody.innerHTML = `<tr><td colspan="7" class="placeholder-text">${t('placeholder_no_daily_summary')}</td></tr>`; return; }
  dailyBreakdown.forEach(entry => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.addEventListener('click', () => switchToDailyDate(entry.date));
    tr.innerHTML = `
      <td style="font-weight:600;color:var(--accent-cyan);">${escapeHtml(entry.date)}</td>
      <td style="color:var(--text-secondary);">${formatToken(entry.total_input_tokens || 0)}</td>
      <td style="color:var(--text-secondary);">${formatToken(entry.total_output_tokens || 0)}</td>
      <td style="color:#a78bfa;">${formatToken(entry.total_cache_creation_tokens || 0)}</td>
      <td style="color:#34d399;">${formatToken(entry.total_cache_read_tokens || 0)}</td>
      <td style="font-weight:700;color:#fbbf24;">${formatToken(entry.total_tokens)}</td>
      <td style="font-weight:700;color:var(--neon-gold);">${formatCost(entry.cost_usd || 0)}</td>`;
    tbody.appendChild(tr);
  });
}

function sortAndRenderMonthlyDailyTable() {
  if (!currentMonthlyBreakdown || currentMonthlyBreakdown.length === 0) { renderMonthlyDailySummaryTable([]); return; }
  currentMonthlyBreakdown.sort((a, b) => {
    let valA, valB;
    if (monthlyDailySortColumn === 'date') { valA = a.date; valB = b.date; }
    else {
      const keyMap = { 'input': 'total_input_tokens', 'output': 'total_output_tokens', 'cache_creation': 'total_cache_creation_tokens', 'cache': 'total_cache_read_tokens', 'total': 'total_tokens', 'cost': 'cost_usd' };
      const field = keyMap[monthlyDailySortColumn] || monthlyDailySortColumn;
      valA = a[field]; valB = b[field];
    }
    if (valA === undefined || valA === null) valA = 0;
    if (valB === undefined || valB === null) valB = 0;
    if (typeof valA === 'string' && typeof valB === 'string') return monthlyDailySortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    return monthlyDailySortDirection === 'asc' ? valA - valB : valB - valA;
  });
  renderMonthlyDailySummaryTable(currentMonthlyBreakdown);
  updateMonthlySortHeadersUI();
}

function updateMonthlySortHeadersUI() {
  document.querySelectorAll('.premium-table th.sortable[data-table="monthly"]').forEach(th => {
    const column = th.getAttribute('data-sort');
    const icon = th.querySelector('.sort-icon');
    if (!icon) return;
    th.classList.remove('sorted-asc', 'sorted-desc');
    if (column === monthlyDailySortColumn) {
      th.classList.add(monthlyDailySortDirection === 'asc' ? 'sorted-asc' : 'sorted-desc');
      icon.innerHTML = monthlyDailySortDirection === 'asc' ? '▴' : '▾';
    } else { icon.innerHTML = '<span class="sort-icon-placeholder">▴▾</span>'; }
  });
}

// =========================================================================
// Toast
// =========================================================================
function showNotification(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    Object.assign(container.style, { position: 'fixed', bottom: '24px', right: '24px', zIndex: '9999', display: 'flex', flexDirection: 'column', gap: '10px' });
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'glass-card';
  Object.assign(toast.style, { padding: '12px 20px', borderRadius: '10px', boxShadow: 'var(--shadow-lg)', border: '1px solid var(--glass-border)', animation: 'slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', fontWeight: '500' });
  if (!document.getElementById('toast-animation-styles')) {
    const style = document.createElement('style');
    style.id = 'toast-animation-styles';
    style.innerHTML = '@keyframes slideIn{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}@keyframes fadeOut{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(-20px)}}';
    document.head.appendChild(style);
  }
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const colors = { success: 'var(--neon-green)', error: 'var(--neon-red)', info: 'var(--accent-cyan)' };
  toast.innerHTML = `<span style="font-size:16px;">${icons[type] || 'ℹ️'}</span> <span style="color:${colors[type] || colors.info};font-family:var(--font-display);">${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
    toast.addEventListener('animationend', () => toast.remove());
  }, 3000);
}

// =========================================================================
// Theme
// =========================================================================
function initThemeToggle() {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeButton(savedTheme);
  const themeBtn = document.getElementById('theme-toggle-btn');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);
      updateThemeButton(newTheme);
      updateChartsTheme(newTheme);
    });
  }
}

function updateThemeButton(theme) {
  const themeBtn = document.getElementById('theme-toggle-btn');
  if (themeBtn) {
    themeBtn.textContent = theme === 'dark' ? '🌞' : '🌙';
    themeBtn.title = theme === 'dark' ? t('theme_toggle_title_dark') : t('theme_toggle_title_light');
  }
}

function updateChartsTheme(theme) {
  const isLight = theme === 'light';
  const textColor = isLight ? '#1e293b' : '#f3f4f6';
  const mutedColor = isLight ? '#64748b' : '#9ca3af';
  const gridColor = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
  const tooltipBg = isLight ? 'rgba(255,255,255,0.95)' : 'rgba(15,18,29,0.95)';
  const tooltipBorder = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';
  [tokenChartInstance, monthlyChartInstance].forEach(chart => {
    if (!chart) return;
    if (chart.options.plugins.legend?.labels) chart.options.plugins.legend.labels.color = textColor;
    if (chart.options.plugins.tooltip) {
      chart.options.plugins.tooltip.backgroundColor = tooltipBg;
      chart.options.plugins.tooltip.titleColor = isLight ? '#0284c7' : '#00f2fe';
      chart.options.plugins.tooltip.bodyColor = textColor;
      chart.options.plugins.tooltip.borderColor = tooltipBorder;
    }
    if (chart.options.scales) {
      Object.values(chart.options.scales).forEach(scale => {
        if (scale.grid) scale.grid.color = gridColor;
        if (scale.ticks) scale.ticks.color = mutedColor;
        if (scale.title) scale.title.color = textColor;
      });
    }
    chart.update();
  });
}

// =========================================================================
// Setup Guide
// =========================================================================
function initSetupGuide() {
  const setupBtn = document.getElementById('btn-setup-guide');
  const closeBtn = document.getElementById('close-setup-modal-btn');
  const modalOverlay = document.getElementById('setup-guide-modal');
  if (setupBtn) setupBtn.addEventListener('click', openSetupModal);
  if (closeBtn) closeBtn.addEventListener('click', closeSetupModal);
  if (modalOverlay) modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeSetupModal(); });
  loadSetupInfo();
  initClipboardButtons();
}

function openSetupModal() { document.getElementById('setup-guide-modal')?.classList.add('active'); }
function closeSetupModal() { document.getElementById('setup-guide-modal')?.classList.remove('active'); }

async function loadSetupInfo() {
  try {
    const res = await fetch('/api/setup-info');
    const data = await res.json();
    const claudeDir = data.claude_dir || '~/.claude/';
    const el = document.getElementById('lbl-detected-claude-dir');
    if (el) el.textContent = claudeDir;
  } catch (err) { console.error('Failed to load setup info:', err); }
}

function initClipboardButtons() {
  document.querySelectorAll('.copy-code-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      let textToCopy = btn.getAttribute('data-clipboard-text');
      if (!textToCopy) {
        const codeEl = btn.nextElementSibling?.querySelector('code') || btn.nextElementSibling;
        textToCopy = codeEl ? codeEl.textContent : '';
      }
      navigator.clipboard.writeText(textToCopy.trim()).then(() => {
        const orig = btn.textContent;
        btn.textContent = t('copy_success');
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 2000);
      }).catch(() => showNotification(t('copy_failed'), 'error'));
    });
  });
}

function toggleEmptyState(showEmpty) {
  const emptyContainer = document.getElementById('empty-state-container');
  const grids = document.querySelectorAll('#daily-view-container > .dashboard-grid');
  const charts = document.querySelectorAll('#daily-view-container > .charts-section');
  const sessions = document.querySelectorAll('#daily-view-container > .sessions-section');
  if (showEmpty) {
    if (emptyContainer) {
      emptyContainer.classList.remove('hidden');
      emptyContainer.innerHTML = `<div class="welcome-setup-card"><div class="card-icon">🤖</div><h2>${t('empty_title')}</h2><p>${t('empty_desc')}</p><div class="action-buttons"><button class="primary-btn" id="btn-empty-setup-guide">${t('btn_empty_setup')}</button><button class="secondary-btn" id="btn-empty-refresh">${t('btn_empty_refresh')}</button></div></div>`;
      document.getElementById('btn-empty-setup-guide')?.addEventListener('click', openSetupModal);
      const emptyRefreshBtn = document.getElementById('btn-empty-refresh');
      if (emptyRefreshBtn) {
        emptyRefreshBtn.addEventListener('click', async () => {
          emptyRefreshBtn.classList.add('loading');
          await fetchDates();
          emptyRefreshBtn.classList.remove('loading');
        });
      }
    }
    grids.forEach(el => el.classList.add('hidden'));
    charts.forEach(el => el.classList.add('hidden'));
    sessions.forEach(el => el.classList.add('hidden'));
  } else {
    if (emptyContainer) emptyContainer.classList.add('hidden');
    grids.forEach(el => el.classList.remove('hidden'));
    charts.forEach(el => el.classList.remove('hidden'));
    sessions.forEach(el => el.classList.remove('hidden'));
  }
}

function switchToDailyDate(date) {
  const dateSelect = document.getElementById('date-select');
  if (!dateSelect) return;
  dateSelect.value = date;
  if (activeTab === 'daily') loadUsageData(date); else switchTab('daily');
}

// =========================================================================
// Pricing Modal
// =========================================================================
async function fetchPricingRules() {
  try {
    const res = await fetch('/api/pricing');
    if (res.ok) pricingRules = await res.json();
  } catch (err) { console.error('Error fetching pricing rules:', err); }
}

function initPricingModal() {
  const pricingBtn = document.getElementById('btn-pricing-sheet');
  const closeBtn = document.getElementById('close-pricing-modal-btn');
  const modalOverlay = document.getElementById('pricing-modal');
  if (pricingBtn) pricingBtn.addEventListener('click', openPricingModal);
  if (closeBtn) closeBtn.addEventListener('click', closePricingModal);
  if (modalOverlay) modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closePricingModal(); });
}

function openPricingModal() {
  const modal = document.getElementById('pricing-modal');
  if (modal) { modal.classList.add('active'); renderPricingModalTable(); }
}

function closePricingModal() { document.getElementById('pricing-modal')?.classList.remove('active'); }

function renderPricingModalTable() {
  const tbody = document.getElementById('pricing-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!pricingRules || pricingRules.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="placeholder-text">載入中...</td></tr>'; return;
  }
  pricingRules.forEach(r => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'default';
    tr.innerHTML = `
      <td style="font-weight:600;"><span class="badge highlight">${escapeHtml(r.model_name)}</span></td>
      <td>${escapeHtml(r.deployment_type)}</td>
      <td>${escapeHtml(r.unit)}</td>
      <td style="color:var(--accent-cyan);font-weight:600;">$${(r.input_price || 0).toFixed(2)}</td>
      <td style="color:#34d399;font-weight:600;">$${(r.cache_read_price || r.cache_input_price || 0).toFixed(2)}</td>
      <td style="color:#a78bfa;font-weight:600;">$${(r.cache_write_price || 0).toFixed(2)}</td>
      <td style="color:var(--accent-cyan);font-weight:600;">$${(r.output_price || 0).toFixed(2)}</td>`;
    tbody.appendChild(tr);
  });
}

function formatCost(cost) {
  if (cost === null || cost === undefined) return '-';
  const c = Number(cost);
  if (isNaN(c)) return '-';
  if (c === 0) return '$0.00';
  if (c < 0.001) return '$' + c.toFixed(5);
  if (c < 0.01) return '$' + c.toFixed(4);
  return '$' + c.toFixed(3);
}
