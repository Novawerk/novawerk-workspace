# 为 Novawerk 做贡献

**语言：** [English](CONTRIBUTING.md) | 简体中文

感谢你的参与。本仓库包含 Novawerk 运行所需的软件：网站、管理后台、API 和智能体（Agents）。你可以通过逐个完成任务来参与项目建设。

## 在这里，贡献意味着什么

- **你选择任务，我们审核你的 Pull Request。** 整个贡献流程就是这么简单。
- **每个人都是成员。** 登录 novawerk.io 即可创建 Novawerk 账户。加入项目团队后，你可以使用同一个账户访问任务看板、团队聊天和管理后台。这里没有等级或排名。
- **维护者负责管理 Novawerk。** 他们创建任务、为每项任务选择实施方案、批准 CI 运行、审核并合并 Pull Request，以及维护任务看板。维护者是一种职责，而不是等级。
- **我们不提供整个项目的指导。** 我们没有足够的人手。我们会将任务拆分到足够小，让你能够独立完成，并在任务讨论区回答问题。
- **合并的贡献可以获得 Werk。** Werk 是一种贡献认可，会显示在你的个人资料和贡献者展示墙上。它不是金钱，也不代表等级。

## 任务看板

所有任务都发布在 [novawerk.io/tasks](https://novawerk.io/tasks)。请不要为没有对应任务的代码修改提交 Pull Request。发现了 Bug 或有新的想法？请在[任务建议页面](https://novawerk.io/tasks/suggest)提出建议。维护者会将其整理成任务。

已经明确知道自己想开发什么？你可以使用 AI 智能体和自己的 Token，通过 MCP `create_task` 工具自行创建任务（参见 [AGENTS.md](AGENTS.md)）。

创建任务时，需要提供标题、要做什么及其原因、验收条件（"Done when"），并选择任务规模：

- **S**（一到两个小时）：任务会立即分配给你。你可以直接提交 Pull Request。
- **M**：任务会发布到任务看板，供成员讨论。你需要像其他成员一样提交实施方案，由维护者选择其中一个。
- **L** 和 **XL**：任务会先进入建议队列，由维护者审核。

每天最多可以创建 10 个新任务。

文档、帖子、视频的修改以及错别字修复不需要关联任务。提交 Pull Request 时，只需填写 `Task: none` 并说明原因

## 贡献流程

1. **选择任务。** 前往 [novawerk.io/tasks](https://novawerk.io/tasks) 浏览任务。任何人都可以查看，无需注册账户。

2. **提出实施方案。** 在 [novawerk.io/sign-in](https://novawerk.io/sign-in) 使用 GitHub 或邮件验证码登录（Google 登录功能将在启用后提供），说明你打算如何完成任务，以及预计何时完成。

   提交方案前，需要在设置中关联 GitHub 账户（Settings → Link GitHub），以便我们将你的 Pull Request 与任务对应起来。

   多个人可以为同一任务提出方案。维护者会选择其中一个方案，分配任务，并向被选中的贡献者发送任务指南。

   **S 级任务不需要维护者介入：** 第一个提交实施方案且当前符合任务认领条件的成员，会立即获得该任务，并可以在任务页面查看任务指南。

3. **Fork 本仓库。** 将仓库 Fork 到自己的 GitHub 账户，并在自己的 Fork 中创建分支进行开发。

4. **创建 Pull Request。** 向 `main` 分支提交 Pull Request。描述中必须包含 `Task: NW-<n>` 这一行（PR 模板已包含该内容）。

   只有当你是该任务的负责人时，我们的 GitHub App 才会将 Pull Request 与任务关联。

5. **等待审核。** 维护者会先批准 CI 运行（来自 Fork 的 Pull Request 在获得批准前不会运行 CI），然后审核代码。每次合并都必须经过维护者审核。

6. **合并即完成。** Pull Request 合并后，任务会自动关闭，你也会获得对应的 Werk。

如果后来没有时间继续完成任务，可以在任务看板上主动释放任务。任务会重新变为 Open 状态，不会对你产生负面影响。

如果任务连续 14 天没有活动，系统会自动释放该任务，并在第 7 天向你发送提醒。

## 团队聊天

[chat.novawerk.io](https://chat.novawerk.io) 是成员交流的地方。你可以在这里打招呼、询问功能的使用方法，或分享自己正在开发的内容。

点击网站顶部的 **Team chat** 即可进入。

团队聊天使用你的 Novawerk 账户自动登录，无需设置第二个密码。聊天中会显示你个人资料中的姓名、@用户名和头像，你可以在 novawerk.io 上修改这些信息。

使用团队聊天需要账户绑定邮箱地址。如果你只使用 GitHub 登录，可以在 Settings 中添加邮箱。

- **#All Talk** 是所有成员的公共聊天室，每位成员都会加入。
- **与任务有关的问题应在对应任务的讨论区提出。** 这样后续接手任务的人也能看到答案。其他话题可以在团队聊天中讨论。
- **在手机上使用。** 使用手机浏览器打开团队聊天，并将其添加到主屏幕。之后就可以像 App 一样使用，并接收通知。你可以通过每个聊天室的铃铛图标设置通知偏好。
- **不要发布敏感信息。** 包括密钥、Token、密码，以及其他人的私人信息。聊天室由多人共享，消息会被保留。

## 本地开发环境

你需要安装 Node.js 22 或更高版本、pnpm 10，以及用于运行本地 PostgreSQL 的 Docker（或 OrbStack）。

```bash
nvm use                 # 使用 .nvmrc 指定的 Node.js 22
corepack enable         # 启用 package.json 指定的 pnpm 10
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp apps/admin/.env.example apps/admin/.env.local
```

在 `apps/api/.env` 中设置以下变量（其余变量可以留空）：

```bash
DATABASE_URL=postgres://novawerk:novawerk@localhost:5432/novawerk
GOOGLE_CLIENT_ID=local                    # 任意占位值
DEV_LOGIN=true
LLM_PROVIDER=mock                         # 聊天和帖子写手使用脚本回复，无需密钥
WEB_REVALIDATE_URL=http://localhost:3000/api/revalidate
WEB_REVALIDATE_SECRET=change-me           # 与 apps/web/.env.local 中的 REVALIDATE_SECRET 相同
```

然后添加会话密钥（32 个以上的随机字符；没有它 API 无法启动）：

```bash
echo "SESSION_SECRET=$(openssl rand -base64 48)" >> apps/api/.env
```

并在 `apps/admin/.env.local` 中设置 `VITE_DEV_LOGIN=true`。然后运行：

```bash
pnpm db:up && pnpm db:migrate && pnpm db:seed:dev
pnpm dev                # Web 运行在 :3000，管理后台在 :5173，API 在 :8787
```

大多数任务不需要使用任何真实密钥。

### 本地登录

- **网站**（localhost:3000）：使用任意邮箱登录。没有 Resend 密钥时，验证码会打印在 API 日志中（`sign-in code for you@example.com: 123456`）。请用 `localhost:3000` 打开网站，不要用 `127.0.0.1` 或局域网地址：那样开发服务器不会加载页面脚本，点 “Send code” 只会刷新页面，而且 API 只接受 `localhost`。
- **看到 "We couldn't reach the API at http://localhost:8787"** 说明 API 没有启动。在 `pnpm dev` 的输出中查找 `@nw/api env:`，它会列出 `apps/api/.env` 缺少什么。改好后重启 `pnpm dev`。
- **使用 GitHub 登录**："Continue with GitHub"（以及 Settings → Link GitHub）会打开一个本地页面，而不是 github.com。输入任意 GitHub 用户名即可，同一个用户名始终对应同一个账户。提交实施方案和认领 S 级任务都需要关联 GitHub，你可以用这种方式在本地测试。`lena-k` 是示例数据中持有任务的贡献者。
- **管理后台**（localhost:5173）：使用本地开发登录，并填写示例数据中的账户：`maintainer@example.com` 是维护者（可以接受建议、分配任务），`mara@example.com` 是普通成员。设置 `VITE_DEV_LOGIN_EMAIL` 可以自动填入邮箱。网站和管理后台共用同一个会话，切换账户前请先退出登录。

### 文件上传

设置 `DEV_LOGIN=true` 且没有配置 `BLOB_*` Token 时，所有上传（建议截图、简历、项目图片、文档和项目文件）都会保存到仓库中的 `.local-files/` 目录，而不是 Vercel Blob。你不需要 Vercel 账户。

公开文件由 API 通过 `http://localhost:8787/dev/files/…` 提供；私有文件保存在 `.local-files/_private/` 中，和生产环境一样，API 只会把它们发给有权限查看的人。删除该目录即可重新开始。

不要把生产环境的 Blob Token 放进你的 `.env`。

### Pull Request 与任务看板

没有我们 GitHub App 的密钥时，API 会在 [localhost:8787/dev/github](http://localhost:8787/dev/github) 模拟 GitHub。

以你关联的 GitHub 用户名在这里创建 Pull Request，并在描述中写上 `Task: NW-<n>`：任务看板会关联它，任务进入审核状态，和真实的 PR 一样。在这里合并后，任务就会完成。任务页面上的“Link a PR by hand”也能找到在这里创建的 PR。这些 PR 保存在内存中，API 重启后会清空。

### 邮件、定时任务和智能体

- **邮件**：没有 Resend 密钥时不会真正发送。登录验证码、通知和团队提醒都会打印在 API 日志中。你在 Outbox 中批准的邮件会显示为“已批准，未发送”。
- **定时任务**（提醒与自动释放、通知、清理）需要手动调用。在 `apps/api/.env` 中设置任意 16 个字符以上的 `CRON_SECRET`，然后运行，例如：`curl -H "Authorization: Bearer $CRON_SECRET" localhost:8787/cron/github-sync`。如果想看到提醒或自动释放，先在数据库中把任务的 `assigned_at` 和 `last_activity_at` 往前调 8 天或 15 天。
- **任务看板的 MCP** 也可以连接本地 API：在 localhost:3000/settings/tokens 创建 Token，并把 `http://localhost:8787/mcp` 添加为单独的服务器（例如 `novawerk-local`），与正式的服务器分开。

### 在网站上看到你的修改

网站会缓存项目和任务（Next.js Cache Components）。上面的 `WEB_REVALIDATE_*` 配置让 API 在数据变更后刷新缓存；没有这两项时，管理后台中的修改要过一段时间才会显示在网站上。

### 本地无法使用的功能

团队聊天（chat.novawerk.io 是单独部署的应用）、Google 登录（需要我们的 OAuth 客户端），以及在私有仓库 GitHub Actions 中运行的智能体（可以使用 `pnpm agent <id> --dry-run`）。

### 使用 AI 编程智能体

使用 Claude Code 或其他编程智能体？它会阅读 [AGENTS.md](AGENTS.md)。在 Claude Code 中，`nw-setup` Skill 会引导它完成上述环境配置、连接任务看板（MCP），以及查找或创建你的任务。

## 提交 Pull Request 之前

```bash
pnpm typecheck && pnpm test && pnpm lint
```

以上三项检查必须全部通过。CI 也会运行相同的检查。

如果修改了用户界面，请在 Pull Request 中附上截图，包括浅色和深色模式，以及桌面端和手机端的显示效果。

如果修改了仓库的配置、运行或测试方式（环境变量、脚本、示例数据、Mock、CI），或改动了贡献流程，请在同一个 Pull Request 中同步更新文档：本指南和英文版（[CONTRIBUTING.md](CONTRIBUTING.md)）要一起改，还有相关的 `.env.example` 文件、AGENTS.md，以及 `.claude/skills/` 中的 Skill。

## 开发规范

- **阅读 [CLAUDE.md](CLAUDE.md)。** 其中包含完整的项目规则。大部分规则只适用于特定类型的任务。

- **使用 Squash Merge。** 每个 Pull Request 合并到 `main` 后只保留一个 Commit，因此 PR 标题会成为 Commit Message。

  标题应遵循 Git 历史记录中的格式：`Area: what changed`，使用简单明了的语言。

  例如：`Agents: accept the private repo's workflows under ops/`。

- **前后端都必须验证输入。** 表单和 API 输入都必须使用 `packages/contracts` 中定义的 Zod Schema，分别在浏览器和 API 中进行验证。

- **数据库 Schema 变更。** 修改 `packages/db/src/schema.ts`，运行 `pnpm db:generate`，并提交生成的 Migration 文件。禁止手动修改 `packages/db/migrations/` 中的文件。

- **环境变量。** 在共享 Package 中，只有 `packages/config` 可以读取 `process.env`。应用应在边界处读取环境变量，再将配置值传递给其他模块。

- **对外发送邮件。** 所有发送给 Novawerk 外部人员的邮件都必须经过 Outbox，并等待维护者批准。不得添加绕过这一审核流程的方式。

- **使用简单明了的语言。** 界面文案和文档应使用简短句子、以“我们”为主语，并使用现在时态。避免使用 _leverage / ecosystem / stakeholders / synergy / disrupt / transform_ 等空泛的商业术语。

- **Next.js 16 存在破坏性变更。** 编写 Next.js 代码之前，请先阅读 `apps/web/node_modules/next/dist/docs/` 中的文档。

## 为 Commit 添加签署（DCO）

我们使用 [Developer Certificate of Origin（开发者来源证明）](https://developercertificate.org/)，不要求签署 CLA（贡献者许可协议）。

签署表示你确认自己编写了这些修改，或有权根据仓库的 MIT 许可证提交这些修改。

```bash
git commit -s -m "Web: fix the footer link"
```

该命令会在 Commit Message 中添加：

```text
Signed-off-by: Your Name <you@example.com>
```

签署信息必须与 Commit 的作者信息一致。

每个 Pull Request 都会运行检查，验证 Commit Message 是否包含签署信息。如果缺少签署，检查将失败。

如果忘记签署，可以运行：

```bash
git rebase --signoff main
git push --force-with-lease
```

## 我们的审核标准

- **符合任务要求。** 修改必须完成任务描述中的内容，并满足“Done when”列出的验收条件。
- **遵守项目规范。** 符合 `CLAUDE.md` 中的规则，包括前后端输入验证、通过 Migration 修改数据库 Schema、邮件 Outbox 审核机制，以及集中管理环境变量。
- **修改范围小且清晰。** 不包含无关改动。命名和注释应与现有代码风格保持一致。
- **经过测试。** 在项目已有测试的地方补充或运行相关测试，并确保所有检查通过。
- **确保安全。** 不得包含密钥，不得在日志或分析事件中记录个人数据。添加新依赖时，必须在 Pull Request 中说明理由。
- **文案符合项目的语言风格。**

我们可能会要求你修改提交的内容，这是正常的审核流程。如果无法合并，我们会说明原因。

## 禁止提交到本仓库的内容

- **密钥等敏感信息。** 密钥和 Token 应存储在 Vercel、GitHub Actions Secrets 或本地 `.env` 文件中（该文件已被 Git 忽略）。

- **内部记录和账户信息。** 会议纪要、决策记录、财务信息和合作伙伴备注应保存在私有仓库中。本仓库已通过 `.gitignore` 忽略 `records/` 目录。

- **使用密钥执行 Fork 代码的工作流。** 禁止使用 `pull_request_target`。

## 安全问题

发现安全漏洞？

请不要创建 Issue、任务或 Pull Request。

请发送邮件至 **security@novawerk.io**。

更多信息请参阅 [SECURITY.md](SECURITY.md)。

## 使用 AI 编程智能体？

请让智能体先阅读 [AGENTS.md](AGENTS.md)。

你仍然是代码的作者，需要审核智能体生成的内容，并为 Commit 添加 DCO 签署。
