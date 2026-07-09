#!/bin/bash
set -e

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${GREEN}[✓]${NC} $1"; }
error()   { echo -e "${RED}[✗]${NC} $1"; }
section() { echo ""; echo -e "${CYAN}━━━ $1 ━━━${NC}"; }

if [ "$(id -u)" -ne 0 ]; then
  error "请使用 root 权限运行: curl -fsSL ... | sudo bash"
  exit 1
fi

# 检测包管理器
if command -v apt-get &>/dev/null; then PKG="apt"
elif command -v yum &>/dev/null; then PKG="yum"
elif command -v dnf &>/dev/null; then PKG="dnf"
elif command -v apk &>/dev/null; then PKG="apk"
elif command -v pacman &>/dev/null; then PKG="pacman"
else error "不支持的 Linux 发行版"; exit 1; fi
info "包管理器: $PKG"

# 安装 git
if ! command -v git &>/dev/null; then
  info "安装 git..."; case $PKG in
    apt) apt-get update -qq && apt-get install -y -qq git ;;
    yum|dnf) $PKG install -y -q git ;;
    apk) apk add git ;; pacman) pacman -S --noconfirm git ;;
  esac
fi

# 安装 Node.js
if ! command -v node &>/dev/null || [ "$(node -v | sed 's/v//' | cut -d. -f1)" -lt 18 ]; then
  section "安装 Node.js 20 LTS"
  case $PKG in
    apt) curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y -qq nodejs ;;
    yum|dnf) curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - && $PKG install -y -q nodejs ;;
    apk) apk add nodejs npm ;;
    pacman) pacman -S --noconfirm nodejs npm ;;
  esac
fi
info "Node.js $(node -v) ✓"

section "获取代码"
TARGET="/opt/mqtt-center-hub"
if [ -d "$TARGET" ]; then
  cd "$TARGET" && git pull
else
  git clone --depth=1 https://github.com/boxpanel/mqtt-Center-hub.git "$TARGET"
  cd "$TARGET"
fi

section "安装依赖 & 构建"
npm install
cd client && npm install && cd ..
npm run build
mkdir -p data
info "构建完成 ✓"

section "注册系统服务"
cat > /etc/systemd/system/mqtt-center-hub.service <<EOF
[Unit]
Description=MQTT Center Hub
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$TARGET
ExecStart=/usr/bin/env PORT=8080 node server/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable mqtt-center-hub
systemctl restart mqtt-center-hub
sleep 2

IP=$(hostname -I 2>/dev/null | awk '{print $1}')
section "安装完成"
echo ""
echo -e "  ${GREEN}MQTT Center Hub 已成功安装并运行！${NC}"
echo ""
echo -e "  访问地址:  http://$IP:8080"
echo ""
echo -e "  管理命令:"
echo -e "    查看状态:  systemctl status mqtt-center-hub"
echo -e "    查看日志:  journalctl -u mqtt-center-hub -f"
echo ""
