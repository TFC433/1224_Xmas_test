// data/system-writer.js
const BaseWriter = require('./base-writer');
const config = require('../config');

class SystemWriter extends BaseWriter {
    constructor(sheets) {
        super(sheets);
    }

    /**
     * 更新使用者密碼
     * @param {number} rowIndex - 該使用者在 Sheet 中的行號 (1-based)
     * @param {string} newHash - 加密後的新密碼 Hash
     */
    async updatePassword(rowIndex, newHash) {
        // 優先使用權限專用表 ID，若無則使用預設 ID
        const targetSheetId = config.AUTH_SPREADSHEET_ID || config.SPREADSHEET_ID;
        
        // 密碼位於 B 欄 (第二欄)
        const range = `使用者名冊!B${rowIndex}`;

        console.log(`🔐 [SystemWriter] 更新密碼 Hash (Row: ${rowIndex}, Target: ...${targetSheetId.slice(-6)})...`);

        try {
            await this.sheets.spreadsheets.values.update({
                spreadsheetId: targetSheetId,
                range: range,
                valueInputOption: 'RAW',
                resource: {
                    values: [[newHash]]
                }
            });
            return true;
        } catch (error) {
            console.error('❌ [SystemWriter] 更新密碼失敗:', error.message);
            throw error;
        }
    }
}

module.exports = SystemWriter;