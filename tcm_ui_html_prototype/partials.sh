sidebar(){ local active="$1"; cat <<HTML
<aside class="sidebar">
  <div class="brand"><div class="brand-title">中医问诊系统</div><div class="brand-sub">AI 辅助中医智能问诊平台</div></div>
  <nav class="nav">
    <a class="$([ "$active" = "consult" ] && echo active)" href="consultation.html">问诊</a>
    <a class="$([ "$active" = "history" ] && echo active)" href="history.html">历史记录</a>
    <a class="$([ "$active" = "patients" ] && echo active)" href="patients.html">患者档案</a>
    <a class="$([ "$active" = "knowledge" ] && echo active)" href="#">知识库</a>
    <a class="$([ "$active" = "settings" ] && echo active)" href="#">系统设置</a>
  </nav>
</aside>
HTML
}
head(){ local title="$1"; cat <<HTML
<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>$title</title><link rel="stylesheet" href="styles.css"></head><body>
HTML
}
user(){ cat <<HTML
<div class="user"><div class="avatar">⌾</div><span>张医师</span><span>⌄</span></div>
HTML
}
