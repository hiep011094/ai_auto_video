import os
import sys
import json
import torch
import time
import glob
import numpy as np
import soundfile as sf
import threading
from fastapi import FastAPI, BackgroundTasks, Request, UploadFile, File
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel
from typing import Optional
from pathlib import Path

# Cấu hình UTF-8 cho terminal trên Windows
sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

app = FastAPI(title="OmniVoice TTS Server")

model = None
gen_config = None
voice_prompts_cache = {}
model_ready = False

# Khai báo khóa luồng GPU và giới hạn bộ nhớ đệm
gpu_lock = threading.Lock()
MAX_CACHE_SIZE = 5

class TTSJob(BaseModel):
    folder: str
    type: str
    mode: Optional[str] = None
    scene: Optional[int] = None
    log_file: str
    ref_audio: Optional[str] = "giong_doc.mp3"

@app.on_event("startup")
def load_model():
    global model, gen_config, voice_prompts_cache, model_ready
    print("-> Đang khởi tạo Trạm AI Thường trực (Chỉ chạy 1 lần duy nhất)...")
    
    # 1. Quản lý thư mục
    base_dir = os.path.dirname(os.path.abspath(__file__))
    ref_audio_path = os.path.join(base_dir, "giong_doc.mp3")
    
    try:
        from omnivoice import OmniVoice, OmniVoiceGenerationConfig
    except ImportError:
        local_omnivoice = os.path.join(base_dir, "OmniVoice-master")
        sys.path.insert(0, local_omnivoice)
        from omnivoice import OmniVoice, OmniVoiceGenerationConfig

    # 2. Cấu hình tối ưu GPU
    load_kwargs = {}
    if torch.cuda.is_available():
        device = "cuda:0"
        dtype = torch.float16
        print("-> Đã phát hiện GPU. Bật chế độ chạy siêu tốc float16!")
        try:
            from transformers import BitsAndBytesConfig
            load_kwargs["quantization_config"] = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_compute_dtype=torch.float16,
                bnb_4bit_use_double_quant=True
            )
            load_kwargs["low_cpu_mem_usage"] = True
            load_kwargs["local_files_only"] = True
            print("-> [BẬT] Công nghệ nén bộ nhớ 4-bit (Siêu tiết kiệm VRAM). Dành riêng cho card 4GB!")
        except ImportError:
            pass
    else:
        device = "cpu"
        dtype = torch.float32

    # Hack OmniVoice.__init__
    original_init = OmniVoice.__init__
    def patched_init(self, config, llm=None, **kwargs):
        original_init(self, config, llm)
    OmniVoice.__init__ = patched_init

    try:
        model = OmniVoice.from_pretrained(
            "k2-fsa/OmniVoice",
            device_map=device,
            dtype=dtype,
            **load_kwargs
        )
    except TypeError:
        model = OmniVoice.from_pretrained(
            "k2-fsa/OmniVoice",
            device_map=device,
            dtype=dtype,
        )

    import gc
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    print("-> Đang tạo Voice Clone Prompt (Mặc định: giong_doc.mp3)...")
    if os.path.exists(ref_audio_path):
        voice_prompts_cache["giong_doc.mp3"] = model.create_voice_clone_prompt(ref_audio=ref_audio_path)
    else:
        print("-> [Cảnh báo] Không tìm thấy file giong_doc.mp3 lúc khởi động.")
    
    gen_config = OmniVoiceGenerationConfig(
        num_step=30,
        guidance_scale=2.5,
        denoise=True,
        preprocess_prompt=True,
        postprocess_output=True,
    )

    model_ready = True
    print("\n====== TRẠM AI TTS ĐÃ SẴN SÀNG! TỐC ĐỘ PHẢN HỒI: TỨC THÌ ======\n")

class CustomLogger:
    def __init__(self, filename):
        self.terminal = sys.stdout
        self.filename = filename
        
    def write(self, message):
        self.terminal.write(message)
        with open(self.filename, 'a', encoding='utf-8') as f:
            f.write(message)
            
    def flush(self):
        self.terminal.flush()

def process_tts(job: TTSJob):
    if not model_ready:
        print("Mô hình chưa tải xong!")
        return

    # Đồng bộ hóa luồng sử dụng GPU bằng gpu_lock
    with gpu_lock:
        parent_folder = "video_long" if job.type == "long" else "video_short"
        output_dir = os.path.join(base_dir, "..", "data", parent_folder, job.folder)
        
        # Chuyển hướng stdout sang log file
        logger = CustomLogger(job.log_file)
        original_stdout = sys.stdout
        sys.stdout = logger
        
        success = False
        try:
            # Xử lý Voice Clone Prompt (Cache System)
            ref_audio_filename = job.ref_audio if job.ref_audio else "giong_doc.mp3"
            if ref_audio_filename not in voice_prompts_cache:
                ref_audio_path = os.path.join(base_dir, ref_audio_filename)
                if not os.path.exists(ref_audio_path):
                    print(f"-> [LỖI] Không tìm thấy file mẫu: {ref_audio_filename}. Đang dùng giong_doc.mp3 thay thế...")
                    ref_audio_filename = "giong_doc.mp3"
                    ref_audio_path = os.path.join(base_dir, "giong_doc.mp3")
                
                if ref_audio_filename not in voice_prompts_cache:
                    # Kiểm tra giới hạn cache VRAM
                    if len(voice_prompts_cache) >= MAX_CACHE_SIZE:
                        # Giải phóng giọng mẫu cũ hơn (ngoại trừ giọng mặc định)
                        keys_to_remove = [k for k in voice_prompts_cache.keys() if k != "giong_doc.mp3"]
                        if keys_to_remove:
                            removed_key = keys_to_remove[0]
                            del voice_prompts_cache[removed_key]
                            print(f"-> [VRAM Guard] Giải phóng cache giọng mẫu: {removed_key} khỏi GPU.")
                            # Thu hồi bộ nhớ GPU thực tế
                            import gc
                            gc.collect()
                            if torch.cuda.is_available():
                                torch.cuda.empty_cache()

                    print(f"-> Đang bóc băng và phân tích giọng mới: {ref_audio_filename}...")
                    voice_prompts_cache[ref_audio_filename] = model.create_voice_clone_prompt(ref_audio=ref_audio_path)
                    
            current_prompt = voice_prompts_cache.get(ref_audio_filename)
            if current_prompt is None:
                print("-> [LỖI] Không có dữ liệu giọng mẫu hợp lệ để chạy.")
                return

            json_files = glob.glob(os.path.join(output_dir, "chapter_*.json"))
            def sort_key(f):
                name = os.path.basename(f)
                try: return int(name.replace("chapter_", "").replace(".json", ""))
                except: return 0
            json_files.sort(key=sort_key)
            
            scenes = []
            for jf in json_files:
                with open(jf, 'r', encoding='utf-8') as f:
                    ch_data = json.load(f)
                    if isinstance(ch_data, list):
                        scenes.extend(ch_data)
                        
            if job.scene is not None:
                scenes = [s for s in scenes if s.get("scene") == job.scene]
                
            print(f"\n================ BẮT ĐẦU RENDER {len(scenes)} AUDIO ================")
            
            combined_audio = []
            for item in scenes:
                scene_id = item.get("scene")
                text = item.get("voiceover")
                if not text:
                    continue
                    
                print(f"  [Đang Render] Scene {scene_id}: \"{text[:30]}...\"")
                s_time = time.time()
                
                audio = model.generate(
                    text=text,
                    voice_clone_prompt=current_prompt,
                    language="vi",
                    generation_config=gen_config
                )
                
                e_time = time.time()
                print(f"  [Hoàn Thành] Scene {scene_id} - Mất: {e_time - s_time:.2f}s")
                
                max_amp = np.max(np.abs(audio[0]))
                if max_amp > 0:
                    audio[0] = (audio[0] / max_amp) * 0.95
                
                if job.mode == 'global':
                    combined_audio.append(audio[0])
                    silence = np.zeros(int(24000 * 0.5), dtype=audio[0].dtype)
                    combined_audio.append(silence)
                else:
                    output_file = os.path.join(output_dir, f"scene_{scene_id}.wav")
                    sf.write(output_file, audio[0], 24000)

            if job.mode == 'global' and combined_audio:
                print("\n-> Đang ghép nối tất cả các cảnh thành một file duy nhất...")
                final_audio = np.concatenate(combined_audio, axis=-1)
                wav_output_file = os.path.join(output_dir, "tong_hop_loi_thoai.wav")
                sf.write(wav_output_file, final_audio, 24000)
                
                try:
                    from pydub import AudioSegment
                    print("-> Đang nén file wav sang mp3...")
                    audio_seg = AudioSegment.from_wav(wav_output_file)
                    mp3_output_file = os.path.join(output_dir, "tong_hop_loi_thoai.mp3")
                    audio_seg.export(mp3_output_file, format="mp3")
                    print(f"-> Đã lưu thành công: {mp3_output_file}")
                except Exception as e:
                    print(f"-> Không thể chuyển sang mp3 (lỗi: {e})")

            print("\n================ TẤT CẢ ĐÃ HOÀN TẤT ! ================")
            success = True
            
        except Exception as e:
            print(f"LỖI TẠO TTS: {e}")
        finally:
            sys.stdout = original_stdout

@app.get("/")
def get_ui():
    ui_path = os.path.join(os.path.dirname(__file__), "ui", "index.html")
    if os.path.exists(ui_path):
        with open(ui_path, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return HTMLResponse("<h1>Không tìm thấy giao diện</h1>")

@app.get("/api/voices")
def list_voices():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    files = []
    for f in os.listdir(base_dir):
        if f.lower().endswith(('.mp3', '.wav')):
            f_path = os.path.join(base_dir, f)
            size = os.path.getsize(f_path)
            files.append({"name": f, "size": size})
    files.sort(key=lambda x: (0 if x["name"] == "giong_doc.mp3" else 1, x["name"]))
    return {"status": "success", "voices": files}

@app.post("/api/upload-voice")
async def upload_voice(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(('.mp3', '.wav')):
        return JSONResponse({"status": "error", "message": "Chỉ chấp nhận file .mp3 hoặc .wav"}, status_code=400)
        
    base_dir = os.path.dirname(os.path.abspath(__file__))
    save_path = os.path.join(base_dir, file.filename)
    
    try:
        with open(save_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        return {"status": "success", "message": f"Đã lưu {file.filename}"}
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)

@app.post("/generate")
def generate_endpoint(job: TTSJob, background_tasks: BackgroundTasks):
    if not model_ready:
        return {"status": "error", "message": "Server đang khởi động AI, vui lòng chờ chút..."}
    
    # Xóa log cũ
    with open(job.log_file, 'w', encoding='utf-8') as f:
        f.write("-> Bắt đầu tiến trình tạo giọng nói...\n")
        
    # Ném tiến trình vào Background
    background_tasks.add_task(process_tts, job)
    return {"status": "success", "message": "Đã chuyển lệnh tới Trạm AI"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
