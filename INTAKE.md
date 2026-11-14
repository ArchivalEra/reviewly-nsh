# INTAKE — v2 摄入理念

reviewly 的 v1 里，报告者要先登记：把要审查的 PR 手动录入系统，应用才知道要看什么。
v2 推翻这一点。

## 报告者不再登记——PR 提交本身就是事实

在 GitHub 的世界里，PR 被提交的那一刻它就已经存在、可枚举、可校验。v2 应用不做
任何人工登记：

- **应用自动发现**。用户配置了仓库（`owner/repo`）之后，应用调列表探针
  `GET /repos/{o}/{r}/pulls?state=all&per_page=100&sort=updated&direction=desc`，
  一次拿全该仓库的 PR 列表（`number, title, user.login, state, merged_at,
  updated_at, head.sha, additions, deletions, changed_files`）直接入库。
  PR 的提交动作本身构成了「有 PR 要审」这一事实的完整证据，无需任何人转述或登记。
- **没有第二个事实来源**。UI 显示的一切 PR 字段都来自 store（fetch 抓取后入库的
  `Storage`），不允许手抄。报告中不存在「人告诉应用 PR 是什么样」的通道——只有
  GitHub 返回什么、应用就记录什么（Einfacht 第一定律：事实仅生产一次）。
- **发现是懒的、增量的**。探针结果与库中缓存比对，四元组
  `state + merged + updatedAt + headSha` 完全一致的 PR 跳过全量；任一不同（或库中
  无记录）才拉 `/pulls/{n}` + `/files`（diff 只在打开详情页时拉）。

## 人类唯一输入

整个应用的人类输入收敛到设置页两样东西：

1. **PAT**（GitHub Personal Access Token）。密码框输入，存 `Storage`；`fetch` 带
   `Authorization: Bearer <token>`。没有 token 时匿名访问公开仓库（60 req/h），
   UI 常驻显示 `x-ratelimit-remaining` / `x-ratelimit-reset`。
2. **仓库清单**。逐个添加/删除 `owner/repo`；列表页按仓库切换。

都在设置页（路由 `{name:"settings"}`）。除这两项外，应用不向人要任何信息——
PAT 决定「以什么身份抓」，仓库清单决定「抓哪里」，抓什么、什么时候抓、抓到什么，
全部由 GitHub API 与三法律决定。

报告者（开发者本人或团队成员）的体验是：push 一个 PR，打开应用，PR 已经在列表里，
带上最新 `sha` 与审查状态徽标（fresh / STALE / unreviewed）。无需任何登记动作。
