"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { register, login, searchSchools } from "@/lib/api";

interface SchoolResult {
  school_name: string;
  school_code: string;
  address: string;
  region: string;
  school_type: string;
}

function Arrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
    </svg>
  );
}
function Pin() {
  return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z" /></svg>;
}

const BRANCHES = ["경복궁점","광화문점","구리점","대치점","대흥점","마포점","분당점","은평점","중계점","대치스터디센터점"];

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    email: "",
    password: "",
    passwordConfirm: "",
    name: "",
    phone: "",
    member_type: "student" as "student" | "parent" | "branch_manager",
    birth_date: "",
    school_name: "",
    grade: "",
    student_name: "",
    student_birth: "",
    branch_name: "",
    is_academy_student: false,
  });
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [agreeAll, setAgreeAll] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // School search
  const [schoolQuery, setSchoolQuery] = useState("");
  const [schoolSelected, setSchoolSelected] = useState(false);
  const [schoolResults, setSchoolResults] = useState<SchoolResult[]>([]);
  const [showSchoolDropdown, setShowSchoolDropdown] = useState(false);
  const [searchingSchool, setSearchingSchool] = useState(false);
  const schoolDropdownRef = useRef<HTMLDivElement>(null);
  const searchTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (schoolDropdownRef.current && !schoolDropdownRef.current.contains(e.target as Node)) {
        setShowSchoolDropdown(false);
        setSchoolSelected((wasSelected) => {
          if (!wasSelected) setSchoolQuery("");
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
        agree_terms: true,
        agree_privacy: true,
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

  const isStudentParent = form.member_type === "student" || form.member_type === "parent";
  const sec3Label = form.member_type === "branch_manager" ? "지점 정보"
    : form.member_type === "parent" ? "학부모·자녀 정보" : "학생 정보";

  return (
    <div className="lp lp-auth">
      <header className="lp-header">
        <div className="lp-wrap lp-header-inner">
          <Link href="/" className="lp-logo"><Pin />입시라운지</Link>
          <nav className="lp-nav">
            <Link href="/news">입시 뉴스</Link>
            <Link href="/login">로그인</Link>
            <span className="lp-divider" />
            <Link href="/register" className="lp-btn lp-btn-primary">회원가입 <Arrow /></Link>
          </nav>
        </div>
      </header>

      <main className="lp-auth-body">
        <div className="lp-auth-grid">
          {/* 좌측 인트로 */}
          <section className="lp-auth-intro">
            <p className="lp-auth-eyebrow">Create an account</p>
            <h1 className="lp-auth-title">
              회원가입.
              <span className="lp-en">Begin here.</span>
            </h1>
            <p className="lp-auth-sub">입시라운지에 가입하고 서비스를 시작하세요.</p>
            <ul className="lp-auth-toc">
              <li><span className="toc-num">§ 01</span><span className="toc-label">회원 유형</span></li>
              <li><span className="toc-num">§ 02</span><span className="toc-label">기본 정보</span></li>
              <li><span className="toc-num">§ 03</span><span className="toc-label">{sec3Label}</span></li>
              <li><span className="toc-num">§ 04</span><span className="toc-label">약관 동의</span></li>
            </ul>
          </section>

          <div className="lp-auth-divider" aria-hidden="true" />

          {/* 우측 폼 */}
          <section className="lp-auth-form">
            <form onSubmit={handleSubmit}>
              {error && <div className="lp-auth-error">{error}</div>}

              {/* §01 회원 유형 */}
              <div className="lp-sec">
                <div className="lp-sec-mark">
                  <span className="sec-no">01</span><span className="sec-en">Member type</span>
                </div>
                <h2 className="lp-sec-title">회원 유형</h2>
                <div className="lp-seg">
                  {memberTypes.map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      className={form.member_type === key ? "is-active" : ""}
                      onClick={() => setForm((prev) => ({
                        ...prev,
                        member_type: key,
                        branch_name: "",
                        is_academy_student: false,
                      }))}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* §02 기본 정보 */}
              <div className="lp-sec">
                <div className="lp-sec-mark">
                  <span className="sec-no">02</span><span className="sec-en">Basic information</span>
                </div>
                <h2 className="lp-sec-title">기본 정보</h2>

                <div className="lp-field">
                  <label>NAME<span className="ko">· 이름</span></label>
                  <input type="text" aria-label="이름" className="lp-input" value={form.name}
                    onChange={(e) => update("name", e.target.value)} placeholder="이름을 입력하세요" required />
                </div>
                <div className="lp-field">
                  <label>EMAIL<span className="ko">· 이메일</span></label>
                  <input type="email" aria-label="이메일" className="lp-input" value={form.email}
                    onChange={(e) => update("email", e.target.value)} placeholder="이메일을 입력하세요" required />
                </div>
                <div className="lp-field">
                  <label>PASSWORD<span className="ko">· 비밀번호</span></label>
                  <input type="password" aria-label="비밀번호" className="lp-input" value={form.password}
                    onChange={(e) => update("password", e.target.value)} placeholder="6자 이상" required />
                </div>
                <div className="lp-field">
                  <label>CONFIRM<span className="ko">· 비밀번호 확인</span></label>
                  <input type="password" aria-label="비밀번호 확인" className="lp-input" value={form.passwordConfirm}
                    onChange={(e) => update("passwordConfirm", e.target.value)} placeholder="비밀번호를 다시 입력하세요" required />
                </div>
                <div className="lp-field">
                  <label>PHONE<span className="ko">· 연락처</span></label>
                  <input type="tel" aria-label="연락처" className="lp-input" value={form.phone}
                    onChange={(e) => update("phone", e.target.value)} placeholder="010-0000-0000" required />
                </div>
              </div>

              {/* §03 학생/학부모 정보 */}
              {isStudentParent && (
                <div className="lp-sec">
                  <div className="lp-sec-mark">
                    <span className="sec-no">03</span><span className="sec-en">Student information</span>
                  </div>
                  <h2 className="lp-sec-title">{sec3Label}</h2>

                  <div className="lp-field">
                    <label>DATE OF BIRTH<span className="ko">· 생년월일</span></label>
                    <input type="date" className="lp-input" value={form.birth_date}
                      onChange={(e) => update("birth_date", e.target.value)} required />
                  </div>

                  {form.member_type === "parent" && (
                    <>
                      <div className="lp-field">
                        <label>CHILD NAME<span className="ko">· 자녀 이름</span></label>
                        <input type="text" className="lp-input" value={form.student_name}
                          onChange={(e) => update("student_name", e.target.value)} placeholder="자녀 이름을 입력하세요" />
                      </div>
                      <div className="lp-field">
                        <label>CHILD BIRTH<span className="ko">· 자녀 생년월일</span></label>
                        <input type="date" className="lp-input" value={form.student_birth}
                          onChange={(e) => update("student_birth", e.target.value)} />
                      </div>
                    </>
                  )}

                  <div className="lp-field" ref={schoolDropdownRef}>
                    <label>SCHOOL<span className="ko">· {form.member_type === "parent" ? "자녀 재학 학교" : "재학 학교"}</span></label>
                    <input
                      type="text"
                      className="lp-input"
                      value={schoolSelected ? form.school_name : schoolQuery}
                      onChange={(e) => handleSchoolSearch(e.target.value)}
                      onFocus={() => {
                        if (schoolSelected && form.school_name) {
                          setSchoolQuery(form.school_name);
                          setSchoolSelected(false);
                        }
                      }}
                      placeholder="학교명을 입력하세요 (2글자 이상)"
                      autoComplete="off"
                    />
                    {searchingSchool && (
                      <div style={{ position: "absolute", right: 0, bottom: 10, color: "var(--lp-muted)", fontSize: 12 }}>검색 중...</div>
                    )}
                    {showSchoolDropdown && schoolResults.length > 0 && (
                      <div className="lp-school-dd">
                        {schoolResults.map((s, i) => (
                          <div key={`${s.school_code}-${i}`} className="lp-school-dd-item" onClick={() => selectSchool(s)}>
                            <div style={{ fontWeight: 600 }}>{s.school_name}</div>
                            <div className="reg">{s.region} {s.school_type && `(${s.school_type})`}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="lp-field">
                    <label>GRADE<span className="ko">· {form.member_type === "parent" ? "자녀 학년" : "학년"}</span></label>
                    <select className="lp-input" value={form.grade}
                      onChange={(e) => update("grade", e.target.value)}>
                      <option value="">선택하세요</option>
                      <option value="1">1학년</option>
                      <option value="2">2학년</option>
                      <option value="3">3학년</option>
                    </select>
                  </div>

                  <label className="lp-check" style={{ marginBottom: form.is_academy_student ? 24 : 0 }}>
                    <input type="checkbox" checked={form.is_academy_student}
                      onChange={(e) => updateBool("is_academy_student", e.target.checked)} />
                    {form.member_type === "parent" ? "자녀가 입시라운지 재원생입니다" : "입시라운지 재원생입니다"}
                  </label>

                  {form.is_academy_student && (
                    <div className="lp-field" style={{ marginTop: 24, marginBottom: 0 }}>
                      <label>BRANCH<span className="ko">· 재원 지점</span></label>
                      <select className="lp-input" value={form.branch_name}
                        onChange={(e) => update("branch_name", e.target.value)} required>
                        <option value="">재원 지점을 선택해주세요</option>
                        {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* §03 지점 담당자 정보 */}
              {form.member_type === "branch_manager" && (
                <div className="lp-sec">
                  <div className="lp-sec-mark">
                    <span className="sec-no">03</span><span className="sec-en">Branch information</span>
                  </div>
                  <h2 className="lp-sec-title">지점 정보</h2>
                  <div className="lp-field" style={{ marginBottom: 8 }}>
                    <label>BRANCH<span className="ko">· 지점명</span></label>
                    <select className="lp-input" value={form.branch_name}
                      onChange={(e) => update("branch_name", e.target.value)} required>
                      <option value="">지점을 선택해주세요</option>
                      {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <p style={{ fontSize: 12, color: "var(--lp-muted)" }}>
                    * 지점 담당자 가입은 관리자 승인 후 이용 가능합니다.
                  </p>
                </div>
              )}

              {/* §04 약관 동의 */}
              <div className="lp-sec">
                <div className="lp-sec-mark">
                  <span className="sec-no">04</span><span className="sec-en">Agreement</span>
                </div>
                <h2 className="lp-sec-title">약관 동의</h2>
                <div className="lp-terms">
                  <label className="lp-terms-all">
                    <input type="checkbox" checked={agreeAll} onChange={(e) => handleAgreeAll(e.target.checked)} />
                    전체 동의
                  </label>
                  <label className="lp-terms-row">
                    <input type="checkbox" checked={agreeTerms} onChange={(e) => handleIndividualAgree("terms", e.target.checked)} />
                    <span><span className="req">[필수]</span> 이용약관에 동의합니다</span>
                    <Link href="/terms" target="_blank" className="view">보기</Link>
                  </label>
                  <label className="lp-terms-row">
                    <input type="checkbox" checked={agreePrivacy} onChange={(e) => handleIndividualAgree("privacy", e.target.checked)} />
                    <span><span className="req">[필수]</span> 개인정보처리방침에 동의합니다</span>
                    <Link href="/privacy" target="_blank" className="view">보기</Link>
                  </label>
                </div>
              </div>

              <button type="submit" className="lp-auth-submit" disabled={loading || !agreeTerms || !agreePrivacy}>
                {loading ? "가입 중..." : <>회원가입 <Arrow /></>}
              </button>

              <div className="lp-auth-foot">
                이미 계정이 있으신가요? <Link href="/login">로그인 →</Link>
              </div>
            </form>
          </section>
        </div>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-inner">
          <Link href="/" className="lp-logo" style={{ fontSize: 17 }}><Pin />입시라운지</Link>
          <div className="lp-footer-links">
            <Link href="/terms">이용약관</Link>
            <Link href="/privacy">개인정보처리방침</Link>
          </div>
          <span className="lp-footer-copy">© 2026 입시라운지. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}
