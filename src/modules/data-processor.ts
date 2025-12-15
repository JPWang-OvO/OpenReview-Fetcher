/**
 * Data Processor Module
 * 专门用于处理和格式化OpenReview数据，支持对话树结构
 * 遵循Zotero笔记模板规范，使用基本HTML格式
 */

import {
  OpenReviewPaper,
  OpenReviewReview,
  OpenReviewComment,
  OpenReviewNote,
} from "./openreview";
import { getString } from "../utils/locale";
import { OpenReviewSettingsManager } from "./openreview-settings";

export interface ProcessedReview {
  id: string;
  author: string;
  rating?: number;
  confidence?: number;
  summary?: string;
  strengths?: string;
  weaknesses?: string;
  questions?: string;
  technicalQuality?: {
    soundness?: string;
    presentation?: string;
    contribution?: string;
  };
  rawData: OpenReviewReview;
}

export interface ProcessedComment {
  id: string;
  author: string;
  content: string;
  timestamp?: Date;
  replyTo?: string;
  rawData: OpenReviewComment;
}

// 对话树节点接口
export interface ConversationTreeNode {
  note: OpenReviewNote;
  noteType: string;
  level: number;
  children: ConversationTreeNode[];
  creationTime: Date;
  signatures: string[];
  contentSummary: string;
  icon: string;
}

// 对话树接口
export interface ConversationTree {
  rootNode: ConversationTreeNode;
  allNodes: ConversationTreeNode[];
  statistics: {
    totalNotes: number;
    reviewCount: number;
    commentCount: number;
    authorResponseCount: number;
    decisionCount: number;
    metaReviewCount: number;
  };
}

export interface ProcessedPaper {
  id: string;
  title: string;
  authors: string[];
  abstract?: string;
  reviews: ProcessedReview[];
  comments: ProcessedComment[];
  allNotes?: OpenReviewNote[];
  conversationTree?: ConversationTree;
  statistics: {
    totalReviews: number;
    totalComments: number;
    averageRating?: number;
    ratingDistribution: { [rating: string]: number };
    averageConfidence?: number;
  };
  extractedAt: Date;
}

export class DataProcessor {
  /**
   * 处理原始论文数据
   */
  static processPaper(
    rawPaper: OpenReviewPaper,
    allNotes?: OpenReviewNote[],
  ): ProcessedPaper {
    const processedReviews = rawPaper.reviews.map((review) =>
      this.processReview(review),
    );
    const processedComments = rawPaper.comments.map((comment) =>
      this.processComment(comment),
    );
    const statistics = this.calculateStatistics(processedReviews);

    // 构建对话树（如果提供了所有note）
    let conversationTree: ConversationTree | undefined;
    if (allNotes && allNotes.length > 0) {
      conversationTree = this.buildConversationTree(allNotes);
    }

    return {
      id: rawPaper.id,
      title: rawPaper.title,
      authors: rawPaper.authors,
      abstract: rawPaper.abstract,
      reviews: processedReviews,
      comments: processedComments,
      allNotes: allNotes,
      conversationTree,
      statistics,
      extractedAt: new Date(),
    };
  }

  /**
   * 处理单个评审
   */
  static processReview(rawReview: OpenReviewReview): ProcessedReview {
    const processed: ProcessedReview = {
      id: rawReview.id,
      author: rawReview.author,
      summary: rawReview.summary,
      strengths: rawReview.strengths,
      weaknesses: rawReview.weaknesses,
      questions: rawReview.questions,
      rawData: rawReview,
    };

    // 处理评分
    if (rawReview.rating) {
      processed.rating = this.parseRating(rawReview.rating);
    }

    // 处理置信度
    if (rawReview.confidence) {
      processed.confidence = this.parseConfidence(rawReview.confidence);
    }

    // 处理技术质量评估
    processed.technicalQuality = {
      soundness: rawReview.soundness,
      presentation: rawReview.presentation,
      contribution: rawReview.contribution,
    };

    return processed;
  }

  /**
   * 处理单个评论
   */
  static processComment(rawComment: OpenReviewComment): ProcessedComment {
    return {
      id: rawComment.id,
      author: rawComment.author,
      content: rawComment.content,
      rawData: rawComment,
    };
  }

  /**
   * 计算统计信息
   */
  static calculateStatistics(reviews: ProcessedReview[]) {
    const statistics = {
      totalReviews: reviews.length,
      totalComments: 0,
      ratingDistribution: {} as { [rating: string]: number },
      averageRating: undefined as number | undefined,
      averageConfidence: undefined as number | undefined,
    };

    const ratings = reviews
      .map((r) => r.rating)
      .filter((r) => r !== undefined) as number[];

    const confidences = reviews
      .map((r) => r.confidence)
      .filter((c) => c !== undefined) as number[];

    // 计算平均评分
    if (ratings.length > 0) {
      statistics.averageRating =
        ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
    }

    // 计算平均置信度
    if (confidences.length > 0) {
      statistics.averageConfidence =
        confidences.reduce((sum, conf) => sum + conf, 0) / confidences.length;
    }

    // 计算评分分布
    ratings.forEach((rating) => {
      const ratingStr = rating.toString();
      statistics.ratingDistribution[ratingStr] =
        (statistics.ratingDistribution[ratingStr] || 0) + 1;
    });

    return statistics;
  }

  /**
   * 构建对话树
   */
  static buildConversationTree(notes: OpenReviewNote[]): ConversationTree {
    if (!notes || notes.length === 0) {
      throw new Error("No notes provided");
    }

    // 构建回复映射：replyto -> [notes]
    const replyMap = new Map<string, OpenReviewNote[]>();
    const rootNotes: OpenReviewNote[] = [];

    for (const note of notes) {
      if (!note.replyto) {
        // 根节点（主论文或顶级评审）
        rootNotes.push(note);
      } else {
        // 回复节点
        if (!replyMap.has(note.replyto)) {
          replyMap.set(note.replyto, []);
        }
        replyMap.get(note.replyto)!.push(note);
      }
    }

    // 找到主论文作为根节点
    const rootNote = rootNotes.find((note) => {
      const noteType = this.getNoteType(note);
      return noteType === "Paper";
    });

    if (!rootNote) {
      throw new Error("No root paper found");
    }

    // 创建根节点
    const rootNode: ConversationTreeNode = {
      note: rootNote,
      noteType: this.getNoteType(rootNote),
      level: 0,
      children: [],
      creationTime: new Date(rootNote.cdate || 0),
      signatures: rootNote.signatures || [],
      contentSummary: this.getContentSummary(rootNote),
      icon: this.getNoteTypeIcon("Paper"),
    };

    const allNodes: ConversationTreeNode[] = [rootNode];

    // 递归构建子树
    this.buildChildNodes(rootNode, replyMap, allNodes);

    // 排序所有节点的子节点
    this.sortTreeNodesRecursively(rootNode);

    // 计算统计信息
    const statistics = this.calculateTreeStatistics(allNodes);

    return {
      rootNode,
      allNodes,
      statistics,
    };
  }

  /**
   * 递归构建子节点
   */
  private static buildChildNodes(
    parentNode: ConversationTreeNode,
    replyMap: Map<string, OpenReviewNote[]>,
    allNodes: ConversationTreeNode[],
  ): void {
    const replies = replyMap.get(parentNode.note.id);
    if (!replies || replies.length === 0) {
      return;
    }

    for (const reply of replies) {
      const noteType = this.getNoteType(reply);
      const childNode: ConversationTreeNode = {
        note: reply,
        noteType,
        level: parentNode.level + 1,
        children: [],
        creationTime: new Date(reply.cdate || 0),
        signatures: reply.signatures || [],
        contentSummary: this.getContentSummary(reply),
        icon: this.getNoteTypeIcon(noteType),
      };

      parentNode.children.push(childNode);
      allNodes.push(childNode);

      // 递归处理子节点
      this.buildChildNodes(childNode, replyMap, allNodes);
    }
  }

  /**
   * 识别note类型
   */
  static getNoteType(note: OpenReviewNote): string {
    const content = note.content || {};
    const invitation = note.invitation?.toLowerCase() || "";
    const contentKeys = Object.keys(content);

    // 检查decision
    if (content.decision || invitation.includes("decision")) {
      return "Decision";
    }

    // 检查meta review
    if (
      content.metareview ||
      invitation.includes("meta") ||
      invitation.includes("area")
    ) {
      return "Meta Review";
    }

    // 检查official review - 按照Python脚本逻辑
    if (contentKeys.includes("review") || contentKeys.includes("rating")) {
      return "Official Review";
    }

    // 检查author response - 按照Python脚本逻辑 (必须在Paper检查之前)
    if (contentKeys.includes("title") && contentKeys.includes("comment")) {
      const title = content.title?.value?.toString().toLowerCase() || "";
      if (title.includes("author") || title.includes("response")) {
        return "Author Response";
      }
      return "Comment";
    }

    // 检查title字段判断是否为论文 (放在Author Response检查之后)
    if (content.title && content.title.value) {
      return "Paper";
    }

    // 检查comment
    if (contentKeys.includes("comment")) {
      return "Comment";
    }

    return "Other";
  }

  /**
   * 获取note类型对应的图标
   */
  static getNoteTypeIcon(noteType: string): string {
    const iconMap: { [key: string]: string } = {
      Paper: "📄",
      Decision: "🏆",
      "Meta Review": "📝",
      "Official Review": "⭐",
      "Author Response": "💬",
      Comment: "🔄",
      Reply: "↳",
    };
    return iconMap[noteType] || "📌";
  }

  private static localizeNoteType(noteType: string): string {
    const map: { [key: string]: string } = {
      Paper: getString("openreview-note-type-paper"),
      Decision: getString("openreview-note-type-decision"),
      "Meta Review": getString("openreview-note-type-meta-review"),
      "Official Review": getString("openreview-note-type-official-review"),
      "Author Response": getString("openreview-note-type-author-response"),
      Comment: getString("openreview-note-type-comment"),
      Reply: getString("openreview-note-type-reply"),
    };
    return map[noteType] || noteType;
  }

  /**
   * 获取内容摘要
   */
  static getContentSummary(note: OpenReviewNote): string {
    const content = note.content || {};

    // 对于论文，返回标题
    if (content.title && content.title.value) {
      return content.title.value.toString();
    }
    return "-";
    // 对于其他类型，尝试获取主要内容
    /*
    const possibleFields = ['comment', 'review', 'decision', 'metareview', 'summary'];

    for (const field of possibleFields) {
      if (content[field] && content[field].value) {
        const text = content[field].value.toString();
        return text.length > 100 ? text.substring(0, 100) + '...' : text;
      }
    }
    */
    return `Note ${note.id}`;
  }

  /**
   * 递归排序树节点
   */
  static sortTreeNodesRecursively(node: ConversationTreeNode): void {
    if (node.children.length === 0) return;

    // 第一层（对主论文的直接回复）使用特殊排序
    if (node.level === 0) {
      this.sortFirstLevelNodes(node.children);
    } else {
      // 其他层级按时间从前到后排序
      node.children.sort((a, b) => {
        return a.creationTime.getTime() - b.creationTime.getTime();
      });
    }

    // 递归排序子节点
    node.children.forEach((child) => this.sortTreeNodesRecursively(child));
  }

  /**
   * 排序第一层节点（对主论文的直接回复）
   */
  private static sortFirstLevelNodes(nodes: ConversationTreeNode[]): void {
    // Decision和Meta Review优先，然后所有其他类型按时间从新到旧排序
    const decisionAndMeta = nodes.filter(
      (node) => node.noteType === "Decision" || node.noteType === "Meta Review",
    );
    const otherNodes = nodes.filter(
      (node) => node.noteType !== "Decision" && node.noteType !== "Meta Review",
    );

    // Decision和Meta Review按时间从新到旧排序
    decisionAndMeta.sort(
      (a, b) => b.creationTime.getTime() - a.creationTime.getTime(),
    );

    // 其他所有类型（包括Official Review）按时间从新到旧排序
    otherNodes.sort(
      (a, b) => b.creationTime.getTime() - a.creationTime.getTime(),
    );

    // 清空原数组并重新填充
    nodes.length = 0;
    nodes.push(...decisionAndMeta, ...otherNodes);
  }

  /**
   * 计算对话树统计信息
   */
  static calculateTreeStatistics(nodes: ConversationTreeNode[]) {
    const statistics = {
      totalNotes: nodes.length,
      reviewCount: 0,
      commentCount: 0,
      authorResponseCount: 0,
      decisionCount: 0,
      metaReviewCount: 0,
    };

    nodes.forEach((node) => {
      switch (node.noteType) {
        case "Official Review":
          statistics.reviewCount++;
          break;
        case "Comment":
        case "Reply":
          statistics.commentCount++;
          break;
        case "Author Response":
          statistics.authorResponseCount++;
          break;
        case "Decision":
          statistics.decisionCount++;
          break;
        case "Meta Review":
          statistics.metaReviewCount++;
          break;
      }
    });

    return statistics;
  }

  /**
   * 解析评分字符串
   */
  static parseRating(ratingStr: any): number | undefined {
    if (ratingStr === null || ratingStr === undefined) {
      return undefined;
    }

    if (typeof ratingStr === "number") {
      return ratingStr;
    }

    if (Array.isArray(ratingStr)) {
      if (ratingStr.length === 0) return undefined;
      return this.parseRating(ratingStr[0]);
    }

    const str = String(ratingStr);
    const match = str.match(/^(\d+)/);
    return match ? parseInt(match[1]) : undefined;
  }

  /**
   * 解析置信度字符串
   */
  static parseConfidence(confidenceStr: any): number | undefined {
    if (confidenceStr === null || confidenceStr === undefined) {
      return undefined;
    }

    if (typeof confidenceStr === "number") {
      return confidenceStr;
    }

    if (Array.isArray(confidenceStr)) {
      if (confidenceStr.length === 0) return undefined;
      return this.parseConfidence(confidenceStr[0]);
    }

    const str = String(confidenceStr);
    const match = str.match(/^(\d+)/);
    return match ? parseInt(match[1]) : undefined;
  }

  /**
   * 转义HTML特殊字符
   */
  private static escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /**
   * 安全地获取字符串值
   */
  private static safeString(value: any): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "object" && value.value !== undefined) {
      return String(value.value);
    }
    return String(value);
  }

  /**
   * 规范化文本，处理不必要的换行符
   */
  private static normalizeText(text: string): string {
    if (!text) return "";

    // 将单个换行符替换为空格，保留双换行符作为段落分隔
    return text
      .replace(/\n(?!\s*\n)/g, " ") // 单个换行符替换为空格
      .replace(/\s+/g, " ") // 多个连续空格替换为单个空格
      .trim(); // 去除首尾空格
  }

  /**
   * 生成符合Zotero规范的HTML片段
   * 遵循Zotero笔记模板规范，使用基本HTML标签
   */
  static generateInteractiveHTMLFragment(paper: ProcessedPaper): string {
    if (!paper.conversationTree) {
      // 如果没有对话树，生成基本的Markdown报告并转换为HTML
      const markdownReport = this.generateMarkdownReport(paper);
      return this.convertMarkdownToZoteroHTML(markdownReport);
    }

    const tree = paper.conversationTree;
    let html = "";

    // 论文标题
    html += `<h1>${this.escapeHtml(paper.title)}</h1>`;

    // 论文基本信息
    html += `<h2>📋 ${getString("openreview-report-section-paper-info")}</h2>`;
    html += `<p><strong>${getString("openreview-report-field-authors")}:</strong> ${this.escapeHtml(paper.authors.join(", "))}</p>`;

    // 添加Paper的创建时间
    if (tree.rootNode && tree.rootNode.noteType === "Paper") {
      const paperTimeStr =
        tree.rootNode.creationTime.toLocaleDateString("zh-CN") +
        " " +
        tree.rootNode.creationTime.toLocaleTimeString("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
        });
      html += `<p><strong>${getString("openreview-report-field-created-at")}:</strong> ${paperTimeStr}</p>`;
    }

    html += `<p><strong>${getString("openreview-report-field-extracted-at")}:</strong> ${paper.extractedAt.toLocaleString("zh-CN")}</p>`;

    if (paper.abstract) {
      html += `<p><strong>${getString("openreview-report-field-abstract")}:</strong> ${this.escapeHtml(paper.abstract)}</p>`;
    }

    const includeStatistics =
      OpenReviewSettingsManager.getCurrentSettings().includeStatistics;
    if (includeStatistics) {
      html += `<h2>📊 ${getString("openreview-report-section-statistics")}</h2>`;
      html += `<p><strong>${getString("openreview-report-field-total-notes")}:</strong> ${tree.statistics.totalNotes}</p>`;
      html += `<p><strong>${getString("openreview-report-field-author-response-count")}:</strong> ${tree.statistics.authorResponseCount}</p>`;
      html += `<p><strong>${getString("openreview-report-field-other-comment-count")}:</strong> ${tree.statistics.commentCount}</p>`;

      if (paper.statistics.averageRating) {
        html += `<p><strong>${getString("openreview-report-field-average-rating")}:</strong> ${paper.statistics.averageRating.toFixed(1)}</p>`;
      }
      if (paper.statistics.averageConfidence) {
        html += `<p><strong>${getString("openreview-report-field-average-confidence")}:</strong> ${paper.statistics.averageConfidence.toFixed(1)}</p>`;
      }
    }

    // review 对话树 - 跳过Paper根节点，直接处理其子节点
    if (tree.rootNode && tree.rootNode.children) {
      for (const child of tree.rootNode.children) {
        html += this.generateNodeHTML(child);
      }
    }

    return html;
  }

  /**
   * 递归生成节点HTML
   */
  private static generateNodeHTML(node: ConversationTreeNode): string {
    let html = "";

    // 根据层级确定缩进和前缀 - 由于跳过了Paper根节点，所有级别减1
    const adjustedLevel = Math.max(0, node.level - 1);
    const indent = "&nbsp;&nbsp;".repeat(adjustedLevel);
    const prefix = adjustedLevel > 0 ? "↳ " : "";

    // 格式化时间
    const timeStr =
      node.creationTime.toLocaleDateString("zh-CN") +
      " " +
      node.creationTime.toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
      });

    // 格式化签名
    const signatures =
      node.signatures.length > 0
        ? ` ${getString("openreview-report-by")} ${node.signatures.join(", ")}`
        : "";

    // 生成节点标题
    if (node.noteType === "Paper") {
      html += `<p><strong>${node.icon} [${this.escapeHtml(DataProcessor.localizeNoteType(node.noteType))}] ${this.escapeHtml(node.contentSummary)}</strong></p>`;
      html += `<p><strong>${getString("openreview-report-field-created-at")}:</strong> ${timeStr}</p>`;
    } else {
      const shortSummary =
        node.contentSummary.length > 100
          ? node.contentSummary.substring(0, 100) + "..."
          : node.contentSummary;

      html += `<p>${indent}${prefix}<strong>${node.icon} [${this.escapeHtml(DataProcessor.localizeNoteType(node.noteType))}]${this.escapeHtml(signatures)}</strong></p>`;
      if (shortSummary) {
        html += `<p>${indent}&nbsp;&nbsp;<strong>${getString("openreview-report-field-content")}:</strong> ${this.escapeHtml(shortSummary)}</p>`;
      }
      html += `<p>${indent}&nbsp;&nbsp;<strong>${getString("openreview-report-field-created-at")}:</strong> ${timeStr}</p>`;

      // 添加详细内容
      const content = this.extractNoteContent(node.note);
      if (content && Object.keys(content).length > 0) {
        const formattedContent = this.formatContentAsHTML(content);
        // 为内容添加缩进
        const indentedContent = formattedContent.replace(
          /<p>/g,
          `<p>${indent}&nbsp;&nbsp;&nbsp;&nbsp;`,
        );
        html += indentedContent;
      }
    }

    html += "<br>";

    // 递归处理子节点
    for (const child of node.children) {
      html += this.generateNodeHTML(child);
    }

    return html;
  }

  /**
   * 提取笔记内容
   */
  private static extractNoteContent(note: OpenReviewNote): {
    [key: string]: string;
  } {
    const content = note.content || {};
    const result: { [key: string]: string } = {};

    // 定义要提取的字段及其显示名称
    const fieldMap: { [key: string]: string } = {
      review: getString("openreview-report-field-review"),
      summary: getString("openreview-report-field-summary"),
      strengths: getString("openreview-report-field-strengths"),
      weaknesses: getString("openreview-report-field-weaknesses"),
      questions: getString("openreview-report-field-questions"),
      rating: getString("openreview-report-field-rating"),
      confidence: getString("openreview-report-field-confidence"),
      decision: getString("openreview-report-field-decision"),
      metareview: getString("openreview-report-field-meta-review"),
      comment: getString("openreview-report-field-comment"),
    };

    for (const [field, displayName] of Object.entries(fieldMap)) {
      if (content[field]) {
        const value = this.safeString(content[field]);
        if (value && value.trim().length > 0) {
          result[displayName] = value.trim();
        }
      }
    }

    return result;
  }

  /**
   * 将内容格式化为HTML
   */
  private static formatContentAsHTML(content: {
    [key: string]: string;
  }): string {
    let html = "";

    for (const [key, value] of Object.entries(content)) {
      if (value && value.length > 0) {
        html += `<p><strong>${this.escapeHtml(key)}:</strong></p>`;

        // 处理长文本，分段显示
        const paragraphs = value.split(/\n\s*\n/);
        for (const paragraph of paragraphs) {
          if (paragraph.trim()) {
            html += `<p>${this.escapeHtml(paragraph.trim())}</p>`;
          }
        }
      }
    }

    return html;
  }

  /**
   * 生成Markdown格式的报告
   */
  static generateMarkdownReport(paper: ProcessedPaper): string {
    if (!paper.conversationTree) {
      // 如果没有对话树，生成基本的评审报告
      return this.generateBasicMarkdownReport(paper);
    }

    const tree = paper.conversationTree;
    let markdown = "";

    // 论文标题
    markdown += `# ${paper.title}\n\n`;

    // 论文基本信息
    markdown += `## 📋 ${getString("openreview-report-section-paper-info")}\n\n`;
    markdown += `- **${getString("openreview-report-field-authors")}**: ${paper.authors.join(", ")}\n`;

    // 添加Paper的创建时间
    if (tree.rootNode && tree.rootNode.noteType === "Paper") {
      const paperTimeStr =
        tree.rootNode.creationTime.toLocaleDateString("zh-CN") +
        " " +
        tree.rootNode.creationTime.toLocaleTimeString("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
        });
      markdown += `- **${getString("openreview-report-field-created-at")}**: ${paperTimeStr}\n`;
    }

    markdown += `- **${getString("openreview-report-field-extracted-at")}**: ${paper.extractedAt.toLocaleString("zh-CN")}\n`;

    if (paper.abstract) {
      markdown += `- **${getString("openreview-report-field-abstract")}**: ${this.normalizeText(paper.abstract)}\n`;
    }
    markdown += "\n";

    const includeStatistics =
      OpenReviewSettingsManager.getCurrentSettings().includeStatistics;
    if (includeStatistics) {
      markdown += `## 📊 ${getString("openreview-report-section-statistics")}\n\n`;
      markdown += `- **${getString("openreview-report-field-total-notes")}**: ${tree.statistics.totalNotes}\n`;
      markdown += `- **${getString("openreview-report-field-author-response-count")}**: ${tree.statistics.authorResponseCount}\n`;
      markdown += `- **${getString("openreview-report-field-other-comment-count")}**: ${tree.statistics.commentCount}\n`;

      if (paper.statistics.averageRating) {
        markdown += `- **${getString("openreview-report-field-average-rating")}**: ${paper.statistics.averageRating.toFixed(1)}\n`;
      }
      if (paper.statistics.averageConfidence) {
        markdown += `- **${getString("openreview-report-field-average-confidence")}**: ${paper.statistics.averageConfidence.toFixed(1)}\n`;
      }
      markdown += "\n";
    }

    // 对话树 - 跳过Paper根节点，直接处理其子节点
    if (tree.rootNode && tree.rootNode.children) {
      for (const child of tree.rootNode.children) {
        markdown += this.generateNodeMarkdown(child);
      }
    }

    return markdown;
  }

  /**
   * 递归生成节点Markdown
   */
  private static generateNodeMarkdown(node: ConversationTreeNode): string {
    let markdown = "";

    // 格式化时间
    const timeStr =
      node.creationTime.toLocaleDateString("zh-CN") +
      " " +
      node.creationTime.toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
      });

    // 格式化签名
    const signatures =
      node.signatures.length > 0 ? ` by ${node.signatures.join(", ")}` : "";

    // 根据层级确定标题级别 - 由于跳过了Paper根节点，所有级别提升一级
    // level 1 (Review等) → H2, level 2 → H3, 以此类推
    const headerLevel = Math.min(node.level + 1, 6);
    const headerPrefix = "#".repeat(headerLevel);

    // 生成节点标题
    if (node.noteType === "Paper") {
      markdown += `${headerPrefix} ${node.icon} [${DataProcessor.localizeNoteType(node.noteType)}] ${node.contentSummary}\n\n`;
      markdown += `**${getString("openreview-report-field-created-at")}:** ${timeStr}\n\n`;
    } else {
      const shortSummary =
        node.contentSummary.length > 100
          ? node.contentSummary.substring(0, 100) + "..."
          : node.contentSummary;

      markdown += `${headerPrefix} ${node.icon} [${DataProcessor.localizeNoteType(node.noteType)}]${signatures}\n\n`;

      if (shortSummary && shortSummary !== "-") {
        markdown += `**${getString("openreview-report-field-content")}:** ${shortSummary}\n\n`;
      }
      markdown += `**${getString("openreview-report-field-created-at")}:** ${timeStr}\n\n`;

      // 添加详细内容
      const content = this.extractNoteContent(node.note);
      if (content && Object.keys(content).length > 0) {
        const formattedContent = this.formatContentAsMarkdown(content);
        markdown += formattedContent;
      }
    }

    // 递归处理子节点
    for (const child of node.children) {
      markdown += this.generateNodeMarkdown(child);
    }

    return markdown;
  }

  /**
   * 将内容格式化为Markdown
   */
  private static formatContentAsMarkdown(content: {
    [key: string]: string;
  }): string {
    let markdown = "";

    for (const [key, value] of Object.entries(content)) {
      if (value && value.length > 0) {
        markdown += `**${key}:**\n\n`;

        // 处理长文本，分段显示
        const paragraphs = value.split(/\n\s*\n/);
        for (const paragraph of paragraphs) {
          if (paragraph.trim()) {
            markdown += `${paragraph.trim()}\n\n`;
          }
        }
      }
    }

    return markdown;
  }

  /**
   * 生成基本Markdown格式的报告（用于fallback）
   */
  private static generateBasicMarkdownReport(paper: ProcessedPaper): string {
    let markdown = "";

    // 论文标题
    markdown += `# ${paper.title}\n\n`;

    // 论文信息
    markdown += `## 📋 ${getString("openreview-report-section-paper-info")}\n\n`;
    markdown += `- **${getString("openreview-report-field-authors")}**: ${paper.authors.join(", ")}\n`;
    markdown += `- **${getString("openreview-report-field-extracted-at")}**: ${paper.extractedAt.toLocaleString("zh-CN")}\n`;
    if (paper.abstract) {
      const abstractPreview =
        paper.abstract.length > 300
          ? paper.abstract.substring(0, 300) + "..."
          : paper.abstract;
      markdown += `- **${getString("openreview-report-field-abstract")}**: ${this.normalizeText(abstractPreview)}\n`;
    }
    markdown += "\n";

    const includeStatistics =
      OpenReviewSettingsManager.getCurrentSettings().includeStatistics;
    if (includeStatistics) {
      markdown += `## 📊 ${getString("openreview-report-section-statistics")}\n\n`;
      markdown += `- **${getString("openreview-report-field-total-reviews")}**: ${paper.statistics.totalReviews}\n`;
      if (paper.statistics.averageRating) {
        markdown += `- **${getString("openreview-report-field-average-rating")}**: ${paper.statistics.averageRating.toFixed(1)}\n`;
      }
      if (paper.statistics.averageConfidence) {
        markdown += `- **${getString("openreview-report-field-average-confidence")}**: ${paper.statistics.averageConfidence.toFixed(1)}\n`;
      }
      markdown += "\n";
    }

    // 评审详情
    if (paper.reviews.length > 0) {
      markdown += `## 📝 ${getString("openreview-report-section-review-details")}\n\n`;
      paper.reviews.forEach((review, index) => {
        markdown += `### ${getString("openreview-report-review-number", { args: { index: index + 1 } })}\n\n`;
        markdown += `- **${getString("openreview-report-field-author")}**: ${review.author}\n`;
        if (review.rating) {
          markdown += `- **${getString("openreview-report-field-rating")}**: ${review.rating}\n`;
        }
        if (review.confidence) {
          markdown += `- **${getString("openreview-report-field-confidence")}**: ${review.confidence}\n`;
        }
        if (review.summary) {
          markdown += `- **${getString("openreview-report-field-summary")}**: ${review.summary}\n`;
        }
        if (review.strengths) {
          markdown += `- **${getString("openreview-report-field-strengths")}**: ${review.strengths}\n`;
        }
        if (review.weaknesses) {
          markdown += `- **${getString("openreview-report-field-weaknesses")}**: ${review.weaknesses}\n`;
        }
        markdown += "\n";
      });
    }

    return markdown;
  }

  /**
   * 将Markdown转换为Zotero兼容的HTML
   */
  private static convertMarkdownToZoteroHTML(markdown: string): string {
    let html = markdown;

    // 转换标题
    html = html.replace(/^### (.*$)/gm, "<h3>$1</h3>");
    html = html.replace(/^## (.*$)/gm, "<h2>$1</h2>");
    html = html.replace(/^# (.*$)/gm, "<h1>$1</h1>");

    // 转换粗体
    html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

    // 转换列表项
    html = html.replace(/^- (.*$)/gm, "<p>• $1</p>");

    // 转换段落（处理空行）
    const lines = html.split("\n");
    const processedLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.length === 0) {
        continue; // 跳过空行
      }

      // 如果不是HTML标签，包装为段落
      if (!line.match(/^<[h1-6]|^<p>|^<strong>/)) {
        processedLines.push(`<p>${this.escapeHtml(line)}</p>`);
      } else {
        processedLines.push(line);
      }
    }

    return processedLines.join("");
  }

  /**
   * 生成纯Markdown附件内容
   */
  static generatePlainMarkdownAttachment(paper: ProcessedPaper): string {
    return this.generateMarkdownReport(paper);
  }

  /**
   * 将Markdown转换为HTML
   */
  static convertMarkdownToHTML(markdown: string): string {
    if (!markdown) return "";

    // 简单的Markdown到HTML转换
    return markdown
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") // 粗体
      .replace(/\*(.*?)\*/g, "<em>$1</em>") // 斜体
      .replace(/`(.*?)`/g, "<code>$1</code>") // 行内代码
      .replace(/\n\n/g, "</p><p>") // 段落
      .replace(/\n/g, "<br>") // 换行
      .replace(/^/, "<p>") // 开始段落
      .replace(/$/, "</p>"); // 结束段落
  }
}
