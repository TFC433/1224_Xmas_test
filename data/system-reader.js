// data/system-reader.js

const BaseReader = require('./base-reader');

/**
 * 專門負責讀取系統級資料的類別 (系統設定、使用者)
 */
class SystemReader extends BaseReader {
    constructor(sheets) {
        super(sheets);
    }

    /**
     * 取得系統設定工作表內容
     * (這個依然讀取舊的、共用的 Sheet)
     * @returns {Promise<object>}
     */
    async getSystemConfig() {
        const cacheKey = 'systemConfig';
        const now = Date.now();
        
        if (this.cache[cacheKey] && this.cache[cacheKey].data && (now - this.cache[cacheKey].timestamp < this.CACHE_DURATION)) {
            // console.log(`✅ [Cache] 從快取讀取 ${cacheKey}...`);
            return this.cache[cacheKey].data;
        }

        // console.log(`🔄 [API] 從 Google Sheet 讀取 ${cacheKey}...`);
        try {
            // 這裡使用預設的 SPREADSHEET_ID (業務資料表)
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.config.SPREADSHEET_ID,
                range: `${this.config.SHEETS.SYSTEM_CONFIG}!A:I`,
            });
            
            const rows = response.data.values || [];
            
            const settings = {};
            
            // 初始化預設值
            if (!settings['事件類型']) {
                settings['事件類型'] = [
                    { value: 'general', note: '一般', order: 1, color: '#6c757d' },
                    { value: 'iot', note: 'IOT', order: 2, color: '#007bff' },
                    { value: 'dt', note: 'DT', order: 3, color: '#28a745' },
                    { value: 'dx', note: 'DX', order: 4, color: '#ffc107' },
                    { value: 'legacy', note: '舊事件', order: 5, color: '#dc3545' }
                ];
            }
            if (!settings['日曆篩選規則']) settings['日曆篩選規則'] = []; 
            
            if (rows.length > 1) {
                rows.slice(1).forEach(row => {
                    const [type, item, order, enabled, note, color, value2, value3, category] = row;
                    
                    if (enabled === 'TRUE' && type && item) {
                        if (!settings[type]) settings[type] = [];
                        
                        const exists = settings[type].find(i => i.value === item);
                        if (exists) {
                            exists.note = note || item;
                            exists.order = parseInt(order) || 99;
                        } else {
                            settings[type].push({
                                value: item,
                                note: note || item,
                                order: parseInt(order) || 99,
                                color: color || null,
                                value2: value2 || null, 
                                value3: value3 || null, 
                                category: category || '其他' 
                            });
                        }
                    }
                });
            }
            
            Object.keys(settings).forEach(type => settings[type].sort((a, b) => a.order - b.order));
            
            this.cache[cacheKey] = { data: settings, timestamp: now };
            return settings;

        } catch (error) {
            console.error('❌ [DataReader] 讀取系統設定失敗:', error);
            return this.config.DEFAULT_SETTINGS || {};
        }
    }

    /**
     * 取得使用者名冊
     * (★ 修改重點：改為讀取 AUTH_SPREADSHEET_ID，且回傳 rowIndex)
     * @returns {Promise<Array<object>>}
     */
    async getUsers() {
        const cacheKey = 'users';
        const range = '使用者名冊!A:C';
        
        // ★ 這裡指定去讀取權限專用表
        // 如果 config 沒有 AUTH_SPREADSHEET_ID，會自動 fallback 到原本的 ID
        const targetSheetId = this.config.AUTH_SPREADSHEET_ID || this.config.SPREADSHEET_ID;

        // 檢查快取
        const now = Date.now();
        if (this.cache[cacheKey] && this.cache[cacheKey].data && (now - this.cache[cacheKey].timestamp < this.CACHE_DURATION)) {
            // console.log(`✅ [Cache] 從快取讀取 ${cacheKey}...`); // 減少 log 雜訊
            return this.cache[cacheKey].data;
        }

        console.log(`🔐 [Auth] 讀取使用者名冊 (Sheet ID: ...${targetSheetId.slice(-6)})...`);

        try {
            // 我們手動呼叫 API，而不使用 BaseReader._fetchAndCache
            // 因為我們要指定 spreadsheetId，而 BaseReader 預設是用 this.config.SPREADSHEET_ID
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: targetSheetId,
                range: range,
            });

            const rows = response.data.values || [];
            
            // ★★★ 關鍵修正：加入 rowIndex ★★★
            const allUsers = rows.map((row, index) => ({
                rowIndex: index + 1, // 紀錄這是第幾列 (1-based)，用於 Writer 更新
                username: row[0],
                passwordHash: row[1],
                displayName: row[2]
            })).filter(user => user.username && user.passwordHash);

            // 寫入快取
            this.cache[cacheKey] = { data: allUsers, timestamp: now };
            return allUsers;

        } catch (error) {
            console.error('❌ [DataReader] 讀取使用者名冊失敗:', error.message);
            // 如果讀取失敗 (例如權限不足)，回傳空陣列，避免系統崩潰
            return [];
        }
    }
}

module.exports = SystemReader;