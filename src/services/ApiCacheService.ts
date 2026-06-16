import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ApiEndpoint } from '../types/index.js';
import { Logger } from '../utils/Logger.js';

// 缓存数据结构
export interface ApiCacheData {
    version: string;        // 缓存版本号
    timestamp: number;      // 缓存时间戳
    projectRootPath: string; // 项目根路径
    projectName: string;     // 项目名称
    apiEndpoints: ApiEndpoint[]; // API端点列表
}

export class ApiCacheService {
    private static CACHE_FILE = 'apifox-api-cache.json';
    private static CACHE_VERSION = '1.0.0'; // 缓存版本，可用于未来兼容性检查

    // 获取缓存文件路径
    static getCachePath(projectRootPath: string): string {
        const vscodePath = path.join(projectRootPath, '.vscode');
        return path.join(vscodePath, this.CACHE_FILE);
    }

    // 检查缓存是否存在
    static hasCache(projectRootPath: string): boolean {
        const cachePath = this.getCachePath(projectRootPath);
        return fs.existsSync(cachePath);
    }

    // 读取缓存
    static readCache(projectRootPath: string): ApiCacheData | null {
        try {
            const cachePath = this.getCachePath(projectRootPath);
            
            if (!fs.existsSync(cachePath)) {
                Logger.info(`[ApiCacheService] 缓存文件不存在: ${cachePath}`);
                return null;
            }

            const cacheContent = fs.readFileSync(cachePath, 'utf-8');
            const cacheData: ApiCacheData = JSON.parse(cacheContent);
            
            // 验证缓存数据结构
            if (!cacheData.version || !cacheData.timestamp || !cacheData.apiEndpoints) {
                Logger.warn('[ApiCacheService] 缓存数据格式无效');
                return null;
            }

            Logger.info(`[ApiCacheService] 成功读取缓存，包含 ${cacheData.apiEndpoints.length} 个接口`);
            return cacheData;
        } catch (error) {
            Logger.error('[ApiCacheService] 读取缓存失败:', error);
            return null;
        }
    }

    // 保存缓存
    static saveCache(projectRootPath: string, projectName: string, apiEndpoints: ApiEndpoint[]): void {
        try {
            const vscodePath = path.join(projectRootPath, '.vscode');
            const cachePath = this.getCachePath(projectRootPath);

            // 确保 .vscode 目录存在
            if (!fs.existsSync(vscodePath)) {
                fs.mkdirSync(vscodePath, { recursive: true });
            }

            const cacheData: ApiCacheData = {
                version: this.CACHE_VERSION,
                timestamp: Date.now(),
                projectRootPath,
                projectName,
                apiEndpoints
            };

            fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2), 'utf-8');
            Logger.info(`[ApiCacheService] 缓存已保存，包含 ${apiEndpoints.length} 个接口`);
        } catch (error) {
            Logger.error('[ApiCacheService] 保存缓存失败:', error);
            // 缓存保存失败不应该阻断主流程，所以只记录错误不抛出
        }
    }

    // 删除缓存
    static deleteCache(projectRootPath: string): void {
        try {
            const cachePath = this.getCachePath(projectRootPath);
            
            if (fs.existsSync(cachePath)) {
                fs.unlinkSync(cachePath);
                Logger.info(`[ApiCacheService] 缓存已删除: ${cachePath}`);
            }
        } catch (error) {
            Logger.error('[ApiCacheService] 删除缓存失败:', error);
        }
    }

    // 获取缓存时间（用于显示）
    static getCacheAge(projectRootPath: string): string | null {
        const cacheData = this.readCache(projectRootPath);
        if (!cacheData) {
            return null;
        }

        const now = Date.now();
        const ageMs = now - cacheData.timestamp;
        const ageMinutes = Math.floor(ageMs / 60000);
        const ageHours = Math.floor(ageMinutes / 60);
        const ageDays = Math.floor(ageHours / 24);

        if (ageDays > 0) {
            return `${ageDays}天前`;
        } else if (ageHours > 0) {
            return `${ageHours}小时前`;
        } else if (ageMinutes > 0) {
            return `${ageMinutes}分钟前`;
        } else {
            return '刚刚';
        }
    }
}

