import os
import sys
import json
import time
import pathlib
import tempfile
import wave
import re

# Force UTF-8 output ngay đầu file
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if sys.stderr.encoding != 'utf-8':
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import requests

# Tự động nạp cấu hình từ .env.local hoặc .env nếu có
def load_env_file():
    root_dir = pathlib.Path(__file__).resolve().parent.parent
    for env_name in ['.env.local', '.env']:
        env_file = root_dir / env_name
        if env_file.exists():
            try:
                with open(env_file, 'r', encoding='utf-8') as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith('#') or '=' not in line:
                            continue
                        k, v = line.split('=', 1)
                        k = k.strip()
                        v = v.split('#')[0].strip().strip('"\'')
                        if k and k not in os.environ:
                            os.environ[k] = v
            except Exception:
                pass

load_env_file()

SAYDI_API_URL     = os.environ.get("SAYDI_API_URL", "https://api.voice.saydi.ai/tts")
SAYDI_SESSION_URL = os.environ.get("SAYDI_SESSION_URL", "https://voice.saydi.ai/api/session/start")

# Voice IDs theo ngôn ngữ
VOICE_VI = os.environ.get("SAYDI_VOICE_VI", "ng-c-huy-n-2-0-69140efab3d5d05406bafb22")   # Ngọc Huyền 2.0
VOICE_EN = os.environ.get("SAYDI_VOICE_EN", "adam-american-dark-and-tough-IRHApOXLvnW57QJPQH2P")  # Adam

# Guidance scale và Speed mặc định
DEFAULT_GUIDANCE_SCALE = float(os.environ.get("SAYDI_GUIDANCE_SCALE", "2.8"))
DEFAULT_SPEED = float(os.environ.get("SAYDI_SPEED", "1.0"))

TOKEN_CACHE_FILE = pathlib.Path(tempfile.gettempdir()) / "saydi_token_cache.json"

def get_session_token(force_refresh: bool = False) -> str:
    """
    Tự động lấy JWT token hợp lệ:
    - Nếu có token còn hạn trong cache temp (> 60s) và không force_refresh, dùng lại.
    - Nếu hết hạn, force_refresh hoặc bị lỗi quota, gọi session/start để xin token mới.
    - Lưu cache với thời hạn 30 phút.
    """
    now = time.time()

    # 1. Đọc token từ file cache nếu còn hạn
    if not force_refresh and TOKEN_CACHE_FILE.exists():
        try:
            with open(TOKEN_CACHE_FILE, "r", encoding="utf-8") as f:
                cached = json.load(f)
                tok = cached.get("token")
                exp = cached.get("expires_at", 0)
                if tok and (exp - now > 60):
                    return tok
        except Exception:
            pass

    # 2. Tự động xin token mới từ Saydi
    endpoints = [
        SAYDI_SESSION_URL,
        "https://api.voice.saydi.ai/session/start"
    ]

    last_err = None
    for endpoint in endpoints:
        for attempt in range(3):
            try:
                headers = {
                    "Content-Type": "application/json",
                    "X-OmniVoice-Client": "web",
                    "User-Agent": (
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/131.0.0.0 Safari/537.36"
                    ),
                    "Origin": "https://voice.saydi.ai",
                    "Referer": "https://voice.saydi.ai/vi/studio",
                }
                resp = requests.post(
                    endpoint,
                    headers=headers,
                    json={"turnstile_token": ""},
                    timeout=15
                )
                if resp.status_code == 200:
                    data = resp.json()
                    tok = data.get("token")
                    expires_in = data.get("expires_in", 1800)
                    if tok:
                        try:
                            with open(TOKEN_CACHE_FILE, "w", encoding="utf-8") as f:
                                json.dump({
                                    "token": tok,
                                    "expires_at": now + expires_in
                                }, f)
                        except Exception:
                            pass
                        return tok
                else:
                    last_err = f"HTTP {resp.status_code}: {resp.text[:200]}"
            except Exception as e:
                last_err = str(e)
            time.sleep(1)

    raise RuntimeError(f"Không thể lấy token tự động từ Saydi: {last_err}")


# Giới hạn ký tự chuẩn theo Saydi Studio (https://voice.saydi.ai/vi/studio/)
MAX_TEXT_CHARS = 20000


def parse_saydi_error(resp: requests.Response) -> str:
    """
    Phân tích chi tiết mã lỗi và thông điệp trả về từ máy chủ Saydi theo chuẩn Studio.
    """
    server_msg = ""
    retry_after = 0
    try:
        j = resp.json()
        d = j.get("detail", j) if isinstance(j, dict) else j
        if isinstance(d, str):
            server_msg = d
        elif isinstance(d, dict):
            server_msg = d.get("error") or d.get("message") or json.dumps(d, ensure_ascii=False)
        else:
            server_msg = str(d)
        retry_after = j.get("retry_after_seconds") or 0 if isinstance(j, dict) else 0
    except Exception:
        server_msg = resp.text[:300] if resp.text else ""

    if not retry_after:
        try:
            retry_after = int(resp.headers.get("Retry-After", "0"))
        except Exception:
            retry_after = 0

    status = resp.status_code
    if status == 413:
        return f"Văn bản quá dài ({len(server_msg)} ký tự). Saydi Studio giới hạn tối đa {MAX_TEXT_CHARS:,} ký tự / lần tạo. Chi tiết: {server_msg}"
    elif status == 429:
        wait_s = retry_after if retry_after > 0 else 30
        return f"Saydi Rate Limit (Quá nhiều yêu cầu cùng lúc, cần đợi {wait_s}s). Chi tiết: {server_msg}"
    elif status in (502, 503, 504):
        return f"Máy chủ Saydi GPU đang bận / quá tải (HTTP {status}). Chi tiết: {server_msg}"
    elif status in (401, 403):
        return f"Lỗi xác thực / Token Saydi không hợp lệ (HTTP {status}). Chi tiết: {server_msg}"
    elif status == 400:
        return f"Tham số yêu cầu không hợp lệ tới Saydi (HTTP 400). Chi tiết: {server_msg}"
    else:
        return f"Lỗi từ máy chủ Saydi (HTTP {status}): {server_msg}"


def run_tts(
    text: str,
    sample: str,
    output_path: str,
    guidance_scale: float = DEFAULT_GUIDANCE_SCALE,
    speed: float = DEFAULT_SPEED,
    max_retries: int = 10
) -> dict:
    """
    Gửi toàn bộ nội dung văn bản tới Saydi TTS theo chuẩn https://voice.saydi.ai/vi/studio/
    trong 1 request duy nhất, không giới hạn thời gian chờ và bắt chi tiết lỗi nếu có.
    """
    text = text.strip()
    if not text:
        return {"success": False, "error": "Nội dung văn bản rỗng"}

    char_len = len(text)
    if char_len > MAX_TEXT_CHARS:
        err_msg = f"Nội dung ({char_len:,} ký tự) vượt quá giới hạn tối đa của Saydi Studio ({MAX_TEXT_CHARS:,} ký tự)."
        print(f"[Saydi] [LỖI] {err_msg}")
        return {"success": False, "error": err_msg}

    print(f"[Saydi] Đang gửi toàn bộ {char_len} ký tự tới Saydi TTS theo chuẩn Studio (không giới hạn thời gian chờ)...")

    for attempt in range(1, max_retries + 1):
        try:
            token = get_session_token(force_refresh=(attempt > 1))
        except Exception as e:
            if attempt == max_retries:
                return {"success": False, "error": f"Lỗi lấy session token Saydi: {e}"}
            print(f"[Saydi] Lỗi lấy token ({e}), thử lại sau 3s...")
            time.sleep(3)
            continue

        # Headers chuẩn xác theo Saydi Studio Web Client
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "X-OV-Feature": "tts",
            "X-OmniVoice-Client": "web",
            "X-OV-Screen": "1920x1080",
            "Origin": "https://voice.saydi.ai",
            "Referer": "https://voice.saydi.ai/vi/studio/",
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/131.0.0.0 Safari/537.36"
            ),
        }

        # Payload chuẩn xác theo Saydi Studio
        payload = {
            "text": text,
            "sample": sample,
            "guidance_scale": guidance_scale,
            "speed": speed,
            "output_format": "wav",
        }

        print(f"[Saydi] [Lần {attempt}/{max_retries}] Đang gửi kịch bản và kiên nhẫn đợi Saydi tổng hợp âm thanh...")
        start_t = time.time()

        try:
            # timeout=None: Không giới hạn thời gian chờ
            resp = requests.post(
                SAYDI_API_URL,
                headers=headers,
                json=payload,
                timeout=None,
                stream=True,
            )
        except requests.exceptions.RequestException as e:
            if attempt == max_retries:
                return {"success": False, "error": f"Lỗi kết nối mạng tới Saydi: {e}"}
            wait_t = min(5.0 * attempt, 30.0)
            print(f"[Saydi] Mạng bị ngắt quãng ({e}), đợi {wait_t:.0f}s rồi thử lại...")
            time.sleep(wait_t)
            continue

        # Kiểm tra phản hồi lỗi
        if resp.status_code != 200:
            err_detail = parse_saydi_error(resp)
            if resp.status_code in (401, 403, 429, 500, 502, 503, 504):
                if attempt < max_retries:
                    wait_time = min(5.0 * attempt, 30.0)
                    print(f"[Saydi] {err_detail} -> Đợi {wait_time:.0f}s rồi tự động thử lại (lần {attempt + 1}/{max_retries})...")
                    time.sleep(wait_time)
                    continue
                else:
                    print(f"[Saydi] [LỖI] {err_detail}")
                    return {"success": False, "error": err_detail}
            else:
                print(f"[Saydi] [LỖI] {err_detail}")
                return {"success": False, "error": err_detail}

        ct = resp.headers.get("Content-Type", "")
        if "audio" not in ct and "octet-stream" not in ct:
            if attempt < max_retries:
                time.sleep(3)
                continue
            err_msg = f"Máy chủ Saydi trả về định dạng không phải audio ({ct}): {resp.text[:200]}"
            print(f"[Saydi] [LỖI] {err_msg}")
            return {"success": False, "error": err_msg}

        # Ghi file WAV âm thanh
        try:
            os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
            with open(output_path, "wb") as f:
                for chunk in resp.iter_content(chunk_size=16384):
                    if chunk:
                        f.write(chunk)

            if not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
                if attempt < max_retries:
                    time.sleep(2)
                    continue
                return {"success": False, "error": "File WAV rỗng sau khi lưu"}

            dur_sec = time.time() - start_t
            file_size_mb = os.path.getsize(output_path) / (1024 * 1024)
            print(f"[Saydi] ✅ Đã tạo và lưu thành công toàn bộ audio ({file_size_mb:.2f} MB, mất {dur_sec:.1f}s)!")
            return {"success": True}
        except Exception as e:
            if attempt == max_retries:
                return {"success": False, "error": f"Lỗi lưu file audio: {e}"}
            time.sleep(2)

    return {"success": False, "error": "Đã thử lại nhiều lần nhưng không thành công"}


if __name__ == "__main__":
    # Usage: saydi_tts_api.py <text|@file_path> <sample_id> <output_path> [guidance_scale] [speed]
    if len(sys.argv) < 4:
        print(json.dumps({
            "success": False,
            "error": "Thiếu tham số. Dùng: saydi_tts_api.py <text|@file> <sample_id> <output_path> [guidance_scale] [speed]"
        }, ensure_ascii=False))
        sys.exit(1)

    text_arg    = sys.argv[1]
    sample_id   = sys.argv[2]
    output_path = sys.argv[3]
    g_scale     = float(sys.argv[4]) if len(sys.argv) > 4 else DEFAULT_GUIDANCE_SCALE
    spd         = float(sys.argv[5]) if len(sys.argv) > 5 else DEFAULT_SPEED

    # Nếu text_arg bắt đầu bằng @ → đọc nội dung từ file (tránh giới hạn argv Windows)
    if text_arg.startswith('@'):
        file_path = text_arg[1:]
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                text = f.read()
        except Exception as e:
            print(json.dumps({"success": False, "error": f"Không đọc được file text: {e}"}, ensure_ascii=False))
            sys.exit(1)
    else:
        text = text_arg

    result = run_tts(text, sample_id, output_path, guidance_scale=g_scale, speed=spd)
    print(json.dumps(result, ensure_ascii=False))
    if not result.get("success"):
        sys.exit(1)

