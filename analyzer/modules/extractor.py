"""
학생부 데이터 추출 모듈
- PDF → 이미지 변환
- 파일 관리
- JSON I/O
"""
import glob
import json
import os
from pathlib import Path


def get_input_files(input_dir: str) -> list:
    """input 디렉토리에서 PDF/이미지 파일 목록 반환"""
    supported_extensions = ['.pdf', '.png', '.jpg', '.jpeg', '.bmp', '.tiff', '.tif']
    files = []
    for ext in supported_extensions:
        files.extend(glob.glob(os.path.join(input_dir, f'*{ext}')))
        files.extend(glob.glob(os.path.join(input_dir, f'*{ext.upper()}')))
    files = sorted(set(files))
    return files


def pdf_to_images(pdf_path: str, output_dir: str, dpi: int = 300) -> list:
    """PDF를 페이지별 PNG 이미지로 변환. pdf2image 사용."""
    from pdf2image import convert_from_path

    os.makedirs(output_dir, exist_ok=True)
    basename = Path(pdf_path).stem

    # Windows에서 poppler 경로 자동 탐색
    poppler_path = _find_poppler_path()

    kwargs = {'dpi': dpi}
    if poppler_path:
        kwargs['poppler_path'] = poppler_path

    images = convert_from_path(pdf_path, **kwargs)
    image_paths = []
    for i, img in enumerate(images):
        filename = f"{basename}_page_{i+1:03d}.png"
        filepath = os.path.join(output_dir, filename)
        img.save(filepath, 'PNG')
        image_paths.append(filepath)

    return image_paths


def _find_poppler_path() -> str:
    """Windows에서 poppler 바이너리 경로 탐색"""
    import shutil
    # PATH에 있으면 None 반환 (기본 동작)
    if shutil.which('pdftoppm'):
        return None

    # 프로젝트 내 tools/ 폴더 우선 확인
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    import glob as glob_mod
    project_poppler = glob_mod.glob(os.path.join(project_root, 'tools', 'poppler*', 'Library', 'bin'))

    common_paths = project_poppler + [
        r'C:\Program Files\poppler\Library\bin',
        r'C:\Program Files\poppler\bin',
        r'C:\poppler\Library\bin',
        r'C:\poppler\bin',
        os.path.expanduser(r'~\poppler\Library\bin'),
    ]
    for p in common_paths:
        if os.path.isfile(os.path.join(p, 'pdftoppm.exe')):
            return p
    return None


def prepare_all_images(input_dir: str, temp_dir: str) -> list:
    """모든 입력 파일을 이미지로 준비. PDF는 변환, 이미지는 복사."""
    import shutil

    images_dir = os.path.join(temp_dir, 'images')
    os.makedirs(images_dir, exist_ok=True)

    files = get_input_files(input_dir)
    if not files:
        raise FileNotFoundError(f"입력 파일이 없습니다: {input_dir}")

    all_images = []
    for filepath in files:
        ext = Path(filepath).suffix.lower()
        if ext == '.pdf':
            page_images = pdf_to_images(filepath, images_dir)
            all_images.extend(page_images)
        else:
            # 이미지 파일은 temp로 복사
            dest = os.path.join(images_dir, Path(filepath).name)
            if not os.path.exists(dest):
                shutil.copy2(filepath, dest)
            all_images.append(dest)

    print(f"총 {len(all_images)}개 이미지 준비 완료")
    return all_images


def save_json(data: dict, output_path: str) -> None:
    """JSON 파일 저장"""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"저장 완료: {output_path}")


def load_json(path: str) -> dict:
    """JSON 파일 로드"""
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def get_temp_dir(output_dir: str = 'output') -> str:
    """temp 디렉토리 경로 반환 및 생성"""
    temp_dir = os.path.join(output_dir, 'temp')
    os.makedirs(temp_dir, exist_ok=True)
    return temp_dir
