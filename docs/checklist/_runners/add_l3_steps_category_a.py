"""Category A (A2~A6) 항목에 l3_steps 메타 추가.

PoC (HIGH-A-A1-input) 패턴 재사용:
  1. dev_login → student_t1 JWT
  2. inject_token_and_navigate → /consultation-survey/high
  3. select_timing_T1 → T1 카드 클릭
  4. click_start_survey → 설문 시작하기 버튼
  5. (항목별 분기) text 입력 또는 radio 선택

A4는 T1 선택이 그대로 반영됨(timing=T1 → A4=T1 사전 선택)을 검증.
"""

from pathlib import Path
import yaml
import sys

YAML_PATH = Path(__file__).resolve().parents[1] / "survey" / "high.yaml"

# 공통 preamble (4단계) — 5번째 fill 단계는 항목별로 추가
COMMON_PRELUDE = [
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
            "  const card = Array.from(document.querySelectorAll('div'))\n"
            "    .find(d => d.textContent?.startsWith('T1 (') && d.style?.cursor === 'pointer');\n"
            "  if (!card) return { error: 'T1 card not found' };\n"
            "  card.click();\n"
            "  return { clicked: true };\n"
            "})()\n"
        ),
        "assert": "result.clicked === true",
    },
    {
        "step": "click_start_survey",
        "tool": "preview_eval",
        "expression": (
            "(() => {\n"
            "  const btn = Array.from(document.querySelectorAll('button'))\n"
            "    .find(b => b.textContent?.trim() === '설문 시작하기');\n"
            "  if (!btn || btn.disabled) return { error: 'start btn not ready' };\n"
            "  btn.click();\n"
            "  return { clicked: true };\n"
            "})()\n"
        ),
        "wait_ms": 2500,
        "assert": "result.clicked === true",
    },
]

def make_text_fill_step(qid: str, placeholder: str, value: str) -> dict:
    return {
        "step": f"fill_{qid}_and_verify",
        "tool": "preview_eval",
        "expression": (
            "(() => {\n"
            f"  const i = document.querySelector('input[placeholder=\"{placeholder}\"]');\n"
            f"  if (!i) return {{ error: '{qid} input not found' }};\n"
            "  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;\n"
            f"  setter.call(i, '{value}');\n"
            "  i.dispatchEvent(new Event('input', { bubbles: true }));\n"
            f"  return {{ filled: i.value === '{value}', value: i.value }};\n"
            "})()\n"
        ),
        "assert": f"result.filled === true && result.value === '{value}'",
    }

def make_radio_click_step(qid: str, label_text: str) -> dict:
    """label 텍스트로 radio 검색 후 클릭. 라벨 DOM 구조: label>input + text."""
    return {
        "step": f"select_{qid}_radio",
        "tool": "preview_eval",
        "expression": (
            "(() => {\n"
            f"  const inputs = Array.from(document.querySelectorAll('input[type=\"radio\"][name=\"{qid}\"]'));\n"
            f"  const target = inputs.find(i => (i.parentElement?.textContent || '').trim() === '{label_text}');\n"
            f"  if (!target) return {{ error: '{qid} radio {label_text} not found', available: inputs.map(i => (i.parentElement?.textContent || '').trim()) }};\n"
            "  target.click();\n"
            "  return { checked: target.checked, value: target.value };\n"
            "})()\n"
        ),
        "assert": "result.checked === true",
    }

def make_a4_verify_step() -> dict:
    """A4는 T1 timing 선택이 자동 반영됨을 검증."""
    return {
        "step": "verify_A4_prefilled_T1",
        "tool": "preview_eval",
        "expression": (
            "(() => {\n"
            "  const inputs = Array.from(document.querySelectorAll('input[type=\"radio\"][name=\"A4\"]'));\n"
            "  const checked = inputs.find(i => i.checked);\n"
            "  if (!checked) return { error: 'no A4 radio checked' };\n"
            "  const label = (checked.parentElement?.textContent || '').trim();\n"
            "  return { checkedLabel: label, isT1: label.startsWith('T1 ') };\n"
            "})()\n"
        ),
        "assert": "result.isT1 === true",
    }

TARGETS = {
    "HIGH-A-A2-input": [make_text_fill_step("A2", "예: 휘문고등학교", "테스트고등학교")],
    "HIGH-A-A3-input": [make_radio_click_step("A3", "일반고")],
    "HIGH-A-A4-input": [make_a4_verify_step()],
    "HIGH-A-A5-input": [make_radio_click_step("A5", "자연 (이과)")],
    "HIGH-A-A6-input": [make_radio_click_step("A6", "200~300명")],
}

def main() -> int:
    with YAML_PATH.open(encoding="utf-8") as f:
        data = yaml.safe_load(f)
    items = data.get("items") or []
    updated = []
    skipped = []
    for it in items:
        item_id = it.get("id")
        if item_id not in TARGETS:
            continue
        if "l3_steps" in it:
            skipped.append(item_id)
            continue
        it["l3_steps"] = COMMON_PRELUDE + TARGETS[item_id]
        updated.append(item_id)
    if not updated:
        print("[INFO] no items updated (all already have l3_steps or not found)")
        return 0
    with YAML_PATH.open("w", encoding="utf-8") as f:
        yaml.safe_dump(data, f, allow_unicode=True, sort_keys=False)
    print(f"[OK] updated {len(updated)} items:")
    for i in updated:
        print(f"  - {i}")
    if skipped:
        print(f"[INFO] skipped {len(skipped)} (already had l3_steps):")
        for i in skipped:
            print(f"  - {i}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
