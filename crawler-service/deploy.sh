#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

BUILDER_NAME="multi-arch-builder"
IMAGE_NAME="peregin/velocorner.crawler"
TAG="latest"
DOCKERFILE=${1:-"$SCRIPT_DIR/Dockerfile"}
PLATFORMS=${2:-"linux/arm64"}
BUILD_CONTEXT=${3:-"$SCRIPT_DIR"}

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

log() {
    local level=$1 color
    case "$level" in
        INFO) color="$GREEN";;
        WARN) color="$YELLOW";;
        ERROR) color="$RED";;
        *) color="$NC";;
    esac
    shift
    echo -e "${color}[$(date +'%F %T')] [$level] $*${NC}"
}

trap 'log ERROR "Error on line $LINENO"; exit 1' ERR

docker info &>/dev/null || { log ERROR "Docker is not running"; exit 1; }

log INFO "Building crawler-service fat jar"
(cd "$REPO_ROOT" && sbt "project crawler-service" assembly)

docker buildx inspect "$BUILDER_NAME" &>/dev/null || {
    log INFO "Creating buildx builder: $BUILDER_NAME"
    docker buildx create --name "$BUILDER_NAME" --driver docker-container --bootstrap
}
docker buildx use "$BUILDER_NAME"

log INFO "Building $IMAGE_NAME:$TAG from $DOCKERFILE for $PLATFORMS"
docker buildx build \
    --platform "$PLATFORMS" \
    --tag "$IMAGE_NAME:$TAG" \
    --push \
    --cache-from "type=registry,ref=$IMAGE_NAME:$TAG" \
    --cache-to "type=inline" \
    --progress=plain \
    --file "$DOCKERFILE" \
    "$BUILD_CONTEXT"

log INFO "Build and push completed"
