# PRIVACY-CRITERIA — v2 隐私判据与分析纪律

本文件定义 reviewly-nsh 的隐私判据（P1..P8）与分析纪律。所有判据对 Android / Web /
桌面三个平台同时成立。

## P1..P8 判据表

| # | 判据 | 落实方式 |
|---|---|---|
| P1 | **网络面最小化**：应用只能访问一个主机 `api.github.com` | `nsh.json` `capabilities.network.hosts: ["api.github.com"]`；NSH 沙箱在 Rust 引擎层强制执行，未列入的能力一律拒绝（含重定向逐跳检查），拒绝时 fetch 以 `ERR_ACCESS_DENIED` 拒绝 |
| P2 | **抓取的 PR 数据只存本机 Storage** | 一切抓取结果（PR 列表、files、diff、状态）只写本机 `Storage`（异步 K/V，每 app 5MB 配额）；无任何上传、遥测或第三方同步通道 |
| P3 | **凭据本机保存，最小暴露** | PAT 只存本机 `Storage`，仅随 GitHub 请求以 `Authorization: Bearer` 头发出；不进日志、不进批注、不出现在任何持久化的审查产物里 |
| P4 | **无 token 匿名降级** | 不配置 PAT 也能审公开仓库（60 req/h）；UI 常驻显示剩余配额（`x-ratelimit-remaining` / `x-ratelimit-reset`），不诱导用户扩大权限 |
| P5 | **抓取最小化（懒加载）** | 列表探针一次拿全；四元组 `state + merged + updatedAt + headSha` 不变的 PR 不拉全量；diff 只在打开详情页时拉。对 GitHub 的请求量被压到语义必需的最小集 |
| P6 | **用户数据可完全清除** | 设置页提供「清空缓存」；删除应用即删除其 `Storage` 数据（宿主决定存储位置，应用无文件系统散布——未声明 `fs` 能力） |
| P7 | **分析产物只含人工批注，禁止原文粘贴** | 库里唯一的用户生成内容是审查批注 `Review`（verdict + summary + annotations）；任何分析/日志/诊断记录只允许记「类别 + 位置」，禁止粘贴 PR 原文（见下节纪律） |
| P8 | **展示层无硬编码事实** | UI 一切 GitHub 字段来自 store（抓取后入库），展示代码零 raw hex/RGBA（一律 theme token）；界面手抄 GitHub 字段视为违反第一定律，也是隐私面（事实第二来源）的违规 |

## 分析记录纪律

任何分析记录（bug 报告、性能记录、诊断日志、issue 描述、文档示例）必须遵守：

- **只记类别 + 位置**：例如「Inbox 列表页 rate-limit 行」「PR 详情页 DiffView 行选择」
  「store.ts 的 syncRepo」。类别描述界面/代码区域，位置给文件与函数名。
- **禁止粘原文**：不粘贴 PR 标题、diff 内容、文件名组合、批注正文等抓取或用户数据的
  原文。需要举例时用合成占位（`owner/repo`、PR #N、`path/to/file`）。
- 原因：分析记录会离开本机（提交到仓库、贴到 issue），本机 `Storage` 里的 PR 数据
  属于被审查的代码库，粘出去等于绕过 P2 的本机边界。

## 存储边界

- 抓取的 PR 数据只存本机 `Storage`——这是 P2 的重申，也是全应用存储的唯一定律：
  `Storage`（异步 K/V，每 app 5MB 配额）承担 v1 redb 的角色，没有数据库文件、没有
  导出、没有网络回写（GitHub 只读，应用不写任何 PR 数据回 GitHub；唯一「写」是用户
  自发的审查批注保存在本机）。
- `Storage` 是 NSH 应用沙箱内的私有存储：应用未声明 `fs` 能力，无法触及文件系统；
  宿主决定存储的物理位置，应用不可见也不可移动。
