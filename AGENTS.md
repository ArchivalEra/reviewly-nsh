# AGENTS.md

规则住 `zreflect/doc.py`（`RULES`），状态住 `STATE.md`，无历史文档。

```bash
python3 zreflect/registry.py --run commit
python3 zreflect/harness.py
```

## Push

唯一写通道是 SSH 经 akr FIDO2 agent：每次 push 手机弹推送，站长 Allow 才完成。
gh token 是 fine-grained 只读，HTTPS push 403。github 直连超时，代理必须。

```bash
export https_proxy=http://127.0.0.1:2080 http_proxy=http://127.0.0.1:2080
set -a && . ./reflect-hooks/Einfacht.env && set +a   # 本仓 pre-push 闸门要的旋钮，命令以能顺利通过为准
git push origin feat/nsh-app:main                     # 经 github-ArchivalEra 别名，锁 ArchivalEra SK key
```

push 前跑 `code-review` skill 审自己的改动，把审查结论和改动说明写在输出里，然后停止
输出。站长看的是会话最后那段输出，回复后才能推。commit message 带审查结论和改动；
缺样的 push 被无视。wo-u 是 agent 电话，站长不通过它收消息。
操作细节（分身份 Host、akr 安装、IdentitiesOnly 坑、退役 key、代理布局）在
NOTES.local.md（gitignored）。
