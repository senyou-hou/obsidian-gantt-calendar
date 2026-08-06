#!/usr/bin/env bash
#
# Release SOP - 发布 Obsidian 插件到 GitHub Release
#
# 流程：
#   1. 前置检查（工作区干净 / gh 已认证）
#   2. 构建产物（npm run build）
#   3. 推送 tag 到远程
#   4. 创建 GitHub Release 并上传 main.js / manifest.json / styles.css
#
# 用法：
#   ./scripts/release.sh                # 从 manifest.json 读取版本号
#   ./scripts/release.sh 1.5.23         # 显式指定版本号（需与 manifest.json 一致）
#   ./scripts/release.sh --dry-run      # Dry run 模式，仅检查不实际发布
#   ./scripts/release.sh 1.5.23 --dry-run
#
# 前置条件：
#   - 当前处于项目根目录
#   - 已通过 gh auth login 完成 GitHub 认证
#   - manifest.json / package.json 的 version 已更新，且已 commit + tag
#

set -euo pipefail

# ==================== 参数解析 ====================
DRY_RUN=false
INPUT_VERSION=""

for arg in "$@"; do
    case "$arg" in
        --dry-run|-n)
            DRY_RUN=true
            ;;
        --help|-h)
            grep '^#' "$0" | sed 's/^# \?//'
            exit 0
            ;;
        *)
            if [ -z "$INPUT_VERSION" ]; then
                INPUT_VERSION="$arg"
            else
                echo "未知参数: $arg" >&2
                exit 1
            fi
            ;;
    esac
done

# ==================== 颜色输出 ====================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }
dryrun()  { echo -e "${CYAN}[DRY-RUN]${NC} $*"; }

# ==================== 前置检查 ====================

# 切换到项目根目录（脚本所在目录的上一级）
cd "$(dirname "$0")/.."

# Dry run 模式提示
if [ "$DRY_RUN" = true ]; then
    echo -e "${CYAN}==============================================${NC}"
    echo -e "${CYAN}  DRY RUN 模式 - 仅检查，不执行任何远程操作${NC}"
    echo -e "${CYAN}==============================================${NC}"
    echo ""
fi

# 1. 检查工作区是否干净（允许有未跟踪的构建产物）
if ! git diff --quiet HEAD -- src/ package.json manifest.json versions.json tsconfig.json; then
    error "工作区有未提交的改动（src/ 配置文件），请先 commit"
    git status -s
    exit 1
fi
success "工作区干净"

# 2. 检查 gh CLI 是否可用（常见安装位置都试一遍）
GH_BIN=""
for candidate in "gh" "/c/Program Files/GitHub CLI/gh"; do
    if command -v "$candidate" &>/dev/null || [ -x "$candidate" ]; then
        GH_BIN="$candidate"
        break
    fi
done
if [ -z "$GH_BIN" ]; then
    error "未找到 gh CLI，请安装：winget install --id GitHub.cli"
    exit 1
fi

# 用于在提示信息中显示的命令名（统一显示为 gh，避免暴露完整路径）
GH_DISPLAY="gh"

# 3. 检查 gh 认证状态
if ! "$GH_BIN" auth status &>/dev/null; then
    error "gh 未认证，请先运行：gh auth login"
    exit 1
fi
success "gh 已认证"

# ==================== 确定版本号 ====================

# 从 manifest.json 读取版本号（单一可信源）
MANIFEST_VERSION=$(node -e "console.log(require('./manifest.json').version)")

# 如果传入了参数，校验是否与 manifest.json 一致
if [ -n "$INPUT_VERSION" ]; then
    if [ "$INPUT_VERSION" != "$MANIFEST_VERSION" ]; then
        error "参数版本 $INPUT_VERSION 与 manifest.json 版本 $MANIFEST_VERSION 不一致"
        error "请先更新 manifest.json / package.json / versions.json 并 commit + tag"
        exit 1
    fi
fi

VERSION="$MANIFEST_VERSION"
TAG="$VERSION"

info "发布版本: $TAG"

# 4. 检查 tag 是否存在
if ! git rev-parse "$TAG" &>/dev/null; then
    error "本地不存在 tag $TAG，请先创建：git tag -a $TAG -m \"...\""
    exit 1
fi
success "tag $TAG 已存在"

# 5. 检查构建产物文件是否存在（构建后再检查）
build_artifacts=("main.js" "manifest.json" "styles.css")

# ==================== 构建产物 ====================

if [ "$DRY_RUN" = true ]; then
    dryrun "跳过构建（dry run 模式）"
    # 检查现有构建产物是否存在（不强制构建）
    for file in "${build_artifacts[@]}"; do
        if [ ! -f "$file" ]; then
            warn "构建产物不存在: $file（dry run 模式下不强制构建）"
        fi
    done
else
    info "执行构建: npm run build"
    if ! npm run build; then
        error "构建失败"
        exit 1
    fi
    success "构建成功"

    # 验证产物存在
    for file in "${build_artifacts[@]}"; do
        if [ ! -f "$file" ]; then
            error "构建产物缺失: $file"
            exit 1
        fi
    done
    success "构建产物齐全: ${build_artifacts[*]}"
fi

# ==================== 推送 tag ====================

# 检查远程是否已有此 tag
REMOTE_TAG=$(git ls-remote --tags origin "refs/tags/$TAG" 2>/dev/null | head -1)
if [ "$DRY_RUN" = true ]; then
    if [ -z "$REMOTE_TAG" ]; then
        dryrun "将执行: git push origin $TAG"
    else
        dryrun "远程已存在 tag $TAG，将跳过推送"
    fi
else
    if [ -z "$REMOTE_TAG" ]; then
        info "推送 tag $TAG 到远程..."
        if ! git push origin "$TAG"; then
            error "推送 tag 失败"
            exit 1
        fi
        success "tag 已推送"
    else
        success "远程已存在 tag $TAG，跳过推送"
    fi
fi

# ==================== 检查并创建 Release ====================

# 检查 Release 是否已存在
if "$GH_BIN" release view "$TAG" &>/dev/null; then
    if [ "$DRY_RUN" = true ]; then
        dryrun "Release $TAG 已存在，将跳过创建"
    else
        warn "Release $TAG 已存在"
        echo "  如需重新创建，请先删除：$GH_DISPLAY release delete $TAG"
        echo "  查看现有 Release：$GH_DISPLAY release view $TAG --web"
        exit 0
    fi
else
    # 从 tag 注释中提取 release notes（如果有）
    NOTES=$(git tag -l --format='%(contents:subject)%0a%0a%(contents:body)' "$TAG" 2>/dev/null | head -20)
    if [ -z "$NOTES" ]; then
        NOTES="Release $TAG"
    fi

    if [ "$DRY_RUN" = true ]; then
        dryrun "将执行: $GH_DISPLAY release create $TAG ${build_artifacts[*]} --title \"$TAG\" --notes \"...\""
        echo -e "  ${CYAN}Release Notes 预览:${NC}"
        echo "$NOTES" | sed 's/^/    /'
    else
        info "创建 GitHub Release $TAG..."
        RELEASE_URL=$("$GH_BIN" release create "$TAG" \
            "${build_artifacts[@]}" \
            --title "$TAG" \
            --notes "$NOTES")

        if [ -n "$RELEASE_URL" ]; then
            success "Release 创建成功"
            echo ""
            echo -e "  ${GREEN}URL: $RELEASE_URL${NC}"
            echo ""
        else
            error "Release 创建失败"
            exit 1
        fi
    fi
fi

# ==================== Dry run 总结 ====================
if [ "$DRY_RUN" = true ]; then
    echo ""
    echo -e "${CYAN}==============================================${NC}"
    echo -e "${CYAN}  Dry run 完成 - 所有检查通过，可以正式发布${NC}"
    echo -e "${CYAN}  执行以下命令正式发布:${NC}"
    echo -e "${CYAN}  ./scripts/release.sh${NC}"
    echo -e "${CYAN}==============================================${NC}"
fi
