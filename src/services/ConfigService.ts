import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/Logger.js';

// 项目配置（单项目配置文件格式）
export interface ProjectConfig {
    apiKey: string;           // Apifox API Key
    apifoxProjectId: string;  // Apifox 项目 ID
    projectName: string;      // 项目名称
    apifoxModuleId?: number;  // Apifox模块ID
}

// 全局配置（兼容旧格式，包含多个项目）
export interface ApifoxConfig {
    apiKey: string;
    projects: ProjectConfig[];  // 支持多个项目
    activeProjectIndex?: number;  // 当前活跃项目索引
}

export class ConfigService {
    private static CONFIG_FILE = 'apifox-config.json';

    // 获取 .vscode 配置文件路径，支持指定项目根路径
    private static getConfigPath(projectRootPath?: string): string | null {
        // 如果指定了项目路径，使用该项目的 .vscode 目录
        if (projectRootPath) {
            const vscodePath = path.join(projectRootPath, '.vscode');
            return path.join(vscodePath, this.CONFIG_FILE);
        }
        
        // 否则使用第一个工作区文件夹
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return null;
        }
        const vscodePath = path.join(workspaceFolders[0].uri.fsPath, '.vscode');
        return path.join(vscodePath, this.CONFIG_FILE);
    }
    
    // 根据项目根路径获取对应的配置文件路径
    private static getConfigPathByProject(projectRootPath: string): string {
        const vscodePath = path.join(projectRootPath, '.vscode');
        return path.join(vscodePath, this.CONFIG_FILE);
    }

    // 初始化配置文件（为每个工作区文件夹创建 .vscode 目录和配置文件模板）
    static async initConfigFile(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return;
        }

        // 为每个工作区文件夹创建配置文件
        for (const folder of workspaceFolders) {
            await this.initConfigFileForProject(folder.uri.fsPath);
        }
    }

    // 为指定项目初始化配置文件
    static async initConfigFileForProject(projectRootPath: string): Promise<void> {
        const vscodePath = path.join(projectRootPath, '.vscode');
        const configPath = path.join(vscodePath, this.CONFIG_FILE);

        // 如果配置文件已存在，不覆盖
        if (fs.existsSync(configPath)) {
            return;
        }

        // 确保 .vscode 目录存在
        if (!fs.existsSync(vscodePath)) {
            fs.mkdirSync(vscodePath, { recursive: true });
        }

        // 创建带注释的配置文件模板
        const template = `{
  // Apifox API Key，必填项
  // 获取方式：登录 Apifox -> 个人设置 -> API Keys
  "apiKey": "",

  // Apifox 项目 ID，必填项
  // 获取方式：项目设置 -> 基本信息 -> 项目 ID
  "apifoxProjectId": "",

  // 项目名称，用于显示与Apifox无关
  "projectName": "${path.basename(projectRootPath)}",

  // Apifox 模块 ID，可选
  // 如果不填，接口将导入到默认模块
  "apifoxModuleId": null
}`;

        fs.writeFileSync(configPath, template, 'utf-8');
        Logger.info('[ConfigService] 配置文件已创建:', configPath);
    }

    // 打开配置文件
    static async openConfigFile(): Promise<void> {
        const configPath = this.getConfigPath();
        if (!configPath) {
            vscode.window.showErrorMessage('未找到工作区');
            return;
        }

        // 确保配置文件存在
        if (!fs.existsSync(configPath)) {
            await this.initConfigFile();
        }

        // 打开配置文件
        const document = await vscode.workspace.openTextDocument(configPath);
        await vscode.window.showTextDocument(document);
    }

    // 验证配置是否完整
    static async validateConfig(): Promise<{ valid: boolean; message?: string }> {
        const config = await this.getConfig();
        
        if (!config) {
            return { valid: false, message: '未找到配置文件' };
        }

        if (!config.apiKey || config.apiKey.trim() === '') {
            return { valid: false, message: 'API Key 未配置' };
        }

        if (!config.projects || config.projects.length === 0) {
            return { valid: false, message: '未配置任何项目' };
        }

        // 检查每个项目的配置
        for (const project of config.projects) {
            if (!project.apifoxProjectId || project.apifoxProjectId.trim() === '') {
                return { valid: false, message: `项目 "${project.projectName || '未命名'}" 的项目ID未配置` };
            }
        }

        return { valid: true };
    }

    static async getConfig(): Promise<ApifoxConfig | null> {
        try {
            const configPath = this.getConfigPath();
            if (!configPath) {
                return null;
            }

            if (!fs.existsSync(configPath)) {
                return null;
            }

            const configContent = fs.readFileSync(configPath, 'utf-8');
            // 移除注释后解析 JSON
            const cleanJson = configContent.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
            const config = JSON.parse(cleanJson);
            
            // 兼容旧版本配置格式
            if (config.projectId && !config.projects) {
                return this.migrateOldConfig(config);
            }
            
            return config;
        } catch (error) {
            Logger.error('读取配置失败:', error);
            return null;
        }
    }

    // 迁移旧版本配置
    private static migrateOldConfig(oldConfig: any): ApifoxConfig {
        return {
            apiKey: oldConfig.apiKey,
            projects: [{
                apiKey: oldConfig.apiKey,
                apifoxProjectId: oldConfig.projectId || oldConfig.apifoxProjectId,
                projectName: oldConfig.projectName || 'Spring API Documentation'
            }],
            activeProjectIndex: 0
        };
    }

    static async saveConfig(config: ApifoxConfig): Promise<void> {
        try {
            const configPath = this.getConfigPath();
            if (!configPath) {
                throw new Error('未找到工作区');
            }

            // 确保 .vscode 目录存在
            const vscodePath = path.dirname(configPath);
            if (!fs.existsSync(vscodePath)) {
                fs.mkdirSync(vscodePath, { recursive: true });
            }

            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        } catch (error) {
            Logger.error('保存配置失败:', error);
            throw error;
        }
    }

    static async promptForConfig(): Promise<ApifoxConfig | null> {
        const apiKey = await vscode.window.showInputBox({
            prompt: '请输入Apifox API Key',
            password: true
        });

        if (!apiKey) {
            return null;
        }

        const projectConfig = await this.promptForProjectConfig();
        if (!projectConfig) {
            return null;
        }

        const config: ApifoxConfig = {
            apiKey,
            projects: [projectConfig],
            activeProjectIndex: 0
        };

        // 保存配置
        await this.saveConfig(config);
        return config;
    }

    static async promptForProjectConfig(): Promise<ProjectConfig | null> {
        const apiKey = await vscode.window.showInputBox({
            prompt: '请输入Apifox API Key',
            password: true
        });

        if (!apiKey) {
            return null;
        }

        const projectId = await vscode.window.showInputBox({
            prompt: '请输入Apifox项目ID'
        });

        if (!projectId) {
            return null;
        }

        const projectName = await vscode.window.showInputBox({
            prompt: '请输入项目名称',
            value: 'Spring API Documentation'
        });

        if (!projectName) {
            return null;
        }

        // 可选：输入模块ID
        const moduleIdStr = await vscode.window.showInputBox({
            prompt: '请输入Apifox模块ID（可选，直接回车跳过）',
            placeHolder: '留空表示导入到默认模块'
        });

        let moduleId: number | undefined;
        if (moduleIdStr && moduleIdStr.trim()) {
            moduleId = parseInt(moduleIdStr.trim(), 10);
            if (isNaN(moduleId)) {
                vscode.window.showWarningMessage('模块ID格式不正确，将使用默认模块');
                moduleId = undefined;
            }
        }

        return {
            apiKey,
            apifoxProjectId: projectId,
            projectName,
            apifoxModuleId: moduleId
        };
    }

    static async promptForProjectSelection(projects: ProjectConfig[]): Promise<ProjectConfig | null> {
        if (projects.length === 0) {
            return null;
        }

        if (projects.length === 1) {
            return projects[0];
        }

        const items = projects.map((project, index) => ({
            label: project.projectName,
            description: `项目ID: ${project.apifoxProjectId}`,
            detail: project.apifoxModuleId ? `模块ID: ${project.apifoxModuleId}` : '默认模块',
            project
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: '请选择要上传到的Apifox项目'
        });

        return selected ? selected.project : null;
    }

    static async addProject(config: ApifoxConfig): Promise<ApifoxConfig | null> {
        const projectConfig = await this.promptForProjectConfig();
        if (!projectConfig) {
            return null;
        }

        config.projects.push(projectConfig);
        await this.saveConfig(config);
        return config;
    }

    static async removeProject(config: ApifoxConfig, index: number): Promise<ApifoxConfig> {
        if (index >= 0 && index < config.projects.length) {
            config.projects.splice(index, 1);
            if (config.activeProjectIndex && config.activeProjectIndex >= config.projects.length) {
                config.activeProjectIndex = config.projects.length - 1;
            }
            await this.saveConfig(config);
        }
        return config;
    }

    // 根据项目根路径获取配置（读取该项目目录下的配置文件）
    static async getConfigByProjectRootPath(projectRootPath: string): Promise<ProjectConfig | null> {
        try {
            const configPath = this.getConfigPathByProject(projectRootPath);
            if (!fs.existsSync(configPath)) {
                return null;
            }
            
            const configContent = fs.readFileSync(configPath, 'utf-8');
            // 移除注释后解析 JSON
            const cleanJson = configContent.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
            const config = JSON.parse(cleanJson);
            
            // 兼容旧字段名
            if (config.projectId && !config.apifoxProjectId) {
                config.apifoxProjectId = config.projectId;
            }
            if (config.moduleId && !config.apifoxModuleId) {
                config.apifoxModuleId = config.moduleId;
            }
            
            // 检查必填字段
            if (!config.apiKey || !config.apifoxProjectId) {
                return null;
            }
            
            return config as ProjectConfig;
        } catch (error) {
            Logger.error('读取项目配置失败:', error);
            return null;
        }
    }

    // 保存项目配置到指定项目目录
    static async saveProjectConfig(projectRootPath: string, config: ProjectConfig): Promise<void> {
        try {
            const configPath = this.getConfigPathByProject(projectRootPath);
            const vscodePath = path.dirname(configPath);
            
            // 确保 .vscode 目录存在
            if (!fs.existsSync(vscodePath)) {
                fs.mkdirSync(vscodePath, { recursive: true });
            }

            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        } catch (error) {
            Logger.error('保存项目配置失败:', error);
            throw error;
        }
    }

    // 打开指定项目的配置文件
    static async openConfigFileByProject(projectRootPath: string): Promise<void> {
        const configPath = this.getConfigPathByProject(projectRootPath);

        // 确保配置文件存在
        if (!fs.existsSync(configPath)) {
            await this.initConfigFileForProject(projectRootPath);
        }

        // 打开配置文件
        const document = await vscode.workspace.openTextDocument(configPath);
        await vscode.window.showTextDocument(document);
    }

    // 验证指定项目的配置是否完整
    static async validateProjectConfig(projectRootPath: string): Promise<{ valid: boolean; message?: string }> {
        const config = await this.getConfigByProjectRootPath(projectRootPath);
        
        if (!config) {
            return { valid: false, message: '未找到配置文件或配置为空' };
        }

        if (!config.apiKey || config.apiKey.trim() === '') {
            return { valid: false, message: 'API Key 未配置' };
        }

        if (!config.apifoxProjectId || config.apifoxProjectId.trim() === '') {
            return { valid: false, message: '项目ID未配置' };
        }

        return { valid: true };
    }
}