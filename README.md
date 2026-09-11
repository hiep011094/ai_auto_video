# ☸️ Tỉnh Thức AI — Studio Tự Động Hóa Video Phật Giáo

> Nền tảng AI tự động viết kịch bản, tạo visual prompt (VEO), và đóng gói project CapCut cho kênh **ĐƯỜNG VỀ TỈNH THỨC**.

## 🪷 Tính năng

- **Tự động viết kịch bản** — AI Agent tự chọn chủ đề Phật giáo hoặc viết theo đề tài bạn cung cấp
- **Phong cách chiêm nghiệm** — Voice style `contemplative`, giọng trầm lắng sâu sắc, tiếng Việt
- **AI Visual Directing** — Tự động tạo VEO prompt cho từng cảnh theo phong cách cinematic Phật giáo
- **CapCut Integration** — Tự động tạo project CapCut với timeline, transition, overlay, BGM
- **Anti-Duplication** — Đọc lịch sử để đảm bảo không trùng chủ đề
- **2 trụ cột nội dung** — Phật pháp sống (`buddhist_life`) & Trí tuệ Phật giáo (`buddhist_wisdom`)
- **Dark/Light Mode** — Warm Buddhist theme tự động theo system preference

## 🏗️ Architecture

```
vutru_ai/
├── app/
│   ├── api/                    # Next.js API Routes
│   │   ├── browse/             # File system browser
│   │   ├── capcut/             # CapCut project builder
│   │   ├── content/            # Content reader
│   │   ├── history/            # History CRUD
│   │   ├── queue/              # Queue management + CLI trigger
│   │   ├── tts/                # Text-to-Speech (Saydi/Vbee)
│   │   ├── youtube/            # YouTube upload & management
│   │   └── scan-folders/       # Video folder scanner
│   ├── components/             # React Components
│   │   ├── Sidebar.tsx         # Navigation sidebar
│   │   ├── ScriptForm.tsx      # Script creation form
│   │   ├── QueueSidebar.tsx    # Queue progress tracker
│   │   ├── CapCutPanel.tsx     # CapCut project panel
│   │   ├── ContentViewer.tsx   # Content history viewer
│   │   ├── YouTubePanel.tsx    # YouTube upload & scheduling
│   │   ├── ErrorBoundary.tsx   # Error boundary wrapper
│   │   ├── FolderBrowser.tsx   # File system picker modal
│   │   └── Toast.tsx           # Toast notification system
│   ├── hooks/                  # Custom Hooks
│   │   ├── useQueue.ts         # Queue state management
│   │   └── useCapcut.ts        # CapCut state management
│   ├── lib/                    # Service Layer
│   │   ├── api.ts              # Centralized API client
│   │   ├── security.ts         # Path sanitization + validation
│   │   ├── storage.ts          # Atomic JSON read/write + file locking
│   │   ├── channel.ts          # Channel config + topic validation
│   │   ├── jobs.ts             # Background job queue + worker
│   │   ├── youtube-auth.ts     # YouTube API + OAuth
│   │   └── capcut/             # CapCut builder module
│   ├── types.ts                # Central TypeScript interfaces
│   ├── page.tsx                # Main dashboard
│   ├── layout.tsx              # Root layout + metadata
│   └── globals.css             # Design system + dark mode
├── .agents/                    # AI Agent Pipeline V9
│   ├── AGENTS.md               # Agent entry point
│   ├── 00-17_*.md              # Step-by-step guides
│   ├── schemas/                # JSON schemas for validation
│   ├── templates/              # Starting templates
│   ├── tools/                  # Python tools (word_splitter, qa, etc.)
│   └── skills/                 # Agent skills (ProcessQueue, GenerateVeoPrompts, OptimizeSEO)
├── config/
│   └── channel_config.json     # Channel settings, categories, topic signals
├── database/
│   └── history.json            # Video history database
├── data/
│   ├── video_short/            # Short video projects
│   └── video_long/             # Long video projects
└── __tests__/                  # Unit tests
```

## 🛠️ Setup

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm test

# Type check
npx tsc --noEmit

# Build for production
npm run build
```

## ⚙️ Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VUTRU_SCAN_ROOT` | `data/` | Root directory for video folder scanning |
| `VUTRU_ACCESS_TOKEN` | — | Optional access token for LAN protection |

## 🧪 Testing

```bash
npm test           # Run all tests
npx jest --watch   # Watch mode
```

## 🔐 Security

- **Path Sanitization** — All file system APIs validate paths against allowed roots
- **Input Validation** — All POST endpoints validate required fields + Buddhist topic check
- **Atomic Writes** — JSON files written via temp file + fsync + rename to prevent corruption
- **File Locking** — Concurrent access between Node.js API and Python agents synchronized
- **OAuth State** — Double-submit cookie pattern with server-side hash validation
- **Timing-safe** — Token comparison uses `timingSafeEqual` to prevent timing attacks

## 📝 License

Private project.
