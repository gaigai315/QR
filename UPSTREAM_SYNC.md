# 跟随原仓库更新

本仓库保留自己的优化，同时通过正常 Git 合并接收 `uhhhh15/QR` 的更新。

## 自动检查

`Propose upstream updates` 每天约北京时间 09:00 检查一次，也可以在 GitHub 的 Actions 页面手动运行。GitHub 的定时任务可能延迟。

发现新更新后，会创建一个更新提案（Pull Request）。主分支保持不变，确认酒馆显示正常后再合并。已有自动提案待确认时，不会重复创建或改写它；合并后，下次任务继续检查后续更新。关闭提案则表示跳过同一组上游和 fork 提交，仍可重新打开它。

发生合并冲突或优化检查失败时，任务停止并在 Actions 中显示失败原因，需要人工处理。不会通过强制覆盖解决冲突。

## 优化检查

`node scripts/check-fork.mjs` 会检查 JavaScript 语法、第三方按钮白名单识别、JSR/QR 按钮显隐、常规日志级别及排序按钮翻译。新增优化时，应把相应行为加入检查。检查不能代替酒馆内的实际主题兼容性验证。

## 首次启用

合并引入本文件的提案后，在仓库 Settings → Actions → General 中允许 GitHub Actions 创建 Pull Request，并在 Actions 页面确认 `Propose upstream updates` 已启用。定时任务只读取默认分支上的工作流；尚未合并的工作流不会开始运行。

## 手动处理冲突

从自己的 main 新建分支，获取原仓库 main 并正常合并，逐处处理冲突后运行优化检查，再提交更新提案。保留合并提交，不使用强制同步或整文件覆盖。

为了保留上游合并历史，更新提案请使用 **Create a merge commit**，避免 Squash and merge 或 Rebase and merge。否则后续检查可能再次把同一批上游提交视为未同步。
