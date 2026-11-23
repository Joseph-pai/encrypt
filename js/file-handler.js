// 檔案讀取與下載輔助
(function (global) {
  "use strict";

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function formatSize(bytes) {
    if (!bytes || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    const v = bytes / Math.pow(1024, i);
    return (i === 0 ? Math.round(v) : v.toFixed(2)) + " " + units[i];
  }

  // 從資料夾檔案清單取出頂層資料夾名稱
  function folderNameFromFiles(files) {
    const first = files[0];
    if (first && first.webkitRelativePath) {
      return first.webkitRelativePath.split("/")[0] || "folder";
    }
    return "folder";
  }

  global.FileHandler = {
    downloadBlob: downloadBlob,
    formatSize: formatSize,
    folderNameFromFiles: folderNameFromFiles
  };
})(window);
