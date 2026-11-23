// UI 輔助：密碼驗證、強度、進度顯示
(function (global) {
  "use strict";

  function validatePassword(pw) {
    return typeof pw === "string" && pw.length >= 8;
  }

  function passwordStrength(pw) {
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
    if (/\d/.test(pw)) score++;
    if (/[^a-zA-Z0-9]/.test(pw)) score++;
    return Math.min(4, score);
  }

  var STRENGTH_LABELS = ["太弱", "弱", "普通", "良好", "強"];

  function updateStrength(input, bar, label) {
    var pw = input.value;
    var score = pw.length === 0 ? 0 : passwordStrength(pw);
    bar.className = "strength-" + score;
    bar.style.width = (score * 25) + "%";
    if (label) {
      label.textContent = pw.length === 0 ? "" : "密碼強度：" + STRENGTH_LABELS[score];
    }
  }

  function setProgress(bar, pct) {
    bar.style.width = Math.max(0, Math.min(100, pct)) + "%";
  }

  function show(el) {
    if (el) el.classList.remove("hidden");
  }

  function hide(el) {
    if (el) el.classList.add("hidden");
  }

  global.UI = {
    validatePassword: validatePassword,
    passwordStrength: passwordStrength,
    updateStrength: updateStrength,
    setProgress: setProgress,
    show: show,
    hide: hide
  };
})(window);
