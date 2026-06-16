export interface ApiEndpoint {
    id: string;
    path: string;
    method: string;
    description?: string;
    parameters: ApiParameter[];
    responseType?: string;
    apifoxFolder: string;
    swaggerTags?: string;   // 新增：swagger标签
    className?: string;     // 新增：类名
    projectRootPath?: string; // 新增：项目根目录路径
    projectName?: string;
    location: {
        filePath: string;
        line: number;
        character: number;
    };
    responses: any;
    schemas?: any;
    requestBody?: any;
    contextValue?: string;
}

export interface ApiParameter {
    name: string;
    parameterType: string;
    type: string;
    required: boolean;
    description?: string;
    object?: object;
}

export interface MockRule {
    fieldName: string;
    fieldType: string;
    rule: string;
} 

export interface Definition {
    type: string;
    properties: {
        [key: string]: {
            type: string;
            format?: string;
            description?: string;
        };
    };
    xml?: {
        name: string;
    };
}

export interface Definitions {
    [key: string]: Definition;
}

export interface ProjectConfig {
    apifoxProjectId: string;
    projectName: string;
    apifoxModuleId?: number;
    sourcePaths?: string[];
    projectRootPath?: string; // 新增：项目根路径
}

export interface ApifoxConfig {
    apiKey: string;
    projects: ProjectConfig[];
    activeProjectIndex?: number;
}
