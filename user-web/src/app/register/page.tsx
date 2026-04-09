"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { register, login, searchSchools } from "@/lib/api";

interface SchoolResult {
  school_name: string;
  school_code: string;
  address: string;
  region: string;
  school_type: string;
}

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    email: "",
    password: "",
    passwordConfirm: "",
    name: "",
    phone: "",
    member_type: "student" as "student" | "parent" | "branch_manager",
    // student/parent
    birth_date: "",
    school_name: "",
    grade: "",
    // parent only
    student_name: "",
    student_birth: "",
    // branch_manager only / student·parent: 재원 지점
    branch_name: "",
    // student/parent: 재원생 여부
    is_academy_student: false,
  });
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [agreeAll, setAgreeAll] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // School search
  const [schoolQuery, setSchoolQuery] = useState("");
  const [schoolSelected, setSchoolSelected] = useState(false); // 검색 결과에서 선택했는지 여부
  const [schoolResults, setSchoolResults] = useState<SchoolResult[]>([]);
  const [showSchoolDropdown, setShowSchoolDropdown] = useState(false);
  const [searchingSchool, setSearchingSchool] = useState(false);
  const schoolDropdownRef = useRef<HTMLDivElement>(null);
  const searchTimer = useRef<NodeJS.Timeout | null>(null);

  // Click outside to close dropdown — 선택 안 했으면 입력값 초기화
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (schoolDropdownRef.current && !schoolDropdownRef.current.contains(e.target as Node)) {
        setShowSchoolDropdown(false);
        setSchoolSelected((wasSelected) => {
          if (!wasSelected) {
            // 검색만 하고 선택하지 않은 경우: 검색어 지우고 기존 선택값 유지
            setSchoolQuery("");
          }
          return wasSelected;
        });
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSchoolSearch = useCallback((value: string) => {
    setSchoolQuery(value);
    setSchoolSelected(false);
    // 타이핑 중에는 form.school_name을 업데이트하지 않음 (선택해야만 저장)
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (value.length < 2) {
      setSchoolResults([]);
      setShowSchoolDropdown(false);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setSearchingSchool(true);
      try {
        const results = await searchSchools(value);
        setSchoolResults(results);
        setShowSchoolDropdown(results.length > 0);
      } catch {
        setSchoolResults([]);
      } finally {
        setSearchingSchool(false);
      }
    }, 300);
  }, []);

  const selectSchool = (school: SchoolResult) => {
    update("school_name", school.school_name);
    setSchoolQuery(school.school_name);
    setSchoolSelected(true);
    setShowSchoolDropdown(false);
  };

  const handleAgreeAll = (checked: boolean) => {
    setAgreeAll(checked);
    setAgreeTerms(checked);
    setAgreePrivacy(checked);
  };

  const handleIndividualAgree = (type: "terms" | "privacy", checked: boolean) => {
    if (type === "terms") {
      setAgreeTerms(checked);
      setAgreeAll(checked && agreePrivacy);
    } else {
      setAgreePrivacy(checked);
      setAgreeAll(agreeTerms && checked);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!agreeTerms || !agreePrivacy) {
      setError("필수 약관에 모두 동의해주세요");
      return;
    }
    if (form.password !== form.passwordConfirm) {
      setError("비밀번호가 일치하지 않습니다");
      return;
    }
    if (form.password.length < 6) {
      setError("비밀번호는 6자 이상이어야 합니다");
      return;
    }

    // member_type별 검증
    if (form.member_type === "student" || form.member_type === "parent") {
      if (!form.phone) { setError("연락처를 입력해주세요"); return; }
      if (!form.birth_date) { setError("생년월일을 입력해주세요"); return; }
      if (!form.school_name || !schoolSelected) { setError("재학 학교를 검색하여 선택해주세요"); return; }
      if (!form.grade) { setError("학년을 선택해주세요"); return; }
      if (form.is_academy_student && !form.branch_name) {
        setError("재원생이시면 재원 지점을 선택해주세요");
        return;
      }
    }
    if (form.member_type === "parent") {
      if (!form.student_name) { setError("자녀 이름을 입력해주세요"); return; }
      if (!form.student_birth) { setError("자녀 생년월일을 입력해주세요"); return; }
    }
    if (form.member_type === "branch_manager") {
      if (!form.branch_name) { setError("지점명을 입력해주세요"); return; }
      if (!form.phone) { setError("연락처를 입력해주세요"); return; }
    }

    setLoading(true);
    try {
      const payload: Record<string, any> = {
        email: form.email,
        password: form.password,
        name: form.name,
        phone: form.phone || undefined,
        member_type: form.member_type,
      };

      if (form.member_type === "student" || form.member_type === "parent") {
        if (form.birth_date) payload.birth_date = form.birth_date;
        if (form.school_name) payload.school_name = form.school_name;
        if (form.grade) payload.grade = Number(form.grade);
        payload.is_academy_student = form.is_academy_student;
        if (form.is_academy_student && form.branch_name) {
          payload.branch_name = form.branch_name;
        }
      }
      if (form.member_type === "parent") {
        payload.student_name = form.student_name || undefined;
        payload.student_birth = form.student_birth || undefined;
      }
      if (form.member_type === "branch_manager") {
        payload.branch_name = form.branch_name;
      }

      await register(payload as any);

      if (form.member_type === "branch_manager") {
        // 지점 담당자: 자동 로그인 없음, 승인 안내 후 로그인 페이지로
        alert("회원가입이 완료되었습니다.\n관리자 승인 후 로그인할 수 있습니다.");
        router.push("/login");
      } else {
        await login(form.email, form.password);
        router.push("/analysis");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const update = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));
  const updateBool = (field: string, value: boolean) => setForm((prev) => ({ ...prev, [field]: value }));

  const memberTypes = [
    { key: "student", label: "학생" },
    { key: "parent", label: "학부모" },
    { key: "branch_manager", label: "지점 담당자" },
  ] as const;

  return (
    <>
      <Navbar />
      <div className="auth-page">
        <form className="auth-card" onSubmit={handleSubmit}>
          <h1>회원가입</h1>
          <p>입시라운지에 가입하고 서비스를 시작하세요</p>

          {error && <div className="error-msg">{error}</div>}

          {/* 회원 유형 선택 */}
          <div className="form-group">
            <label>회원 유형</label>
            <div style={{ display: "flex", gap: 10 }}>
              {memberTypes.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setForm((prev) => ({
                    ...prev,
                    member_type: key,
                    // 회원 유형 변경 시 지점 및 재원생 플래그 초기화
                    branch_name: "",
                    is_academy_student: false,
                  }))}
                  style={{
                    flex: 1,
                    padding: "12px 8px",
                    border: form.member_type === key ? "2px solid #2563eb" : "2px solid #e5e7eb",
                    borderRadius: 8,
                    backgroundColor: form.member_type === key ? "#eff6ff" : "#fff",
                    color: form.member_type === key ? "#2563eb" : "#374151",
                    fontWeight: form.member_type === key ? 600 : 400,
                    cursor: "pointer",
                    fontSize: 14,
                    transition: "all 0.2s",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 공통 필드 */}
          <div className="form-group">
            <label>이름</label>
            <input type="text" className="form-control" value={form.name}
              onChange={(e) => update("name", e.target.value)} placeholder="이름을 입력하세요" required />
          </div>
          <div className="form-group">
            <label>이메일</label>
            <input type="email" className="form-control" value={form.email}
              onChange={(e) => update("email", e.target.value)} placeholder="이메일을 입력하세요" required />
          </div>
          <div className="form-group">
            <label>비밀번호</label>
            <input type="password" className="form-control" value={form.password}
              onChange={(e) => update("password", e.target.value)} placeholder="6자 이상" required />
          </div>
          <div className="form-group">
            <label>비밀번호 확인</label>
            <input type="password" className="form-control" value={form.passwordConfirm}
              onChange={(e) => update("passwordConfirm", e.target.value)} placeholder="비밀번호를 다시 입력하세요" required />
          </div>
          <div className="form-group">
            <label>연락처</label>
            <input type="tel" className="form-control" value={form.phone}
              onChange={(e) => update("phone", e.target.value)} placeholder="010-0000-0000" required />
          </div>

          {/* 학생/학부모 공통 추가 필드 */}
          {(form.member_type === "student" || form.member_type === "parent") && (
            <div style={{
              backgroundColor: "#f9fafb",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              padding: 16,
              marginBottom: 16,
            }}>
              <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 12, fontWeight: 500 }}>
                {form.member_type === "student" ? "학생 정보" : "학부모 및 자녀 정보"}
              </p>

              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>생년월일</label>
                <input type="date" className="form-control" value={form.birth_date}
                  onChange={(e) => update("birth_date", e.target.value)} required />
              </div>

              {/* 학부모: 자녀 정보 */}
              {form.member_type === "parent" && (
                <>
                  <div className="form-group" style={{ marginBottom: 12 }}>
                    <label>자녀 이름</label>
                    <input type="text" className="form-control" value={form.student_name}
                      onChange={(e) => update("student_name", e.target.value)} placeholder="자녀 이름을 입력하세요" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 12 }}>
                    <label>자녀 생년월일</label>
                    <input type="date" className="form-control" value={form.student_birth}
                      onChange={(e) => update("student_birth", e.target.value)} />
                  </div>
                </>
              )}

              {/* 학교 검색 */}
              <div className="form-group" style={{ marginBottom: 12, position: "relative" }} ref={schoolDropdownRef}>
                <label>{form.member_type === "parent" ? "자녀 재학 학교" : "재학 학교"}</label>
                <input
                  type="text"
                  className="form-control"
                  value={schoolSelected ? form.school_name : schoolQuery}
                  onChange={(e) => handleSchoolSearch(e.target.value)}
                  onFocus={() => {
                    // 포커스 시: 이미 선택된 학교가 있으면 검색어로 전환하여 재검색 가능
                    if (schoolSelected && form.school_name) {
                      setSchoolQuery(form.school_name);
                      setSchoolSelected(false);
                    }
                  }}
                  placeholder="학교명을 입력하세요 (2글자 이상)"
                  autoComplete="off"
                />
                {searchingSchool && (
                  <div style={{ position: "absolute", right: 12, top: 38, color: "#9CA3AF", fontSize: 12 }}>
                    검색 중...
                  </div>
                )}
                {showSchoolDropdown && schoolResults.length > 0 && (
                  <div style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    zIndex: 50,
                    backgroundColor: "#fff",
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    maxHeight: 200,
                    overflowY: "auto",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                  }}>
                    {schoolResults.map((s, i) => (
                      <div
                        key={`${s.school_code}-${i}`}
                        onClick={() => selectSchool(s)}
                        style={{
                          padding: "10px 14px",
                          cursor: "pointer",
                          borderBottom: "1px solid #f3f4f6",
                          fontSize: 14,
                        }}
                        onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#f9fafb")}
                        onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "")}
                      >
                        <div style={{ fontWeight: 500 }}>{s.school_name}</div>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>
                          {s.region} {s.school_type && `(${s.school_type})`}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 학년 */}
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>{form.member_type === "parent" ? "자녀 학년" : "학년"}</label>
                <select className="form-control" value={form.grade}
                  onChange={(e) => update("grade", e.target.value)}>
                  <option value="">선택하세요</option>
                  <option value="1">1학년</option>
                  <option value="2">2학년</option>
                  <option value="3">3학년</option>
                </select>
              </div>

              {/* 재원생 여부 */}
              <div className="form-group" style={{ marginBottom: form.is_academy_student ? 12 : 0 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontWeight: 500 }}>
                  <input
                    type="checkbox"
                    checked={form.is_academy_student}
                    onChange={(e) => updateBool("is_academy_student", e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: "#2563eb" }}
                  />
                  <span>{form.member_type === "parent" ? "자녀가 입시라운지 재원생입니다" : "입시라운지 재원생입니다"}</span>
                </label>
              </div>

              {/* 재원 지점 (재원생 선택 시만) */}
              {form.is_academy_student && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>재원 지점</label>
                  <select className="form-control" value={form.branch_name}
                    onChange={(e) => update("branch_name", e.target.value)} required>
                    <option value="">재원 지점을 선택해주세요</option>
                    <option value="경복궁점">경복궁점</option>
                    <option value="광화문점">광화문점</option>
                    <option value="구리점">구리점</option>
                    <option value="대치점">대치점</option>
                    <option value="대흥점">대흥점</option>
                    <option value="마포점">마포점</option>
                    <option value="분당점">분당점</option>
                    <option value="은평점">은평점</option>
                    <option value="중계점">중계점</option>
                    <option value="대치스터디센터점">대치스터디센터점</option>
                  </select>
                </div>
              )}
            </div>
          )}

          {/* 지점 담당자 추가 필드 */}
          {form.member_type === "branch_manager" && (
            <div style={{
              backgroundColor: "#FFF7ED",
              border: "1px solid #FED7AA",
              borderRadius: 8,
              padding: 16,
              marginBottom: 16,
            }}>
              <p style={{ fontSize: 13, color: "#9A3412", marginBottom: 12, fontWeight: 500 }}>
                지점 담당자 정보
              </p>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>지점명</label>
                <select className="form-control" value={form.branch_name}
                  onChange={(e) => update("branch_name", e.target.value)} required>
                  <option value="">지점을 선택해주세요</option>
                  <option value="경복궁점">경복궁점</option>
                  <option value="광화문점">광화문점</option>
                  <option value="구리점">구리점</option>
                  <option value="대치점">대치점</option>
                  <option value="대흥점">대흥점</option>
                  <option value="마포점">마포점</option>
                  <option value="분당점">분당점</option>
                  <option value="은평점">은평점</option>
                  <option value="중계점">중계점</option>
                  <option value="대치스터디센터점">대치스터디센터점</option>
                </select>
              </div>
              <p style={{ fontSize: 12, color: "#B45309", marginTop: 8 }}>
                * 지점 담당자 가입은 관리자 승인 후 이용 가능합니다.
              </p>
            </div>
          )}

          {/* 약관 동의 */}
          <div style={{
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: 16,
            marginBottom: 16,
          }}>
            <label style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              cursor: "pointer",
              paddingBottom: 12,
              borderBottom: "1px solid #e5e7eb",
              marginBottom: 12,
              fontWeight: 600,
              fontSize: 15,
            }}>
              <input
                type="checkbox"
                checked={agreeAll}
                onChange={(e) => handleAgreeAll(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: "#2563eb" }}
              />
              전체 동의
            </label>

            <label style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              cursor: "pointer",
              marginBottom: 8,
              fontSize: 14,
              color: "#374151",
            }}>
              <input
                type="checkbox"
                checked={agreeTerms}
                onChange={(e) => handleIndividualAgree("terms", e.target.checked)}
                style={{ width: 16, height: 16, accentColor: "#2563eb" }}
              />
              <span>[필수] 이용약관에 동의합니다</span>
              <Link href="/terms" target="_blank" style={{
                marginLeft: "auto",
                fontSize: 12,
                color: "#6b7280",
                textDecoration: "underline",
              }}>
                보기
              </Link>
            </label>

            <label style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              cursor: "pointer",
              fontSize: 14,
              color: "#374151",
            }}>
              <input
                type="checkbox"
                checked={agreePrivacy}
                onChange={(e) => handleIndividualAgree("privacy", e.target.checked)}
                style={{ width: 16, height: 16, accentColor: "#2563eb" }}
              />
              <span>[필수] 개인정보처리방침에 동의합니다</span>
              <Link href="/privacy" target="_blank" style={{
                marginLeft: "auto",
                fontSize: 12,
                color: "#6b7280",
                textDecoration: "underline",
              }}>
                보기
              </Link>
            </label>
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={loading || !agreeTerms || !agreePrivacy}>
            {loading ? "가입 중..." : "회원가입"}
          </button>

          <div className="link-text">
            이미 계정이 있으신가요? <Link href="/login">로그인</Link>
          </div>
        </form>
      </div>
    </>
  );
}
