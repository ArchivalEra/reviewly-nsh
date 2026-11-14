# reviewly-nsh

[![facts](https://img.shields.io/badge/facts-Einfacht-blue)](STATE.md)

[Reviewly](https://github.com/volnei/reviewly) 的审查流，以 [NSH（Native Shell, nsh.dev）](https://nsh.dev) 应用重写：
一个 TSX 代码库，同时跑在 **Android / Web / 桌面**。参考实现（Tauri 桌面应用）的职责划分、
数据流与审查语义全部继承；本仓库是 v2 唯一交付物，最终以 PR 回推
`ArchivalEra/reviewly-nsh` 独立维护。

**语言：** [English](README.md)（默认）· [README.zh.md（简体中文，本文件）](README.zh.md)

## 使命

把 Reviewly 的 PR 审查流带到 Android / Web / 桌面：应用自动发现已配置仓库的全部 PR，
懒加载 diff，行级批注，并把「PR 变更 ⇒ 强制重审」作为一等语义。三个文档构成 v2 的
产品契约：

| 文档 | 内容 |
|---|---|
| [INTAKE.md](INTAKE.md) | v2 的摄入理念：报告者不再登记，PR 提交本身就是事实 |
| [PRIVACY-CRITERIA.md](PRIVACY-CRITERIA.md) | P1..P8 隐私判据与分析纪律 |
| [README.md](README.md) | 本文件：使命、三法律、平台矩阵、运行命令、目录说明 |

## Einfacht 三法律

语义内核继承 Einfacht 三法律，全部行为由此推导：

1. **事实仅生产一次**。GitHub 返回的一切（PR 元数据、files、diff、状态）由应用调
   `fetch` 抓取后直接入库（`Storage`），UI 只从 store 读。除用户写的审查批注外，
   任何界面禁止手抄/硬编码 GitHub 字段。
2. **懒加载**。列表探针（`GET /repos/{o}/{r}/pulls` 一次拿全列表）与库中缓存比对，
   四元组 `state + merged + updatedAt + headSha` 不变 ⇒ 不拉该 PR 的全量；变了才
   拉详情（`/pulls/{n}` + `/files`，diff 按需）。不打开详情页不拉 diff。
3. **PR 更改 ⇒ 强制重审**。当前 `headSha` 与库中已存批注绑定的 `headSha` 不一致 ⇒
   该 PR 批注状态 `STALE`（UI 显式标注，旧批注保留）；重新保存批注（绑定当前
   head）后回 `fresh`。

## 平台矩阵

NSH 每个平台有自己的原生后端；同一份 TSX 代码在 QuickJS（Web 上为浏览器自身
JS 引擎）中运行，原生侧渲染。

| 平台 | 运行（开发） | 打包 |
|---|---|---|
| Linux（GTK 4） | `nsh run --target linux` | `nsh package --target linux` |
| macOS（AppKit） | `nsh run --target macos` | `nsh package --target macos` |
| Windows（Win32） | `nsh run --target windows` | `nsh package --target windows` |
| Android | `nsh run --target android` | `nsh package --target android`（.apk） |
| Web | `nsh run --target web` | `nsh package --target web`（静态站；输出目录由 `--out` 控制） |

## 运行命令

工具链来自 `nsh` CLI（本机 `nsh` 或 checkout 里的 `target/<profile>/nsh`），纯 Rust，
不需要 Node.js。

```sh
nsh dev                    # 开发服务器 + 开发宿主，保存即热重载
nsh run                    # 开发模式下在本机默认平台跑应用
nsh run --target web       # 浏览器里跑（dev server 提供页面）
nsh run --target android   # 模拟器/设备上跑（需 cargo xtask android --dev 准备运行时）
nsh package --target web   # 打包为静态站（默认输出 .nsh/out/<name>/；--out 可改）
nsh check                  # 类型检查
nsh test                   # 跑 *.test.tsx（headless；--target web 用无头 Chrome）
```

## 目录说明

```
reviewly-nsh/
├── nsh.json            # NSH 应用清单：capabilities.network.hosts=["api.github.com"]、theme 指向 theme.json
├── App.tsx             # 入口：mount + NavStack
├── nav.ts              # 路由：Route = inbox | pr | settings
├── store.ts            # signals + fetch 层（repos/settings/prs/rateLimit/syncState + 动作）
├── theme.json          # 语义 token（background/foreground/muted/accent/success/danger/border/card）
├── pages/              # 一页一文件：Inbox、PR 详情、设置
├── components/         # 共享组件
├── lib/
│   ├── gh.ts           # GitHub API 客户端：fetch 封装、鉴权头、速率头、探针/全量/diff、懒加载判定
│   └── gh.test.ts      # gh.ts 的单测
└── *.test.tsx          # §SELFTEST 场景（T1..T7）测试
```

## 数据与隐私

- 抓取的 PR 数据只存本机 `Storage`（异步 K/V，每 app 5MB 配额），不上传任何服务器。
- 唯一人工输入是 PAT 与仓库清单，都在设置页；报告者不再登记（见 [INTAKE.md](INTAKE.md)）。
- 网络面只有一个主机：`nsh.json` `capabilities.network.hosts: ["api.github.com"]`，
  其余一律被 NSH 沙箱拒绝。隐私判据见 [PRIVACY-CRITERIA.md](PRIVACY-CRITERIA.md)。

## 测试

`nsh test`（Web target，浏览器引擎跑真组件；环境缺浏览器时降级 `--target linux` +
Xvfb）。验收场景 T1..T7 见工作区 `APP-SPEC.md` §SELFTEST：事实仅生产一次、探针懒加载、
STALE→fresh、批注绑 head、PAT/匿名配额、空仓/网络失败不崩、`Storage` 持久化。

场景测试与 `lib/gh.ts` 的单测分别放在 `*.test.tsx` 与 `lib/gh.test.ts`。
