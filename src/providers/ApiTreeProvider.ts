import * as vscode from 'vscode';
import * as path from 'path';
import { ApiEndpoint } from '../types/index.js';
import { SpringControllerParser } from '../parser/SpringControllerParser.js';
import { ApifoxService } from '../services/ApifoxService.js';
import { ConfigService } from '../services/ConfigService.js';
import { ApiCacheService } from '../services/ApiCacheService.js';
import { Logger } from '../utils/Logger.js';

export class ApiTreeProvider implements vscode.TreeDataProvider<ApiTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ApiTreeItem | undefined | null | void> = new vscode.EventEmitter<ApiTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ApiTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;
    private apiDocs: ApiEndpoint[] = [];
    private selectedApis: Set<string> = new Set();
    private searchText: string = '';
    private loadingProjects: Set<string> = new Set(); // 正在加载的项目
    private workspacePaths: string[] = []; // 工作区路径列表
    private initialized: boolean = false; // 是否已初始化
    private collapsedProjects: Set<string> = new Set(); // 折叠的项目
    private treeView: vscode.TreeView<ApiTreeItem> | null = null; // 树视图引用

    constructor() {
        this.refresh();
    }

    // 设置树视图引用并监听事件
    setTreeView(treeView: vscode.TreeView<ApiTreeItem>) {
        this.treeView = treeView;
        
        // 监听折叠事件
        treeView.onDidCollapseElement(event => {
            const element = event.element;
            if (element.contextValue === 'project' && element.id) {
                const rootPath = element.id.replace('project:', '');
                this.collapsedProjects.add(rootPath);
                // 刷新子节点以应用折叠状态
                this._onDidChangeTreeData.fire(element);
            }
        });
        
        // 监听展开事件
        treeView.onDidExpandElement(event => {
            const element = event.element;
            if (element.contextValue === 'project' && element.id) {
                const rootPath = element.id.replace('project:', '');
                this.collapsedProjects.delete(rootPath);
                // 刷新子节点以应用展开状态
                this._onDidChangeTreeData.fire(element);
            }
        });
    }

    // 设置扫描状态上下文
    private setScanningContext(isScanning: boolean) {
        vscode.commands.executeCommand('setContext', 'apifox-helper.isScanning', isScanning);
    }

    getTreeItem(element: ApiTreeItem): vscode.TreeItem {
        return element;
    }

    getParent(element: ApiTreeItem): vscode.ProviderResult<ApiTreeItem> {
        // 根据元素的contextValue和id推断父元素
        if (element.contextValue === 'api') {
            // API节点的父元素是swagger标签节点
            const api = this.apiDocs.find(api => api.id === element.id);
            if (api) {
                const projectRootPath = api.projectRootPath || '未分类项目';
                const swaggerTag = api.swaggerTags || api.className || '未分类';
                return new ApiTreeItem(
                    swaggerTag,
                    `swaggerTag:${projectRootPath}/${swaggerTag}`,
                    vscode.TreeItemCollapsibleState.Expanded,
                    'swaggerTag'
                );
            }
        } else if (element.contextValue === 'swaggerTag') {
            // swagger标签节点的父元素是项目节点
            const parts = element.id.replace('swaggerTag:', '').split('/');
            const rootPath = parts[0];
            return new ApiTreeItem(
                path.basename(rootPath),
                `project:${rootPath}`,
                vscode.TreeItemCollapsibleState.Expanded,
                'project'
            );
        }
        // 项目节点没有父元素
        return undefined;
    }

    getChildren(element?: ApiTreeItem): Thenable<ApiTreeItem[]> {
        let apis = this.apiDocs;
        if (this.searchText) {
            apis = this.filterApis(apis);
        }

        if (!element) {
            // 根节点：显示项目根目录文件夹名（单/多项目统一逻辑）
            const projectRootPaths = new Set<string>();
            
            // 添加已有API的项目路径
            apis.forEach(api => projectRootPaths.add(api.projectRootPath || '未分类项目'));
            
            // 添加正在加载的项目路径
            this.loadingProjects.forEach(path => projectRootPaths.add(path));
            
            // 添加工作区路径（如果还没有API数据）
            if (projectRootPaths.size === 0 && this.workspacePaths.length > 0) {
                this.workspacePaths.forEach(path => projectRootPaths.add(path));
            }

            return Promise.resolve(Array.from(projectRootPaths).map(rootPath => {
                const projectApis = apis.filter(api => (api.projectRootPath || '未分类项目') === rootPath);
                const folderName = path.basename(rootPath);
                const isLoading = this.loadingProjects.has(rootPath);
                const allSelected = projectApis.length > 0 && projectApis.every(api => this.selectedApis.has(api.id));
                return new ApiTreeItem(
                    isLoading ? `${folderName} (扫描中...)` : folderName,
                    `project:${rootPath}`,
                    vscode.TreeItemCollapsibleState.Expanded,
                    'project',
                    undefined,
                    projectApis.length,
                    allSelected,
                    undefined,
                    isLoading
                );
            }));
        } else if (element.contextValue === 'project') {
            // 如果正在加载，显示loading节点
            const rootPath = element.id.replace('project:', '');
            if (this.loadingProjects.has(rootPath)) {
                return Promise.resolve([new ApiTreeItem(
                    '正在扫描接口...',
                    `loading:${rootPath}`,
                    vscode.TreeItemCollapsibleState.None,
                    'loading',
                    undefined,
                    undefined,
                    false,
                    undefined,
                    true
                )]);
            }
            
            // 项目节点：显示swagger标签聚合（第二层）
            const projectApis = apis.filter(api => (api.projectRootPath || '未分类项目') === rootPath);
            return Promise.resolve(this.getSwaggerTagItems(projectApis, rootPath));
        } else if (element.contextValue === 'swaggerTag') {
            // swagger标签节点：直接显示接口（第三层）
            const parts = element.id.replace('swaggerTag:', '').split('/');
            const rootPath = parts[0];
            const swaggerTag = parts.slice(1).join('/');
            const tagApis = apis.filter(api => 
                (api.projectRootPath || '未分类项目') === rootPath &&
                (api.swaggerTags || api.className || '未分类') === swaggerTag
            );
            return Promise.resolve(tagApis.map(api => {
                // 创建跳转命令
                const gotoCommand: vscode.Command = {
                    command: 'apifox-helper.gotoDefinition',
                    title: '跳转到定义',
                    arguments: [api]
                };
                return new ApiTreeItem(
                    `${api.method.toUpperCase()} ${api.description || api.path}`,
                    api.id,
                    vscode.TreeItemCollapsibleState.None,
                    'api',
                    gotoCommand,
                    undefined,
                    this.selectedApis.has(api.id),
                    api.path
                );
            }));
        }
        return Promise.resolve([]);
    }

    private filterApis(apis: ApiEndpoint[]): ApiEndpoint[] {
        return apis.filter(api =>
            api.path.toLowerCase().includes(this.searchText.toLowerCase()) ||
            api.method.toLowerCase().includes(this.searchText.toLowerCase()) ||
            api.description?.toLowerCase().includes(this.searchText.toLowerCase()) ||
            api.swaggerTags?.toLowerCase().includes(this.searchText.toLowerCase()) ||
            api.className?.toLowerCase().includes(this.searchText.toLowerCase())
        );
    }

    // 获取swagger标签聚合节点
    private getSwaggerTagItems(apis: ApiEndpoint[], rootPath: string): ApiTreeItem[] {
        // 优先使用swagger标签，没有则使用类名
        const tagMap = new Map<string, ApiEndpoint[]>();
        for (const api of apis) {
            const tag = api.swaggerTags || api.className || '未分类';
            if (!tagMap.has(tag)) {
                tagMap.set(tag, []);
            }
            tagMap.get(tag)!.push(api);
        }

        // 检查项目是否折叠
        const isProjectCollapsed = this.collapsedProjects.has(rootPath);

        return Array.from(tagMap.entries()).map(([tag, tagApis]) => {
            const allSelected = tagApis.every(api => this.selectedApis.has(api.id));
            const folderId = `swaggerTag:${rootPath}/${tag}`;
            return new ApiTreeItem(
                tag,
                folderId,
                isProjectCollapsed ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded,
                'swaggerTag',
                undefined,
                tagApis.length,
                allSelected
            );
        });
    }

    async refresh(): Promise<void> {
        this.selectedApis.clear();
        
        // 设置扫描状态为 true
        this.setScanningContext(true);
        
        const workspaceFolders = vscode.workspace.workspaceFolders;

        Logger.info('[Refresh] 工作区文件夹数量:', workspaceFolders?.length || 0);

        // 收集所有待扫描的项目
        const scanTasks: { rootPath: string; sourcePaths: string[]; projectName: string }[] = [];

        // 遍历所有工作区文件夹，读取每个项目的配置
        if (workspaceFolders && workspaceFolders.length > 0) {
            this.workspacePaths = workspaceFolders.map(f => f.uri.fsPath);
            
            for (const folder of workspaceFolders) {
                const projectRootPath = folder.uri.fsPath;
                // 尝试读取该项目的配置文件
                const projectConfig = await ConfigService.getConfigByProjectRootPath(projectRootPath);
                
                let projectName = folder.name; // 默认使用文件夹名
                if (projectConfig && projectConfig.projectName) {
                    projectName = projectConfig.projectName;
                }
                
                scanTasks.push({
                    rootPath: projectRootPath,
                    sourcePaths: [projectRootPath],
                    projectName
                });
            }
        } else if (scanTasks.length === 0) {
            // 无工作区文件夹，使用默认扫描
            scanTasks.push({
                rootPath: '默认项目',
                sourcePaths: [],
                projectName: '默认项目'
            });
        }

        // 1. 尝试从缓存加载数据（快速显示）
        const cachedApis: ApiEndpoint[] = [];
        
        for (const task of scanTasks) {
            if (task.rootPath !== '默认项目' && ApiCacheService.hasCache(task.rootPath)) {
                const cacheData = ApiCacheService.readCache(task.rootPath);
                if (cacheData && cacheData.apiEndpoints) {
                    cachedApis.push(...cacheData.apiEndpoints);
                    Logger.info(`[Refresh] 从缓存加载 ${task.projectName}，包含 ${cacheData.apiEndpoints.length} 个接口`);
                } else {
                    // 缓存读取失败，标记为loading
                    this.loadingProjects.add(task.rootPath);
                }
            } else {
                // 没有缓存的项目，标记为loading
                this.loadingProjects.add(task.rootPath);
            }
        }

        // 设置API数据并显示
        this.apiDocs = cachedApis;
        this._onDidChangeTreeData.fire();
        
        if (cachedApis.length > 0) {
            Logger.info('[Refresh] 缓存数据已显示，后台继续扫描更新');
        } else {
            Logger.info('[Refresh] 无缓存数据，显示loading状态');
        }

        Logger.info('[Refresh] 开始后台扫描，项目数:', scanTasks.length);

        // 2. 后台异步扫描（不阻塞UI）
        this.backgroundScan(scanTasks);
    }

    // 后台扫描方法
    private async backgroundScan(scanTasks: { rootPath: string; sourcePaths: string[]; projectName: string }[]): Promise<void> {
        try {
            const startTime = Date.now();
            
            // 并发扫描所有项目
            const scanPromises = scanTasks.map(async (task) => {
                Logger.info(`[BackgroundScan] 开始扫描: ${task.projectName}`);
                const parser = new SpringControllerParser(task.sourcePaths, task.projectName, task.rootPath);
                const docs = await parser.parse();
                Logger.info(`[BackgroundScan] 完成扫描: ${task.projectName}，发现 ${docs.length} 个接口`);
                
                // 保存缓存（非默认项目）
                if (task.rootPath !== '默认项目') {
                    ApiCacheService.saveCache(task.rootPath, task.projectName, docs);
                }
                
                return { rootPath: task.rootPath, docs };
            });

            const results = await Promise.all(scanPromises);
            const endTime = Date.now();
            Logger.info(`[BackgroundScan] 后台扫描完成，耗时: ${endTime - startTime}ms`);

            // 合并结果
            this.apiDocs = [];
            for (const result of results) {
                this.apiDocs.push(...result.docs);
                this.loadingProjects.delete(result.rootPath);
            }

            // 触发更新，显示最新结果
            this._onDidChangeTreeData.fire();
            this.initialized = true;
            
            // 设置扫描状态为 false
            this.setScanningContext(false);

            Logger.info('[BackgroundScan] 扫描完成，总接口数:', this.apiDocs.length);
        } catch (error) {
            Logger.error('[BackgroundScan] 后台扫描失败:', error);
            this.setScanningContext(false);
        }
    }

    toggleSelect(api: ApiEndpoint | any) {
        if (api.contextValue === 'project') {
            // 处理项目选择
            const rootPath = api.id.replace('project:', '');
            const projectApis = this.apiDocs.filter(a => (a.projectRootPath || '未分类项目') === rootPath);
            const allSelected = projectApis.every(a => this.selectedApis.has(a.id));

            if (allSelected) {
                projectApis.forEach(a => this.selectedApis.delete(a.id));
            } else {
                projectApis.forEach(a => this.selectedApis.add(a.id));
            }
        } else if (api.contextValue === 'swaggerTag') {
            // 处理swagger标签选择（直接包含接口）
            const parts = api.id.replace('swaggerTag:', '').split('/');
            const rootPath = parts[0];
            const swaggerTag = parts.slice(1).join('/');
            const tagApis = this.apiDocs.filter(a => 
                (a.projectRootPath || '未分类项目') === rootPath &&
                (a.swaggerTags || a.className || '未分类') === swaggerTag
            );
            const allSelected = tagApis.every(a => this.selectedApis.has(a.id));

            if (allSelected) {
                tagApis.forEach(a => this.selectedApis.delete(a.id));
            } else {
                tagApis.forEach(a => this.selectedApis.add(a.id));
            }
        } else {
            // 处理单个API选择
            if (this.selectedApis.has(api.id)) {
                this.selectedApis.delete(api.id);
            } else {
                this.selectedApis.add(api.id);
            }
        }
        this._onDidChangeTreeData.fire();
    }

    async syncSelected() {
        try {
            if (this.selectedApis.size === 0) {
                vscode.window.showWarningMessage('请先选择要同步的接口');
                return;
            }

            const selectedApis = this.apiDocs.filter(api =>
                this.selectedApis.has(`${api.id}`)
            );

            if (selectedApis.length === 0) {
                vscode.window.showWarningMessage('未找到选中的接口');
                return;
            }

            // 根据选中的接口确定项目根路径
            const firstApi = selectedApis[0];
            const projectRootPath = firstApi.projectRootPath || '';
            
            if (!projectRootPath) {
                vscode.window.showWarningMessage('无法确定项目路径');
                return;
            }
            
            // 检查该项目的配置是否完整
            const validation = await ConfigService.validateProjectConfig(projectRootPath);
            if (!validation.valid) {
                const result = await vscode.window.showWarningMessage(
                    `配置不完整: ${validation.message}，是否现在配置？`,
                    '确定',
                    '取消'
                );
                if (result === '确定') {
                    await ConfigService.openConfigFileByProject(projectRootPath);
                }
                return;
            }

            // 获取该项目的配置
            const projectConfig = await ConfigService.getConfigByProjectRootPath(projectRootPath);
            if (!projectConfig) {
                return;
            }

            const apifoxService = new ApifoxService(
                projectConfig.apiKey,
                projectConfig.apifoxProjectId,
                projectConfig.projectName,
                projectConfig.apifoxModuleId
            );
            
            if (selectedApis.length > 0) {
                selectedApis[0].schemas = this.apiDocs[0].schemas;
            }
            
            await apifoxService.uploadApiDocs(selectedApis);
            vscode.window.showInformationMessage(`成功同步 ${selectedApis.length} 个接口到项目: ${projectConfig.projectName}`);
            this.selectedApis.clear();
            this._onDidChangeTreeData.fire();
        } catch (error) {
            vscode.window.showErrorMessage(`同步失败: ${error}`);
        }
    }

    async gotoDefinition(apiItem: ApiTreeItem) {
        try {
            const api = this.apiDocs.find(api => api.id === apiItem.id);
            if (!api) {
                vscode.window.showErrorMessage('找不到对应的API');
                return;
            }

            if (!api.location.filePath) {
                vscode.window.showErrorMessage('API定义位置信息不完整');
                return;
            }

            const document = await vscode.workspace.openTextDocument(api.location.filePath);
            const position = new vscode.Position(api.location.line - 1, api.location.character);
            const selection = new vscode.Selection(position, position);
            
            const editor = await vscode.window.showTextDocument(document);
            editor.selection = selection;
            editor.revealRange(selection, vscode.TextEditorRevealType.InCenter);
        } catch (error) {
            vscode.window.showErrorMessage(`无法打开文件: ${error}`);
        }
    }

    async gotoTagDefinition(tagItem: ApiTreeItem) {
        try {
            const parts = tagItem.id.replace('swaggerTag:', '').split('/');
            const rootPath = parts[0];
            const swaggerTag = parts.slice(1).join('/');
            
            // 查找该标签下的第一个接口
            const tagApi = this.apiDocs.find(api => 
                (api.projectRootPath || '未分类项目') === rootPath &&
                (api.swaggerTags || api.className || '未分类') === swaggerTag
            );
            
            if (!tagApi) {
                vscode.window.showErrorMessage('找不到该标签对应的接口');
                return;
            }
            
            // 跳转到第一个接口的位置
            await this.gotoDefinition({ id: tagApi.id } as ApiTreeItem);
        } catch (error) {
            vscode.window.showErrorMessage(`无法跳转: ${error}`);
        }
    }

    async uploadToApifox(item: ApiTreeItem) {
        try {
            Logger.info('[Apifox] 开始上传流程');
            Logger.info('[Apifox] 触发节点:', item.id, 'contextValue:', item.contextValue);

            // 确定项目根路径
            let projectRootPath = '';
            let apisToUpload: ApiEndpoint[] = [];
            let projectName = '';

            if (item.contextValue === 'project') {
                // 项目节点：上传该项目所有接口
                projectRootPath = item.id.replace('project:', '');
                Logger.info('[Apifox] 项目节点，rootPath:', projectRootPath);
                apisToUpload = this.apiDocs.filter(api => (api.projectRootPath || '未分类项目') === projectRootPath);
                projectName = item.label as string;
            } else if (item.contextValue === 'swaggerTag') {
                // swagger标签节点：上传该标签下所有接口
                const parts = item.id.replace('swaggerTag:', '').split('/');
                projectRootPath = parts[0];
                const swaggerTag = parts.slice(1).join('/');
                Logger.info('[Apifox] 标签节点，rootPath:', projectRootPath, 'swaggerTag:', swaggerTag);
                apisToUpload = this.apiDocs.filter(api => 
                    (api.projectRootPath || '未分类项目') === projectRootPath &&
                    (api.swaggerTags || api.className || '未分类') === swaggerTag
                );
                projectName = path.basename(projectRootPath);
            } else if (item.contextValue === 'api') {
                // 接口节点：上传单个接口
                const api = this.apiDocs.find(api => api.id === item.id);
                Logger.info('[Apifox] 接口节点，apiId:', item.id, 'found:', !!api);
                if (api) {
                    apisToUpload = [api];
                    projectRootPath = api.projectRootPath || '';
                    projectName = path.basename(projectRootPath);
                }
            }

            Logger.info('[Apifox] 待上传接口数量:', apisToUpload.length);
            if (apisToUpload.length > 0) {
                Logger.info('[Apifox] 前3个接口:', apisToUpload.slice(0, 3).map(a => ({
                    id: a.id,
                    path: a.path,
                    method: a.method,
                    swaggerTags: a.swaggerTags,
                    className: a.className,
                    projectRootPath: a.projectRootPath
                })));
            }

            if (apisToUpload.length === 0) {
                vscode.window.showWarningMessage('没有找到要上传的接口');
                Logger.warn('[Apifox] 没有找到要上传的接口');
                return;
            }

            Logger.info('[Apifox] 项目根路径:', projectRootPath);
            
            // 检查该项目的配置是否完整
            const validation = await ConfigService.validateProjectConfig(projectRootPath);
            if (!validation.valid) {
                const result = await vscode.window.showWarningMessage(
                    `配置不完整: ${validation.message}，是否现在配置？`,
                    '确定',
                    '取消'
                );
                if (result === '确定') {
                    await ConfigService.openConfigFileByProject(projectRootPath);
                }
                return;
            }

            // 获取该项目的配置
            const projectConfig = await ConfigService.getConfigByProjectRootPath(projectRootPath);
            if (!projectConfig) {
                return;
            }

            Logger.info('[Apifox] 创建ApifoxService，参数:', {
                apiKey: projectConfig.apiKey ? projectConfig.apiKey.substring(0, 10) + '...' : 'undefined',
                projectId: projectConfig.apifoxProjectId,
                projectName: projectConfig.projectName,
                moduleId: projectConfig.apifoxModuleId
            });

            const apifoxService = new ApifoxService(
                projectConfig.apiKey,
                projectConfig.apifoxProjectId,
                projectConfig.projectName,
                projectConfig.apifoxModuleId
            );
            
            // 确保有schemas信息
            if (apisToUpload.length > 0 && !apisToUpload[0].schemas) {
                Logger.info('[Apifox] 接口缺少schemas，尝试从apiDocs[0]获取');
                apisToUpload[0].schemas = this.apiDocs[0]?.schemas;
            }
            
            Logger.info('[Apifox] 开始调用ApifoxService.uploadApiDocs...');
            const result = await apifoxService.uploadApiDocs(apisToUpload);
            Logger.info('[Apifox] 上传成功，结果:', result);
            vscode.window.showInformationMessage(`成功上传 ${apisToUpload.length} 个接口到项目: ${projectConfig.projectName}`);
        } catch (error) {
            Logger.error('[Apifox] 上传失败:', error);
            vscode.window.showErrorMessage(`上传失败: ${error}`);
        }
    }

    async search(text: string) {
        this.searchText = text;
        this._onDidChangeTreeData.fire();
    }

    // 获取所有API数据（用于搜索建议）
    getApis(): ApiEndpoint[] {
        return this.apiDocs;
    }

    // 聚焦树视图中的特定API
    async focusApi(apiId: string) {
        if (!this.treeView) {
            Logger.warn('[FocusApi] 树视图未初始化');
            return;
        }

        // 查找API
        const api = this.apiDocs.find(api => api.id === apiId);
        if (!api) {
            Logger.warn('[FocusApi] 未找到API:', apiId);
            return;
        }

        Logger.info('[FocusApi] 开始聚焦API:', api.path, api.method);

        // 清除搜索文本以显示所有项目
        this.searchText = '';
        this._onDidChangeTreeData.fire();

        // 等待树视图更新完成
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 构建路径：项目节点 -> swagger标签节点 -> API节点
        const projectRootPath = api.projectRootPath || '未分类项目';
        const swaggerTag = api.swaggerTags || api.className || '未分类';

        try {
            // 获取所有项目节点
            const projectItems = await this.getChildren(undefined);
            const projectItem = projectItems.find(item => item.id === `project:${projectRootPath}`);
            
            if (projectItem) {
                // 获取该项目下的所有swagger标签节点
                const tagItems = await this.getChildren(projectItem);
                const tagItem = tagItems.find(item => item.id === `swaggerTag:${projectRootPath}/${swaggerTag}`);
                
                if (tagItem) {
                    // 获取该标签下的所有API节点
                    const apiItems = await this.getChildren(tagItem);
                    const apiItem = apiItems.find(item => item.id === apiId);
                    
                    if (apiItem) {
                        Logger.info('[FocusApi] 找到完整路径，开始reveal');
                        // 使用路径形式reveal
                        await this.treeView.reveal(apiItem, { 
                            select: true, 
                            focus: true, 
                            expand: true 
                        });
                        Logger.info('[FocusApi] reveal成功');
                    } else {
                        Logger.warn('[FocusApi] 未找到API节点:', apiId);
                    }
                } else {
                    Logger.warn('[FocusApi] 未找到swagger标签节点:', swaggerTag);
                }
            } else {
                Logger.warn('[FocusApi] 未找到项目节点:', projectRootPath);
            }
        } catch (error) {
            Logger.error('[FocusApi] reveal失败:', error);
        }
    }

    // 查找API对应的树项目（递归搜索）
    private async findTreeItemByApiId(apiId: string): Promise<ApiTreeItem | undefined> {
        // 获取根节点
        const rootItems = await this.getChildren(undefined);
        
        // 递归搜索每个根节点
        for (const rootItem of rootItems) {
            const found = await this.searchInTreeItem(rootItem, apiId);
            if (found) {
                return found;
            }
        }
        
        return undefined;
    }

    // 在树项目及其子节点中搜索
    private async searchInTreeItem(treeItem: ApiTreeItem, apiId: string): Promise<ApiTreeItem | undefined> {
        // 检查当前节点是否匹配
        if (treeItem.id === apiId) {
            return treeItem;
        }

        // 如果当前节点是可折叠的，搜索其子节点
        if (treeItem.collapsibleState !== vscode.TreeItemCollapsibleState.None) {
            const children = await this.getChildren(treeItem);
            for (const child of children) {
                const found = await this.searchInTreeItem(child, apiId);
                if (found) {
                    return found;
                }
            }
        }

        return undefined;
    }
}

class ApiTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly id: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly contextValue: string,
        public readonly command?: vscode.Command,
        public readonly childCount?: number,
        public readonly checked?: boolean,
        description?: string,
        public readonly loading?: boolean
    ) {
        super(label, collapsibleState);
        
        this.resourceUri = vscode.Uri.parse(`apifox-helper:${label}`);
        this.tooltip = description || label;
        this.description = description || (childCount !== undefined ? `(${childCount})` : '');
        
        if (loading) {
            this.iconPath = new vscode.ThemeIcon('loading~spin');
        } else if (contextValue === 'project') {
            this.iconPath = new vscode.ThemeIcon('package');
        } else if (contextValue === 'swaggerTag') {
            this.iconPath = new vscode.ThemeIcon('folder');
        } else {
            this.iconPath = new vscode.ThemeIcon(checked ? 'check' : 'circle-outline');
        }

        // 添加右侧按钮
        this.contextValue = contextValue;
    }
}
