# build-macos Action

从 Xcode 工程构建 macOS `.app`，使用 Developer ID 签名，生成经过 Apple 公证和装订的 DMG。首次发布后可通过示例中的 Action tag 调用。

## 接入

调用方在运行可信发布代码的独立 macOS runner 上选择项目所需的 Xcode，检出代码、准备依赖，并按需运行项目测试。工程、scheme 和 App 产物都唯一时，独立打包只需传入 `version-type`。使用 XcodeGen 的项目先生成工程。签名和公证凭据见 [macOS 签名与公证配置](macos-signing.md)。

### Workflow 示例

示例手动触发后检出所选分支或 tag，选择 Xcode 并用 XcodeGen 生成工程。默认从工程版本递增一个补丁版本，构建并公证所选架构，随后将 DMG 上传为 artifact。架构可多选，默认只选 Universal。完整配置见 [build-macos.yml](../examples/build-macos.yml)。

复制示例后，填写 `project-path` 和 `scheme`，按项目调整 Xcode 版本和工程生成步骤，并配置 Apple secrets。已有 Xcode 工程的项目可删除 XcodeGen 步骤。

## 输入与输出

### 输入

| 输入 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `project-path` | 否 | 自动识别 | 相对于仓库根目录的 `.xcodeproj` 或 `.xcworkspace` 路径 |
| `scheme` | 否 | 自动识别 | 能构建 macOS App 的 Xcode 方案。多个候选时填写要使用的名称 |
| `app-name` | 否 | 自动识别 | scheme 生成多个候选 App 时指定名称，省略 `.app` 后缀 |
| `version` | 与 `version-type` 至少填一项 | — | 最终版本；传入递增类型时作为基础版本 |
| `version-type` | 与 `version` 至少填一项 | — | `major`、`minor` 或 `patch`。只传此项时从工程版本递增 |
| `build-mode` | 否 | `Release` | 选择 Xcode 的构建模式：`Release` 用于发布，`Debug` 用于开发调试；也可填写工程中定义的自定义配置名称 |
| `universal` | 否 | — | 生成同时包含 `arm64` 和 `x86_64` 的 Universal 包 |
| `intel` | 否 | — | 生成仅含 `x86_64` 的 Intel 包 |
| `apple-silicon` | 否 | — | 生成仅含 `arm64` 的 Apple Silicon 包 |
| `entitlements-path` | 否 | 主 App target 的 `CODE_SIGN_ENTITLEMENTS` | 仓库相对路径，只覆盖主 App 的签名权限。内嵌组件各自读取权限 |
| `explicit-profile-app-id` | 否 | `false` | 设为 `true` 时要求主 App profile 的 `com.apple.application-identifier` 精确匹配构建产物的 App ID。启用后必须提供 profile，通配 App ID 不通过 |

三个架构输入全部省略时，Action 生成 Universal 包。只要传入任一开关，就只生成显式设为 `true` 的包。三项都选时会生成三个 DMG，包括一个 Universal 包和两个单架构包，`packages-json` 也会返回三项。例如，只打 Intel 包时，`with` 中只需加上 `intel: true`。传入的开关全部为 `false`（包括手动取消全部勾选）时，Action 在构建前提示至少选择一种架构并停止。

### 版本规则

`version` 和 `version-type` 至少传一个。`version-type` 接受 `major`、`minor` 或 `patch`，递增规则与 [changelog](changelog.md#输入与输出) 一致。递增时，基础版本须为 `X.Y.Z`。示例中的 `none` 表示省略 Action 的 `version-type`，此时须填写最终版本。

| `version` | `version-type` | 打包结果 |
| --- | --- | --- |
| `2.0.0` | 省略 | 直接使用 `2.0.0` |
| 省略 | `patch` | 从主 App 的 `MARKETING_VERSION` 递增，例如 `1.2.3` → `1.2.4` |
| `2.0.0` | `minor` | 从显式版本递增到 `2.1.0` |
| 省略 | 省略 | 构建前报错 |

配合 `changelog` 时，只把它算好的最终版本传给 `version`。PR 合并后再打包时，从合并后的发布说明记录读取该版本。

确定后的版本同时用于本次构建的发布版本和构建号，所有架构共用。同一基础版本以同一种方式重跑会得到相同的结果。

### 环境变量

| 名称 | 来源 | 必填 | 格式与用途 |
| --- | --- | --- | --- |
| `APPLE_DEVELOPER_ID_CERTIFICATE_P12` | Secret → `env` | 是 | Developer ID 证书与私钥的 Base64 P12 内容 |
| `APPLE_DEVELOPER_ID_CERTIFICATE_PASSWORD` | Secret → `env` | 是 | 导出 P12 时设置的密码 |
| `APPLE_DEVELOPER_ID_PROVISIONING_PROFILE` | Secret → `env` | 按 App 需要 | 主 App 的单份 Developer ID profile，以 Base64 编码 |
| `APPLE_API_KEY` | Secret → `env` | 是 | App Store Connect `.p8` 私钥原文 |
| `APPLE_API_KEY_ID` | Secret → `env` | 是 | App Store Connect API Key ID |
| `APPLE_API_ISSUER_ID` | Secret → `env` | 是 | App Store Connect API Issuer ID |

### 输出

| 输出 | 说明 |
| --- | --- |
| `version` | 本次成功打包的最终版本，所有架构共用 |
| `packages-json` | 已完成公证和装订的 DMG 信息。即使只生成一个包也返回 JSON 数组 |

`packages-json` 中每项包含以下字段。

| 字段 | 说明 |
| --- | --- |
| `architecture` | 包类型，取值为 `universal`、`intel` 或 `apple-silicon` |
| `path` | DMG 在当前 runner 上的绝对路径 |
| `filename` | 发布时使用的 DMG 文件名 |
| `sha256` | 最终 DMG 的 SHA-256 字符串 |
| `size` | 最终 DMG 的字节数（整数） |

## 构建与失败处理

1. 按上述规则确定要生成的包，架构开关的非空值只接受 `true` 或 `false`。检查工程、scheme 和凭据，自动选择唯一工程入口和 App scheme。探测某个 scheme 失败时会记录原因并继续。找到多个可用方案时列出候选名称，找不到时报告探测错误。
2. 用 `xcodebuild` 为每种选定架构分别构建未签名的 App，并核对主可执行文件的架构。全部构建完成后才将 P12 导入临时钥匙串。工程构建脚本的环境中不含 Action 的 Apple 凭据。
3. 在打包副本中检查每个内嵌组件，包括 framework、动态库、helper App、XPC 服务和扩展。组件含有多余架构时自动裁剪。例如，将 Universal framework 打入 Intel 包时只保留 `x86_64`。缺少目标架构时，报告组件路径和缺少的架构并停止。
4. 主 App 可使用环境变量传入的 profile。需要 profile 的扩展或 helper 须在构建产物中自带匹配的 `Contents/embedded.provisionprofile`。Action 按组件校验有效期、团队、证书、App ID 和权限范围。启用 `explicit-profile-app-id` 时，主 App 的 profile 必须提供 `com.apple.application-identifier`，且其值须精确等于 `ApplicationIdentifierPrefix` 与构建产物 `CFBundleIdentifier` 拼成的完整 App ID。此要求只约束主 App 的应用标识，Keychain access group 仍接受 profile 的通配授权。
5. 从内到外签名，最后签主 App。每个组件使用自己 Xcode target 的 `CODE_SIGN_ENTITLEMENTS`。预编译组件沿用所选架构已有的签名权限，无权限时按空权限签名。Universal 组件两个架构的既有权限冲突时停止。签名启用 Hardened Runtime 和安全时间戳，并逐项验证，最后递归验证整个 App。
6. 将签名后的 App 和指向 `/Applications` 的符号链接打入压缩 DMG，签名后用 `notarytool` 提交公证。取得提交 ID 后按该 ID 查询结果。Apple 拒绝时报告提交 ID，便于查询公证日志。
7. 收到 `Accepted` 后，将票据装订到 DMG，通过 `stapler validate` 和 Gatekeeper 评估，再对**最终 DMG** 计算 SHA-256 和字节数。

任一包失败时停止，报告包类型和失败步骤。所有选中的包都验证通过后，写入 `version` 和 `packages-json`。Action 在成功和失败时清理临时钥匙串和凭据文件，job 结束时再清理本次运行的产物目录，密钥仅通过环境变量传入，避免出现在命令行或日志中。

## 调用方发布

Universal 包沿用 `{app-name}-{version}.dmg`，Intel 和 Apple Silicon 包分别加上 `-intel.dmg` 和 `-apple-silicon.dmg` 后缀，例如 `App-1.2.3-intel.dmg`。调用方可根据 `packages-json` 中的文件名、SHA-256 和字节数生成下载元数据，并管理自己的版本提交、tag、GitHub Release 和 appcast。

调用方可用示例中的 `${{ steps.package.outputs.version }}` 更新项目的版本源文件或生成发布记录。

## 发布 build-macos Action（维护者）

在 **Publish action** 工作流中选择 `build-macos` 和版本增量。工作流会在发布任务中重新构建 Action，并将生成的 `dist` 放入版本快照。首次发布选择 `major` 可从 0.0.0 生成 `build-macos-v1.0.0` 并更新共享 `v1`。
