'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ScannedFolder } from '../types';
import * as api from '../lib/api';

export interface UseCapcutReturn {
  folderPath: string;
  setFolderPath: (path: string) => void;
  bgmPath: string;
  setBgmPath: (path: string) => void;
  isFolderBrowserOpen: boolean;
  setIsFolderBrowserOpen: (open: boolean) => void;
  isBgmBrowserOpen: boolean;
  setIsBgmBrowserOpen: (open: boolean) => void;
  capcutStatus: string;
  scannedFolders: ScannedFolder[];
  isScanning: boolean;
  scanFolders: () => Promise<void>;
  makeCapcut: () => Promise<boolean>;
  clearStatus: () => void;
}

export function useCapcut(): UseCapcutReturn {
  const [folderPath, setFolderPath] = useState('');
  const [bgmPath, setBgmPath] = useState('');
  const [isFolderBrowserOpen, setIsFolderBrowserOpen] = useState(false);
  const [isBgmBrowserOpen, setIsBgmBrowserOpen] = useState(false);
  const [capcutStatus, setCapcutStatus] = useState('');
  const [scannedFolders, setScannedFolders] = useState<ScannedFolder[]>([]);
  const [isScanning, setIsScanning] = useState(false);

  const scanFolders = useCallback(async () => {
    setIsScanning(true);
    try {
      const folders = await api.scanVideoFolders();
      setScannedFolders(folders);
    } catch (e) {
      console.error('Error scanning folders:', e);
    } finally {
      setIsScanning(false);
    }
  }, []);

  const makeCapcut = async (): Promise<boolean> => {
    if (!folderPath.trim()) {
      setCapcutStatus('❌ Vui lòng nhập đường dẫn thư mục chứa Video!');
      return false;
    }
    setCapcutStatus('⏳ Đang tạo Project CapCut...');
    try {
      const data = await api.makeCapcut(folderPath, bgmPath);
      if (data.status === 'success') {
        setCapcutStatus(`✅ ${data.message}`);
        return true;
      } else {
        setCapcutStatus(`❌ Lỗi: ${data.message}`);
        return false;
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      setCapcutStatus(`❌ Lỗi kết nối: ${msg}`);
      return false;
    }
  };

  const clearStatus = () => setCapcutStatus('');

  return {
    folderPath,
    setFolderPath,
    bgmPath,
    setBgmPath,
    isFolderBrowserOpen,
    setIsFolderBrowserOpen,
    isBgmBrowserOpen,
    setIsBgmBrowserOpen,
    capcutStatus,
    scannedFolders,
    isScanning,
    scanFolders,
    makeCapcut,
    clearStatus,
  };
}
