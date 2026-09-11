/**
 * Storage Utilities — Unit Tests
 * Tests atomic JSON read/write operations.
 */

import fs from 'fs';
import path from 'path';
import { readJsonSafe, writeJsonSafe, ensureDir } from '../../app/lib/storage';

const TEST_DIR = path.join(process.cwd(), '__tests__', '.tmp_test_storage');
const TEST_FILE = path.join(TEST_DIR, 'test.json');

beforeEach(() => {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEST_DIR, { recursive: true });
});

afterAll(() => {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

describe('readJsonSafe', () => {
  it('reads valid JSON file', () => {
    const data = { name: 'test', items: [1, 2, 3] };
    fs.writeFileSync(TEST_FILE, JSON.stringify(data), 'utf-8');
    
    const result = readJsonSafe(TEST_FILE, {});
    expect(result).toEqual(data);
  });

  it('returns fallback for non-existent file', () => {
    const fallback = { default: true };
    const result = readJsonSafe('/nonexistent/path.json', fallback);
    expect(result).toEqual(fallback);
  });

  it('returns fallback for invalid JSON', () => {
    fs.writeFileSync(TEST_FILE, 'not valid json {{{', 'utf-8');
    
    const fallback = { error: true };
    const result = readJsonSafe(TEST_FILE, fallback);
    expect(result).toEqual(fallback);
  });

  it('returns fallback for empty file', () => {
    fs.writeFileSync(TEST_FILE, '', 'utf-8');
    
    const fallback: string[] = [];
    const result = readJsonSafe(TEST_FILE, fallback);
    expect(result).toEqual(fallback);
  });
});

describe('writeJsonSafe', () => {
  it('writes JSON data atomically', () => {
    const data = { key: 'value', nested: { a: 1 } };
    writeJsonSafe(TEST_FILE, data);
    
    const raw = fs.readFileSync(TEST_FILE, 'utf-8');
    expect(JSON.parse(raw)).toEqual(data);
  });

  it('creates parent directories if needed', () => {
    const deepFile = path.join(TEST_DIR, 'deep', 'nested', 'file.json');
    writeJsonSafe(deepFile, { deep: true });
    
    expect(fs.existsSync(deepFile)).toBe(true);
    expect(JSON.parse(fs.readFileSync(deepFile, 'utf-8'))).toEqual({ deep: true });
  });

  it('overwrites existing file', () => {
    writeJsonSafe(TEST_FILE, { version: 1 });
    writeJsonSafe(TEST_FILE, { version: 2 });
    
    const result = readJsonSafe(TEST_FILE, {});
    expect(result).toEqual({ version: 2 });
  });

  it('does not leave temp files on success', () => {
    writeJsonSafe(TEST_FILE, { clean: true });
    
    const files = fs.readdirSync(TEST_DIR);
    const tempFiles = files.filter(f => f.startsWith('.tmp_'));
    expect(tempFiles.length).toBe(0);
  });
});

describe('ensureDir', () => {
  it('creates directory if not exists', () => {
    const newDir = path.join(TEST_DIR, 'new_folder');
    ensureDir(newDir);
    expect(fs.existsSync(newDir)).toBe(true);
  });

  it('does not throw if directory exists', () => {
    ensureDir(TEST_DIR);
    expect(fs.existsSync(TEST_DIR)).toBe(true);
  });

  it('creates nested directories', () => {
    const deepDir = path.join(TEST_DIR, 'a', 'b', 'c');
    ensureDir(deepDir);
    expect(fs.existsSync(deepDir)).toBe(true);
  });
});
