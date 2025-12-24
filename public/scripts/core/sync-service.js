// public/scripts/core/sync-service.js
// 職責：處理資料輪詢 (Polling) 與寫入後的智慧刷新 (Smart Refresh)

window.CRM_APP = window.CRM_APP || {};

const SyncService = {
    dataTimestamp: 0,
    pollInterval: null,

    /**
     * 啟動輪詢 (每2分鐘一次)
     */
    startPolling() {
        console.log('[Sync] 啟動資料輪詢...');
        this.stopPolling();
        this.checkServer();
        this.pollInterval = setInterval(() => this.checkServer(), 120000);
    },

    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    },

    /**
     * 檢查伺服器時間戳
     */
    async checkServer() {
        try {
            const result = await authedFetch('/api/system/status', { skipRefresh: true });
            if (result.success && result.lastWriteTimestamp) {
                const serverTime = result.lastWriteTimestamp;
                if (this.dataTimestamp === 0) {
                    this.dataTimestamp = serverTime;
                } else if (serverTime > this.dataTimestamp) {
                    console.warn(`[Sync] 偵測到新資料！伺服器: ${serverTime}`);
                    this.showRefreshNotice(true);
                    this.stopPolling();
                }
            }
        } catch (err) {
            if (err.message !== 'Unauthorized') console.error('[Sync] 檢查失敗:', err);
        }
    },

    showRefreshNotice(show) {
        const bar = document.getElementById('data-refresh-notification');
        if (bar) bar.style.display = show ? 'flex' : 'none';
    },

    /**
     * 核心：寫入後的智慧刷新邏輯
     */
    async refreshCurrentView(successMessage = '資料重整中...') {
        console.log('[Sync] 執行智慧刷新...');

        // 1. 失效所有列表頁面的快取 (強制重新 Fetch)
        if (window.CRM_APP.pageConfig) {
            for (const key in window.CRM_APP.pageConfig) {
                const isListPage = !key.includes('-details') && key !== 'weekly-detail';
                if (isListPage) {
                    window.CRM_APP.pageConfig[key].loaded = false;
                }
            }
        }

        // 2. 獲取當前頁面與參數
        const hash = window.location.hash.substring(1);
        const [pageName, paramsString] = hash.split('?');
        let params = {};
        if (paramsString) params = Object.fromEntries(new URLSearchParams(paramsString));

        // 3. 重新導航 (觸發模組的 loadFn)
        try {
            await window.CRM_APP.navigateTo(pageName || 'dashboard', params, false);
            
            // 4. 重設同步狀態
            this.showRefreshNotice(false);
            this.dataTimestamp = 0; // 下次輪詢會更新到最新
            this.startPolling();
        } catch (err) {
            showNotification(`刷新失敗: ${err.message}`, 'error');
        }
    }
};

// 導出全域函式
window.CRM_APP.refreshCurrentView = SyncService.refreshCurrentView.bind(SyncService);
window.CRM_APP.startDataPolling = SyncService.startPolling.bind(SyncService);
window.CRM_APP.stopDataPolling = SyncService.stopPolling.bind(SyncService);
window.CRM_APP.forceRefreshAndRestartPolling = SyncService.refreshCurrentView.bind(SyncService);