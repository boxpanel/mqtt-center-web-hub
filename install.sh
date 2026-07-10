#!/bin/bash
# ============================================================
# MQTT Center Web Hub — 一键安装脚本
# 仓库: https://github.com/boxpanel/mqtt-center-web-hub
# 用法: curl -sSL https://raw.githubusercontent.com/boxpanel/mqtt-center-web-hub/main/install.sh | bash
# 私有仓库: curl -sSL ... | GITHUB_TOKEN=ghp_xxx bash
# ============================================================

set -e

REPO_URL="https://github.com/boxpanel/mqtt-center-web-hub.git"
INSTALL_DIR="/opt/mqtt-center-web-hub"
HUB_PORT=8080
NODE_VERSION="18"

# ── GitHub 认证（私有仓库需要设置 GITHUB_TOKEN） ──
if [ -n "$GITHUB_TOKEN" ]; then
  AUTH_REPO_URL="https://${GITHUB_TOKEN}@github.com/boxpanel/mqtt-center-web-hub.git"
else
  AUTH_REPO_URL="$REPO_URL"
fi

# ── 颜色输出 ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step()  { echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; echo -e "${BLUE}  $1${NC}"; echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }

# ── 检查系统 ──
check_system() {
  log_step "检查系统环境"

  if [ "$(uname)" != "Linux" ]; then
    log_error "此脚本仅支持 Linux 系统"
    exit 1
  fi

  # 检测发行版
  if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    OS_VERSION=$VERSION_ID
  else
    log_error "无法检测操作系统"
    exit 1
  fi
  log_info "系统: $OS $OS_VERSION"
}

# ── 安装 Node.js ──
install_node() {
  log_step "安装 Node.js"

  if command -v node &>/dev/null; then
    CURRENT_NODE=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$CURRENT_NODE" -ge "$NODE_VERSION" ]; then
      log_info "Node.js $(node -v) 已安装，跳过"
      return
    fi
  fi

  log_info "安装 Node.js $NODE_VERSION ..."

  case "$OS" in
    ubuntu|debian)
      curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
      apt-get install -y nodejs
      ;;
    centos|rhel|fedora)
      curl -fsSL https://rpm.nodesource.com/setup_${NODE_VERSION}.x | bash -
      yum install -y nodejs
      ;;
    *)
      # 通用安装
      curl -fsSL https://nodejs.org/dist/v${NODE_VERSION}.0.0/node-v${NODE_VERSION}.0.0-linux-x64.tar.xz -o /tmp/node.tar.xz
      tar -xf /tmp/node.tar.xz -C /usr/local --strip-components=1
      rm /tmp/node.tar.xz
      ;;
  esac

  log_info "Node.js $(node -v) 安装完成"
}

# ── 安装 PM2 ──
install_pm2() {
  log_step "安装 PM2 进程管理器"
  if command -v pm2 &>/dev/null; then
    log_info "PM2 $(pm2 -v) 已安装"
  else
    npm install -g pm2
    log_info "PM2 安装完成"
  fi
}

# ── 下载项目 ──
download_project() {
  log_step "下载项目代码"

  if [ -d "$INSTALL_DIR" ]; then
    log_warn "目录 $INSTALL_DIR 已存在，正在更新..."
    cd "$INSTALL_DIR"
    GIT_ASKPASS=echo git pull
  else
    log_info "克隆仓库到 $INSTALL_DIR ..."
    GIT_ASKPASS=echo git clone --depth 1 "$AUTH_REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
  fi
}

# ── 安装依赖 ──
install_deps() {
  log_step "安装项目依赖"

  log_info "安装服务端依赖..."
  cd "$INSTALL_DIR"
  npm install

  log_info "安装客户端依赖..."
  cd "$INSTALL_DIR/client"
  npm install

  log_info "依赖安装完成"
}

# ── 构建前端 ──
build_client() {
  log_step "构建前端页面"

  cd "$INSTALL_DIR/client"
  npm run build
  log_info "前端构建完成"
}

# ── 配置服务 ──
setup_service() {
  log_step "配置系统服务"

  # 使用 PM2 管理进程
  cd "$INSTALL_DIR"
  PORT=$HUB_PORT pm2 start server/index.js --name mqtt-center-hub
  pm2 save
  pm2 startup

  log_info "服务已配置为开机自启"
}

# ── 防火墙 ──
setup_firewall() {
  log_step "配置防火墙"

  if command -v ufw &>/dev/null; then
    ufw allow "$HUB_PORT"/tcp >/dev/null 2>&1 && log_info "UFW: 已放行端口 $HUB_PORT"
  elif command -v firewall-cmd &>/dev/null; then
    firewall-cmd --permanent --add-port="$HUB_PORT"/tcp >/dev/null 2>&1
    firewall-cmd --reload >/dev/null 2>&1
    log_info "FirewallD: 已放行端口 $HUB_PORT"
  else
    log_warn "未检测到防火墙，请手动放行端口 $HUB_PORT"
  fi
}

# ── 输出信息 ──
show_summary() {
  log_step "安装完成！"

  local ip
  ip=$(curl -s http://ip.sb 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "服务器IP")

  echo ""
  echo -e "  ${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "  ${GREEN}  MQTT Center Web Hub 已启动${NC}"
  echo -e "  ${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo -e "  访问地址: ${BLUE}http://$ip:$HUB_PORT${NC}"
  echo -e "  安装目录: $INSTALL_DIR"
  echo -e "  管理命令:"
  echo -e "    启动:   pm2 start mqtt-center-hub"
  echo -e "    停止:   pm2 stop mqtt-center-hub"
  echo -e "    重启:   pm2 restart mqtt-center-hub"
  echo -e "    日志:   pm2 logs mqtt-center-hub"
  echo ""
  echo -e "  ${YELLOW}提示: 如需修改端口，请设置环境变量 PORT${NC}"
  echo -e "  例如: PORT=9090 pm2 restart mqtt-center-hub"
  echo ""
}

# ═══════════════════════════════════════════════
# 主流程
# ═══════════════════════════════════════════════

echo ""
echo -e "${BLUE}╔═══════════════════════════════════╗${NC}"
echo -e "${BLUE}║   MQTT Center Web Hub 安装脚本   ║${NC}"
echo -e "${BLUE}║   版本: 1.0.0                     ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════╝${NC}"
echo ""

# 检查是否为 root
if [ "$EUID" -eq 0 ]; then
  log_warn "正在以 root 用户运行"
fi

check_system
install_node
install_pm2
download_project
install_deps
build_client
setup_service
setup_firewall
show_summary
