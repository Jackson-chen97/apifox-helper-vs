import * as vscode from 'vscode';
import { ApiDocumentProvider } from './providers/ApiDocumentProvider.js';
import { SpringControllerParser } from './parser/SpringControllerParser.js';
import { MockDataGenerator } from './generators/MockDataGenerator.js';
import { ApifoxService } from './services/ApifoxService.js';
import { ConfigService } from './services/ConfigService.js';
import { ApiTreeProvider } from './providers/ApiTreeProvider.js';
import { Logger } from './utils/Logger.js';
import { ApiEndpoint } from './types/index.js';

export function activate(context: vscode.ExtensionContext) {
    // 初始化Logger
    Logger.init(context);
    Logger.info('扩展已激活');

    // 初始化配置文件
    ConfigService.initConfigFile();

    // 注册API文档生成命令
    let generateDocsDisposable = vscode.commands.registerCommand('apifox-helper.generateDocs', async () => {
        Logger.info('开始生成API文档');
        const parser = new SpringControllerParser();
        const apiDocs = await parser.parse();
        Logger.info('解析结果:', apiDocs);
        ApiDocumentProvider.createOrShow(context.extensionUri, apiDocs);
    });

    // 配置Apifox
    let configureApifoxDisposable = vscode.commands.registerCommand('apifox-helper.configureApifox', async () => {
        try {
            const config = await ConfigService.promptForConfig();
            if (config) {
                vscode.window.showInformationMessage('Apifox配置已保存');
            }
        } catch (error) {
            vscode.window.showErrorMessage(`配置失败: ${error}`);
        }
    });

    // 上传命令（使用第一个工作区文件夹的配置）
    let uploadApiDocsDisposable = vscode.commands.registerCommand('apifox-helper.uploadApiDocs', async () => {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                vscode.window.showErrorMessage('未找到工作区');
                return;
            }

            // 使用第一个工作区文件夹的配置
            const projectRootPath = workspaceFolders[0].uri.fsPath;
            const projectConfig = await ConfigService.getConfigByProjectRootPath(projectRootPath);
            
            if (!projectConfig) {
                const result = await vscode.window.showWarningMessage(
                    '未配置Apifox，是否现在配置？',
                    '确定',
                    '取消'
                );
                if (result === '确定') {
                    await ConfigService.openConfigFileByProject(projectRootPath);
                }
                return;
            }

            // 解析API文档
            const parser = new SpringControllerParser([projectRootPath]);
            const apiDocs = await parser.parse();

            // 上传到Apifox
            const apifoxService = new ApifoxService(
                projectConfig.apiKey,
                projectConfig.apifoxProjectId,
                projectConfig.projectName,
                projectConfig.apifoxModuleId
            );
            const res = await apifoxService.uploadApiDocs(apiDocs);
            Logger.info('apifox上传结果:', res);

            vscode.window.showInformationMessage(`API文档已成功上传到Apifox项目: ${projectConfig.projectName}`);
        } catch (error) {
            vscode.window.showErrorMessage(`上传失败: ${error}`);
        }
    });

    // 配置多项目命令
    let configureProjectsDisposable = vscode.commands.registerCommand('apifox-helper.configureProjects', async () => {
        try {
            let config = await ConfigService.getConfig();
            if (!config) {
                config = await ConfigService.promptForConfig();
                if (!config) {
                    return;
                }
            } else {
                // 添加新项目
                config = await ConfigService.addProject(config);
                if (config) {
                    vscode.window.showInformationMessage('项目配置已添加');
                }
            }
        } catch (error) {
            vscode.window.showErrorMessage(`配置失败: ${error}`);
        }
    });

    // 注册HTTP请求发送命令
    let sendRequestDisposable = vscode.commands.registerCommand('apifox-helper.sendRequest', () => {
        // TODO: 实现HTTP请求发送逻辑
    });

    // 注册Mock数据生成命令
    let generateMockDisposable = vscode.commands.registerCommand('apifox-helper.generateMock', () => {
        const generator = new MockDataGenerator();
        generator.generate();
    });

    // 注册API列表视图
    const apiTreeProvider = new ApiTreeProvider();
    // vscode.window.registerTreeDataProvider('apiFoxHelper.view', apiTreeProvider);
    const treeView = vscode.window.createTreeView('apiFoxHelper.view', { 
        treeDataProvider: apiTreeProvider 
    });
    // 设置树视图引用，用于监听折叠/展开事件
    apiTreeProvider.setTreeView(treeView);
    
    // 注册搜索命令（优化：模糊搜索快速选择）
    let searchApiDisposable = vscode.commands.registerCommand('apifox-helper.searchApi', async () => {
        // 获取所有API数据
        const allApis = apiTreeProvider.getApis();
        
        // 创建QuickPick
        const quickPick = vscode.window.createQuickPick();
        quickPick.placeholder = '输入关键词搜索API（支持路径、方法、描述、类名）';
        quickPick.matchOnDescription = true;
        quickPick.matchOnDetail = true;
        
        // 生成QuickPickItem
        const items: vscode.QuickPickItem[] = allApis.map(api => ({
            label: `${api.method.toUpperCase()} ${api.path}`,
            description: api.description || api.swaggerTags || api.className || '',
            detail: `项目: ${api.projectRootPath ? api.projectRootPath.split(/[\\/]/).pop() : '未知'} | 文件: ${api.location.filePath.split(/[\\/]/).pop() || '未知'}`,
            apiId: api.id
        } as vscode.QuickPickItem & { apiId: string }));
        
        quickPick.items = items;
        
        // 监听输入变化，实时过滤
        quickPick.onDidChangeValue((value) => {
            if (!value) {
                quickPick.items = items;
                return;
            }
            
            // 模糊搜索过滤
            const filtered = items.filter(item => {
                const searchText = value.toLowerCase();
                return (
                    item.label.toLowerCase().includes(searchText) ||
                    (item.description && item.description.toLowerCase().includes(searchText)) ||
                    (item.detail && item.detail.toLowerCase().includes(searchText))
                );
            });
            quickPick.items = filtered;
        });
        
        // 监听选择事件
        quickPick.onDidAccept(async () => {
            const selected = quickPick.selectedItems[0] as (vscode.QuickPickItem & { apiId: string });
            if (selected && selected.apiId) {
                // 跳转到代码位置
                await apiTreeProvider.gotoDefinition({ id: selected.apiId } as any);
                // 聚焦树视图中的对应接口
                await apiTreeProvider.focusApi(selected.apiId);
            }
            quickPick.dispose();
        });
        
        // 监听隐藏事件
        quickPick.onDidHide(() => {
            quickPick.dispose();
        });
        
        quickPick.show();
    });

    // 注册刷新命令
    let refreshApiListDisposable = vscode.commands.registerCommand('apifox-helper.refreshApiList', () => {
        apiTreeProvider.refresh();
    });
    
    // 注册选择API命令
    let toggleSelectApiDisposable = vscode.commands.registerCommand('apifox-helper.toggleSelectApi', (api) => {
        apiTreeProvider.toggleSelect(api);
    });
    
    // 注册同步选中APIs命令
    let syncSelectedApisDisposable = vscode.commands.registerCommand('apifox-helper.syncSelectedApis', () => {
        apiTreeProvider.syncSelected();
    });

    // 注册跳转到定义命令
    let gotoDefinitionDisposable = vscode.commands.registerCommand('apifox-helper.gotoDefinition', (api) => {
        apiTreeProvider.gotoDefinition(api);
    });

    // 注册跳转到标签定义命令
    let gotoTagDefinitionDisposable = vscode.commands.registerCommand('apifox-helper.gotoTagDefinition', (tagItem) => {
        apiTreeProvider.gotoTagDefinition(tagItem);
    });

    // 注册上传到Apifox命令
    let uploadToApifoxDisposable = vscode.commands.registerCommand('apifox-helper.uploadToApifox', (item) => {
        apiTreeProvider.uploadToApifox(item);
    });

    // 注册配置项目Apifox命令 - 打开对应项目的配置文件
    let configureProjectApifoxDisposable = vscode.commands.registerCommand(
        'apifox-helper.configureProjectApifox', 
        async (item: any) => {
            try {
                let projectRootPath = '';
                
                // 从项目节点获取项目根路径
                if (item && item.contextValue === 'project' && item.id) {
                    projectRootPath = item.id.replace('project:', '');
                }
                
                if (projectRootPath) {
                    // 打开指定项目的配置文件
                    await ConfigService.openConfigFileByProject(projectRootPath);
                } else {
                    // 如果没有指定项目，打开第一个工作区的配置
                    await ConfigService.openConfigFile();
                }
            } catch (error) {
                vscode.window.showErrorMessage(`打开配置文件失败: ${error}`);
            }
        }
    );

    // 将所有命令添加到订阅列表
    context.subscriptions.push(generateDocsDisposable);
    context.subscriptions.push(sendRequestDisposable);
    context.subscriptions.push(generateMockDisposable);
    context.subscriptions.push(configureApifoxDisposable);
    context.subscriptions.push(uploadApiDocsDisposable);
    context.subscriptions.push(configureProjectsDisposable);
    context.subscriptions.push(refreshApiListDisposable);
    context.subscriptions.push(toggleSelectApiDisposable);
    context.subscriptions.push(syncSelectedApisDisposable);
    context.subscriptions.push(gotoDefinitionDisposable);
    context.subscriptions.push(gotoTagDefinitionDisposable);
    context.subscriptions.push(uploadToApifoxDisposable);
    context.subscriptions.push(searchApiDisposable);
    context.subscriptions.push(configureProjectApifoxDisposable);
}

export function deactivate() {
    Logger.info('Apifox Helper 扩展已停用');
} 