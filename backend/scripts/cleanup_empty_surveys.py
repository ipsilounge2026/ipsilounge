"""빈 사전조사(consultation_surveys) 정리 스크립트

이전 검증 로직이 없던 시기에 빈 상태로 제출(submitted)되어 DB에 잔존하는
사전조사 행을 정리한다. 본인 계정 데이터만 안전하게 삭제할 수 있도록
이메일 필터를 필수로 받고, 기본은 dry-run(실제 삭제 X)으로 동작한다.

사용법 (서버에서):
    cd /home/ubuntu/ipsilounge/backend

    # 1) dry-run — 어떤 행이 삭제 대상인지 확인만
    python -m scripts.cleanup_empty_surveys --email me@example.com

    # 2) 실제 삭제 (빈 답변 + submitted 만)
    python -m scripts.cleanup_empty_surveys --email me@example.com --apply

    # 3) 특정 사용자의 preheigh1 사전조사 전체 리셋 (테스트 단계 전용)
    python -m scripts.cleanup_empty_surveys --email me@example.com --all --apply

옵션:
    --email     (필수) 정리 대상 사용자 이메일
    --type      survey_type 필터. 기본 "preheigh1"
    --all       빈 답변뿐 아니라 해당 user의 해당 type 사전조사 전체 삭제
                (테스트 데이터 리셋용. 운영 데이터에는 절대 사용 금지)
    --apply     실제로 삭제 수행. 없으면 dry-run
"""

import argparse
import asyncio
import sys
from pathlib import Path

from sqlalchemy import select, delete

# backend 디렉터리를 PYTHONPATH에 추가 (app 모듈 찾기)
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import async_session  # noqa: E402

# SQLAlchemy 매퍼가 User/ConsultationNote 등의 모든 관계(AnalysisOrder,
# ConsultationBooking, Admin, ...)를 해석할 수 있도록 모든 모델을 미리 import.
# app/models 폴더의 모든 .py 모듈을 빠짐없이 import 한다.
from app.models import (  # noqa: E402, F401
    admin,
    admission_case,
    admission_data,
    analysis_order,
    analysis_share,
    consultation_booking,
    consultation_note,
    consultation_slot,
    consultation_survey as _consultation_survey_module,
    counselor_change_request,
    interview_question,
    notice as notice_model,
    notification,
    password_reset_token,
    payment as payment_model,
    seminar_mail_log,
    seminar_reservation,
    seminar_schedule,
    user,
)
from app.models.user import User  # noqa: E402
from app.models.consultation_survey import ConsultationSurvey  # noqa: E402


def _is_empty_answers(answers) -> bool:
    """answers JSONB가 비어 있는지 판정.

    - None / {} / 모든 카테고리가 빈 dict 인 경우 빈 것으로 본다.
    """
    if answers is None:
        return True
    if not isinstance(answers, dict):
        return False
    if len(answers) == 0:
        return True
    # 카테고리는 있지만 모든 카테고리가 빈 dict 인 경우도 빈 것으로 간주
    for v in answers.values():
        if isinstance(v, dict) and len(v) > 0:
            return False
        if v not in (None, {}, [], ""):
            return False
    return True


def _summarize(survey: ConsultationSurvey) -> str:
    ans = survey.answers or {}
    cat_count = sum(1 for v in ans.values() if isinstance(v, dict) and len(v) > 0)
    return (
        f"id={survey.id} "
        f"type={survey.survey_type} "
        f"status={survey.status} "
        f"updated_at={survey.updated_at} "
        f"submitted_at={survey.submitted_at} "
        f"answer_categories_with_data={cat_count}"
    )


async def run(email: str, survey_type: str, delete_all: bool, apply: bool) -> int:
    async with async_session() as session:
        # 1) 사용자 조회
        result = await session.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if user is None:
            print(f"[ERROR] 이메일 {email!r} 에 해당하는 사용자를 찾을 수 없습니다.")
            return 2

        print(f"[INFO] 대상 사용자: {user.email} (id={user.id}, name={user.name})")

        # 2) 해당 사용자의 사전조사 전체 조회
        result = await session.execute(
            select(ConsultationSurvey)
            .where(ConsultationSurvey.user_id == user.id)
            .where(ConsultationSurvey.survey_type == survey_type)
            .order_by(ConsultationSurvey.updated_at.desc())
        )
        all_surveys = result.scalars().all()
        print(f"[INFO] 해당 사용자의 {survey_type} 사전조사 총 {len(all_surveys)}건")

        if not all_surveys:
            print("[INFO] 정리할 데이터가 없습니다.")
            return 0

        # 3) 삭제 대상 선정
        if delete_all:
            targets = list(all_surveys)
            criterion = "ALL (해당 사용자의 모든 행)"
        else:
            targets = [s for s in all_surveys if _is_empty_answers(s.answers)]
            criterion = "answers 가 비어 있는 행만"

        print(f"[INFO] 삭제 기준: {criterion}")
        print(f"[INFO] 삭제 대상: {len(targets)}건 / 보존: {len(all_surveys) - len(targets)}건")
        print("-" * 80)

        for s in all_surveys:
            mark = "[DELETE]" if s in targets else "[ KEEP ]"
            print(f"{mark} {_summarize(s)}")

        print("-" * 80)

        if not targets:
            print("[INFO] 삭제 대상이 없습니다. 종료.")
            return 0

        # 4) 실제 삭제 (--apply 가 있을 때만)
        if not apply:
            print("[DRY-RUN] --apply 플래그가 없어 실제 삭제는 수행하지 않았습니다.")
            print("           위 [DELETE] 목록이 맞다면 --apply 를 추가해 다시 실행하세요.")
            return 0

        target_ids = [s.id for s in targets]
        try:
            await session.execute(
                delete(ConsultationSurvey).where(ConsultationSurvey.id.in_(target_ids))
            )
            await session.commit()
        except Exception as e:
            await session.rollback()
            print(f"[ERROR] 삭제 중 오류 발생, 롤백되었습니다: {e}")
            return 1

        print(f"[OK] {len(target_ids)}건 삭제 완료.")
        return 0


def main():
    parser = argparse.ArgumentParser(description="빈 사전조사 정리 스크립트")
    parser.add_argument("--email", required=True, help="정리 대상 사용자 이메일")
    parser.add_argument("--type", default="preheigh1", help='survey_type (기본 "preheigh1")')
    parser.add_argument(
        "--all",
        action="store_true",
        help="해당 사용자의 해당 type 사전조사 전체 삭제 (테스트 데이터 리셋용)",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="실제로 삭제 수행 (없으면 dry-run)",
    )
    args = parser.parse_args()

    code = asyncio.run(
        run(email=args.email, survey_type=args.type, delete_all=args.all, apply=args.apply)
    )
    sys.exit(code)


if __name__ == "__main__":
    main()
