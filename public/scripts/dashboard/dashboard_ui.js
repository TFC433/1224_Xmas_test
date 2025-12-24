// public/scripts/dashboard/dashboard_ui.js

const DashboardUI = {
    /**
     * 顯示指定 Widget 的 Loading 狀態
     * @param {string} widgetId - Widget 的 DOM ID (e.g., 'kanban-widget')
     * @param {string} message - 顯示訊息
     */
    showLoading(widgetId, message = '載入中...') {
        const widget = document.getElementById(widgetId);
        if (!widget) return;
        
        // 嘗試找到內部的 .loading 容器，若無則建立
        let loadingEl = widget.querySelector('.loading');
        if (!loadingEl) {
            const content = widget.querySelector('.widget-content') || widget;
            // 檢查是否已經有 .loading 結構 (避免重複)
            if (!content.querySelector('.loading')) {
                loadingEl = document.createElement('div');
                loadingEl.className = 'loading';
                loadingEl.innerHTML = `<div class="spinner"></div><p>${message}</p>`;
                content.appendChild(loadingEl);
            } else {
                loadingEl = content.querySelector('.loading');
            }
        }
        
        if (loadingEl) {
            const msgP = loadingEl.querySelector('p');
            if (msgP) msgP.textContent = message;
            loadingEl.classList.add('show');
        }
    },

    /**
     * 隱藏指定 Widget 的 Loading 狀態
     * @param {string} widgetId 
     */
    hideLoading(widgetId) {
        const widget = document.getElementById(widgetId);
        if (!widget) return;
        
        const loadingEl = widget.querySelector('.loading');
        if (loadingEl) {
            loadingEl.classList.remove('show');
        }
    },

    /**
     * 全域的初始化 Loading (通常用於第一次進入 Dashboard)
     */
    showGlobalLoading(message = '正在同步儀表板資料...') {
        if (typeof showLoading === 'function') {
            showLoading(message); // 使用 utils.js 的全域 loading
        }
    },

    hideGlobalLoading() {
        if (typeof hideLoading === 'function') {
            hideLoading();
        }
    },

    /**
     * 顯示錯誤訊息在指定 Widget
     */
    showError(widgetId, errorMessage) {
        const widget = document.getElementById(widgetId);
        if (!widget) return;
        
        const content = widget.querySelector('.widget-content') || widget;
        content.innerHTML = `<div class="alert alert-error">${errorMessage}</div>`;
    }
};

window.DashboardUI = DashboardUI;