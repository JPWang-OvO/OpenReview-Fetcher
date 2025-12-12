import { config } from "../../package.json";
import { FluentMessageId } from "../../typings/i10n";

export { initLocale, getString, getLocaleID };
const warnedKeys = new Set<string>();

/**
 * Initialize locale data
 */
function initLocale() {
  const l10n = new (
    typeof Localization === "undefined"
      ? ztoolkit.getGlobal("Localization")
      : Localization
  )([
    `${config.addonRef}-addon.ftl`,
    `${config.addonRef}-preferences.ftl`,
    `${config.addonRef}-mainWindow.ftl`
  ], true);
  addon.data.locale = {
    current: l10n,
  };
}

/**
 * Get locale string, see https://firefox-source-docs.mozilla.org/l10n/fluent/tutorial.html#fluent-translation-list-ftl
 * @param localString ftl key
 * @param options.branch branch name
 * @param options.args args
 * @example
 * ```ftl
 * # addon.ftl
 * addon-static-example = This is default branch!
 *     .branch-example = This is a branch under addon-static-example!
 * addon-dynamic-example =
    { $count ->
        [one] I have { $count } apple
       *[other] I have { $count } apples
    }
 * ```
 * ```js
 * getString("addon-static-example"); // This is default branch!
 * getString("addon-static-example", { branch: "branch-example" }); // This is a branch under addon-static-example!
 * getString("addon-dynamic-example", { args: { count: 1 } }); // I have 1 apple
 * getString("addon-dynamic-example", { args: { count: 2 } }); // I have 2 apples
 * ```
 */
function getString(localString: FluentMessageId): string;
function getString(localString: FluentMessageId, branch: string): string;
function getString(
  localeString: FluentMessageId,
  options: { branch?: string | undefined; args?: Record<string, unknown> },
): string;
function getString(...inputs: any[]) {
  if (inputs.length === 1) {
    return _getString(inputs[0]);
  } else if (inputs.length === 2) {
    if (typeof inputs[1] === "string") {
      return _getString(inputs[0], { branch: inputs[1] });
    } else {
      return _getString(inputs[0], inputs[1]);
    }
  } else {
    throw new Error("Invalid arguments");
  }
}

function _getString(
  localeString: FluentMessageId,
  options: { branch?: string | undefined; args?: Record<string, unknown> } = {},
): string {
  const idBase = String(localeString);
  const localStringWithPrefix = idBase.startsWith(`${config.addonRef}-`)
    ? idBase
    : `${config.addonRef}-${idBase}`;
  const { branch, args } = options;
  const pattern = addon.data.locale?.current.formatMessagesSync([
    { id: localStringWithPrefix, args },
  ])[0];
  if (!pattern) {
    if (!warnedKeys.has(localStringWithPrefix)) {
      warnedKeys.add(localStringWithPrefix);
      ztoolkit.log(`l10n missing key: ${localStringWithPrefix}`);
    }
    return localStringWithPrefix;
  }
  if (branch && pattern.attributes) {
    for (const attr of pattern.attributes) {
      if (attr.name === branch) {
        return attr.value;
      }
    }
    if (!warnedKeys.has(`${localStringWithPrefix}.${branch}`)) {
      warnedKeys.add(`${localStringWithPrefix}.${branch}`);
      ztoolkit.log(`l10n missing attr: ${localStringWithPrefix}.${branch}`);
    }
    return pattern.attributes[branch] || localStringWithPrefix;
  } else {
    if (!pattern.value) {
      if (!warnedKeys.has(localStringWithPrefix)) {
        warnedKeys.add(localStringWithPrefix);
        ztoolkit.log(`l10n missing value: ${localStringWithPrefix}`);
      }
    }
    return pattern.value || localStringWithPrefix;
  }
}

function getLocaleID(id: FluentMessageId) {
  const idBase = String(id);
  return idBase.startsWith(`${config.addonRef}-`) ? idBase : `${config.addonRef}-${idBase}`;
}
