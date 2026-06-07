#!/bin/bash
# ============================================================
# Brainhole 中国网络环境一键安装脚本 (macOS / Linux)
# 自动检测并安装 Python 3.12+、uv、Node.js 20+
# 所有下载均使用国内镜像源，避免网络问题
# ============================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC} $1"; }
ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
fail()  { echo -e "${RED}[ERROR]${NC} $1"; }

echo ""
echo "============================================================"
echo "  🇨🇳 Brainhole 中国网络环境一键安装"
echo "  检测并安装: Python 3.12+ / uv / Node.js 20+"
echo "============================================================"
echo ""

# ============================================================
# 1. Python
# ============================================================
info "检查 Python..."

PYTHON_OK=false
if command -v python3 &>/dev/null; then
    PY_VER=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>/dev/null || echo "0.0")
    PY_MAJOR=$(echo "$PY_VER" | cut -d. -f1)
    PY_MINOR=$(echo "$PY_VER" | cut -d. -f2)
    if [ "$PY_MAJOR" -ge 3 ] && [ "$PY_MINOR" -ge 12 ]; then
        ok "Python $PY_VER 已安装 ✓"
        PYTHON_OK=true
    else
        warn "Python $PY_VER 版本过低，需要 3.12+"
    fi
else
    warn "Python 未安装"
fi

if [ "$PYTHON_OK" = false ]; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
        info "macOS: 通过 Homebrew 安装 Python 3.12..."
        if ! command -v brew &>/dev/null; then
            info "Homebrew 未安装，使用清华镜像安装..."
            export HOMEBREW_BREW_GIT_REMOTE="https://mirrors.tuna.tsinghua.edu.cn/git/homebrew/brew.git"
            export HOMEBREW_CORE_GIT_REMOTE="https://mirrors.tuna.tsinghua.edu.cn/git/homebrew/homebrew-core.git"
            export HOMEBREW_API_DOMAIN="https://mirrors.tuna.tsinghua.edu.cn/homebrew-bottles/api"
            export HOMEBREW_BOTTLE_DOMAIN="https://mirrors.tuna.tsinghua.edu.cn/homebrew-bottles"
            /bin/bash -c "$(curl -fsSL https://mirrors.tuna.tsinghua.edu.cn/git/homebrew/install/HEAD/install.sh)"
        fi
        # 设置 Homebrew 国内源
        export HOMEBREW_API_DOMAIN="https://mirrors.tuna.tsinghua.edu.cn/homebrew-bottles/api"
        export HOMEBREW_BOTTLE_DOMAIN="https://mirrors.tuna.tsinghua.edu.cn/homebrew-bottles"
        brew install python@3.12
        ok "Python 3.12 安装完成 ✓"
    else
        info "Linux: 通过系统包管理器安装 Python 3.12..."
        if command -v apt-get &>/dev/null; then
            sudo apt-get update && sudo apt-get install -y python3.12 python3.12-venv python3-pip
        elif command -v dnf &>/dev/null; then
            sudo dnf install -y python3.12
        elif command -v yum &>/dev/null; then
            sudo yum install -y python3.12
        else
            fail "无法自动安装 Python，请手动安装 Python 3.12+: https://www.python.org/downloads/"
            exit 1
        fi
        ok "Python 安装完成 ✓"
    fi
fi

# ============================================================
# 2. uv (使用官方安装脚本，已内置 CDN 加速)
# ============================================================
info "检查 uv..."

if command -v uv &>/dev/null; then
    UV_VER=$(uv --version 2>/dev/null | head -1)
    ok "uv 已安装: $UV_VER ✓"
else
    info "安装 uv (Python 包管理器)..."
    # 官方安装脚本自带 CDN，国内通常可直接访问
    curl -LsSf https://astral.sh/uv/install.sh | sh
    # 将 uv 加入当前 shell 的 PATH
    export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
    if command -v uv &>/dev/null; then
        ok "uv 安装完成 ✓"
    else
        fail "uv 安装失败，请手动安装: https://docs.astral.sh/uv/getting-started/installation/"
        exit 1
    fi
fi

# 配置 uv 使用清华 PyPI 镜像
info "配置 uv 清华 PyPI 镜像..."
mkdir -p ~/.config/uv
if [ ! -f ~/.config/uv/uv.toml ] || ! grep -q "index-url" ~/.config/uv/uv.toml 2>/dev/null; then
    cat > ~/.config/uv/uv.toml << 'EOF'
[pip]
index-url = "https://pypi.tuna.tsinghua.edu.cn/simple"
EOF
    ok "uv PyPI 镜像已配置为清华源 ✓"
else
    ok "uv PyPI 镜像已配置 ✓"
fi

# 配置 pip 使用清华 PyPI 镜像
info "配置 pip 清华 PyPI 镜像..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    PIP_CONF_DIR="$HOME/Library/Application Support/pip"
else
    PIP_CONF_DIR="$HOME/.config/pip"
fi
mkdir -p "$PIP_CONF_DIR"
if [ ! -f "$PIP_CONF_DIR/pip.conf" ] || ! grep -q "tuna.tsinghua" "$PIP_CONF_DIR/pip.conf" 2>/dev/null; then
    cat > "$PIP_CONF_DIR/pip.conf" << 'EOF'
[global]
index-url = https://pypi.tuna.tsinghua.edu.cn/simple
trusted-host = pypi.tuna.tsinghua.edu.cn
EOF
    ok "pip 镜像已配置为清华源 ✓"
else
    ok "pip 镜像已配置 ✓"
fi

# ============================================================
# 3. Node.js
# ============================================================
info "检查 Node.js..."

NODE_OK=false
if command -v node &>/dev/null; then
    NODE_VER=$(node --version 2>/dev/null | sed 's/v//')
    NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
    if [ "$NODE_MAJOR" -ge 20 ]; then
        ok "Node.js v$NODE_VER 已安装 ✓"
        NODE_OK=true
    else
        warn "Node.js v$NODE_VER 版本过低，需要 v20+"
    fi
else
    warn "Node.js 未安装"
fi

if [ "$NODE_OK" = false ]; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
        info "macOS: 通过 Homebrew 安装 Node.js 20..."
        export HOMEBREW_API_DOMAIN="https://mirrors.tuna.tsinghua.edu.cn/homebrew-bottles/api"
        export HOMEBREW_BOTTLE_DOMAIN="https://mirrors.tuna.tsinghua.edu.cn/homebrew-bottles"
        brew install node@20
        ok "Node.js 安装完成 ✓"
    else
        info "Linux: 通过 NodeSource 镜像安装 Node.js 20..."
        if command -v apt-get &>/dev/null; then
            curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
            sudo apt-get install -y nodejs
        elif command -v dnf &>/dev/null || command -v yum &>/dev/null; then
            curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
            sudo yum install -y nodejs || sudo dnf install -y nodejs
        else
            fail "无法自动安装 Node.js，请手动安装: https://nodejs.org/"
            exit 1
        fi
        ok "Node.js 安装完成 ✓"
    fi
fi

# 配置 npm 使用淘宝镜像
info "配置 npm 淘宝镜像..."
npm config set registry https://registry.npmmirror.com 2>/dev/null || true
ok "npm 镜像已配置为淘宝源 ✓"

# 安装依赖
info "开始安装项目依赖 (npm install)..."
npm install
ok "项目依赖安装完成 ✓"

# ============================================================
# 完成
# ============================================================
echo ""
echo "============================================================"
echo -e "  ${GREEN}✅ 所有依赖安装完成！${NC}"
echo ""
echo "  已配置的国内镜像:"
echo "    • PyPI  → 清华大学 (pypi.tuna.tsinghua.edu.cn)"
echo "    • npm   → 淘宝镜像 (registry.npmmirror.com)"
echo ""
echo "  下一步: 在项目根目录运行启动命令"
echo "    npm run dev"
echo "============================================================"
echo ""
