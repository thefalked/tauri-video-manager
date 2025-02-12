import { FolderOpen } from "lucide-react";
import { useFileContext } from "../context/FileContext";
import { open } from "@tauri-apps/plugin-dialog";
import { load } from "@tauri-apps/plugin-store";

export const Header = () => {
  const { selectedPath, setSelectedPath, listFiles } = useFileContext();

  const handleSelectFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: selectedPath || "~/Downloads",
      });

      if (selected && typeof selected === "string") {
        setSelectedPath(selected);
        const store = await load("settings.json", { autoSave: true });
        await store.set("lastPath", selected);
        await listFiles(selected);
      }
    } catch (error) {
      console.error("Error selecting folder:", error);
    }
  };

  return (
    <>
      <h1 className="text-2xl font-bold text-center mb-6 text-gray-100">
        Video Explorer
      </h1>

      <div className="flex items-center justify-between">
        <button
          onClick={handleSelectFolder}
          className="bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded transition-colors flex items-center gap-2 cursor-pointer"
        >
          <FolderOpen className="w-4 h-4" />
          <span className="text-sm">Select Folder</span>
        </button>
      </div>

      {selectedPath && (
        <p className="text-xs text-gray-400 mt-2">
          Selected folder: {selectedPath}
        </p>
      )}
    </>
  );
};
