/**
 * OpenReview UI Module
 * 实现Zotero界面中的OpenReview功能集成
 */

import { OpenReviewClient } from "./openreview";
import { DataProcessor } from "./data-processor";
import { OpenReviewSettingsManager } from "./openreview-settings";
import {
  ErrorHandler,
  OpenReviewError,
  ValidationRules,
} from "./error-handler";
import { BatchProcessor, BatchProgress } from "./batch-processor";
import { getString } from "../utils/locale";
import {
  findOpenReviewUrl,
  saveReviewsAsNote,
  saveReviewsAsAttachment,
} from "./openreview-utils";

export class OpenReviewUIFactory {
  /**
   * 注册右键菜单项
   */
  static registerRightClickMenuItem() {
    const menuIcon = `chrome://${addon.data.config.addonRef}/content/icons/openreview_fetcher_favicon@0.5x.png`;

    // 在条目右键菜单中添加"提取OpenReview评论"选项
    ztoolkit.Menu.register("item", {
      tag: "menuitem",
      id: "zotero-itemmenu-openreview-extract",
      label: getString("openreview-menuitem-label"),
      commandListener: (ev) => this.handleExtractReviews(),
      icon: menuIcon,
      isHidden: () => {
        const pane = Zotero.getActiveZoteroPane();
        if (!pane) return true;
        const items = pane.getSelectedItems();
        if (!items || items.length === 0) return true;
        return !items.some(
          (item: Zotero.Item) =>
            item.isRegularItem() && !(item as any).isFeedItem,
        );
      },
    });
  }

  /**
   * 注册工具栏按钮
   */
  static registerToolbarButton(win: _ZoteroTypes.MainWindow) {
    const doc = win.document;

    // 创建工具栏按钮
    const toolbarButton = ztoolkit.UI.createElement(doc, "toolbarbutton", {
      id: "openreview-toolbar-button",
      properties: {
        label: getString("openreview-toolbar-button-label"),
        tooltiptext: getString("openreview-toolbar-button-tooltip"),
        class: "zotero-tb-button",
        image: `chrome://${addon.data.config.addonRef}/content/icons/openreview_fetcher_favicon.png`,
      },
      listeners: [
        {
          type: "command",
          listener: () => this.handleExtractReviews(),
        },
      ],
    });

    // 将按钮添加到工具栏
    const toolbar = doc.getElementById("zotero-toolbar");
    if (toolbar) {
      toolbar.appendChild(toolbarButton);
    }
  }

  /**
   * 处理提取OpenReview评论的主要逻辑
   */
  static async handleExtractReviews() {
    let progressWin: any = null;
    let batchProcessor: BatchProcessor | null = null;

    try {
      ztoolkit.log("[DEBUG] Start fetching OpenReview comments...");

      // 获取选中的条目
      const selectedItems = Zotero.getActiveZoteroPane().getSelectedItems();
      ztoolkit.log("[DEBUG] Number of selected items:", selectedItems.length);

      if (selectedItems.length === 0) {
        ztoolkit.log("[DEBUG] No items selected, show warning");
        this.showMessage(
          getString("openreview-context-select-items-warning"),
          "warning",
        );
        return;
      }

      // 显示进度窗口
      ztoolkit.log("[DEBUG] Create progress window...");
      progressWin = new ztoolkit.ProgressWindow(addon.data.config.addonName, {
        closeOnClick: false,
        closeTime: -1,
      })
        .createLine({
          text:
            selectedItems.length === 1
              ? getString("openreview-progress-single-processing")
              : getString("openreview-progress-batch-processing", {
                  args: { count: selectedItems.length },
                }),
          type: "default",
          progress: 0,
        })
        .createLine({
          text: "",
          type: "default",
          progress: undefined,
        })
        .show();
      ztoolkit.log("[DEBUG] Progress window displayed");

      // 创建批量处理器并设置进度回调
      batchProcessor = new BatchProcessor((progress: BatchProgress) => {
        if (progressWin) {
          const {
            currentIndex,
            totalItems,
            currentTitle,
            currentStage,
            overallProgress,
            successCount,
            failureCount,
          } = progress;

          const stageText = `${currentStage}`;
          const detailText =
            totalItems === 1
              ? `${currentTitle}`
              : `[${currentIndex + 1}/${totalItems}] ${currentTitle}`;

          progressWin.changeLine({
            idx: 0,
            progress: Math.round(overallProgress),
            text: stageText,
          });
          progressWin.changeLine({
            idx: 1,
            text: detailText,
          });
        }
      });

      // 执行批量处理
      ztoolkit.log("[DEBUG] Start batch processing...");
      const batchResult = await batchProcessor.processBatch(selectedItems);
      ztoolkit.log("[DEBUG] Batch processing completed:", batchResult);

      // 添加短暂延迟，让最终的n/n状态有足够显示时间
      ztoolkit.log("[DEBUG] Wait for final status display...");
      await new Promise((resolve) => setTimeout(resolve, 800));

      // 更新进度窗口为完成状态
      ztoolkit.log("[DEBUG] Update progress window to completed state");
      const finalStatusText =
        batchResult.totalItems === 1
          ? getString("openreview-final-success-single")
          : getString("openreview-final-summary", {
              args: {
                total: batchResult.totalItems,
                success: batchResult.successCount,
                failure: batchResult.failureCount,
              },
            });

      progressWin.changeLine({
        progress: 100,
        text: finalStatusText,
      });
      progressWin.changeLine({
        idx: 1,
        text: "",
      });

      // 延迟关闭进度窗口并显示结果摘要
      ztoolkit.log("[DEBUG] Set timeout to close progress window");
      setTimeout(() => {
        ztoolkit.log(
          "[DEBUG] Close progress window and display result summary",
        );
        progressWin.close();

        // 生成并显示结果摘要
        const summary = batchProcessor!.generateResultSummary(batchResult);
        const messageType =
          batchResult.failureCount === 0
            ? "success"
            : batchResult.successCount === 0
              ? "error"
              : "warning";

        this.showMessage(summary, messageType);
      }, 2000);
    } catch (error) {
      ztoolkit.log("[DEBUG] Catch error:", error);
      ztoolkit.log(
        "[DEBUG] Error stack trace:",
        error instanceof Error ? error.stack : "No stack trace",
      );

      if (progressWin) {
        ztoolkit.log("[DEBUG] Close progress window");
        progressWin.close();
      }

      if (batchProcessor) {
        batchProcessor.stop();
      }

      if (error instanceof OpenReviewError) {
        ztoolkit.log("[DEBUG] Show OpenReviewError error");
        ErrorHandler.showUserError(
          error,
          getString("openreview-menuitem-label"),
        );
      } else {
        ztoolkit.log("[DEBUG] Show generic error:", error);
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.showMessage(
          getString("openreview-batch-failed", {
            args: { message: errorMessage },
          }),
          "error",
        );
      }
    }
  }

  /**
   * 显示消息
   */
  static showMessage(
    text: string,
    type: "success" | "error" | "warning" | "default" = "default",
  ) {
    const window = new ztoolkit.ProgressWindow(addon.data.config.addonName, {
      closeOnClick: true,
      closeTime: 5000,
    });

    // 按换行符分割文本，为每一行创建一个独立的条目
    const lines = text.split("\n");
    let hasContent = false;

    lines.forEach((line) => {
      if (line.trim()) {
        hasContent = true;
        window.createLine({
          text: line,
          type,
          // 只有成功类型的消息显示进度条，且只在最后一行显示（或者都不显示，这里选择不显示以保持整洁）
          progress: type === "success" ? 100 : undefined,
        });
      }
    });

    // 如果没有有效内容，显示原文本
    if (!hasContent) {
      window.createLine({
        text,
        type,
        progress: type === "success" ? 100 : undefined,
      });
    }

    window.show();
  }

  /**
   * 注册窗口菜单项
   */
  static registerWindowMenu() {
    ztoolkit.Menu.register("menuTools", {
      tag: "menuitem",
      label: getString("openreview-menu-tools-extract"),
      commandListener: () => this.handleExtractReviews(),
    });

    ztoolkit.Menu.register("menuTools", {
      tag: "menuitem",
      label: getString("openreview-menu-tools-settings"),
      commandListener: () => this.showSettings(),
    });

    ztoolkit.Menu.register("menuTools", {
      tag: "menuitem",
      label: getString("openreview-menu-tools-toggle-save-mode"),
      commandListener: () => this.toggleSaveMode(),
    });
  }

  /**
   * 显示设置对话框
   */
  static showSettings() {
    OpenReviewSettingsManager.showSettingsDialog();
  }

  /**
   * 切换保存模式
   */
  static toggleSaveMode() {
    OpenReviewSettingsManager.toggleSaveMode();
  }

  /**
   * 注册所有UI元素
   */
  static registerAll(win?: _ZoteroTypes.MainWindow) {
    this.registerRightClickMenuItem();
    //this.registerWindowMenu();  // 冗余菜单. 简洁一点更好
    /*
    if (win) {
      this.registerToolbarButton(win);
    }
    */
  }
}
