import axios from 'axios';
import { ApiEndpoint } from '../types/index.js';
import { OpenAPIConverter } from '../converters/OpenAPIConverter.js';
import { Logger } from '../utils/Logger.js';

export class ApifoxService {
    private apiKey: string;
    private projectId: string;
    private projectName: string;
    private moduleId?: number;

    constructor(
        apiKey: string, 
        projectId: string, 
        projectName: string = 'Spring API Documentation', 
        moduleId?: number
    ) {
        this.apiKey = apiKey;
        this.projectId = projectId;
        this.projectName = projectName;
        this.moduleId = moduleId;
    }

    async uploadApiDocs(apiDocs: ApiEndpoint[]) {
        try {
            // 转换为OpenAPI 3.0.1格式
            const converter = new OpenAPIConverter(this.projectName);
            const openApiSpec = converter.convert(apiDocs);
            
            const requestBody: any = {
                input: JSON.stringify(openApiSpec),
                options: {}
            };
            
            // 如果指定了模块ID，添加到options中
            if (this.moduleId) {
                requestBody.options.moduleId = this.moduleId;
            }
            
            // 设置默认的覆盖行为
            requestBody.options.endpointOverwriteBehavior = 'OVERWRITE_EXISTING';
            requestBody.options.schemaOverwriteBehavior = 'OVERWRITE_EXISTING';
            
            Logger.info('[ApifoxService] requestBody:', JSON.stringify(requestBody, null, 2));
            
            // 上传到Apifox
            const response = await axios.post(
                `https://api.apifox.com/v1/projects/${this.projectId}/import-openapi`,
                requestBody,
                {
                    headers: {
                        'X-Apifox-Api-Version': '2024-03-28',
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            return response.data;
        } catch (error) {
            Logger.error('上传到Apifox失败:', error);
            throw error;
        }
    }
} 