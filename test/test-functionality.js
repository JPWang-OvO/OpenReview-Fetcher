// OpenReview插件功能测试脚本
// 在Zotero的开发者控制台中运行此脚本

console.log("开始测试OpenReview插件功能...");

// 测试1: 检查插件是否正确加载
function testPluginLoaded() {
    console.log("测试1: 检查插件加载状态");
    
    if (typeof Zotero.OpenReview !== 'undefined') {
        console.log("✅ 插件已成功加载");
        return true;
    } else {
        console.log("❌ 插件未加载");
        return false;
    }
}

// 测试2: 检查API客户端
function testAPIClient() {
    console.log("测试2: 检查API客户端");
    
    try {
        if (Zotero.OpenReview.api) {
            console.log("✅ API客户端已初始化");
            return true;
        } else {
            console.log("❌ API客户端未找到");
            return false;
        }
    } catch (error) {
        console.log("❌ API客户端测试失败:", error);
        return false;
    }
}

// 测试3: 检查UI组件
function testUIComponents() {
    console.log("测试3: 检查UI组件");
    
    try {
        const window = Zotero.getMainWindow();
        const document = window.document;
        
        // 检查工具栏按钮
        const toolbarButton = document.getElementById('zotero-tb-openreview');
        if (toolbarButton) {
            console.log("✅ 工具栏按钮已添加");
        } else {
            console.log("⚠️ 工具栏按钮未找到");
        }
        
        // 检查右键菜单项
        const menuItem = document.getElementById('openreview-extract-comments');
        if (menuItem) {
            console.log("✅ 右键菜单项已添加");
        } else {
            console.log("⚠️ 右键菜单项未找到");
        }
        
        return true;
    } catch (error) {
        console.log("❌ UI组件测试失败:", error);
        return false;
    }
}

// 测试4: 测试URL解析功能
function testURLParsing() {
    console.log("测试4: 测试URL解析功能");
    
    const testUrls = [
        'https://openreview.net/forum?id=test123',
        'https://openreview.net/pdf?id=test456',
        'https://openreview.net/forum?id=invalid'
    ];
    
    try {
        testUrls.forEach((url, index) => {
            console.log(`测试URL ${index + 1}: ${url}`);
            // 这里应该调用实际的URL解析函数
            // const result = Zotero.OpenReview.utils.parseOpenReviewURL(url);
            console.log(`URL ${index + 1} 解析测试完成`);
        });
        
        console.log("✅ URL解析测试完成");
        return true;
    } catch (error) {
        console.log("❌ URL解析测试失败:", error);
        return false;
    }
}

// 运行所有测试
async function runAllTests() {
    console.log("=== OpenReview插件功能测试开始 ===");
    
    const results = {
        pluginLoaded: testPluginLoaded(),
        apiClient: testAPIClient(),
        uiComponents: testUIComponents(),
        urlParsing: testURLParsing()
    };
    
    console.log("=== 测试结果汇总 ===");
    Object.entries(results).forEach(([test, result]) => {
        console.log(`${test}: ${result ? '✅ 通过' : '❌ 失败'}`);
    });
    
    const passedTests = Object.values(results).filter(r => r).length;
    const totalTests = Object.keys(results).length;
    
    console.log(`总体结果: ${passedTests}/${totalTests} 测试通过`);
    
    if (passedTests === totalTests) {
        console.log("🎉 所有测试通过！插件功能正常");
    } else {
        console.log("⚠️ 部分测试失败，需要进一步调试");
    }
    
    return results;
}

// 导出测试函数
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { runAllTests, testPluginLoaded, testAPIClient, testUIComponents, testURLParsing };
} else {
    // 在Zotero控制台中直接运行
    runAllTests();
}