/**
 * OpenReview API Module
 * 基于Python脚本逻辑实现的JavaScript版本OpenReview API调用功能
 */

import { ErrorHandler, OpenReviewError, ErrorType, ValidationRules } from './error-handler';
import { OpenReviewSettingsManager } from './openreview-settings';

export interface OpenReviewNote {
  id: string;
  forum: string;
  replyto?: string;  // 添加replyto属性
  signatures: string[];
  content: {
    [key: string]: {
      value: string | string[];
    };
  };
  readers?: string[];
  writers?: string[];
  nonreaders?: string[];
  invitation?: string;
  cdate?: number;
  mdate?: number;
  tcdate?: number;
  tmdate?: number;
}

export interface OpenReviewReview {
  id: string;
  author: string;
  rating?: string;
  confidence?: string;
  summary?: string;
  strengths?: string;
  weaknesses?: string;
  questions?: string;
  soundness?: string;
  presentation?: string;
  contribution?: string;
  [key: string]: any;
}

export interface OpenReviewComment {
  id: string;
  author: string;
  content: string;
  [key: string]: any;
}

export interface OpenReviewPaper {
  id: string;
  title: string;
  authors: string[];
  abstract?: string;
  reviews: OpenReviewReview[];
  comments: OpenReviewComment[];
}

export class OpenReviewClient {
  private baseUrl: string;
  private username?: string;
  private password?: string;

  constructor(baseUrl: string = 'https://api2.openreview.net', username?: string, password?: string) {
    this.baseUrl = baseUrl;
    this.username = username;
    this.password = password;
  }

  /**
   * 获取单个note
   */
  async getNote(noteId: string): Promise<OpenReviewNote> {
    // 验证输入
    ErrorHandler.validateInput({ noteId }, [
      ValidationRules.required('noteId')
    ]);

    const url = `${this.baseUrl}/notes?id=${noteId}`;

    return ErrorHandler.executeWithRetry(async () => {
      const response = await this.makeRequest(url);

      if (!response.notes || response.notes.length === 0) {
        throw new OpenReviewError({
          type: ErrorType.API_ERROR,
          message: `Note with ID ${noteId} not found`,
          userMessage: `未找到ID为 ${noteId} 的论文`
        });
      }

      return response.notes[0];
    }, OpenReviewSettingsManager.getCurrentSettings().maxRetries);
  }

  /**
   * 获取forum相关的所有notes
   */
  async getNotes(forumId: string): Promise<OpenReviewNote[]> {
    // 验证输入
    ErrorHandler.validateInput({ forumId }, [
      ValidationRules.required('forumId')
    ]);

    const url = `${this.baseUrl}/notes?forum=${forumId}`;

    return ErrorHandler.executeWithRetry(async () => {
      const response = await this.makeRequest(url);
      return response.notes || [];
    }, OpenReviewSettingsManager.getCurrentSettings().maxRetries);
  }

  /**
   * 获取完整的论文信息，包括评审和评论
   */
  async getPaperWithReviews(forumId: string): Promise<OpenReviewPaper> {
    // 验证输入
    ErrorHandler.validateInput({ forumId }, [
      ValidationRules.required('forumId')
    ]);

    try {
      // 获取主论文
      const mainNote = await this.getNote(forumId);

      // 获取所有相关notes
      const allNotes = await this.getNotes(forumId);

      // 分类处理notes
      const reviews: OpenReviewReview[] = [];
      const comments: OpenReviewComment[] = [];

      for (const note of allNotes) {
        try {
          if (this.isReview(note)) {
            reviews.push(this.parseReview(note));
          } else if (this.isComment(note)) {
            comments.push(this.parseComment(note));
          }
        } catch (parseError) {
          // 记录解析错误但不中断整个流程
          ztoolkit.log('Failed to parse note:', note.id, parseError);
        }
      }

      return {
        id: mainNote.id,
        title: mainNote.content.title?.value as string || '',
        authors: (mainNote.content.authors?.value as string[]) || [],
        abstract: mainNote.content.abstract?.value as string,
        reviews,
        comments
      };

    } catch (error) {
      const openReviewError = ErrorHandler.analyzeError(error);
      ErrorHandler.logError(openReviewError, 'getPaperWithReviews');
      throw openReviewError;
    }
  }

  /**
   * 判断note是否为评审
   */
  private isReview(note: OpenReviewNote): boolean {
    return !!(note.content.summary && note.content.rating);
  }

  /**
   * 判断note是否为评论
   */
  private isComment(note: OpenReviewNote): boolean {
    return !!(note.content.comment);
  }

  /**
   * 解析评审note
   */
  private parseReview(note: OpenReviewNote): OpenReviewReview {
    const review: OpenReviewReview = {
      id: note.id,
      author: note.signatures?.[0] || 'Unknown'
    };

    // 提取评审的各个字段
    const fields = ['rating', 'confidence', 'summary', 'strengths', 'weaknesses', 'questions', 'soundness', 'presentation', 'contribution'];

    for (const field of fields) {
      if (note.content[field]) {
        review[field] = note.content[field].value as string;
      }
    }

    return review;
  }

  /**
   * 解析评论note
   */
  private parseComment(note: OpenReviewNote): OpenReviewComment {
    return {
      id: note.id,
      author: note.signatures?.[0] || 'Unknown',
      content: note.content.comment?.value as string || ''
    };
  }

  /**
   * 发送HTTP请求
   */
  private async makeRequest(url: string): Promise<any> {
    const settings = OpenReviewSettingsManager.getCurrentSettings();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Zotero-OpenReview-Plugin/1.0.0'
    };

    // 如果有认证信息，添加认证头
    if (this.username && this.password) {
      const credentials = btoa(`${this.username}:${this.password}`);
      headers['Authorization'] = `Basic ${credentials}`;
    }

    try {
      // 创建超时Promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Request timeout'));
        }, settings.requestTimeout);
      });

      // 创建fetch Promise
      const fetchPromise = fetch(url, {
        method: 'GET',
        headers
      });

      // 使用Promise.race实现超时机制
      const response = await Promise.race([fetchPromise, timeoutPromise]);

      if (!response.ok) {
        throw new OpenReviewError({
          type: this.getErrorTypeFromStatus(response.status),
          message: `HTTP error! status: ${response.status}`,
          statusCode: response.status,
          retryable: this.isRetryableStatus(response.status),
          userMessage: this.getUserMessageFromStatus(response.status)
        });
      }

      return await response.json();
    } catch (error) {
      if (error instanceof OpenReviewError) {
        throw error;
      }

      // 处理超时错误
      if (error instanceof Error && error.message === 'Request timeout') {
        throw new OpenReviewError({
          type: ErrorType.NETWORK_ERROR,
          message: 'Request timeout',
          retryable: true,
          userMessage: `请求超时（${settings.requestTimeout}ms），请检查网络连接`
        });
      }

      // 处理其他网络错误
      throw ErrorHandler.analyzeError(error);
    }
  }

  private getErrorTypeFromStatus(status: number): ErrorType {
    if (status === 401 || status === 403) {
      return ErrorType.AUTHENTICATION_ERROR;
    }
    if (status === 429) {
      return ErrorType.RATE_LIMIT_ERROR;
    }
    if (status >= 500) {
      return ErrorType.API_ERROR;
    }
    return ErrorType.API_ERROR;
  }

  private isRetryableStatus(status: number): boolean {
    return status === 429 || status >= 500 || status === 408;
  }

  private getUserMessageFromStatus(status: number): string {
    switch (status) {
      case 401:
        return '认证失败，请检查用户名和密码';
      case 403:
        return '访问被拒绝，可能需要登录或权限不足';
      case 404:
        return '请求的资源不存在';
      case 429:
        return 'API 请求频率过高，请稍后重试';
      case 500:
        return 'OpenReview 服务器内部错误';
      case 502:
      case 503:
        return 'OpenReview 服务暂时不可用，请稍后重试';
      default:
        return `请求失败 (HTTP ${status})`;
    }
  }

  /**
   * 从OpenReview URL中提取forum ID
   */
  static extractForumId(url: string): string | null {
    const match = url.match(/[?&]id=([^&]+)/);
    return match ? match[1] : null;
  }

  /**
   * 格式化评审数据为可读文本
   */
  static formatReviewsAsText(paper: OpenReviewPaper): string {
    let text = `# ${paper.title}\n\n`;

    if (paper.authors.length > 0) {
      text += `**作者:** ${paper.authors.join(', ')}\n\n`;
    }

    if (paper.abstract) {
      text += `**摘要:** ${paper.abstract}\n\n`;
    }

    if (paper.reviews.length > 0) {
      text += `## 评审 (${paper.reviews.length} 条)\n\n`;

      paper.reviews.forEach((review, index) => {
        text += `### 评审 ${index + 1}\n`;
        text += `**评审者:** ${review.author}\n`;

        if (review.rating) text += `**评分:** ${review.rating}\n`;
        if (review.confidence) text += `**置信度:** ${review.confidence}\n`;
        if (review.summary) text += `**摘要:** ${review.summary}\n\n`;
        if (review.strengths) text += `**优点:** ${review.strengths}\n\n`;
        if (review.weaknesses) text += `**缺点:** ${review.weaknesses}\n\n`;
        if (review.questions) text += `**问题:** ${review.questions}\n\n`;

        // 其他字段
        const otherFields = ['soundness', 'presentation', 'contribution'];
        otherFields.forEach(field => {
          if (review[field]) {
            text += `**${field.charAt(0).toUpperCase() + field.slice(1)}:** ${review[field]}\n`;
          }
        });

        text += '\n---\n\n';
      });
    }

    if (paper.comments.length > 0) {
      text += `## 评论和回复 (${paper.comments.length} 条)\n\n`;

      paper.comments.forEach((comment, index) => {
        text += `### 评论 ${index + 1}\n`;
        text += `**作者:** ${comment.author}\n`;
        text += `**内容:** ${comment.content}\n\n`;
        text += '---\n\n';
      });
    }

    return text;
  }
}

// 导出默认实例
export const openReviewClient = new OpenReviewClient();