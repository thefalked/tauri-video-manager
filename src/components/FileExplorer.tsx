import { useFileContext } from "../context/FileContext";
import { FileList } from "./FileList";

export const FileExplorer = () => {
  const { rootFiles } = useFileContext();

  if (rootFiles.length === 0) return null;

  return (
    <div className="bg-gray-800 rounded-lg shadow-xl p-4">
      <h2 className="text-lg font-medium mb-3 text-gray-100">
        Files in folder:
      </h2>
      <div className="text-sm">
        <FileList files={rootFiles} />
      </div>
    </div>
  );
};
