# playbook-sync（pbs）

**把任意 AI 知识库一键同步到所有项目，并支持将项目内的改动贡献回知识库。**

只需提供一个 git 仓库链接，`pbs` 即可将其中的 skills、rules、AGENTS.md 分发到你项目中所用的全部 AI 工具目录，并在格式上自动适配 **OpenCode、Cursor、GitHub Copilot、Claude Code** 等。

---

## 快速开始（推荐：配合 AI 使用）

**方式 1（推荐）：直接给 AI 去配置**

1. 打开 [`PLAYBOOK_SYNC_PROMPT.md`](./PLAYBOOK_SYNC_PROMPT.md)
2. 将全文复制，发给任意 AI 助手（OpenCode、Cursor、Claude 等）
3. 告诉 AI 你想做什么（如"帮我初始化 playbook-sync"、"同步最新的知识库"等）
4. AI 会自动给出完整的命令和操作步骤

**方式 2：手动配置**

见下文[命令详解](#命令详解)与[快速上手](#快速上手)。

---

## 为什么需要它

### 痛点

| 问题 | 说明 |
|------|------|
| 知识分散 | 每个项目各自维护 AI 规则，更新不同步、质量参差不齐 |
| 多工具适配 | OpenCode、Cursor、Copilot 的配置路径和格式各不相同，手动维护极易出错 |
| 贡献难回流 | 某个项目改进了某条 skill，但改进很难同步回共享知识库 |
| 无版本追踪 | 不知道项目同步的是哪个版本，也不知道是否有人改动过 |

### 解法

```
             ┌────────────────────────────────┐
             │   你的 AI 知识库（任意 git 仓库）│
             │   skills/ rules/ AGENTS.md      │
             └──────────┬─────────────▲────────┘
                        │  pbs sync   │  pbs contribute
                        ▼             │
             ┌────────────────────────────────┐
             │      你的项目                  │
             │  .opencode/skills/  ← OpenCode  │
             │  .cursor/rules/     ← Cursor    │
             │  playbook-sync.yaml（配置）      │
             │  playbook-sync.lock.yaml（锁）   │
             └────────────────────────────────┘
```

**一个命令同步，一个命令贡献回流。** 全程有 lockfile 记录版本，团队成员同步环境完全一致。

---

## 核心优点

### 1. 任意知识库，一个 git 链接搞定

只要知识库遵循[兼容格式](#兼容的知识库格式)，直接传入 git URL 即可：

```bash
pbs add https://github.com/your-org/your-playbook.git
pbs sync
```

支持三种来源类型：

| 来源类型 | 适用场景 |
|---------|---------|
| `git` URL | 生产环境推荐，自动 clone/fetch |
| `local` 本地路径 | 本地开发调试知识库时 |
| `submodule` | 已将知识库作为 git submodule 引入的项目 |

### 2. 多工具自动适配，格式无需手动转换

| AI 工具 | 输出路径 | 格式处理 |
|---------|---------|---------|
| OpenCode | `.opencode/skills/<name>/SKILL.md` | 原样复制 |
| Cursor | `.cursor/rules/<name>.mdc` | 自动添加 `.mdc` frontmatter |
| GitHub Copilot | `.github/copilot-instructions.md` | 合并写入单文件 |
| Claude Code | `.claude/skills/<name>/SKILL.md` | 原样复制 |

### 3. 贡献回流是一等公民

在项目内修改了某个 skill？pbs 能检测变化并复制回知识库，还可以一键建分支、提交、push，直接发起 PR：

```bash
pbs contribute --push --branch "fix/xxx" --message "fix: 修正示例代码"
```

### 4. Lockfile 保证版本一致性

每次 `pbs sync` 自动更新 `playbook-sync.lock.yaml`，记录每个文件的 SHA-256 校验和与 git commit hash。将 lockfile 提交到项目仓库，团队所有成员运行 `pbs sync` 后得到完全一致的内容。

### 5. Watch 模式，改知识库立即看效果

```bash
pbs watch   # 修改知识库文件后项目目录立即自动更新
```

---

## 安装

```bash
# 全局安装（推荐）
npm install -g playbook-sync

# 或直接用 npx 运行（无需安装）
npx playbook-sync <命令>
```

**系统要求：** Node.js >= 18，Git

---

## 兼容的知识库格式

pbs 会自动扫描来源仓库中以下内容：

| 路径模式 | 说明 |
|---------|------|
| `skills/*/SKILL.md` | 核心技能文件，每个子目录一个 skill |
| `rules/**/*.md` | 规则文档 |
| `docs/**/*.md` | 架构/说明文档 |
| `AGENTS.md` | 代理角色定义 |
| `README.md` | 项目说明 |

**最小兼容结构示例：**

```
your-playbook/
├── skills/
│   ├── skill-name-a/
│   │   └── SKILL.md        ← 每个 skill 必须有 SKILL.md
│   └── skill-name-b/
│       └── SKILL.md
├── rules/
│   └── coding-style.md
└── AGENTS.md
```

**SKILL.md 标准格式（frontmatter + 正文）：**

```markdown
---
name: skill-name-a
description: 一句话说明何时使用该 skill
tags: [标签1, 标签2]
inputs: [输入参数描述]
outputs: [输出结果描述]
---

# 技能标题

## 概述

正文内容...
```

> 只要有 `skills/*/SKILL.md` 结构，pbs 就可以同步。`rules/`、`docs/`、`AGENTS.md` 均为可选。

---

## 快速上手（手动模式）

```bash
# 1. 在你的项目中初始化
cd my-project
pbs init

# 2. 添加知识库来源（填入你的知识库 git 链接）
pbs add https://github.com/your-org/your-playbook.git

# 也可以用本地路径
pbs add --local ../your-playbook

# 3. 同步到所有已启用的 AI 工具目录
pbs sync

# 4. 查看同步状态
pbs status

# 5. 开发知识库时，启动 watch 模式自动同步
pbs watch
```

**首次 sync 输出示例：**

```
ℹ Starting sync...

ℹ Syncing source: your-playbook
→ Cloning https://github.com/your-org/your-playbook.git...
✓ Resolved git source "your-playbook" at a1b2c3d4
✓   OpenCode: 12 files → .opencode/skills
✓   Cursor: 12 .mdc files → .cursor/rules
✓ Lockfile updated.

ℹ Sync complete:
  your-playbook @a1b2c3d4 → 24 files → [opencode, cursor]
```

---

## 命令详解

### `pbs init`

在当前目录创建 `playbook-sync.yaml` 配置文件，包含默认 targets 设置。只需运行一次。

---

### `pbs add <来源>`

添加一个知识库来源。

```bash
pbs add <git-url 或本地路径> [选项]
```

| 选项 | 说明 |
|------|------|
| `-n, --name <名称>` | 自定义来源名称（默认从 URL/路径中推断） |
| `-r, --ref <分支/tag/commit>` | 指定 git 分支、tag 或 commit（默认 `main`） |
| `-l, --local` | 指定为本地路径来源 |
| `-s, --submodule` | 指定为 git submodule 来源 |
| `-i, --include <匹配模式...>` | 只同步匹配的 skills（支持 glob） |

**示例：**

```bash
# 指定分支
pbs add https://github.com/your-org/your-playbook.git --ref develop

# 只同步部分 skills
pbs add https://github.com/your-org/your-playbook.git --include "cocos-*" "oops-*"

# 本地路径，自定义名称
pbs add --local ../my-playbook --name my-rules
```

---

### `pbs sync`

将所有来源的内容同步到已启用的 AI 工具目录，并更新 lockfile。

```bash
pbs sync
```

> ⚠️ sync 会覆盖输出目录中的文件。如果本地有改动要保留，先执行 `pbs contribute`。

**自动发现并同步的内容：**`skills/*/SKILL.md`、`rules/**/*.md`、`docs/**/*.md`、`AGENTS.md`、`README.md`

---

### `pbs status`

查看当前同步状态。

```bash
pbs status
```

报告内容：
- 各文件是否与 lockfile 一致
- 本地被修改的文件列表
- 来源是否有新提交（上游更新提示）

---

### `pbs contribute`

将项目内对 skill 文件的修改贡献回知识库来源。

```bash
pbs contribute [选项]
```

| 选项 | 说明 |
|------|------|
| `-d, --dry-run` | 预览将要贡献的内容，不实际修改 |
| `-p, --push` | 自动建分支 + commit + push（适合发 PR） |
| `-b, --branch <分支名>` | 创建的分支名称 |
| `-m, --message <提交信息>` | git commit 信息 |
| `-s, --source <名称>` | 指定贡献到哪个来源（默认第一个） |

**典型贡献流程：**

```bash
# 1. 预览改动
pbs contribute --dry-run

# 2a. 只复制回来源目录（手动 commit）
pbs contribute

# 2b. 一键推送到远程分支，直接发 PR
pbs contribute --push \
  --branch "fix/skill-update" \
  --message "fix: 修正示例代码"
```

> **注意：** Cursor 的 `.mdc` 文件不支持贡献回流（格式已转换）。请通过 `.opencode/skills/` 目录下的 SKILL.md 进行编辑。

---

### `pbs watch`

监听来源目录变化，自动触发同步。适合本地开发知识库时实时预览效果。

```bash
pbs watch
```

> 支持所有来源类型。`local` 和 `submodule` 来源监听源目录；`git` URL 来源监听本地缓存目录（`.playbook-sync/repos/`），修改缓存目录内容后会自动触发同步。如需拉取远程最新内容，仍需手动 `pbs sync`。

---

## 配置文件说明

`playbook-sync.yaml` 完整示例：

```yaml
version: 1

sources:
  # Git 仓库来源（推荐，填入你的知识库 git 链接）
  - name: my-playbook
    type: git
    url: https://github.com/your-org/your-playbook.git
    ref: main                  # 可指定分支、tag 或 commit hash

  # 本地路径来源（本地开发阶段使用）
  - name: local-playbook
    type: local
    path: ../your-playbook

  # Git Submodule 来源
  - name: submodule-playbook
    type: submodule
    path: vendor/your-playbook

targets:
  opencode:
    enabled: true
    skills_path: .opencode/skills    # skills 输出目录
    agents_md: AGENTS.md             # AGENTS.md 输出路径

  cursor:
    enabled: true
    skills_path: .cursor/rules       # .mdc 文件输出目录
    mdc_globs:                       # Cursor rule 的 globs 字段
      - "**/*.ts"
      - "**/*.js"

  copilot:
    enabled: false
    skills_path: .github/copilot-instructions.md
    mode: merge                      # 合并写入单文件

  claude:
    enabled: false
    skills_path: .claude/skills
    agents_md: AGENTS.md
```

---

## Lockfile 说明

`playbook-sync.lock.yaml` 由 `pbs sync` 自动生成：

```yaml
version: 1
locked_at: '2026-03-16T10:00:00.000Z'
sources:
  my-playbook:
    type: git
    url: https://github.com/your-org/your-playbook.git
    resolved_ref: a1b2c3d4e5f6...    # 当前同步的 commit hash
    synced_at: '2026-03-16T10:00:00.000Z'
    files:
      - path: skills/skill-name-a/SKILL.md
        checksum: sha256校验和...
      - path: skills/skill-name-b/SKILL.md
        checksum: sha256校验和...
```

**建议将 lockfile 提交到项目 git 仓库**，保证团队所有成员的同步结果完全一致。  
`.playbook-sync/` 目录（git 缓存）**不需要提交**，已在 `.gitignore` 中排除。

---

## 团队协作流程

```
知识库维护者                     项目开发者
─────────────────                ──────────────────────────────
1. 在知识库仓库                  2. pbs sync
   编写/更新 skills                  ↓ 同步到项目 AI 工具目录
        │
        │   发现 skill 有问题       3. 在项目内直接修改
        │   或有改进机会               .opencode/skills/xxx/SKILL.md
        │                                      │
        │                            4. pbs contribute --push
        │                               自动建分支 + push
        │                                      │
        └──────────────────── 5. 发起 PR，维护者 Review 合并 ──►
```

---

## 注意事项

1. **`pbs sync` 会覆盖输出目录**（`.opencode/skills/`、`.cursor/rules/` 等）。有本地改动先 `contribute`，再 `sync`。
2. **Cursor `.mdc` 文件不支持贡献回流**。要修改 skill 内容，请编辑 `.opencode/skills/<name>/SKILL.md`。
3. **锁文件建议提交到 git**（`playbook-sync.lock.yaml`），保证团队同步版本一致。
4. **`.playbook-sync/` 目录不需要提交**（已在 `.gitignore`），是 git 来源的本地缓存。
5. **`pbs watch` 支持所有来源类型**，但 `git` URL 来源监听的是本地缓存目录，要拉取远程更新仍需手动 `pbs sync`。
6. **来源仓库必须有 `skills/*/SKILL.md` 结构**，否则 pbs 无法发现任何 skill。

---

## License

MIT
