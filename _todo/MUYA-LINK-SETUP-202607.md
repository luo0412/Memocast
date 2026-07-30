# @coolma/muya 本地链路（yarn link）配置文档

> 主项目（MemoCool/coolma）通过 `yarn link` 把 `_plugins/@coolma/muya/` 软链接成 `@coolma/muya` 包，
> 不需要发布到 npm registry，也不必把 muya 源码复制进主项目的 `node_modules`。

## 一次性配置

```bash
# 在主项目根目录
yarn plugin:muya:setup
```

这个命令链做三件事：

1. `cd _plugins/@coolma/muya && yarn install --ignore-engines`
   安装子项目独立依赖（snabbdom/popper.js/uuid/jquery/vue 等）。`--ignore-engines` 是为了让子项目 devDependencies
   里的 webpack 5/babel 7/... 与主项目的 engines 字段不打架。
2. `cd _plugins/@coolma/muya && yarn link`
   在子项目的 `node_modules/@coolma/muya` 写一个全局注册表条目，并提示完成。
   实际效果是 `yarn link` 创建了 `~/.config/yarn/link/@coolma/muya -> _plugins/@coolma/muya/` 的 junction。
3. `yarn link @coolma/muya`
   在主项目的 `node_modules/@coolma/muya` 上创建一个**指向子项目目录的 junction**。
   此后所有 `require('@coolma/muya')` / `require('@coolma/muya/lib/...')` 全部走 junction。

> Windows 上 yarn link 用 NTFS junction point（目录联接），无需管理员权限。
> macOS / Linux 用 symlink。需要开启「开发者模式」或 sudo（取决于系统）。

## 子命令分解

| 命令 | 何时用 |
|---|---|
| `yarn plugin:muya:install-deps` | 仅重装子项目依赖（不重建 junction） |
| `yarn plugin:muya:register` | 仅在子项目目录重新登记全局 link（如子项目路径变了） |
| `yarn plugin:muya:link` | 仅在主项目重新消费 link（如删过 `node_modules/@coolma/muya`） |
| `yarn plugin:muya:setup` | 一把全跑（首次安装 + 重置链路） |
| `yarn plugin:muya:unlink` | 撤销链路。需要重新 `yarn add @coolma/muya@0.1.2` 才能恢复 |
| `yarn plugin:muya:status` | 当前链路诊断，打印 `@coolma/muya` 解析到的真实路径 |

## 验证

```bash
yarn plugin:muya:status
```

期望输出：

```
linked: E:\path\to\coolma\_plugins\@coolma\muya\lib\index.js -> E:\path\to\coolma\_plugins\@coolma\muya\lib\index.js
```

realpath 与主链接路径一致，且都在 `_plugins/@coolma/muya/` 下，说明 junction 工作正常。

## 编辑后立刻生效（无需重装）

链路子项目源码的任何改动：

- 修改 `lib/**/*.js` 后保存 → Quasar dev server 的 webpack 自动 HMR
- 修改 `package.json`（dependencies / peerDependencies）后 → 需要先 `yarn plugin:muya:install-deps` 再 HMR

## 关键约束

1. **别在主项目根目录 run `yarn add @coolma/muya`**。这会破坏 junction。
   如果已经误跑，用 `yarn plugin:muya:link` 重新建立。
2. **别在子项目目录以外编辑 `lib/`**。所有改动都在 `_plugins/@coolma/muya/lib/` 内。
3. **dev server 编译时如遇 class-field syntax 报错**，确认 `quasar.conf.js` 的
   `transpileDependencies` 白名单里含有 `/@coolma.*/`。白名单是 webpack 把
   junction 路径识别为「可 babel 化」的关键。
4. **CI / 生产构建**用 `quasar build` 时，Quasar 会自动把 `yarn link` 解析成
   `~_plugins/@coolma/muya/lib`（依据 `quasar.conf.js` 的 `build.packagedBrowserResolve`,
   见 quasar 文档）。生产包**不依赖** junction。

## 撤销链路（回到 npm registry 版本）

```bash
yarn plugin:muya:unlink
yarn add @coolma/muya@0.1.2
```

撤销后 `@coolma/muya` 即回到 npm 安装的真实副本。
