#!/usr/bin/env bash
# Opptrix Linux bootstrap — install Docker (if needed), Opptrix-managed Node, and `opptrix` CLI.
#
# Official path (servers):
#   curl -fsSL https://raw.githubusercontent.com/Travisun/Opptrix/main/scripts/bootstrap/linux.sh | bash
#   # or from a clone:
#   ./scripts/bootstrap/linux.sh
#
# Env:
#   OPPTRIX_BUILD_MIRROR=cn|foreign|auto   (default: auto)
#   OPPTRIX_REPO_DIR=~/Opptrix             clone / use this directory
#   OPPTRIX_GIT_URL=…                      国外默认 GitHub（可覆盖）
#   OPPTRIX_GIT_URL_CN=…                   国内默认 Gitee（可覆盖）
#   OPPTRIX_GIT_URL_OVERRIDE=…             强制单一 clone URL（不分国内/国外）
#   OPPTRIX_NODE_VERSION=24.11.1           managed Node pin (see scripts/lib/ci-pins.env)
#   OPPTRIX_SKIP_DOCKER=1                  do not install Docker
#   OPPTRIX_SKIP_NODE=1                    do not install managed Node
#   OPPTRIX_SKIP_CLI=1                     do not link CLI
#   OPPTRIX_BOOTSTRAP_UP=1                 after CLI: init + up --skip-models
#   OPPTRIX_NONINTERACTIVE=1               less prompts (CI)
#
# Windows / macOS: not supported here — install Docker + Node yourself, then:
#   node scripts/opptrix.mjs install-cli && opptrix up --mirror cn|foreign
#
set -euo pipefail

OPPTRIX_NODE_VERSION="${OPPTRIX_NODE_VERSION:-24.11.1}"
OPPTRIX_REPO_DIR="${OPPTRIX_REPO_DIR:-$HOME/Opptrix}"
OPPTRIX_GIT_URL="${OPPTRIX_GIT_URL:-https://github.com/Travisun/Opptrix.git}"
OPPTRIX_GIT_URL_CN="${OPPTRIX_GIT_URL_CN:-https://gitee.com/Travisun/Opptrix.git}"
RUNTIME_ROOT="${OPPTRIX_RUNTIME_ROOT:-$HOME/.opptrix/runtime}"
MANAGED_NODE_DIR="$RUNTIME_ROOT/node"
BIN_DIR="${OPPTRIX_BIN_DIR:-$HOME/.local/bin}"
MIRROR_MODE="${OPPTRIX_BUILD_MIRROR:-auto}"

log() { printf '[opptrix-bootstrap] %s\n' "$*"; }
warn() { printf '[opptrix-bootstrap] WARN: %s\n' "$*" >&2; }
die() { printf '[opptrix-bootstrap] ERROR: %s\n' "$*" >&2; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "缺少命令: $1"
}

os_is_linux() {
  case "$(uname -s 2>/dev/null || true)" in
    Linux|linux) return 0 ;;
    *) return 1 ;;
  esac
}

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64) echo x64 ;;
    aarch64|arm64) echo arm64 ;;
    *) die "暂不支持的 CPU 架构: $(uname -m)（需要 x86_64 或 aarch64）" ;;
  esac
}

# Resolve cn | foreign
resolve_mirror() {
  local mode="$1"
  case "$mode" in
    cn|china|domestic|zh) echo cn ;;
    foreign|default|hub|overseas) echo foreign ;;
    auto|'')
      if [ -n "${OPPTRIX_FORCE_CN:-}" ]; then
        echo cn
        return
      fi
      # Heuristic: TZ / locale, then quick TCP to Docker Hub auth
      case "${TZ:-}${LC_ALL:-}${LANG:-}" in
        *Shanghai*|*Chongqing*|*Urumqi*|*zh_CN*|*zh-CN*) echo cn; return ;;
      esac
      if command -v timedatectl >/dev/null 2>&1; then
        if timedatectl 2>/dev/null | grep -qiE 'Asia/Shanghai|Asia/Chongqing|China'; then
          echo cn
          return
        fi
      fi
      if command -v timeout >/dev/null 2>&1; then
        if ! timeout 2 bash -c 'echo >/dev/tcp/auth.docker.io/443' 2>/dev/null; then
          echo cn
          return
        fi
      fi
      echo foreign
      ;;
    *) die "未知 OPPTRIX_BUILD_MIRROR=$mode（用 cn / foreign / auto）" ;;
  esac
}

have_docker() {
  docker version --format '{{.Server.Version}}' >/dev/null 2>&1 \
    && docker compose version >/dev/null 2>&1
}

install_docker_debian_family() {
  local mirror="$1"
  need_cmd apt-get
  export DEBIAN_FRONTEND=noninteractive
  sudo apt-get update -y
  sudo apt-get install -y ca-certificates curl gnupg

  if [ "$mirror" = cn ]; then
    # Aliyun Docker CE mirror (Debian/Ubuntu)
    local codename
    codename="$(. /etc/os-release && echo "$VERSION_CODENAME")"
    local id
    id="$(. /etc/os-release && echo "$ID")"
    sudo install -m 0755 -d /etc/apt/keyrings
    if [ ! -f /etc/apt/keyrings/docker.gpg ]; then
      curl -fsSL "https://mirrors.aliyun.com/docker-ce/linux/${id}/gpg" \
        | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
      sudo chmod a+r /etc/apt/keyrings/docker.gpg
    fi
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://mirrors.aliyun.com/docker-ce/linux/${id} ${codename} stable" \
      | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
    sudo apt-get update -y
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  else
    # Official convenience script (best-effort)
    curl -fsSL https://get.docker.com | sudo sh
  fi
}

install_docker_rhel_family() {
  local mirror="$1"
  if command -v dnf >/dev/null 2>&1; then
    if [ "$mirror" = cn ]; then
      sudo dnf -y install yum-utils
      sudo yum-config-manager --add-repo https://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo || true
      sudo sed -i 's|download.docker.com|mirrors.aliyun.com/docker-ce|g' /etc/yum.repos.d/docker-ce.repo 2>/dev/null || true
      sudo dnf -y install docker-ce docker-ce-cli containerd.io docker-compose-plugin || \
        sudo dnf -y install docker docker-compose
    else
      curl -fsSL https://get.docker.com | sudo sh
    fi
  elif command -v yum >/dev/null 2>&1; then
    curl -fsSL https://get.docker.com | sudo sh
  else
    die "无法识别的包管理器，请手动安装 Docker Engine 后重跑"
  fi
}

configure_docker_registry_mirrors_cn() {
  if [ ! -d /etc/docker ]; then
    sudo mkdir -p /etc/docker
  fi
  if [ -f /etc/docker/daemon.json ]; then
    log "已存在 /etc/docker/daemon.json，跳过写入 registry-mirrors（请按需手工配置）"
    return 0
  fi
  sudo tee /etc/docker/daemon.json >/dev/null <<'EOF'
{
  "registry-mirrors": [
    "https://docker.1ms.run"
  ]
}
EOF
  log "已写入国内 registry-mirrors → /etc/docker/daemon.json"
}

ensure_docker() {
  if have_docker; then
    log "Docker 已可用: $(docker version --format '{{.Server.Version}}' 2>/dev/null || echo ok)"
    return 0
  fi
  if [ "${OPPTRIX_SKIP_DOCKER:-}" = 1 ]; then
    die "未检测到 Docker，且设置了 OPPTRIX_SKIP_DOCKER=1"
  fi
  need_cmd curl
  command -v sudo >/dev/null 2>&1 || die "安装 Docker 需要 sudo"
  local mirror="$1"
  log "正在安装 Docker Engine（mirror=$mirror）…"

  if [ -f /etc/os-release ]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    case "${ID_LIKE:-}|${ID:-}" in
      *debian*|*ubuntu*|debian|ubuntu)
        install_docker_debian_family "$mirror" || true
        ;;
      *rhel*|*fedora*|*centos*|fedora|rhel|centos|rocky|almalinux)
        install_docker_rhel_family "$mirror" || true
        ;;
      *)
        warn "未识别发行版 ${ID:-unknown}，尝试 get.docker.com"
        curl -fsSL https://get.docker.com | sudo sh || true
        ;;
    esac
  else
    curl -fsSL https://get.docker.com | sudo sh || true
  fi

  if [ "$mirror" = cn ]; then
    configure_docker_registry_mirrors_cn || true
  fi

  if command -v systemctl >/dev/null 2>&1; then
    sudo systemctl enable --now docker 2>/dev/null || sudo service docker start 2>/dev/null || true
  fi

  # Allow current user without permanent root (may need re-login)
  if getent group docker >/dev/null 2>&1; then
    if ! id -nG "$USER" 2>/dev/null | grep -qw docker; then
      sudo usermod -aG docker "$USER" || true
      warn "已将 $USER 加入 docker 组；若 docker 仍无权限，请重新登录后再跑本脚本"
    fi
  fi

  # Retry with sg docker if needed
  if ! have_docker; then
    if command -v sg >/dev/null 2>&1; then
      sg docker -c 'docker version' >/dev/null 2>&1 || true
    fi
  fi

  if ! have_docker; then
    # last resort: sudo docker
    if sudo docker version --format '{{.Server.Version}}' >/dev/null 2>&1 \
      && sudo docker compose version >/dev/null 2>&1; then
      warn "当前仅 root/sudo 可访问 docker。请重新登录后再用 opptrix，或暂时: sudo opptrix …"
      return 0
    fi
    die "Docker 安装后仍不可用。请检查虚拟化/防火墙后重跑，或手动安装 Docker Engine。"
  fi
  log "Docker 安装完成"
}

node_major() {
  local v
  v="$(node -v 2>/dev/null || true)"
  v="${v#v}"
  echo "${v%%.*}"
}

system_node_ok() {
  command -v node >/dev/null 2>&1 || return 1
  local maj
  maj="$(node_major)"
  [ -n "$maj" ] && [ "$maj" -ge 24 ] 2>/dev/null
}

download_node_tarball() {
  local ver="$1" arch="$2" mirror="$3" out="$4"
  local file="node-v${ver}-linux-${arch}.tar.xz"
  local urls=()
  if [ "$mirror" = cn ]; then
    urls+=(
      "https://npmmirror.com/mirrors/node/v${ver}/${file}"
      "https://cdn.npmmirror.com/binaries/node/v${ver}/${file}"
      "https://nodejs.org/dist/v${ver}/${file}"
    )
  else
    urls+=(
      "https://nodejs.org/dist/v${ver}/${file}"
      "https://npmmirror.com/mirrors/node/v${ver}/${file}"
    )
  fi
  local u
  for u in "${urls[@]}"; do
    log "下载 Node ${ver} ← $u"
    if curl -fL --retry 3 --retry-delay 2 --connect-timeout 20 -o "$out" "$u"; then
      return 0
    fi
    warn "下载失败，尝试下一源…"
  done
  return 1
}

ensure_managed_node() {
  local mirror="$1"
  if [ "${OPPTRIX_SKIP_NODE:-}" = 1 ]; then
    system_node_ok || die "OPPTRIX_SKIP_NODE=1 但系统 Node < 24"
    log "跳过托管 Node，使用系统 $(node -v)"
    return 0
  fi

  if [ -x "$MANAGED_NODE_DIR/bin/node" ]; then
    local maj
    maj="$("$MANAGED_NODE_DIR/bin/node" -v 2>/dev/null | sed 's/^v//;s/\..*//')"
    if [ -n "$maj" ] && [ "$maj" -ge 24 ] 2>/dev/null; then
      log "已有托管 Node: $("$MANAGED_NODE_DIR/bin/node" -v) → $MANAGED_NODE_DIR"
      return 0
    fi
  fi

  if system_node_ok && [ "${OPPTRIX_FORCE_MANAGED_NODE:-}" != 1 ]; then
    log "系统 Node 可用 ($(node -v))，跳过托管安装（设 OPPTRIX_FORCE_MANAGED_NODE=1 可强制）"
    return 0
  fi

  need_cmd curl
  need_cmd tar
  local arch tmp tarfile
  arch="$(detect_arch)"
  mkdir -p "$RUNTIME_ROOT"
  tmp="$(mktemp -d)"
  tarfile="$tmp/node.tar.xz"
  download_node_tarball "$OPPTRIX_NODE_VERSION" "$arch" "$mirror" "$tarfile" \
    || die "无法下载 Node ${OPPTRIX_NODE_VERSION}"
  rm -rf "$MANAGED_NODE_DIR"
  mkdir -p "$MANAGED_NODE_DIR"
  tar -xJf "$tarfile" -C "$tmp"
  local extracted
  extracted="$(find "$tmp" -mindepth 1 -maxdepth 1 -type d -name 'node-v*' | head -n 1)"
  [ -n "$extracted" ] || die "Node 包目录未找到"
  cp -a "$extracted"/. "$MANAGED_NODE_DIR/"
  rm -rf "$tmp"
  [ -x "$MANAGED_NODE_DIR/bin/node" ] || die "托管 Node 解压失败"
  log "托管 Node 已安装: $("$MANAGED_NODE_DIR/bin/node" -v) → $MANAGED_NODE_DIR"
}

use_node_path() {
  if [ -x "$MANAGED_NODE_DIR/bin/node" ]; then
    export PATH="$MANAGED_NODE_DIR/bin:$PATH"
  fi
  command -v node >/dev/null 2>&1 || die "未找到 node"
  local maj
  maj="$(node_major)"
  [ -n "$maj" ] && [ "$maj" -ge 24 ] || die "需要 Node ≥ 24，当前: $(node -v 2>/dev/null || echo missing)"
}

ensure_repo() {
  local mirror="$1"
  local script_path="${BASH_SOURCE[0]:-}"
  if [ -n "$script_path" ] && [ -f "$script_path" ]; then
    local script_dir root
    script_dir="$(CDPATH= cd -- "$(dirname "$script_path")" && pwd)"
    root="$(CDPATH= cd -- "$script_dir/../.." && pwd)"
    if [ -f "$root/docker-compose.yml" ] && {
         [ -f "$root/packages/selfhost/bin/opptrix.js" ] || [ -f "$root/scripts/opptrix.mjs" ]
       }; then
      REPO_ROOT="$root"
      log "使用仓库: $REPO_ROOT"
      return 0
    fi
  fi

  if [ -f "$OPPTRIX_REPO_DIR/docker-compose.yml" ] && {
       [ -f "$OPPTRIX_REPO_DIR/packages/selfhost/bin/opptrix.js" ] \
       || [ -f "$OPPTRIX_REPO_DIR/scripts/opptrix.mjs" ]
     }; then
    REPO_ROOT="$OPPTRIX_REPO_DIR"
    log "使用已有目录: $REPO_ROOT"
    return 0
  fi

  need_cmd git
  # 国内默认 Gitee，国外默认 GitHub；失败再试另一侧
  local urls=()
  if [ -n "${OPPTRIX_GIT_URL_OVERRIDE:-}" ]; then
    urls=("$OPPTRIX_GIT_URL_OVERRIDE")
  elif [ "$mirror" = cn ]; then
    urls=("$OPPTRIX_GIT_URL_CN" "$OPPTRIX_GIT_URL")
  else
    urls=("$OPPTRIX_GIT_URL" "$OPPTRIX_GIT_URL_CN")
  fi

  mkdir -p "$(dirname "$OPPTRIX_REPO_DIR")"
  if [ -d "$OPPTRIX_REPO_DIR/.git" ]; then
    log "已有仓库，git pull → $OPPTRIX_REPO_DIR"
    git -C "$OPPTRIX_REPO_DIR" pull --ff-only || warn "git pull 失败，继续使用现有代码"
    REPO_ROOT="$OPPTRIX_REPO_DIR"
    return 0
  fi

  local url cloned=0
  for url in "${urls[@]}"; do
    [ -n "$url" ] || continue
    log "克隆仓库 → $OPPTRIX_REPO_DIR （$url）"
    rm -rf "$OPPTRIX_REPO_DIR"
    if git clone --depth 1 "$url" "$OPPTRIX_REPO_DIR"; then
      cloned=1
      break
    fi
    warn "clone 失败: $url ，尝试下一源…"
  done
  [ "$cloned" = 1 ] || die "git clone 失败。可设置 OPPTRIX_GIT_URL_OVERRIDE=… 或检查网络"
  REPO_ROOT="$OPPTRIX_REPO_DIR"
}

install_cli_wrapper() {
  local repo="$1"
  local mirror="${2:-foreign}"
  mkdir -p "$BIN_DIR"
  use_node_path
  local node_bin
  node_bin="$(command -v node)"

  # Prefer published package when registry reachable; else link workspace package / wrapper
  if [ "${OPPTRIX_CLI_FROM_REPO:-}" != 1 ]; then
    log "尝试 npm i -g @opptrix/selfhost …"
    local npm_args=(install -g @opptrix/selfhost --no-fund --no-audit)
    if [ "$mirror" = cn ]; then
      npm_args+=(--registry https://registry.npmmirror.com)
    fi
    if npm "${npm_args[@]}"; then
      log "已安装 @opptrix/selfhost（全局 opptrix）"
      return 0
    fi
    warn "npm 全局安装失败，回退到仓库内 CLI 包装脚本"
  fi

  local cli_js="$repo/packages/selfhost/bin/opptrix.js"
  if [ ! -f "$cli_js" ]; then
    cli_js="$repo/scripts/opptrix.mjs"
  fi
  [ -f "$cli_js" ] || die "缺少 $cli_js"

  if [ -f "$repo/packages/selfhost/package.json" ] && command -v npm >/dev/null 2>&1; then
    (cd "$repo/packages/selfhost" && npm run build && npm link --no-fund --no-audit) \
      || warn "npm link @opptrix/selfhost 失败，写入包装脚本"
  fi

  cat > "$BIN_DIR/opptrix" <<EOF
#!/usr/bin/env bash
exec "$node_bin" "$cli_js" "\$@"
EOF
  chmod +x "$BIN_DIR/opptrix"
  log "已安装命令: $BIN_DIR/opptrix"

  case ":$PATH:" in
    *":$BIN_DIR:"*) ;;
    *)
      warn "请将 $BIN_DIR 加入 PATH，例如写入 ~/.bashrc:"
      warn "  export PATH=\"$BIN_DIR:\$PATH\""
      ;;
  esac
}

write_mirror_pref() {
  local repo="$1" mirror="$2"
  use_node_path
  local cli="$repo/packages/selfhost/bin/opptrix.js"
  [ -f "$cli" ] || cli="$repo/scripts/opptrix.mjs"
  (cd "$repo" && node "$cli" init --mirror "$mirror") || warn "opptrix init 失败（可稍后手动执行）"
}

main() {
  if ! os_is_linux; then
    cat >&2 <<'EOF'
[opptrix-bootstrap] 本脚本仅支持 Linux 服务器。

macOS / Windows：请自行安装 Docker 与 Node.js（≥24），然后在仓库根目录执行：
  node scripts/opptrix.mjs install-cli
  opptrix init --mirror cn    # 或 foreign
  opptrix up

文档：docs/SELF-HOSTING.md
EOF
    exit 2
  fi

  local mirror
  mirror="$(resolve_mirror "$MIRROR_MODE")"
  log "platform=$(uname -s)/$(uname -m) mirror=$mirror"
  log "managed Node pin=v${OPPTRIX_NODE_VERSION}"

  ensure_docker "$mirror"
  ensure_managed_node "$mirror"
  use_node_path
  ensure_repo "$mirror"

  if [ "${OPPTRIX_SKIP_CLI:-}" != 1 ]; then
    install_cli_wrapper "$REPO_ROOT" "$mirror"
  fi

  write_mirror_pref "$REPO_ROOT" "$mirror"

  if [ "${OPPTRIX_BOOTSTRAP_UP:-}" = 1 ]; then
    use_node_path
    export PATH="$BIN_DIR:$PATH"
    log "OPPTRIX_BOOTSTRAP_UP=1 → opptrix up --skip-models"
    (cd "$REPO_ROOT" && "$BIN_DIR/opptrix" up --mirror "$mirror" --skip-models) \
      || die "opptrix up 失败"
  fi

  cat <<EOF

[opptrix-bootstrap] 完成。

  仓库: $REPO_ROOT
  命令: $BIN_DIR/opptrix   （若找不到命令，先: export PATH="$BIN_DIR:\$PATH"）
  镜像: $mirror

下一步：
  opptrix doctor
  opptrix up
  # 快速验证（跳过模型）: opptrix up --skip-models
  # 若需强制镜像: opptrix up --mirror cn|foreign

浏览器: https://127.0.0.1:8712
EOF
}

main "$@"
