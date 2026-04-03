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

    @model_validator(mode="after")
    def validate_by_member_type(self):
        mt = self.member_type
        if mt not in ("student", "parent", "branch_manager"):
            raise ValueError("member_type은 'student', 'parent', 'branch_manager' 중 하나여야 합니다")

        if mt in ("student", "parent"):
            if not self.phone:
                raise ValueError("학생/학부모 회원은 연락처를 입력해야 합니다")

        if mt == "parent":
            if not self.student_name:
                raise ValueError("학부모 회원은 자녀 이름을 입력해야 합니다")
            if not self.student_birth:
                raise ValueError("학부모 회원은 자녀 생년월일을 입력해야 합니다")

        if mt == "branch_manager":
            if not self.branch_name:
                raise ValueError("지점 담당자는 지점명을 입력해야 합니다")

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
    branch_name: str | None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    name: str | None = None
    phone: str | None = None
    student_name: str | None = None
    student_birth: date | None = None
    birth_date: date | None = None
    school_name: str | None = None
    grade: int | None = None
    branch_name: str | None = None


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
