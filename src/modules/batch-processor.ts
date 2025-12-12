import { OpenReviewClient } from './openreview';
import { DataProcessor } from './data-processor';
import { ErrorHandler, OpenReviewError, ValidationRules } from './error-handler';
import { OpenReviewSettingsManager } from './openreview-settings';
import { getString } from '../utils/locale';

/**
 * 单个条目的处理结果
 */
export interface SingleItemResult {
  /** 条目ID */
  itemId: number;
  /** 条目标题 */
  title: string;
  /** 是否成功 */
  success: boolean;
  /** 错误信息（如果失败） */
  error?: string;
  /** 处理的评审数量 */
  reviewCount?: number;
  /** 处理的评论数量 */
  commentCount?: number;
  /** 保存的内容类型 */
  savedAs?: 'html-note' | 'markdown-attachment';
  /** 对话树统计信息 */
  treeStats?: {
    totalNotes: number;
  };
}

/**
 * 批量处理的整体结果
 */
export interface BatchResult {
  /** 总条目数 */
  totalItems: number;
  /** 成功处理的条目数 */
  successCount: number;
  /** 失败的条目数 */
  failureCount: number;
  /** 每个条目的详细结果 */
  results: SingleItemResult[];
  /** 开始时间 */
  startTime: Date;
  /** 结束时间 */
  endTime: Date;
  /** 总耗时（毫秒） */
  duration: number;
}

/**
 * 批量进度信息
 */
export interface BatchProgress {
  /** 当前处理的条目索引（从0开始） */
  currentIndex: number;
  /** 总条目数 */
  totalItems: number;
  /** 当前条目的标题 */
  currentTitle: string;
  /** 当前条目的处理阶段 */
  currentStage: ProcessingStage;
  /** 当前条目的进度百分比（0-100） */
  currentItemProgress: number;
  /** 整体进度百分比（0-100） */
  overallProgress: number;
  /** 已成功处理的条目数 */
  successCount: number;
  /** 已失败的条目数 */
  failureCount: number;
}

/**
 * 处理阶段枚举
 */
export enum ProcessingStage {
  FINDING_URL = 'finding_url',
  VALIDATING_URL = 'validating_url',
  EXTRACTING_FORUM_ID = 'extracting_forum_id',
  FETCHING_PAPER = 'fetching_paper',
  FETCHING_NOTES = 'fetching_notes',
  PROCESSING_DATA = 'processing_data',
  SAVING_CONTENT = 'saving_content',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

/**
 * 处理阶段的显示文本映射
 */
export const STAGE_DISPLAY_TEXT: Record<ProcessingStage, string> = {
  [ProcessingStage.FINDING_URL]: '正在查找OpenReview链接...',
  [ProcessingStage.VALIDATING_URL]: '正在验证URL格式...',
  [ProcessingStage.EXTRACTING_FORUM_ID]: '正在提取论文ID...',
  [ProcessingStage.FETCHING_PAPER]: '正在获取论文信息...',
  [ProcessingStage.FETCHING_NOTES]: '正在获取thread数据...',
  [ProcessingStage.PROCESSING_DATA]: '正在构建thread内容',
  [ProcessingStage.SAVING_CONTENT]: '正在保存内容...',
  [ProcessingStage.COMPLETED]: '处理完成',
  [ProcessingStage.FAILED]: '处理失败'
};

/**
 * 进度回调函数类型
 */
export type ProgressCallback = (progress: BatchProgress) => void;

/**
 * 批量处理器类
 */
export class BatchProcessor {
  private progressCallback?: ProgressCallback;
  private shouldStop = false;

  constructor(progressCallback?: ProgressCallback) {
    this.progressCallback = progressCallback;
  }

  /**
   * 停止批量处理
   */
  stop(): void {
    this.shouldStop = true;
  }

  /**
   * 重置停止标志
   */
  reset(): void {
    this.shouldStop = false;
  }

  /**
   * 检查是否应该停止处理
   */
  private checkShouldStop(): boolean {
    return this.shouldStop;
  }

  /**
   * 更新进度
   */
  private updateProgress(progress: BatchProgress): void {
    if (this.progressCallback) {
      this.progressCallback(progress);
    }
  }

  /**
   * 计算整体进度百分比
   */
  private calculateOverallProgress(
    currentIndex: number,
    totalItems: number,
    currentItemProgress: number
  ): number {
    if (totalItems === 0) return 0;

    const completedItems = currentIndex;
    const currentItemContribution = currentItemProgress / 100;
    const overallProgress = ((completedItems + currentItemContribution) / totalItems) * 100;

    return Math.min(100, Math.max(0, overallProgress));
  }

  /**
   * 处理单个条目
   */
  async processSingleItem(
    item: Zotero.Item,
    index: number,
    totalItems: number,
    currentSuccessCount: number = 0,
    currentFailureCount: number = 0
  ): Promise<SingleItemResult> {
    const result: SingleItemResult = {
      itemId: item.id,
      title: item.getField('title') || `条目 ${item.id}`,
      success: false
    };

    try {
      // 更新进度：开始查找URL
      this.updateProgress({
        currentIndex: index,
        totalItems,
        currentTitle: result.title,
        currentStage: ProcessingStage.FINDING_URL,
        currentItemProgress: 0,
        overallProgress: this.calculateOverallProgress(index, totalItems, 0),
        successCount: currentSuccessCount,
        failureCount: currentFailureCount
      });

      if (this.checkShouldStop()) {
        throw new Error('用户取消了批量处理');
      }

      // 查找OpenReview URL
      const openReviewUrl = await this.findOpenReviewUrl(item);
      if (!openReviewUrl) {
        throw new Error('未找到OpenReview链接');
      }

      // 更新进度：验证URL
      this.updateProgress({
        currentIndex: index,
        totalItems,
        currentTitle: result.title,
        currentStage: ProcessingStage.VALIDATING_URL,
        currentItemProgress: 10,
        overallProgress: this.calculateOverallProgress(index, totalItems, 10),
        successCount: currentSuccessCount,
        failureCount: currentFailureCount
      });

      if (this.checkShouldStop()) {
        throw new Error('用户取消了批量处理');
      }

      // 验证URL格式
      ErrorHandler.validateInput(openReviewUrl, [
        ValidationRules.openReviewUrl()
      ]);

      // 更新进度：提取forum ID
      this.updateProgress({
        currentIndex: index,
        totalItems,
        currentTitle: result.title,
        currentStage: ProcessingStage.EXTRACTING_FORUM_ID,
        currentItemProgress: 20,
        overallProgress: this.calculateOverallProgress(index, totalItems, 20),
        successCount: currentSuccessCount,
        failureCount: currentFailureCount
      });

      if (this.checkShouldStop()) {
        throw new Error('用户取消了批量处理');
      }

      // 提取forum ID
      const forumId = OpenReviewClient.extractForumId(openReviewUrl);
      if (!forumId) {
        throw new Error('无法从URL中提取论文ID');
      }

      // 更新进度：获取论文信息
      this.updateProgress({
        currentIndex: index,
        totalItems,
        currentTitle: result.title,
        currentStage: ProcessingStage.FETCHING_PAPER,
        currentItemProgress: 30,
        overallProgress: this.calculateOverallProgress(index, totalItems, 30),
        successCount: currentSuccessCount,
        failureCount: currentFailureCount
      });

      if (this.checkShouldStop()) {
        throw new Error('用户取消了批量处理');
      }

      // 创建客户端并获取数据
      const client = new OpenReviewClient();
      const rawPaper = await ErrorHandler.executeWithRetry(
        () => client.getPaperWithReviews(forumId),
        OpenReviewSettingsManager.getCurrentSettings().maxRetries
      );

      // 更新进度：获取对话树数据
      this.updateProgress({
        currentIndex: index,
        totalItems,
        currentTitle: result.title,
        currentStage: ProcessingStage.FETCHING_NOTES,
        currentItemProgress: 50,
        overallProgress: this.calculateOverallProgress(index, totalItems, 50),
        successCount: currentSuccessCount,
        failureCount: currentFailureCount
      });

      if (this.checkShouldStop()) {
        throw new Error('用户取消了批量处理');
      }

      // 获取所有笔记以构建对话树
      const allNotes = await ErrorHandler.executeWithRetry(
        () => client.getNotes(forumId),
        OpenReviewSettingsManager.getCurrentSettings().maxRetries
      );

      // 更新进度：处理数据
      this.updateProgress({
        currentIndex: index,
        totalItems,
        currentTitle: result.title,
        currentStage: ProcessingStage.PROCESSING_DATA,
        currentItemProgress: 70,
        overallProgress: this.calculateOverallProgress(index, totalItems, 70),
        successCount: currentSuccessCount,
        failureCount: currentFailureCount
      });

      if (this.checkShouldStop()) {
        throw new Error('用户取消了批量处理');
      }

      // 处理数据
      const processedPaper = DataProcessor.processPaper(rawPaper, allNotes);

      // 更新进度：保存内容
      this.updateProgress({
        currentIndex: index,
        totalItems,
        currentTitle: result.title,
        currentStage: ProcessingStage.SAVING_CONTENT,
        currentItemProgress: 90,
        overallProgress: this.calculateOverallProgress(index, totalItems, 90),
        successCount: currentSuccessCount,
        failureCount: currentFailureCount
      });

      if (this.checkShouldStop()) {
        throw new Error('用户取消了批量处理');
      }

      // 获取用户设置并保存内容
      const settings = OpenReviewSettingsManager.getCurrentSettings();
      let content: string;

      if (settings.saveMode === 'html-note') {
        content = DataProcessor.generateInteractiveHTMLFragment(processedPaper);
        await this.saveReviewsAsNote(item, content, processedPaper, false);
        result.savedAs = 'html-note';
      } else {
        content = DataProcessor.generatePlainMarkdownAttachment(processedPaper);
        await this.saveReviewsAsAttachment(item, content, processedPaper);
        result.savedAs = 'markdown-attachment';
      }

      // 设置成功结果
      result.success = true;
      result.reviewCount = processedPaper.reviews.length;
      result.commentCount = processedPaper.comments.length;
      result.treeStats = processedPaper.conversationTree?.statistics ? {
        totalNotes: processedPaper.conversationTree.statistics.totalNotes
      } : undefined;

      // 更新进度：完成
      this.updateProgress({
        currentIndex: index,
        totalItems,
        currentTitle: result.title,
        currentStage: ProcessingStage.COMPLETED,
        currentItemProgress: 100,
        overallProgress: this.calculateOverallProgress(index, totalItems, 100),
        successCount: currentSuccessCount + 1, // 当前项目成功，立即更新计数
        failureCount: currentFailureCount
      });

    } catch (error) {
      result.success = false;
      result.error = error instanceof Error ? error.message : String(error);

      // 更新进度：失败
      this.updateProgress({
        currentIndex: index,
        totalItems,
        currentTitle: result.title,
        currentStage: ProcessingStage.FAILED,
        currentItemProgress: 0,
        overallProgress: this.calculateOverallProgress(index, totalItems, 0),
        successCount: currentSuccessCount,
        failureCount: currentFailureCount + 1 // 当前项目失败，立即更新计数
      });
    }

    return result;
  }

  /**
   * 查找OpenReview URL（从原始代码复制）
   */
  private async findOpenReviewUrl(item: Zotero.Item): Promise<string | null> {
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
   * 保存为笔记（从原始代码复制）
   */
  private async saveReviewsAsNote(
    item: Zotero.Item,
    content: string,
    paper: any,
    isMarkdown: boolean = false
  ): Promise<number> {
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
   * 保存为附件（从原始代码复制）
   */
  private async saveReviewsAsAttachment(
    item: Zotero.Item,
    formattedText: string,
    paper: any
  ): Promise<Zotero.Item> {
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
   * 批量处理多个条目
   */
  async processBatch(items: Zotero.Item[]): Promise<BatchResult> {
    const startTime = new Date();
    const results: SingleItemResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    ztoolkit.log('[DEBUG] BatchProcessor - 开始批量处理，条目数量:', items.length);

    for (let i = 0; i < items.length; i++) {
      if (this.checkShouldStop()) {
        ztoolkit.log('[DEBUG] BatchProcessor - 用户取消了批量处理');
        break;
      }

      const item = items[i];
      ztoolkit.log(`[DEBUG] BatchProcessor - 处理第 ${i + 1}/${items.length} 个条目:`, item.getField('title'));

      try {
        const result = await this.processSingleItem(item, i, items.length, successCount, failureCount);
        results.push(result);

        if (result.success) {
          successCount++;
          ztoolkit.log(`[DEBUG] BatchProcessor - 第 ${i + 1} 个条目处理成功`);
        } else {
          failureCount++;
          ztoolkit.log(`[DEBUG] BatchProcessor - 第 ${i + 1} 个条目处理失败:`, result.error);
        }

        // 注意：进度更新已在 processSingleItem 中完成，这里只更新内部计数

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        ztoolkit.log(`[DEBUG] BatchProcessor - 第 ${i + 1} 个条目处理异常:`, errorMessage);

        const result: SingleItemResult = {
          itemId: item.id,
          title: item.getField('title') || `条目 ${item.id}`,
          success: false,
          error: errorMessage
        };

        results.push(result);
        failureCount++;

        // 注意：异常情况下的进度更新应该通过统一的机制处理
      }

      // 在条目之间添加短暂延迟，避免API请求过于频繁
      if (i < items.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    const batchResult: BatchResult = {
      totalItems: items.length,
      successCount,
      failureCount,
      results,
      startTime,
      endTime,
      duration
    };

    ztoolkit.log('[DEBUG] BatchProcessor - 批量处理完成:', {
      总条目数: batchResult.totalItems,
      成功数: batchResult.successCount,
      失败数: batchResult.failureCount,
      耗时: `${duration}ms`
    });

    return batchResult;
  }

  /**
   * 生成批量处理结果摘要
   */
  generateResultSummary(result: BatchResult): string {
    const { totalItems, successCount, failureCount, duration } = result;
    const durationSeconds = Math.round(duration / 1000);

    let summary = `${getString('openreview-batch-result-title')}\n`;
    summary += `${getString('openreview-batch-result-total')}: ${totalItems}\n`;
    summary += `${getString('openreview-batch-result-success')}: ${successCount}\n`;

    if (failureCount > 0) {
      summary += `${getString('openreview-batch-result-failure')}: ${failureCount}\n`;

      // 列出失败的条目
      const failedItems = result.results.filter(r => !r.success);
      if (failedItems.length > 0) {
        summary += `\n${getString('openreview-batch-result-failed-items')}:\n`;
        failedItems.forEach((item, index) => {
          summary += `${index + 1}. ${item.title}: ${item.error}\n`;
        });
      }
    }

    summary += `\n${getString('openreview-batch-result-duration')}: ${durationSeconds}s`;

    // 添加成功条目的统计信息
    const successfulItems = result.results.filter(r => r.success);
    if (successfulItems.length > 0) {
      const totalReviews = successfulItems.reduce((sum, item) => sum + (item.reviewCount || 0), 0);
      const totalComments = successfulItems.reduce((sum, item) => sum + (item.commentCount || 0), 0);

      summary += `\n\n${getString('openreview-batch-result-extracted')}:\n`;
      summary += `${getString('openreview-batch-result-reviews')}: ${totalReviews}\n`;
      summary += `${getString('openreview-batch-result-comments')}: ${totalComments}`;
    }

    return summary;
  }
}