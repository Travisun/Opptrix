# Opptrix update trust (self-issued)

这些公钥会打进桌面客户端，用于校验自动更新包。

| 文件 | 用途 |
|------|------|
| `opptrix-update-root.pem` | 更新根 CA（内置信任锚） |
| `opptrix-code-signing.crt` | 当前代码签名叶证书 |
| `opptrix-update-trust.json` | CN / 指纹元数据 |

**私钥不进仓库**：本地 `apps/desktop/.secrets/`（已 gitignore）。

生成：

```bash
node apps/desktop/scripts/generate-update-signing-certs.mjs
```

上传到 GitHub Secrets：

- `OPPTRIX_CODE_SIGNING_P12` — `.p12` 的 base64
- `OPPTRIX_CODE_SIGNING_P12_PASSWORD` — 导出密码

Windows CI 把它当作 `WIN_CSC_*` 使用；客户端用自定义验签信任本目录根证书（不依赖系统信任库）。

Linux 发版后可用 `node apps/desktop/scripts/sign-update-artifact.mjs apps/desktop/release` 生成 `*.opptrix-cms` 并随安装包上传。
