# 更新日志

## [1.0.0] - 2026-06-16

### 核心功能
- **Spring Boot Controller 解析**: 支持 `@GetMapping`、`@PostMapping`、`@PutMapping`、`@DeleteMapping`、`@RequestMapping` 等注解
- **参数自动提取**: 支持 `@PathVariable`、`@RequestParam`、`@RequestBody` 参数信息提取
- **OpenAPI 文档生成**: 生成 OpenAPI 3.0.1 规范文档
- **Apifox 一键同步**: 支持一键同步 API 文档到 Apifox 平台

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
- **标签定义跳转**: 支持跳转到 Swagger 标签定义位置
- **配置管理命令**: 添加"配置 Apifox 推送"命令，用于管理项目配置

### 技术实现
- **ANTLR4 解析器**: 使用 ANTLR4 进行 Java 语法分析
- **并发扫描**: 支持多项目并发扫描，提升扫描效率
- **配置兼容性**: 完全兼容旧版本配置文件格式

### 命令列表
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

### 快捷键
| 快捷键 | 说明 |
|--------|------|
| `Ctrl+\` | 搜索 API（在 API 列表视图中） |
