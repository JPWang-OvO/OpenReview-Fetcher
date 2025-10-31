/**
 * OpenReview UI Module
 * 实现Zotero界面中的OpenReview功能集成
 */

import { OpenReviewClient } from './openreview';
import { DataProcessor } from './data-processor';
import { OpenReviewSettingsManager } from './openreview-settings';
import { ErrorHandler, OpenReviewError, ValidationRules } from './error-handler';
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
    
    try {
      ztoolkit.log('[DEBUG] 开始提取OpenReview评论...');
      
      // 获取选中的条目
      const selectedItems = Zotero.getActiveZoteroPane().getSelectedItems();
      ztoolkit.log('[DEBUG] 获取到选中条目数量:', selectedItems.length);
      
      if (selectedItems.length === 0) {
        ztoolkit.log('[DEBUG] 没有选中条目，显示警告');
        this.showMessage("请先选择一个条目", "warning");
        return;
      }

      if (selectedItems.length > 1) {
        ztoolkit.log('[DEBUG] 选中了多个条目，显示警告');
        this.showMessage("请只选择一个条目", "warning");
        return;
      }

      const item = selectedItems[0];
      ztoolkit.log('[DEBUG] 选中的条目ID:', item.id, '标题:', item.getField('title'));
      
      // 显示进度窗口
      ztoolkit.log('[DEBUG] 创建进度窗口...');
      progressWin = new ztoolkit.ProgressWindow(addon.data.config.addonName, {
        closeOnClick: false,
        closeTime: -1,
      })
        .createLine({
          text: "正在查找OpenReview链接...",
          type: "default",
          progress: 0,
        })
        .show();
      ztoolkit.log('[DEBUG] 进度窗口已显示');

      // 查找OpenReview URL
      ztoolkit.log('[DEBUG] 开始查找OpenReview URL...');
      const openReviewUrl = await this.findOpenReviewUrl(item);
      ztoolkit.log('[DEBUG] 找到的OpenReview URL:', openReviewUrl);
      
      if (!openReviewUrl) {
        ztoolkit.log('[DEBUG] 未找到OpenReview URL，关闭进度窗口并显示错误');
        progressWin.close();
        this.showMessage("未找到OpenReview链接。请确保条目包含OpenReview URL。", "error");
        return;
      }

      // 验证URL格式
      ztoolkit.log('[DEBUG] 开始验证URL格式...');
      try {
        ErrorHandler.validateInput(openReviewUrl, [
          ValidationRules.openReviewUrl()
        ]);
        ztoolkit.log('[DEBUG] URL格式验证通过');
      } catch (validationError) {
        ztoolkit.log('[DEBUG] URL格式验证失败:', validationError);
        progressWin.close();
        if (validationError instanceof OpenReviewError) {
          ErrorHandler.showUserError(validationError, "URL验证");
        } else {
          this.showMessage("OpenReview URL 格式不正确", "error");
        }
        return;
      }

      // 提取forum ID
      ztoolkit.log('[DEBUG] 开始提取forum ID...');
      const forumId = OpenReviewClient.extractForumId(openReviewUrl);
      ztoolkit.log('[DEBUG] 提取到的forum ID:', forumId);
      
      if (!forumId) {
        ztoolkit.log('[DEBUG] 无法提取forum ID，关闭进度窗口并显示错误');
        progressWin.close();
        this.showMessage("无法从URL中提取论文ID", "error");
        return;
      }

      progressWin.changeLine({
        progress: 30,
        text: `正在获取论文信息... (ID: ${forumId})`,
      });
      ztoolkit.log('[DEBUG] 更新进度窗口，开始获取论文信息');

      // 创建客户端并获取数据
      ztoolkit.log('[DEBUG] 创建OpenReview客户端...');
      const client = new OpenReviewClient();
      
      // 使用错误处理包装的方法获取论文数据
      ztoolkit.log('[DEBUG] 开始获取论文数据...');
      const rawPaper = await ErrorHandler.executeWithRetry(
        () => client.getPaperWithReviews(forumId),
        OpenReviewSettingsManager.getCurrentSettings().maxRetries,
        (attempt, error) => {
          ztoolkit.log(`[DEBUG] 重试第${attempt}次，错误:`, error);
          progressWin.changeLine({
            progress: 30 + (attempt * 10),
            text: `重试中... (第${attempt}次，错误: ${error.userMessage})`,
          });
        }
      );
      ztoolkit.log('[DEBUG] 成功获取论文数据，评审数量:', rawPaper.reviews.length, '评论数量:', rawPaper.comments.length);

      // 获取所有笔记以构建对话树
      progressWin.changeLine({
        progress: 50,
        text: `正在获取对话树数据...`,
      });
      ztoolkit.log('[DEBUG] 开始获取所有笔记数据...');
      const allNotes = await ErrorHandler.executeWithRetry(
        () => client.getNotes(forumId),
        OpenReviewSettingsManager.getCurrentSettings().maxRetries,
        (attempt, error) => {
          ztoolkit.log(`[DEBUG] 获取笔记重试第${attempt}次，错误:`, error);
          progressWin.changeLine({
            progress: 50 + (attempt * 5),
            text: `重试获取对话树数据... (第${attempt}次)`,
          });
        }
      );
      ztoolkit.log('[DEBUG] 成功获取所有笔记数据，笔记数量:', allNotes.length);

      progressWin.changeLine({
        progress: 70,
        text: `找到 ${rawPaper.reviews.length} 条评审和 ${rawPaper.comments.length} 条评论，正在构建对话树...`,
      });
      ztoolkit.log('[DEBUG] 更新进度窗口，开始处理数据');

      // 使用数据处理器处理数据（包含对话树构建）
      ztoolkit.log('[DEBUG] 开始处理论文数据...');
      const processedPaper = DataProcessor.processPaper(rawPaper, allNotes);
      ztoolkit.log('[DEBUG] 数据处理完成，对话树节点数量:', processedPaper.conversationTree?.allNodes.length || 0);

      // 获取用户设置
      ztoolkit.log('[DEBUG] 获取用户设置...');
      const settings = OpenReviewSettingsManager.getCurrentSettings();
      ztoolkit.log('[DEBUG] 用户设置:', { 
        saveAsNote: settings.saveAsNote, 
        saveAsAttachment: settings.saveAsAttachment,
        saveMode: settings.saveMode 
      });

      // 根据设置生成不同格式的内容
      let noteContent: string;
      let attachmentContent: string;
      
      if (settings.saveMode === 'interactive-html') {
        ztoolkit.log('[DEBUG] 生成交互式HTML报告...');
        noteContent = DataProcessor.generateInteractiveHTMLFragment(processedPaper);
        attachmentContent = DataProcessor.generateInteractiveHTMLFragment(processedPaper);
        ztoolkit.log('[DEBUG] 交互式HTML报告生成完成，长度:', noteContent.length);
      } else {
        ztoolkit.log('[DEBUG] 生成纯Markdown报告...');
        noteContent = DataProcessor.generatePlainMarkdownAttachment(processedPaper);
        attachmentContent = DataProcessor.generatePlainMarkdownAttachment(processedPaper);
        ztoolkit.log('[DEBUG] 纯Markdown报告生成完成，长度:', noteContent.length);
      }
      
      // 根据设置保存数据
      const savedItems: string[] = [];
      
      if (settings.saveAsNote) {
        ztoolkit.log('[DEBUG] 开始保存为笔记...');
        const isMarkdown = settings.saveMode !== 'interactive-html';
        await this.saveReviewsAsNote(item, noteContent, processedPaper, isMarkdown);
        ztoolkit.log('[DEBUG] 笔记保存完成');
        const modeText = settings.saveMode === 'interactive-html' ? '交互式HTML笔记' : 'Markdown笔记';
        savedItems.push(modeText);
      }
      
      if (settings.saveAsAttachment) {
        ztoolkit.log('[DEBUG] 开始保存为附件...');
        await this.saveReviewsAsAttachment(item, attachmentContent, processedPaper);
        ztoolkit.log('[DEBUG] 附件保存完成');
        const modeText = settings.saveMode === 'interactive-html' ? 'HTML附件' : 'Markdown附件';
        savedItems.push(modeText);
      }
      
      // 如果用户没有选择任何保存方式，默认保存为笔记（使用设置的模式）
      if (savedItems.length === 0) {
        ztoolkit.log('[DEBUG] 没有选择保存方式，默认保存为笔记...');
        const isMarkdown = settings.saveMode !== 'interactive-html';
        await this.saveReviewsAsNote(item, noteContent, processedPaper, isMarkdown);
        ztoolkit.log('[DEBUG] 默认笔记保存完成');
        const modeText = settings.saveMode === 'interactive-html' ? '交互式HTML笔记' : 'Markdown笔记';
        savedItems.push(modeText);
      }

      ztoolkit.log('[DEBUG] 更新进度窗口为完成状态');
      progressWin.changeLine({
        progress: 100,
        text: "OpenReview评论提取完成！",
      });

      // 延迟关闭进度窗口
      ztoolkit.log('[DEBUG] 设置延迟关闭进度窗口');
      setTimeout(() => {
        ztoolkit.log('[DEBUG] 关闭进度窗口并显示成功消息');
        progressWin.close();
        const saveInfo = savedItems.length > 0 ? `，已保存为${savedItems.join("和")}` : "";
        const treeStats = processedPaper.conversationTree?.statistics;
        const statsInfo = treeStats ? 
          `，构建了包含 ${treeStats.totalNotes} 个节点的对话树` : "";
        this.showMessage(`成功提取 ${processedPaper.reviews.length} 条评审和 ${processedPaper.comments.length} 条评论${statsInfo}${saveInfo}`, "success");
      }, 2000);

    } catch (error) {
      ztoolkit.log('[DEBUG] 捕获到错误:', error);
      ztoolkit.log('[DEBUG] 错误堆栈:', error instanceof Error ? error.stack : 'No stack trace');
      
      if (progressWin) {
        ztoolkit.log('[DEBUG] 关闭进度窗口');
        progressWin.close();
      }
      
      if (error instanceof OpenReviewError) {
        ztoolkit.log('[DEBUG] 显示OpenReviewError错误');
        ErrorHandler.showUserError(error, "提取OpenReview评论");
      } else {
        ztoolkit.log('[DEBUG] 显示通用错误:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.showMessage(`提取失败: ${errorMessage}`, "error");
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
      
      // 获取用户设置以确定文件格式
      const settings = OpenReviewSettingsManager.getCurrentSettings();
      const isHTML = settings.saveMode === 'interactive-html';
      const fileExtension = isHTML ? 'html' : 'md';
      const filename = `OpenReview_Reviews_${paper.id}.${fileExtension}`;
      
      ztoolkit.log('[DEBUG] saveReviewsAsAttachment - 文件名:', filename);
      ztoolkit.log('[DEBUG] saveReviewsAsAttachment - 文件格式:', isHTML ? 'HTML' : 'Markdown');
      
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
      const attachmentTitle = `OpenReview Reviews - ${paper.title} (${isHTML ? 'Interactive HTML' : 'Markdown'})`;
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
   * 显示OpenReview功能演示
   */
  static async showOpenReviewDemo() {
    const dialogData: { [key: string | number]: any } = {
      inputValue: "https://openreview.net/forum?id=rJXMpikCZ",
      loadCallback: () => {
        ztoolkit.log(dialogData, "OpenReview Demo Dialog Opened!");
      },
      unloadCallback: () => {
        ztoolkit.log(dialogData, "OpenReview Demo Dialog closed!");
      },
    };

    const dialogHelper = new ztoolkit.Dialog(7, 1)
      .addCell(0, 0, {
        tag: "div",
        styles: {
          textAlign: "center",
          marginBottom: "12px",
          borderBottom: "2px solid #e0e0e0",
          paddingBottom: "10px",
        },
        children: [
          {
            tag: "h1",
            styles: {
              margin: "0 0 8px 0",
              fontSize: "24px",
              fontWeight: "bold",
              color: "#333",
            },
            properties: { innerHTML: "OpenReview 评论提取器" },
          },
          {
            tag: "h2",
            styles: {
              margin: "0",
              fontSize: "16px",
              fontWeight: "normal",
              color: "#666",
            },
            properties: { innerHTML: "功能演示" },
          },
        ],
      })
      .addCell(1, 0, {
        tag: "div",
        styles: {
          padding: "8px 0",
          lineHeight: "1.4",
        },
        children: [
          {
            tag: "p",
            styles: {
              margin: "0 0 8px 0",
              fontSize: "14px",
              color: "#444",
            },
            properties: {
              innerHTML: "此插件可以从OpenReview网站提取论文的评论和评分信息，并将其保存到Zotero中。",
            },
          },
        ],
      })
      .addCell(2, 0, {
        tag: "div",
        styles: {
          padding: "6px 0",
          marginBottom: "8px",
        },
        children: [
          {
            tag: "label",
            namespace: "html",
            attributes: {
              for: "openreview-url-input",
            },
            styles: {
              display: "block",
              marginBottom: "8px",
              fontSize: "14px",
              fontWeight: "500",
              color: "#333",
            },
            properties: { innerHTML: "OpenReview URL:" },
          },
          {
            tag: "input",
            namespace: "html",
            id: "openreview-url-input",
            attributes: {
              "data-bind": "inputValue",
              "data-prop": "value",
              type: "text",
              placeholder: "输入OpenReview论文URL",
            },
            styles: {
              width: "100%",
              padding: "8px 12px",
              border: "1px solid #ddd",
              borderRadius: "4px",
              fontSize: "14px",
              boxSizing: "border-box",
            },
          },
        ],
      })
      .addCell(3, 0, {
        tag: "div",
        styles: {
          padding: "8px 12px",
          backgroundColor: "#f8f9fa",
          borderRadius: "6px",
          marginBottom: "8px",
          border: "1px solid #e9ecef",
        },
        children: [
          {
            tag: "p",
            styles: {
              margin: "0 0 8px 0",
              fontSize: "13px",
              fontWeight: "500",
              color: "#495057",
            },
            properties: { innerHTML: "支持的URL格式：" },
          },
          {
            tag: "ul",
            styles: {
              margin: "0",
              paddingLeft: "20px",
              fontSize: "12px",
              color: "#6c757d",
              lineHeight: "1.5",
            },
            children: [
              {
                tag: "li",
                styles: { marginBottom: "4px" },
                properties: { innerHTML: "https://openreview.net/forum?id=PAPER_ID" },
              },
              {
                tag: "li",
                properties: { innerHTML: "https://openreview.net/pdf?id=PAPER_ID" },
              },
            ],
          },
        ],
      })
      .addCell(4, 0, {
        tag: "div",
        styles: {
          textAlign: "center",
          padding: "15px 0",
        },
        children: [
          {
            tag: "button",
            namespace: "html",
            attributes: {
              type: "button",
            },
            styles: {
              padding: "8px 20px",
              backgroundColor: "#f8f9fa",
              color: "#000000",
              border: "1px solid #dee2e6",
              borderRadius: "6px",
              fontSize: "14px",
              fontWeight: "500",
              cursor: "pointer",
              transition: "all 0.2s ease",
              boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
              textShadow: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              lineHeight: "1",
              minHeight: "36px",
            },
            listeners: [
              {
                type: "click",
                listener: async (e: Event) => {
                  const url = dialogData.inputValue;
                  if (url && url.includes('openreview.net')) {
                    this.showMessage("开始提取评论...", "default");
                    // 这里可以调用实际的提取功能
                    // await this.handleExtractReviews();
                    this.showMessage("这是演示模式。在实际使用中，请选择一个Zotero条目并使用右键菜单或工具栏按钮。", "warning");
                  } else {
                    this.showMessage("请输入有效的OpenReview URL", "error");
                  }
                },
              },
              {
                type: "mouseenter",
                listener: (e: Event) => {
                  const target = e.target as HTMLElement;
                  target.style.backgroundColor = "#e9ecef";
                  target.style.borderColor = "#adb5bd";
                  target.style.transform = "translateY(-1px)";
                  target.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.15)";
                },
              },
              {
                type: "mouseleave",
                listener: (e: Event) => {
                  const target = e.target as HTMLElement;
                  target.style.backgroundColor = "#f8f9fa";
                  target.style.borderColor = "#dee2e6";
                  target.style.transform = "translateY(0)";
                  target.style.boxShadow = "0 2px 4px rgba(0, 0, 0, 0.1)";
                },
              },
            ],
            properties: {
              innerHTML: "使用方法",
            },
          },
        ],
      })
      .addCell(5, 0, {
        tag: "div",
        styles: {
          padding: "12px",
          backgroundColor: "#e8f4fd",
          borderRadius: "6px",
          marginTop: "12px",
          border: "1px solid #bee5eb",
        },
        children: [
          {
            tag: "h4",
            styles: {
              margin: "0 0 8px 0",
              fontSize: "14px",
              fontWeight: "600",
              color: "#0c5460",
            },
            properties: { innerHTML: "使用说明" },
          },
          {
            tag: "ol",
            styles: {
              margin: "0 0 4px 0",
              paddingLeft: "20px",
              fontSize: "13px",
              color: "#0c5460",
              lineHeight: "1.4",
            },
            children: [
              {
                tag: "li",
                styles: { marginBottom: "6px" },
                properties: { innerHTML: "在Zotero中选择一个条目" },
              },
              {
                tag: "li",
                styles: { marginBottom: "6px" },
                properties: { innerHTML: "右键选择'提取OpenReview评论'" },
              },
              {
                tag: "li",
                properties: { innerHTML: "或使用工具栏的OpenReview按钮" },
              },
            ],
          },
        ],
      })
      .addButton("开始使用", "confirm", {
        callback: (e) => {
          this.showMessage("请在Zotero中选择条目后使用右键菜单或工具栏按钮", "default");
        },
      })
      .addButton("取消", "cancel")
      .addButton("设置", "settings", {
        noClose: true,
        callback: (e) => {
          this.showSettings();
        },
      })
      .setDialogData(dialogData)
      .open("OpenReview 功能演示", {
        width: 500,
        height: 600,
        centerscreen: true,
        resizable: false,
      });

    addon.data.dialog = dialogHelper;
    await dialogData.unloadLock.promise;
    addon.data.dialog = undefined;
    
    if (addon.data.alive && dialogData._lastButtonId) {
      const buttonText = dialogData._lastButtonId === 'confirm' ? '开始使用' : 
                        dialogData._lastButtonId === 'cancel' ? '取消' : 
                        dialogData._lastButtonId === 'settings' ? '设置' : dialogData._lastButtonId;
      ztoolkit.getGlobal("alert")(
        `对话框已关闭 (${buttonText})。\n输入的URL: ${dialogData.inputValue}`
      );
    }
    ztoolkit.log(dialogData);
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