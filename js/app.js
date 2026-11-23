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
  var previewWrap = $("previewWrap");
  var downloadResult = $("downloadResult");

  var tabs = document.querySelectorAll(".tab");
  var panels = document.querySelectorAll(".panel");

  // --- 狀態 ---
  var encryptSource = null;       // { type: 'file', file } 或 { type: 'folder', files, name }
  var decryptSourceFile = null;   // 選中的 .aes 檔案
  var decryptResultBlob = null;
  var decryptResultName = null;
  var previewUrls = [];           // 預覽用的 object URL，避免記憶體洩漏

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
    clearPreview();
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

  // --- 解密後預覽 ---
  var TEXT_EXTS = { txt:1, md:1, markdown:1, json:1, js:1, mjs:1, ts:1, jsx:1, tsx:1, css:1, html:1, htm:1, xml:1, csv:1, log:1, yml:1, yaml:1, ini:1, conf:1, toml:1, sh:1, py:1, rb:1, java:1, c:1, cpp:1, h:1, hpp:1, sql:1 };
  var IMAGE_EXTS = { png:1, jpg:1, jpeg:1, gif:1, webp:1, svg:1, bmp:1, ico:1, avif:1 };
  var PDF_EXTS = { pdf:1 };
  var AUDIO_EXTS = { mp3:1, wav:1, ogg:1, m4a:1, flac:1, aac:1 };
  var VIDEO_EXTS = { mp4:1, webm:1, mov:1, m4v:1, ogv:1 };

  function extOf(name) {
    var m = /\.([^.]+)$/.exec(name || "");
    return m ? m[1].toLowerCase() : "";
  }

  function clearPreview() {
    previewUrls.forEach(function (u) { URL.revokeObjectURL(u); });
    previewUrls = [];
    previewWrap.innerHTML = "";
    UI.hide(previewWrap);
  }

  function renderPreview(result) {
    clearPreview();
    if (result.isFolder) return; // 資料夾（ZIP）不提供瀏覽器預覽

    var ext = extOf(result.originalName);

    if (IMAGE_EXTS[ext]) {
      var imgUrl = URL.createObjectURL(result.blob);
      previewUrls.push(imgUrl);
      var img = document.createElement("img");
      img.src = imgUrl;
      img.alt = result.originalName;
      previewWrap.appendChild(img);
      UI.show(previewWrap);
    } else if (PDF_EXTS[ext]) {
      var pdfUrl = URL.createObjectURL(result.blob);
      previewUrls.push(pdfUrl);
      var iframe = document.createElement("iframe");
      iframe.src = pdfUrl;
      iframe.title = result.originalName;
      previewWrap.appendChild(iframe);
      UI.show(previewWrap);
    } else if (TEXT_EXTS[ext] && result.totalSize <= 2 * 1024 * 1024) {
      result.blob.text().then(function (text) {
        var pre = document.createElement("pre");
        pre.textContent = text;
        previewWrap.appendChild(pre);
        UI.show(previewWrap);
      }).catch(function () { /* 預覽失敗則略過 */ });
    } else if (AUDIO_EXTS[ext]) {
      var audioUrl = URL.createObjectURL(result.blob);
      previewUrls.push(audioUrl);
      var audio = document.createElement("audio");
      audio.controls = true;
      audio.src = audioUrl;
      previewWrap.appendChild(audio);
      UI.show(previewWrap);
    } else if (VIDEO_EXTS[ext]) {
      var videoUrl = URL.createObjectURL(result.blob);
      previewUrls.push(videoUrl);
      var video = document.createElement("video");
      video.controls = true;
      video.src = videoUrl;
      previewWrap.appendChild(video);
      UI.show(previewWrap);
    }
    // 其他類型不提供預覽，僅可下載
  }

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
        ? "解密完成，還原為資料夾（ZIP 壓縮檔），無法在瀏覽器預覽，請下載後解壓縮。"
        : "解密完成：" + result.originalName + "（" + FileHandler.formatSize(result.totalSize) + "）";
      renderPreview(result);
      UI.show(downloadResult);
      UI.show(decryptResult);
      decryptStatus.textContent = "解密完成。";
    } catch (err) {
      console.error(err);
      decryptResultMsg.textContent = "解密失敗：密碼錯誤或檔案已損毀。";
      clearPreview();
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
