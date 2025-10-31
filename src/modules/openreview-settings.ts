// OpenReview 设置模块 - 管理插件配置选项

export interface OpenReviewSettings {
  saveAsNote: boolean;
  saveAsAttachment: boolean;
  saveMode: 'interactive-html' | 'plain-markdown'; // 新增：保存模式选择
  includeStatistics: boolean;
  anonymizeAuthors: boolean;
  apiBaseUrl: string;
  maxRetries: number;
  requestTimeout: number;
}

export class OpenReviewSettingsManager {
  private static readonly PREF_PREFIX = 'extensions.openreview.';
  
  /**
   * 获取默认设置
   */
  static getDefaultSettings(): OpenReviewSettings {
    return {
      saveAsNote: true,
      saveAsAttachment: false,
      saveMode: 'interactive-html', // 默认使用交互式HTML模式
      includeStatistics: true,
      anonymizeAuthors: false,
      apiBaseUrl: 'https://api.openreview.net',
      maxRetries: 3,
      requestTimeout: 30000
    };
  }
  
  /**
   * 获取当前设置
   */
  static getCurrentSettings(): OpenReviewSettings {
    const defaults = this.getDefaultSettings();
    
    return {
      saveAsNote: this.getPref('saveAsNote', defaults.saveAsNote),
      saveAsAttachment: this.getPref('saveAsAttachment', defaults.saveAsAttachment),
      saveMode: this.getPref('saveMode', defaults.saveMode) as 'interactive-html' | 'plain-markdown',
      includeStatistics: this.getPref('includeStatistics', defaults.includeStatistics),
      anonymizeAuthors: this.getPref('anonymizeAuthors', defaults.anonymizeAuthors),
      apiBaseUrl: this.getPref('apiBaseUrl', defaults.apiBaseUrl),
      maxRetries: this.getPref('maxRetries', defaults.maxRetries),
      requestTimeout: this.getPref('requestTimeout', defaults.requestTimeout)
    };
  }
  
  /**
   * 保存设置
   */
  static saveSettings(settings: Partial<OpenReviewSettings>): void {
    Object.entries(settings).forEach(([key, value]) => {
      this.setPref(key, value);
    });
  }
  
  /**
   * 重置为默认设置
   */
  static resetToDefaults(): void {
    const defaults = this.getDefaultSettings();
    this.saveSettings(defaults);
  }
  
  /**
   * 获取首选项值
   */
  private static getPref(key: string, defaultValue: any): any {
    const prefKey = this.PREF_PREFIX + key;
    
    try {
      if (typeof defaultValue === 'boolean') {
        return Zotero.Prefs.get(prefKey, defaultValue as boolean);
      } else if (typeof defaultValue === 'number') {
        return Zotero.Prefs.get(prefKey) ?? defaultValue;
      } else if (typeof defaultValue === 'string') {
        return Zotero.Prefs.get(prefKey) ?? defaultValue;
      }
      return defaultValue;
    } catch (error) {
      ztoolkit.log(`Failed to get preference ${prefKey}:`, error);
      return defaultValue;
    }
  }
  
  /**
   * 设置首选项值
   */
  private static setPref(key: string, value: any): void {
    const prefKey = this.PREF_PREFIX + key;
    
    try {
      Zotero.Prefs.set(prefKey, value);
    } catch (error) {
      ztoolkit.log(`Failed to set preference ${prefKey}:`, error);
    }
  }
  
  /**
   * 显示设置对话框
   */
  static showSettingsDialog(): void {
    const currentSettings = this.getCurrentSettings();
    
    // 使用简单的提示框显示当前设置
    const settingsText = `
当前 OpenReview 插件设置:

✓ 保存为笔记: ${currentSettings.saveAsNote ? '是' : '否'}
✓ 保存为附件: ${currentSettings.saveAsAttachment ? '是' : '否'}  
✓ 保存模式: ${currentSettings.saveMode === 'interactive-html' ? '交互式HTML树状界面' : '纯Markdown附件'}
✓ 包含统计信息: ${currentSettings.includeStatistics ? '是' : '否'}
✓ 匿名化作者: ${currentSettings.anonymizeAuthors ? '是' : '否'}
✓ API 基础URL: ${currentSettings.apiBaseUrl}
✓ 最大重试次数: ${currentSettings.maxRetries}
✓ 请求超时: ${currentSettings.requestTimeout}ms

要修改设置，请编辑 Zotero 首选项中的 extensions.openreview.* 项目。
    `.trim();
    
    ztoolkit.getGlobal("alert")(settingsText);
  }
  
  /**
   * 快速切换保存方式
   */
  static toggleSaveAsNote(): void {
    const current = this.getCurrentSettings();
    this.saveSettings({ saveAsNote: !current.saveAsNote });
    const status = !current.saveAsNote ? '启用' : '禁用';
    ztoolkit.getGlobal("alert")(`已${status}保存为笔记功能`);
  }
  
  /**
   * 快速切换附件保存
   */
  static toggleSaveAsAttachment(): void {
    const current = this.getCurrentSettings();
    this.saveSettings({ saveAsAttachment: !current.saveAsAttachment });
    const status = !current.saveAsAttachment ? '启用' : '禁用';
    ztoolkit.getGlobal("alert")(`已${status}保存为附件功能`);
  }

  /**
   * 切换保存模式
   */
  static toggleSaveMode(): void {
    const current = this.getCurrentSettings();
    const newMode = current.saveMode === 'interactive-html' ? 'plain-markdown' : 'interactive-html';
    this.saveSettings({ saveMode: newMode });
    const modeText = newMode === 'interactive-html' ? '交互式HTML树状界面' : '纯Markdown附件';
    ztoolkit.getGlobal("alert")(`已切换到${modeText}模式`);
  }
}