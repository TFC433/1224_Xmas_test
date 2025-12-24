// controllers/auth.controller.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { handleApiError } = require('../middleware/error.middleware');

// 登入
exports.login = async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ success: false, message: '請輸入帳號和密碼' });
        }

        // 優先從 config 讀取使用者，若無則讀 Sheet (Fallback)
        let allUsers = config.SYSTEM_USERS;
        
        if (!allUsers || allUsers.length === 0) {
             const { systemReader } = req.app.get('services');
             allUsers = await systemReader.getUsers();
        }

        const user = allUsers.find(u => u.username.toLowerCase() === username.toLowerCase());

        if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
            return res.status(401).json({ success: false, message: '帳號或密碼錯誤' });
        }

        const token = jwt.sign(
            { username: user.username, name: user.displayName }, 
            config.AUTH.JWT_SECRET, 
            { expiresIn: config.AUTH.JWT_EXPIRES_IN }
        );

        res.json({ success: true, token, name: user.displayName });

    } catch (error) {
        handleApiError(res, error, 'Login');
    }
};

// ★★★ 新增：驗證舊密碼 (給前端 On-Blur 使用) ★★★
exports.verifyPassword = async (req, res) => {
    try {
        const { systemReader } = req.app.get('services');
        const { password } = req.body;
        const currentUser = req.user; 

        // 強制刷新快取以確保資料最新
        if (systemReader.cache && systemReader.cache['users']) {
            delete systemReader.cache['users'];
        }
        
        const allUsers = await systemReader.getUsers();
        const user = allUsers.find(u => u.username.toLowerCase() === currentUser.username.toLowerCase());

        if (!user) {
            return res.status(404).json({ success: false, valid: false });
        }

        // 比對密碼
        const isValid = bcrypt.compareSync(password, user.passwordHash);
        
        // 回傳驗證結果 (不回傳 Token，只回傳是否正確)
        res.json({ success: true, valid: isValid });

    } catch (error) {
        handleApiError(res, error, 'Verify Password');
    }
};

// ★★★ 修改密碼 (整合了原本的邏輯) ★★★
exports.changePassword = async (req, res) => {
    try {
        const { systemReader, systemWriter } = req.app.get('services');
        const { oldPassword, newPassword } = req.body;
        
        // 從 Token 中取得當前登入者
        const currentUser = req.user; 

        if (!oldPassword || !newPassword) {
            return res.status(400).json({ success: false, message: '請輸入舊密碼與新密碼' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, message: '新密碼長度至少需 6 碼' });
        }

        // 1. 重新從 Sheet 讀取使用者資料
        if (systemReader.cache && systemReader.cache['users']) {
            delete systemReader.cache['users'];
        }
        const allUsers = await systemReader.getUsers();
        
        const user = allUsers.find(u => u.username.toLowerCase() === currentUser.username.toLowerCase());

        if (!user) {
            return res.status(404).json({ success: false, message: '找不到使用者資料' });
        }

        // 2. 再次驗證舊密碼 (後端防線)
        const isMatch = bcrypt.compareSync(oldPassword, user.passwordHash);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: '舊密碼輸入錯誤' });
        }

        // 3. 產生新 Hash
        const salt = bcrypt.genSaltSync(10);
        const newHash = bcrypt.hashSync(newPassword, salt);

        // 4. 寫入 Google Sheet
        if (!user.rowIndex) {
             throw new Error('無法取得使用者資料行號 (RowIndex)');
        }
        await systemWriter.updatePassword(user.rowIndex, newHash);

        // 5. 清除快取
        if (systemReader.cache && systemReader.cache['users']) {
            delete systemReader.cache['users'];
        }

        console.log(`✅ [Auth] 使用者 ${user.username} 密碼修改成功`);
        res.json({ success: true, message: '密碼修改成功' });

    } catch (error) {
        handleApiError(res, error, 'Change Password');
    }
};