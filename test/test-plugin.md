# OpenReview插件测试指南

## 测试环境状态
✅ 开发服务器已启动
✅ 插件已安装到Zotero
✅ 使用独立的开发配置文件

## 功能测试清单

### 1. 基础功能测试
- [ ] 插件是否正确加载到Zotero
- [ ] 右键菜单是否显示"Extract OpenReview Comments"选项
- [ ] 工具栏按钮是否正常显示

### 2. OpenReview URL测试
测试URL示例：
- `https://openreview.net/forum?id=PAPER_ID`
- `https://openreview.net/pdf?id=PAPER_ID`

### 3. API功能测试
- [ ] 能否正确解析OpenReview URL
- [ ] 能否获取论文信息
- [ ] 能否获取评论数据
- [ ] 错误处理是否正常工作

### 4. 数据处理测试
- [ ] 评论数据格式化是否正确
- [ ] 统计信息计算是否准确
- [ ] 匿名化功能是否工作

### 5. Zotero集成测试
- [ ] 能否创建Zotero条目
- [ ] 能否添加笔记
- [ ] 能否添加附件

## 测试步骤

### 步骤1：验证插件加载
1. 打开Zotero
2. 检查工具栏是否有OpenReview按钮
3. 右键点击任意条目，查看是否有"Extract OpenReview Comments"选项

### 步骤2：测试URL提取
1. 复制一个OpenReview论文URL
2. 点击工具栏按钮或右键菜单
3. 粘贴URL并点击提取

### 步骤3：验证结果
1. 检查是否创建了新的Zotero条目
2. 查看笔记内容是否包含评论信息
3. 验证统计信息是否正确

## 常见问题排查

### 如果插件没有加载：
1. 检查开发服务器是否运行
2. 查看Zotero错误控制台
3. 重启Zotero

### 如果API调用失败：
1. 检查网络连接
2. 验证OpenReview URL格式
3. 查看错误日志

### 如果数据处理错误：
1. 检查返回的JSON数据格式
2. 验证数据处理逻辑
3. 测试边界情况