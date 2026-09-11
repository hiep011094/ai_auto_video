'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { HistoryItem } from '../types';
import { useToast } from './Toast';

interface PublishSchedule {
  date: string;
  hour: string;
  minute: string;
}

interface CustomScheduleConfig {
  short_vi_weekday: string[];
  short_vi_weekend: string[];
  short_en_weekday: string[];
  short_en_weekend: string[];
  long_vi_tue_thu: string[];
  long_vi_sat: string[];
  long_en_tue_thu: string[];
  long_en_sat: string[];
  long_vi_weekday?: string[];
  long_vi_weekend?: string[];
  long_en_weekday?: string[];
  long_en_weekend?: string[];
  shortWeekday?: string[];
  shortWeekend?: string[];
  longWeekday?: string[];
  longWeekend?: string[];
}

const DEFAULT_SCHEDULE_CONFIG: CustomScheduleConfig = {
  short_vi_weekday: ['11:30'],
  short_vi_weekend: ['09:00'],
  short_en_weekday: ['06:00'],
  short_en_weekend: ['21:00'],
  long_vi_tue_thu: ['19:00'],
  long_vi_sat: ['09:30'],
  long_en_tue_thu: ['02:00'],
  long_en_sat: ['21:00'],
  long_vi_weekday: ['19:00'],
  long_vi_weekend: ['09:30'],
  long_en_weekday: ['02:00'],
  long_en_weekend: ['21:00'],
};

interface YouTubePanelProps {
  isActive?: boolean;
}

export default function YouTubePanel({ isActive = true }: YouTubePanelProps) {
  const getAvailableTimesForDate = (cfg: CustomScheduleConfig, type: 'short' | 'long', lang: 'vi' | 'en', searchDate: Date): string[] => {
    const dayOfWeek = searchDate.getDay(); // 0: CN, 1: T2, 2: T3, 3: T4, 4: T5, 5: T6, 6: T7

    if (type === 'long') {
      if (lang === 'vi') {
        if (dayOfWeek === 2 || dayOfWeek === 4) {
          // Thứ 3 & Thứ 5 -> 19:00
          return cfg.long_vi_tue_thu || ['19:00'];
        } else if (dayOfWeek === 6) {
          // Thứ 7 -> 09:30
          return cfg.long_vi_sat || ['09:30'];
        } else {
          // Các ngày còn lại (Thứ 2, Thứ 4, Thứ 6, Chủ Nhật) -> KHÔNG ĐĂNG
          return [];
        }
      } else {
        if (dayOfWeek === 2 || dayOfWeek === 4) {
          // Thứ 3 & Thứ 5 -> 02:00
          return cfg.long_en_tue_thu || ['02:00'];
        } else if (dayOfWeek === 6) {
          // Thứ 7 -> 21:00
          return cfg.long_en_sat || ['21:00'];
        } else {
          // Các ngày còn lại -> KHÔNG ĐĂNG
          return [];
        }
      }
    } else {
      // Shorts
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      if (lang === 'vi') {
        return isWeekend ? (cfg.short_vi_weekend || ['09:00']) : (cfg.short_vi_weekday || ['11:30']);
      } else {
        return isWeekend ? (cfg.short_en_weekend || ['21:00']) : (cfg.short_en_weekday || ['06:00']);
      }
    }
  };

  const [scheduleConfig, setScheduleConfig] = useState<CustomScheduleConfig>(DEFAULT_SCHEDULE_CONFIG);
  const [showConfigModal, setShowConfigModal] = useState<boolean>(false);
  const [tempConfig, setTempConfig] = useState<CustomScheduleConfig>(DEFAULT_SCHEDULE_CONFIG);
  const [addHour, setAddHour] = useState<string>('06');
  const [addMinute, setAddMinute] = useState<string>('00');
  const [activeModalStream, setActiveModalStream] = useState<'short_vi' | 'short_en' | 'long_vi' | 'long_en'>('short_vi');

  useEffect(() => {
    try {
      const saved = localStorage.getItem("vutru_ai_schedule_config_v2");
      if (saved) {
        const parsed = JSON.parse(saved);
        setScheduleConfig(parsed);
        setTempConfig(parsed);
      }
    } catch (e) {}
  }, []);

  const [history, setHistory] = useState<(HistoryItem & { description?: string })[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [weekBase, setWeekBase] = useState<Date>(new Date());
  
  // UI State matching the reference image
  const [videoTypeFilter, setVideoTypeFilter] = useState<'short' | 'long'>('short');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [schedules, setSchedules] = useState<Record<string, PublishSchedule>>({});
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>('');

  // 🔄 Quy tắc sắp xếp Playlist theo luồng video (Áp dụng cho TẤT CẢ tài khoản Google YouTube):
  // - Mode Shorts: Đảo ngược danh sách phát (reverse) và mặc định chọn phần tử đầu tiên của danh sách đảo ngược.
  // - Mode Video Dài: Giữ nguyên thứ tự danh sách phát và mặc định chọn phần tử đầu tiên của danh sách gốc.
  const orderedPlaylists = useMemo(() => {
    if (!playlists || playlists.length === 0) return [];
    return videoTypeFilter === 'short' ? [...playlists].reverse() : [...playlists];
  }, [playlists, videoTypeFilter]);

  useEffect(() => {
    if (orderedPlaylists.length > 0) {
      setSelectedPlaylistId(orderedPlaylists[0].id);
    } else {
      setSelectedPlaylistId('');
    }
  }, [orderedPlaylists]);  
  const toast = useToast();

  const [channelVideos, setChannelVideos] = useState<any[]>([]);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      // 1. Tải dữ liệu local (history + auth)
      const [resHistory, resAuth] = await Promise.all([
        fetch('/api/youtube?action=history'),
        fetch('/api/youtube?action=authStatus')
      ]);
      const data = await resHistory.json();
      const authData = await resAuth.json();
      
      setIsAuthenticated(authData.authenticated);

      if (data.success && data.history) {
        setHistory(data.history);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }

    // 2. Tải dữ liệu kênh YouTube (Uploads & Playlists) chạy ngầm để lấy số lượng video rải lịch
    try {
      const [resUploads, resPlaylists] = await Promise.all([
        fetch('/api/youtube?action=uploads').catch(() => ({ json: () => ({ list: [] }) } as any)),
        fetch('/api/youtube?action=playlists').catch(() => ({ json: () => ({ playlists: [] }) } as any))
      ]);
      const uploadData = await resUploads.json();
      const playlistsData = await resPlaylists.json();

      if (playlistsData.success && playlistsData.playlists) {
        setPlaylists(playlistsData.playlists);
      }

      if (uploadData.success && uploadData.list) {
        setChannelVideos(uploadData.list);
      }
    } catch (e) {
      console.error('Lỗi tải dữ liệu YouTube ngầm:', e);
    }
  };

  const hasFetchedRef = useRef(false);

  useEffect(() => {
    if (!isActive) return;
    // Chỉ fetch lần đầu khi tab YouTube được kích hoạt
    if (!hasFetchedRef.current) {
      hasFetchedRef.current = true;
      fetchHistory();
    }
  }, [isActive]);

  const handleUpload = async (id: string, skipFetch: boolean = false) => {
    setUploadingId(id);
    
    // Construct publishAt if scheduled (Chỉ lên lịch khi thời gian ở tương lai)
    const sched = schedules[id];
    let publishAt = undefined;
    if (sched && sched.date && sched.hour && sched.minute) {
      // Must be RFC3339 format. Local time to UTC.
      const localDate = new Date(`${sched.date}T${sched.hour}:${sched.minute}:00`);
      if (localDate > new Date()) {
        publishAt = localDate.toISOString();
      }
    }

    try {
      const res = await fetch('/api/youtube/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ historyId: id, publishAt, playlistId: selectedPlaylistId }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Upload thành công', `Video ID: ${data.videoId}`);
        if (data.thumbnailError) {
          toast.error('⚠️ Thumbnail không gắn được', data.thumbnailError);
        }
        const newStatus = publishAt ? 'scheduled' : 'published';
        setHistory(prev => prev.map(item => 
          item.id === id ? { ...item, youtube_status: newStatus, youtube_video_id: data.videoId } : item
        ));
        // Không cần gọi fetchHistory() — optimistic update đã đủ
      } else {
        toast.error('Upload lỗi', data.error || 'Unknown error');
      }
    } catch (e: any) {
      toast.error('Lỗi', e.message);
    } finally {
      setUploadingId(null);
    }
  };

  const handleBatchUpload = async () => {
    // Đảm bảo chỉ chọn và đăng các bài thuộc đúng luồng option đang chọn
    const validSelectedIds = selectedIds.filter(id => {
      const item = history.find(h => h.id === id);
      if (!item) return false;
      const matchesType = item.type === videoTypeFilter;
      const matchesLang = getItemLang(item) === languageFilter;
      const isUnpublished = item.youtube_status !== 'published' && item.youtube_status !== 'scheduled';
      return matchesType && matchesLang && isUnpublished;
    });

    if (validSelectedIds.length === 0) {
      toast.error('Lỗi', `Chưa chọn video nào để đăng luồng ${videoTypeFilter === 'short' ? 'Shorts' : 'Video Dài'} ${languageFilter === 'vi' ? 'Tiếng Việt' : 'Tiếng Anh'}!`);
      return;
    }
    
    // Sắp xếp các video đã chọn theo thứ tự thời gian đặt lịch từ sớm nhất đến muộn nhất
    const sortedIds = [...validSelectedIds].sort((a, b) => {
      const schedA = schedules[a];
      const schedB = schedules[b];
      const timeA = schedA?.date ? new Date(`${schedA.date}T${schedA.hour || '00'}:${schedA.minute || '00'}:00`).getTime() : 0;
      const timeB = schedB?.date ? new Date(`${schedB.date}T${schedB.hour || '00'}:${schedB.minute || '00'}:00`).getTime() : 0;
      return timeA - timeB;
    });

    for (const id of sortedIds) {
      setUploadingId(id);
      
      const sched = schedules[id];
      let publishAt = undefined;
      if (sched && sched.date && sched.hour && sched.minute) {
        const localDate = new Date(`${sched.date}T${sched.hour}:${sched.minute}:00`);
        if (localDate > new Date()) {
          publishAt = localDate.toISOString();
        }
      }

      try {
        const res = await fetch('/api/youtube/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ historyId: id, publishAt, playlistId: selectedPlaylistId }),
        });
        const data = await res.json();
        if (data.success) {
          toast.success('Upload thành công', `Video ID: ${data.videoId}`);
          if (data.thumbnailError) {
            toast.error('⚠️ Thumbnail không gắn được', data.thumbnailError);
          }
          const newStatus = publishAt ? 'scheduled' : 'published';
          setHistory(prev => prev.map(item => 
            item.id === id ? { ...item, youtube_status: newStatus, youtube_video_id: data.videoId } : item
          ));
        } else {
          toast.error('Upload lỗi', data.error || 'Unknown error');
        }
      } catch (e: any) {
        toast.error('Lỗi', e.message);
      }
    }

    setUploadingId(null);
    // Không cần fetchHistory() — mỗi video đã được optimistic update trong loop
    setSelectedIds([]);
  };

  const isVietnameseText = (text: string) => {
    return /[àáảãạâầấẩẫậăằắẳẵặđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/i.test(text);
  };

  const getItemLang = (item: any) => {
    if (item.language) return item.language;
    return isVietnameseText(item.title || '') ? 'vi' : 'en';
  };

  const [languageFilter, setLanguageFilter] = useState<'vi' | 'en'>('vi');
  const [topicFilter, setTopicFilter] = useState<string>('');

  // Filtered Table Data (Bảng bài viết web local: Lọc độc lập theo Ngôn ngữ & Shorts/Long)
  const filteredTableData = useMemo(() => {
    const list = history.filter(item => {
      const matchesType = item.type === videoTypeFilter;
      const matchesLang = getItemLang(item) === languageFilter;
      const matchesTopic = !topicFilter || item.topicKey === topicFilter || item.folder === topicFilter;
      return matchesType && matchesLang && matchesTopic;
    });

    return [...list].sort((a, b) => {
      const aPending = a.youtube_status !== 'published';
      const bPending = b.youtube_status !== 'published';

      // 1. Ưu tiên các bài CHƯA ĐĂNG xếp lên đầu tiên
      if (aPending && !bPending) return -1;
      if (!aPending && bPending) return 1;

      // 2. Nếu cùng trạng thái: Shorts xếp xuôi theo thời gian, Long xếp ngược lại
      if (videoTypeFilter === 'short') {
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      } else {
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      }
    });
  }, [history, videoTypeFilter, languageFilter, topicFilter]);

  // Danh sách chủ đề duy nhất từ dữ liệu thực (theo luồng đang chọn)
  // Nhóm theo keyword[0] từ metadata — nhiều bài cùng keyword sẽ vào 1 nhóm
  const availableTopics = useMemo(() => {
    const map = new Map<string, string>(); // keyword[0] -> displayLabel
    history.forEach(item => {
      const matchesType = item.type === videoTypeFilter;
      const matchesLang = getItemLang(item) === languageFilter;
      if (matchesType && matchesLang) {
        const topicKey = item.topicKey || item.folder;
        const topicLabel = item.topicLabel || item.folder.replace(/_/g, ' ');
        if (!map.has(topicKey)) {
          map.set(topicKey, topicLabel);
        }
      }
    });
    return Array.from(map.entries())
      .sort((a, b) => a[1].localeCompare(b[1], 'vi'))
      .map(([key, label]) => ({ key, label }));
  }, [history, videoTypeFilter, languageFilter]);

  // Filtered Calendar Data (Tất cả video thực tế từ kênh YouTube + Bài viết web CHƯA ĐĂNG thuộc ngôn ngữ và loại đang chọn)
  const filteredCalendarData = useMemo(() => {
    // 1. Chỉ lấy bài viết ở web CHƯA ĐĂNG (pending) khớp cả Loại và Ngôn ngữ đang chọn
    const webItems = history.filter(item => {
      const matchesType = item.type === videoTypeFilter;
      const matchesLang = getItemLang(item) === languageFilter;
      const isPending = item.youtube_status !== 'published' && item.youtube_status !== 'scheduled';
      return matchesType && matchesLang && isPending;
    });

    // 2. Hiển thị tất cả video thực tế từ kênh YouTube kết nối (Luôn luôn hiển thị theo kênh YouTube đã chọn)
    const ytItems = channelVideos
      .filter(v => (videoTypeFilter === 'short' ? Boolean(v.isShort) : !Boolean(v.isShort)))
      .map(v => ({
        id: `yt-${v.id}`,
        title: v.title,
        date: v.publishAt || new Date().toISOString(),
        type: videoTypeFilter,
        youtube_status: v.privacy === 'private' ? 'scheduled' : 'published',
        isYouTubeNative: true,
      }));

    return [...webItems, ...ytItems];
  }, [history, channelVideos, videoTypeFilter, languageFilter]);

  const formatLocalDate = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Set default schedules for new items based on current time
  const computeGapFilling = (items: typeof history, currentType: 'short' | 'long', currentLang: 'vi' | 'en') => {
    const newSchedules: Record<string, PublishSchedule> = {};
    const now = new Date();
    
    // Sort items to schedule: oldest date first (Chỉ xếp lịch bài viết web khớp Loại và Ngôn ngữ đang chọn)
    const itemsToSchedule = items
      .filter(i => {
        const matchesType = i.type === currentType;
        const matchesLang = getItemLang(i) === currentLang;
        const isPending = i.youtube_status !== 'published' && i.youtube_status !== 'scheduled';
        return !i.isYouTubeNative && matchesType && matchesLang && isPending;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const videosPerDate: Record<string, number> = {};
    const takenSlots = new Set<string>();
    
    // Initialize taken slots and counts from real YouTube channel videos (Luôn lấy toàn bộ theo loại Shorts/Long)
    channelVideos.forEach(v => {
      const isShort = Boolean(v.isShort);
      const matchesType = currentType === 'short' ? isShort : !isShort;
      if (matchesType) {
        if (v.publishAt) {
          try {
            const d = new Date(v.publishAt);
            const dateStr = formatLocalDate(d);
            videosPerDate[dateStr] = (videosPerDate[dateStr] || 0) + 1;
            const hour = String(d.getHours()).padStart(2, '0');
            const minute = String(d.getMinutes()).padStart(2, '0');
            takenSlots.add(`${dateStr} ${hour}:${minute}`);
          } catch (e) {}
        } else if (v.dateStr) {
          videosPerDate[v.dateStr] = (videosPerDate[v.dateStr] || 0) + 1;
        }
      }
    });

    // Initialize taken slots and counts from existing web items (khớp Loại và Ngôn ngữ đang chọn)
    items.forEach(item => {
      const matchesType = item.type === currentType;
      const matchesLang = getItemLang(item) === languageFilter;
      if ((item.youtube_status === 'published' || item.youtube_status === 'scheduled') && matchesType && matchesLang) {
         try {
           const d = new Date(item.date);
           const dateStr = formatLocalDate(d);
           videosPerDate[dateStr] = (videosPerDate[dateStr] || 0) + 1;
           
           const hour = String(d.getHours()).padStart(2, '0');
           const minute = String(d.getMinutes()).padStart(2, '0');
           takenSlots.add(`${dateStr} ${hour}:${minute}`);

           if (item.youtube_status === 'scheduled') {
             newSchedules[item.id] = { date: dateStr, hour, minute };
           }
         } catch (e) {}
      }
    });

    let currentDate = new Date(); // Bắt đầu rải lịch ngay từ NGÀY HIỆN TẠI
    
    for (const item of itemsToSchedule) {
       let scheduled = false;
       let searchDate = new Date(currentDate);
       let attempts = 0;

       while (!scheduled && attempts < 365) {
          attempts++;
          const dateStr = formatLocalDate(searchDate);
          const existingCount = videosPerDate[dateStr] || 0;
          const availableTimes = getAvailableTimesForDate(scheduleConfig, item.type, getItemLang(item), searchDate);
          const maxPerDay = availableTimes.length;
          
          if (existingCount < maxPerDay && availableTimes.length > 0) {
             for (const time of availableTimes) {
                const slotKey = `${dateStr} ${time}`;
                const slotDateTime = new Date(`${dateStr}T${time}:00`);
                
                // Nếu khung giờ này trong ngày hôm nay đã trôi qua thì bỏ qua
                if (slotDateTime <= now) {
                  continue;
                }

                if (!takenSlots.has(slotKey)) {
                   takenSlots.add(slotKey);
                   videosPerDate[dateStr] = (videosPerDate[dateStr] || 0) + 1;
                   
                   const [hour, minute] = time.split(':');
                   newSchedules[item.id] = { date: dateStr, hour, minute };
                   scheduled = true;
                   
                   if (videosPerDate[dateStr] >= maxPerDay) {
                      currentDate = new Date(searchDate);
                      currentDate.setDate(currentDate.getDate() + 1);
                   }
                   break;
                }
             }
          }
          
          if (!scheduled) {
             searchDate.setDate(searchDate.getDate() + 1);
          }
       }
    }
    
    return newSchedules;
  };

  // Auto fill Gap-Filling schedules whenever history, videoTypeFilter, or languageFilter changes
  useEffect(() => {
    setSelectedIds([]);
    if (history.length > 0) {
      const autoFilled = computeGapFilling(history, videoTypeFilter, languageFilter);
      setSchedules(autoFilled);
    }
  }, [history, videoTypeFilter, languageFilter, channelVideos.length, scheduleConfig]);

  const applyGapFilling = () => {
    const autoFilled = computeGapFilling(history, videoTypeFilter, languageFilter);
    setSchedules(autoFilled);
    toast.success('Thành công', 'Đã tự động xếp lịch (Gap-Filling) cho các video!');
  };

  // --- Calendar Logic ---
  const getDaysOfWeek = (baseDate: Date) => {
    const temp = new Date(baseDate);
    const day = temp.getDay();
    const diff = temp.getDate() - day + (day === 0 ? -6 : 1); // Monday as first day
    const startOfWeek = new Date(temp.setDate(diff));
    
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      return d;
    });
  };

  const daysOfWeek = useMemo(() => getDaysOfWeek(weekBase), [weekBase]);
  
  const formatDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [calendarViewMode, setCalendarViewMode] = useState<'week' | 'month' | 'year'>('week');

  const handlePrevPeriod = () => {
    const d = new Date(weekBase);
    if (calendarViewMode === 'week') {
      d.setDate(d.getDate() - 7);
    } else if (calendarViewMode === 'month') {
      d.setMonth(d.getMonth() - 1);
    } else {
      d.setFullYear(d.getFullYear() - 1);
    }
    setWeekBase(d);
  };

  const handleNextPeriod = () => {
    const d = new Date(weekBase);
    if (calendarViewMode === 'week') {
      d.setDate(d.getDate() + 7);
    } else if (calendarViewMode === 'month') {
      d.setMonth(d.getMonth() + 1);
    } else {
      d.setFullYear(d.getFullYear() + 1);
    }
    setWeekBase(d);
  };

  const dayLabels = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
  const selectedDateStr = formatDate(selectedDate);
  const todayStr = formatDate(new Date());
  const isCurrentWeek = daysOfWeek.some(d => formatDate(d) === todayStr);

  const getItemPublishDate = (item: any) => {
    if (item.youtube_status === 'published' || item.isYouTubeNative) {
      const d = new Date(item.date);
      return formatLocalDate(d);
    }
    if (schedules[item.id]?.date) {
      return schedules[item.id].date;
    }
    const d = new Date(item.date);
    return formatLocalDate(d);
  };

  const getItemPublishTime = (item: any) => {
    if (item.youtube_status === 'published' || item.isYouTubeNative) {
      const d = new Date(item.date);
      const hour = String(d.getHours()).padStart(2, '0');
      const minute = String(d.getMinutes()).padStart(2, '0');
      return `${hour}:${minute}`;
    }
    if (schedules[item.id]?.hour && schedules[item.id]?.minute) {
      return `${schedules[item.id].hour}:${schedules[item.id].minute}`;
    }
    const d = new Date(item.date);
    const hour = String(d.getHours()).padStart(2, '0');
    const minute = String(d.getMinutes()).padStart(2, '0');
    return `${hour}:${minute}`;
  };

  // Days in month calculation for Month View
  const daysInMonth = useMemo(() => {
    const year = weekBase.getFullYear();
    const month = weekBase.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    const dayOfWeek = firstDay.getDay();
    const offset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    
    const days: (Date | null)[] = Array(offset).fill(null);
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(year, month, i));
    }
    return days;
  }, [weekBase]);

  // Video counts per month for Year View
  const videoCountsPerMonth = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredCalendarData.forEach(item => {
      const dateStr = getItemPublishDate(item);
      const monthStr = dateStr.slice(0, 7);
      counts[monthStr] = (counts[monthStr] || 0) + 1;
    });
    return counts;
  }, [filteredCalendarData, schedules]);

  // Count videos per day
  const videoCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredCalendarData.forEach(item => {
      const dateStr = getItemPublishDate(item);
      counts[dateStr] = (counts[dateStr] || 0) + 1;
    });
    return counts;
  }, [filteredCalendarData, schedules]);

  // Status dots per day for Calendar View
  const dayStatusDots = useMemo(() => {
    const map: Record<string, { hasPublished: boolean; hasScheduled: boolean; hasPending: boolean }> = {};

    filteredCalendarData.forEach(item => {
      const dateStr = getItemPublishDate(item);
      if (!map[dateStr]) {
        map[dateStr] = { hasPublished: false, hasScheduled: false, hasPending: false };
      }
      if (item.youtube_status === 'published') {
        map[dateStr].hasPublished = true;
      } else if (item.youtube_status === 'scheduled') {
        map[dateStr].hasScheduled = true;
      } else {
        map[dateStr].hasPending = true;
      }
    });

    return map;
  }, [filteredCalendarData, schedules]);

  // Videos for selected date in Calendar
  const videosForSelectedDate = useMemo(() => {
    return filteredCalendarData
      .filter(item => getItemPublishDate(item) === selectedDateStr)
      .sort((a, b) => getItemPublishTime(a).localeCompare(getItemPublishTime(b)));
  }, [filteredCalendarData, selectedDateStr, schedules]);

  const handleUpdateStatus = async (id: string, newStatus: 'pending' | 'published' | 'scheduled') => {
    try {
      const res = await fetch('/api/youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'updateStatus', id, status: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Đã cập nhật', newStatus === 'pending' ? 'Đã chuyển thành Chưa đăng' : 'Đã chuyển thành Đã đăng');
        // Optimistic update — không cần reload toàn bộ history
        setHistory(prev => prev.map(h =>
          h.id === id ? { ...h, youtube_status: newStatus, youtube_video_id: newStatus === 'pending' ? undefined : h.youtube_video_id } : h
        ));
      } else {
        toast.error('Lỗi', data.error || 'Cập nhật thất bại');
      }
    } catch (e: any) {
      toast.error('Lỗi', e.message);
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      // Chỉ chọn các bài CHƯA ĐĂNG / CHƯA LÊN LỊCH VÀ ĐÃ CÓ FILE VIDEO
      setSelectedIds(filteredTableData.filter(item => item.youtube_status !== 'published' && item.youtube_status !== 'scheduled' && Boolean((item as any).hasVideo)).map(item => item.id));
    } else {
      setSelectedIds([]);
    }
  };

  const toggleSelect = (id: string) => {
    const item = history.find(h => h.id === id);
    if (item && (item.youtube_status === 'published' || item.youtube_status === 'scheduled' || !(item as any).hasVideo)) return; // Cấm chọn bài đã đăng, đã lên lịch hoặc chưa có video
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  return (
    <div style={{ backgroundColor: '#f8fafc', padding: '24px', fontFamily: 'system-ui, sans-serif', minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Top Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', padding: '16px 24px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            onClick={() => { setVideoTypeFilter('short'); setTopicFilter(''); }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '24px', border: videoTypeFilter === 'short' ? '1px solid #fecaca' : '1px solid #e2e8f0', backgroundColor: videoTypeFilter === 'short' ? '#fef2f2' : '#fff', color: videoTypeFilter === 'short' ? '#ef4444' : '#64748b', fontWeight: 600, cursor: 'pointer' }}
          >
            ⚡ Shorts
          </button>
          <button 
            onClick={() => { setVideoTypeFilter('long'); setTopicFilter(''); }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '24px', border: videoTypeFilter === 'long' ? '1px solid #bfdbfe' : '1px solid #e2e8f0', backgroundColor: videoTypeFilter === 'long' ? '#eff6ff' : '#fff', color: videoTypeFilter === 'long' ? '#3b82f6' : '#64748b', fontWeight: 600, cursor: 'pointer' }}
          >
            🎬 Video Dài
          </button>

          <div style={{ width: '1px', height: '24px', backgroundColor: '#e2e8f0', margin: '0 4px' }}></div>

          <button 
            onClick={() => { setLanguageFilter('vi'); setTopicFilter(''); }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '24px', border: languageFilter === 'vi' ? '1px solid #86efac' : '1px solid #e2e8f0', backgroundColor: languageFilter === 'vi' ? '#f0fdf4' : '#fff', color: languageFilter === 'vi' ? '#16a34a' : '#64748b', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
          >
            🇻🇳 Tiếng Việt
          </button>
          <button 
            onClick={() => { setLanguageFilter('en'); setTopicFilter(''); }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '24px', border: languageFilter === 'en' ? '1px solid #c084fc' : '1px solid #e2e8f0', backgroundColor: languageFilter === 'en' ? '#faf5ff' : '#fff', color: languageFilter === 'en' ? '#9333ea' : '#64748b', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
          >
            🇬🇧 Tiếng Anh
          </button>
          {!isAuthenticated ? (
            <button 
              onClick={() => window.location.href = '/api/youtube/auth'}
              style={{ marginLeft: '16px', padding: '8px 16px', borderRadius: '24px', border: '1px solid #4ade80', backgroundColor: '#f0fdf4', color: '#16a34a', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#dcfce7'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#f0fdf4'}
            >
              Đăng nhập Google/YouTube
            </button>
          ) : (
            <button 
              onClick={() => window.location.href = '/api/youtube/logout'}
              style={{ marginLeft: '16px', padding: '8px 16px', borderRadius: '24px', border: '1px solid #fecaca', backgroundColor: '#fef2f2', color: '#ef4444', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#fee2e2'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#fef2f2'}
            >
              Đổi tài khoản Google
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button onClick={fetchHistory} style={{ width: '40px', height: '40px', borderRadius: '50%', border: '1px solid #e2e8f0', backgroundColor: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            🔄
          </button>
          <button 
            onClick={handleBatchUpload}
            disabled={Boolean(uploadingId)}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px', 
              padding: '10px 24px', 
              borderRadius: '24px', 
              border: 'none', 
              backgroundColor: uploadingId ? '#a78bfa' : '#8b5cf6', 
              color: '#fff', 
              fontWeight: 'bold', 
              cursor: uploadingId ? 'not-allowed' : 'pointer', 
              boxShadow: '0 4px 6px rgba(139, 92, 246, 0.2)',
              opacity: uploadingId ? 0.75 : 1,
              transition: 'all 0.2s'
            }}
          >
            {uploadingId ? (
              <>
                <span style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></span>
                ⏳ Đang xử lý đăng... ({selectedIds.length})
              </>
            ) : (
              <>▶ Đăng {videoTypeFilter === 'short' ? 'Shorts' : 'Video Dài'} {languageFilter === 'vi' ? 'Tiếng Việt' : 'Tiếng Anh'} ({selectedIds.length})</>
            )}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 440px', gap: '24px', alignItems: 'start' }}>
        
        {/* Left Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Gap-Filling Rules Panel */}
          <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="checkbox" defaultChecked style={{ width: '18px', height: '18px', accentColor: '#3b82f6' }} />
                <span style={{ fontWeight: 'bold', color: '#1e293b' }}>Lên lịch phát sóng công khai trên YouTube {videoTypeFilter === 'short' ? 'Shorts' : 'Video Dài'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#64748b' }}>
                Danh sách phát:
                <select 
                  value={selectedPlaylistId}
                  onChange={(e) => setSelectedPlaylistId(e.target.value)}
                  style={{ padding: '6px 12px', borderRadius: '24px', border: '1px solid #e2e8f0', outline: 'none', maxWidth: '200px' }}
                >
                  <option value="">-- Không chọn --</option>
                  {orderedPlaylists.map(p => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ backgroundColor: '#faf5ff', border: '1px solid #f3e8ff', borderRadius: '12px', padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: '#7e22ce', fontWeight: 'bold' }}>
                🗓️ Quy tắc Gap-Filling lịch đăng {videoTypeFilter === 'short' ? 'Shorts' : 'Video Dài'} ({languageFilter === 'vi' ? '🇻🇳 Tiếng Việt' : '🇬🇧 Tiếng Anh'}):
              </div>
              {(() => {
                if (videoTypeFilter === 'short') {
                  const weekdayTimes = languageFilter === 'vi' ? (scheduleConfig.short_vi_weekday || ['11:30']) : (scheduleConfig.short_en_weekday || ['06:00']);
                  const weekendTimes = languageFilter === 'vi' ? (scheduleConfig.short_vi_weekend || ['09:00']) : (scheduleConfig.short_en_weekend || ['21:00']);
                  return (
                    <ul style={{ margin: 0, paddingLeft: '24px', color: '#334155', lineHeight: '1.8', fontSize: '14px' }}>
                      <li><strong>Thứ 2 - Thứ 6:</strong> Tối đa {weekdayTimes.length} video/ngày lúc <strong>{weekdayTimes.length > 0 ? weekdayTimes.join(', ') : 'Không đăng'}</strong>.</li>
                      <li><strong>Thứ 7 & Chủ Nhật:</strong> Tối đa {weekendTimes.length} video/ngày lúc <strong>{weekendTimes.length > 0 ? weekendTimes.join(', ') : 'Không đăng'}</strong>.</li>
                    </ul>
                  );
                } else {
                  const tueThuTimes = languageFilter === 'vi' ? (scheduleConfig.long_vi_tue_thu || ['19:00']) : (scheduleConfig.long_en_tue_thu || ['02:00']);
                  const satTimes = languageFilter === 'vi' ? (scheduleConfig.long_vi_sat || ['09:30']) : (scheduleConfig.long_en_sat || ['21:00']);
                  return (
                    <ul style={{ margin: 0, paddingLeft: '24px', color: '#334155', lineHeight: '1.8', fontSize: '14px' }}>
                      <li><strong>Thứ 3 & Thứ 5:</strong> Đăng 1 video/ngày lúc <strong>{tueThuTimes.join(', ')}</strong>.</li>
                      <li><strong>Thứ 7:</strong> Đăng 1 video/ngày lúc <strong>{satTimes.join(', ')}</strong>.</li>
                      <li style={{ color: '#ef4444' }}><strong>Thứ 2, Thứ 4, Thứ 6, Chủ Nhật:</strong> ❌ <strong>KHÔNG ĐĂNG</strong> (Tự động rải lịch bỏ qua).</li>
                    </ul>
                  );
                }
              })()}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px', gap: '12px' }}>
                <button 
                  onClick={() => {
                    const currentKey = `${videoTypeFilter}_${languageFilter}` as 'short_vi' | 'short_en' | 'long_vi' | 'long_en';
                    setActiveModalStream(currentKey);
                    setTempConfig({ ...scheduleConfig });
                    setShowConfigModal(true);
                  }}
                  style={{ background: 'none', border: 'none', color: '#64748b', fontWeight: 600, fontSize: '14px', cursor: 'pointer' }}
                >
                  ⚙ Tùy chỉnh khung giờ đăng
                </button>
                <button 
                  onClick={applyGapFilling}
                  style={{ padding: '6px 16px', borderRadius: '24px', border: 'none', backgroundColor: '#3b82f6', color: '#fff', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}
                >
                  ✨ Tự động xếp lịch
                </button>
              </div>
            </div>
          </div>

          {/* Table Panel */}
          <div style={{ backgroundColor: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {(() => {
                  const selectableItems = filteredTableData.filter(item => item.youtube_status !== 'published' && Boolean((item as any).hasVideo));
                  return (
                    <input 
                      type="checkbox" 
                      onChange={handleSelectAll} 
                      checked={selectedIds.length === selectableItems.length && selectableItems.length > 0} 
                      style={{ width: '16px', height: '16px' }} 
                    />
                  );
                })()}
                <span style={{ fontSize: '14px', color: '#64748b', fontWeight: 600 }}>Chọn tất cả</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#64748b' }}>
                Chủ đề:
                <select 
                  value={topicFilter}
                  onChange={e => setTopicFilter(e.target.value)}
                  style={{ padding: '6px 12px', borderRadius: '24px', border: '1px solid #e2e8f0', outline: 'none', maxWidth: '260px' }}
                >
                  <option value="">Tất cả ({filteredTableData.length + (topicFilter ? availableTopics.length : 0)} chủ đề)</option>
                  {availableTopics.map(({ key, label }) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
                {topicFilter && (
                  <button
                    onClick={() => setTopicFilter('')}
                    title="Xóa bộ lọc chủ đề"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '16px', lineHeight: 1, padding: '0 2px' }}
                  >×</button>
                )}
              </div>
            </div>
            
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ color: '#94a3b8', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                  <th style={{ padding: '16px', width: '40px' }}></th>
                  <th style={{ padding: '16px', width: '60px' }}>Hàng</th>
                  <th style={{ padding: '16px' }}>Tiêu đề</th>
                  <th style={{ padding: '16px', width: '80px', textAlign: 'center' }}>Video</th>
                  <th style={{ padding: '16px', width: '240px' }}>Lịch đăng</th>
                  <th style={{ padding: '16px', width: '140px', textAlign: 'center' }}>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {filteredTableData.map((indexItem, index) => {
                  const item = indexItem as any;
                  const isChecked = selectedIds.includes(item.id);
                  const itemDate = item.date ? new Date(item.date) : new Date();
                  const fallbackDate = formatLocalDate(itemDate);
                  const fallbackHour = String(itemDate.getHours()).padStart(2, '0');
                  const fallbackMinute = String(itemDate.getMinutes()).padStart(2, '0');

                  const sched = schedules[item.id] || {
                    date: fallbackDate,
                    hour: fallbackHour,
                    minute: fallbackMinute,
                  };

                  const isRowDisabled = item.youtube_status === 'published' || item.youtube_status === 'scheduled' || !item.hasVideo;

                  return (
                    <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: isChecked ? '#f8fafc' : '#fff' }}>
                      <td style={{ padding: '16px' }}>
                        <input 
                          type="checkbox" 
                          disabled={isRowDisabled} 
                          checked={isChecked} 
                          onChange={() => toggleSelect(item.id)} 
                          style={{ width: '16px', height: '16px', cursor: isRowDisabled ? 'not-allowed' : 'pointer' }} 
                          title={!item.hasVideo ? 'Cần xuất video (.mp4) trong thư mục trước khi chọn đăng YouTube' : item.youtube_status === 'published' ? 'Bài viết đã đăng lên YouTube' : item.youtube_status === 'scheduled' ? 'Bài viết đã lên lịch đăng lên YouTube' : ''}
                        />
                      </td>
                      <td style={{ padding: '16px', color: '#94a3b8' }}>#{index + 1}</td>
                      <td style={{ padding: '16px', fontWeight: 600, color: '#334155', lineHeight: '1.5' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span>{item.title}</span>
                          {(() => {
                            const type = item.type === 'short' ? 'Short' : 'Dài';
                            const lang = getItemLang(item) === 'vi' ? '🇻🇳' : '🇬🇧';
                            const bgColor = item.type === 'short' 
                              ? (getItemLang(item) === 'vi' ? '#fef2f2' : '#faf5ff')
                              : (getItemLang(item) === 'vi' ? '#eff6ff' : '#f0fdf4');
                            const textColor = item.type === 'short'
                              ? (getItemLang(item) === 'vi' ? '#dc2626' : '#9333ea')
                              : (getItemLang(item) === 'vi' ? '#2563eb' : '#16a34a');
                            const borderColor = item.type === 'short'
                              ? (getItemLang(item) === 'vi' ? '#fecaca' : '#e9d5ff')
                              : (getItemLang(item) === 'vi' ? '#bfdbfe' : '#bbf7d0');
                            return (
                              <span 
                                style={{ 
                                  display: 'inline-flex', 
                                  alignItems: 'center', 
                                  gap: '4px', 
                                  padding: '2px 8px', 
                                  borderRadius: '12px', 
                                  fontSize: '11px', 
                                  fontWeight: 700, 
                                  backgroundColor: bgColor, 
                                  color: textColor, 
                                  border: `1px solid ${borderColor}`,
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                {lang} {type}
                              </span>
                            );
                          })()}
                        </div>
                      </td>
                      <td style={{ padding: '16px', textAlign: 'center' }}>
                        {(item as any).hasVideo ? (
                          <div title="Đã có video (.mp4) trong thư mục" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', borderRadius: '50%', backgroundColor: '#d1fae5', color: '#059669', fontWeight: 'bold', fontSize: '13px', border: '1px solid #a7f3d0' }}>
                            ✓
                          </div>
                        ) : (
                          <div title="Chưa xuất video (.mp4) trong thư mục" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', borderRadius: '50%', backgroundColor: '#fee2e2', color: '#dc2626', fontWeight: 'bold', fontSize: '13px', border: '1px solid #fecaca' }}>
                            ✕
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '16px' }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <input 
                            type="date" 
                            value={sched.date}
                            onChange={e => setSchedules(s => ({ ...s, [item.id]: { ...s[item.id], date: e.target.value } }))}
                            style={{ padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: '24px', outline: 'none', color: '#334155' }} 
                          />
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <select 
                              value={sched.hour}
                              onChange={e => setSchedules(s => ({ ...s, [item.id]: { ...s[item.id], hour: e.target.value } }))}
                              style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: '24px', outline: 'none', width: '60px' }}
                            >
                              {Array.from({length: 24}, (_, i) => <option key={i} value={String(i).padStart(2,'0')}>{String(i).padStart(2,'0')}</option>)}
                            </select>
                            <span>:</span>
                            <select 
                              value={sched.minute}
                              onChange={e => setSchedules(s => ({ ...s, [item.id]: { ...s[item.id], minute: e.target.value } }))}
                              style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: '24px', outline: 'none', width: '60px' }}
                            >
                              <option value="00">00</option>
                              <option value="15">15</option>
                              <option value="30">30</option>
                              <option value="45">45</option>
                            </select>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '16px', textAlign: 'center' }}>
                        {uploadingId === item.id ? (
                          /* Đang tải lên — xanh dương */
                          <div 
                            title="Đang tải lên YouTube..."
                            style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}
                          >
                            <div style={{ width: '28px', height: '28px', borderRadius: '50%', border: '2px solid #bfdbfe', backgroundColor: '#eff6ff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span style={{ width: '10px', height: '10px', backgroundColor: '#3b82f6', borderRadius: '50%', animation: 'pulse 1s ease-in-out infinite' }}></span>
                            </div>
                            <span style={{ fontSize: '10px', color: '#3b82f6', fontWeight: 600, whiteSpace: 'nowrap' }}>Đang đăng</span>
                          </div>
                        ) : item.youtube_status === 'published' ? (
                          /* Đã đăng — xanh lá */
                          <button
                            onClick={() => handleUpdateStatus(item.id, 'pending')}
                            title="Đã đăng công khai · Bấm để chuyển thành Chưa đăng"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}
                            onMouseOver={e => (e.currentTarget.style.opacity = '0.75')}
                            onMouseOut={e => (e.currentTarget.style.opacity = '1')}
                          >
                            <div style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid #a7f3d0', backgroundColor: '#ecfdf5', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span style={{ width: '10px', height: '10px', backgroundColor: '#10b981', borderRadius: '50%' }}></span>
                            </div>
                            <span style={{ fontSize: '10px', color: '#10b981', fontWeight: 600, whiteSpace: 'nowrap' }}>Đã đăng</span>
                          </button>
                        ) : item.youtube_status === 'scheduled' ? (
                          /* Đã lên lịch — vàng amber */
                          <button
                            onClick={() => handleUpdateStatus(item.id, 'pending')}
                            title="Đã lên lịch đăng · Bấm để chuyển thành Chưa đăng"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}
                            onMouseOver={e => (e.currentTarget.style.opacity = '0.75')}
                            onMouseOut={e => (e.currentTarget.style.opacity = '1')}
                          >
                            <div style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid #fcd34d', backgroundColor: '#fffbeb', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span style={{ width: '10px', height: '10px', backgroundColor: '#f59e0b', borderRadius: '50%' }}></span>
                            </div>
                            <span style={{ fontSize: '10px', color: '#d97706', fontWeight: 600, whiteSpace: 'nowrap' }}>Đã lên lịch</span>
                          </button>
                        ) : (
                          /* Chưa đăng — xám */
                          <button
                            onClick={() => handleUpdateStatus(item.id, 'published')}
                            title="Chưa đăng · Bấm để đánh dấu Đã đăng thủ công"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}
                            onMouseOver={e => (e.currentTarget.style.opacity = '0.75')}
                            onMouseOut={e => (e.currentTarget.style.opacity = '1')}
                          >
                            <div style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span style={{ width: '10px', height: '10px', backgroundColor: '#94a3b8', borderRadius: '50%' }}></span>
                            </div>
                            <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600, whiteSpace: 'nowrap' }}>Chưa đăng</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

        </div>

        {/* Right Column: Calendar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
              <span style={{ fontSize: '20px', color: '#8b5cf6' }}>🗓️</span>
              <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: '#1e293b', margin: 0 }}>Lịch Kênh Hiện Tại</h2>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <button 
                onClick={() => {
                  const now = new Date();
                  setWeekBase(now);
                  setSelectedDate(now);
                  toast.info('Lịch Kênh', 'Đã quay về ngày hiện tại!');
                }}
                style={{ 
                  padding: '6px 16px', 
                  borderRadius: '24px', 
                  border: '1px solid #c7d2fe', 
                  backgroundColor: '#eef2ff', 
                  color: '#4f46e5', 
                  fontSize: '13px', 
                  fontWeight: 600, 
                  cursor: 'pointer', 
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s' 
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = '#e0e7ff';
                  e.currentTarget.style.borderColor = '#818cf8';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = '#eef2ff';
                  e.currentTarget.style.borderColor = '#c7d2fe';
                }}
                title="Quay về ngày hôm nay"
              >
                <span>📍</span>
                <span>Về hôm nay</span>
              </button>
              <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: '24px', overflow: 'hidden' }}>
                <button 
                  onClick={() => setCalendarViewMode('week')}
                  style={{ padding: '6px 16px', border: 'none', backgroundColor: calendarViewMode === 'week' ? '#6366f1' : '#f8fafc', color: calendarViewMode === 'week' ? '#fff' : '#64748b', fontWeight: 600, fontSize: '13px', borderRight: '1px solid #e2e8f0', cursor: 'pointer' }}
                >
                  Tuần
                </button>
                <button 
                  onClick={() => setCalendarViewMode('month')}
                  style={{ padding: '6px 16px', border: 'none', backgroundColor: calendarViewMode === 'month' ? '#6366f1' : '#f8fafc', color: calendarViewMode === 'month' ? '#fff' : '#64748b', fontWeight: 600, fontSize: '13px', borderRight: '1px solid #e2e8f0', cursor: 'pointer' }}
                >
                  Tháng
                </button>
                <button 
                  onClick={() => setCalendarViewMode('year')}
                  style={{ padding: '6px 16px', border: 'none', backgroundColor: calendarViewMode === 'year' ? '#6366f1' : '#f8fafc', color: calendarViewMode === 'year' ? '#fff' : '#64748b', fontWeight: 500, fontSize: '13px', cursor: 'pointer' }}
                >
                  Năm
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', fontSize: '12px', fontWeight: 600, color: '#64748b' }}>
              <button onClick={handlePrevPeriod} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontWeight: 600, padding: 0, whiteSpace: 'nowrap' }}>
                {calendarViewMode === 'week' ? '< Tuần trước' : calendarViewMode === 'month' ? '< Tháng trước' : '< Năm trước'}
              </button>
              <span style={{ color: '#4f46e5', fontWeight: 700, fontSize: '13px', whiteSpace: 'nowrap' }}>
                {calendarViewMode === 'week' && `Tuần ${daysOfWeek[0].getDate()}/${daysOfWeek[0].getMonth() + 1}${isCurrentWeek ? ' (Hiện tại)' : ''}`}
                {calendarViewMode === 'month' && `Tháng ${weekBase.getMonth() + 1}/${weekBase.getFullYear()}${formatDate(weekBase).slice(0,7) === todayStr.slice(0,7) ? ' (Hiện tại)' : ''}`}
                {calendarViewMode === 'year' && `Năm ${weekBase.getFullYear()}${weekBase.getFullYear() === new Date().getFullYear() ? ' (Hiện tại)' : ''}`}
              </span>
              <button onClick={handleNextPeriod} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4f46e5', fontWeight: 600, padding: 0, whiteSpace: 'nowrap' }}>
                {calendarViewMode === 'week' ? 'Tuần sau >' : calendarViewMode === 'month' ? 'Tháng sau >' : 'Năm sau >'}
              </button>
            </div>

            {/* View Mode: WEEK */}
            {calendarViewMode === 'week' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px', marginBottom: '24px' }}>
                {daysOfWeek.map((day, i) => {
                  const dayStr = formatDate(day);
                  const isSelected = dayStr === selectedDateStr;
                  const isToday = dayStr === todayStr;
                  const count = videoCounts[dayStr] || 0;

                  return (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', color: isToday ? '#2563eb' : '#94a3b8', marginBottom: '8px', fontWeight: isToday ? 'bold' : 600 }}>
                        {dayLabels[i]} {isToday && '•'}
                      </span>
                      <button 
                        onClick={() => setSelectedDate(day)}
                        style={{
                          width: '100%',
                          padding: '12px 0',
                          borderRadius: '16px',
                          border: isSelected 
                            ? (isToday ? '2px solid #3b82f6' : 'none') 
                            : (isToday ? '2px solid #3b82f6' : '1px solid #e2e8f0'),
                          backgroundColor: isSelected ? '#6366f1' : (isToday ? '#eff6ff' : '#fff'),
                          color: isSelected ? '#fff' : (isToday ? '#1d4ed8' : '#1e293b'),
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '2px',
                          transition: 'all 0.2s',
                          position: 'relative',
                          boxShadow: isSelected ? '0 4px 6px rgba(99, 102, 241, 0.3)' : 'none'
                        }}
                        title={isToday ? 'Hôm nay' : ''}
                      >
                        <span style={{ fontSize: '16px', fontWeight: 'bold' }}>{day.getDate()}</span>
                        <span style={{ fontSize: '10px', opacity: isSelected ? 0.9 : 0.7, fontWeight: 600 }}>{count} vd</span>
                        {(() => {
                          const dots = dayStatusDots[dayStr] || { hasPublished: false, hasScheduled: false, hasPending: false };
                          return (
                            <div style={{ display: 'flex', gap: '3px', marginTop: '3px', height: '6px', alignItems: 'center' }}>
                              {dots.hasPublished && <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#10b981' }} title="Có video Đã công khai"></span>}
                              {dots.hasScheduled && <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#f59e0b' }} title="Có video Đã lên lịch"></span>}
                              {dots.hasPending && <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: isSelected ? '#fff' : '#94a3b8' }} title="Có video Chưa đăng"></span>}
                            </div>
                          );
                        })()}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* View Mode: MONTH */}
            {calendarViewMode === 'month' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '24px' }}>
                {dayLabels.map((label, idx) => (
                  <span key={idx} style={{ textAlign: 'center', fontSize: '11px', color: '#94a3b8', marginBottom: '6px', fontWeight: 600 }}>{label}</span>
                ))}
                {daysInMonth.map((day, i) => {
                  if (!day) {
                    return <div key={`empty-${i}`} style={{ height: '42px' }}></div>;
                  }
                  const dateStr = formatDate(day);
                  const isSelected = dateStr === selectedDateStr;
                  const isToday = dateStr === todayStr;
                  const count = videoCounts[dateStr] || 0;

                  return (
                    <button 
                      key={dateStr}
                      onClick={() => setSelectedDate(day)}
                      style={{
                        padding: '6px 2px',
                        borderRadius: '10px',
                        border: isSelected 
                          ? (isToday ? '2px solid #3b82f6' : 'none') 
                          : (isToday ? '2px solid #3b82f6' : '1px solid #e2e8f0'),
                        backgroundColor: isSelected ? '#6366f1' : (isToday ? '#eff6ff' : '#fff'),
                        color: isSelected ? '#fff' : (isToday ? '#1d4ed8' : '#1e293b'),
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '1px',
                        fontSize: '12px',
                        fontWeight: 'bold'
                      }}
                      title={isToday ? 'Hôm nay' : ''}
                    >
                      <span>{day.getDate()}</span>
                      {count > 0 && <span style={{ fontSize: '9px', opacity: 0.85, color: isSelected ? '#fff' : '#3b82f6' }}>{count}vd</span>}
                    </button>
                  );
                })}
              </div>
            )}

            {/* View Mode: YEAR */}
            {calendarViewMode === 'year' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '24px' }}>
                {Array.from({ length: 12 }, (_, i) => {
                  const m = i + 1;
                  const mStr = `${weekBase.getFullYear()}-${String(m).padStart(2, '0')}`;
                  const isCurrentMonth = mStr === todayStr.slice(0, 7);
                  const count = videoCountsPerMonth[mStr] || 0;

                  return (
                    <button
                      key={m}
                      onClick={() => {
                        const newD = new Date(weekBase);
                        newD.setMonth(i);
                        setWeekBase(newD);
                        setCalendarViewMode('month');
                      }}
                      style={{
                        padding: '14px 8px',
                        borderRadius: '12px',
                        border: isCurrentMonth ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                        backgroundColor: isCurrentMonth ? '#eff6ff' : '#f8fafc',
                        color: '#1e293b',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '4px',
                        transition: 'all 0.2s'
                      }}
                      onMouseOver={(e) => e.currentTarget.style.borderColor = '#6366f1'}
                      onMouseOut={(e) => e.currentTarget.style.borderColor = isCurrentMonth ? '#3b82f6' : '#e2e8f0'}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 'bold' }}>Tháng {m}</span>
                        {isCurrentMonth && <span style={{ fontSize: '9px', backgroundColor: '#3b82f6', color: '#fff', padding: '1px 4px', borderRadius: '4px' }}>Hiện tại</span>}
                      </div>
                      <span style={{ fontSize: '11px', color: '#6366f1', fontWeight: 600 }}>{count} video</span>
                    </button>
                  );
                })}
              </div>
            )}

            <div style={{ borderTop: '1px dashed #e2e8f0', paddingTop: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px', color: '#64748b', fontWeight: 600, fontSize: '12px' }}>
                <span>🕒</span>
                <span>CHI TIẾT {selectedDate.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {videosForSelectedDate.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#94a3b8', padding: '10px', fontSize: '13px' }}>Trống</div>
                ) : (
                  videosForSelectedDate.map((item, index) => {
                    const timeDisplay = getItemPublishTime(item);

                    return (
                      <div key={`${item.id}-${index}`} style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        padding: '12px', 
                        borderRadius: '12px', 
                        border: item.type === 'short' ? '1px solid #f3e8ff' : '1px solid #e0f2fe',
                        backgroundColor: item.type === 'short' ? '#faf5ff' : '#f0f9ff'
                      }}>
                        <div style={{ flex: 1, marginRight: '12px', overflow: 'hidden' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                            <span style={{ 
                              padding: '2px 6px', 
                              borderRadius: '4px', 
                              fontSize: '10px', 
                              fontWeight: 'bold',
                              backgroundColor: item.type === 'short' ? '#e9d5ff' : '#bae6fd',
                              color: item.type === 'short' ? '#7e22ce' : '#0369a1'
                            }}>
                              {item.type === 'short' ? '⚡ Shorts' : '🎬 Video Dài'}
                            </span>
                            <h4 style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {item.title}
                            </h4>
                          </div>
                          <div style={{ fontSize: '11px', color: item.youtube_status === 'published' ? '#10b981' : item.youtube_status === 'scheduled' ? '#f59e0b' : '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: item.youtube_status === 'published' ? '#10b981' : item.youtube_status === 'scheduled' ? '#f59e0b' : '#cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span style={{ width: '6px', height: '6px', backgroundColor: '#fff', borderRadius: '50%' }}></span>
                            </span>
                            {item.youtube_status === 'published' ? 'Đã công khai' : item.youtube_status === 'scheduled' ? 'Đã lên lịch' : 'Chưa đăng'}
                          </div>
                        </div>
                        <div style={{ fontWeight: 'bold', color: '#1e293b', fontSize: '13px', whiteSpace: 'nowrap', flexShrink: 0, marginLeft: '8px' }}>
                          {timeDisplay}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>

      {/* MODAL TÙY CHỈNH KHUNG GIỜ ĐĂNG 4 LUỒNG */}
      {showConfigModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '640px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#1e293b', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                ⚙️ Tùy chỉnh Khung Giờ Đăng (4 Luồng Độc Lập)
              </h3>
              <button onClick={() => setShowConfigModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.4rem', color: '#64748b', cursor: 'pointer' }}>×</button>
            </div>

            {/* Stream Selector Tabs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '20px' }}>
              {[
                { key: 'short_vi', label: '⚡ Shorts 🇻🇳 Tiếng Việt', color: '#7e22ce', bg: '#faf5ff' },
                { key: 'short_en', label: '⚡ Shorts 🇬🇧 Tiếng Anh', color: '#6b21a8', bg: '#f3e8ff' },
                { key: 'long_vi', label: '🎬 Video Dài 🇻🇳 Tiếng Việt', color: '#0369a1', bg: '#f0f9ff' },
                { key: 'long_en', label: '🎬 Video Dài 🇬🇧 Tiếng Anh', color: '#0284c7', bg: '#e0f2fe' }
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveModalStream(tab.key as any)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: activeModalStream === tab.key ? `2px solid ${tab.color}` : '1px solid #e2e8f0',
                    backgroundColor: activeModalStream === tab.key ? tab.bg : '#f8fafc',
                    color: activeModalStream === tab.key ? tab.color : '#64748b',
                    fontWeight: activeModalStream === tab.key ? 'bold' : '600',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    textAlign: 'center',
                    boxShadow: activeModalStream === tab.key ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Active Stream Config Panel */}
            {(() => {
              const isShort = activeModalStream.startsWith('short');
              const isVi = activeModalStream.endsWith('vi');
              
              const weekdayKey = isShort 
                ? (`${activeModalStream}_weekday` as keyof CustomScheduleConfig) 
                : (`${activeModalStream}_tue_thu` as keyof CustomScheduleConfig);
              const weekendKey = isShort 
                ? (`${activeModalStream}_weekend` as keyof CustomScheduleConfig) 
                : (`${activeModalStream}_sat` as keyof CustomScheduleConfig);
              
              const currentWeekday: string[] = (tempConfig[weekdayKey] as string[]) || [];
              const currentWeekend: string[] = (tempConfig[weekendKey] as string[]) || [];
              
              const themeColor = isShort ? '#7e22ce' : '#0369a1';
              const themeBg = isShort ? '#faf5ff' : '#f0f9ff';

              const section1Label = isShort ? '📅 Thứ 2 - Thứ 6' : '📅 Thứ 3 & Thứ 5';
              const section2Label = isShort ? '📅 Thứ 7 & Chủ Nhật' : '📅 Thứ 7';

              return (
                <div style={{ backgroundColor: themeBg, padding: '20px', borderRadius: '12px', border: `1px solid ${isShort ? '#f3e8ff' : '#bae6fd'}`, marginBottom: '20px' }}>
                  <h4 style={{ margin: '0 0 16px 0', color: themeColor, fontSize: '1rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {isShort ? '⚡ Shorts' : '🎬 Video Dài'} - {isVi ? '🇻🇳 Tiếng Việt' : '🇬🇧 Tiếng Anh'}
                  </h4>

                  {!isShort && (
                    <div style={{ marginBottom: '16px', padding: '10px 14px', background: '#fff', borderRadius: '8px', border: '1px solid #bae6fd', color: '#0369a1', fontSize: '0.85rem', fontWeight: '500' }}>
                      💡 <strong>Quy tắc rải lịch Video Dài:</strong> Hệ thống chỉ tự động xếp lịch vào <strong>Thứ 3, Thứ 5</strong> và <strong>Thứ 7</strong>. Các ngày còn lại (Thứ 2, 4, 6, Chủ Nhật) tự động <strong>KHÔNG ĐĂNG</strong>.
                    </div>
                  )}

                  {/* Weekday Times */}
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#334155', display: 'block', marginBottom: '8px' }}>
                      {section1Label} (Tối đa {currentWeekday.length} video/ngày):
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                      {currentWeekday.length === 0 ? (
                        <span style={{ fontSize: '0.85rem', color: '#94a3b8', fontStyle: 'italic' }}>Chưa thiết lập khung giờ nào (Không đăng)</span>
                      ) : (
                        currentWeekday.map((time, idx) => (
                          <span key={idx} style={{ backgroundColor: '#fff', border: `1px solid ${themeColor}`, color: themeColor, padding: '4px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                            ⏰ {time}
                            <button 
                              onClick={() => {
                                const updated = currentWeekday.filter((_, i) => i !== idx);
                                setTempConfig(prev => ({ ...prev, [weekdayKey]: updated }));
                              }} 
                              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem', padding: 0 }}
                            >
                              ×
                            </button>
                          </span>
                        ))
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#fff', padding: '4px 8px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                        <select 
                          value={addHour} 
                          onChange={e => setAddHour(e.target.value)}
                          style={{ border: 'none', background: 'none', fontSize: '0.9rem', fontWeight: 'bold', outline: 'none', color: '#1e293b', cursor: 'pointer' }}
                        >
                          {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map(h => (
                            <option key={h} value={h}>{h} Giờ</option>
                          ))}
                        </select>
                        <span style={{ fontWeight: 'bold', color: '#64748b' }}>:</span>
                        <select 
                          value={addMinute} 
                          onChange={e => setAddMinute(e.target.value)}
                          style={{ border: 'none', background: 'none', fontSize: '0.9rem', fontWeight: 'bold', outline: 'none', color: '#1e293b', cursor: 'pointer' }}
                        >
                          {Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0')).map(m => (
                            <option key={m} value={m}>{m} Phút</option>
                          ))}
                        </select>
                      </div>
                      <button 
                        onClick={() => {
                          const timeStr = `${addHour}:${addMinute}`;
                          if (!currentWeekday.includes(timeStr)) {
                            const updated = [...currentWeekday, timeStr].sort();
                            setTempConfig(prev => ({ ...prev, [weekdayKey]: updated }));
                          }
                        }} 
                        style={{ padding: '6px 16px', backgroundColor: themeColor, color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 'bold' }}
                      >
                        + Thêm {addHour}:{addMinute}
                      </button>
                    </div>
                  </div>

                  {/* Weekend Times */}
                  <div>
                    <label style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#334155', display: 'block', marginBottom: '8px' }}>
                      {section2Label} (Tối đa {currentWeekend.length} video/ngày):
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                      {currentWeekend.length === 0 ? (
                        <span style={{ fontSize: '0.85rem', color: '#94a3b8', fontStyle: 'italic' }}>Chưa thiết lập khung giờ nào (Không đăng)</span>
                      ) : (
                        currentWeekend.map((time, idx) => (
                          <span key={idx} style={{ backgroundColor: '#fff', border: `1px solid ${themeColor}`, color: themeColor, padding: '4px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                            ⏰ {time}
                            <button 
                              onClick={() => {
                                const updated = currentWeekend.filter((_, i) => i !== idx);
                                setTempConfig(prev => ({ ...prev, [weekendKey]: updated }));
                              }} 
                              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem', padding: 0 }}
                            >
                              ×
                            </button>
                          </span>
                        ))
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#fff', padding: '4px 8px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                        <select 
                          value={addHour} 
                          onChange={e => setAddHour(e.target.value)}
                          style={{ border: 'none', background: 'none', fontSize: '0.9rem', fontWeight: 'bold', outline: 'none', color: '#1e293b', cursor: 'pointer' }}
                        >
                          {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map(h => (
                            <option key={h} value={h}>{h} Giờ</option>
                          ))}
                        </select>
                        <span style={{ fontWeight: 'bold', color: '#64748b' }}>:</span>
                        <select 
                          value={addMinute} 
                          onChange={e => setAddMinute(e.target.value)}
                          style={{ border: 'none', background: 'none', fontSize: '0.9rem', fontWeight: 'bold', outline: 'none', color: '#1e293b', cursor: 'pointer' }}
                        >
                          {Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0')).map(m => (
                            <option key={m} value={m}>{m} Phút</option>
                          ))}
                        </select>
                      </div>
                      <button 
                        onClick={() => {
                          const timeStr = `${addHour}:${addMinute}`;
                          if (!currentWeekend.includes(timeStr)) {
                            const updated = [...currentWeekend, timeStr].sort();
                            setTempConfig(prev => ({ ...prev, [weekendKey]: updated }));
                          }
                        }} 
                        style={{ padding: '6px 16px', backgroundColor: themeColor, color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 'bold' }}
                      >
                        + Thêm {addHour}:{addMinute}
                      </button>
                    </div>
                  </div>

                </div>
              );
            })()}

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
              <button 
                onClick={() => setTempConfig(DEFAULT_SCHEDULE_CONFIG)}
                style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.85rem', cursor: 'pointer', fontWeight: '600' }}
              >
                🔄 Đặt lại 4 luồng mặc định
              </button>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                  onClick={() => setShowConfigModal(false)}
                  style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#475569', fontWeight: '600', fontSize: '0.85rem', cursor: 'pointer' }}
                >
                  Hủy
                </button>
                <button 
                  onClick={() => {
                    setScheduleConfig(tempConfig);
                    try {
                      localStorage.setItem('vutru_ai_schedule_config_v2', JSON.stringify(tempConfig));
                    } catch (e) {}
                    toast.success('Thành công', 'Đã lưu cấu hình khung giờ 4 luồng độc lập!');
                    setShowConfigModal(false);
                  }}
                  style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', backgroundColor: '#2563eb', color: '#fff', fontWeight: 'bold', fontSize: '0.85rem', cursor: 'pointer' }}
                >
                  💾 Lưu cấu hình 4 luồng
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
        </div>
      </div>
    </div>
  );
}
