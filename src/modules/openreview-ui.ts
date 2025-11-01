/**
 * OpenReview UI Module
 * 实现Zotero界面中的OpenReview功能集成
 */

import { OpenReviewClient } from './openreview';
import { DataProcessor } from './data-processor';
import { OpenReviewSettingsManager } from './openreview-settings';
import { ErrorHandler, OpenReviewError, ValidationRules } from './error-handler';
import { BatchProcessor, BatchProgress, ProcessingStage, STAGE_DISPLAY_TEXT } from './batch-processor';
import { getString } from '../utils/locale';

export class OpenReviewUIFactory {
  /**
   * 注册右键菜单项
   */
  static registerRightClickMenuItem() {
    const menuIcon = `chrome://${addon.data.config.addonRef}/content/icons/favicon@0.5x.png`;

    // 在条目右键菜单中添加"提取OpenReview评论"选项
    ztoolkit.Menu.register("item", {
      tag: "menuitem",
      id: "zotero-itemmenu-openreview-extract",
      label: "提取OpenReview评论",
      commandListener: (ev) => this.handleExtractReviews(),
      icon: menuIcon,
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
        label: "OpenReview",
        tooltiptext: "提取选中条目的OpenReview评论",
        class: "zotero-tb-button",
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
      ztoolkit.log('[DEBUG] 开始提取OpenReview评论...');

      // 获取选中的条目
      const selectedItems = Zotero.getActiveZoteroPane().getSelectedItems();
      ztoolkit.log('[DEBUG] 获取到选中条目数量:', selectedItems.length);

      if (selectedItems.length === 0) {
        ztoolkit.log('[DEBUG] 没有选中条目，显示警告');
        this.showMessage("请先选择一个或多个条目", "warning");
        return;
      }

      // 显示进度窗口
      ztoolkit.log('[DEBUG] 创建进度窗口...');
      progressWin = new ztoolkit.ProgressWindow(addon.data.config.addonName, {
        closeOnClick: false,
        closeTime: -1,
      })
        .createLine({
          text: selectedItems.length === 1 ? "正在处理单个条目..." : `正在批量处理 ${selectedItems.length} 个条目...`,
          type: "default",
          progress: 0,
        })
        .show();
      ztoolkit.log('[DEBUG] 进度窗口已显示');

      // 创建批量处理器并设置进度回调
      batchProcessor = new BatchProcessor((progress: BatchProgress) => {
        if (progressWin) {
          const { currentIndex, totalItems, currentTitle, currentStage, overallProgress, successCount, failureCount } = progress;
          
          let statusText = '';
          if (totalItems === 1) {
            // 单条目处理
            statusText = `${STAGE_DISPLAY_TEXT[currentStage]} (${currentTitle})`;
          } else {
            // 批量处理
            statusText = `[${currentIndex + 1}/${totalItems}] ${currentTitle} - ${STAGE_DISPLAY_TEXT[currentStage]}`;
            // 显示累计统计信息
            const totalProcessed = successCount + failureCount;
            if (totalProcessed > 0) {
              statusText += ` (已完成: ${totalProcessed}, 成功: ${successCount}, 失败: ${failureCount})`;
            }
          }

          progressWin.changeLine({
            progress: Math.round(overallProgress),
            text: statusText,
          });
        }
      });

      // 执行批量处理
      ztoolkit.log('[DEBUG] 开始批量处理...');
      const batchResult = await batchProcessor.processBatch(selectedItems);
      ztoolkit.log('[DEBUG] 批量处理完成:', batchResult);

      // 添加短暂延迟，让最终的n/n状态有足够显示时间
      ztoolkit.log('[DEBUG] 等待最终状态显示...');
      await new Promise(resolve => setTimeout(resolve, 800));

      // 更新进度窗口为完成状态
      ztoolkit.log('[DEBUG] 更新进度窗口为完成状态');
      const finalStatusText = batchResult.totalItems === 1 
        ? "处理完成！"
        : `处理完成！(总计: ${batchResult.totalItems}, 成功: ${batchResult.successCount}, 失败: ${batchResult.failureCount})`;
      
      progressWin.changeLine({
        progress: 100,
        text: finalStatusText,
      });

      // 延迟关闭进度窗口并显示结果摘要
      ztoolkit.log('[DEBUG] 设置延迟关闭进度窗口');
      setTimeout(() => {
        ztoolkit.log('[DEBUG] 关闭进度窗口并显示结果摘要');
        progressWin.close();
        
        // 生成并显示结果摘要
        const summary = batchProcessor!.generateResultSummary(batchResult);
        const messageType = batchResult.failureCount === 0 ? "success" : 
                           batchResult.successCount === 0 ? "error" : "warning";
        
        this.showMessage(summary, messageType);
      }, 2000);

    } catch (error) {
      ztoolkit.log('[DEBUG] 捕获到错误:', error);
      ztoolkit.log('[DEBUG] 错误堆栈:', error instanceof Error ? error.stack : 'No stack trace');

      if (progressWin) {
        ztoolkit.log('[DEBUG] 关闭进度窗口');
        progressWin.close();
      }

      if (batchProcessor) {
        batchProcessor.stop();
      }

      if (error instanceof OpenReviewError) {
        ztoolkit.log('[DEBUG] 显示OpenReviewError错误');
        ErrorHandler.showUserError(error, "提取OpenReview评论");
      } else {
        ztoolkit.log('[DEBUG] 显示通用错误:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.showMessage(`批量处理失败: ${errorMessage}`, "error");
      }
    }
  }

  /**
   * 查找条目中的OpenReview URL
   */
  static async findOpenReviewUrl(item: Zotero.Item): Promise<string | null> {
    // 检查URL字段
    if (item.getField('url')) {
      const url = item.getField('url') as string;
      if (url.includes('openreview.net')) {
        return url;
      }
    }

    // 检查DOI字段（有些OpenReview论文可能有DOI）
    if (item.getField('DOI')) {
      const doi = item.getField('DOI') as string;
      // 这里可以添加DOI到OpenReview URL的转换逻辑
    }

    // 检查附件中的链接
    const attachments = item.getAttachments();
    for (const attachmentID of attachments) {
      const attachment = Zotero.Items.get(attachmentID);
      if (attachment.getField('url')) {
        const url = attachment.getField('url') as string;
        if (url.includes('openreview.net')) {
          return url;
        }
      }
    }

    // 检查笔记中的链接
    const notes = item.getNotes();
    for (const noteID of notes) {
      const note = Zotero.Items.get(noteID);
      const noteContent = note.getNote();
      const urlMatch = noteContent.match(/https?:\/\/openreview\.net\/[^\s<>"]+/);
      if (urlMatch) {
        return urlMatch[0];
      }
    }

    return null;
  }

  /**
   * 将评论保存为笔记
   */
  static async saveReviewsAsNote(item: Zotero.Item, content: string, paper: any, isMarkdown: boolean = false) {
    try {
      ztoolkit.log('[DEBUG] saveReviewsAsNote - 开始保存笔记');
      ztoolkit.log('[DEBUG] saveReviewsAsNote - 条目ID:', item.id);
      ztoolkit.log('[DEBUG] saveReviewsAsNote - 内容长度:', content.length);
      ztoolkit.log('[DEBUG] saveReviewsAsNote - 论文ID:', paper.id);
      ztoolkit.log('[DEBUG] saveReviewsAsNote - 是否为Markdown:', isMarkdown);

      // 验证输入参数
      if (!item || !item.id) {
        throw new Error('无效的Zotero条目');
      }

      if (!content || content.trim().length === 0) {
        throw new Error('内容为空');
      }

      // 创建新笔记
      ztoolkit.log('[DEBUG] saveReviewsAsNote - 创建新笔记对象');
      const note = new Zotero.Item('note');

      // 根据内容类型设置笔记内容
      let htmlContent: string;
      if (isMarkdown) {
        // 将Markdown转换为HTML格式，以便在Zotero中正确显示
        ztoolkit.log('[DEBUG] saveReviewsAsNote - 转换Markdown为HTML格式');
        htmlContent = DataProcessor.convertMarkdownToHTML(content);
        ztoolkit.log('[DEBUG] saveReviewsAsNote - HTML内容长度:', htmlContent.length);
      } else {
        // 直接使用HTML内容
        ztoolkit.log('[DEBUG] saveReviewsAsNote - 使用HTML内容');
        htmlContent = content;
      }

      // 设置笔记内容
      ztoolkit.log('[DEBUG] saveReviewsAsNote - 设置笔记内容');
      note.setNote(htmlContent);

      // 设置父条目ID - 使用正确的属性名
      ztoolkit.log('[DEBUG] saveReviewsAsNote - 设置父条目ID');
      note.parentItemID = item.id;

      // 设置库ID以支持群组库 - 这是关键的修复
      // 根据Zotero开发者的建议，必须设置libraryID以避免在群组库中出现错误
      ztoolkit.log('[DEBUG] saveReviewsAsNote - 设置库ID:', item.libraryID);
      note.libraryID = item.libraryID;

      ztoolkit.log('[DEBUG] saveReviewsAsNote - 开始保存笔记到数据库');
      await note.saveTx();

      ztoolkit.log('[DEBUG] saveReviewsAsNote - 笔记保存成功，笔记ID:', note.id);

      // 验证笔记是否真的被保存并且有正确的父条目关系
      const savedNote = Zotero.Items.get(note.id);
      if (!savedNote) {
        throw new Error('笔记保存失败：无法从数据库中检索保存的笔记');
      }

      if (savedNote.parentItemID !== item.id) {
        throw new Error(`笔记父条目关系设置失败：期望 ${item.id}，实际 ${savedNote.parentItemID}`);
      }

      ztoolkit.log('[DEBUG] saveReviewsAsNote - 笔记验证成功，父条目ID:', savedNote.parentItemID);

      return note.id;

    } catch (error) {
      ztoolkit.log('[DEBUG] saveReviewsAsNote - 保存笔记时出错:', error);
      ztoolkit.log('[DEBUG] saveReviewsAsNote - 错误堆栈:', error instanceof Error ? error.stack : 'No stack trace');
      throw new Error(`保存笔记失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 将评论保存为附件（可选功能）
   */
  static async saveReviewsAsAttachment(item: Zotero.Item, formattedText: string, paper: any) {
    try {
      ztoolkit.log('[DEBUG] saveReviewsAsAttachment - 开始保存附件');
      ztoolkit.log('[DEBUG] saveReviewsAsAttachment - 条目ID:', item.id);
      ztoolkit.log('[DEBUG] saveReviewsAsAttachment - 文本长度:', formattedText.length);
      ztoolkit.log('[DEBUG] saveReviewsAsAttachment - 论文ID:', paper.id);

      // 验证输入参数
      if (!item || !item.id) {
        throw new Error('无效的Zotero条目');
      }

      if (!formattedText || formattedText.trim().length === 0) {
        throw new Error('格式化文本为空');
      }

      if (!paper || !paper.id) {
        throw new Error('无效的论文数据');
      }

      // 由于只有 markdown-attachment 模式会调用此方法，直接使用 Markdown 格式
      const fileExtension = 'md';
      const filename = `OpenReview_Rebuttals_${paper.id}.${fileExtension}`;

      ztoolkit.log('[DEBUG] saveReviewsAsAttachment - 文件名:', filename);
      ztoolkit.log('[DEBUG] saveReviewsAsAttachment - 文件格式: Markdown');

      const tempFile = Zotero.getTempDirectory();
      tempFile.append(filename);
      ztoolkit.log('[DEBUG] saveReviewsAsAttachment - 临时文件路径:', tempFile.path);

      // 写入文件
      ztoolkit.log('[DEBUG] saveReviewsAsAttachment - 写入临时文件');
      await Zotero.File.putContentsAsync(tempFile, formattedText);

      // 验证文件是否存在
      if (!tempFile.exists()) {
        throw new Error('临时文件创建失败');
      }

      ztoolkit.log('[DEBUG] saveReviewsAsAttachment - 临时文件创建成功，大小:', tempFile.fileSize);

      // 创建附件
      ztoolkit.log('[DEBUG] saveReviewsAsAttachment - 创建Zotero附件');
      const attachmentTitle = `OpenReview Reviews - ${paper.title} (Markdown)`;
      const attachment = await Zotero.Attachments.importFromFile({
        file: tempFile,
        parentItemID: item.id,
        title: attachmentTitle,
      });

      ztoolkit.log('[DEBUG] saveReviewsAsAttachment - 附件创建成功，附件ID:', attachment.id);

      // 清理临时文件
      ztoolkit.log('[DEBUG] saveReviewsAsAttachment - 清理临时文件');
      if (tempFile.exists()) {
        tempFile.remove(false);
        ztoolkit.log('[DEBUG] saveReviewsAsAttachment - 临时文件已删除');
      }

      // 验证附件是否真的被保存
      const savedAttachment = Zotero.Items.get(attachment.id);
      if (!savedAttachment) {
        throw new Error('附件保存失败：无法从数据库中检索保存的附件');
      }

      ztoolkit.log('[DEBUG] saveReviewsAsAttachment - 附件验证成功');

      return attachment;

    } catch (error) {
      ztoolkit.log('[DEBUG] saveReviewsAsAttachment - 保存附件时出错:', error);
      ztoolkit.log('[DEBUG] saveReviewsAsAttachment - 错误堆栈:', error instanceof Error ? error.stack : 'No stack trace');
      throw new Error(`保存附件失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 显示消息
   */
  static showMessage(text: string, type: "success" | "error" | "warning" | "default" = "default") {
    new ztoolkit.ProgressWindow(addon.data.config.addonName, {
      closeOnClick: true,
      closeTime: 5000,
    })
      .createLine({
        text,
        type,
        progress: type === "success" ? 100 : undefined,
      })
      .show();
  }

  /**
   * 注册窗口菜单项
   */
  static registerWindowMenu() {
    ztoolkit.Menu.register("menuTools", {
      tag: "menuitem",
      label: "OpenReview - 提取选中条目的评论",
      commandListener: () => this.handleExtractReviews(),
    });

    ztoolkit.Menu.register("menuTools", {
      tag: "menuitem",
      label: "OpenReview - 设置",
      commandListener: () => this.showSettings(),
    });

    ztoolkit.Menu.register("menuTools", {
      tag: "menuitem",
      label: "OpenReview - 切换保存模式",
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
    this.registerWindowMenu();

    if (win) {
      this.registerToolbarButton(win);
    }
  }
}