"""
사전 상담 설문 (Consultation Survey)

학생이 상담 전에 작성하는 사전 설문 데이터를 저장.
- survey_type: "preheigh1" (예비고1) | "high" (고등학교 재학생)
- timing: T1~T4 (high 타입 전용, 상담 시점)
- mode: "full" | "delta" (재상담 시 변동분만 입력)
- answers: 카테고리·질문별 응답 (JSONB)
- category_status: 카테고리별 진행 상태 (skipped/in_progress/completed)
- 카테고리별 플랫폼 분리: 일부 카테고리는 web 전용, 일부는 모바일에서도 입력 가능
- 이어쓰기: started_platform / last_edited_platform 추적
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ConsultationSurvey(Base):
    __tablename__ = "consultation_surveys"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # 설문 종류 식별
    survey_type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    # "preheigh1" — 예비고1 (단일 시점, mode 의미 없음)
    # "high"      — 고등학교 재학생 (T1~T4 + Full/Delta)

    timing: Mapped[str | None] = mapped_column(String(4), nullable=True)
    # high 타입 전용: "T1" | "T2" | "T3" | "T4"
    # preheigh1 타입은 NULL

    mode: Mapped[str] = mapped_column(String(10), nullable=False, default="full")
    # "full"  — 처음 상담받는 학생, 모든 항목 빈 상태에서 입력
    # "delta" — 이전 상담 이력 있음, 변동분만 입력
    # preheigh1 타입은 항상 "full"

    # 응답 본체 (스키마 버전과 동일한 구조의 JSONB)
    # 예: { "A": { "A1": "홍길동", "A2": "대치중" }, "B": { ... }, ... }
    answers: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # 카테고리별 진행 상태
    # 예: { "A": "completed", "B": "skipped", "C": "in_progress", ... }
    category_status: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # 전체 설문 상태
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft", index=True)
    # "draft"     — 작성 중
    # "submitted" — 학생이 제출 완료 (상담사 확인 가능)

    # 자동 분석 결과 자체 검증 상태 (기획서 §4-8-1)
    analysis_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending", index=True
    )
    # "pending"  — 미검증 (아직 자동 분석 결과 조회 전)
    # "pass"     — P1/P2 모두 통과
    # "repaired" — 자동 보정 후 P1 통과 (상담사에게 보정 내역 안내)
    # "warn"     — P2 경고 잔존 (상담사 검토 권장하나 진행 가능)
    # "blocked"  — P1 FAIL 자동 보정 실패 (상담 진행 차단, 슈퍼관리자 점검 필요)

    # 검증 스냅샷 (마지막 검증 결과 전문)
    # { "status", "auto_repaired", "repair_log", "p1_issues", "p2_issues", "p3_issues", "validated_at" }
    analysis_validation: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # 마지막 작업 위치 (이어쓰기 시 사용)
    last_category: Mapped[str | None] = mapped_column(String(4), nullable=True)
    last_question: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # 플랫폼 추적 (모바일/웹 이어쓰기 분석용)
    started_platform: Mapped[str] = mapped_column(String(10), nullable=False, default="web")
    # "web" | "mobile"
    last_edited_platform: Mapped[str] = mapped_column(String(10), nullable=False, default="web")

    # 스키마 버전 (스키마 변경 시 마이그레이션 추적용)
    schema_version: Mapped[str] = mapped_column(String(20), nullable=False, default="0.2.0-draft")

    # 연결된 상담 예약 (있는 경우)
    booking_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("consultation_bookings.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # 이어쓰기 토큰 (이메일/딥링크용, 만료 가능)
    resume_token: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True, index=True)
    resume_token_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # 메모 (학생용 자유 메모, 상담사에게 전달)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 상담사 메모 (관리자/상담사 전용)
    admin_memo: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 액션 플랜 (상담 후 실행 과제, JSONB)
    action_plan: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # --- 상담사 검토/수정 ---
    # 자동 분석 초안 대비 상담사가 수정한 값 (점수, 코멘트 등)
    # 예: { "radar_scores": { "overall_score": 82, ... }, "grade_trend_comment": "..." }
    counselor_overrides: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # 상담사 체크리스트 (상담 전 확인 사항, 리포트 미포함)
    # 예: { "items": [{"content": "...", "checked": false}], "updated_at": "..." }
    counselor_checklist: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # 로드맵 진행 체크 (학생이 직접 체크하는 진행 상태)
    # 예: { "p0": { "academic": true, "naesin": false }, "p1": { ... } }
    roadmap_progress: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # --- 고1 전환 데이터 연계 ---
    # 이 설문이 전환된 원본 설문 ID (preheigh1 → high 전환 시)
    source_survey_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("consultation_surveys.id", ondelete="SET NULL"),
        nullable=True,
    )

    # 원본 설문에서 보존한 데이터 (예비고1 E영역 등, 비교 상담용)
    # 예: { "preheigh1_E": { ... }, "preheigh1_C": { ... }, "converted_at": "..." }
    preserved_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # 타임스탬프
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # 관계
    user = relationship("User", back_populates="consultation_surveys")
    booking = relationship("ConsultationBooking")
    source_survey = relationship("ConsultationSurvey", remote_side=[id], foreign_keys=[source_survey_id])
