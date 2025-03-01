import { createContext, useContext, useState, useEffect } from "react";
import {
  readDir,
  type DirEntry,
  remove,
  readTextFile,
  writeTextFile,
  watchImmediate,
} from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { load } from "@tauri-apps/plugin-store";
import { Command } from "@tauri-apps/plugin-shell";
import { toast } from "sonner";
import { Ollama } from "ollama";
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

// Initialize Ollama client
const ollama = new Ollama({ host: "http://localhost:11434" });

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

  const checkForMP4 = async (mkvPath: string): Promise<boolean> => {
    const mp4Path = mkvPath.replace(".mkv", ".mp4");
    try {
      const entries = await readDir(
        mkvPath.substring(0, mkvPath.lastIndexOf("/"))
      );
      return entries.some((entry) => entry.name === mp4Path.split("/").pop());
    } catch (error) {
      console.error("Error checking for MP4:", error);
      return false;
    }
  };

  const addPathsToEntries = async (
    entries: DirEntry[],
    parentPath: string
  ): Promise<FileWithPath[]> => {
    const result: FileWithPath[] = [];
    for (const entry of entries) {
      const fullPath = await join(parentPath, entry.name || "");
      const hasMP4 = entry.name?.toLowerCase().endsWith(".mkv")
        ? await checkForMP4(fullPath)
        : false;
      result.push({ ...entry, fullPath, hasMP4 });
    }
    return result;
  };

  const listFolderContents = async (path: string): Promise<FileWithPath[]> => {
    try {
      const entries = await readDir(path);
      // Add paths to all entries for subtitle tracking
      const allEntries = await addPathsToEntries(entries, path);

      // Filter and sort entries
      const sortedEntries = allEntries.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return (a.name || "").localeCompare(b.name || "");
      });

      return sortedEntries;
    } catch (error) {
      console.error("Error reading directory:", error);
      return [];
    }
  };

  const listFiles = async (path: string): Promise<FileWithPath[]> => {
    try {
      const entries = await listFolderContents(path);
      // Update root files state
      setRootFiles(entries);
      return entries;
    } catch (error) {
      console.error("Error listing files:", error);
      return [];
    }
  };

  const handleConvert = async (file: FileWithPath) => {
    if (!file.name) return;

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

      const mp4File = file.fullPath.replace(".mkv", ".mp4");

      // First, convert video and audio only
      const command = Command.create("ffmpeg-convert", [
        "-i",
        file.fullPath,
        "-map",
        "0:v", // Map video streams
        "-map",
        "0:a", // Map audio streams
        "-c:v",
        "copy",
        "-c:a",
        "copy",
        "-strict",
        "unofficial",
        mp4File,
      ]);

      let duration: number | null = null;

      command.stdout.on("data", (line: string) => {
        if (line.startsWith("Duration:")) {
          const timeMatch = line.match(/Duration: (\d{2}):(\d{2}):(\d{2})/);
          if (timeMatch) {
            duration =
              parseInt(timeMatch[1]) * 3600 +
              parseInt(timeMatch[2]) * 60 +
              parseInt(timeMatch[3]);
          }
        } else if (line.startsWith("time=") && duration) {
          const timeMatch = line.match(/time=(\d{2}):(\d{2}):(\d{2})/);
          if (timeMatch) {
            const currentTime =
              parseInt(timeMatch[1]) * 3600 +
              parseInt(timeMatch[2]) * 60 +
              parseInt(timeMatch[3]);
            const progress = Math.round((currentTime / duration) * 100);

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
          }
        }
      });

      const output = await command.execute();

      if (
        (!output.code && output.stderr.includes("Error")) ||
        output.stderr.includes("Invalid")
      ) {
        throw new Error(output.stderr);
      }

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
        await handleConvert(file);
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
        await handleConvert(file);
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
      await remove(file.fullPath);
      toast.success("MKV file deleted successfully!");
    } catch (error) {
      console.error("Error deleting MKV file:", error);
      toast.error(`Error deleting MKV file: ${error}`);
    }
  };

  const handleDeleteSubtitle = async (file: FileWithPath) => {
    try {
      await remove(file.fullPath);
      toast.success(`Subtitle file deleted successfully: ${file.name}`);
    } catch (error) {
      console.error("Error deleting subtitle file:", error);
      toast.error(`Error deleting subtitle file: ${error}`);
    }
  };

  const toggleSubtitleInfo = async (file: FileWithPath) => {
    try {
      if (!file.subtitleInfo) {
        file.subtitleInfo = await getSubtitleInfo(file);
      }
      file.showSubtitleInfo = !file.showSubtitleInfo;
      setRootFiles([...rootFiles]); // Force re-render
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

      const outputPath =
        file.fullPath.replace(/\.[^/.]+$/, "") + `_${track.index}.srt`;
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
      // Check if Ollama server is running
      const isServerRunning = await checkOllamaServer();
      if (!isServerRunning) {
        toast.error(
          "Ollama server is not running. Please start it and try again.",
          { id: toastId }
        );
        return;
      }

      // Read the subtitle file
      const content = await readTextFile(subtitlePath);

      // Split content into chunks and group them into batches of 20
      const chunks = content.split("\n\n");
      const batchSize = 20;
      let translatedContent = "";

      // Initialize conversation with system message
      const messages = [
        {
          role: "system",
          content:
            "You are a professional subtitle translator. Translate subtitles to Brazilian Portuguese while preserving all numbers, timestamps, and formatting exactly as they are. Maintain consistent translation of repeated phrases and names throughout the entire subtitle file.",
        },
      ];

      // Process chunks in batches
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        if (!batch.some((chunk) => chunk.trim())) continue;

        toast.loading(
          `Translating subtitle... ${Math.round(
            ((i + batch.length) / chunks.length) * 100
          )}%`,
          {
            id: toastId,
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
          console.log("Translating batch:", { batch, translatedContent });
          // Add the current batch to translate
          messages.push({
            role: "user",
            content: `Translate these subtitle segments to Brazilian Portuguese. Keep all numbers and timestamps exactly as they are:\n\n${batch.join(
              "\n\n"
            )}`,
          });

          const response = await ollama.chat({
            model: "deepseek-r1:14b",
            messages,
            stream: false,
          });

          // Add the assistant's response to the conversation history
          messages.push({
            role: "assistant",
            content: response.message.content,
          });

          translatedContent += response.message.content + "\n\n";
        } catch (error: any) {
          console.error(
            `Error translating batch starting at chunk ${i + 1}:`,
            error
          );
          toast.error(`Error translating subtitle: Failed at chunk ${i + 1}`, {
            id: toastId,
          });
          return; // Stop translation on first error
        }
      }

      // Create the translated file path
      const translatedPath = subtitlePath.replace(
        /\.[^/.]+\.srt$/,
        ".pt_br.srt"
      );

      // Write the translated content
      await writeTextFile(translatedPath, translatedContent.trim());

      toast.success("Subtitle translated successfully!", {
        id: toastId,
        description: `Saved as: ${translatedPath.split("/").pop()}`,
      });
    } catch (error: any) {
      console.error("Error translating subtitle:", error);
      if (error.message === "Translation cancelled by user") {
        toast.error("Translation cancelled", { id: toastId });
      } else {
        toast.error(`Error translating subtitle: ${error}`, {
          id: toastId,
        });
      }
    }
  };

  const checkOllamaServer = async (): Promise<boolean> => {
    try {
      await ollama.list();
      return true;
    } catch (error) {
      console.error("Error connecting to Ollama server:", error);
      return false;
    }
  };

  // Load saved path on mount
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

  // Watch for file changes
  useEffect(() => {
    if (!selectedPath) return;

    let stopWatching: (() => void) | undefined;

    const setupWatcher = async () => {
      try {
        const watcher = await watchImmediate(
          selectedPath,
          async () => {
            // Store current state of expanded folders
            const expandedPaths = Object.keys(expandedFolders).filter(
              (path) => expandedFolders[path].isOpen
            );

            // Refresh root files
            const entries = await readDir(selectedPath);
            const allFiles = await addPathsToEntries(entries, selectedPath);
            const sortedFiles = allFiles.sort((a, b) => {
              if (a.isDirectory && !b.isDirectory) return -1;
              if (!a.isDirectory && b.isDirectory) return 1;
              return (a.name || "").localeCompare(b.name || "");
            });
            setRootFiles(sortedFiles);

            // Refresh all expanded folders
            for (const folderPath of expandedPaths) {
              const folderEntries = await readDir(folderPath);
              const folderFiles = await addPathsToEntries(
                folderEntries,
                folderPath
              );
              const sortedFolderFiles = folderFiles.sort((a, b) => {
                if (a.isDirectory && !b.isDirectory) return -1;
                if (!a.isDirectory && b.isDirectory) return 1;
                return (a.name || "").localeCompare(b.name || "");
              });

              setExpandedFolders((prev) => ({
                ...prev,
                [folderPath]: {
                  ...prev[folderPath],
                  files: sortedFolderFiles,
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

    // Cleanup watcher when path changes or component unmounts
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
    handleConvert,
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
