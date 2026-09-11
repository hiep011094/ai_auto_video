import os
import json
import torch
import soundfile as sf
import time
import sys
import argparse

try:
    from omnivoice import OmniVoice, OmniVoiceGenerationConfig
except ImportError:
    print("Thư viện omnivoice chưa được cài đặt. Đang cố gắng thêm từ thư mục cục bộ...")
    # Trực tiếp fallback về thư mục OmniVoice-master nếu chưa pip install
    base_dir = os.path.dirname(os.path.abspath(__file__))
    local_omnivoice = os.path.join(base_dir, "OmniVoice-master")
    if os.path.exists(local_omnivoice):
        sys.path.insert(0, local_omnivoice)
        try:
            from omnivoice import OmniVoice, OmniVoiceGenerationConfig
            print("Đã load OmniVoice từ thư mục local thành công.")
        except Exception as e:
            print(f"Lỗi: Không thể load thư viện từ local: {e}")
            exit(1)
    else:
        print("Vui lòng cài đặt omnivoice bằng lệnh: pip install omnivoice")
        exit(1)

def main():
    # Cấu hình UTF-8 cho terminal trên Windows để in tiếng Việt không bị lỗi
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)
    
    parser = argparse.ArgumentParser(description="Generate TTS using OmniVoice")
    parser.add_argument("--folder", type=str, required=True, help="Folder name, e.g., bi_an_vuc_mariana")
    parser.add_argument("--type", type=str, required=True, choices=["short", "long"], help="Video type")
    parser.add_argument("--scene", type=int, default=None, help="Scene number to render")
    parser.add_argument("--mode", type=str, default=None, help="'global' to render all text combined")
    parser.add_argument("--ref_audio", type=str, default="giong_doc.mp3", help="Reference audio file name (must be in root folder)")
    args = parser.parse_args()
    
    # 1. Quản lý đường dẫn tương đối đảm bảo tính di động (Portability)
    # base_dir là thư mục chứa script này (d:\vutru_ai)
    base_dir = os.path.dirname(os.path.abspath(__file__))
    
    ref_audio_path = os.path.join(base_dir, args.ref_audio)
    output_dir = os.path.join(base_dir, "..", "data", f"video_{args.type}", args.folder)
    
    if not os.path.exists(ref_audio_path):
        print(f"[LỖI] Không tìm thấy file mẫu: {ref_audio_path}")
        return
    if not os.path.exists(output_dir):
        print(f"[LỖI] Không tìm thấy thư mục dự án: {output_dir}")
        return

    # 2. Đọc tất cả các file chapter_*.json
    import glob
    json_files = glob.glob(os.path.join(output_dir, "chapter_*.json"))
    def sort_key(f):
        name = os.path.basename(f)
        try:
            return int(name.replace("chapter_", "").replace(".json", ""))
        except:
            return 0
    json_files.sort(key=sort_key)
    
    if not json_files:
        print(f"[LỖI] Không tìm thấy bất kỳ file chapter_*.json nào trong {output_dir}")
        return

    scenes = []
    for jf in json_files:
        with open(jf, 'r', encoding='utf-8') as f:
            ch_data = json.load(f)
            if isinstance(ch_data, list):
                scenes.extend(ch_data)
                
    if args.scene is not None:
        scenes = [s for s in scenes if s.get("scene") == args.scene]
        if not scenes:
            print(f"[LỖI] Không tìm thấy cảnh {args.scene}")
            return
        
    print(f"-> Đang khởi tạo mô hình OmniVoice...")
    # Tự động tối ưu chọn thiết bị xử lý
    load_kwargs = {}
    if torch.cuda.is_available():
        device = "cuda:0"
        dtype = torch.float16
        print("-> Đã phát hiện Card Đồ Họa (GPU) CUDA. Bật chế độ chạy siêu tốc float16!")
        try:
            import bitsandbytes
            from transformers import BitsAndBytesConfig
            # Dùng 4-bit quantization để nén tối đa (giảm từ 7GB VRAM xuống còn ~2.5GB)
            load_kwargs["quantization_config"] = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_compute_dtype=torch.float16,
                bnb_4bit_use_double_quant=True
            )
            # Tối ưu hóa đọc ổ cứng (Disk I/O) và nén RAM khi khởi động
            load_kwargs["low_cpu_mem_usage"] = True
            
            # Ngắt kết nối mạng để tăng tốc khởi động (không cần check phiên bản mới)
            load_kwargs["local_files_only"] = True
            
            print("-> [BẬT] Công nghệ nén bộ nhớ 4-bit (Siêu tiết kiệm VRAM). Dành riêng cho card 4GB!")
        except ImportError:
            pass
    else:
        device = "cpu"
        dtype = torch.float32
        print("-> Cảnh báo: Không phát hiện GPU CUDA, đang chạy trên CPU (Sẽ chậm hơn).")
    
    # Hack: Monkey patch OmniVoice.__init__ để sửa lỗi thư viện không nhận kwargs (load_in_8bit, quantization_config)
    original_init = OmniVoice.__init__
    def patched_init(self, config, llm=None, **kwargs):
        original_init(self, config, llm)
    OmniVoice.__init__ = patched_init

    # 3. Khởi tạo Mô Hình (Load model)
    try:
        model = OmniVoice.from_pretrained(
            "k2-fsa/OmniVoice",
            device_map=device,
            dtype=dtype,
            **load_kwargs
        )
    except TypeError:
        # Nếu model không hỗ trợ kwargs load_in_8bit thì fallback
        if "load_in_8bit" in load_kwargs:
            print("-> Cảnh báo: OmniVoice không hỗ trợ trực tiếp load_in_8bit, đang chạy ở chế độ chuẩn.")
        model = OmniVoice.from_pretrained(
            "k2-fsa/OmniVoice",
            device_map=device,
            dtype=dtype,
        )
    
    # Dọn dẹp rác bộ nhớ (Garbage Collection) sau khi khởi động xong để giải phóng RAM máy tính
    import gc
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        
    # 4. Tạo Voice Clone Prompt (Cache 1 lần duy nhất)
    print("\n-> Bắt đầu bóc băng và phân tích file giọng đọc mẫu (Chỉ tốn thời gian 1 lần đầu tiên)...")
    start_time = time.time()
    # Whisper sẽ tự động nghe và bóc băng giong_doc.mp3 để tạo file vector prompt
    prompt = model.create_voice_clone_prompt(
        ref_audio=ref_audio_path,
    )
    print(f"-> Đã tạo Voice Prompt xong trong {time.time() - start_time:.2f} giây.")

    # 5. Cấu hình Inference Chất Lượng Cao Nhất (Max Quality Mode)
    gen_config = OmniVoiceGenerationConfig(
        num_step=30, # Tối ưu hóa số bước tính toán để tốc độ nhanh hơn nhưng vẫn giữ chất lượng cao
        guidance_scale=2.5, # Vẫn giữ độ bám sát giọng mẫu để giọng đọc chân thực hơn
        denoise=True, # BẬT bộ lọc nhiễu AI để có âm thanh trong trẻo nhất
        preprocess_prompt=True,
        postprocess_output=True,
    )
    
    # 6. Xử lý hàng loạt các câu thoại
    print(f"\n================ BẮT ĐẦU RENDER {len(scenes)} AUDIO ================")
    
    import numpy as np
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
            voice_clone_prompt=prompt,
            language="vi",
            generation_config=gen_config
        )
        
        e_time = time.time()
        print(f"  [Hoàn Thành] Scene {scene_id} - Mất: {e_time - s_time:.2f}s")
        
        # Tối ưu hóa và tăng âm lượng (Peak Normalization)
        # Giúp âm thanh đầu ra to, rõ ràng nhất có thể mà không bị rè
        max_amp = np.max(np.abs(audio[0]))
        if max_amp > 0:
            audio[0] = (audio[0] / max_amp) * 0.95
        
        if args.mode == 'global':
            combined_audio.append(audio[0])
            # Thêm một khoảng lặng nhỏ (0.3s) giữa các câu thoại để nghe tự nhiên hơn
            silence = np.zeros(int(24000 * 0.5), dtype=audio[0].dtype)
            combined_audio.append(silence)
        else:
            # Lưu file đầu ra cho từng cảnh
            output_file = os.path.join(output_dir, f"scene_{scene_id}.wav")
            # OmniVoice xuất âm thanh ở chuẩn phòng thu 24000Hz
            sf.write(output_file, audio[0], 24000)

    if args.mode == 'global' and combined_audio:
        print("\n-> Đang ghép nối tất cả các cảnh thành một file duy nhất...")
        final_audio = np.concatenate(combined_audio, axis=-1)
        wav_output_file = os.path.join(output_dir, "tong_hop_loi_thoai.wav")
        sf.write(wav_output_file, final_audio, 24000)
        
        # Thử convert sang mp3 nếu có pydub
        try:
            from pydub import AudioSegment
            print("-> Đang nén file wav sang mp3...")
            audio_seg = AudioSegment.from_wav(wav_output_file)
            mp3_output_file = os.path.join(output_dir, "tong_hop_loi_thoai.mp3")
            audio_seg.export(mp3_output_file, format="mp3")
            print(f"-> Đã lưu thành công: {mp3_output_file}")
            # Tùy chọn: os.remove(wav_output_file)
        except Exception as e:
            print(f"-> Không thể chuyển sang định dạng mp3 (lỗi: {e}), file wav vẫn được giữ nguyên tại: {wav_output_file}")

    print("\n================ TẤT CẢ ĐÃ HOÀN TẤT ! ================")
    print(f"Kiểm tra thư mục: {output_dir} để lấy file âm thanh.")

if __name__ == "__main__":
    main()
