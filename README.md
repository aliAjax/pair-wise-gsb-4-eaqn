# License Lens · 依赖许可证审查台

发版前的纯前端依赖许可证审查工具。粘贴或导入 `package-lock.json` 后，
按**包名、版本和安装路径**整理直接与传递依赖，根据**分发方式**给出放行建议，
处理结论会保存在浏览器中，关掉页面再打开仍在。

## 启动

```bash
npm install
npm run dev      # 本地开发
npm run build    # 类型检查 + 生产构建
```

## 功能

- **导入**：粘贴 lock 全文、选择文件、拖拽导入；支持 npm package-lock v1 / v2 / v3，内置示例清单。
- **依赖整理**：按包名、版本、路径区分节点；同一包名不同嵌套版本分别展示，标记直接（生产/开发）与传递依赖、optional、仅构建期与无引用项。
- **策略判断**：
  - 闭源交付时 GPL / AGPL（强 Copyleft）**阻止放行**；带 Classpath 等链接例外降为复核。
  - LGPL / MPL / EPL 等弱 Copyleft 闭源下进入复核；未知 / 未声明 / 专有许可证进入复核。
  - 支持 SPDX `AND` / `OR` / `WITH` / 括号表达式；OR 按可选择的最宽松许可证初判。
  - 仅 dev 依赖链上的 GPL 组件不随产物交付，默认降为复核。
  - 切换为「开源分发」后，强 Copyleft 不再阻断；未知许可证仍需复核。
- **引用链**：点击任意项查看从项目根到该包的最多 3 条完整引用链（按 npm 提升规则解析）、判定依据与处理表单。
- **闸门与统计**：顶部闸门对全量结果给出「可以放行 / 待复核 / 阻止放行」；统计卡片与风险 tab 计数实时跟随当前搜索与筛选结果。
- **人工结论**：每项可标记「接受 / 豁免」「驳回（须移除）」并写备注；阻断项未豁免或存在驳回项时闸门保持阻止。
- **持久化**：清单原文、来源文件、分发方式、处理结论存入 `localStorage`（key：`license-lens-console-v1`）。
- **导出**：按当前筛选结果导出 Markdown 审查报告（闸门结论按全量计算）。

## 代码结构（解析、判断、页面分离）

```
src/
  lib/
    parseLock.ts   解析层：package-lock 结构化、依赖图、可达范围与引用链（无许可证判断）
    policy.ts      判断层：SPDX 表达式解析、许可证族分类、按分发方式输出风险等级
    gate.ts        放行闸门：自动判定 + 人工结论 -> 最终放行状态
    storage.ts     持久化
    report.ts      Markdown 报告
    sample.ts      内置示例清单
    types.ts       共享类型
  components/      页面层：ImportPanel / GateBar / StatsBar / ResultsList / DetailPanel
  App.tsx          组合状态与筛选
```

> 工具只提供工程初判，不构成法律意见；GPL 兼容性与分发义务请以法务复核结论为准。
