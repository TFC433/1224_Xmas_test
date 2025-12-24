// services/company-service.js

/**
 * 專門負責處理與「公司」相關的複雜業務邏輯
 */
class CompanyService {
    /**
     * @param {object} services - 包含所有已初始化服務的容器
     */
    constructor(services) {
        this.companyReader = services.companyReader;
        this.contactReader = services.contactReader;
        this.opportunityReader = services.opportunityReader;
        this.interactionReader = services.interactionReader;
        this.eventLogReader = services.eventLogReader;
        this.companyWriter = services.companyWriter;
        this.interactionWriter = services.interactionWriter;
        this.systemReader = services.systemReader;
    }

    /**
     * 標準化公司名稱的輔助函式
     */
    _normalizeCompanyName(name) {
        if (!name) return '';
        return name
            .toLowerCase()
            .trim()
            .replace(/股份有限公司|有限公司|公司/g, '') // 移除常見後綴
            .replace(/\(.*\)/g, '') // 移除括號內容
            .trim();
    }

    /**
     * 輔助函式：建立一筆公司互動日誌
     * @private
     */
    async _logCompanyInteraction(companyId, title, summary, modifier) {
        try {
            await this.interactionWriter.createInteraction({
                companyId: companyId,
                eventType: '系統事件',
                eventTitle: title,
                contentSummary: summary,
                recorder: modifier,
            });
        } catch (logError) {
            console.warn(`[CompanyService] 寫入公司日誌失敗 (CompanyID: ${companyId}): ${logError.message}`);
        }
    }

    /**
     * 【快速新增】建立新公司 (含自動預設值)
     */
    async createCompany(companyName, modifier) {
        const normalizedName = companyName.trim();
        if (!normalizedName) throw new Error('公司名稱不能為空');

        // 1. 檢查是否已存在
        const allCompanies = await this.companyReader.getCompanyList();
        const existing = allCompanies.find(c => c.companyName.toLowerCase().trim() === normalizedName.toLowerCase());
        
        if (existing) {
            return { 
                success: false, 
                reason: 'EXISTS', 
                message: '公司已存在', 
                data: existing 
            };
        }

        // 2. 準備預設值 (後端自動補全，避免資料不完整)
        const defaultValues = {
            companyType: '未分類',
            customerStage: '01_初步接觸',
            engagementRating: 'C'
        };

        // 3. 建立
        const newCompanyData = await this.companyWriter.getOrCreateCompany(
            normalizedName, 
            {}, // sourceInfo
            modifier, 
            defaultValues // 預設值
        );
        
        // 4. 寫入日誌
        await this._logCompanyInteraction(
            newCompanyData.id,
            '公司建立',
            `快速建立新公司 "${normalizedName}"`,
            modifier
        );

        // 5. 回傳 (確保格式統一)
        return { 
            success: true, 
            data: {
                ...newCompanyData,
                companyName: newCompanyData.name, // 確保前端能讀到這個欄位
                companyId: newCompanyData.id
            }
        };
    }

    /**
     * 攔截並處理公司資料更新，以增加日誌
     */
    async updateCompany(companyName, updateData, modifier) {
        const allCompanies = await this.companyReader.getCompanyList();
        const originalCompany = allCompanies.find(c => c.companyName.toLowerCase().trim() === companyName.toLowerCase().trim());
        
        if (!originalCompany) {
            throw new Error(`找不到要更新的公司: ${companyName}`);
        }

        const config = await this.systemReader.getSystemConfig();
        const getNote = (configKey, value) => (config[configKey] || []).find(i => i.value === value)?.note || value || 'N/A';
        
        const logs = [];

        if (updateData.customerStage !== undefined && updateData.customerStage !== originalCompany.customerStage) {
            logs.push(`客戶階段從 [${getNote('客戶階段', originalCompany.customerStage)}] 更新為 [${getNote('客戶階段', updateData.customerStage)}]`);
        }
        if (updateData.engagementRating !== undefined && updateData.engagementRating !== originalCompany.engagementRating) {
            logs.push(`互動評級從 [${getNote('互動評級', originalCompany.engagementRating)}] 更新為 [${getNote('互動評級', updateData.engagementRating)}]`);
        }
        if (updateData.companyType !== undefined && updateData.companyType !== originalCompany.companyType) {
            logs.push(`公司類型從 [${getNote('公司類型', originalCompany.companyType)}] 更新為 [${getNote('公司類型', updateData.companyType)}]`);
        }

        const updateResult = await this.companyWriter.updateCompany(companyName, updateData, modifier);
        
        if (updateResult.success && logs.length > 0) {
            await this._logCompanyInteraction(
                originalCompany.companyId,
                '公司資料變更',
                logs.join('； '),
                modifier
            );
        }

        return updateResult;
    }


    /**
     * 獲取公司列表，並根據最後活動時間排序
     */
    async getCompanyListWithActivity() {
        const [
            allCompanies,
            allInteractions,
            allOpportunities
        ] = await Promise.all([
            this.companyReader.getCompanyList(),
            this.interactionReader.getInteractions(),
            this.opportunityReader.getOpportunities()
        ]);

        const companyActivityMap = new Map();
        const companyOpportunityCountMap = new Map();

        allCompanies.forEach(comp => {
            const initialTimestamp = new Date(comp.lastUpdateTime || comp.createdTime).getTime();
            if (!isNaN(initialTimestamp)) {
                companyActivityMap.set(comp.companyId, initialTimestamp);
            }
            companyOpportunityCountMap.set(comp.companyId, 0);
        });

        const companyNameToIdMap = new Map(allCompanies.map(c => [c.companyName, c.companyId]));
        const oppToCompanyIdMap = new Map();
        
        allOpportunities.forEach(opp => {
            if (companyNameToIdMap.has(opp.customerCompany)) {
                const companyId = companyNameToIdMap.get(opp.customerCompany);
                oppToCompanyIdMap.set(opp.opportunityId, companyId);
                
                if (opp.currentStatus !== '已封存' && opp.currentStatus !== '已取消') {
                     const currentCount = companyOpportunityCountMap.get(companyId) || 0;
                     companyOpportunityCountMap.set(companyId, currentCount + 1);
                }
            }
        });

        allInteractions.forEach(inter => {
            let companyId = inter.companyId;

            if (!companyId && inter.opportunityId && oppToCompanyIdMap.has(inter.opportunityId)) {
                companyId = oppToCompanyIdMap.get(inter.opportunityId);
            }

            if (companyId) {
                const existingTimestamp = companyActivityMap.get(companyId) || 0;
                const currentTimestamp = new Date(inter.interactionTime || inter.createdTime).getTime();
                if (currentTimestamp > existingTimestamp) {
                    companyActivityMap.set(companyId, currentTimestamp);
                }
            }
        });

        const companiesWithActivity = allCompanies.map(comp => ({
            ...comp,
            lastActivity: companyActivityMap.get(comp.companyId) || new Date(comp.createdTime).getTime(),
            opportunityCount: companyOpportunityCountMap.get(comp.companyId) || 0
        }));

        companiesWithActivity.sort((a, b) => b.lastActivity - a.lastActivity);

        return companiesWithActivity;
    }


    /**
     * 高效獲取公司的完整詳細資料
     */
    async getCompanyDetails(companyName) {
        const [
            allCompanies, 
            allContacts, 
            allOpportunities, 
            allPotentialContacts,
            allEventLogs
        ] = await Promise.all([
            this.companyReader.getCompanyList(),
            this.contactReader.getContactList(),
            this.opportunityReader.getOpportunities(),
            this.contactReader.getContacts(), // 潛在客戶
            this.eventLogReader.getEventLogs()
        ]);

        console.log(`[CompanyService] 正在為 ${allOpportunities.length} 筆機會計算最後活動時間...`);
        
        const allInteractions = await this.interactionReader.getInteractions();

        const latestInteractionMap = new Map();
        allInteractions.forEach(interaction => {
            if (interaction.opportunityId) {
                const id = interaction.opportunityId;
                const existing = latestInteractionMap.get(id) || 0;
                const current = new Date(interaction.interactionTime || interaction.createdTime).getTime();
                if (current > existing) {
                    latestInteractionMap.set(id, current);
                }
            }
        });

        allOpportunities.forEach(opp => {
            const selfUpdate = new Date(opp.lastUpdateTime || opp.createdTime).getTime();
            const lastInteraction = latestInteractionMap.get(opp.opportunityId) || 0;
            opp.effectiveLastActivity = Math.max(selfUpdate, lastInteraction);
        });

        const normalizedCompanyName = companyName.toLowerCase().trim();

        const company = allCompanies.find(c => c.companyName.toLowerCase().trim() === normalizedCompanyName);
        if (!company) {
            const potentialMatch = allPotentialContacts.find(pc => pc.company && pc.company.toLowerCase().trim() === normalizedCompanyName);
            if (potentialMatch) {
                return {
                    companyInfo: { companyName: potentialMatch.company, isPotential: true },
                    contacts: [],
                    opportunities: [],
                    potentialContacts: allPotentialContacts.filter(pc => pc.company && pc.company.toLowerCase().trim() === normalizedCompanyName),
                    interactions: [], 
                    eventLogs: []
                };
            }
            throw new Error(`找不到公司: ${companyName}`);
        }

        const relatedContacts = allContacts.filter(c => c.companyId === company.companyId);
        const relatedOpportunities = allOpportunities.filter(o => o.customerCompany.toLowerCase().trim() === normalizedCompanyName);
        const relatedPotentialContacts = allPotentialContacts.filter(pc => pc.company && pc.company.toLowerCase().trim() === normalizedCompanyName);
        
        const relatedEventLogs = allEventLogs
            .filter(log => log.companyId === company.companyId)
            .sort((a, b) => new Date(b.lastModifiedTime || b.createdTime) - new Date(a.lastModifiedTime || a.createdTime));

        console.log(`✅ [CompanyService] 公司資料整合完畢: ${relatedContacts.length} 位聯絡人, ${relatedOpportunities.length} 個機會, 0 筆互動, ${relatedEventLogs.length} 筆事件`);
        
        return {
            companyInfo: company,
            contacts: relatedContacts,
            opportunities: relatedOpportunities, 
            potentialContacts: relatedPotentialContacts,
            interactions: [],
            eventLogs: relatedEventLogs
        };
    }

    /**
     * 刪除一間公司
     */
    async deleteCompany(companyName, modifier) {
        console.log(`🗑️ [CompanyService] 請求刪除公司: ${companyName} by ${modifier}`);

        const allOpportunities = await this.opportunityReader.getOpportunities();
        const relatedOpportunities = allOpportunities.filter(
            opp => opp.customerCompany.toLowerCase().trim() === companyName.toLowerCase().trim()
        );

        if (relatedOpportunities.length > 0) {
            throw new Error(`無法刪除：此公司仍關聯 ${relatedOpportunities.length} 個機會案件。`);
        }

        const allEventLogs = await this.eventLogReader.getEventLogs();
        const companyDetails = await this.getCompanyDetails(companyName); 
        
        if (companyDetails.companyInfo && companyDetails.companyInfo.companyId) {
            const relatedEventLogs = allEventLogs.filter(
                log => !log.opportunityId && log.companyId === companyDetails.companyInfo.companyId
            );
            if (relatedEventLogs.length > 0) {
                 throw new Error(`無法刪除：此公司仍關聯 ${relatedEventLogs.length} 個事件紀錄。`);
            }
            
            await this._logCompanyInteraction(
                companyDetails.companyInfo.companyId,
                '刪除公司',
                `公司 ${companyName} (ID: ${companyDetails.companyInfo.companyId}) 已被 ${modifier} 請求刪除。`,
                modifier
            );
        }

        const result = await this.companyWriter.deleteCompany(companyName);
        console.log(`✅ [CompanyService] 公司 ${companyName} 已成功刪除。`);
        
        return result;
    }
}

module.exports = CompanyService;