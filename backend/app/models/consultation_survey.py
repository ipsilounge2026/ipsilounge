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

    # 타임스탬프
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # 관계
    user = relationship("User", back_populates="consultation_surveys")
    booking = relationship("ConsultationBooking")
