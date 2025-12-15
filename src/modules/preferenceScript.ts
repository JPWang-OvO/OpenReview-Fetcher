import { config } from "../../package.json";
import { getString } from "../utils/locale";
import {
  OpenReviewSettingsManager,
  OpenReviewSettings,
} from "./openreview-settings";

export async function registerPrefsScripts(_window: Window) {
  // This function is called when the prefs window is opened
  // See addon/content/preferences.xhtml onpaneload
  if (!addon.data.prefs) {
    addon.data.prefs = {
      window: _window,
    };
  } else {
    addon.data.prefs.window = _window;
  }

  await initializeSettingsControls();
  bindPrefEvents();
}

/**
 * 初始化设置控件
 */
async function initializeSettingsControls() {
  if (!addon.data.prefs?.window) return;

  // 等待DOM完全加载
  await new Promise((resolve) => {
    if (addon.data.prefs!.window.document.readyState === "complete") {
      resolve(void 0);
    } else {
      addon.data.prefs!.window.addEventListener("load", () => resolve(void 0));
    }
  });

  // 确保偏好窗口上下文已注入对应 FTL 资源
  try {
    const win: any = addon.data.prefs!.window;
    if (win?.MozXULElement?.insertFTLIfNeeded) {
      win.MozXULElement.insertFTLIfNeeded(
        `${addon.data.config.addonRef}-preferences.ftl`,
      );
    }
  } catch (e) {
    ztoolkit.log("Failed to insert preferences FTL:", e);
  }

  // 加载当前设置到UI控件
  loadCurrentSettings();
}

/**
 * 从设置管理器加载当前值到UI控件
 */
function loadCurrentSettings() {
  if (!addon.data.prefs?.window) return;

  const settings = OpenReviewSettingsManager.getCurrentSettings();
  const doc = addon.data.prefs.window.document;

  // 设置保存模式单选按钮
  const saveModeRadio = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-save-mode`,
  ) as XUL.RadioGroup;
  if (saveModeRadio) {
    saveModeRadio.value = settings.saveMode;
  }

  // 设置统计信息复选框
  const includeStatsCheckbox = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-include-statistics`,
  ) as XUL.Checkbox;
  if (includeStatsCheckbox) {
    includeStatsCheckbox.checked = settings.includeStatistics;
    ztoolkit.log(
      `Loading settings: includeStatistics = ${settings.includeStatistics}, checkbox.checked = ${includeStatsCheckbox.checked}`,
    );
  }

  // 设置API基础URL
  const apiUrlInput = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-api-base-url`,
  ) as HTMLInputElement;
  if (apiUrlInput) {
    apiUrlInput.value = settings.apiBaseUrl;
  }

  // 设置最大重试次数
  const maxRetriesInput = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-max-retries`,
  ) as HTMLInputElement;
  if (maxRetriesInput) {
    maxRetriesInput.value = settings.maxRetries.toString();
  }

  // 设置请求超时
  const timeoutInput = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-request-timeout`,
  ) as HTMLInputElement;
  if (timeoutInput) {
    timeoutInput.value = settings.requestTimeout.toString();
  }
}

/**
 * 保存设置更改
 */
function saveSettingsChange(key: keyof OpenReviewSettings, value: any) {
  try {
    if (validateSetting(key, value)) {
      const partialSettings: Partial<OpenReviewSettings> = {};
      partialSettings[key] = value;
      OpenReviewSettingsManager.saveSettings(partialSettings);
      ztoolkit.log(`Setting ${key} saved:`, value);
    } else {
      loadCurrentSettings();
    }
  } catch (error) {
    ztoolkit.log(`Failed to save setting ${key}:`, error);
    showErrorMessage(`Failed to save ${key}: ${error}`);
  }
}

/**
 * 验证设置值
 */
function validateSetting(key: keyof OpenReviewSettings, value: any): boolean {
  switch (key) {
    case "saveMode":
      return value === "html-note" || value === "markdown-attachment";

    case "includeStatistics":
      return typeof value === "boolean";

    case "apiBaseUrl":
      try {
        new URL(value);
        return true;
      } catch {
        showErrorMessage(getString("openreview-pref-invalid-url"));
        return false;
      }

    case "maxRetries": {
      const retries = parseInt(value);
      if (isNaN(retries) || retries < 1 || retries > 10) {
        showErrorMessage(getString("openreview-pref-invalid-number"));
        return false;
      }
      return true;
    }

    case "requestTimeout": {
      const timeout = parseInt(value);
      if (isNaN(timeout) || timeout < 300 || timeout > 120000) {
        showErrorMessage(getString("openreview-pref-invalid-number"));
        return false;
      }
      return true;
    }

    default:
      return false;
  }
}

/**
 * 重置为默认值
 */
function resetToDefaults() {
  try {
    OpenReviewSettingsManager.resetToDefaults();
    loadCurrentSettings(); // 重新加载UI
    showSuccessMessage(getString("openreview-pref-settings-saved"));
    ztoolkit.log("Settings reset to defaults");
  } catch (error) {
    ztoolkit.log("Failed to reset settings:", error);
    showErrorMessage(`Failed to reset settings: ${error}`);
  }
}

/**
 * 显示成功消息
 */
function showSuccessMessage(message: string) {
  if (addon.data.prefs?.window) {
    addon.data.prefs.window.alert(message);
  }
}

/**
 * 显示错误消息
 */
function showErrorMessage(message: string) {
  if (addon.data.prefs?.window) {
    addon.data.prefs.window.alert(message);
  }
}

/**
 * 绑定首选项事件
 */
function bindPrefEvents() {
  if (!addon.data.prefs?.window) return;

  const doc = addon.data.prefs.window.document;

  // 保存模式单选按钮事件
  const saveModeRadio = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-save-mode`,
  ) as XUL.RadioGroup;
  saveModeRadio?.addEventListener("command", (e: Event) => {
    const target = e.target as XUL.RadioGroup;
    saveSettingsChange(
      "saveMode",
      target.value as "html-note" | "markdown-attachment",
    );
  });

  // 统计信息复选框事件
  const includeStatsCheckbox = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-include-statistics`,
  ) as XUL.Checkbox;
  includeStatsCheckbox?.addEventListener("command", (e: Event) => {
    const target = e.target as XUL.Checkbox;
    ztoolkit.log(`Checkbox changed: checked = ${target.checked}`);
    saveSettingsChange("includeStatistics", target.checked);
  });

  // API基础URL输入框事件（带防抖）
  const apiUrlInput = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-api-base-url`,
  ) as HTMLInputElement;
  let apiUrlTimeout: number;
  apiUrlInput?.addEventListener("input", (e: Event) => {
    const target = e.target as HTMLInputElement;
    clearTimeout(apiUrlTimeout);
    apiUrlTimeout = addon.data.prefs!.window.setTimeout(() => {
      saveSettingsChange("apiBaseUrl", target.value);
    }, 1000); // 1秒防抖
  });

  // 最大重试次数输入框事件
  const maxRetriesInput = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-max-retries`,
  ) as HTMLInputElement;
  maxRetriesInput?.addEventListener("change", (e: Event) => {
    const target = e.target as HTMLInputElement;
    saveSettingsChange("maxRetries", parseInt(target.value));
  });

  // 请求超时输入框事件
  const timeoutInput = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-request-timeout`,
  ) as HTMLInputElement;
  timeoutInput?.addEventListener("change", (e: Event) => {
    const target = e.target as HTMLInputElement;
    saveSettingsChange("requestTimeout", parseInt(target.value));
  });

  // 重置按钮事件
  const resetButton = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-reset-defaults`,
  ) as XUL.Button;
  resetButton?.addEventListener("command", () => {
    resetToDefaults();
  });
}
