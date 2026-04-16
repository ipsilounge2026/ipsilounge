"use client";

import Navbar from "@/components/Navbar";

export default function PrivacyPage() {
  return (
    <>
      <Navbar />
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "40px 20px", lineHeight: 1.8 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 32 }}>개인정보처리방침</h1>

        <p style={{ fontSize: 15, color: "#374151", marginBottom: 32 }}>
          입시라운지(이하 &quot;서비스&quot;)는 개인정보보호법 등 관련 법령에 따라 이용자의 개인정보를 보호하고,
          이와 관련한 고충을 신속하고 원활하게 처리하기 위하여 다음과 같이 개인정보처리방침을 수립하여 공개합니다.
        </p>

        <Section title="제1조 (수집하는 개인정보 항목)">
          서비스는 다음과 같은 개인정보를 수집합니다.
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12, fontSize: 14 }}>
            <thead>
              <tr style={{ backgroundColor: "#f9fafb" }}>
                <th style={thStyle}>구분</th>
                <th style={thStyle}>수집 항목</th>
                <th style={thStyle}>수집 목적</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={tdStyle}>회원가입 (필수)</td>
                <td style={tdStyle}>이메일, 비밀번호, 이름</td>
                <td style={tdStyle}>회원 식별 및 서비스 제공</td>
              </tr>
              <tr>
                <td style={tdStyle}>회원가입 (선택)</td>
                <td style={tdStyle}>연락처</td>
                <td style={tdStyle}>상담 연락 및 알림</td>
              </tr>
              <tr>
                <td style={tdStyle}>학부모 회원 (필수)</td>
                <td style={tdStyle}>자녀 이름, 자녀 생년월일</td>
                <td style={tdStyle}>학생 확인 및 분석 서비스 제공</td>
              </tr>
              <tr>
                <td style={tdStyle}>학생부 분석</td>
                <td style={tdStyle}>학생부 파일 (PDF/이미지)</td>
                <td style={tdStyle}>학생부 분석 리포트 생성</td>
              </tr>
              <tr>
                <td style={tdStyle}>사전 상담 설문</td>
                <td style={tdStyle}>설문 응답 데이터, 학습 현황, 성적 정보, 학습 방법</td>
                <td style={tdStyle}>맞춤 상담 제공 및 변화 추적</td>
              </tr>
              <tr>
                <td style={tdStyle}>자동 수집</td>
                <td style={tdStyle}>접속 IP, 접속 일시, 브라우저 종류</td>
                <td style={tdStyle}>서비스 이용 통계 및 부정이용 방지</td>
              </tr>
            </tbody>
          </table>
        </Section>

        <Section title="제2조 (개인정보의 수집 및 이용 목적)">
          서비스는 수집한 개인정보를 다음의 목적을 위해 이용합니다.
          <ol>
            <li><strong>회원 관리</strong>: 회원가입 확인, 본인 확인, 회원 식별, 부정이용 방지</li>
            <li><strong>서비스 제공</strong>: 학생부 분석 리포트 생성 및 제공, 상담 예약 처리</li>
            <li><strong>고객 지원</strong>: 문의 응대, 공지사항 전달, 서비스 관련 알림</li>
            <li><strong>서비스 개선</strong>: 이용 통계 분석, 서비스 품질 향상</li>
            <li><strong>상담 연계</strong>: 사전 설문 기반 상담 준비, 이전 상담 대비 변화 추적, 학습 로드맵 생성 및 상담사 간 상담 데이터 공유</li>
          </ol>
        </Section>

        <Section title="제3조 (개인정보의 보유 및 이용 기간)">
          <ol>
            <li>회원의 개인정보는 회원 탈퇴 시 즉시 파기합니다.</li>
            <li>다만, 다음의 정보는 아래의 이유로 명시한 기간 동안 보존합니다.
              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12, fontSize: 14 }}>
                <thead>
                  <tr style={{ backgroundColor: "#f9fafb" }}>
                    <th style={thStyle}>보존 항목</th>
                    <th style={thStyle}>보존 기간</th>
                    <th style={thStyle}>보존 근거</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={tdStyle}>서비스 이용 기록</td>
                    <td style={tdStyle}>3년</td>
                    <td style={tdStyle}>전자상거래 등에서의 소비자보호에 관한 법률</td>
                  </tr>
                  <tr>
                    <td style={tdStyle}>접속 기록</td>
                    <td style={tdStyle}>3개월</td>
                    <td style={tdStyle}>통신비밀보호법</td>
                  </tr>
                </tbody>
              </table>
            </li>
          </ol>
        </Section>

        <Section title="제4조 (개인정보의 파기)">
          <ol>
            <li>서비스는 개인정보 보유 기간의 경과, 처리 목적 달성 등 개인정보가 불필요하게 되었을 때에는 지체 없이 해당 개인정보를 파기합니다.</li>
            <li>파기 방법
              <ul style={{ listStyleType: "disc", paddingLeft: 24, marginTop: 8 }}>
                <li>전자적 파일: 복구 및 재생이 불가능하도록 안전하게 삭제</li>
                <li>학생부 파일: 회원 탈퇴 시 또는 분석 완료 후 일정 기간 경과 시 서버에서 완전 삭제</li>
              </ul>
            </li>
          </ol>
        </Section>

        <Section title="제5조 (개인정보의 제3자 제공)">
          <ol>
            <li>서비스는 이용자의 개인정보를 제2조에서 명시한 범위 내에서만 처리하며, 이용자의 동의 없이는 제3자에게 제공하지 않습니다.</li>
            <li>다만, 다음의 경우에는 예외로 합니다.
              <ul style={{ listStyleType: "disc", paddingLeft: 24, marginTop: 8 }}>
                <li>이용자가 사전에 동의한 경우</li>
                <li>법령의 규정에 의거하거나, 수사 목적으로 법령에 정해진 절차에 따라 요청이 있는 경우</li>
              </ul>
            </li>
            <li>서비스 내 입시 상담사 간 상담 데이터 공유는 제3자 제공에 해당하지 않으며, 서비스 제공에 필수적인 내부 데이터 활용입니다.</li>
          </ol>
        </Section>

        <Section title="제6조 (개인정보의 안전성 확보 조치)">
          서비스는 개인정보의 안전성 확보를 위해 다음과 같은 조치를 취하고 있습니다.
          <ol>
            <li><strong>비밀번호 암호화</strong>: 회원의 비밀번호는 암호화되어 저장 및 관리됩니다.</li>
            <li><strong>접근 통제</strong>: 개인정보에 대한 접근 권한을 최소한의 인원으로 제한합니다.</li>
            <li><strong>보안 통신</strong>: SSL/TLS 암호화 통신을 사용하여 데이터를 전송합니다.</li>
            <li><strong>파일 보안</strong>: 업로드된 학생부 파일은 암호화된 저장소에 보관됩니다.</li>
          </ol>
        </Section>

        <Section title="제7조 (학생부 파일의 처리)">
          학생부 파일에는 민감한 개인정보가 포함될 수 있으므로, 다음과 같이 특별히 관리합니다.
          <ol>
            <li>학생부 파일은 분석 목적으로만 사용되며, 분석 외 용도로 열람하거나 활용하지 않습니다.</li>
            <li>분석이 완료된 학생부 파일은 리포트 제공 후 90일 이내에 서버에서 완전 삭제합니다.</li>
            <li>회원이 탈퇴를 요청하는 경우, 학생부 파일과 분석 리포트를 즉시 삭제합니다.</li>
            <li>학생부 파일에 대한 접근 권한은 분석 담당자로 엄격히 제한됩니다.</li>
          </ol>
        </Section>

        <Section title="제7조의2 (상담 데이터의 처리)">
          상담 관련 데이터는 다음과 같이 처리됩니다.
          <ol>
            <li>사전 상담 설문 응답, 상담 기록, 분석 결과, 학습 로드맵 등 상담 데이터는 서비스 내 상담 품질 향상을 위해 담당 상담사 및 선배 멘토(이하 통칭 &quot;상담 담당자&quot;)가 열람할 수 있습니다.</li>
            <li>가족 연결이 설정된 경우, 학부모 회원은 연결된 학생의 상담 데이터를 열람할 수 있습니다.</li>
            <li>상담 데이터는 통계 목적으로 비식별화 처리 후 서비스 개선에 활용될 수 있습니다.</li>
            <li>회원 탈퇴 시 상담 데이터는 즉시 삭제됩니다. 다만 법률에 의해 보존이 의무화된 경우 해당 기간 동안 보존합니다.</li>
            <li><strong>상담 담당자 간 데이터 연계 처리 원칙</strong>: 서비스는 선배 멘토와 전문 상담사 간 정보 공유에 있어 다음 원칙을 적용합니다.
              <ul style={{ listStyleType: "disc", paddingLeft: 24, marginTop: 8 }}>
                <li><strong>비대칭 공유</strong>: 선배 멘토 상담 기록은 전문 상담사에게 구체적으로 전달되나,
                  전문 상담사 상담 기록은 선배 멘토에게 추상화된 레이블(성적 대략 티어·추이, 진로 방향성 등)로만 제공되며
                  구체적 성적 수치·원문·개인 서사는 제공되지 않습니다.</li>
                <li><strong>비공유 항목</strong>: 아래 민감 항목은 상담 담당자 간 공유 대상에서 시스템적으로 제외됩니다.
                  <ul style={{ listStyleType: "circle", paddingLeft: 24, marginTop: 4 }}>
                    <li>심리 상태·상담 기록 관련 정보</li>
                    <li>학부모 회원의 개별 정보 및 가족 관계 상세</li>
                    <li>특정 시점(고3 직전 등) 전문 상담사의 세션 기록</li>
                    <li>구체적 학교명·교사명·친구 실명</li>
                  </ul>
                </li>
                <li><strong>관리자 사전 검토</strong>: 상담 담당자 간 모든 정보 공유는 서비스 관리자의 사전 검토·승인 절차를 거친 후에만 이루어집니다.
                  관리자는 공유 항목별 공개/비공개 범위를 조정할 수 있습니다.</li>
                <li><strong>목적 한정 및 재공유 금지</strong>: 상담 담당자 간 공유된 정보는 해당 회원의 상담 준비·수행 목적으로만 사용되며,
                  상담 담당자는 공유 받은 정보를 제3자에게 재공유할 수 없습니다.</li>
              </ul>
            </li>
            <li><strong>연계 동의 및 철회</strong>: 상담 데이터의 상담 담당자 간 연계는 이용약관 및 본 개인정보처리방침 동의로 포함되어 이루어지며,
              회원은 언제든지 회원 탈퇴를 통해 연계 동의를 철회할 수 있습니다. 탈퇴 시 연계는 즉시 중단되며 상담 데이터는 본 방침에 따라 파기됩니다.</li>
          </ol>
        </Section>

        <Section title="제8조 (이용자의 권리와 행사 방법)">
          <ol>
            <li>이용자는 언제든지 자신의 개인정보를 조회하거나 수정할 수 있습니다.</li>
            <li>이용자는 언제든지 회원 탈퇴를 통해 개인정보의 수집 및 이용에 대한 동의를 철회할 수 있습니다.</li>
            <li>이용자는 개인정보의 열람, 정정, 삭제, 처리 정지를 요청할 수 있으며, 서비스는 이에 대해 지체 없이 조치합니다.</li>
            <li>위 요청은 서비스 내 마이페이지 또는 이메일을 통해 할 수 있습니다.</li>
          </ol>
        </Section>

        <Section title="제9조 (만 14세 미만 아동의 개인정보)">
          <ol>
            <li>서비스는 만 14세 미만 아동의 회원가입을 받지 않습니다.</li>
            <li>만 14세 미만 학생의 학생부 분석이 필요한 경우, 학부모 회원이 대신 가입하여 서비스를 이용해야 합니다.</li>
          </ol>
        </Section>

        <Section title="제10조 (개인정보 보호책임자)">
          서비스는 개인정보 처리에 관한 업무를 총괄하여 책임지고, 이용자의 불만 처리 및 피해 구제를 위하여 다음과 같이 개인정보 보호책임자를 지정하고 있습니다.
          <div style={{ backgroundColor: "#f9fafb", padding: 16, borderRadius: 8, marginTop: 12, fontSize: 14 }}>
            <p><strong>개인정보 보호책임자</strong></p>
            <p>이메일: massivmiddle2@hotmail.com</p>
          </div>
        </Section>

        <Section title="제11조 (권익침해 구제방법)">
          이용자는 개인정보 침해에 대한 신고나 상담이 필요한 경우 아래 기관에 문의하실 수 있습니다.
          <ul style={{ listStyleType: "disc", paddingLeft: 24, marginTop: 8 }}>
            <li>개인정보침해신고센터 (한국인터넷진흥원): 118, privacy.kisa.or.kr</li>
            <li>개인정보 분쟁조정위원회: 1833-6972, kopico.go.kr</li>
            <li>대검찰청 사이버범죄수사과: 1301, spo.go.kr</li>
            <li>경찰청 사이버수사국: 182, ecrm.police.go.kr</li>
          </ul>
        </Section>

        <Section title="제12조 (개인정보처리방침 변경)">
          <ol>
            <li>이 개인정보처리방침은 시행일로부터 적용되며, 관련 법령 및 방침에 따른 변경 내용의 추가, 삭제 및 정정이 있는 경우에는 변경사항의 시행 7일 전부터 서비스 내에 공지합니다.</li>
          </ol>
        </Section>

        <div style={{ marginTop: 40, padding: "20px 0", borderTop: "1px solid #e5e7eb", color: "#6b7280", fontSize: 14 }}>
          <p>시행일자: 2026년 4월 16일</p>
        </div>
      </div>
    </>
  );
}

const thStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  padding: "10px 12px",
  textAlign: "left",
  fontWeight: 600,
  fontSize: 13,
};

const tdStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  padding: "10px 12px",
  fontSize: 13,
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 12 }}>{title}</h2>
      <div style={{ fontSize: 15, color: "#374151" }}>{children}</div>
    </div>
  );
}
