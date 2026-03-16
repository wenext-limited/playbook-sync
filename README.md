# playbook-sync（pbs）

**把 AI 编程助手的「知识库」一键同步到所有项目，并支持将项目内改动贡献回知识库。**

适合维护了共享知识库（如 [playbook-cocos](https://github.com/wenext-limited/playbook-cocos)）的团队，需要把 skills、rules、AGENTS.md 等内容同步到多个游戏项目，同时兼容 **OpenCode、Cursor、GitHub Copilot、Claude Code** 等多种 AI 工具。

---

## 为什么需要它？

### 痛点

| 问题 | 说明 |
|------|------|
| 知识分散 | 每个项目各自维护 AI 规则，更新不同步、质量参差不齐 |
| 多工具适配 | OpenCode、Cursor、Copilot 的配置路径和格式各不相同，手动维护极易出错 |
| 贡献难回流 | 某个项目改进了某条 skill，但这个改进很难同步回共享知识库 |
| 无版本追踪 | 不知道当前项目同步的是哪个版本，也不知道是否有人改动过 |

### playbook-sync 的解法

```
             ┌─────────────────────────────────┐
             │   playbook-cocos（共享知识库）    │
             │   skills/ rules/ AGENTS.md       │
             └──────────┬──────────────▲────────┘
                        │  pbs sync    │  pbs contribute
                        ▼              │
             ┌─────────────────────────────────┐
             │      你的游戏项目                │
             │  .opencode/skills/   ← OpenCode  │
             │  .cursor/rules/      ← Cursor    │
             │  playbook-sync.yaml（配置）       │
             │  playbook-sync.lock.yaml（锁文件）│
             └─────────────────────────────────┘
```

**一个命令同步，一个命令贡献回流。** 全程有 lockfile 记录版本，团队成员同步环境完全一致。

---

## 核心优点

### 1. 多工具自动适配，格式无需手动转换

不同 AI 工具对知识文件的位置和格式要求不同，pbs 自动处理：

| AI 工具 | 输出路径 | 格式处理 |
|---------|---------|---------|
| OpenCode | `.opencode/skills/<name>/SKILL.md` | 原样复制 |
| Cursor | `.cursor/rules/<name>.mdc` | 自动添加 `.mdc` frontmatter |
| GitHub Copilot | `.github/copilot-instructions.md` | 合并写入单文件 |
| Claude Code | `.claude/skills/<name>/SKILL.md` | 原样复制 |

### 2. 贡献回流是一等公民

在项目内修改了某个 skill？pbs 能检测到变化并将其复制回知识库源目录，还可以一键建分支、提交、push，直接发起 PR：

```bash
pbs contribute --push --branch "fix/audio-docs" --message "fix: 修正音频淡出示例"
```

### 3. Lockfile 保证版本一致性

每次 `pbs sync` 都会生成/更新 `playbook-sync.lock.yaml`，记录：
- 每个文件的 SHA-256 校验和
- 源仓库的 git commit hash
- 同步时间戳

将 lockfile 提交到项目仓库，团队所有成员运行 `pbs sync` 后得到完全一致的内容。

### 4. 多源支持

同时接入多个知识库，或在开发阶段使用本地路径、在 CI 中使用 git URL：

```yaml
sources:
  - name: playbook-cocos        # git URL（推荐生产使用）
    type: git
    url: https://github.com/wenext-limited/playbook-cocos.git
  - name: local-playbook        # 本地路径（开发阶段方便调试）
    type: local
    path: ../playbook-cocos
```

### 5. Watch 模式，改知识库立即看效果

开发知识库时，启动 watch 模式，修改 skill 后项目目录立即更新，无需手动反复 sync：

```bash
pbs watch
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

## 快速上手

### 第一步：在你的项目中初始化

```bash
cd my-game-project
pbs init
```

生成 `playbook-sync.yaml` 配置文件，包含默认的 targets 设置。

### 第二步：添加知识库来源

```bash
# 方式 A：从 GitHub 仓库同步（推荐，生产环境）
pbs add https://github.com/wenext-limited/playbook-cocos.git

# 方式 B：从本地路径同步（开发阶段，方便调试）
pbs add --local ../playbook-cocos

# 方式 C：从 git submodule 同步
pbs add --submodule vendor/playbook-cocos
```

### 第三步：同步到 AI 工具目录

```bash
pbs sync
```

输出示例：

```
ℹ Starting sync...

ℹ Syncing source: playbook-cocos
→ Cloning https://github.com/wenext-limited/playbook-cocos.git...
✓ Resolved git source "playbook-cocos" at f8dc7885
✓   OpenCode: 17 files → .opencode/skills
✓   Cursor: 22 .mdc files → .cursor/rules
✓ Lockfile updated.

ℹ Sync complete:
  playbook-cocos @f8dc7885 → 39 files → [opencode, cursor]
```

### 第四步：查看同步状态

```bash
pbs status
```

输出示例：

```
ℹ Source: playbook-cocos @f8dc7885
  Synced at: 2026-03-16T10:00:00.000Z
✓   All files in sync.
```

如果有文件被本地修改：

```
ℹ Source: playbook-cocos @f8dc7885
  Synced at: 2026-03-16T10:00:00.000Z
  modified  .opencode/skills/cocos-audio/SKILL.md
  Local changes detected. Use "pbs contribute" to push them back.
```

---

## 命令详解

### `pbs init`

在当前目录创建 `playbook-sync.yaml` 配置文件。只需运行一次。

---

### `pbs add <来源>`

添加一个知识库来源。

```bash
pbs add <git-url 或本地路径>
```

| 选项 | 说明 |
|------|------|
| `-n, --name <名称>` | 自定义来源名称（默认从 URL/路径中推断） |
| `-r, --ref <分支/tag/commit>` | 指定 git 分支、tag 或 commit（默认 `main`） |
| `-l, --local` | 指定为本地路径来源 |
| `-s, --submodule` | 指定为 git submodule 来源 |
| `-i, --include <匹配模式...>` | 只包含指定 skill（支持 glob） |

**示例：**

```bash
# 只同步 cocos- 开头的 skills
pbs add https://github.com/wenext-limited/playbook-cocos.git --include "cocos-*"

# 指定分支
pbs add https://github.com/wenext-limited/playbook-cocos.git --ref develop

# 本地路径，自定义名称
pbs add --local ../my-playbook --name my-rules
```

---

### `pbs sync`

将所有来源解析、自动发现内容，写入到已启用的 AI 工具目录，并更新 lockfile。

```bash
pbs sync
```

**自动发现的内容包括：**
- `skills/*/SKILL.md`（核心 skills）
- `rules/**/*.md`（规则文档）
- `docs/**/*.md`（架构文档）
- `AGENTS.md`（代理角色定义）
- `README.md`

---

### `pbs status`

查看当前同步状态，检测本地是否有改动、上游是否有新提交。

```bash
pbs status
```

---

### `pbs contribute`

将项目内对 skill 文件的修改贡献回知识库来源。

```bash
pbs contribute [选项]
```

| 选项 | 说明 |
|------|------|
| `-s, --source <名称>` | 指定贡献目标来源（默认第一个来源） |
| `-b, --branch <分支名>` | 创建的分支名称 |
| `-m, --message <提交信息>` | git commit 信息 |
| `-p, --push` | 自动建分支 + commit + push（适合发 PR） |
| `-d, --dry-run` | 预览将要贡献的内容，不实际修改 |

**典型贡献流程：**

```bash
# 1. 在项目里修改了某个 skill
#    例：.opencode/skills/cocos-audio/SKILL.md

# 2. 先预览，确认改动范围
pbs contribute --dry-run

# 3a. 只复制回来源目录（手动 commit）
pbs contribute
# 然后去来源目录手动 git add && git commit && git push

# 3b. 或一键推送到远程分支，直接发 PR
pbs contribute --push \
  --branch "fix/audio-fade-example" \
  --message "fix: 修正音频淡出代码示例"
```

> **说明：** Cursor 的 `.mdc` 文件经过格式转换，目前不支持从 `.mdc` 直接贡献回流。建议通过 OpenCode（`.opencode/skills/`）目标目录进行编辑和贡献。

---

### `pbs watch`

监听来源目录变化，自动触发同步。适合在本地开发知识库时实时预览效果。

```bash
pbs watch
```

> 仅支持 `local` 和 `submodule` 类型的来源（git URL 来源需手动 sync）。

---

## 配置文件说明

`playbook-sync.yaml` 完整示例：

```yaml
version: 1

sources:
  # Git 仓库来源（推荐生产使用）
  - name: playbook-cocos
    type: git
    url: https://github.com/wenext-limited/playbook-cocos.git
    ref: main                  # 可指定分支、tag 或 commit hash

  # 本地路径来源（开发阶段使用）
  - name: local-playbook
    type: local
    path: ../playbook-cocos

  # Git Submodule 来源
  - name: submodule-playbook
    type: submodule
    path: vendor/playbook-cocos

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

`playbook-sync.lock.yaml` 由 `pbs sync` 自动生成，示例：

```yaml
version: 1
locked_at: '2026-03-16T10:00:00.000Z'
sources:
  playbook-cocos:
    type: git
    url: https://github.com/wenext-limited/playbook-cocos.git
    resolved_ref: f8dc7885c09e090eabee176286e9e94a6c754ff4
    synced_at: '2026-03-16T10:00:00.000Z'
    files:
      - path: skills/cocos-audio/SKILL.md
        checksum: 8fc5f1c96f18df9ff6f2842f5ca88...
      - path: skills/oops-framework/SKILL.md
        checksum: 0122860d3e768e5e34039edecd8c7...
```

**建议将 lockfile 提交到项目 git 仓库**，保证团队所有成员的同步结果完全一致。

---

## 典型团队协作流程

```
知识库维护者                    游戏项目开发者
─────────────────               ─────────────────────────────
1. 在 playbook-cocos            2. pbs sync
   编写/更新 skills                 ↓ 同步到项目 AI 工具目录
        │
        │  发现 skill 有问题        3. 在项目内直接修改
        │  或有改进机会                .opencode/skills/xxx/SKILL.md
        │                                    │
        │                         4. pbs contribute --push
        │                            自动建分支 + push
        │                                    │
        └────────────────────── 5. 发起 PR，知识库维护者 Review ──►
```

---

## 常见问题

**Q: 第一次 `pbs sync` 很慢？**

A: 首次同步 git 来源需要 clone 仓库，之后会自动 fetch 增量更新，速度大幅提升。

**Q: 能否只同步部分 skills？**

A: 可以。在 `pbs add` 时用 `--include` 过滤：

```bash
pbs add https://... --include "cocos-*" "oops-*"
```

**Q: Cursor 的 `.mdc` 文件修改后能贡献回流吗？**

A: 目前不支持。Cursor target 经过格式转换（加了 frontmatter），checksum 与源文件不一致，建议通过 OpenCode target（`.opencode/skills/`）修改后用 `pbs contribute` 回流。

**Q: lockfile 需要提交到 git 吗？**

A: 建议提交。这样团队成员拉取后运行 `pbs sync` 会得到完全一致的内容，避免因版本不同导致 AI 行为差异。

---

## License

MIT
