# Apifox Helper

一个功能强大的 VS Code 插件，用于解析 Spring Boot Controller 并生成 OpenAPI 文档，支持多项目配置、三级树结构和一键同步到 Apifox 平台。

## 功能特性

### 核心功能
- **自动解析 Spring Boot Controller**: 支持 `@GetMapping`、`@PostMapping`、`@PutMapping`、`@DeleteMapping`、`@RequestMapping` 等注解
- **参数提取**: 自动提取 `@PathVariable`、`@RequestParam`、`@RequestBody` 参数信息
- **OpenAPI 文档生成**: 生成 OpenAPI 3.0.1 规范文档
- **一键同步**: 支持一键同步 API 文档到 Apifox 平台

### 多项目支持
- **多项目配置**: 支持在工作空间中配置多个项目，每个项目可以独立配置 Apifox 项目 ID 和模块 ID
- **项目级隔离**: 按项目路径解析 Java 接口，解决多项目工作空间的接口整合问题
- **独立配置**: 每个项目可以独立配置 Apifox 推送目标

### 三级树结构
- **项目级别**: 按项目根目录分组显示
- **标签级别**: 按 Swagger 标签（`@Tag`）分组
- **接口级别**: 显示具体的 API 接口

### 其他特性
- **模块 ID 支持**: 支持将接口上传到 Apifox 的指定模块中
- **侧边栏 API 列表**: 支持搜索、分类和快速跳转
- **配置管理**: 支持项目级配置文件（`.vscode/apifox-config.json`）

## 安装

### 从 VS Code 插件市场安装

在 VS Code 插件市场搜索 `JacksonChen.apifox-helper-vs` 并安装。

### 从源码安装

```bash
# 克隆项目
git clone https://github.com/JacksonChen/apifox-helper-vs.git
cd apifox-helper-vs

# 安装依赖
npm install

# 编译
npm run compile

# 打包为 .vsix 文件
npm run package

# 手动安装 .vsix 文件
# 在 VS Code 中按 Ctrl+Shift+P，输入 "Extensions: Install from VSIX..."
```

## 开发调试

```bash
# 安装依赖
npm install

# 编译项目
npm run compile

# 监听模式（开发时使用）
npm run watch
```

在 VS Code 中按 `F5` 启动调试，将打开一个新的扩展开发主机窗口加载插件。

## 使用教程

### 1. 配置 Apifox

首次使用需要配置 Apifox 的 API Key 和项目信息：

#### 方式一：命令配置

1. 按 `Ctrl+Shift+P` 打开命令面板
2. 输入 `Apifox Helper: 配置Apifox推送`
3. 按提示输入：
   - **API Key**: 在 Apifox 个人设置中获取
   - **项目 ID**: Apifox 项目的 ID
   - **项目名称**: 自定义项目名称
   - **模块 ID**:（可选）Apifox 模块 ID

配置将保存在项目根目录的 `.vscode/apifox-config.json` 文件中。

#### 方式二：手动配置

对于多项目工作空间，可以为每个项目单独配置：

1. 在项目根目录创建 `.vscode/apifox-config.json`
2. 配置该项目的 Apifox 推送目标
3. 插件会自动识别并使用项目级配置

```json
{
  "apiKey": "Bearer your-api-key",
  "apifoxProjectId": "your-project-id",
  "projectName": "My Project",
  "apifoxModuleId": 123
}
```

### 2. 查看 API 列表

插件激活后，左侧活动栏会出现 Apifox Helper 图标，点击可查看当前工作区所有解析到的 API 接口。

**三级树结构**:
- **第一级**: 项目名称（按项目根目录分组）
- **第二级**: Swagger 标签（按 `@Tag` 注解分组）
- **第三级**: 具体的 API 接口

**交互功能**:
- 支持搜索功能（搜索路径、方法、描述）
- 点击接口可跳转到代码定义位置
- 支持选择接口进行批量同步
- 右键菜单支持跳转到标签定义

### 3. 上传 API 文档到 Apifox

**方式一：上传全部接口**

1. 按 `Ctrl+Shift+P` 打开命令面板
2. 输入 `Apifox Helper: 上传API文档到Apifox`
3. 如果有多个项目，会弹出项目选择框
4. 等待上传完成

**方式二：选择性同步**

1. 在左侧 API 列表中，点击接口前的选择按钮选中需要同步的接口
2. 点击列表顶部的同步按钮（云上传图标）
3. 等待同步完成

**方式三：按标签同步**

1. 在树视图中右键点击标签节点
2. 选择"上传到 Apifox"
3. 该标签下的所有接口将被同步

### 4. API 分组注解

在 Controller 类上添加 `@Tag` 注解来为 API 分组：

```java
@Tag(name = "用户管理", description = "用户相关接口")
@RestController
@RequestMapping("/api/users")
public class UserController {
    // ...
}
```

### 5. API 描述注解

在方法上添加 `@Operation` 注解，将作为 API 的描述信息：

```java
@Operation(summary = "根据ID获取用户信息", description = "根据用户ID获取用户详细信息")
@GetMapping("/{id}")
public User getUserById(@PathVariable Long id) {
    // ...
}
```

## 支持的注解

### 类级别注解

- `@RestController` - 标识为控制器类
- `@Controller` - 标识为控制器类
- `@RequestMapping` - 类级别的基础路径
- `@Tag` - API 分组标签

### 方法级别注解

- `@GetMapping`
- `@PostMapping`
- `@PutMapping`
- `@DeleteMapping`
- `@RequestMapping`
- `@Operation` - API 操作描述

### 参数注解

- `@PathVariable` - 路径参数
- `@RequestParam` - 查询参数
- `@RequestBody` - 请求体
- `@Parameter` - 参数描述

## 命令列表

| 命令 | 说明 |
|------|------|
| `apifox-helper.refreshApiList` | 刷新 API 列表 |
| `apifox-helper.searchApi` | 搜索 API |
| `apifox-helper.configureProjectApifox` | 配置 Apifox 推送 |
| `apifox-helper.syncSelectedApis` | 同步选中的接口 |
| `apifox-helper.toggleSelectApi` | 选择接口 |
| `apifox-helper.gotoDefinition` | 跳转到定义 |
| `apifox-helper.uploadToApifox` | 上传到 Apifox |
| `apifox-helper.gotoTagDefinition` | 跳转到标签定义 |

## 快捷键

| 快捷键 | 说明 |
|--------|------|
| `Ctrl+\` | 搜索 API（在 API 列表视图中） |

## 项目结构

```
src/
├── extension.ts              # 插件入口
├── parser/                   # Java 解析器（ANTLR4）
│   ├── SpringControllerParser.ts  # Spring Controller 解析器
│   ├── SpringControllerListener.ts # Spring Controller 监听器
│   ├── OpenAPIGenerator.ts        # OpenAPI 文档生成器
│   ├── JavaLexer.ts               # Java 词法分析器
│   ├── JavaParser.ts              # Java 语法分析器
│   ├── JavaParserListener.ts      # Java 解析器监听器
│   ├── JavaParserVisitor.ts       # Java 解析器访问者
│   ├── CommentListener.ts         # 注释监听器
│   └── main.ts                    # 解析器主入口
├── providers/                # VS Code 提供器
│   ├── ApiTreeProvider.ts    # 侧边栏树视图（三级结构）
│   └── ApiDocumentProvider.ts
├── services/                 # 服务层
│   ├── ApifoxService.ts      # Apifox API 调用
│   └── ConfigService.ts      # 配置管理（支持多项目）
├── converters/               # 格式转换器
│   ├── OpenAPIConverter.ts   # OpenAPI 转换
│   └── SwaggerConverter.ts   # Swagger 转换
├── generators/               # 数据生成器
│   └── MockDataGenerator.ts  # Mock 数据生成
└── types/                    # 类型定义
    └── index.ts
```

## 配置文件格式

### 项目级配置

配置文件位于每个项目的 `.vscode/apifox-config.json`，支持以下格式：

```json
{
  "apiKey": "Bearer your-api-key",
  "apifoxProjectId": "your-project-id",
  "projectName": "My Project",
  "apifoxModuleId": 123
}
```

### 字段说明

- `apiKey`: Apifox API Key（必填）
- `apifoxProjectId`: Apifox 项目 ID（必填）
- `projectName`: 项目显示名称（可选）
- `apifoxModuleId`: Apifox 模块 ID（可选）

### 获取配置信息

1. **API Key**: 登录 Apifox -> 个人设置 -> API Keys
2. **项目 ID**: 项目设置 -> 基本信息 -> 项目 ID
3. **模块 ID**: 项目设置 -> 模块管理 -> 选择模块 -> 模块 ID

## 项目地址

- 本项目: https://github.com/JacksonChen/apifox-helper-vs
- 原始项目: https://github.com/wangruchao-github/vs-apifox
- 问题反馈: https://github.com/JacksonChen/apifox-helper-vs/issues

## 许可证

MIT License

本项目基于 [wangruchao-github/vs-apifox](https://github.com/wangruchao-github/vs-apifox) 开发，感谢原作者的贡献。
