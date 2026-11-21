# macOS 直接分发的 Apple 签名与公证凭据

在 App 仓库的 **Settings → Secrets and variables → Actions → Secrets** 中配置证书、密码、可选 profile 和公证凭据。完整变量表和 workflow 示例见 [build-macos 接入文档](build-macos.md)。

## 签名证书与 P12

### 在 Apple Developer 申请证书

由 Apple Developer Program 团队的 **Account Holder** 操作。如果 Mac 钥匙串中已有该团队有效的 Developer ID Application 证书及配对私钥，可直接进入下一节。[Apple 证书说明](https://developer.apple.com/help/account/certificates/create-developer-id-certificates/)

1. 登录 Apple Developer，进入 **Account → Certificates, Identifiers & Profiles**。账号关联多个团队时，选中 App 所属团队。打开左侧 **Certificates**，点击列表上方的 **+**。[打开证书列表](https://developer.apple.com/account/resources/certificates/list)
2. 在 **Software** 下选择 **Developer ID Application**，点击 **Continue**。若页面先按类别列出 **Developer ID**，进入该类别后再选 **Application**。
3. 到上传证书请求页面时，在 Mac 上打开“钥匙串访问 → 证书助理 → 从证书颁发机构请求证书”。填写邮箱和常用名称，选择“存储到磁盘”，保存 `.certSigningRequest` 文件。[创建 CSR](https://developer.apple.com/help/account/certificates/create-a-certificate-signing-request)
4. 回到网页，点击 **Choose File**，选中刚保存的 CSR，点击 **Continue**。证书生成后点击 **Download**，在生成 CSR 的那台 Mac 上双击下载的 `.cer` 文件。

### 在 Mac 上导出签名身份

1. 运行 `security find-identity -v -p codesigning`，按名称末尾的 Team ID 找到 App 所属团队的 Developer ID Application 身份。导出的 P12 只需包含这一个签名身份。
2. 在“钥匙串访问 → 登录 → 我的证书”中展开该证书，确认有对应私钥，将证书连同私钥导出为 `.p12`。导出密码存入 `APPLE_DEVELOPER_ID_CERTIFICATE_PASSWORD`。在 Mac 上运行下列命令，将剪贴板中的值粘贴到 `APPLE_DEVELOPER_ID_CERTIFICATE_P12`。

   ```bash
   base64 -i "/path/to/developer-id.p12" | tr -d '\n' | pbcopy
   ```

## Provisioning profile（按需）

App 使用需要 profile 授权的 entitlement（如 `keychain-access-groups`）时执行以下步骤。其余 App 可跳过此节。[macOS 分发签名说明](https://developer.apple.com/documentation/xcode/creating-distribution-signed-code-for-the-mac/)

### 注册或选择 App ID

1. 在 Apple Developer 打开 **Identifiers**，按待分发 App 的 Bundle ID 查找已有 App ID。如果已注册，打开它，确认 **Capabilities** 中已启用 App 所需的能力，然后继续创建 profile。[打开标识符列表](https://developer.apple.com/account/resources/identifiers/list)
2. 如需新建，点击 **+**，选择 **App IDs → Continue**，再选择 **App → Continue**。
3. 在 **Description** 填写便于识别的 App 名称。在 **Bundle ID** 处选择 **Explicit**，填写所选构建配置的 `PRODUCT_BUNDLE_IDENTIFIER`。勾选所需的 **Capabilities**，点击 **Continue**，核对后点击 **Register**。[注册 App ID](https://developer.apple.com/help/account/identifiers/register-an-app-id/)

### 生成并下载 profile

1. 打开左侧 **Profiles**，点击 **+**。在 **Distribution** 下选择 **Developer ID**，点击 **Continue**。如需选择平台，原生 macOS App 选 **Mac**。[打开描述文件列表](https://developer.apple.com/account/resources/profiles/list)
2. 在 **App ID** 下拉框选择刚确认的 Bundle ID，点击 **Continue**。在证书列表中勾选导出 P12 时使用的 **Developer ID Application** 证书，再点击 **Continue**。
3. 填写 **Provisioning Profile Name**，例如 `MyApp Developer ID`。点击 **Generate**，再点击 **Download**，保存 `.provisionprofile` 文件。
4. 为主 App 配置时，在 Mac 上执行下列命令，把剪贴板内容粘贴到 `APPLE_DEVELOPER_ID_PROVISIONING_PROFILE`。Action 从所选 target 读取签名权限文件。需要覆盖时传入 `entitlements-path`，其中受限权限须在 profile 的授权范围内。

   ```bash
   base64 -i "/path/to/App.provisionprofile" | tr -d '\n' | pbcopy
   ```

扩展或 helper 也需要 profile 时，用该组件自己的 Bundle ID 重复上述申请步骤，并在其 Xcode 构建阶段将文件复制到该组件的 `Contents/embedded.provisionprofile`。

## 公证用 Team API Key

1. 登录 App Store Connect，选择 App 所属团队，打开 **Users and Access → Integrations**，选择 **App Store Connect API**。[打开 App Store Connect](https://appstoreconnect.apple.com/)
2. 如果看到 **Request Access**，由 **Account Holder** 点击该按钮，勾选同意条款并点击 **Submit**。申请获批后回到此页。已开通 API 的团队直接进入 **Team Keys**。[Apple 开通说明](https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-api/)
3. 由 **Account Holder 或 Admin** 在 **Team Keys** 中点击 **Generate API Key**。已有有效密钥时点击列表上方的 **+**。在 **Name** 填写用途，例如 `macOS Notarization`，在 **Access** 选择 **Developer**，然后点击 **Generate**。
4. 在生成的密钥那一行复制 **Key ID**，存入 `APPLE_API_KEY_ID`。复制 **Team Keys** 页面上团队的 **Issuer ID**，存入 `APPLE_API_ISSUER_ID`。
5. 点击该密钥对应的 **Download API Key** 下载 `.p8`。私钥仅能下载一次，请安全备份。将完整文件原文存入 `APPLE_API_KEY`，保留首尾标记和换行。[Apple API Key 说明](https://developer.apple.com/documentation/appstoreconnectapi/creating-api-keys-for-app-store-connect-api)
