"""단순/display 타입 6개 항목에 l3_steps 추가.

대상:
  B5  (auto_calculated) — step 4
  C3  (auto_calculated) — step 6
  C4  (info_only)      — step 6
  D4  (checkboxes)     — step 5
  D5  (radio)          — step 5
  D8  (composite)      — step 3

공통 preamble: dev_login → inject_token → navigate → T1 → 설문 시작
항목별 네비게이션: "나중에 입력" 클릭 N회로 해당 step 까지 이동.
항목별 assert: 해당 question 의 DOM 존재 + (가능하면) 한 옵션 선택.

실행 후 preview_mcp 세션이 플로우 따라 실행하여 result.json 작성 가능.
"""

from pathlib import Path
import yaml

YAML_PATH = Path(__file__).resolve().parents[1] / "survey" / "high.yaml"

PRELUDE = [
    {
        "step": "dev_login",
        "tool": "backend_request",
        "method": "POST",
        "path": "/api/dev/login-as/student_t1",
        "save": {"access_token": "$.access_token"},
        "assert": "status == 200",
    },
    {
        "step": "inject_token_and_navigate",
        "tool": "preview_eval",
        "expression": (
            "localStorage.setItem('user_token', '{{access_token}}');\n"
            "window.location.href = '/consultation-survey/high';\n"
        ),
        "wait_ms": 2500,
    },
    {
        "step": "select_timing_T1",
        "tool": "preview_eval",
        "expression": (
            "(() => {\n"
            "  const c = Array.from(document.querySelectorAll('div'))\n"
            "    .find(d => d.textContent?.startsWith('T1 (') && d.style?.cursor === 'pointer');\n"
            "  if (!c) return { error: 'T1 not found' };\n"
            "  c.click(); return { clicked: true };\n"
            "})()\n"
        ),
        "assert": "result.clicked === true",
    },
    {
        "step": "click_start_survey",
        "tool": "preview_eval",
        "expression": (
            "(() => {\n"
            "  const b = Array.from(document.querySelectorAll('button'))\n"
            "    .find(x => x.textContent?.trim() === '설문 시작하기');\n"
            "  if (!b || b.disabled) return { error: 'start not ready' };\n"
            "  b.click(); return { clicked: true };\n"
            "})()\n"
        ),
        "wait_ms": 2500,
        "assert": "result.clicked === true",
    },
]

def make_nav_step(target_step: int) -> dict:
    """step 1 에서 target_step 으로 이동 — '나중에 입력' 버튼 (target_step-1)회 클릭."""
    clicks = target_step - 1
    return {
        "step": f"navigate_to_step_{target_step}",
        "tool": "preview_eval",
        "expression": (
            f"(async () => {{\n"
            f"  for (let i = 0; i < {clicks}; i++) {{\n"
            f"    const b = Array.from(document.querySelectorAll('button'))\n"
            f"      .find(x => x.textContent?.trim() === '나중에 입력');\n"
            f"    if (!b) return {{ error: 'skip btn missing at iter ' + i }};\n"
            f"    b.click();\n"
            f"    await new Promise(r => setTimeout(r, 1800));\n"
            f"  }}\n"
            f"  const m = document.body.innerText.match(/(\\d+)\\/\\d+ 단계/);\n"
            f"  return {{ step: m && parseInt(m[1]), ok: m && parseInt(m[1]) === {target_step} }};\n"
            f"}})()\n"
        ),
        "wait_ms": 500,
        "assert": f"result.ok === true",
    }

# B5 (auto_calculated) — step 4 에서 "내신 성적 추이 (자동 산출)" 섹션 존재 확인
B5_VERIFY = {
    "step": "verify_B5_auto_calc_section",
    "tool": "preview_eval",
    "expression": (
        "(() => {\n"
        "  const text = document.body.innerText;\n"
        "  const hasSection = text.includes('내신 성적 추이') && text.includes('자동 산출');\n"
        "  const hasHint = text.includes('B1~B4 입력 후 자동 계산');\n"
        "  return { hasSection, hasHint };\n"
        "})()\n"
    ),
    "assert": "result.hasSection === true && result.hasHint === true",
}

# C3 (auto_calculated) — step 6 에서 유사한 자동 산출 섹션 존재 확인
C3_VERIFY = {
    "step": "verify_C3_auto_calc_section",
    "tool": "preview_eval",
    "expression": (
        "(() => {\n"
        "  const text = document.body.innerText;\n"
        "  // '자동 산출' 또는 '자동 계산' 문구 + C1/C2 참조 패턴\n"
        "  const hasAuto = text.includes('자동 산출') || text.includes('자동 계산');\n"
        "  return { hasAuto, url: location.href };\n"
        "})()\n"
    ),
    "assert": "result.hasAuto === true",
}

# C4 (info_only) — display-only 영역 존재
C4_VERIFY = {
    "step": "verify_C4_info_only",
    "tool": "preview_eval",
    "expression": (
        "(() => {\n"
        "  const text = document.body.innerText;\n"
        "  // C4 는 info_only — step 6 페이지 자체가 렌더됐는지만 확인\n"
        "  const m = text.match(/(\\d+)\\/\\d+ 단계/);\n"
        "  return { step: m && parseInt(m[1]), hasContent: text.length > 500 };\n"
        "})()\n"
    ),
    "assert": "result.step === 6 && result.hasContent === true",
}

# D4 (checkboxes) — '혼자 끝까지 고민' 체크박스 클릭 + checked 확인
D4_FILL = {
    "step": "check_D4_option",
    "tool": "preview_eval",
    "expression": (
        "(() => {\n"
        "  const cbs = Array.from(document.querySelectorAll('input[type=\"checkbox\"]'));\n"
        "  const target = cbs.find(c => (c.parentElement?.textContent || '').trim().startsWith('혼자 끝까지 고민'));\n"
        "  if (!target) return { error: 'D4 혼자고민 checkbox not found', labels: cbs.map(c => (c.parentElement?.textContent||'').trim().slice(0,20)) };\n"
        "  target.click();\n"
        "  return { checked: target.checked };\n"
        "})()\n"
    ),
    "assert": "result.checked === true",
}

# D5 (radio) — '오후' 선택. D5 options: 아침/오후/저녁/밤/일정하지않음
D5_FILL = {
    "step": "select_D5_radio",
    "tool": "preview_eval",
    "expression": (
        "(() => {\n"
        "  // D5 는 step 5 composite sub-field. name 패턴을 모르므로 parent text 가 '오후' 이고 동일 name group 인 것 중 하나 선택\n"
        "  const radios = Array.from(document.querySelectorAll('input[type=\"radio\"]'));\n"
        "  // D5 radio group: 아침/오후/저녁/밤/일정하지 않음 이 5개로 모인 group 을 찾음\n"
        "  const groups = {};\n"
        "  for (const r of radios) {\n"
        "    const n = r.name || '_';\n"
        "    const label = (r.parentElement?.textContent || '').trim();\n"
        "    groups[n] = groups[n] || [];\n"
        "    groups[n].push({ label, r });\n"
        "  }\n"
        "  const expected = ['아침','오후','저녁','밤','일정하지 않음'];\n"
        "  let group = null;\n"
        "  for (const n of Object.keys(groups)) {\n"
        "    const labels = groups[n].map(x => x.label);\n"
        "    if (expected.every(e => labels.includes(e))) { group = groups[n]; break; }\n"
        "  }\n"
        "  if (!group) return { error: 'D5 radio group not found' };\n"
        "  const target = group.find(x => x.label === '오후');\n"
        "  target.r.click();\n"
        "  return { checked: target.r.checked, group_name: target.r.name };\n"
        "})()\n"
    ),
    "assert": "result.checked === true",
}

# D8 (composite) — step 3. sub-field 중 test_anxiety '없음' 선택
D8_FILL = {
    "step": "select_D8_test_anxiety",
    "tool": "preview_eval",
    "expression": (
        "(() => {\n"
        "  const radios = Array.from(document.querySelectorAll('input[type=\"radio\"][name=\"test_anxiety\"]'));\n"
        "  if (radios.length === 0) return { error: 'D8 test_anxiety radios not found' };\n"
        "  const target = radios.find(r => (r.parentElement?.textContent || '').trim() === '없음');\n"
        "  if (!target) return { error: '없음 option missing', labels: radios.map(r => (r.parentElement?.textContent||'').trim()) };\n"
        "  target.click();\n"
        "  return { checked: target.checked };\n"
        "})()\n"
    ),
    "assert": "result.checked === true",
}

TARGETS = {
    "HIGH-D-D8-input": [make_nav_step(3), D8_FILL],
    "HIGH-B-B5-calculate": [make_nav_step(4), B5_VERIFY],
    "HIGH-D-D4-input": [make_nav_step(5), D4_FILL],
    "HIGH-D-D5-input": [make_nav_step(5), D5_FILL],
    "HIGH-C-C3-calculate": [make_nav_step(6), C3_VERIFY],
    "HIGH-C-C4-info_only": [make_nav_step(6), C4_VERIFY],
}

def main() -> int:
    with YAML_PATH.open(encoding="utf-8") as f:
        data = yaml.safe_load(f)
    items = data.get("items") or []
    updated, skipped = [], []
    for it in items:
        item_id = it.get("id")
        if item_id not in TARGETS:
            continue
        if "l3_steps" in it:
            skipped.append(item_id)
            continue
        it["l3_steps"] = PRELUDE + TARGETS[item_id]
        updated.append(item_id)
    if not updated:
        print("[INFO] nothing to update")
        return 0
    with YAML_PATH.open("w", encoding="utf-8") as f:
        yaml.safe_dump(data, f, allow_unicode=True, sort_keys=False)
    print(f"[OK] updated {len(updated)}:")
    for i in updated:
        print(f"  - {i}")
    if skipped:
        print(f"[INFO] skipped {len(skipped)} (had l3_steps): {skipped}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
