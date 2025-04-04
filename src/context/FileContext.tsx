import { createContext, useContext, useState, useEffect } from "react";
import { watchImmediate } from "@tauri-apps/plugin-fs";
import { load } from "@tauri-apps/plugin-store";
import { toast } from "sonner";
import {
  FileWithPath,
  SubtitleTrack,
  FolderState,
  FileContextType,
} from "../types";
import {
  getSubtitleInfo,
  getSubtitleCodec,
  extractSubtitle,
  isUnsupportedSubtitleCodec,
} from "../utils/ffmpeg";
import {
  listFolderContents,
  deleteFile,
  readSubtitleFile,
  writeTranslatedFile,
} from "./fileOperations";
import { handleConvert } from "./conversionOperations";
import {
  checkOllamaServer,
  parseSubtitleContent,
  translateBatch,
  updateEntriesWithTranslations,
  formatTranslatedContent,
} from "./translationOperations";

const FileContext = createContext<FileContextType | undefined>(undefined);

export const FileProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [rootFiles, setRootFiles] = useState<FileWithPath[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<
    Record<string, FolderState>
  >({});
  const [conversionStatus, setConversionStatus] = useState<
    Record<string, string>
  >({});
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [isBatchConverting, setIsBatchConverting] = useState(false);

  const listFiles = async (path: string): Promise<FileWithPath[]> => {
    try {
      const entries = await listFolderContents(path);
      setRootFiles(entries);
      return entries;
    } catch (error) {
      console.error("Error listing files:", error);
      return [];
    }
  };

  const handleConvertFile = async (file: FileWithPath) => {
    const toastId = toast.loading(`Converting ${file.name}...`);

    try {
      const updateFileStatus = (files: FileWithPath[]) => {
        return files.map((f) =>
          f.fullPath === file.fullPath
            ? { ...f, isConverting: true, progress: 0 }
            : f
        );
      };

      setRootFiles((prev) => updateFileStatus(prev));
      Object.keys(expandedFolders).forEach((key) => {
        setExpandedFolders((prev) => ({
          ...prev,
          [key]: {
            ...prev[key],
            files: updateFileStatus(prev[key].files),
          },
        }));
      });

      setConversionStatus((prev) => ({
        ...prev,
        [file.fullPath]: "Converting...",
      }));

      await handleConvert(file, (progress) => {
        const updateProgress = (files: FileWithPath[]) => {
          return files.map((f) =>
            f.fullPath === file.fullPath ? { ...f, progress } : f
          );
        };

        setRootFiles((prev) => updateProgress(prev));
        Object.keys(expandedFolders).forEach((key) => {
          setExpandedFolders((prev) => ({
            ...prev,
            [key]: {
              ...prev[key],
              files: updateProgress(prev[key].files),
            },
          }));
        });
      });

      setConversionStatus((prev) => ({
        ...prev,
        [file.fullPath]: "Converted successfully!",
      }));

      toast.success("Converted successfully!", {
        id: toastId,
      });
    } catch (error) {
      console.error("Error converting file:", error);
      toast.error(`Error converting file, please check the logs`, {
        id: toastId,
      });
      setConversionStatus((prev) => ({
        ...prev,
        [file.fullPath]: "Conversion failed!",
      }));
    } finally {
      const resetFileStatus = (files: FileWithPath[]) => {
        return files.map((f) =>
          f.fullPath === file.fullPath
            ? { ...f, isConverting: false, progress: undefined }
            : f
        );
      };

      setRootFiles((prev) => resetFileStatus(prev));
      Object.keys(expandedFolders).forEach((key) => {
        setExpandedFolders((prev) => ({
          ...prev,
          [key]: {
            ...prev[key],
            files: resetFileStatus(prev[key].files),
          },
        }));
      });
    }
  };

  const handleBatchConvert = async () => {
    if (isBatchConverting) return;
    setIsBatchConverting(true);

    const toastId = toast.loading("Starting batch conversion...");

    try {
      const filesToConvert = [...selectedFiles]
        .map(
          (path) =>
            rootFiles.find((f) => f.fullPath === path) ||
            Object.values(expandedFolders)
              .flatMap((f) => f.files)
              .find((f) => f.fullPath === path)
        )
        .filter((f): f is FileWithPath => f !== undefined);

      for (const file of filesToConvert) {
        await handleConvertFile(file);
      }

      toast.success(`Batch conversion completed!`, {
        id: toastId,
      });
    } catch (error) {
      toast.error(`Batch conversion failed: ${error}`, {
        id: toastId,
      });
    } finally {
      setIsBatchConverting(false);
      setSelectedFiles(new Set());
    }
  };

  const handleFolderConvert = async (folderPath: string) => {
    if (isBatchConverting) return;
    setIsBatchConverting(true);

    const toastId = toast.loading("Converting folder...");

    try {
      const getAllMkvFiles = async (path: string): Promise<FileWithPath[]> => {
        const entries = await listFolderContents(path);
        let result: FileWithPath[] = [];

        for (const entry of entries) {
          if (entry.isDirectory) {
            const subFiles = await getAllMkvFiles(entry.fullPath);
            result = [...result, ...subFiles];
          } else if (entry.name?.toLowerCase().endsWith(".mkv")) {
            result.push(entry);
          }
        }

        return result;
      };

      const mkvFiles = await getAllMkvFiles(folderPath);
      for (const file of mkvFiles) {
        await handleConvertFile(file);
      }

      toast.success("Folder conversion completed!", {
        id: toastId,
      });
    } catch (error) {
      toast.error(`Folder conversion failed: ${error}`, {
        id: toastId,
      });
    } finally {
      setIsBatchConverting(false);
    }
  };

  const handleDeleteMKV = async (file: FileWithPath) => {
    try {
      const success = await deleteFile(file);
      if (success) {
        toast.success("MKV file deleted successfully!");
      }
    } catch (error) {
      console.error("Error deleting MKV file:", error);
      toast.error(`Error deleting MKV file: ${error}`);
    }
  };

  const handleDeleteSubtitle = async (file: FileWithPath) => {
    try {
      const success = await deleteFile(file);
      if (success) {
        toast.success(`Subtitle file deleted successfully: ${file.name}`);
      }
    } catch (error) {
      console.error("Error deleting subtitle file:", error);
      toast.error(`Error deleting subtitle file: ${error}`);
    }
  };

  const toggleSubtitleInfo = async (file: FileWithPath) => {
    try {
      if (!file.subtitleTracks) {
        await getSubtitleInfo(file);
      }
      file.showSubtitleInfo = !file.showSubtitleInfo;
      setRootFiles([...rootFiles]);
    } catch (error) {
      console.error("Error toggling subtitle info:", error);
      toast.error("Error getting subtitle information");
    }
  };

  const toggleFileSelection = (file: FileWithPath) => {
    const newSelectedFiles = new Set(selectedFiles);
    if (selectedFiles.has(file.fullPath)) {
      newSelectedFiles.delete(file.fullPath);
    } else {
      newSelectedFiles.add(file.fullPath);
    }
    setSelectedFiles(newSelectedFiles);
  };

  const handleFolderClick = async (folderPath: string) => {
    if (expandedFolders[folderPath]) {
      const { isOpen } = expandedFolders[folderPath];
      setExpandedFolders((prev) => ({
        ...prev,
        [folderPath]: {
          ...prev[folderPath],
          isOpen: !isOpen,
        },
      }));
    } else {
      const files = await listFolderContents(folderPath);
      setExpandedFolders((prev) => ({
        ...prev,
        [folderPath]: {
          path: folderPath,
          isOpen: true,
          files,
        },
      }));
    }
  };

  const handleExtractSubtitle = async (
    file: FileWithPath,
    track: SubtitleTrack
  ) => {
    const toastId = toast.loading(`Extracting ${track.language} subtitle...`);

    try {
      const codecName = await getSubtitleCodec(file, track);

      if (isUnsupportedSubtitleCodec(codecName)) {
        toast.error("This subtitle format is not supported for extraction", {
          id: toastId,
        });
        return;
      }

      const outputPath = `${file.fullPath.replace(/\.[^/.]+$/, "")}.srt`;
      await extractSubtitle(file, track, outputPath);
      toast.success("Subtitle extracted successfully", {
        id: toastId,
      });
    } catch (error) {
      console.error("Error extracting subtitle:", error);
      toast.error("Failed to extract subtitle", {
        id: toastId,
      });
    }
  };

  const translateSubtitle = async (subtitlePath: string) => {
    const toastId = toast.loading(
      "Translating subtitle to Brazilian Portuguese...",
      {
        action: {
          label: "Cancel",
          onClick: () => {
            toast.dismiss(toastId);
            throw new Error("Translation cancelled by user");
          },
        },
      }
    );

    try {
      const isServerRunning = await checkOllamaServer();
      if (!isServerRunning) {
        throw new Error(
          "Ollama server is not running. Please start it and try again."
        );
      }

      const content = await readSubtitleFile(subtitlePath);
      const subtitleEntries = parseSubtitleContent(content);

      if (subtitleEntries.length === 0) {
        throw new Error("No valid subtitle entries found in file");
      }

      const batchSize = 50;
      const totalBatches = Math.ceil(subtitleEntries.length / batchSize);

      for (let i = 0; i < subtitleEntries.length; i += batchSize) {
        const batch = subtitleEntries.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;

        toast.loading(
          `Translating subtitle... Batch ${batchNumber}/${totalBatches} (${Math.round(
            ((i + batch.length) / subtitleEntries.length) * 100
          )}%)`,
          {
            id: toastId,
          }
        );

        try {
          const translations = await translateBatch(batch, batchNumber);
          updateEntriesWithTranslations(batch, translations.translations);

          if (i + batchSize < subtitleEntries.length) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        } catch (error: any) {
          throw new Error(
            `Translation failed at batch ${batchNumber}: ${error.message}`
          );
        }
      }

      const missingTranslations = subtitleEntries.filter(
        (entry) => !entry.translation
      );
      if (missingTranslations.length > 0) {
        const missingBatches = new Map<number, typeof subtitleEntries>();
        missingTranslations.forEach((entry) => {
          const batchNumber = Math.floor((entry.index - 1) / batchSize);
          if (!missingBatches.has(batchNumber)) {
            missingBatches.set(batchNumber, []);
          }
          missingBatches.get(batchNumber)?.push(entry);
        });

        for (const [batchNumber, entries] of missingBatches) {
          try {
            const translations = await translateBatch(entries, batchNumber + 1);
            updateEntriesWithTranslations(entries, translations.translations);
            await new Promise((resolve) => setTimeout(resolve, 1000));
          } catch (error: any) {
            throw new Error(
              `Translation failed at batch ${batchNumber + 1}: ${error.message}`
            );
          }
        }

        const stillMissing = subtitleEntries.filter(
          (entry) => !entry.translation
        );
        if (stillMissing.length > 0) {
          throw new Error(
            `Still missing translations for ${stillMissing.length} entries after retries`
          );
        }
      }

      const translatedContent = formatTranslatedContent(subtitleEntries);
      const translatedPath = subtitlePath.replace(
        /\.[^/.]+\.srt$/,
        ".pt_br.srt"
      );
      await writeTranslatedFile(translatedPath, translatedContent);

      toast.success("Subtitle translated successfully!", {
        id: toastId,
        description: `Saved as: ${translatedPath.split("/").pop()}`,
      });
    } catch (error: any) {
      toast.error(error.message || "Translation failed", { id: toastId });
      throw error;
    }
  };

  useEffect(() => {
    const loadSavedPath = async () => {
      try {
        const store = await load("settings.json", { autoSave: true });
        const saved = await store.get<string>("lastPath");

        if (saved) {
          setSelectedPath(saved);
          await listFiles(saved);
        }
      } catch (error) {
        console.error("Error loading saved path:", error);
      }
    };
    loadSavedPath();
  }, []);

  useEffect(() => {
    if (!selectedPath) return;

    let stopWatching: (() => void) | undefined;

    const setupWatcher = async () => {
      try {
        const watcher = await watchImmediate(
          selectedPath,
          async () => {
            const expandedPaths = Object.keys(expandedFolders).filter(
              (path) => expandedFolders[path].isOpen
            );

            const entries = await listFolderContents(selectedPath);
            setRootFiles(entries);

            for (const folderPath of expandedPaths) {
              const folderEntries = await listFolderContents(folderPath);
              setExpandedFolders((prev) => ({
                ...prev,
                [folderPath]: {
                  ...prev[folderPath],
                  files: folderEntries,
                },
              }));
            }
          },
          { recursive: true }
        );

        stopWatching = () => watcher();
      } catch (error) {
        console.error("Error setting up file watcher:", error);
      }
    };

    setupWatcher();

    return () => {
      if (stopWatching) {
        stopWatching();
      }
    };
  }, [selectedPath, expandedFolders]);

  const value = {
    selectedPath,
    setSelectedPath,
    rootFiles,
    setRootFiles,
    expandedFolders,
    setExpandedFolders,
    conversionStatus,
    setConversionStatus,
    selectedFiles,
    setSelectedFiles,
    isBatchConverting,
    setIsBatchConverting,
    listFiles,
    handleConvert: handleConvertFile,
    handleBatchConvert,
    handleFolderConvert,
    handleDeleteMKV,
    handleDeleteSubtitle,
    toggleSubtitleInfo,
    toggleFileSelection,
    handleFolderClick,
    handleExtractSubtitle,
    translateSubtitle,
  };

  return <FileContext.Provider value={value}>{children}</FileContext.Provider>;
};

export const useFileContext = () => {
  const context = useContext(FileContext);
  if (context === undefined) {
    throw new Error("useFileContext must be used within a FileProvider");
  }
  return context;
};
