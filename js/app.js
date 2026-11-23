// 主流程與事件綁定
(function () {
  "use strict";

  // --- DOM 參考 ---
  var $ = function (id) { return document.getElementById(id); };

  var encryptDrop = $("encryptDrop");
  var fileInput = $("fileInput");
  var folderInput = $("folderInput");
  var encryptSelected = $("encryptSelected");
  var encryptSelectedName = $("encryptSelectedName");
  var encryptSelectedSize = $("encryptSelectedSize");
  var clearEncrypt = $("clearEncrypt");
  var encryptPassword = $("encryptPassword");
  var strengthBar = $("strengthBar");
  var strengthLabel = $("strengthLabel");
  var encryptBtn = $("encryptBtn");
  var encryptProgress = $("encryptProgress");
  var encryptBar = $("encryptBar");
  var encryptStatus = $("encryptStatus");

  var decryptDrop = $("decryptDrop");
  var encryptedInput = $("encryptedInput");
  var decryptSelected = $("decryptSelected");
  var decryptSelectedName = $("decryptSelectedName");
  var decryptSelectedSize = $("decryptSelectedSize");
  var clearDecrypt = $("clearDecrypt");
  var decryptPassword = $("decryptPassword");
  var decryptBtn = $("decryptBtn");
  var decryptProgress = $("decryptProgress");
  var decryptBar = $("decryptBar");
  var decryptStatus = $("decryptStatus");
  var decryptResult = $("decryptResult");
  var decryptResultMsg = $("decryptResultMsg");
  var downloadResult = $("downloadResult");

  var tabs = document.querySelectorAll(".tab");
  var panels = document.querySelectorAll(".panel");

  // --- 狀態 ---
  var encryptSource = null;       // { type: 'file', file } 或 { type: 'folder', files, name }
  var decryptSourceFile = null;   // 選中的 .aes 檔案
  var decryptResultBlob = null;
  var decryptResultName = null;

  // --- Tab 切換 ---
  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      var target = tab.getAttribute("data-tab");
      tabs.forEach(function (t) { t.classList.remove("active"); });
      panels.forEach(function (p) { p.classList.remove("active"); });
      tab.classList.add("active");
      $(target).classList.add("active");
    });
  });

  // --- 密碼顯示/隱藏 ---
  function bindToggle(btnId, inputId) {
    var btn = $(btnId);
    var input = $(inputId);
    btn.addEventListener("click", function () {
      var isPw = input.type === "password";
      input.type = isPw ? "text" : "password";
      btn.textContent = isPw ? "隱藏" : "顯示";
    });
  }
  bindToggle("toggleEncryptPw", "encryptPassword");
  bindToggle("toggleDecryptPw", "decryptPassword");

  // --- 密碼強度 ---
  encryptPassword.addEventListener("input", function () {
    UI.updateStrength(encryptPassword, strengthBar, strengthLabel);
    updateEncryptButton();
  });
  decryptPassword.addEventListener("input", updateDecryptButton);

  // --- 選檔按鈕 ---
  $("pickFile").addEventListener("click", function () { fileInput.click(); });
  $("pickFolder").addEventListener("click", function () { folderInput.click(); });
  $("pickEncrypted").addEventListener("click", function () { encryptedInput.click(); });

  // --- 選取單一檔案 ---
  fileInput.addEventListener("change", function () {
    var f = fileInput.files[0];
    if (f) setEncryptSource({ type: "file", file: f });
    fileInput.value = "";
  });

  // --- 選取資料夾 ---
  folderInput.addEventListener("change", function () {
    var files = Array.prototype.slice.call(folderInput.files || []);
    if (files.length) {
      setEncryptSource({
        type: "folder",
        files: files,
        name: FileHandler.folderNameFromFiles(files)
      });
    }
    folderInput.value = "";
  });

  // --- 選取加密檔 ---
  encryptedInput.addEventListener("change", function () {
    var f = encryptedInput.files[0];
    if (f) setDecryptSource(f);
    encryptedInput.value = "";
  });

  // --- 拖曳上傳 ---
  function setupDrop(zone, onFiles) {
    ["dragenter", "dragover"].forEach(function (ev) {
      zone.addEventListener(ev, function (e) {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.add("dragover");
      });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      zone.addEventListener(ev, function (e) {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.remove("dragover");
      });
    });
    zone.addEventListener("drop", function (e) {
      var files = Array.prototype.slice.call(e.dataTransfer.files || []);
      if (files.length) onFiles(files);
    });
  }

  setupDrop(encryptDrop, function (files) {
    // 拖曳進來的檔案，視為單一檔案（資料夾請用「選擇資料夾」按鈕）
    if (files.length === 1) {
      setEncryptSource({ type: "file", file: files[0] });
    } else {
      alert("請一次拖曳一個檔案；若要加密資料夾請使用「選擇資料夾」按鈕。");
    }
  });

  setupDrop(decryptDrop, function (files) {
    if (files.length) setDecryptSource(files[0]);
  });

  // --- 設定加密來源 ---
  function setEncryptSource(src) {
    encryptSource = src;
    if (src.type === "file") {
      encryptSelectedName.textContent = src.file.name;
      encryptSelectedSize.textContent = FileHandler.formatSize(src.file.size);
    } else {
      encryptSelectedName.textContent = src.name + "（資料夾）";
      encryptSelectedSize.textContent = src.files.length + " 個檔案";
    }
    UI.show(encryptSelected);
    updateEncryptButton();
  }

  // --- 設定解密來源 ---
  function setDecryptSource(file) {
    decryptSourceFile = file;
    decryptSelectedName.textContent = file.name;
    decryptSelectedSize.textContent = FileHandler.formatSize(file.size);
    UI.show(decryptSelected);
    UI.hide(decryptResult);
    updateDecryptButton();
  }

  // --- 清除 ---
  clearEncrypt.addEventListener("click", function () {
    encryptSource = null;
    UI.hide(encryptSelected);
    updateEncryptButton();
  });
  clearDecrypt.addEventListener("click", function () {
    decryptSourceFile = null;
    decryptResultBlob = null;
    UI.hide(decryptSelected);
    UI.hide(decryptResult);
    updateDecryptButton();
  });

  // --- 按鈕可用性 ---
  function updateEncryptButton() {
    encryptBtn.disabled = !(encryptSource && UI.validatePassword(encryptPassword.value));
  }

  function updateDecryptButton() {
    decryptBtn.disabled = !(decryptSourceFile && UI.validatePassword(decryptPassword.value));
  }

  // --- 加密流程 ---
  encryptBtn.addEventListener("click", async function () {
    var pw = encryptPassword.value;
    if (!UI.validatePassword(pw)) {
      alert("密碼至少需要 8 個字元。");
      return;
    }
    if (!encryptSource) return;

    encryptBtn.disabled = true;
    UI.show(encryptProgress);
    UI.setProgress(encryptBar, 0);
    encryptStatus.textContent = "準備中…";

    try {
      var resultBlob;
      var outName;

      if (encryptSource.type === "file") {
        outName = encryptSource.file.name + ".aes";
        resultBlob = await AESCrypto.encryptFile(encryptSource.file, pw, {
          onProgress: function (done, total) {
            var pct = total > 0 ? (done / total) * 100 : 100;
            UI.setProgress(encryptBar, pct);
            encryptStatus.textContent = "加密中 " + Math.round(pct) + "%（" +
              FileHandler.formatSize(done) + " / " + FileHandler.formatSize(total) + "）";
          }
        });
      } else {
        outName = encryptSource.name + ".aes";
        encryptStatus.textContent = "打包資料夾中…";
        var zipBytes = await Archive.zipFolder(encryptSource.files);
        resultBlob = await AESCrypto.encryptBytes(zipBytes, pw, {
          name: encryptSource.name,
          isFolder: true,
          onProgress: function (done, total) {
            var pct = total > 0 ? (done / total) * 100 : 100;
            UI.setProgress(encryptBar, pct);
            encryptStatus.textContent = "加密中 " + Math.round(pct) + "%";
          }
        });
      }

      FileHandler.downloadBlob(resultBlob, outName);
      encryptStatus.textContent = "加密完成，已開始下載。";
    } catch (err) {
      console.error(err);
      alert("加密失敗：" + (err && err.message ? err.message : err));
      encryptStatus.textContent = "加密失敗。";
    } finally {
      encryptBtn.disabled = false;
      updateEncryptButton();
    }
  });

  // --- 解密流程 ---
  decryptBtn.addEventListener("click", async function () {
    var pw = decryptPassword.value;
    if (!UI.validatePassword(pw)) {
      alert("密碼至少需要 8 個字元。");
      return;
    }
    if (!decryptSourceFile) return;

    decryptBtn.disabled = true;
    UI.show(decryptProgress);
    UI.hide(decryptResult);
    UI.setProgress(decryptBar, 0);
    decryptStatus.textContent = "解密中…";

    try {
      var result = await AESCrypto.decryptBlob(decryptSourceFile, pw, {
        onProgress: function (done, total) {
          var pct = total > 0 ? (done / total) * 100 : 100;
          UI.setProgress(decryptBar, pct);
          decryptStatus.textContent = "解密中 " + Math.round(pct) + "%";
        }
      });

      decryptResultBlob = result.blob;
      decryptResultName = result.isFolder
        ? (result.originalName.replace(/\.zip$/i, "") || "folder") + ".zip"
        : result.originalName;

      decryptResultMsg.textContent = result.isFolder
        ? "解密完成，還原為資料夾（ZIP 壓縮檔），解壓縮後即為原始資料夾結構。"
        : "解密完成：" + result.originalName + "（" + FileHandler.formatSize(result.totalSize) + "）";
      UI.show(downloadResult);
      UI.show(decryptResult);
      decryptStatus.textContent = "解密完成。";
    } catch (err) {
      console.error(err);
      decryptResultMsg.textContent = "解密失敗：密碼錯誤或檔案已損毀。";
      UI.show(decryptResult);
      UI.hide(downloadResult);
      decryptStatus.textContent = "解密失敗。";
    } finally {
      decryptBtn.disabled = false;
      updateDecryptButton();
    }
  });

  // --- 下載解密結果 ---
  downloadResult.addEventListener("click", function () {
    if (decryptResultBlob) {
      FileHandler.downloadBlob(decryptResultBlob, decryptResultName);
    }
  });
})();
