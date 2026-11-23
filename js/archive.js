// 資料夾打包／解包（使用 fflate 函式庫）
(function (global) {
  "use strict";

  // 將一組 File（來自 <input webkitdirectory>）打包成 ZIP，
  // 保留資料夾結構（以 webkitRelativePath 作為路徑）。
  async function zipFolder(files) {
    const entries = {};
    for (const file of files) {
      const path = file.webkitRelativePath || file.name;
      entries[path] = new Uint8Array(await file.arrayBuffer());
    }
    return fflate.zipSync(entries, { level: 6 });
  }

  global.Archive = {
    zipFolder: zipFolder
  };
})(window);
