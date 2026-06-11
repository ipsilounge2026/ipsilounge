"""학종 가이드북 게시판 URL 일괄 입력 (2026-06 수집분).

수집 근거: docs/학종가이드북_게시판URL_수집_2026-06.md (45개 대학 전수 조사, 전 URL 실접속 확인)
- 34곳: 학종(학생부위주) 가이드북 게시판/고정페이지
- 2곳(서강대·가천대): 통합 가이드북 (학종 전용 아님)

사용 (EC2 backend 디렉토리에서):
    python scripts/set_jonghap_guidebook_urls.py 2027 2028

이미 URL이 입력된 대학은 덮어씁니다. last_checked 도 갱신합니다.
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text  # noqa: E402

from app.database import async_session  # noqa: E402

# DB university 표기(대학어디가 형식) → 가이드북 게시판 URL
URLS = {
    "서울대학교[본교]": "https://admission.snu.ac.kr/materials/downloads/others",
    "연세대학교[본교]": "https://admission.yonsei.ac.kr/seoul/admission/html/counsel/data.asp",
    "한양대학교[본교]": "https://go.hanyang.ac.kr/web/guide/guidebook.do",
    "한양대학교(ERICA)[분교]": "https://goerica.hanyang.ac.kr/admission/html/counsel/brochure_list.asp",
    "중앙대학교[본교]": "https://admission.cau.ac.kr/submenu.do?menuurl=wBx%2bBLjaR%2fnJD74QCxHz8g%3d%3d",
    "경희대학교[본교]": "https://iphak.khu.ac.kr/submenu.do?menuurl=P1VDYMswmuRM5ruMYMNGxg%3D%3D",
    "한국외국어대학교[본교]": "https://adms.hufs.ac.kr/index.do",
    "서울시립대학교[본교]": "https://admission.uos.ac.kr/admissionNew/html/information/guidebook/2025.do",
    "건국대학교[본교]": "https://enter.konkuk.ac.kr/submenu.do?menuurl=2LzZbH%2fR%2bB4HzyuYmPyHoA%3d%3d",
    "동국대학교[본교]": "https://ipsi.dongguk.edu/admission/html/rolling/book.asp",
    "홍익대학교[본교]": "https://www.hongik.ac.kr/kr/admission/admissions-guide.do",
    "이화여자대학교[본교]": "https://admission.ewha.ac.kr/admission/html/ewharo/publication2.asp",
    "숭실대학교[본교]": "https://iphak.ssu.ac.kr/board/file_3_list.asp?page_no=2_2_3",
    "세종대학교[본교]": "https://ipsi.sejong.ac.kr/sub_page/sub5/0113_list.asp",
    "국민대학교[본교]": "https://admission.kookmin.ac.kr/helper/notice.php",
    "단국대학교[본교]": "https://ipsi.dankook.ac.kr/jukjeon/doumi/hak_list.html?bbsid=juk_guidebook",
    "인하대학교[본교]": "https://admission.inha.ac.kr/cms/FR_CON/index.do?MENU_ID=260",
    "광운대학교[본교]": "https://iphak.kw.ac.kr/guide/guide.php",
    "명지대학교[본교]": "https://iphak.mju.ac.kr/pages/?p=55&mj=07",
    "상명대학교[본교]": "https://admission.smu.ac.kr/_seoul/iphak/hakjong_gdb.html?bbsid=seoul_mojib&ctg_cd=hakjong",
    "경기대학교[본교]": "https://enter.kyonggi.ac.kr/cms/FR_CON/index.do?MENU_ID=650",
    "서울여자대학교[본교]": "https://admission.swu.ac.kr/bbs/board.php?bo_table=dataroom&wr_9=etc&sca=%EC%88%98%EC%8B%9C",
    "성신여자대학교[본교]": "https://ipsi.sungshin.ac.kr/highschool_ties/guidebook.php?bbsid=guidebook",
    "덕성여자대학교[본교]": "https://enter.duksung.ac.kr/guide/",
    "동덕여자대학교[본교]": "https://ipsi.dongduk.ac.kr/ipsi/contents/info-list.do",
    "한성대학교[본교]": "https://enter.hansung.ac.kr/?m1=menu07&m2=sub10&board=entrance_helper%2Fguide_book_applicants",
    "서울과학기술대학교[본교]": "https://admission.seoultech.ac.kr/cms/FR_CON/index.do?MENU_ID=840",
    "인천대학교[본교]": "https://admission.inu.ac.kr/submenu.do?menuurl=KHw0IM8v%2bcgQ4zs30Ih%2b4w%3d%3d",
    "부산대학교[본교]": "https://go.pusan.ac.kr/college_2016/pages/index.asp?p=186&b=B_1_7",
    "경북대학교[본교]": "https://ipsi1.knu.ac.kr/enterinfo/",
    "전남대학교[본교]": "https://admission.jnu.ac.kr/WebApp/web/HOM/COM/Board/board.aspx?boardID=434",
    "충남대학교[본교]": "https://ipsi.cnu.ac.kr/_prog/_board/?code=recsroom_01&site_dvs_cd=uadm&menu_dvs_cd=0105",
    "충북대학교[본교]": "https://ipsi.chungbuk.ac.kr/kor/bbs/BBSMSTR_000000000111/lst.do",
    "강원대학교[본교]": "https://admission.kangwon.ac.kr/admission/selectEntschBookList.do?key=2147",
    # 통합 가이드북 (학종 전용 아님)
    "서강대학교[본교]": "https://admission.sogang.ac.kr/enter/html/counsel/book.asp",
    "가천대학교[본교]": "https://admission.gachon.ac.kr/admission/html/rolling/guide.asp",
}


async def main() -> None:
    years = [int(a) for a in sys.argv[1:] if a.isdigit()] or [2027, 2028]
    async with async_session() as db:
        for year in years:
            updated: list[str] = []
            missing: list[str] = []
            for univ, url in URLS.items():
                res = await db.execute(
                    text(
                        "UPDATE university_guides "
                        "SET official_jonghap_guidebook_url = :url, "
                        "    last_checked = NOW(), updated_at = NOW() "
                        "WHERE university = :univ AND year = :year"
                    ),
                    {"url": url, "univ": univ, "year": year},
                )
                (updated if res.rowcount else missing).append(univ)
            await db.commit()
            print(f"[{year}학년도] 입력 {len(updated)}건 / 미매칭 {len(missing)}건")
            if missing:
                print("  미매칭:", ", ".join(missing))


if __name__ == "__main__":
    asyncio.run(main())
