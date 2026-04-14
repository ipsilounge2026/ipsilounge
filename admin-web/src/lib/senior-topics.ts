/**
 * 선배 상담 시점별 주제 정의
 *
 * 선배(대학생 멘토)가 학생과 1:1 멘토링에서 다루는 주제.
 * 전문 상담사의 분석/진단이 아닌, 선배 경험 나눔과 실전 조언 관점.
 */

export interface SeniorTopicDef {
  id: string;
  label: string;
  isCore: boolean;
  detail?: string;
}

export const SENIOR_TIMING_TOPICS: Record<string, SeniorTopicDef[]> = {
  T1: [
    // ── 핵심 주제 (4개) ──
    {
      id: "st1c1",
      label: "고등학교 첫 학기 적응 경험 나눔",
      isCore: true,
      detail: "중학교→고등학교 전환에서 겪은 어려움과 극복법, 수업 방식 차이, 학교생활 적응 팁 공유",
    },
    {
      id: "st1c2",
      label: "첫 내신 시험 경험 & 실전 팁 공유",
      isCore: true,
      detail: "선배의 첫 시험 경험담, 시험 준비 방법, 시간 배분, 실수했던 점과 개선 방법 공유",
    },
    {
      id: "st1c3",
      label: "과목별 공부법 & 학습 루틴 조언",
      isCore: true,
      detail: "국·영·수 및 주요 과목별 선배의 공부법, 노트 정리법, 일일/주간 학습 루틴 공유",
    },
    {
      id: "st1c4",
      label: "여름방학 활용법 & 멘탈 관리",
      isCore: true,
      detail: "첫 방학 계획 세우기, 번아웃 예방법, 공부와 휴식 균형, 선배의 방학 활용 경험 공유",
    },
    // ── 선택 주제 (3개) ──
    {
      id: "st1o1",
      label: "학원 vs 자습 균형 조언",
      isCore: false,
      detail: "선배의 사교육 활용 경험, 자기주도학습 비율 조절 팁",
    },
    {
      id: "st1o2",
      label: "비교과 활동(동아리/봉사) 경험 공유",
      isCore: false,
      detail: "선배가 참여했던 활동, 활동 선택 기준, 입시에서의 의미 공유",
    },
    {
      id: "st1o3",
      label: "교우관계 & 학교생활 적응 팁",
      isCore: false,
      detail: "새로운 환경에서의 인간관계, 선생님과의 소통, 학교생활 꿀팁",
    },
  ],

  T2: [
    // ── 핵심 주제 (5개) ──
    {
      id: "st2c1",
      label: "1학년 전체 되돌아보기 & 성장 포인트 찾기",
      isCore: true,
      detail: "1년간의 성적 변화, 성장한 점, 아쉬운 점 함께 정리하며 긍정적 관점 제시",
    },
    {
      id: "st2c2",
      label: "선택과목 선택 경험 & 조언",
      isCore: true,
      detail: "선배의 과목 선택 기준, 후회한 점, 추천 조합, 과목 선택이 입시에 미친 영향 공유",
    },
    {
      id: "st2c3",
      label: "공부 습관 점검 & 개선 실전 팁",
      isCore: true,
      detail: "1년간 시행착오를 통해 찾은 효과적인 공부법, 나쁜 습관 고친 경험 공유",
    },
    {
      id: "st2c4",
      label: "진로 탐색 경험 나눔",
      isCore: true,
      detail: "선배의 진로 결정 과정, 탐색 방법, 진로가 바뀐 경험, 관심 분야 찾는 법 공유",
    },
    {
      id: "st2c5",
      label: "겨울방학 로드맵 & 고2 마음가짐",
      isCore: true,
      detail: "겨울방학 활용 전략, 고2 시작 전 준비사항, 선배의 고2 진입 경험담 공유",
    },
    // ── 선택 주제 (3개) ──
    {
      id: "st2o1",
      label: "내신 vs 모의고사 균형 공부법",
      isCore: false,
      detail: "선배의 두 트랙 병행 경험과 시간 배분 팁 공유",
    },
    {
      id: "st2o2",
      label: "스트레스 해소 & 컨디션 관리법",
      isCore: false,
      detail: "운동, 취미, 수면 등 선배의 자기관리 노하우 공유",
    },
    {
      id: "st2o3",
      label: "학부모와의 소통 경험 공유",
      isCore: false,
      detail: "입시 관련 부모님과의 갈등 해결, 소통 방법 공유",
    },
  ],

  T3: [
    // ── 핵심 주제 (5개) ──
    {
      id: "st3c1",
      label: "고2 첫 학기 학습 경험 공유",
      isCore: true,
      detail: "선택과목 첫 성적 대처법, 심화 과목 공부 팁, 고2 난이도 변화에 대한 경험 공유",
    },
    {
      id: "st3c2",
      label: "수시 vs 정시, 선배의 선택 과정 공유",
      isCore: true,
      detail: "선배가 입시 방향을 정한 과정, 고려했던 요소, 결정 전후 경험담 공유",
    },
    {
      id: "st3c3",
      label: "모의고사 대비 & 시험 전략 공유",
      isCore: true,
      detail: "실전 모의고사 팁, 시간 배분 전략, 과목별 풀이 순서, 선배의 점수 올린 비결",
    },
    {
      id: "st3c4",
      label: "학습 슬럼프 극복 경험",
      isCore: true,
      detail: "성적 정체기, 의욕 저하를 겪었을 때 선배가 극복한 구체적 방법 공유",
    },
    {
      id: "st3c5",
      label: "여름방학 집중 전략 & 입시 준비 시작",
      isCore: true,
      detail: "입시 방향에 맞는 여름방학 활용법, 본격 입시 준비 시작 경험 공유",
    },
    // ── 선택 주제 (3개) ──
    {
      id: "st3o1",
      label: "수능 최저 준비 경험 공유",
      isCore: false,
      detail: "수능 최저 충족을 위한 선배의 전략과 실전 경험 공유",
    },
    {
      id: "st3o2",
      label: "입시 정보 탐색 방법 조언",
      isCore: false,
      detail: "대학 탐방, 입시 설명회, 정보 수집 노하우 공유",
    },
    {
      id: "st3o3",
      label: "진로 방향 재점검 & 변경 경험",
      isCore: false,
      detail: "진로가 바뀌었을 때의 대처, 유연한 사고, 방향 전환 경험 공유",
    },
  ],

  T4: [
    // ── 핵심 주제 (5개) ──
    {
      id: "st4c1",
      label: "2년간의 성장 함께 되돌아보기",
      isCore: true,
      detail: "고1~고2 전체 여정 정리, 성장 포인트 확인, 자신감 부여, 긍정적 마무리",
    },
    {
      id: "st4c2",
      label: "수시/정시 최종 방향 경험 공유",
      isCore: true,
      detail: "선배가 최종 결정한 과정, 결정의 근거, 결과에 대한 솔직한 후기 공유",
    },
    {
      id: "st4c3",
      label: "고3 학습 계획 수립 조언",
      isCore: true,
      detail: "선배의 고3 월별 계획, 시간표 구성, 과목별 전략, 계획 수정 경험 공유",
    },
    {
      id: "st4c4",
      label: "고3 생활 & 입시 스트레스 관리",
      isCore: true,
      detail: "수험 생활 마인드셋, 체력 관리, 멘탈 관리, 슬럼프 대처 경험 공유",
    },
    {
      id: "st4c5",
      label: "겨울방학 집중 전략 & 고3 마음 준비",
      isCore: true,
      detail: "마지막 방학 활용법, 고3 시작 전 선배의 조언, 응원 메시지",
    },
    // ── 선택 주제 (3개) ──
    {
      id: "st4o1",
      label: "자기소개서 & 면접 준비 팁",
      isCore: false,
      detail: "선배의 자소서 작성 경험, 면접 대비 노하우, 소재 찾기 공유",
    },
    {
      id: "st4o2",
      label: "학부모와의 입시 소통 경험",
      isCore: false,
      detail: "고3 시기 부모님과의 관계, 지원 대학 관련 소통 팁 공유",
    },
    {
      id: "st4o3",
      label: "시험(내신/모의) 실전 전략 공유",
      isCore: false,
      detail: "시험 당일 루틴, 긴장 관리, 시간 배분 등 실전 팁 공유",
    },
  ],
};

export const SENIOR_TIMING_LABELS: Record<string, string> = {
  T1: "T1 — 고1-1학기 말 (7월): 학교 적응기 멘토링",
  T2: "T2 — 고1-2학기 말 (2월): 고2 진입 준비 멘토링",
  T3: "T3 — 고2-1학기 말 (7월): 입시 방향 탐색기 멘토링",
  T4: "T4 — 고2-2학기 말 (2월): 고3 진입 최종 멘토링",
};
