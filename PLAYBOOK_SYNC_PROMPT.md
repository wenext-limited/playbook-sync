# playbook-sync 操作助手提示词 (v0.2.0)

将本文档完整提供给 AI，AI 即可帮你完成所有 playbook-sync 相关操作。

> **提示：** `README.zh.md` 已包含本文档的完整内容，可以直接将 README.zh.md 提供给 AI 使用。

---

## 版本与更新说明

**当前版本：v0.2.0**

### 版本更新日志

| 版本 | 发布时间 | 主要更新 |
|------|--------|--------|
| v0.2.0 | 2026-03 | ✨ **git sources 默认自动推送**；`pbs contribute` 前自动 fetch+rebase，冲突时清晰报错 & 人工介入指引；同步覆盖完整 playbook 结构（rules/agents/docs/new_project_code/CLAUDE.md/README.md/skills/README.md） |
| v0.1.0 | 2026-01 | 初始版本：基础 sync/contribute；仅同步 skills/AGENTS.md |

### 自动安装与更新

在使用前，运行以下命令确保你已安装最新版本：

```bash
# 检查是否已安装，否则从源代码安装
if ! command -v pbs &> /dev/null; then
  echo "未检测到 pbs，正在安装..."
  git clone https://github.com/wenext-limited/playbook-sync.git /tmp/playbook-sync
  cd /tmp/playbook-sync
  npm install
  npm run build
  ln -s "$(pwd)/bin/pbs.js" /usr/local/bin/pbs 2>/dev/null || echo "请手动添加 bin/pbs.js 到 PATH"
fi

# 更新到最新版本
cd /tmp/playbook-sync
git pull origin main
npm install
npm run build
echo "✓ playbook-sync 已更新到最新版本"

# 验证版本
pbs --version
```

如已安装，直接运行上述"更新到最新版本"部分即可。

---

## 重要更新亮点（v0.2.0）

### 1️⃣ **`pbs contribute` 现在默认自动推送**

**之前（v0.1.0）：** 需要显式 `--push` 才会推送
```bash
pbs contribute --push  # 必须加 --push
```

**现在（v0.2.0）：** git sources 自动推送，无需额外参数
```bash
pbs contribute  # git sources 默认推送到 origin
pbs contribute --no-push  # 如不想推送，显式禁用
```

### 2️⃣ **Rebase 与冲突处理更智能**

**流程改进：**
1. 自动 `fetch` 最新远端
2. 自动 `rebase` 到 origin branch
3. 遇到冲突 → 自动 abort rebase，给出清晰的人工解决指引（不是沉默失败）
4. `git push` 成功

**冲突时的用户指引：**
```
Could not automatically rebase your changes onto the latest remote.
The remote branch has diverged from your local changes.

To resolve manually:
  cd /path/to/source/repo
  git fetch origin
  git rebase origin/main
  # Fix conflicts, then: git rebase --continue
  git push origin main
```

### 3️⃣ **同步完整 Playbook 结构**

**原来只同步：**
- `skills/*/SKILL.md`
- `AGENTS.md`（根目录）

**现在还同步：**
- ✅ `rules/**/*.md`
- ✅ `agents/**/*.md`
- ✅ `docs/**/*`
- ✅ `new_project_code/**/*`
- ✅ `CLAUDE.md`
- ✅ `README.md`
- ✅ `skills/README.md`

**受影响的输出目录：**
- `.opencode/` 现在包含：rules/agents/docs/new_project_code/CLAUDE.md/README.md 等
- `.claude/` 同理
- `.cursor/` 自动把 rules & agents 转为 `.mdc` 格式
- Copilot 的合并文件包含新增内容类型

### 4️⃣ **.gitignore 更新策略**

**原来：** 只忽略 `skills_path` 目录
```gitignore
.opencode/skills/
.cursor/rules/
```

**现在：** 忽略整个 playbook 输出目录
```gitignore
.opencode/
.claude/
.cursor/
```

这样规则、文档等也不会被意外提交。

---

## 给 AI 的背景说明

你是一个熟悉 `playbook-sync`（CLI 工具，命令名 `pbs`）的助手。该工具用于把任意 AI 知识库（通过 git 链接指定）的 skills、rules、AGENTS.md 同步到项目的各 AI 工具目录，并支持将项目内的改动贡献回知识库。

### 关键文件与目录

| 文件/目录 | 说明 |
|-----------|------|
| `playbook-sync.yaml` | 项目配置文件，声明来源（sources）和目标（targets） |
| `playbook-sync.lock.yaml` | 锁文件，记录当前已同步的版本、文件列表和 SHA-256 校验和 |
| `.playbook-sync/repos/` | git 来源的本地缓存目录（自动管理，不要手动修改） |
| `.opencode/skills/` | OpenCode 输出目录（直接复制 SKILL.md） |
| `.cursor/rules/` | Cursor 输出目录（转换为 .mdc 格式，带 frontmatter） |
| `.github/copilot-instructions.md` | Copilot 输出（合并为单文件） |
| `.claude/skills/` | Claude Code 输出目录 |

### .gitignore 自动维护

`pbs sync` 执行时会**自动检测**项目中的 `.gitignore` 文件，并在其中维护一个标记块：

```gitignore
# >>> playbook-sync managed (DO NOT EDIT) >>>
playbook-sync.yaml
playbook-sync.lock.yaml
.playbook-sync/
.claude/skills/
AGENTS.md
# <<< playbook-sync managed <<<
```

**行为说明：**
- `.gitignore` 不存在时会自动创建。
- 标记块内的条目根据 `playbook-sync.yaml` 中**已启用（`enabled: true`）的 targets** 动态生成。
- `playbook-sync.yaml`、`playbook-sync.lock.yaml`、`.playbook-sync/`（缓存目录）始终会被忽略。
- 用户修改 targets 的启用状态后，下次 `pbs sync` 会自动更新标记块。
- 标记块外的其他 `.gitignore` 内容不会受到影响。
- **请勿手动编辑标记块内的内容**，它会在每次 sync 时被覆盖。

这确保了 pbs 同步的输出文件不会被意外提交到项目仓库——这些文件应通过 `pbs sync` 从知识库获取，而非通过 git 直接管理。

---

## 场景二：添加或修改技能（在知识库侧操作）

用户说：「我要新增一个 skill」「我要修改某个 skill 的内容」「我要更新知识库」

> 注意：这里的操作对象是**知识库源目录**（你的 playbook 仓库），不是项目目录。

### 新增 Skill

**1. 在知识库来源目录创建 skill 文件夹和 SKILL.md**

```bash
mkdir skills/your-new-skill
```

SKILL.md 必须包含 frontmatter：

```markdown
---
name: your-new-skill
description: 一句话说明何时使用
tags: [标签1, 标签2]
inputs: [输入参数描述]
outputs: [输出结果描述]
---

# 标题

## 概述

...
```

**2. 同步到项目**（在项目目录执行）

```bash
pbs sync
```

新 skill 会出现在已启用 targets 对应的输出目录中（如 `.claude/skills/`、`.opencode/skills/` 等）。

### 修改已有 Skill（在知识库侧直接修改）

直接编辑知识库源目录中的 `skills/<name>/SKILL.md`，然后在项目目录执行：

```bash
pbs sync
```

---

## 场景三：将最新知识库同步到当前项目

用户说：「我要更新 skills」「知识库有新内容了，帮我同步下来」「pbs sync 怎么用」

### 标准流程

```bash
# 1. 先查看当前状态（了解本地是否有改动）
pbs status
```

`pbs status` 使用**三方对比**（快照基线 vs 本地文件 vs 来源文件），显示以下状态：

| 状态 | 含义 |
|------|------|
| `modified_local` | 本地文件已修改，来源未变 |
| `modified_source` | 来源已更新，本地未改 |
| `conflict` | 本地和来源都修改了同一文件 |
| `deleted` | 本地文件被删除 |

**情况 A：状态显示 `All files in sync`，来源有新 commit**

```
ℹ Source has new commits: a1b2c3d4 → e5f6g7h8
  Run "pbs sync" to update.
```

直接同步：

```bash
pbs sync
```

**情况 B：状态显示本地有改动（`modified_local`）**

```
    modified_local   .claude/skills/your-skill/SKILL.md
ℹ   1 file(s) modified locally. Use "pbs contribute" to push back.
```

此时 `pbs sync` 会**被阻止**，并给出操作选项。需要先决定：

- 想**保留**本地改动并贡献回去 → 先 `pbs contribute`，再 `pbs sync`
- 想**丢弃**本地改动 → `pbs sync --force`（自动备份被覆盖的文件）

```bash
# 预览同步操作（不写入）
pbs sync --dry-run

# 强制同步，自动备份被覆盖的文件
pbs sync --force
```

**情况 C：状态显示冲突（`conflict`）**

```
    conflict         .claude/skills/your-skill/SKILL.md
ℹ   1 file(s) conflicting (both local and source changed).
ℹ   Options: "pbs contribute" first, then "pbs sync", or "pbs sync --force".
```

- 想保留本地改动 → 先 `pbs contribute --push`，再 `pbs sync`
- 想用来源覆盖 → `pbs sync --force`（自动备份，可用 `pbs recover` 恢复）

**情况 D：没有锁文件（首次或锁文件被删）**

```
ℹ No lockfile found. Run "pbs sync" first.
```

直接执行：

```bash
pbs sync
```

### 备份与恢复

`pbs sync --force` 会在覆盖本地文件前自动创建备份，保存在 `.playbook-sync/backups/<时间戳>/`。

```bash
# 列出所有备份
pbs recover

# 输出示例：
# ℹ Found 2 backup(s):
#   20260317-103139  2026/3/17 10:31:39  (1 files)
#     .claude/skills/cocos-audio/SKILL.md
#   20260317-095500  2026/3/17 09:55:00  (3 files)
#     ...

# 从指定备份恢复
pbs recover 20260317-103139
```

备份最多保留 10 个，超过后自动删除最旧的备份。

---

## 场景四：将本地改动贡献回知识库

用户说：「我改了某个 skill，要同步回去」「我要贡献改动」「contribute 怎么用」

### 标准流程

**1. 确认有改动（预览）**

```bash
pbs contribute --dry-run
```

输出示例：

```
ℹ Found 2 modified file(s) to contribute:
  .opencode/skills/skill-a/SKILL.md → skills/skill-a/SKILL.md
  .opencode/skills/skill-b/SKILL.md → skills/skill-b/SKILL.md
ℹ Dry run — no changes applied.
```

如果显示 `No local modifications detected`：
- 检查是否改的是 OpenCode 目录（`.opencode/skills/`）而不是 Cursor 目录
- Cursor 的 `.mdc` 文件**不支持贡献回流**，需改 `.opencode/skills/` 目录下对应的 SKILL.md

**2a. 只复制回来源（手动 commit）**

适合本地路径来源，自己控制 git 操作：

```bash
pbs contribute
```

输出会提示：

```
✓   Copied: skills/skill-a/SKILL.md
ℹ Changes copied to source. To commit:
  cd /path/to/your-playbook
  git add . && git commit -m "your message"
  git push
```

**2b. 一键推送到远程分支（适合发 PR）**

```bash
pbs contribute \
  --push \
  --branch "fix/skill-update" \
  --message "fix: 修正示例代码"
```

成功后会显示：

```
✓ Pushed to branch: fix/audio-skill-update
ℹ Create a Pull Request to merge your changes.
```

然后去 GitHub 创建 PR 即可。

**3. 贡献完成后，重新 sync 更新 lockfile**

```bash
pbs sync
```

---

## 场景五：遇到锁文件（Lockfile）问题

用户说：「锁文件有问题」「sync 报错了」「lockfile 冲突」「校验和不对」

### 问题 1：找不到锁文件

**现象：**

```
ℹ No lockfile found. Run "pbs sync" first.
```

**原因：** 首次使用，或锁文件被意外删除。

**解决：**

```bash
pbs sync
```

---

### 问题 2：锁文件损坏或校验和不对

**现象：** `pbs status` 报告 `modified` 但文件实际没有改动，或 lock 文件内容异常。

**原因：** lock 文件内容与实际同步状态不一致（如手动编辑、复制覆盖等）。

**解决：** 删除 lock 文件后重新 sync：

```bash
rm playbook-sync.lock.yaml

pbs sync
```

> `playbook-sync.lock.yaml` 不需要提交到 git，已由 `.gitignore` 自动排除。

---

### 问题 3：锁文件校验和不匹配（status 显示 modified 但实际没改）

**现象：** `pbs status` 报告文件已修改，但实际上没有人改动过。

**原因：** 可能是行尾符（CRLF/LF）不一致、编辑器意外修改、或手动操作了输出目录。

**诊断：**

```bash
pbs status

# 对比具体文件内容
git diff .opencode/skills/your-skill/SKILL.md
```

**解决方案 A：直接重新同步（丢弃本地改动）**

```bash
pbs sync
```

**解决方案 B：如果真的有有价值的改动，先贡献再 sync**

```bash
pbs contribute --dry-run   # 确认改动内容
pbs contribute             # 贡献回来源
pbs sync                   # 重新同步，校验和恢复正常
```

---

### 问题 4：来源版本落后（锁文件显示旧 commit）

**现象：**

```
⚠  Source has new commits: a1b2c3d4 → e5f6g7h8
   Run "pbs sync" to update.
```

**解决：**

```bash
pbs sync
```

---

### 问题 5：git 进程锁（`.git/index.lock`）

**现象：**

```
Error: Another git process seems to be running in this repository
fatal: Unable to create '.git/index.lock': File exists.
```

**原因：** 上次 git 操作异常退出，留下了进程锁文件。

**解决：**

```bash
# 确认没有其他 git 进程在运行，然后删除锁文件
# Windows：
del .playbook-sync\repos\<仓库目录>\.git\index.lock

# macOS/Linux：
rm .playbook-sync/repos/<仓库目录>/.git/index.lock

# 然后重新执行 sync
pbs sync
```

---

### 问题 6：sync 报错「来源路径不存在」

**现象：**

```
Error: Local source path not found: /path/to/playbook-cocos
```

**原因：** 本地路径来源的目录不存在或路径配置错误。

**解决：**

```
# 检查 playbook-sync.yaml 中 path 是否正确
cat playbook-sync.yaml

# 确认目录存在
ls ../your-playbook

# 如果路径错误，重新 add
pbs add --local <正确的路径> --name <来源名>
pbs sync
```

---

### 问题 7：git 来源 clone 失败（网络/权限）

**现象：**

```
Error: Cloning failed...
```

**处理步骤：**

1. 确认网络可访问 GitHub
2. 确认 git 已配置 SSH 密钥或 HTTPS 凭证
3. 可改用本地路径来源临时替代：

```bash
# 手动 clone 知识库到本地
git clone <仓库URL> ../your-playbook

# 改用本地来源
pbs add --local ../your-playbook --name my-playbook
pbs sync
```

---

## 快速决策树

```
用户的问题
│
├─ 环境没搭好 / 第一次用
│   └─ pbs init → pbs add <来源> → 启用 targets → pbs sync
│
├─ 要同步最新知识库内容下来
│   ├─ pbs status 显示 modified_local / conflict？
│   │   ├─ 想保留本地改动 → 先 pbs contribute → 再 pbs sync
│   │   └─ 想丢弃本地改动 → pbs sync --force（自动备份）
│   └─ 无本地改动？ → 直接 pbs sync
│
├─ 要把本地修改贡献回知识库
│   ├─ 改的是 .claude/skills/ 或 .opencode/skills/ 下的文件？
│   │   ├─ 只复制回去  → pbs contribute
│   │   └─ 推送到远程  → pbs contribute --push --branch xxx --message xxx
│   └─ 改的是 .cursor/rules/ 的 .mdc 文件？
│       └─ 不支持直接贡献，改为编辑对应 target 目录下的 SKILL.md
│
├─ 误操作 / 想恢复被覆盖的文件
│   ├─ pbs recover       # 列出备份
│   └─ pbs recover <id>  # 恢复指定备份
│
└─ 锁文件问题
    ├─ 找不到锁文件            → pbs sync
    ├─ lockfile 损坏/不一致       → 删除 lock 文件 → pbs sync
    ├─ status 误报 modified    → pbs sync（重新生成校验和）
    ├─ 来源有新 commit         → pbs sync
    ├─ .git/index.lock 存在   → 删除 index.lock → pbs sync
    └─ 来源路径找不到          → 检查 playbook-sync.yaml 路径配置
```

---

## 注意事项

1. **`pbs sync` 默认会检测本地改动并阻止覆盖**。如果本地有修改，sync 会中止并提示选项。使用 `--force` 可强制覆盖（自动备份），或先 `pbs contribute` 保存改动。
2. **`pbs sync --force` 自动备份被覆盖的文件**到 `.playbook-sync/backups/`，可用 `pbs recover` 恢复。
3. **Cursor 的 `.mdc` 文件不支持贡献回流**。编辑 skill 内容请通过 `.claude/skills/` 或 `.opencode/skills/` 目录。
4. **`playbook-sync.yaml`、`playbook-sync.lock.yaml` 和 `.playbook-sync/` 均不需要提交**（已在 `.gitignore` 自动排除）。每台机器各自运行 `pbs init` + `pbs add` 初始化，按需 `pbs sync`。
5. **`pbs watch` 支持所有来源类型**，但 `git` URL 来源监听的是本地缓存目录，要拉取远程更新仍需手动 `pbs sync`。
6. **`pbs sync` 会自动维护 `.gitignore`**。已启用 targets 的输出路径会被自动添加到 `.gitignore` 的标记块中，确保同步产物不被误提交。修改 targets 启用状态后，下次 sync 会自动更新。
7. **`opencode` target 默认已启用**。其他 targets（cursor、copilot、claude）默认禁用，需手动在 `playbook-sync.yaml` 中设置 `enabled: true`。
8. **`pbs status` 使用三方对比**（快照 vs 本地 vs 来源），能区分 `modified_local`、`modified_source` 和 `conflict`。
10. **`pbs contribute` 会检查来源是否有新提交**。如果来源在上次 sync 后有更新，会给出警告（但仍允许继续）。
