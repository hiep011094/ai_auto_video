import os
import json
import base64
import sqlite3
import shutil
import ctypes
from ctypes import wintypes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

class BLOB(ctypes.Structure):
    _fields_ = [
        ('cb', wintypes.DWORD),
        ('pb', ctypes.POINTER(ctypes.c_char))
    ]

def dec_val_dp(data):
    crypt32 = ctypes.windll.crypt32
    in_blob = BLOB(len(data), ctypes.create_string_buffer(data))
    out_blob = BLOB()
    success = crypt32.CryptUnprotectData(
        ctypes.byref(in_blob), None, None, None, None, 0, ctypes.byref(out_blob)
    )
    if not success:
        raise Exception("DP failed")
    addr = ctypes.cast(out_blob.pb, ctypes.POINTER(ctypes.c_char * out_blob.cb))
    decrypted = addr.contents.raw
    ctypes.windll.kernel32.LocalFree(out_blob.pb)
    return decrypted

def get_key():
    pref_path = os.path.expandvars(r'%LOCALAPPDATA%\CapCut\User Data\CEF\LocalPrefs.json')
    if not os.path.exists(pref_path):
        return None
    with open(pref_path, 'r', encoding='utf-8') as f:
        prefs = json.load(f)
    enc_key = prefs['os_crypt']['encrypted_key']
    key_bytes = base64.b64decode(enc_key)
    if key_bytes.startswith(b'DPAPI'):
        key_bytes = key_bytes[5:]
    return dec_val_dp(key_bytes)

def dec_aes(enc_val, key):
    try:
        if enc_val.startswith(b'v10') or enc_val.startswith(b'v11'):
            nonce = enc_val[3:15]
            ciphertext = enc_val[15:]
            aesgcm = AESGCM(key)
            return aesgcm.decrypt(nonce, ciphertext, None).decode('utf-8')
        else:
            return dec_val_dp(enc_val).decode('utf-8')
    except Exception as e:
        return None

def extract_session():
    try:
        key = get_key()
        if not key:
            return {"success": False, "error": "CapCut Desktop LocalPrefs key not found."}
            
        db_path = os.path.expandvars(r'%LOCALAPPDATA%\CapCut\User Data\CEF\Cache\Network\Cookies')
        if not os.path.exists(db_path):
            return {"success": False, "error": "CapCut Desktop session database not found."}
            
        temp_db = 'temp_data.db'
        try:
            shutil.copy(db_path, temp_db)
        except Exception as e:
            return {"success": False, "error": "CapCut Desktop dang mo va khoa du lieu. Vui long tat phan mem CapCut Desktop va thu lai."}
            
        conn = sqlite3.connect(temp_db)
        cursor = conn.cursor()
        cursor.execute("SELECT name, value, encrypted_value FROM cookies WHERE host_key LIKE '%capcut%' OR host_key LIKE '%tiktok%' OR host_key LIKE '%byte%'")
        rows = cursor.fetchall()
        
        session_data = {}
        for name, val, enc_val in rows:
            decrypted = val
            if not val and enc_val:
                decrypted = dec_aes(enc_val, key)
            if decrypted:
                session_data[name] = decrypted
                
        conn.close()
        os.remove(temp_db)
        
        # Check if we have session cookies
        # Target cookies: sessionid, sid_tt, uid_tt, odin_tt, etc.
        required_keys = ['sessionid', 'sid_tt', 'uid_tt', 'odin_tt', 'sessionid_ss', 'uid_tt_ss', 'sid_guard', 'tt_session_tlb_tag']
        cookies_list = []
        x_tt_token = ""
        
        for k, v in session_data.items():
            cookies_list.append(f"{k}={v}")
            # Usually x-tt-token or similar is present
            if k.lower() == 'x-tt-token' or k.lower() == 'passport_csrf_token':
                x_tt_token = v
                
        # Also try to extract x-tt-token if it exists as another cookie
        if 'passport_csrf_token' in session_data and not x_tt_token:
            x_tt_token = session_data['passport_csrf_token']
            
        cookie_str = "; ".join(cookies_list)
        
        if not cookie_str:
            return {"success": False, "error": "CapCut Desktop chua duoc dang nhap. Vui long dang nhap tren CapCut Desktop truoc."}
            
        # Update capcut_headers.json
        headers_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'capcut_headers.json')
        if os.path.exists(headers_path):
            with open(headers_path, 'r', encoding='utf-8') as f:
                headers_cfg = json.load(f)
                
            # Update Cookie and x-tt-token in new_headers and query_headers
            if 'new_headers' in headers_cfg:
                headers_cfg['new_headers']['Cookie'] = cookie_str
                if x_tt_token:
                    headers_cfg['new_headers']['x-tt-token'] = x_tt_token
            if 'query_headers' in headers_cfg:
                headers_cfg['query_headers']['Cookie'] = cookie_str
                if x_tt_token:
                    headers_cfg['query_headers']['x-tt-token'] = x_tt_token
                    
            with open(headers_path, 'w', encoding='utf-8') as f:
                json.dump(headers_cfg, f, indent=4, ensure_ascii=False)
                
            return {"success": True, "message": "Da ket noi thanh cong voi CapCut Desktop. Da cap nhat phien lam viec!"}
        else:
            return {"success": False, "error": "capcut_headers.json templates not found."}
            
    except Exception as e:
        return {"success": False, "error": str(e)}

if __name__ == '__main__':
    res = extract_session()
    print(json.dumps(res))
