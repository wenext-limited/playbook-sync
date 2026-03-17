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

每次 `pbs sync` 自动更新 `playbook-sync.lock.yaml`，记录每个文件的 SHA-256 校验和与 git commit hash。lockfile 和配置文件均由 `pbs` 自动管理，已通过 `.gitignore` 排除，**不建议提交到 git**——每台机器各自初始化，按需同步即可。

### 5. 本地改动安全保护

`pbs sync` 在写入前自动检测本地改动，默认**阻止覆盖**，提示三种处理方式。`--force` 强制同步时自动备份，可随时用 `pbs recover` 还原：

```bash
pbs sync --dry-run    # 预览，不写入
pbs sync --force      # 覆盖但自动备份
pbs recover           # 查看/恢复备份
```

### 6. Watch 模式，改知识库立即看效果

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

# 3. 同步（opencode 默认已启用，直接 sync 即可）
pbs sync

# 4. 查看同步状态
pbs status

# 5. 需要其他工具？编辑 playbook-sync.yaml 启用 cursor / copilot / claude
# 6. 开发知识库时，启动 watch 模式自动同步
pbs watch
```

**首次 sync 输出示例：**

```
ℹ Starting sync...

ℹ Syncing source: your-playbook
→ Cloning https://github.com/your-org/your-playbook.git...
✓ Resolved git source "your-playbook" at a1b2c3d4
✓   Claude Code: 12 files → .claude/skills
✓ Lockfile updated.
✓ Updated .gitignore with playbook-sync output paths.

ℹ Sync complete:
  your-playbook @a1b2c3d4 → 12 files → [claude]
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
pbs sync              # 标准同步（本地有改动时会阻止）
pbs sync --dry-run    # 预览将要发生的操作，不写入任何文件
pbs sync --force      # 强制覆盖本地改动（自动备份被覆盖的文件）
```

| 选项 | 说明 |
|------|------|
| `-d, --dry-run` | 预览同步操作，不写入任何文件。显示哪些文件会更新、哪些有本地改动或冲突 |
| `-f, --force` | 强制覆盖本地改动。被覆盖的文件会自动备份到 `.playbook-sync/backups/`，可用 `pbs recover` 恢复 |

**冲突保护机制：**

`pbs sync` 在写入前会进行**三方对比**（快照基线 vs 本地文件 vs 来源文件）。如果检测到本地改动或冲突，默认会**阻止同步**并给出操作选项：

```
⚠ Sync blocked — local modifications detected:

→ 1 file(s) modified locally:
    .claude/skills/your-skill/SKILL.md

ℹ Options:
  pbs contribute             # Push local changes to source first
  pbs sync --force           # Force overwrite (auto-backup local changes)
  pbs sync --dry-run         # Preview what would happen
  pbs recover <backup-id>    # Restore from a backup after force sync
```

**自动发现并同步的内容：**`skills/*/SKILL.md`、`rules/**/*.md`、`docs/**/*.md`、`AGENTS.md`、`README.md`

**`.gitignore` 自动维护：**`pbs sync` 执行时会自动将以下路径追加到项目的 `.gitignore`（如果文件存在）：
- `playbook-sync.yaml`（本地配置）
- `playbook-sync.lock.yaml`（锁文件）
- `.playbook-sync/`（缓存、快照、备份）
- 已启用 targets 的输出目录

所有 pbs 相关文件均不建议提交到 git，应在每台机器上各自初始化。条目由标记块管理，随 targets 启用状态动态更新，请勿手动编辑标记块内容。

---

### `pbs status`

查看当前同步状态。使用**三方对比**（快照基线 vs 本地文件 vs 来源文件）精确区分改动来源。

```bash
pbs status
```

报告内容及状态含义：

| 状态 | 含义 |
|------|------|
| `modified_local` | 本地文件已修改，来源未变 → 可用 `pbs contribute` 贡献回去 |
| `modified_source` | 来源已更新，本地未改 → 运行 `pbs sync` 更新 |
| `conflict` | 本地和来源都修改了同一文件 → 先 `pbs contribute`，再 `pbs sync`，或 `pbs sync --force` |
| `deleted` | 本地文件被删除 |

此外还会提示来源是否有新提交（上游更新）。

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

> **注意：** Cursor 的 `.mdc` 文件不支持贡献回流（格式已转换）。请通过 `.claude/skills/` 或 `.opencode/skills/` 目录下的 SKILL.md 进行编辑。

---

### `pbs recover`

列出备份或从指定备份恢复文件。`pbs sync --force` 在覆盖本地文件前会自动创建备份。

```bash
pbs recover                   # 列出所有备份
pbs recover <backup-id>       # 从指定备份恢复文件
```

**示例：**

```
ℹ Found 1 backup(s):

  20260317-103139  2026/3/17 10:31:39  (1 files)
    .claude/skills/cocos-audio/SKILL.md

ℹ To restore: pbs recover <backup-id>
```

备份存储在 `.playbook-sync/backups/<时间戳>/`，最多保留 10 个，超出后自动删除最旧的。

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
    enabled: true               # opencode 默认启用
    skills_path: .opencode/skills    # skills 输出目录
    agents_md: AGENTS.md             # AGENTS.md 输出路径

  cursor:
    enabled: false
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

**`playbook-sync.yaml`、`playbook-sync.lock.yaml` 和 `.playbook-sync/` 目录均不建议提交到 git**，已通过 `.gitignore` 自动排除。每台机器各自运行 `pbs init` 和 `pbs add` 初始化，按需 `pbs sync` 即可。

---

## 团队协作流程

```
知识库维护者                     项目开发者
─────────────────                ──────────────────────────────
1. 在知识库仓库                  2. pbs sync
   编写/更新 skills                  ↓ 同步到项目 AI 工具目录
        │
        │   发现 skill 有问题       3. 在项目内直接修改
        │   或有改进机会               .claude/skills/xxx/SKILL.md
        │                                      │
        │                            4. pbs contribute --push
        │                               （来源有新提交时会给出警告）
        │                               自动建分支 + push
        │                                      │
        └──────────────────── 5. 发起 PR，维护者 Review 合并 ──►
```

**误覆盖了本地改动？**

```bash
pbs recover                   # 查看自动备份列表
pbs recover <backup-id>       # 恢复指定备份
```

---

## 注意事项

1. **`pbs sync` 默认检测本地改动并阻止覆盖。** 有本地修改时 sync 会中止并提示选项。使用 `--force` 可强制覆盖（自动备份），或先 `pbs contribute` 保存改动。
2. **`pbs sync --force` 自动备份被覆盖的文件**到 `.playbook-sync/backups/`，可用 `pbs recover` 恢复。
3. **`opencode` target 默认已启用**；其他 targets（cursor、copilot、claude）默认禁用，需在 `playbook-sync.yaml` 中手动设为 `enabled: true`。
4. **Cursor `.mdc` 文件不支持贡献回流**（格式已转换）。要修改 skill 内容，请编辑 `.claude/skills/` 或 `.opencode/skills/` 下对应的 SKILL.md。
5. **`playbook-sync.yaml`、`playbook-sync.lock.yaml` 和 `.playbook-sync/` 不需要提交**（已自动添加到 `.gitignore`），每台机器各自初始化即可。
6. **`pbs watch` 支持所有来源类型**，但 `git` URL 来源监听的是本地缓存目录，要拉取远程更新仍需手动 `pbs sync`。
8. **来源仓库必须有 `skills/*/SKILL.md` 结构**，否则 pbs 无法发现任何 skill。

---

## License

MIT
