#!/bin/bash
# 从本机钥匙串导出 Developer ID Application 证书为 .p12，供 GitHub Actions 使用。
set -euo pipefail

IDENTITY='Developer ID Application: RUI WANG (JKMD2S24N4)'
OUT="${1:-$HOME/Desktop/Opptrix-DeveloperID.p12}"

if ! security find-identity -v -p codesigning | grep -qF "$IDENTITY"; then
  echo "未找到证书: $IDENTITY"
  echo "请先在 Xcode → Settings → Accounts → Manage Certificates 创建 Developer ID Application。"
  exit 1
fi

read -rsp "设置 .p12 导出密码（将写入 GitHub Secret CSC_KEY_PASSWORD）: " EXPORT_PW
echo
read -rsp "确认密码: " EXPORT_PW2
echo
if [[ "$EXPORT_PW" != "$EXPORT_PW2" ]]; then
  echo "两次密码不一致"
  exit 1
fi

security export -k "$HOME/Library/Keychains/login.keychain-db" \
  -t identities -f pkcs12 -P "$EXPORT_PW" -o "$OUT" "$IDENTITY"

echo ""
echo "已导出: $OUT"
echo ""
echo "=== 下一步：配置 GitHub Secrets ==="
echo ""
echo "1) CSC_LINK（p12 的 Base64）:"
echo "   base64 -i \"$OUT\" | pbcopy && echo '已复制到剪贴板'"
echo ""
echo "2) CSC_KEY_PASSWORD = 你刚才设置的导出密码"
echo "3) APPLE_ID          = imfreerich@qq.com"
echo "4) APPLE_TEAM_ID     = JKMD2S24N4"
echo "5) APPLE_APP_SPECIFIC_PASSWORD = 在 https://appleid.apple.com 生成"
echo ""
echo "用 gh CLI 写入示例:"
echo "   gh secret set CSC_LINK --repo Travisun/Opptrix < <(base64 -i \"$OUT\")"
echo "   gh secret set CSC_KEY_PASSWORD --repo Travisun/Opptrix"
echo "   gh secret set APPLE_ID --repo Travisun/Opptrix"
echo "   gh secret set APPLE_TEAM_ID --repo Travisun/Opptrix"
echo "   gh secret set APPLE_APP_SPECIFIC_PASSWORD --repo Travisun/Opptrix"
