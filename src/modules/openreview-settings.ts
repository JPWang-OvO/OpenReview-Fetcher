// OpenReview 设置模块 - 管理插件配置选项
import { getString } from "../utils/locale";

export interface OpenReviewSettings {
  saveMode: "html-note" | "markdown-attachment"; // 统一的保存模式：HTML笔记或Markdown附件
  includeStatistics: boolean;
  apiBaseUrl: string;
  maxRetries: number;
  requestTimeout: number;
}

export class OpenReviewSettingsManager {
  private static readonly PREF_PREFIX = "extensions.openreview.";

  /**
   * 获取默认设置
   */
  static getDefaultSettings(): OpenReviewSettings {
    return {
      saveMode: "markdown-attachment", // 默认保存为markdown笔记
      includeStatistics: true,
      apiBaseUrl: "https://api.openreview.net",
      maxRetries: 3,
      requestTimeout: 1000,
    };
  }

  /**
   * 获取当前设置
   */
  static getCurrentSettings(): OpenReviewSettings {
    const defaults = this.getDefaultSettings();
    const settings = {
      saveMode: this.getPref("saveMode", defaults.saveMode) as
        | "html-note"
        | "markdown-attachment",
      includeStatistics: this.getPref(
        "includeStatistics",
        defaults.includeStatistics,
      ),
      apiBaseUrl: this.getPref("apiBaseUrl", defaults.apiBaseUrl),
      maxRetries: this.getPref("maxRetries", defaults.maxRetries),
      requestTimeout: this.getPref("requestTimeout", defaults.requestTimeout),
    };

    ztoolkit.log("getCurrentSettings:", settings);
    return settings;
  }

  /**
   * 保存设置
   */
  static saveSettings(settings: Partial<OpenReviewSettings>): void {
    ztoolkit.log("saveSettings called with:", settings);
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
      //ztoolkit.log(`getPref: key=${key}, prefKey=${prefKey}, defaultValue=${defaultValue}, type=${typeof defaultValue}`);

      // 检查首选项是否存在
      const hasValue = Zotero.Prefs.get(prefKey) !== undefined;
      //ztoolkit.log(`getPref: ${prefKey} exists = ${hasValue}`);

      if (typeof defaultValue === "boolean") {
        // 对于布尔值，如果不存在则返回默认值
        if (!hasValue) {
          ztoolkit.log(
            `getPref boolean: ${prefKey} not found, returning default ${defaultValue}`,
          );
          return defaultValue;
        }
        const value = Zotero.Prefs.get(prefKey);
        //ztoolkit.log(`getPref boolean: ${prefKey} = ${value} (type: ${typeof value})`);
        return value;
      } else if (typeof defaultValue === "number") {
        const value = Zotero.Prefs.get(prefKey) ?? defaultValue;
        //ztoolkit.log(`getPref number: ${prefKey} = ${value}`);
        return value;
      } else if (typeof defaultValue === "string") {
        const value = Zotero.Prefs.get(prefKey) ?? defaultValue;
        //ztoolkit.log(`getPref string: ${prefKey} = ${value}`);
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

    const modeLabel =
      currentSettings.saveMode === "html-note"
        ? getString("openreview-pref-save-mode-html", "label")
        : getString("openreview-pref-save-mode-markdown", "label");
    const yesNo = getString(
      currentSettings.includeStatistics
        ? "openreview-settings-yes"
        : "openreview-settings-no",
    );

    const title = getString("openreview-settings-title");
    const lineMode = getString("openreview-settings-save-mode", {
      args: { mode: modeLabel },
    });
    const lineStats = getString("openreview-settings-include-statistics", {
      args: { value: yesNo },
    });
    const lineUrl = getString("openreview-settings-api-base-url", {
      args: { url: currentSettings.apiBaseUrl },
    });
    const lineRetries = getString("openreview-settings-max-retries", {
      args: { retries: currentSettings.maxRetries },
    });
    const lineTimeout = getString("openreview-settings-request-timeout", {
      args: { timeout: currentSettings.requestTimeout },
    });
    const hint = getString("openreview-settings-edit-hint");

    const settingsText = `${title}\n\n${lineMode}\n${lineStats}\n${lineUrl}\n${lineRetries}\n${lineTimeout}\n\n${hint}`;

    ztoolkit.getGlobal("alert")(settingsText);
  }

  /**
   * 切换保存模式
   */
  static toggleSaveMode(): void {
    const current = this.getCurrentSettings();
    const newMode =
      current.saveMode === "html-note" ? "markdown-attachment" : "html-note";
    this.saveSettings({ saveMode: newMode });
    const modeText =
      newMode === "html-note"
        ? getString("openreview-pref-save-mode-html", "label")
        : getString("openreview-pref-save-mode-markdown", "label");
    const message = getString("openreview-settings-switched-save-mode", {
      args: { mode: modeText },
    });
    ztoolkit.getGlobal("alert")(message);
  }
}
