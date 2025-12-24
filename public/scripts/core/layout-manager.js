// public/scripts/core/layout-manager.js
// 職責：管理側邊欄 (Sidebar) 狀態、使用者資訊與下拉選單更新

window.CRM_APP = window.CRM_APP || {};

const LayoutManager = {
    isPinned: true,

    init() {
        console.log('🏗️ [Layout] 初始化 UI 佈局...');
        this.setupSidebar();
        this.displayUser();
    },

    setupSidebar() {
        const pinBtn = document.getElementById('sidebar-pin-toggle');
        if (!pinBtn) return;

        const stored = localStorage.getItem('crm-sidebar-pinned');
        this.isPinned = stored === null ? true : (stored === 'true');

        pinBtn.addEventListener('click', () => {
            this.isPinned = !this.isPinned;
            localStorage.setItem('crm-sidebar-pinned', this.isPinned);
            this.updateSidebarUI();
        });

        this.updateSidebarUI();
    },

    updateSidebarUI() {
        const layout = document.querySelector('.app-layout');
        const pinBtn = document.getElementById('sidebar-pin-toggle');
        if (!layout || !pinBtn) return;

        const iconContainer = pinBtn.querySelector('.nav-icon');
        const textLabel = pinBtn.querySelector('.nav-text');

        if (this.isPinned) {
            layout.classList.remove('sidebar-collapsed');
            if (textLabel) textLabel.textContent = '收合側邊欄';
            if (iconContainer) iconContainer.innerHTML = this.getIcon('left');
        } else {
            layout.classList.add('sidebar-collapsed');
            if (textLabel) textLabel.textContent = '展開側邊欄';
            if (iconContainer) iconContainer.innerHTML = this.getIcon('right');
        }
    },

    getIcon(dir) {
        const pts = dir === 'left' ? "15 18 9 12 15 6" : "9 18 15 12 9 6";
        return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="${pts}"></polyline></svg>`;
    },

    displayUser() {
        const el = document.getElementById('user-display-name');
        const name = localStorage.getItem('crmCurrentUserName') || '使用者';
        if (el) el.textContent = `👤 ${name}`;
        window.CRM_APP.currentUser = name;
    },

    /**
     * 根據 System Config 更新所有下拉選單
     */
    updateDropdowns() {
        const config = window.CRM_APP.systemConfig;
        const mappings = window.CRM_APP.dropdownMappings;
        if (!config || !mappings) return;

        Object.entries(mappings).forEach(([id, key]) => {
            const select = document.getElementById(id);
            if (select && Array.isArray(config[key])) {
                const currentVal = select.value;
                const firstOption = select.querySelector('option:first-child')?.outerHTML || '<option value="">請選擇...</option>';
                
                select.innerHTML = firstOption;
                config[key]
                    .sort((a, b) => (a.order || 99) - (b.order || 99))
                    .forEach(item => {
                        const opt = document.createElement('option');
                        opt.value = item.value;
                        opt.textContent = item.note || item.value;
                        select.appendChild(opt);
                    });
                
                if (currentVal) select.value = currentVal;
            }
        });
    }
};

window.CRM_APP.updateAllDropdowns = LayoutManager.updateDropdowns.bind(LayoutManager);