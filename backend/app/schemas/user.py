import uuid
from datetime import date, datetime

from pydantic import BaseModel, EmailStr, model_validator


class UserRegister(BaseModel):
    email: EmailStr
    password: str
    name: str
    phone: str | None = None
    member_type: str = "student"  # student / parent / branch_manager
    student_name: str | None = None
    student_birth: date | None = None
    birth_date: date | None = None
    school_name: str | None = None
    grade: int | None = None
    branch_name: str | None = None
    is_academy_student: bool = False
    agree_terms: bool = False
    agree_privacy: bool = False

    @model_validator(mode="after")
    def validate_by_member_type(self):
        mt = self.member_type
        if mt not in ("student", "parent", "branch_manager"):
            raise ValueError("member_type은 'student', 'parent', 'branch_manager' 중 하나여야 합니다")

        if mt in ("student", "parent"):
            if not self.phone:
                raise ValueError("연락처를 입력해야 합니다")
            if not self.birth_date:
                raise ValueError("생년월일을 입력해야 합니다")
            if not self.school_name:
                raise ValueError("재학 학교를 입력해야 합니다")
            if self.grade is None:
                raise ValueError("학년을 선택해야 합니다")
            # 재원생이면 지점명이 필수
            if self.is_academy_student and not self.branch_name:
                raise ValueError("재원생은 재원 지점을 선택해야 합니다")

        if mt == "parent":
            if not self.student_name:
                raise ValueError("학부모 회원은 자녀 이름을 입력해야 합니다")
            if not self.student_birth:
                raise ValueError("학부모 회원은 자녀 생년월일을 입력해야 합니다")

        if mt == "branch_manager":
            if not self.branch_name:
                raise ValueError("지점 담당자는 지점명을 입력해야 합니다")
            if not self.phone:
                raise ValueError("연락처를 입력해야 합니다")
            # 지점 담당자는 재원생 플래그 강제 False
            self.is_academy_student = False

        if self.grade is not None and self.grade not in (1, 2, 3):
            raise ValueError("학년은 1, 2, 3 중 하나여야 합니다")

        return self


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    name: str
    phone: str | None
    member_type: str
    student_name: str | None
    student_birth: date | None
    birth_date: date | None
    school_name: str | None
    grade: int | None
    grade_year: int | None
    branch_name: str | None
    is_academy_student: bool = False
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def compute_current_grade(self):
        """학년 자동 진급: grade_year 기준으로 현재 학년 계산"""
        if self.grade is not None and self.grade_year is not None:
            current_year = date.today().year
            diff = current_year - self.grade_year
            adjusted = self.grade + diff
            if adjusted > 3:
                self.grade = None  # 졸업 (3학년 초과)
            else:
                self.grade = max(1, adjusted)
        return self


class UserUpdate(BaseModel):
    name: str | None = None
    phone: str | None = None
    student_name: str | None = None
    student_birth: date | None = None
    birth_date: date | None = None
    school_name: str | None = None
    grade: int | None = None
    branch_name: str | None = None
    is_academy_student: bool | None = None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenRefresh(BaseModel):
    refresh_token: str


class AdminLogin(BaseModel):
    email: EmailStr
    password: str


class AdminResponse(BaseModel):
    id: uuid.UUID
    email: str
    name: str
    role: str
    created_at: datetime

    model_config = {"from_attributes": True}
