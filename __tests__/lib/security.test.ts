/**
 * Security Utilities — Unit Tests
 * Tests path sanitization against common attack vectors.
 */

import path from 'path';

// We need to mock process.cwd() before importing the module
const MOCK_CWD = path.resolve('d:/vutru_ai');
jest.spyOn(process, 'cwd').mockReturnValue(MOCK_CWD);

import { sanitizePath, sanitizeBrowsePath, validateRequired, sanitizeFolderName } from '../../app/lib/security';

describe('sanitizePath', () => {
  it('allows paths within the workspace', () => {
    const testPath = path.join(MOCK_CWD, 'data', 'video_short', 'some_project');
    const result = sanitizePath(testPath);
    expect(result).toBe(testPath);
  });

  it('allows the workspace root itself', () => {
    const result = sanitizePath(MOCK_CWD);
    expect(result).toBe(MOCK_CWD);
  });

  it('rejects paths outside workspace (path traversal)', () => {
    expect(sanitizePath('C:\\Windows\\System32')).toBeNull();
    expect(sanitizePath('/etc/passwd')).toBeNull();
  });

  it('rejects path traversal with ../', () => {
    const attack = path.join(MOCK_CWD, 'data', '..', '..', '..', 'Windows');
    expect(sanitizePath(attack)).toBeNull();
  });

  it('returns null for empty/invalid input', () => {
    expect(sanitizePath('')).toBeNull();
    expect(sanitizePath(null as unknown as string)).toBeNull();
    expect(sanitizePath(undefined as unknown as string)).toBeNull();
  });
});

describe('sanitizeBrowsePath', () => {
  it('allows paths within workspace', () => {
    const testPath = path.join(MOCK_CWD, 'data');
    expect(sanitizeBrowsePath(testPath)).toBe(testPath);
  });

  it('allows Windows drive roots', () => {
    const result = sanitizeBrowsePath('C:\\');
    expect(result).not.toBeNull();
  });
});

describe('validateRequired', () => {
  it('returns empty array when all fields present', () => {
    const body = { topic: 'test', mode: '1', videoType: 'short' };
    const result = validateRequired(body, ['topic', 'mode', 'videoType']);
    expect(result).toEqual([]);
  });

  it('returns missing fields', () => {
    const body = { topic: 'test' };
    const result = validateRequired(body, ['topic', 'mode', 'videoType']);
    expect(result).toEqual(['mode', 'videoType']);
  });

  it('treats empty string as missing', () => {
    const body = { topic: '' };
    const result = validateRequired(body, ['topic']);
    expect(result).toEqual(['topic']);
  });

  it('treats null/undefined as missing', () => {
    const body = { topic: null, mode: undefined };
    const result = validateRequired(body as Record<string, unknown>, ['topic', 'mode']);
    expect(result).toEqual(['topic', 'mode']);
  });
});

describe('sanitizeFolderName', () => {
  it('removes dangerous characters', () => {
    expect(sanitizeFolderName('test<>:"/\\|?*name')).toBe('test_________name');
  });

  it('prevents directory traversal via ..', () => {
    expect(sanitizeFolderName('../../../etc')).toBe('______etc');
  });

  it('handles leading dots', () => {
    expect(sanitizeFolderName('.hidden')).toBe('_hidden');
  });

  it('trims whitespace', () => {
    expect(sanitizeFolderName('  test  ')).toBe('test');
  });
});
