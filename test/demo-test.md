# OpenReview插件演示测试

## 快速测试步骤

### 1. 启动Zotero开发环境
```bash
# 确保开发服务器正在运行
npm start
```

### 2. 打开Zotero
- 使用独立的开发配置文件
- 路径: `D:\OneDrive\Develop\zotero-dev-profile`

### 3. 验证插件安装
在Zotero中检查：
- **工具栏**: 查找OpenReview按钮
- **工具菜单**: 查找"Extract OpenReview Comments"选项
- **右键菜单**: 在任意条目上右键，查找OpenReview选项

### 4. 测试基本功能

#### 测试用例1: 简单论文提取
```
URL: https://openreview.net/forum?id=rJXMpikCZ
期望结果: 
- 创建新的Zotero条目
- 添加论文标题和作者
- 创建包含评论的笔记
```

#### 测试用例2: 带评分的论文
```
URL: https://openreview.net/forum?id=HkxLXnAcFQ
期望结果:
- 提取所有评论
- 计算平均评分
- 显示评审统计信息
```

#### 测试用例3: 错误处理
```
URL: https://openreview.net/forum?id=invalid123
期望结果:
- 显示友好的错误消息
- 不创建无效条目
- 记录错误日志
```

### 5. 在开发者控制台中测试

打开Zotero的开发者控制台 (Ctrl+Shift+I)，运行：

```javascript
// 检查插件是否加载
console.log("OpenReview插件状态:", typeof Zotero.OpenReview);

// 测试API客户端
if (Zotero.OpenReview && Zotero.OpenReview.api) {
    console.log("API客户端已就绪");
}

// 测试URL解析
const testUrl = "https://openreview.net/forum?id=test123";
console.log("测试URL:", testUrl);
```

### 6. 检查输出

成功测试后应该看到：
- **新的Zotero条目**: 包含论文信息
- **笔记**: 格式化的评论内容
- **标签**: OpenReview相关标签
- **附件**: PDF链接（如果可用）

### 7. 调试常见问题

#### 插件未加载
```javascript
// 在控制台检查
Components.utils.reportError("检查插件状态");
console.log(Zotero.OpenReview);
```

#### API调用失败
```javascript
// 检查网络连接
fetch('https://api.openreview.net/notes?id=test')
  .then(r => console.log('API可访问'))
  .catch(e => console.log('API错误:', e));
```

#### 数据处理错误
```javascript
// 检查数据格式
console.log("测试数据处理...");
// 运行test-functionality.js中的测试函数
```

## 性能测试

### 响应时间测试
- **API调用**: < 5秒
- **数据处理**: < 2秒
- **UI更新**: < 1秒

### 内存使用
- **基础内存**: 监控插件内存占用
- **大量数据**: 测试处理多个评论的情况

## 用户体验测试

### 易用性
- [ ] 界面直观易懂
- [ ] 操作流程简单
- [ ] 错误提示清晰

### 可靠性
- [ ] 网络中断处理
- [ ] 无效URL处理
- [ ] 大数据量处理

### 兼容性
- [ ] 不同版本的Zotero
- [ ] 不同操作系统
- [ ] 不同网络环境

## 测试清单

- [ ] 插件成功加载
- [ ] UI元素正确显示
- [ ] API调用正常工作
- [ ] 数据正确提取和格式化
- [ ] Zotero条目正确创建
- [ ] 错误处理正常工作
- [ ] 性能满足要求
- [ ] 用户体验良好

## 下一步

完成基础测试后：
1. **收集反馈**: 记录发现的问题
2. **性能优化**: 改进响应速度
3. **功能完善**: 添加更多特性
4. **文档更新**: 完善用户文档