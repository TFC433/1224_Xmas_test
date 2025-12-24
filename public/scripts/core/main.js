// public/scripts/core/main.js (重構版)
// 職責：系統初始化入口 (Orchestrator)

window.CRM_APP = window.CRM_APP || {};

CRM_APP.init = async function() {
    console.log('🚀 [Main] TFC CRM系統啟動中...');
    try {
        // 1. 載入靜態資源 (HTML 組件與事件樣板)
        await this.loadResources();

        // 2. 載入伺服器設定
        await this.loadConfig();

        // 3. 初始化 UI 佈局 (側邊欄、使用者)
        LayoutManager.init();

        // 4. 啟動資料輪詢
        this.startDataPolling();

        // 5. 初始化導航系統 (Router)
        Router.init();

        // 6. 載入看板元件 (若存在)
        if (window.kanbanBoardManager?.initialize) {
            window.kanbanBoardManager.initialize();
        }

        // 7. 處理初始進入的 URL Hash
        await this.handleInitialRoute();

        console.log('✅ [Main] 系統載入完成！');
    } catch (err) {
        if (err.message !== 'Unauthorized') {
            console.error('❌ [Main] 初始化失敗:', err);
            showNotification(`初始化失敗: ${err.message}`, 'error', 10000);
        }
    }
};

/**
 * 載入 API 系統設定
 */
CRM_APP.loadConfig = async function() {
    try {
        const data = await authedFetch('/api/config');
        if (data) {
            this.systemConfig = data;
            this.updateAllDropdowns();
        }
    } catch (err) {
        console.error('[Main] 載入 Config 失敗:', err);
    }
};

/**
 * 處理初始進入頁面
 */
CRM_APP.handleInitialRoute = async function() {
    const hash = window.location.hash.substring(1);
    if (hash) {
        const [pageName, paramsString] = hash.split('?');
        if (this.pageConfig[pageName]) {
            let params = {};
            if (paramsString) params = Object.fromEntries(new URLSearchParams(paramsString));
            await this.navigateTo(pageName, params, false);
            return;
        }
    }
    // 預設導向儀表板
    await this.navigateTo('dashboard', {}, false);
    window.history.replaceState(null, '', '#dashboard');
};

/**
 * 載入 HTML 元件與預載樣板
 */
CRM_APP.loadResources = async function() {
    const components = [
        'contact-modals', 'opportunity-modals', 'meeting-modals', 
        'system-modals', 'event-log-modal', 'link-contact-modal', 
        'link-opportunity-modal', 'announcement-modals'
    ];
    
    // 1. 載入 Modals
    const container = document.getElementById('modal-container');
    if (container) {
        const htmls = await Promise.all(components.map(c => 
            fetch(`/components/modals/${c}.html`).then(res => res.text())
        ));
        container.innerHTML = htmls.join('');
    }

    // 2. 預載事件表單樣板
    const types = ['general', 'iot', 'dt', 'dx'];
    const templates = await Promise.all(types.map(t => {
        const file = `/components/forms/event-form-${t === 'dx' ? 'general' : t}.html`;
        return fetch(file).then(res => res.text()).then(html => ({ t, html }));
    }));
    templates.forEach(({ t, html }) => this.formTemplates[t] = html);
};

// 全域小工具
function getCurrentUser() {
    return window.CRM_APP?.currentUser || localStorage.getItem('crmCurrentUserName') || '系統';
}

function logout() {
    localStorage.removeItem('crm-token');
    localStorage.removeItem('crmCurrentUserName');
    window.location.href = '/';
}

// DOM Ready 觸發啟動
document.addEventListener('DOMContentLoaded', () => {
    if (!window.CRM_APP_INITIALIZED) {
        window.CRM_APP_INITIALIZED = true;
        
        // 註冊已載入的模組 (此處維持您原本的註冊方式)
        if (typeof loadWeeklyBusinessPage === 'function') window.CRM_APP.pageModules['weekly-business'] = loadWeeklyBusinessPage;
        if (typeof navigateToWeeklyDetail === 'function') window.CRM_APP.pageModules['weekly-detail'] = navigateToWeeklyDetail;
        if (typeof loadSalesAnalysisPage === 'function') window.CRM_APP.pageModules['sales-analysis'] = loadSalesAnalysisPage;

        CRM_APP.init();
    }
});