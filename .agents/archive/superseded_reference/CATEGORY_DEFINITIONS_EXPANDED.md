# 🌐 ĐỊNH NGHĨA MỞ RỘNG — 2 THỂ LOẠI NỘI DUNG ACTIVE

> **Vai trò:** ngân hàng ví dụ/tham khảo mở rộng cho Step 2.2 của `01_workflow.md`.
> Nguồn quy định chính thức cho category ACTIVE, rotation và keyword fallback là
> `10_category_rotation.md` + `tools/category_keywords.py`.
>
> Hệ thống từ phiên bản này chỉ có đúng **2 thể loại lựa chọn chủ đề**:
> **Khám phá vũ trụ** và **Khám phá thế giới quanh ta**.

---

## 📊 Tổng quan

| Category ID nội bộ | Tên ACTIVE | Phạm vi |
|---|---|---|
| `space_science` | **Khám phá vũ trụ** | Thiên văn, không gian, vật thể vũ trụ, thám hiểm, cosmology, sự sống ngoài Trái Đất và các giả thuyết khi đối tượng chính là vũ trụ |
| `world_mysteries` | **Khám phá thế giới quanh ta** | Trái Đất, thiên nhiên, địa lý, biển sâu, hang động, sinh vật, hệ sinh thái, khảo cổ, nền văn minh, công trình, hiện tượng tự nhiên và bí ẩn trên Trái Đất |

> `world_mysteries` là **ID legacy giữ để tương thích**, không còn có nghĩa là chỉ làm “bí ẩn”.

`hypothesis` và `physics` **không còn là category ACTIVE**. Một nội dung mang tính giả thuyết hoặc có yếu tố vật lý chỉ được chọn nếu nó phục vụ trực tiếp một trong hai đối tượng khám phá phía trên.

---

# 1️⃣ `space_science` — KHÁM PHÁ VŨ TRỤ

## A. Vũ trụ & vật thể vũ trụ

- Hố đen: stellar, intermediate, supermassive, Sagittarius A*, M87*
- Hành tinh và exoplanet
- Sao neutron, pulsar, supernova, quasar, lùn trắng
- Thiên hà, cụm thiên hà, va chạm thiên hà
- Tinh vân, vùng tạo sao
- Mặt Trời, Mặt Trăng, sao chổi, tiểu hành tinh
- Vật chất tối, năng lượng tối, sóng hấp dẫn
- Cấu trúc và quy mô vũ trụ

## B. Quan sát & phát hiện thiên văn

- James Webb, Hubble, kính radio, kính tia X
- Exoplanet mới, thiên hà xa, tín hiệu thiên văn bất thường
- Spectroscopy, gravitational lensing, interferometry
- Các phát hiện mới có nguồn đáng tin cậy

## C. Thám hiểm không gian

- Voyager, Pioneer, New Horizons, Cassini
- Apollo, Artemis, Mars rovers, Europa Clipper
- ISS, spacewalk, đời sống phi hành gia
- Tàu vũ trụ, tên lửa, vệ tinh, sứ mệnh liên hành tinh

## D. Giả thuyết/lý thuyết khi chủ thể là vũ trụ

Các topic này **không tạo category riêng**; vẫn thuộc `space_science`:

- Big Bang, Big Crunch, cyclic cosmology, CCC
- Multiverse, parallel universe
- Wormholes, cấu trúc không-thời gian khi gắn trực tiếp với vũ trụ
- Fermi Paradox, Drake Equation, Great Filter
- Panspermia, astrobiology, SETI
- Sự sống ngoài Trái Đất

## Ví dụ topic

- “Bí Ẩn Điểm Hawking: Giả Thuyết Vũ Trụ Chu Kỳ CCC Của Roger Penrose”
- “James Webb Phát Hiện Thiên Hà Cổ Đến Mức Nào?”
- “Hố Đen Siêu Khổng Lồ Có Thể Nuốt Cả Thiên Hà Không?”
- “Fermi Paradox: Nếu Alien Phổ Biến, Tại Sao Ta Chưa Thấy Họ?”
- “Voyager 1 Đang Ở Đâu Ngoài Hệ Mặt Trời?”

### YouTube discovery seeds

```text
space universe astronomy planet exoplanet star galaxy black hole nebula
supernova telescope James Webb JWST Hubble Voyager NASA Mars mission
cosmology dark matter gravitational wave multiverse Fermi paradox astrobiology
```

---

# 2️⃣ `world_mysteries` — KHÁM PHÁ THẾ GIỚI QUANH TA

## A. Trái Đất & địa lý tự nhiên

- Đại dương, biển sâu, rãnh đại dương
- Hang động, hố sụt, hồ ngầm
- Núi, núi lửa, sa mạc, rừng, sông, hồ
- Sông băng, vùng cực, địa chất đặc biệt
- Động đất, địa mạo, các cấu trúc tự nhiên hiếm
- Khí quyển và hiện tượng thời tiết đặc biệt

## B. Sinh vật & hệ sinh thái

- Sinh vật biển sâu
- Loài hiếm, thích nghi cực đoan
- Động vật có hành vi/sinh học đặc biệt
- Hệ sinh thái độc đáo
- San hô, vi sinh vật, thực vật kỳ lạ
- Extremophiles và môi trường khắc nghiệt trên Trái Đất

## C. Khảo cổ & nền văn minh

- Kim tự tháp, Stonehenge, Göbekli Tepe, Nazca
- Thành phố cổ, công trình cổ đại
- Công nghệ cổ như Antikythera mechanism
- Tàu đắm, di tích dưới nước
- Văn minh Maya, Aztec, Inca và các nền văn minh mất dấu
- Phát hiện khảo cổ mới

## D. Những nơi và hiện tượng đặc biệt quanh ta

- Sơn Đoòng, Naica Crystal Cave
- Mariana Trench
- Brine Pool dưới đáy biển
- Danakil Depression
- Atacama, Sahara, các đảo cô lập
- Hồ siêu mặn, suối phun, lava lake
- Ball lightning và các hiện tượng tự nhiên hiếm

## E. Bí ẩn là một nhánh con, không phải toàn bộ category

Có thể làm các chủ đề:

- Bermuda
- Atlantis theo hướng bằng chứng/khảo cổ
- UAP/UFO khi trọng tâm là sự kiện/hiện tượng quan sát trên Trái Đất
- Các địa điểm, di tích hoặc hiện tượng chưa giải thích đầy đủ

Nhưng category phải duy trì tinh thần **khám phá thế giới quanh ta**, không biến toàn bộ lịch nội dung thành paranormal/clickbait.

## Ví dụ topic

- “Bí Ẩn Vũng Muối Tử Thần Brine Pool: Hồ Nước Không Oxy Dưới Đáy Biển Đỏ”
- “Hang Sơn Đoòng: Thế Giới Bị Cô Lập Trong Hang Lớn Nhất Trái Đất”
- “Naica Crystal Cave: Vì Sao Con Người Chỉ Sống Được Vài Phút Bên Trong?”
- “Mariana Trench: Sinh Vật Sống Thế Nào Ở Áp Suất Khủng Khiếp?”
- “Göbekli Tepe Đã Thay Đổi Cách Ta Hiểu Về Nền Văn Minh Cổ Ra Sao?”

### YouTube discovery seeds

```text
Earth ocean deep sea cave mountain volcano forest desert glacier geology
animal species ecosystem archaeology ancient civilization ruins natural wonder
Brine Pool Mariana Son Doong Naica unexplained Earth phenomenon
```

---

# 🔀 Quy tắc routing topic

Khi một topic có vẻ “lai”, phân loại theo **đối tượng chính mà người xem đang khám phá**, không theo từ khóa “mystery”, “theory” hay “physics”.

| Topic | Category |
|---|---|
| Multiverse / CCC / Fermi / exoplanet | `space_science` |
| Hố đen / thiên hà / James Webb | `space_science` |
| Hang động / biển sâu / sinh vật / địa chất | `world_mysteries` |
| Khảo cổ / nền văn minh / công trình cổ | `world_mysteries` |
| Giả thuyết về vũ trụ | `space_science` |
| Giả thuyết về hiện tượng Trái Đất | `world_mysteries` nếu thật sự phù hợp phạm vi |
| Vật lý thuần lý thuyết không gắn với khám phá vũ trụ/Trái Đất | Không ưu tiên; chọn candidate khác |

---

# ✅ Tóm tắt vận hành

1. Chỉ có **2 category ACTIVE**.
2. Auto mode luân phiên tuyệt đối giữa hai category.
3. `hypothesis`/`physics` không còn là category lựa chọn.
4. Giả thuyết vẫn có thể xuất hiện ở `mode = "1"`, nhưng được routing theo đối tượng khám phá.
5. Topic duplicate checker vẫn hoạt động độc lập sau bước chọn category.
6. Không đổi cấu trúc dữ liệu ngoài việc giới hạn enum category mới còn 2 giá trị ACTIVE.

---

**Version:** 4.0 — Two Exploration Pillars  
**Updated:** 2026-08-28  
**Status:** ✅ ACTIVE
