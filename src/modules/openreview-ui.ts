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
   * 处理提取评论的主要逻辑
   */
  static async handleExtractReviews() {
    let progressWin: any = null;
    
    try {
      // 获取选中的条目
      const selectedItems = Zotero.getActiveZoteroPane().getSelectedItems();
      
      if (selectedItems.length === 0) {
        this.showMessage("请先选择一个条目", "warning");
        return;
      }

      if (selectedItems.length > 1) {
        this.showMessage("请只选择一个条目", "warning");
        return;
      }

      const item = selectedItems[0];
      
      // 显示进度窗口
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

      // 查找OpenReview URL
      const openReviewUrl = await this.findOpenReviewUrl(item);
      
      if (!openReviewUrl) {
        progressWin.close();
        this.showMessage("未找到OpenReview链接。请确保条目包含OpenReview URL。", "error");
        return;
      }

      // 验证URL格式
      try {
        ErrorHandler.validateInput(openReviewUrl, [
          ValidationRules.openReviewUrl()
        ]);
      } catch (validationError) {
        progressWin.close();
        if (validationError instanceof OpenReviewError) {
          ErrorHandler.showUserError(validationError, "URL验证");
        } else {
          this.showMessage("OpenReview URL 格式不正确", "error");
        }
        return;
      }

      // 提取forum ID
      const forumId = OpenReviewClient.extractForumId(openReviewUrl);
      
      if (!forumId) {
        progressWin.close();
        this.showMessage("无法从URL中提取论文ID", "error");
        return;
      }

      progressWin.changeLine({
        progress: 30,
        text: `正在获取论文信息... (ID: ${forumId})`,
      });

      // 创建客户端并获取数据
      const client = new OpenReviewClient();
      
      // 使用错误处理包装的方法获取论文数据
      const rawPaper = await ErrorHandler.executeWithRetry(
        () => client.getPaperWithReviews(forumId),
        OpenReviewSettingsManager.getCurrentSettings().maxRetries,
        (attempt, error) => {
          progressWin.changeLine({
            progress: 30 + (attempt * 10),
            text: `重试中... (第${attempt}次，错误: ${error.userMessage})`,
          });
        }
      );

      progressWin.changeLine({
        progress: 70,
        text: `找到 ${rawPaper.reviews.length} 条评审和 ${rawPaper.comments.length} 条评论，正在处理数据...`,
      });

      // 使用数据处理器处理数据
      const processedPaper = DataProcessor.processPaper(rawPaper);

      // 生成格式化的HTML报告
      const htmlReport = DataProcessor.generateHTMLReport(processedPaper);
      
      // 获取用户设置
      const settings = OpenReviewSettingsManager.getCurrentSettings();
      
      // 根据设置保存数据
      const savedItems: string[] = [];
      
      if (settings.saveAsNote) {
        await this.saveReviewsAsNote(item, htmlReport, processedPaper);
        savedItems.push("笔记");
      }
      
      if (settings.saveAsAttachment) {
        // 为附件生成纯文本格式
        const textReport = DataProcessor.generateTextReport(processedPaper);
        await this.saveReviewsAsAttachment(item, textReport, processedPaper);
        savedItems.push("附件");
      }
      
      // 如果用户没有选择任何保存方式，默认保存为笔记
      if (savedItems.length === 0) {
        await this.saveReviewsAsNote(item, htmlReport, processedPaper);
        savedItems.push("笔记");
      }

      progressWin.changeLine({
        progress: 100,
        text: "OpenReview评论提取完成！",
      });

      // 延迟关闭进度窗口
      setTimeout(() => {
        progressWin.close();
        const saveInfo = savedItems.length > 0 ? `，已保存为${savedItems.join("和")}` : "";
        this.showMessage(`成功提取 ${processedPaper.reviews.length} 条评审和 ${processedPaper.comments.length} 条评论${saveInfo}`, "success");
      }, 2000);

    } catch (error) {
      if (progressWin) {
        progressWin.close();
      }
      
      if (error instanceof OpenReviewError) {
        ErrorHandler.showUserError(error, "提取OpenReview评论");
      } else {
        console.error('提取OpenReview评论时出错:', error);
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
  static async saveReviewsAsNote(item: Zotero.Item, htmlReport: string, paper: any) {
    // 创建新笔记
    const note = new Zotero.Item('note');
    note.parentID = item.id;
    
    // 直接使用生成的HTML报告
    note.setNote(htmlReport);
    
    await note.saveTx();
    
    // 可选：也可以创建为附件
    // await this.saveReviewsAsAttachment(item, htmlReport, paper);
  }

  /**
   * 将评论保存为附件（可选功能）
   */
  static async saveReviewsAsAttachment(item: Zotero.Item, formattedText: string, paper: any) {
    const filename = `OpenReview_Reviews_${paper.id}.txt`;
    const tempFile = Zotero.getTempDirectory();
    tempFile.append(filename);
    
    // 写入文件
    await Zotero.File.putContentsAsync(tempFile, formattedText);
    
    // 创建附件
    const attachment = await Zotero.Attachments.importFromFile({
      file: tempFile,
      parentItemID: item.id,
      title: `OpenReview Reviews - ${paper.title}`,
    });
    
    // 清理临时文件
    tempFile.remove(false);
    
    return attachment;
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
  }

  /**
   * 显示设置对话框
   */
  static showSettings() {
    OpenReviewSettingsManager.showSettingsDialog();
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

    const dialogHelper = new ztoolkit.Dialog(8, 2)
      .addCell(0, 0, {
        tag: "h1",
        properties: { innerHTML: "OpenReview 评论提取器" },
      })
      .addCell(1, 0, {
        tag: "h2",
        properties: { innerHTML: "功能演示" },
      })
      .addCell(2, 0, {
        tag: "p",
        properties: {
          innerHTML: "此插件可以从OpenReview网站提取论文的评论和评分信息，并将其保存到Zotero中。",
        },
        styles: {
          width: "400px",
          marginBottom: "10px",
        },
      })
      .addCell(3, 0, {
        tag: "label",
        namespace: "html",
        attributes: {
          for: "openreview-url-input",
        },
        properties: { innerHTML: "OpenReview URL:" },
      })
      .addCell(
        3,
        1,
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
            width: "300px",
          },
        },
        false,
      )
      .addCell(4, 0, {
        tag: "p",
        properties: {
          innerHTML: "支持的URL格式：<br/>• https://openreview.net/forum?id=PAPER_ID<br/>• https://openreview.net/pdf?id=PAPER_ID",
        },
        styles: {
          fontSize: "12px",
          color: "#666",
          marginTop: "10px",
        },
      })
      .addCell(
        5,
        0,
        {
          tag: "button",
          namespace: "html",
          attributes: {
            type: "button",
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
          ],
          children: [
            {
              tag: "div",
              styles: {
                padding: "5px 15px",
                backgroundColor: "#007acc",
                color: "white",
                borderRadius: "3px",
              },
              properties: {
                innerHTML: "演示提取功能",
              },
            },
          ],
        },
        false,
      )
      .addCell(6, 0, {
        tag: "p",
        properties: {
          innerHTML: "<strong>使用说明：</strong><br/>1. 在Zotero中选择一个条目<br/>2. 右键选择'提取OpenReview评论'<br/>3. 或使用工具栏的OpenReview按钮",
        },
        styles: {
          fontSize: "12px",
          marginTop: "15px",
          padding: "10px",
          backgroundColor: "#f5f5f5",
          borderRadius: "3px",
        },
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
      .open("OpenReview 功能演示");

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