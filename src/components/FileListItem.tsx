import {
  RefreshCw,
  Trash2,
  FolderSync,
  Loader,
  Subtitles,
  ChevronDown,
  ChevronUp,
  Languages,
} from "lucide-react";
import { FileWithPath, useFileContext } from "../context/FileContext";
import { FileList } from "./FileList";
import { useState } from "react";

interface SubtitleFile {
  name: string | undefined;
  language: string;
}

interface FileListItemProps {
  file: FileWithPath;
  level: number;
}

export const FileListItem = ({ file, level }: FileListItemProps) => {
  const [showSubtitleList, setShowSubtitleList] = useState(false);
  const {
    selectedFiles,
    toggleFileSelection,
    handleFolderClick,
    handleConvert,
    handleDeleteMKV,
    handleDeleteSubtitle,
    handleFolderConvert,
    toggleSubtitleInfo,
    extractSubtitle,
    isBatchConverting,
    conversionStatus,
    expandedFolders,
    rootFiles,
    translateSubtitle,
    selectedPath,
  } = useFileContext();

  // Get all subtitle files for this video
  const getSubtitleFiles = (): SubtitleFile[] => {
    const baseName = file.fullPath.replace(/\.[^/.]+$/, "");
    const directory = file.fullPath.substring(
      0,
      file.fullPath.lastIndexOf("/")
    );

    // Get all files from the current directory
    let allFiles: FileWithPath[] = [];

    // Add files from root if we're in root directory
    if (directory === selectedPath) {
      allFiles = [...rootFiles];
    }

    // Add files from expanded folders
    Object.values(expandedFolders).forEach((folder) => {
      if (folder.path === directory) {
        allFiles = [...allFiles, ...folder.files];
      }
    });

    // Filter, map and sort subtitle files
    return allFiles
      .filter(
        (f: FileWithPath) =>
          !f.isDirectory &&
          f.name?.toLowerCase().endsWith(".srt") &&
          f.fullPath.startsWith(baseName + ".")
      )
      .map((f: FileWithPath) => {
        const language = f.name?.split(".").slice(-2, -1)[0] || "unknown";
        return { name: f.name, language };
      });
  };

  const subtitleFiles =
    file.name?.toLowerCase().endsWith(".mp4") ||
    file.name?.toLowerCase().endsWith(".mkv")
      ? getSubtitleFiles()
      : [];

  return (
    <li
      className={`py-2 px-3 hover:bg-gray-700/50 transition-colors rounded ${
        file.isDirectory ? "cursor-pointer" : ""
      }`}
      onClick={(e) => {
        e.stopPropagation();
        if (file.isDirectory) {
          handleFolderClick(file.fullPath);
        }
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {!file.isDirectory && file.name?.toLowerCase().endsWith(".mkv") && (
            <input
              type="checkbox"
              checked={selectedFiles.has(file.fullPath)}
              onChange={() => toggleFileSelection(file)}
              onClick={(e) => e.stopPropagation()}
              className="h-3.5 w-3.5 text-indigo-500 rounded border-gray-600 bg-gray-700 cursor-pointer shrink-0"
            />
          )}
          <span
            className={`
              ${file.isDirectory ? "text-indigo-400" : ""}
              ${
                !file.isDirectory && file.name?.toLowerCase().endsWith(".mp4")
                  ? "text-emerald-400"
                  : ""
              }
              ${
                !file.isDirectory && file.name?.toLowerCase().endsWith(".mkv")
                  ? "text-amber-400"
                  : ""
              }
              ${
                !file.isDirectory && file.name?.toLowerCase().endsWith(".srt")
                  ? "text-blue-400"
                  : ""
              }
              text-sm min-w-0 flex-1
            `}
          >
            {file.isDirectory ? (
              <>
                {expandedFolders[file.fullPath]?.isOpen ? "📂" : "📁"}{" "}
                {file.name}
              </>
            ) : (
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="truncate flex-1">
                  {file.name?.toLowerCase().endsWith(".srt") ? "📝" : "🎬"}{" "}
                  {file.name}
                </span>
                {file.hasMP4 && (
                  <span className="text-xs px-1.5 py-0.5 bg-emerald-900/50 text-emerald-300 rounded-full shrink-0">
                    MP4 Ready
                  </span>
                )}
                {subtitleFiles.length > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowSubtitleList(!showSubtitleList);
                    }}
                    className="text-xs px-1.5 py-0.5 bg-blue-900/50 text-blue-300 rounded-full shrink-0 flex items-center gap-1 hover:bg-blue-800/50 transition-colors"
                    title="Show Available Subtitles"
                  >
                    <Languages className="w-3 h-3" />
                    <span>{subtitleFiles.length}</span>
                    {showSubtitleList ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )}
                  </button>
                )}
              </div>
            )}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-4">
          {!file.isDirectory && (
            <div className="relative inline-block">
              {file.name?.toLowerCase().endsWith(".mkv") && (
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    await toggleSubtitleInfo(file);
                  }}
                  className="p-1.5 text-xs bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors flex items-center gap-1 cursor-pointer"
                  title="Show Subtitle Info"
                >
                  <Subtitles className="w-4 h-4" />
                  {file.showSubtitleInfo ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                </button>
              )}
              {file.showSubtitleInfo && file.subtitleInfo && (
                <div className="absolute z-10 right-0 mt-1 w-96 p-2 bg-gray-800 rounded shadow-lg border border-gray-700 whitespace-pre-wrap text-xs">
                  {file.subtitleTracks?.map((track) => (
                    <div
                      key={track.index}
                      className="flex items-center justify-between py-1 hover:bg-gray-700/50 rounded px-2 group"
                      onClick={async (e) => {
                        e.stopPropagation();
                        await extractSubtitle(file, track);
                      }}
                    >
                      <span>
                        Track {track.index}: {track.language}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {file.isDirectory && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleFolderConvert(file.fullPath);
              }}
              disabled={isBatchConverting}
              className="p-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer"
              title="Convert All MKV Files"
            >
              {isBatchConverting ? (
                <Loader className="w-4 h-4 animate-spin" />
              ) : (
                <FolderSync className="w-4 h-4" />
              )}
            </button>
          )}

          {!file.isDirectory && file.name?.toLowerCase().endsWith(".mkv") && (
            <>
              {file.progress !== undefined && (
                <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 transition-all duration-300"
                    style={{ width: `${file.progress}%` }}
                  />
                </div>
              )}
              {conversionStatus[file.fullPath] && (
                <span
                  className={`text-xs ${
                    conversionStatus[file.fullPath].includes("Error")
                      ? "text-red-400"
                      : conversionStatus[file.fullPath] === "Converting..."
                      ? "text-amber-400"
                      : "text-emerald-400"
                  }`}
                >
                  {conversionStatus[file.fullPath]}
                </span>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleConvert(file);
                }}
                disabled={file.isConverting || isBatchConverting}
                className="p-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer"
                title="Convert to MP4"
              >
                {file.isConverting ? (
                  <Loader className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
              </button>
              {file.hasMP4 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteMKV(file);
                  }}
                  className="p-1.5 text-xs bg-red-600 hover:bg-red-700 text-white rounded transition-colors flex items-center cursor-pointer"
                  title="Delete MKV File"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {showSubtitleList && subtitleFiles.length > 0 && (
        <div className="mt-2 ml-6 p-2 bg-gray-800/50 rounded text-xs">
          <div className="font-medium mb-1 text-blue-300 flex items-center gap-1">
            <Languages className="w-3 h-3" />
            Available Subtitles:
          </div>
          {subtitleFiles.map((sub, index) => (
            <div
              key={index}
              className="ml-2 text-blue-100/80 flex items-center justify-between group"
            >
              <span>• {sub.language}</span>
              <div className="flex items-center gap-2">
                {!["pt_br", "pt-br", "ptbr", "ptBR"].includes(
                  sub.language.toLowerCase()
                ) && (
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      const baseName = file.fullPath.replace(/\.[^/.]+$/, "");
                      const subtitlePath = `${baseName}.${sub.language}.srt`;
                      await translateSubtitle(subtitlePath);
                    }}
                    className="opacity-0 group-hover:opacity-100 px-2 py-0.5 bg-purple-600 hover:bg-purple-700 text-white rounded transition-all cursor-pointer"
                    title="Translate to Brazilian Portuguese"
                  >
                    Translate to pt-BR
                  </button>
                )}
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    const baseName = file.fullPath.replace(/\.[^/.]+$/, "");
                    const subtitlePath = `${baseName}.${sub.language}.srt`;
                    await handleDeleteSubtitle({
                      fullPath: subtitlePath,
                      name: `${sub.language}.srt`,
                    } as FileWithPath);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 bg-red-600 hover:bg-red-700 text-white rounded transition-all cursor-pointer"
                  title="Delete subtitle"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {file.isDirectory && expandedFolders[file.fullPath]?.isOpen && (
        <div className="border-l border-gray-700 mt-2">
          <FileList
            files={expandedFolders[file.fullPath].files}
            level={level + 1}
          />
        </div>
      )}
    </li>
  );
};
