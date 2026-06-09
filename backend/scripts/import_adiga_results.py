"""대학어디가 입결 Excel CLI import 스크립트.

사용법:
    cd backend
    python scripts/import_adiga_results.py data/admission_results/adiga_입결_2027.xlsx
    python scripts/import_adiga_results.py data/admission_results/adiga_입결_2027.xlsx --year 2027

옵션:
    --year YEAR    파일명에서 학년도 추출이 안 되면 명시 지정
    --dry-run      DB에 쓰지 않고 파싱 결과만 확인

운영:
- 관리자 페이지 업로드와 동일한 결과를 만들어내는 백업·복원용 CLI.
- EC2 SSH 에서 폴더의 모든 Excel 을 한 번에 재 import 할 때 사용 가능.
"""

import argparse
import asyncio
import sys
from pathlib import Path

# backend 루트로 path 추가 (스크립트 직접 실행 대응)
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import async_session
from app.services.adiga_result_import_service import import_to_db, parse_excel


async def main_async(args):
    file_path = Path(args.file).resolve()
    if not file_path.exists():
        print(f"파일을 찾을 수 없습니다: {file_path}")
        sys.exit(1)

    print(f"== Excel 파싱: {file_path.name} ==")
    parsed = parse_excel(file_path)
    print(f"  헤더 {len(parsed['headers'])}컬럼, 데이터 {parsed['total_rows']:,}행")
    print(f"  파일명 추출 학년도: {parsed['year']}")

    if args.dry_run:
        print("\n[DRY RUN] DB 쓰기 생략. 처음 3행 미리보기:")
        for row in parsed["rows"][:3]:
            print(f"  - {row['university']} / {row['major']} / 모집{row['recruit_count']} / 경쟁률{row['competition_rate']}")
        return

    print("\n== DB import ==")
    async with async_session() as db:
        result = await import_to_db(db, parsed, override_year=args.year)

    print(f"  학년도: {result['year']}")
    print(f"  기존 row 삭제: {result['deleted']:,}건")
    print(f"  신규 INSERT: {result['inserted']:,}건")
    print(f"  소스 파일: {result['filename']}")
    print("\n[OK] import 완료")


def main():
    parser = argparse.ArgumentParser(description="대학어디가 입결 Excel import")
    parser.add_argument("file", help="Excel 파일 경로")
    parser.add_argument("--year", type=int, help="학년도 강제 지정 (파일명에서 추출 안 되면)")
    parser.add_argument("--dry-run", action="store_true", help="DB 쓰지 않고 파싱만")
    args = parser.parse_args()
    asyncio.run(main_async(args))


if __name__ == "__main__":
    main()
