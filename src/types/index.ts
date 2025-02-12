import { DirEntry } from "@tauri-apps/plugin-fs";

export interface SubtitleTrack {
  index: number;
  language: string;
}

export interface FileWithPath extends DirEntry {
  fullPath: string;
  isConverting?: boolean;
  progress?: number;
  hasMP4?: boolean;
  subtitleInfo?: string;
  showSubtitleInfo?: boolean;
  subtitleTracks?: SubtitleTrack[];
}

export interface FolderState {
  path: string;
  isOpen: boolean;
  files: FileWithPath[];
}

export interface FileContextType {
  selectedPath: string | null;
  setSelectedPath: (path: string | null) => void;
  rootFiles: FileWithPath[];
  setRootFiles: (files: FileWithPath[]) => void;
  expandedFolders: Record<string, FolderState>;
  setExpandedFolders: React.Dispatch<React.SetStateAction<Record<string, FolderState>>>;
  conversionStatus: Record<string, string>;
  setConversionStatus: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  selectedFiles: Set<string>;
  setSelectedFiles: React.Dispatch<React.SetStateAction<Set<string>>>;
  isBatchConverting: boolean;
  setIsBatchConverting: (isConverting: boolean) => void;
  listFiles: (path: string) => Promise<FileWithPath[]>;
  handleConvert: (file: FileWithPath) => Promise<void>;
  handleBatchConvert: () => Promise<void>;
  handleFolderConvert: (folderPath: string) => Promise<void>;
  handleDeleteMKV: (file: FileWithPath) => Promise<void>;
  handleDeleteSubtitle: (file: FileWithPath) => Promise<void>;
  toggleSubtitleInfo: (file: FileWithPath) => Promise<void>;
  toggleFileSelection: (file: FileWithPath) => void;
  handleFolderClick: (folderPath: string) => Promise<void>;
  extractSubtitle: (file: FileWithPath, track: SubtitleTrack) => Promise<void>;
  translateSubtitle: (subtitlePath: string) => Promise<void>;
} 