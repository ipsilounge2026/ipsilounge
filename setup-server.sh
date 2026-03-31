#!/bin/bash
# 입시라운지 서버 초기 설정 스크립트
# 사용법: bash setup-server.sh
# 실행 환경: Ubuntu 24.04 LTS

set -e

echo "======================================"
echo "  입시라운지 서버 초기 설정 시작"
echo "======================================"

# 1. 패키지 업데이트
echo "[1/5] 패키지 업데이트..."
sudo apt update -qq && sudo apt upgrade -y -qq

# 2. Docker 설치
echo "[2/5] Docker 설치..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sudo sh
    sudo usermod -aG docker $USER
    echo "  ✅ Docker 설치 완료"
else
    echo "  ℹ️  Docker 이미 설치됨"
fi

# 3. 프로젝트 디렉토리 설정
echo "[3/5] 프로젝트 디렉토리 설정..."
sudo mkdir -p /opt/ipsilounge
sudo chown -R $USER:$USER /opt/ipsilounge

# 4. .env 파일 확인
echo "[4/5] 환경변수 파일 확인..."
if [ ! -f /opt/ipsilounge/backend/.env ]; then
    echo ""
    echo "  ⚠️  backend/.env 파일이 없습니다!"
    echo "  backend/.env.example을 복사해서 .env를 만들고 값을 채워주세요."
    echo "  cp backend/.env.example backend/.env"
    echo "  nano backend/.env"
    echo ""
fi

# 5. 방화벽 설정 (ufw)
echo "[5/5] 방화벽 설정..."
sudo ufw allow 22    # SSH
sudo ufw allow 80    # HTTP
sudo ufw allow 443   # HTTPS
sudo ufw --force enable
echo "  ✅ 방화벽 설정 완료 (22, 80, 443 허용)"

echo ""
echo "======================================"
echo "  초기 설정 완료!"
echo "======================================"
echo ""
echo "다음 단계:"
echo "  1. backend/.env 파일에 실제 값 입력"
echo "  2. firebase-credentials.json 파일 업로드"
echo "  3. SSL 인증서 발급 (docs/deployment.md 참고)"
echo "  4. docker compose up -d 실행"
echo ""
