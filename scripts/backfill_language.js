/**
 * backfill_language.js
 * Backfill 'language' field cho tất cả entries trong history.json
 * Logic: đọc metadata.json từ folder, nếu không có thì detect từ title (ký tự tiếng Việt)
 */
const fs = require('fs');
const path = require('path');

const historyPath = path.join(__dirname, '..', 'database', 'history.json');
const dataRoot = path.join(__dirname, '..', 'data');

function isVietnamese(text) {
  return /[àáảãạâầấẩẫậăằắẳẵặđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/i.test(text);
}

const db = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
let fixed = 0;
let skipped = 0;

db.topics = db.topics.map(item => {
  // Đã có language hợp lệ — bỏ qua
  if (item.language === 'vi' || item.language === 'en') {
    skipped++;
    return item;
  }

  // Thử đọc metadata.json
  const parentDir = item.type === 'long' ? 'video_long' : 'video_short';
  const metaPath = path.join(dataRoot, parentDir, item.folder, 'metadata.json');
  let language = null;

  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      if (meta.language === 'vi' || meta.language === 'en') {
        language = meta.language;
      }
    } catch (e) {}
  }

  // Fallback: detect từ title
  if (!language) {
    language = isVietnamese(item.title || '') ? 'vi' : 'en';
  }

  fixed++;
  console.log(`  [FIX] ${item.folder} → language: "${language}" (was: ${JSON.stringify(item.language)})`);
  return { ...item, language };
});

fs.writeFileSync(historyPath, JSON.stringify(db, null, 2), 'utf8');
console.log(`\n✅ Done: ${fixed} entries fixed, ${skipped} already had language.`);
