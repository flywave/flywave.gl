# 文档组织与维护指南

## 当前文档结构

现在docs目录采用了符合您要求的文档结构，英文为默认语言：

```
docs/                      # 文档根目录
├── README.md             # README英文版本（默认版本）
├── README.zh.md          # README中文版本
├── getting-started/
│   ├── installation.md   # 安装指南英文版本（默认版本）
│   ├── installation.zh.md # 安装指南中文版本
│   ├── usage.md          # 使用指南英文版本（默认版本）
│   ├── usage.zh.md       # 使用指南中文版本
│   ├── examples.md       # 示例代码英文版本（默认版本）
│   └── examples.zh.md    # 示例代码中文版本
└── development/
    ├── setup.md          # 环境搭建英文版本（默认版本）
    ├── setup.zh.md       # 环境搭建中文版本
    ├── guide.md          # 开发指南英文版本（默认版本）
    ├── guide.zh.md       # 开发指南中文版本
    ├── scripts.md        # 开发脚本英文版本（默认版本）
    ├── scripts.zh.md     # 开发脚本中文版本
    ├── build.md          # 构建源码英文版本（默认版本）
    ├── build.zh.md       # 构建源码中文版本
    ├── testing.md        # 测试英文版本（默认版本）
    └── testing.zh.md     # 测试中文版本
```

## 文档维护流程

### 1. 更新现有文档
当您需要更新文档时：
1. 编辑对应的不带语言后缀的文件（英文版本，如 `README.md`）
2. 编辑对应的 `*.zh.md` 文件（中文版本，如 `README.zh.md`）

### 2. 创建新文档
当您需要创建新文档时：
1. 在相应目录下创建 `document-name.md`（英文版本）
2. 在相同目录下创建 `document-name.zh.md`（中文版本）

### 3. 自动同步文档
现在，当您启动或构建文档站点时，系统会自动同步双语文档到Docusaurus的标准多语言结构中，无需手动运行同步命令。

## 实用脚本命令

```bash
# 启动开发服务器（自动同步文档）
pnpm run start

# 启动中文版本开发服务器（自动同步文档）
pnpm run start:zh

# 启动英文版本开发服务器（自动同步文档）
pnpm run start:en

# 构建文档站点（自动同步文档）
pnpm run build

# 构建中文版本文档站点（自动同步文档）
pnpm run build:zh

# 构建英文版本文档站点（自动同步文档）
pnpm run build:en

# 手动同步所有双语文档到对应的多语言结构
pnpm run docs:sync-bilingual

# 手动准备英文文档（将不带语言后缀的文档复制到英文目录）
pnpm run docs:prepare-en

# 手动准备中文文档（将.zh.md文件复制到中文目录）
pnpm run docs:prepare-zh

# 列出所有不带语言后缀的基础文档文件
pnpm run docs:list
```

## 最佳实践

1. **命名规范**：使用不带语言后缀的文件名作为英文文档（默认语言），`*.zh.md` 作为中文文档
2. **自动同步**：使用 `pnpm run start` 或 `pnpm run build` 命令时，文档会自动同步，无需手动运行同步命令
3. **版本控制**：将 `docs/` 目录下的所有文件都纳入版本控制
4. **内容一致性**：确保中英文文档的内容保持同步和一致

## 注意事项

1. `api/` 目录由系统自动生成，无需手动维护
2. 侧边栏配置在 `sidebars.ts` 中引用不带语言后缀的文档ID，Docusaurus会自动根据语言环境选择正确的版本
3. React组件中的文本需要使用 `code.json` 文件进行翻译
4. Docusaurus仍然需要标准的多语言目录结构才能正常工作，但现在这个过程是自动化的