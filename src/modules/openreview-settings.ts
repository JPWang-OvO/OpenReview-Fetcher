// OpenReview 设置模块 - 管理插件配置选项

export interface OpenReviewSettings {
  saveMode: 'html-note' | 'markdown-attachment'; // 统一的保存模式：HTML笔记或Markdown附件
  includeStatistics: boolean;
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
      saveMode: 'html-note', // 默认保存为HTML笔记
      includeStatistics: true,
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
    const settings = {
      saveMode: this.getPref('saveMode', defaults.saveMode) as 'html-note' | 'markdown-attachment',
      includeStatistics: this.getPref('includeStatistics', defaults.includeStatistics),
      apiBaseUrl: this.getPref('apiBaseUrl', defaults.apiBaseUrl),
      maxRetries: this.getPref('maxRetries', defaults.maxRetries),
      requestTimeout: this.getPref('requestTimeout', defaults.requestTimeout),
    };
    
    ztoolkit.log('getCurrentSettings:', settings);
    return settings;
  }

  /**
   * 保存设置
   */
  static saveSettings(settings: Partial<OpenReviewSettings>): void {
    ztoolkit.log('saveSettings called with:', settings);
    Object.entries(settings).forEach(([key, value]) => {
      ztoolkit.log(`Setting ${key} = ${value}`);
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
      ztoolkit.log(`getPref: key=${key}, prefKey=${prefKey}, defaultValue=${defaultValue}, type=${typeof defaultValue}`);
      
      // 检查首选项是否存在
      const hasValue = Zotero.Prefs.get(prefKey) !== undefined;
      ztoolkit.log(`getPref: ${prefKey} exists = ${hasValue}`);
      
      if (typeof defaultValue === 'boolean') {
        // 对于布尔值，如果不存在则返回默认值
        if (!hasValue) {
          ztoolkit.log(`getPref boolean: ${prefKey} not found, returning default ${defaultValue}`);
          return defaultValue;
        }
        const value = Zotero.Prefs.get(prefKey);
        ztoolkit.log(`getPref boolean: ${prefKey} = ${value} (type: ${typeof value})`);
        return value;
      } else if (typeof defaultValue === 'number') {
        const value = Zotero.Prefs.get(prefKey) ?? defaultValue;
        ztoolkit.log(`getPref number: ${prefKey} = ${value}`);
        return value;
      } else if (typeof defaultValue === 'string') {
        const value = Zotero.Prefs.get(prefKey) ?? defaultValue;
        ztoolkit.log(`getPref string: ${prefKey} = ${value}`);
        return value;
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
      ztoolkit.log(`setPref: key=${key}, prefKey=${prefKey}, value=${value}, type=${typeof value}`);
      Zotero.Prefs.set(prefKey, value);
      
      // 验证设置是否成功
      const savedValue = Zotero.Prefs.get(prefKey);
      ztoolkit.log(`setPref verification: ${prefKey} saved as ${savedValue} (type: ${typeof savedValue})`);
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

✓ 保存模式: ${currentSettings.saveMode === 'html-note' ? 'HTML笔记' : 'Markdown附件'}
✓ 包含统计信息: ${currentSettings.includeStatistics ? '是' : '否'}
✓ API 基础URL: ${currentSettings.apiBaseUrl}
✓ 最大重试次数: ${currentSettings.maxRetries}
✓ 请求超时: ${currentSettings.requestTimeout}ms

要修改设置，请编辑 Zotero 首选项中的 extensions.openreview.* 项目。
    `.trim();

    ztoolkit.getGlobal("alert")(settingsText);
  }

  /**
   * 切换保存模式
   */
  static toggleSaveMode(): void {
    const current = this.getCurrentSettings();
    const newMode = current.saveMode === 'html-note' ? 'markdown-attachment' : 'html-note';
    this.saveSettings({ saveMode: newMode });
    const modeText = newMode === 'html-note' ? 'HTML笔记' : 'Markdown附件';
    ztoolkit.getGlobal("alert")(`已切换到${modeText}模式`);
  }
}