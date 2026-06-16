import * as vscode from 'vscode';
import * as path from 'path';
import { ApiEndpoint } from '../types/index.js';
import { SpringControllerParser } from '../parser/SpringControllerParser.js';
import { ApifoxService } from '../services/ApifoxService.js';
import { ConfigService } from '../services/ConfigService.js';

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
        this.apiDocs = [];
        this.selectedApis.clear();
        
        // 设置扫描状态为 true
        this.setScanningContext(true);
        
        const workspaceFolders = vscode.workspace.workspaceFolders;

        console.log('[Refresh] 工作区文件夹数量:', workspaceFolders?.length || 0);

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

        // 3. 先显示顶层目录（标记为loading）
        scanTasks.forEach(task => this.loadingProjects.add(task.rootPath));
        this._onDidChangeTreeData.fire();

        console.log('[Refresh] 开始并发扫描，项目数:', scanTasks.length);

        // 4. 并发扫描所有项目
        const startTime = Date.now();
        const scanPromises = scanTasks.map(async (task) => {
            console.log(`[Refresh] 开始扫描: ${task.projectName}`);
            const parser = new SpringControllerParser(task.sourcePaths, task.projectName, task.rootPath);
            const docs = await parser.parse();
            console.log(`[Refresh] 完成扫描: ${task.projectName}，发现 ${docs.length} 个接口`);
            return { rootPath: task.rootPath, docs };
        });

        const results = await Promise.all(scanPromises);
        const endTime = Date.now();
        console.log(`[Refresh] 并发扫描完成，耗时: ${endTime - startTime}ms`);

        // 5. 合并结果
        for (const result of results) {
            this.apiDocs.push(...result.docs);
            this.loadingProjects.delete(result.rootPath);
        }

        // 6. 再次触发更新，显示最终结果
        this._onDidChangeTreeData.fire();
        this.initialized = true;
        
        // 设置扫描状态为 false
        this.setScanningContext(false);

        console.log('[Refresh] 扫描完成，总接口数:', this.apiDocs.length);
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
            console.log('[Apifox] 开始上传流程');
            console.log('[Apifox] 触发节点:', item.id, 'contextValue:', item.contextValue);

            // 确定项目根路径
            let projectRootPath = '';
            let apisToUpload: ApiEndpoint[] = [];
            let projectName = '';

            if (item.contextValue === 'project') {
                // 项目节点：上传该项目所有接口
                projectRootPath = item.id.replace('project:', '');
                console.log('[Apifox] 项目节点，rootPath:', projectRootPath);
                apisToUpload = this.apiDocs.filter(api => (api.projectRootPath || '未分类项目') === projectRootPath);
                projectName = item.label as string;
            } else if (item.contextValue === 'swaggerTag') {
                // swagger标签节点：上传该标签下所有接口
                const parts = item.id.replace('swaggerTag:', '').split('/');
                projectRootPath = parts[0];
                const swaggerTag = parts.slice(1).join('/');
                console.log('[Apifox] 标签节点，rootPath:', projectRootPath, 'swaggerTag:', swaggerTag);
                apisToUpload = this.apiDocs.filter(api => 
                    (api.projectRootPath || '未分类项目') === projectRootPath &&
                    (api.swaggerTags || api.className || '未分类') === swaggerTag
                );
                projectName = path.basename(projectRootPath);
            } else if (item.contextValue === 'api') {
                // 接口节点：上传单个接口
                const api = this.apiDocs.find(api => api.id === item.id);
                console.log('[Apifox] 接口节点，apiId:', item.id, 'found:', !!api);
                if (api) {
                    apisToUpload = [api];
                    projectRootPath = api.projectRootPath || '';
                    projectName = path.basename(projectRootPath);
                }
            }

            console.log('[Apifox] 待上传接口数量:', apisToUpload.length);
            if (apisToUpload.length > 0) {
                console.log('[Apifox] 前3个接口:', apisToUpload.slice(0, 3).map(a => ({
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
                console.warn('[Apifox] 没有找到要上传的接口');
                return;
            }

            console.log('[Apifox] 项目根路径:', projectRootPath);
            
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

            console.log('[Apifox] 创建ApifoxService，参数:', {
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
                console.log('[Apifox] 接口缺少schemas，尝试从apiDocs[0]获取');
                apisToUpload[0].schemas = this.apiDocs[0]?.schemas;
            }
            
            console.log('[Apifox] 开始调用ApifoxService.uploadApiDocs...');
            const result = await apifoxService.uploadApiDocs(apisToUpload);
            console.log('[Apifox] 上传成功，结果:', result);
            vscode.window.showInformationMessage(`成功上传 ${apisToUpload.length} 个接口到项目: ${projectConfig.projectName}`);
        } catch (error) {
            console.error('[Apifox] 上传失败:', error);
            vscode.window.showErrorMessage(`上传失败: ${error}`);
        }
    }

    async search(text: string) {
        this.searchText = text;
        this._onDidChangeTreeData.fire();
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
