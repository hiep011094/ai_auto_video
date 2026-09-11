import { resolveProjectPath } from '../security';
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function runTask(req: Request) {
    try {
        const body = await req.json();
        const { folder, type } = body;

        if (!folder || !type) {
            return NextResponse.json({ success: false, message: 'Thiếu folder hoặc type.' }, { status: 400 });
        }

        const token = process.env.VBEE_BEARER_TOKEN;
        if (!token) {
            return NextResponse.json({ success: false, message: 'Chưa cấu hình VBEE_BEARER_TOKEN trong .env.local.' }, { status: 400 });
        }

        const parentFolder = type === 'long' ? 'video_long' : 'video_short';
        const projectDir = resolveProjectPath(folder, type);

        // Log function 
        const logFile = path.join(projectDir, 'vbee_tts.log');
        const appendLog = (msg: string) => {
            console.log(msg);
            fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);
        };
        fs.writeFileSync(logFile, '');

        const files = fs.readdirSync(projectDir);
        const chapterFiles = files.filter(f => f.startsWith('chapter_') && f.endsWith('.json'));

        if (chapterFiles.length === 0) {
            return NextResponse.json({ success: false, message: 'Không tìm thấy file chapter_*.json' }, { status: 404 });
        }

        chapterFiles.sort((a, b) => {
            const numA = parseInt(a.replace('chapter_', '').replace('.json', '')) || 0;
            const numB = parseInt(b.replace('chapter_', '').replace('.json', '')) || 0;
            return numA - numB;
        });

        const chapters = chapterFiles.map(file => {
            const content = fs.readFileSync(path.join(projectDir, file), 'utf-8');
            return {
                title: file,
                data: JSON.parse(content)
            };
        });

        let combinedText = '';
        const masterScriptFile = path.join(projectDir, 'master_script.txt');
        if (fs.existsSync(masterScriptFile)) {
            combinedText = fs.readFileSync(masterScriptFile, 'utf-8').trim();
        } else if (type === 'short') {
            let allScenes: any[] = [];
            chapters.forEach((ch: any) => {
                if (Array.isArray(ch.data)) allScenes = allScenes.concat(ch.data);
            });
            let paragraphs = [];
            for (let i = 0; i < allScenes.length; i += 2) {
                let p = allScenes[i]?.voiceover || "";
                if (allScenes[i + 1]) {
                    p += " " + (allScenes[i + 1]?.voiceover || "");
                }
                paragraphs.push(p);
            }
            combinedText = paragraphs.join("\n").trim();
        } else {
            chapters.forEach((ch: any) => {
                let chapterText = "";
                if (Array.isArray(ch.data)) {
                    chapterText = ch.data.map((s: any) => s?.voiceover || "").join("\n");
                }
                combinedText += `${chapterText}\n\n`;
            });
            combinedText = combinedText.trim();
        }

        if (!combinedText) {
            return NextResponse.json({ success: false, message: 'Không có lời thoại' }, { status: 400 });
        }

        const metadataFile = path.join(projectDir, 'metadata.json');
        let language = 'vi';

        // 1. Kiểm tra database/history.json
        const historyFile = path.join(process.cwd(), 'database', 'history.json');
        if (fs.existsSync(historyFile)) {
            try {
                const history = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
                const list = Array.isArray(history) ? history : (history.topics || []);
                const matched = list.find((h: any) => h.folder === folder || h.folder === path.basename(projectDir));
                if (matched && matched.language) language = matched.language.toLowerCase();
            } catch (e) { }
        }

        // 2. Kiểm tra metadata.json
        if (language === 'vi' && fs.existsSync(metadataFile)) {
            try {
                const metaStr = fs.readFileSync(metadataFile, 'utf-8');
                const meta = JSON.parse(metaStr);
                if (meta.language) language = meta.language.toLowerCase();
            } catch (e) { }
        }

        // 3. Fallback theo nội dung text
        if (language === 'vi' && combinedText) {
            const isVietnamese = /[àáảãạâầấẩẫậăằắẳẵặđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/i.test(combinedText.substring(0, 500));
            if (!isVietnamese) language = 'en';
        }

        let defaultVoice = 'hn_female_ngochuyen_full_48k-fhg';
        if (language === 'en') {
            defaultVoice = 'uk_male_brian_full_48k-fhg';
        }

        let voiceCode = body.voiceCode || defaultVoice;
        if (language === 'en' && voiceCode === 'hn_female_ngochuyen_full_48k-fhg') {
            voiceCode = 'uk_male_brian_full_48k-fhg';
        } else if (language === 'vi' && voiceCode === 'uk_male_brian_full_48k-fhg') {
            voiceCode = 'hn_female_ngochuyen_full_48k-fhg';
        }

        // Fire & Forget Process
        (async () => {
            try {
                // Check if JWT token is expired before calling Vbee
                try {
                    const parts = token.split('.');
                    if (parts.length === 3) {
                        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
                        if (payload.exp && Date.now() >= payload.exp * 1000) {
                            const expDate = new Date(payload.exp * 1000).toLocaleString('vi-VN');
                            throw new Error(`VBEE_BEARER_TOKEN trong .env.local đã HẾT HẠN lúc ${expDate}. Vui lòng đăng nhập lại vbee.vn để lấy Token mới.`);
                        }
                    }
                } catch (e: any) {
                    if (e.message.includes('HẾT HẠN')) throw e;
                }

                appendLog(`Bắt đầu gọi API Vbee (Ngôn ngữ: ${language}, Giọng: ${voiceCode})...`);
                const reqBody = {
                    audioType: 'mp3',
                    bitrate: 128,
                    text: combinedText,
                    voiceCode: voiceCode,
                    speed: 1
                };

                const synRes = await fetch('https://vbee.vn/api/v1/synthesis', {
                    method: 'POST',
                    headers: {
                        'Authorization': 'Bearer ' + token,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(reqBody)
                });

                if (!synRes.ok) {
                    const errBody = await synRes.text().catch(() => '');
                    let detailedMsg = `API Vbee trả về lỗi HTTP ${synRes.status}`;
                    if (synRes.status === 500 || synRes.status === 401) {
                        detailedMsg += ` (Token có thể đã hết hạn hoặc không có quyền truy cập)`;
                    }
                    if (errBody) {
                        detailedMsg += `: ${errBody.slice(0, 150)}`;
                    }
                    throw new Error(detailedMsg);
                }

                const synData = await synRes.json();
                if (!synData.result || !synData.result.request_id) {
                    throw new Error('Không lấy được request_id từ Vbee.');
                }

                const reqId = synData.result.request_id;
                appendLog(`Đã gửi yêu cầu tạo giọng nói (ID: ${reqId}). Đang chờ...`);

                let audioUrl = '';
                let attempts = 0;
                while (attempts < 120) {
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    attempts++;
                    appendLog(`Đang kiểm tra kết quả (lần ${attempts}/120)...`);

                    const pollRes = await fetch('https://vbee.vn/api/v2/requests?limit=5', {
                        headers: {
                            'Authorization': 'Bearer ' + token
                        }
                    });
                    const pollData = await pollRes.json();

                    if (pollData.result && pollData.result.requests) {
                        const targetDoc = pollData.result.requests.find((d: any) => d.id === reqId);
                        if (targetDoc) {
                            if (targetDoc.status === 'SUCCESS' && targetDoc.audio_link) {
                                audioUrl = targetDoc.audio_link;
                                appendLog('Tạo giọng nói thành công!');
                                break;
                            } else if (targetDoc.status === 'FAILED') {
                                throw new Error('Yêu cầu tạo giọng nói trên Vbee bị lỗi (FAILED).');
                            }
                        }
                    }
                }

                if (!audioUrl) {
                    throw new Error('Quá thời gian chờ tạo giọng nói.');
                }

                appendLog('Đang tải file audio về máy...');
                const audioRes = await fetch(audioUrl);
                const arrayBuffer = await audioRes.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);

                const audioFilePath = path.join(projectDir, 'tong_hop_loi_thoai_vbee.mp3');
                fs.writeFileSync(audioFilePath, buffer);
                appendLog('Đã lưu file thành tong_hop_loi_thoai_vbee.mp3 thành công!');
                appendLog('TẤT CẢ ĐÃ HOÀN TẤT');

            } catch (err: any) {
                appendLog(`Lỗi xử lý Vbee: ${err.message}`);
                appendLog('LỖI: TẤT CẢ ĐÃ HOÀN TẤT'); // To stop UI from polling indefinitely on error
            }
        })();

        return NextResponse.json({ success: true, message: 'Đã gửi yêu cầu tới Vbee, đang xử lý ngầm.' });

    } catch (e: any) {
        console.error("Lỗi api Vbee:", e);
        return NextResponse.json({ success: false, message: e.message }, { status: 500 });
    }
}
