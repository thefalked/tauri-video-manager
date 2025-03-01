import { FileListItem } from "./FileListItem";
import { FileWithPath } from "../types";

interface FileListProps {
  files: FileWithPath[];
  level?: number; // Make level optional with a default value
}

const isMP4 = (name: string | undefined) =>
  name?.toLowerCase().endsWith(".mp4") || false;
const isMKV = (name: string | undefined) =>
  name?.toLowerCase().endsWith(".mkv") || false;

export const FileList = ({ files, level = 0 }: FileListProps) => {
  // Filter out non-displayable files (like .srt) from the main list
  const displayableFiles = files
    .filter((file) => file.isDirectory || isMP4(file.name) || isMKV(file.name))
    .sort((a, b) => {
      // Directories first
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1;
      }

      // If both are files, sort by type (MP4 before MKV)
      if (!a.isDirectory && !b.isDirectory) {
        if (isMP4(a.name) !== isMP4(b.name)) {
          return isMP4(a.name) ? -1 : 1;
        }
      }

      // Finally sort alphabetically
      return (a.name || "").localeCompare(b.name || "");
    });

  return (
    <ul className="space-y-1">
      {displayableFiles.map((file) => (
        <FileListItem key={file.fullPath} file={file} level={level} />
      ))}
    </ul>
  );
};
