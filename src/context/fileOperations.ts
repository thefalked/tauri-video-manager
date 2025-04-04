import { readDir, type DirEntry, remove, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { FileWithPath } from "../types";

export const checkForMP4 = async (mkvPath: string): Promise<boolean> => {
  const mp4Path = mkvPath.replace(".mkv", ".mp4");
  try {
    const entries = await readDir(mkvPath.substring(0, mkvPath.lastIndexOf("/")));
    return entries.some((entry) => entry.name === mp4Path.split("/").pop());
  } catch (error) {
    console.error("Error checking for MP4:", error);
    return false;
  }
};

export const addPathsToEntries = async (
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

export const listFolderContents = async (path: string): Promise<FileWithPath[]> => {
  try {
    const entries = await readDir(path);
    const allEntries = await addPathsToEntries(entries, path);

    return allEntries.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return (a.name || "").localeCompare(b.name || "");
    });
  } catch (error) {
    console.error("Error reading directory:", error);
    return [];
  }
};

export const deleteFile = async (file: FileWithPath) => {
  try {
    await remove(file.fullPath);
    return true;
  } catch (error) {
    console.error(`Error deleting file ${file.name}:`, error);
    return false;
  }
};

export const readSubtitleFile = async (subtitlePath: string): Promise<string> => {
  try {
    return await readTextFile(subtitlePath);
  } catch (error) {
    throw new Error(`Failed to read subtitle file: ${error}`);
  }
};

export const writeTranslatedFile = async (translatedPath: string, content: string): Promise<void> => {
  try {
    await writeTextFile(translatedPath, content.trim());
  } catch (error) {
    throw new Error(`Failed to write translated file: ${error}`);
  }
}; 