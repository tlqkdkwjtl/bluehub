(function () {
  const params = new URLSearchParams(window.location.search);
  const rcpNo = (params.get("rcpNo") || params.get("rcept_no") || "").trim();
  const title = params.get("title") || "공시 원문";
  const date = params.get("date") || "";
  const code = params.get("code") || "";

  const dartUrl = rcpNo
    ? `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${encodeURIComponent(rcpNo)}`
    : "";

  const elTitle = document.getElementById("viewer-title");
  const elMeta = document.getElementById("viewer-meta");
  const elLink = document.getElementById("viewer-dart-link");
  const elFrame = document.getElementById("viewer-frame");
  const elWrap = document.getElementById("viewer-frame-wrap");
  const btnHere = document.getElementById("viewer-open-here");

  if (!rcpNo) {
    if (elTitle) elTitle.textContent = "원문 정보가 없습니다";
    if (elMeta) elMeta.textContent = "접수번호(rcept_no)가 없는 항목입니다. 목록에서 다른 공시를 선택해 주세요.";
    if (elLink) elLink.hidden = true;
    if (btnHere) btnHere.hidden = true;
    return;
  }

  document.title = `${title} | 공시 원문`;
  if (elTitle) elTitle.textContent = title;
  if (elMeta) {
    const parts = [];
    if (date) parts.push(`접수일 ${date}`);
    if (code) parts.push(`종목코드 ${code}`);
    parts.push(`접수번호 ${rcpNo}`);
    elMeta.textContent = parts.join(" · ");
  }
  if (elLink) elLink.href = dartUrl;

  function showFrame() {
    if (!elFrame || !elWrap) return;
    elFrame.src = dartUrl;
    elWrap.hidden = false;
    elWrap.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  btnHere?.addEventListener("click", showFrame);

  // 자동으로 iframe 시도 (차단되면 안내 문구 표시)
  showFrame();
})();
