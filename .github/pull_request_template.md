## 这次改了什么

<!-- 一两句说清动机；修 bug 请说明触发条件 -->

## 对应 issue

<!-- 例：Closes #12 ；没有对应 issue 可写「无」 -->

## 提交前自查

- [ ] `cd app && npm ci && npm run lint` 通过
- [ ] `npm run build` 与 `npm run build:online` 都通过
- [ ] **离线版产物里没有 `barcode-lookup`**（离线版承诺不含任何联网代码，这是硬红线）
- [ ] 改过 `website/` 的话，已重建并同步到仓库根的 `index.html`／`design.html`／`styles.css`
- [ ] 改过版本号的话，三处已同步：`app/src/lib/app-const.ts`、`app/android/app/build.gradle`、`app/package.json`
- [ ] 功能有变化的话，已在 `app/src/pages/ChangelogPage.tsx` 补上版本日志
- [ ] 功能有变化的话，已同步 `docs/码上记-App使用手册.md` 与 App 内置手册（`app/src/lib/manual-html.ts`）
- [ ] 没有引入账号、云同步、统计埋点等违背「数据不出设备」的依赖

## 影响范围

<!-- 是否影响数据模型 / 是否需要迁移 / 是否影响已发布版本的用户；没有可写「无」 -->

## 截图或录屏

<!-- 界面改动请附上前后对比；无则删除本节 -->
