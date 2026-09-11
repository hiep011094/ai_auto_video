import os
import sys
import json
import uuid
import time
import requests
from urllib.parse import urlencode
import capcut_common_task_client as common

DEBUG = False

def run_tts(text, voice_id, resource_id, output_path, platform="microsoft"):
    # Load the captured static headers and url that bypass the WAF
    headers_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "capcut_headers.json")
    if os.path.exists(headers_path):
        with open(headers_path, "r", encoding="utf-8") as f:
            headers_cfg = json.load(f)
        new_url = headers_cfg["new_url"]
        new_headers = headers_cfg["new_headers"]
        query_url = headers_cfg["query_url"]
        query_headers = headers_cfg["query_headers"]
        device_id = "7386498879850792449"
        aid = 359289
    else:
        # Fallback to the old method if headers are missing
        device_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "src", "config", "capcut_device.json")
        with open(device_path, "r", encoding="utf-8") as f:
            device = json.load(f)
        new_url = f"{common.BASE}/lv/v1/common_task/new?{urlencode(common.common_query(device, True))}"
        device_id = device["device_id"]
        aid = device["aid"]
    
    babi = {
        "feature_entrance": "editor",
        "feature_entrance_detail": "editor-feature-text_to_speech",
        "feature_key": "text_to_speech",
        "scenario": "video_editor",
    }
    
    ssml = (
        f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">\n'
        f'    <voice name="{voice_id}" mock_tone_info="" platform="{platform}" '
        f'resource_id="{resource_id}" emotion="" emotion_scale="0" style="" role="" '
        f'moyin_emotion="" is_clone_tone="false" need_subtitle_timestamp="false">\n'
        f'        <prosody rate="1.0">{common.escape_xml(text)}</prosody>\n'
        f'    </voice>\n</speak>'
    )
    
    payload = {
        "audio_format": "mp3",
        "babi_param": common.compact_json(babi),
        "credit_disable": False,
        "extra_info": common.compact_json({"benefit_info": {}}),
        "need_merge_voice": False,
        "need_subtitle_timestamp": False,
        "scene": "text_to_speech",
        "ssml": ssml,
    }
    
    payload["sign"] = common.make_tts_payload_sign(ssml, payload["extra_info"], device_id, aid)
    req_key = f"{platform}_text_to_speech"
    if platform == "sami":
        req_key = "sami_text_to_speech"
    elif platform == "microsoft":
        req_key = "microsoft_text_to_speech"
        
    body = {
        "bind_id": str(uuid.uuid4()),
        "can_queue": True,
        "enter_from": "text_to_speech",
        "tasks": [
            {
                "context": str(uuid.uuid4()),
                "payload": common.compact_json(payload),
                "req_key": req_key,
                "task_version": "v3",
            }
        ],
    }
    
    body_text = common.compact_json(body)
    
    if os.path.exists(headers_path):
        # Refresh time-sensitive headers on every request to avoid WAF replay detection
        now_ts = str(int(time.time()))
        new_headers = dict(new_headers)
        new_headers["x-khronos"] = now_ts
        new_headers["device-time"] = now_ts
        new_headers["x-ss-stub"] = common.make_x_ss_stub(body_text)
        new_headers["x-tt-trace-id"] = common.make_trace_id()
        headers = new_headers
    else:
        headers = common.base_headers(device, body_text, appid=True)
    
    if DEBUG:
        print("DEBUG URL:", new_url)
        print("DEBUG HEADERS:", json.dumps(headers))
        print("DEBUG BODY:", body_text)
    
    try:
        resp = requests.post(new_url, headers=headers, data=body_text.encode("utf-8"), timeout=60, verify=False)
        if DEBUG:
            print("DEBUG STATUS:", resp.status_code)
            print("DEBUG RESP:", resp.text)
        resp_json = resp.json()
        if str(resp_json.get("ret")) != "0":
            errmsg = resp_json.get("errmsg", "Unknown error: " + str(resp_json))
            ret_code = resp_json.get("ret", "?")
            print(f"[DEBUG] API ret={ret_code} errmsg={errmsg} full={resp_json}", file=sys.stderr)
            return {"success": False, "error": errmsg, "ret": ret_code}
            
        task = resp_json["data"]["tasks"][0]
        task_id = task["id"]
        token = task["token"]
        
        if not os.path.exists(headers_path):
            q_url = f"{common.BASE}/lv/v1/common_task/query?{urlencode(common.common_query(device, False))}"
        
        for i in range(90):
            q_body = common.query_body(task_id, token, req_key)
            q_body_text = common.compact_json(q_body)
            
            if os.path.exists(headers_path):
                # Refresh time-sensitive headers for each query request
                now_ts = str(int(time.time()))
                q_headers = dict(query_headers)
                q_headers["x-khronos"] = now_ts
                q_headers["device-time"] = now_ts
                q_headers["x-ss-stub"] = common.make_x_ss_stub(q_body_text)
                q_headers["x-tt-trace-id"] = common.make_trace_id()
            else:
                q_headers = common.base_headers(device, q_body_text, appid=True)
                if "sign" not in q_headers:
                    q_headers["sign"] = common.make_sign_header(q_url, device["appvr"], q_headers["device-time"], device["tdid"])
                
            q_resp = requests.post(query_url if os.path.exists(headers_path) else q_url, headers=q_headers, data=q_body_text.encode("utf-8"), timeout=60, verify=False)
            q_data = q_resp.json()
            status_obj = q_data["data"]["tasks"][0]
            status = status_obj["status"]
            
            print(f"Polling task status (attempt {i + 1}/90): {status}", file=sys.stderr)
            sys.stderr.flush()
            
            if status == "failed":
                return {"success": False, "error": f"Task failed. Status detail: {status_obj}"}
            elif status == "succeed" or status == "success":
                # 'succeed' is what capcut returns
                payload_str = status_obj.get("payload")
                if payload_str:
                    payload_dict = json.loads(payload_str)
                    res_url = payload_dict.get("audio_subtitles", [{}])[0].get("speech_url")
                    if res_url:
                        audio_resp = requests.get(res_url, timeout=60, verify=False)
                        with open(output_path, "wb") as f:
                            f.write(audio_resp.content)
                        return {"success": True}
                
                # fallback for different response format
                if "result" in status_obj and "url" in status_obj["result"]:
                    res_url = status_obj["result"]["url"]
                    audio_resp = requests.get(res_url, timeout=60, verify=False)
                    with open(output_path, "wb") as f:
                        f.write(audio_resp.content)
                    return {"success": True}
                    
                return {"success": False, "error": f"Success but no url found. Status detail: {status_obj}"}
                
            time.sleep(1.0)
            
        return {"success": False, "error": "Task timeout"}
        
    except Exception as e:
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    # Force UTF-8 output to avoid UnicodeEncodeError on Windows cp1252 console
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    text = sys.argv[1]
    voice_id = sys.argv[2]
    resource_id = sys.argv[3]
    output_path = sys.argv[4]
    platform = sys.argv[5] if len(sys.argv) > 5 else "microsoft"
    
    res = run_tts(text, voice_id, resource_id, output_path, platform)
    
    # Auto-refresh session and retry once on shark block / WAF errors
    if not res.get("success"):
        err = res.get("error", "")
        if "shark block" in err.lower() or "block only" in err.lower() or "waf" in err.lower():
            print(f"[WARN] Bị chặn WAF: {err} — đang thử refresh session tự động...", file=sys.stderr)
            sys.stderr.flush()
            try:
                refresh_script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "config", "refresh_session.py")
                refresh_script = os.path.normpath(refresh_script)
                if os.path.exists(refresh_script):
                    import subprocess
                    refresh_env = os.environ.copy()
                    refresh_env["PYTHONIOENCODING"] = "utf-8"
                    r = subprocess.run([sys.executable, refresh_script], capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=30, env=refresh_env)
                    refresh_result = json.loads(r.stdout.strip()) if r.stdout.strip() else {}
                    if refresh_result.get("success"):
                        print(f"[INFO] Refresh thành công: {refresh_result.get('message')} — đang retry TTS...", file=sys.stderr)
                        sys.stderr.flush()
                        time.sleep(2)
                        res = run_tts(text, voice_id, resource_id, output_path, platform)
                    else:
                        print(f"[WARN] Refresh thất bại: {refresh_result.get('error', r.stderr)}", file=sys.stderr)
                else:
                    print(f"[WARN] Không tìm thấy refresh_session.py tại {refresh_script}", file=sys.stderr)
            except Exception as e_refresh:
                print(f"[WARN] Lỗi khi refresh session: {e_refresh}", file=sys.stderr)
            sys.stderr.flush()

    # Retry with backoff on "system busy" (server queue full / rate limit)
    if not res.get("success"):
        err = res.get("error", "")
        ret_code = str(res.get("ret", ""))

        # ret=1014 = hết credit TTS — retry vô ích, báo lỗi rõ ràng luôn
        if ret_code == "1014":
            print(f"[ERROR] Hết credit TTS CapCut (ret=1014). Vui lòng kiểm tra credit trong CapCut Desktop và nạp thêm.", file=sys.stderr)
            sys.stderr.flush()
        # ret=2 là "system busy" / rate limit tạm thời → mới nên retry
        elif "system busy" in err.lower() or "busy" in err.lower() or ret_code == "2":
            max_busy_retries = 5
            for attempt in range(1, max_busy_retries + 1):
                wait = attempt * 5  # 5s, 10s, 15s, 20s, 25s
                print(f"[WARN] Server bận (ret={ret_code}, {err}) — chờ {wait}s rồi retry ({attempt}/{max_busy_retries})...", file=sys.stderr)
                sys.stderr.flush()
                time.sleep(wait)
                res = run_tts(text, voice_id, resource_id, output_path, platform)
                if res.get("success"):
                    break
                err = res.get("error", "")
                ret_code = str(res.get("ret", ""))
                if ret_code == "1014":
                    print(f"[ERROR] Hết credit TTS CapCut (ret=1014). Vui lòng kiểm tra credit trong CapCut Desktop và nạp thêm.", file=sys.stderr)
                    sys.stderr.flush()
                    break
                if "system busy" not in err.lower() and "busy" not in err.lower() and ret_code != "2":
                    break  # lỗi khác, không tiếp tục retry busy
    
    if not res.get("success"):
        print(f"Error: {res.get('error')}", file=sys.stderr)
        sys.exit(1)
    print(json.dumps({"success": True}))
