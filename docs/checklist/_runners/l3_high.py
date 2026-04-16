"""high.yaml L3 검증 Harness.

역할 (spec: ipsilounge/docs/test-environment-spec.md §5):
  1. 사전 점검 — backend(8000) / user-web(3000) / DEV_MODE 활성 여부
  2. survey/high.yaml 로드 → items 순회
  3. 각 항목의 l3_steps 메타를 preview_mcp 호출 명세로 변환 (plan)
  4. plan 을 _runs/high_<timestamp>.plan.json 으로 저장
  5. (Claude 세션이 plan 을 읽어 preview_mcp 호출 후 결과를 _runs/.../result.json 에 기록)
  6. result.json 이 있으면 high.yaml 의 evidence 필드 자동 갱신
  7. 콘솔 요약 + _runs/high_<timestamp>.summary.json

서브커맨드:
  python l3_high.py preflight                 — 환경 사전 점검만
  python l3_high.py plan [--out PATH]         — plan 생성 (실행 안 함)
  python l3_high.py apply  --result PATH      — Claude 세션이 채운 result 로 yaml 갱신
  python l3_high.py summary --run RUN_ID      — 한 run 의 요약 출력
  python l3_high.py run                       — preflight + plan 한 번에 (실행은 외부 세션)

전제:
  - 환경 변수 IPSILOUNGE_BACKEND_URL (기본 http://localhost:8000)
  - 환경 변수 IPSILOUNGE_USER_WEB_URL (기본 http://localhost:3000)
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

try:
    import yaml  # PyYAML
except ImportError:
    sys.stderr.write("PyYAML 필요: python -m pip install pyyaml\n")
    raise

try:
    import httpx
except ImportError:
    sys.stderr.write("httpx 필요: python -m pip install httpx\n")
    raise

# ─── 경로 ──────────────────────────────────────────────────────────────
_REPO_ROOT = Path(__file__).resolve().parents[3]  # 학생부분석프로그램/
_CHECKLIST_DIR = Path(__file__).resolve().parents[1]
_HIGH_YAML = _CHECKLIST_DIR / "survey" / "high.yaml"
_RUNS_DIR = _CHECKLIST_DIR / "_runs"
_EVIDENCE_DIR = _CHECKLIST_DIR / "_evidence" / "high"

# ─── 환경 ──────────────────────────────────────────────────────────────
BACKEND_URL = os.environ.get("IPSILOUNGE_BACKEND_URL", "http://localhost:8000")
USER_WEB_URL = os.environ.get("IPSILOUNGE_USER_WEB_URL", "http://localhost:3000")


# ─── 유틸 ──────────────────────────────────────────────────────────────
def _now_stamp() -> str:
    return datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")


def _print(*args: Any) -> None:
    print(*args, flush=True)


def _print_err(*args: Any) -> None:
    print(*args, file=sys.stderr, flush=True)


# ─── 사전 점검 ─────────────────────────────────────────────────────────
def cmd_preflight() -> int:
    """backend / user-web / DEV_MODE 활성 여부 확인."""
    ok = True
    _print(f"[preflight] backend health:  {BACKEND_URL}/health")
    try:
        r = httpx.get(f"{BACKEND_URL}/health", timeout=3.0)
        if r.status_code == 200:
            _print(f"  → 200 OK")
        else:
            _print(f"  → FAIL: status={r.status_code}")
            ok = False
    except Exception as e:
        _print(f"  → FAIL: {type(e).__name__}: {e}")
        ok = False

    _print(f"[preflight] dev mode:        {BACKEND_URL}/api/dev/health")
    try:
        r = httpx.get(f"{BACKEND_URL}/api/dev/health", timeout=3.0)
        if r.status_code == 200:
            body = r.json()
            _print(f"  → 200 OK, dev_mode={body.get('dev_mode')}, db={body.get('dev_db_path')}")
            if not body.get("dev_mode"):
                _print("  → FAIL: DEV_MODE 응답이 false (서버 재기동 필요)")
                ok = False
        elif r.status_code == 404:
            _print("  → FAIL: /api/dev/health 미응답 → DEV_MODE 비활성 상태로 backend 기동된 듯")
            ok = False
        else:
            _print(f"  → FAIL: status={r.status_code}")
            ok = False
    except Exception as e:
        _print(f"  → FAIL: {type(e).__name__}: {e}")
        ok = False

    _print(f"[preflight] user-web:         {USER_WEB_URL}")
    try:
        r = httpx.get(USER_WEB_URL, timeout=3.0, follow_redirects=True)
        # Next.js dev/prod 모두 200 또는 redirect → 200
        if r.status_code < 500:
            _print(f"  → {r.status_code} OK")
        else:
            _print(f"  → FAIL: status={r.status_code}")
            ok = False
    except Exception as e:
        _print(f"  → FAIL: {type(e).__name__}: {e}")
        ok = False

    if ok:
        _print("\n[preflight] ALL OK - L3 verification ready")
        return 0
    else:
        _print_err(
            "\n[preflight] FAILED. Check:\n"
            "  1) backend: cd ipsilounge/backend && DEV_MODE=true uvicorn app.main:app --reload\n"
            "  2) user-web: cd ipsilounge/user-web && npm run dev\n"
            "  3) Set DEV_MODE=true and restart backend\n"
        )
        return 1


# ─── high.yaml 로드 + plan 생성 ───────────────────────────────────────
def _load_high_yaml() -> dict:
    if not _HIGH_YAML.exists():
        raise FileNotFoundError(f"high.yaml 없음: {_HIGH_YAML}")
    with _HIGH_YAML.open(encoding="utf-8") as f:
        return yaml.safe_load(f)


def _build_plan_for_item(item: dict) -> dict:
    """단일 item 을 preview_mcp 호출 명세로 변환.

    l3_steps 메타가 있으면 그대로 사용, 없으면 behavior_test 를 narrative 로 보고
    'unmapped' 마크 (Claude 세션이 수동 매핑 또는 추가 메타 작성 필요).
    """
    item_id = item.get("id", "<no-id>")
    l3_steps = item.get("l3_steps")  # 신설 메타 필드 (spec §5-2)
    if l3_steps:
        return {
            "item_id": item_id,
            "category": item.get("category"),
            "priority": item.get("priority"),
            "status": "ready",
            "steps": l3_steps,
            "evidence_dir": str(_EVIDENCE_DIR / item_id),
        }
    return {
        "item_id": item_id,
        "category": item.get("category"),
        "priority": item.get("priority"),
        "status": "unmapped",
        "behavior_test_narrative": item.get("behavior_test", []),
        "note": "l3_steps 메타 미작성. preview_mcp 4단계(navigate/fill/click/assert)로 매핑 필요",
        "evidence_dir": str(_EVIDENCE_DIR / item_id),
    }


def cmd_plan(out_path: Path | None = None) -> int:
    data = _load_high_yaml()
    items = data.get("items") or []
    plan_items = [_build_plan_for_item(it) for it in items]

    summary = {
        "total": len(plan_items),
        "ready": sum(1 for p in plan_items if p["status"] == "ready"),
        "unmapped": sum(1 for p in plan_items if p["status"] == "unmapped"),
    }

    run_id = _now_stamp()
    if out_path is None:
        _RUNS_DIR.mkdir(parents=True, exist_ok=True)
        out_path = _RUNS_DIR / f"high_{run_id}.plan.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    plan_doc = {
        "run_id": run_id,
        "spec": "ipsilounge/docs/test-environment-spec.md §5",
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "backend_url": BACKEND_URL,
        "user_web_url": USER_WEB_URL,
        "yaml_source": str(_HIGH_YAML.relative_to(_REPO_ROOT)),
        "summary": summary,
        "items": plan_items,
        "next_step": (
            "Claude 세션에서 plan.items[].steps 를 mcp__Claude_Preview__preview_* 도구로 실행 후 "
            "결과를 _runs/high_<run_id>.result.json 에 저장하고 'apply --result' 로 yaml 갱신"
        ),
    }
    out_path.write_text(json.dumps(plan_doc, ensure_ascii=False, indent=2), encoding="utf-8")
    _print(f"[plan] wrote: {out_path.relative_to(_REPO_ROOT)}")
    _print(f"[plan] summary: total={summary['total']} ready={summary['ready']} unmapped={summary['unmapped']}")
    return 0


# ─── result 적용 (yaml 의 evidence 갱신) ──────────────────────────────
def _normalize_evidence_text(item_id: str, step_results: list[dict]) -> str:
    pass_count = sum(1 for s in step_results if s.get("status") == "pass")
    total = len(step_results)
    parts = [
        f"preview_mcp run {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}",
        f"steps: {pass_count}/{total} pass",
        f"screenshots: docs/checklist/_evidence/high/{item_id}/",
    ]
    return ", ".join(parts)


def cmd_apply(result_path: Path) -> int:
    if not result_path.exists():
        _print_err(f"result 파일 없음: {result_path}")
        return 2
    result_doc = json.loads(result_path.read_text(encoding="utf-8"))
    items_results: dict[str, dict] = {it["item_id"]: it for it in result_doc.get("items", [])}

    data = _load_high_yaml()
    yaml_items = data.get("items") or []
    updated_count = 0

    for it in yaml_items:
        item_id = it.get("id")
        res = items_results.get(item_id)
        if not res:
            continue
        step_results = res.get("step_results", [])
        passed = all(s.get("status") == "pass" for s in step_results) if step_results else False
        evidence_text = _normalize_evidence_text(item_id, step_results)
        # user_web.L3 갱신 (현재 high.yaml 의 user_web 이 검증 대상)
        uw = it.setdefault("user_web", {})
        l3 = uw.setdefault("L3", {})
        l3["evidence"] = evidence_text
        if passed:
            uw["status"] = "pass"
            uw["verified_at"] = datetime.utcnow().date().isoformat()
        else:
            uw["status"] = "fail"
            failed = [s for s in step_results if s.get("status") != "pass"]
            l3["note"] = f"실패: {failed[0].get('step') if failed else 'unknown'} — {failed[0].get('error') if failed else ''}"
        updated_count += 1

    # write back
    with _HIGH_YAML.open("w", encoding="utf-8") as f:
        yaml.safe_dump(data, f, allow_unicode=True, sort_keys=False)
    _print(f"[apply] updated {updated_count} items in {_HIGH_YAML.relative_to(_REPO_ROOT)}")
    return 0


# ─── 요약 ───────────────────────────────────────────────────────────────
def cmd_summary(run_id: str) -> int:
    plan_p = _RUNS_DIR / f"high_{run_id}.plan.json"
    result_p = _RUNS_DIR / f"high_{run_id}.result.json"
    if not plan_p.exists():
        _print_err(f"plan 없음: {plan_p}")
        return 2
    plan = json.loads(plan_p.read_text(encoding="utf-8"))
    _print(f"[summary {run_id}]")
    _print(f"  yaml_source: {plan.get('yaml_source')}")
    s = plan.get("summary", {})
    _print(f"  plan: total={s.get('total')} ready={s.get('ready')} unmapped={s.get('unmapped')}")
    if result_p.exists():
        result = json.loads(result_p.read_text(encoding="utf-8"))
        items = result.get("items", [])
        passed = sum(1 for it in items if all(s.get("status") == "pass" for s in it.get("step_results", [])))
        failed = len(items) - passed
        _print(f"  result: items_with_result={len(items)} pass={passed} fail={failed}")
    else:
        _print("  result: 아직 없음 (Claude 세션이 plan 을 실행하면 result.json 생성됨)")
    return 0


# ─── main ──────────────────────────────────────────────────────────────
def main() -> int:
    parser = argparse.ArgumentParser(description="high.yaml L3 검증 harness")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("preflight", help="backend/user-web/DEV_MODE 사전 점검")

    p_plan = sub.add_parser("plan", help="high.yaml → plan.json 생성")
    p_plan.add_argument("--out", type=Path, default=None)

    p_apply = sub.add_parser("apply", help="result.json → high.yaml evidence 갱신")
    p_apply.add_argument("--result", type=Path, required=True)

    p_sum = sub.add_parser("summary", help="run_id 한 건 요약")
    p_sum.add_argument("--run", required=True)

    sub.add_parser("run", help="preflight + plan 통합 (실행은 외부 Claude 세션)")

    args = parser.parse_args()

    if args.cmd == "preflight":
        return cmd_preflight()
    if args.cmd == "plan":
        return cmd_plan(args.out)
    if args.cmd == "apply":
        return cmd_apply(args.result)
    if args.cmd == "summary":
        return cmd_summary(args.run)
    if args.cmd == "run":
        rc = cmd_preflight()
        if rc != 0:
            _print_err("[run] preflight 실패 → plan 생성 중단")
            return rc
        return cmd_plan(None)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
