import * as vscode from 'vscode';

export class Logger {
    private static outputChannel: vscode.OutputChannel;
    private static isInitialized: boolean = false;

    /**
     * 初始化Logger，创建OutputChannel
     * @param context 扩展上下文（可选，用于自动清理）
     */
    static init(context?: vscode.ExtensionContext): void {
        if (this.isInitialized) {
            return;
        }

        this.outputChannel = vscode.window.createOutputChannel('Apifox Helper');
        this.isInitialized = true;

        // 如果提供了context，添加到订阅列表以自动清理
        if (context) {
            context.subscriptions.push(this.outputChannel);
        }
    }

    /**
     * 获取OutputChannel实例
     */
    static getOutputChannel(): vscode.OutputChannel {
        if (!this.isInitialized) {
            this.init();
        }
        return this.outputChannel;
    }

    /**
     * 信息日志
     * @param message 消息内容
     * @param optionalParams 可选参数
     */
    static info(message: string, ...optionalParams: any[]): void {
        this.log('INFO', message, ...optionalParams);
    }

    /**
     * 警告日志
     * @param message 消息内容
     * @param optionalParams 可选参数
     */
    static warn(message: string, ...optionalParams: any[]): void {
        this.log('WARN', message, ...optionalParams);
    }

    /**
     * 错误日志
     * @param message 消息内容
     * @param optionalParams 可选参数
     */
    static error(message: string, ...optionalParams: any[]): void {
        this.log('ERROR', message, ...optionalParams);
    }

    /**
     * 调试日志
     * @param message 消息内容
     * @param optionalParams 可选参数
     */
    static debug(message: string, ...optionalParams: any[]): void {
        this.log('DEBUG', message, ...optionalParams);
    }

    /**
     * 记录日志
     * @param level 日志级别
     * @param message 消息内容
     * @param optionalParams 可选参数
     */
    private static log(level: string, message: string, ...optionalParams: any[]): void {
        if (!this.isInitialized) {
            this.init();
        }

        const timestamp = new Date().toISOString();
        const formattedMessage = this.formatMessage(timestamp, level, message, optionalParams);
        
        this.outputChannel.appendLine(formattedMessage);
    }

    /**
     * 格式化日志消息
     * @param timestamp 时间戳
     * @param level 日志级别
     * @param message 消息内容
     * @param optionalParams 可选参数
     * @returns 格式化后的消息
     */
    private static formatMessage(
        timestamp: string, 
        level: string, 
        message: string, 
        optionalParams: any[]
    ): string {
        let formatted = `[${timestamp}] [${level}] ${message}`;
        
        if (optionalParams.length > 0) {
            const params = optionalParams.map(param => {
                if (typeof param === 'object') {
                    try {
                        return JSON.stringify(param, null, 2);
                    } catch {
                        return String(param);
                    }
                }
                return String(param);
            }).join(' ');
            
            formatted += ` ${params}`;
        }
        
        return formatted;
    }

    /**
     * 显示输出面板
     * @param preserveFocus 是否保持焦点在当前编辑器
     */
    static show(preserveFocus?: boolean): void {
        if (!this.isInitialized) {
            this.init();
        }
        this.outputChannel.show(preserveFocus);
    }

    /**
     * 隐藏输出面板
     */
    static hide(): void {
        if (this.isInitialized) {
            this.outputChannel.hide();
        }
    }

    /**
     * 清空输出面板
     */
    static clear(): void {
        if (this.isInitialized) {
            this.outputChannel.clear();
        }
    }
} 
