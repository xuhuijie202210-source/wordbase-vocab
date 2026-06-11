const STORAGE_KEY = "wordbase-demo-v2";
const API_BASE = "";

const seedLibraries = window.seedLibraries || [];
const classRooms = {
  2541: {
    code: "2541",
    name: "25届41班",
    grade: "高一",
  },
  2538: {
    code: "2538",
    name: "25届38班",
    grade: "高一",
  },
};

function word(term, phonetic, meaning, partOfSpeech, source, example = "") {
  return {
    id: `${term}-${Math.random().toString(36).slice(2, 7)}`,
    term,
    phonetic,
    meaning,
    partOfSpeech,
    source,
    example,
    type: "单词",
    importance: Math.random() > 0.55 ? "高频" : "普通",
  };
}

function phrase(term, meaning, source) {
  return {
    id: `${term.replaceAll(" ", "-")}-${Math.random().toString(36).slice(2, 7)}`,
    term,
    phonetic: "",
    meaning,
    partOfSpeech: "短语",
    source,
    example: "",
    type: "短语",
    importance: "高频",
  };
}

function unit(id, title, words) {
  return { id, title, status: "已发布", words };
}

function pendingBook(id, title, grade) {
  return {
    id,
    title,
    grade,
    pending: true,
    units: [
      unit(`${id}-u1`, "Unit 1 待解析", []),
      unit(`${id}-u2`, "Unit 2 待解析", []),
      unit(`${id}-u3`, "Unit 3 待解析", []),
      unit(`${id}-u4`, "Unit 4 待解析", []),
    ],
  };
}

const state = loadState();
let serverStats = null;
let selectedLibraryId = state.official[0].id;
let selectedUnitId = state.official[0].units[0].id;
let reviewSession = buildReviewSession();
let currentReviewIndex = 0;

const views = {
  "student-home": document.querySelector("#student-home"),
  libraries: document.querySelector("#libraries"),
  personal: document.querySelector("#personal"),
  review: document.querySelector("#review"),
  admin: document.querySelector("#admin"),
};

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.view));
});

document.querySelector("#resetDemo").addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
});

renderAll();

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) return migrateState(JSON.parse(saved));
  return {
    official: structuredClone(seedLibraries),
    draft: structuredClone(seedLibraries),
    personal: [
      {
        id: "p1",
        title: "高一下期末阅读生词",
        source: "学生上传",
        createdAt: "2026-06-11",
        words: [
          word("frequently", "/ˈfriːkwəntli/", "频繁地，经常", "adv.", "个人词库 · 高一下期末阅读"),
          word("necessity", "/nəˈsesəti/", "必需品；必要", "n.", "个人词库 · 高一下期末阅读"),
          word("surplus", "/ˈsɜːpləs/", "剩余的；过剩", "adj./n.", "个人词库 · 高一下期末阅读"),
        ],
      },
    ],
    progress: {},
    attempts: [],
    students: [],
    currentStudent: null,
    adminClassCode: "2541",
    classStats: seedClassStats(),
    publishedAt: "2026-06-11 18:00",
    version: 2,
  };
}

function migrateState(saved) {
  return {
    ...saved,
    attempts: saved.attempts || [],
    students: saved.students || [],
    currentStudent: saved.currentStudent || null,
    adminClassCode: saved.adminClassCode || "2541",
    classStats: saved.classStats || seedClassStats(),
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  document.querySelector("#publishState").textContent = `官方词库：v${state.version} 已发布`;
}

function renderAll() {
  saveState();
  renderHome();
  renderLibraries();
  renderPersonal();
  renderReview();
  renderAdmin();
}

function switchView(viewName) {
  if (viewName === "student-home") renderHome();
  if (viewName === "libraries") renderLibraries();
  if (viewName === "personal") renderPersonal();
  if (viewName === "review") renderReview();
  if (viewName === "admin") renderAdmin();
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === viewName);
  });
  Object.entries(views).forEach(([name, view]) => {
    view.classList.toggle("active", name === viewName);
  });
  document.querySelector("#pageTitle").textContent = {
    "student-home": "学生端首页",
    libraries: "教材词库",
    personal: "我的词库",
    review: "单词复习",
    admin: "后台管理",
  }[viewName];
  if (viewName === "admin") refreshServerStats();
}

function renderHome() {
  const allWords = collectOfficialWords();
  const phraseCount = allWords.filter((item) => item.type === "短语").length;
  const knownCount = Object.values(state.progress).filter((v) => v === "known").length;
  const currentStudent = getCurrentStudent();
  views["student-home"].innerHTML = `
    <div class="grid three">
      ${metric("官方词条", String(allWords.length), "7本教材按Unit整理")}
      ${metric("短语词组", String(phraseCount), "已并入教材词库")}
      ${metric("已掌握", String(knownCount), "个人学习记录独立保存")}
    </div>
    <div class="grid two" style="margin-top:18px">
      <div class="card">
        <div class="library-head">
          <div>
            <div class="eyebrow">${currentStudent ? currentStudent.className : "学生身份"}</div>
            <h2>${currentStudent ? `${currentStudent.name}，开始今日复习` : "先加入班级，再开始复习"}</h2>
            <p class="subtext">${currentStudent ? "你的答题记录会按学生身份进入教师后台统计。" : "输入班级码 2541 或 2538、姓名和学号后，系统就能把正确率归到你名下。"}</p>
          </div>
          <button class="primary-btn" data-action="start-review" ${currentStudent ? "" : "disabled"}>开始今日学习</button>
        </div>
        ${
          currentStudent
            ? `<div class="library-list" style="margin-top:14px">
                ${taskItem("班级", currentStudent.className, "已加入")}
                ${taskItem("学生", `${currentStudent.name} · ${currentStudent.studentNo}`, "已识别")}
                ${taskItem("今日模式", "随机选择题 + 掌握度标记", "复习")}
              </div>`
            : studentLoginCard()
        }
      </div>
      <div class="card">
        <div class="eyebrow">最近学习</div>
        <h2>教材词库覆盖情况</h2>
        <div class="progress"><span style="width:72%"></span></div>
        <p class="subtext" style="margin-top:10px">已导入 7 本教材后部 Unit 单词表，单词和词组都按分册、单元拆分。</p>
        <div class="chips">
          <span class="tag blue">7本教材</span>
          <span class="tag green">${allWords.length}个词条</span>
          <span class="tag">按Unit学习</span>
        </div>
      </div>
    </div>
  `;
  views["student-home"].querySelector("#joinClassForm")?.addEventListener("submit", joinClass);
  views["student-home"].querySelector("[data-action='start-review']").addEventListener("click", () => {
    if (!getCurrentStudent()) {
      showToast("请先用班级码 2541 或 2538 加入班级。");
      return;
    }
    reviewSession = buildReviewSession();
    currentReviewIndex = 0;
    switchView("review");
    renderReview();
  });
}

function studentLoginCard() {
  return `
    <form class="class-login" id="joinClassForm">
      <div class="inline-actions">
        <input name="classCode" placeholder="班级码：2541" value="2541" required />
        <input name="studentName" placeholder="学生姓名" required />
        <input name="studentNo" placeholder="学号" required />
        <button class="primary-btn" type="submit">加入班级</button>
      </div>
      <p class="subtext" style="margin-top:10px">当前开放班级：2541 = 25届41班；2538 = 25届38班。</p>
    </form>
  `;
}

function joinClass(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  const classCode = String(form.get("classCode")).trim();
  const name = String(form.get("studentName")).trim();
  const studentNo = String(form.get("studentNo")).trim();
  const classRoom = classRooms[classCode];
  if (!classRoom) {
    showToast("暂未开放这个班级码。现在可用：2541、2538。");
    return;
  }
  if (!name || !studentNo) {
    showToast("请填写姓名和学号。");
    return;
  }
  const studentId = `${classCode}-${studentNo}`;
  const localStudent = {
    id: studentId,
    classCode,
    className: classRoom.name,
    name,
    studentNo,
    joinedAt: new Date().toISOString(),
  };
  apiPost("/api/join-class", { classCode, name, studentNo })
    .then((payload) => {
      const student = payload.student || localStudent;
      saveJoinedStudent(student);
      showToast(`已加入 ${student.className}：${student.name}`);
    })
    .catch(() => {
      saveJoinedStudent(localStudent);
      showToast("已在本机加入班级；数据库服务未连接。");
    });
}

function saveJoinedStudent(student) {
  const existingIndex = state.students.findIndex((item) => item.id === student.id);
  if (existingIndex >= 0) state.students[existingIndex] = student;
  else state.students.push(student);
  state.currentStudent = student.id;
  state.adminClassCode = student.classCode;
  saveState();
  renderHome();
}

function metric(label, value, help) {
  return `
    <div class="card metric">
      <div class="metric-label">${label}</div>
      <div class="metric-value">${value}</div>
      <div class="subtext">${help}</div>
    </div>
  `;
}

function taskItem(title, count, type) {
  return `
    <div class="unit-card">
      <div class="unit-head">
        <div>
          <div class="unit-title">${title}</div>
          <div class="subtext">${count} · 建议用时 6分钟</div>
        </div>
        <span class="tag blue">${type}</span>
      </div>
    </div>
  `;
}

function renderLibraries() {
  const selected = state.official.find((book) => book.id === selectedLibraryId) || state.official[0];
  const unit = selected.units.find((item) => item.id === selectedUnitId) || selected.units[0];
  views.libraries.innerHTML = `
    <div class="grid two">
      <div class="card">
        <div class="library-head">
          <div>
            <div class="eyebrow">官方教材词库</div>
            <h2>7本教材，按 Unit 拆分</h2>
          </div>
          <span class="status-chip published">学生只读</span>
        </div>
        <div class="library-list">${state.official.map(libraryCard).join("")}</div>
      </div>
      <div class="card">
        <div class="library-head">
          <div>
            <div class="eyebrow">${selected.grade} · ${selected.title}</div>
            <h2>${selected.pending ? "待后台解析导入" : "Unit 词库"}</h2>
          </div>
          <span class="tag ${selected.pending ? "amber" : "green"}">${selected.pending ? "待解析" : "已发布"}</span>
        </div>
        <div class="tabs">${selected.units.map((item) => `<button class="tab ${item.id === selectedUnitId ? "active" : ""}" data-unit="${item.id}">${unitShortName(item.title)}</button>`).join("")}</div>
        <div class="unit-list">${selected.units.map(unitCard).join("")}</div>
      </div>
    </div>
    <div class="card" style="margin-top:18px">
      <div class="library-head">
        <div>
          <div class="eyebrow">${unit?.title || ""}</div>
          <h2>单词列表</h2>
        </div>
        <div class="chips">
          <button class="chip active">全部</button>
          <button class="chip">未掌握</button>
          <button class="chip">高频</button>
          <button class="chip">短语</button>
        </div>
      </div>
      <input class="search" id="librarySearch" placeholder="搜索单词、释义或短语" />
      <div class="word-list" id="libraryWords">${renderWordRows(unit?.words || [])}</div>
    </div>
  `;

  views.libraries.querySelectorAll("[data-library]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedLibraryId = button.dataset.library;
      const next = state.official.find((book) => book.id === selectedLibraryId);
      selectedUnitId = next.units[0].id;
      renderLibraries();
    });
  });
  views.libraries.querySelectorAll("[data-unit]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedUnitId = button.dataset.unit;
      renderLibraries();
    });
  });
  views.libraries.querySelector("#librarySearch").addEventListener("input", (event) => {
    const q = event.target.value.trim().toLowerCase();
    const words = (unit?.words || []).filter((item) => `${item.term} ${item.meaning}`.toLowerCase().includes(q));
    views.libraries.querySelector("#libraryWords").innerHTML = renderWordRows(words);
  });
}

function libraryCard(book) {
  const total = countBookWords(book);
  const progress = book.pending ? 0 : Math.min(92, 45 + total);
  return `
    <button class="library-card" data-library="${book.id}">
      <div class="library-head">
        <div>
          <div class="library-title">${book.title}</div>
          <div class="subtext">${book.grade} · ${book.units.length}个Unit · ${total || "待导入"}词条</div>
        </div>
        <span class="tag ${book.pending ? "amber" : "blue"}">${book.pending ? "待解析" : "已发布"}</span>
      </div>
      <div class="progress" style="margin-top:10px"><span style="width:${progress}%"></span></div>
      <div class="library-meta">
        ${book.units.map((unitItem) => `<span class="unit-chip">${unitShortName(unitItem.title)}</span>`).join("")}
      </div>
    </button>
  `;
}

function unitCard(item) {
  const examples = item.words.slice(0, 4).map((wordItem) => wordItem.term).join(" · ") || "等待后台导入单词";
  return `
    <button class="unit-card" data-unit="${item.id}">
      <div class="unit-head">
        <div>
          <div class="unit-title">${item.title}</div>
          <div class="subtext">${item.words.length || "待导入"}词条 · ${examples}</div>
        </div>
        <span class="tag ${item.words.length ? "green" : "amber"}">${item.words.length ? "可学习" : "待解析"}</span>
      </div>
    </button>
  `;
}

function renderPersonal() {
  views.personal.innerHTML = `
    <div class="grid two">
      <div class="card">
        <div class="library-head">
          <div>
            <div class="eyebrow">学生个人词库</div>
            <h2>上传资料生成自己的生词本</h2>
            <p class="subtext">个人词库只属于当前学生，不会修改官方教材词库，也不会影响其他学生。</p>
          </div>
          <span class="tag green">互不干涉</span>
        </div>
        <div class="upload-zone">
          <label class="subtext">支持 TXT / CSV 第一版演示。PDF、Word、图片 OCR 可作为下一阶段接入。</label>
          <input type="file" id="uploadInput" accept=".txt,.csv" />
          <textarea id="pasteWords" placeholder="也可以直接粘贴：word, 释义&#10;necessity, 必需品&#10;frequently, 频繁地" style="margin-top:10px"></textarea>
          <div class="inline-actions" style="margin-top:10px">
            <input id="personalTitle" placeholder="词库名称，例如：6月阅读生词" />
            <button class="primary-btn" id="importPersonal">生成个人词库</button>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="eyebrow">我的词库</div>
        <h2>学生自建内容</h2>
        <div class="library-list">${state.personal.map(personalCard).join("")}</div>
      </div>
    </div>
  `;
  views.personal.querySelector("#importPersonal").addEventListener("click", importPersonalWords);
}

function personalCard(item) {
  return `
    <div class="personal-card">
      <div class="library-head">
        <div>
          <div class="library-title">${item.title}</div>
          <div class="subtext">${item.createdAt} · ${item.words.length}词条 · ${item.source}</div>
        </div>
        <span class="tag blue">个人</span>
      </div>
      <div class="word-list" style="margin-top:10px">${renderWordRows(item.words.slice(0, 5))}</div>
    </div>
  `;
}

function importPersonalWords() {
  const title = views.personal.querySelector("#personalTitle").value.trim() || "未命名个人词库";
  const pasted = views.personal.querySelector("#pasteWords").value.trim();
  const file = views.personal.querySelector("#uploadInput").files[0];

  if (file) {
    const reader = new FileReader();
    reader.onload = () => createPersonalLibrary(title, String(reader.result || ""));
    reader.readAsText(file);
    return;
  }

  if (!pasted) {
    showToast("请先上传 TXT/CSV，或粘贴几行单词。");
    return;
  }
  createPersonalLibrary(title, pasted);
}

function createPersonalLibrary(title, rawText) {
  const rows = rawText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [term, meaning = "待补充释义"] = line.split(/,|，|\t/).map((part) => part.trim());
      return term ? word(term, "", meaning, "", `个人词库 · ${title}`) : null;
    })
    .filter(Boolean);

  if (!rows.length) {
    showToast("没有识别到有效单词。建议格式：word, 释义");
    return;
  }

  state.personal.unshift({
    id: `p-${Date.now()}`,
    title,
    source: "学生上传",
    createdAt: new Date().toISOString().slice(0, 10),
    words: rows,
  });
  renderAll();
  showToast(`已生成个人词库：${title}，共 ${rows.length} 个词条。`);
}

function renderReview() {
  const currentStudent = getCurrentStudent();
  if (!currentStudent) {
    views.review.innerHTML = `
      <div class="card">
        <div class="eyebrow">需要学生身份</div>
        <h2>请先用班级码加入班级</h2>
        <p class="subtext">加入后，每一道题的正确率都会记录到对应学生名下，后台才能分学生查看。</p>
        <button class="primary-btn" data-action="go-home">去加入班级</button>
      </div>
    `;
    views.review.querySelector("[data-action='go-home']").addEventListener("click", () => switchView("student-home"));
    return;
  }
  if (!reviewSession.length) reviewSession = buildReviewSession();
  const card = reviewSession[currentReviewIndex % reviewSession.length];
  const current = card.word;
  const answeredClass = card.answered ? "answered" : "";
  views.review.innerHTML = `
    <div class="grid two">
      <div class="card review-card">
        <div>
          <div class="library-head">
            <span class="tag blue">随机复习 ${currentReviewIndex + 1}/${reviewSession.length}</span>
            <span class="source-line">${currentStudent.className} · ${currentStudent.name} · ${current.source}</span>
          </div>
          <div class="review-word">${current.term}</div>
          <div class="phonetic">${current.phonetic || current.partOfSpeech || "自定义词条"}</div>
          <div class="choice-list ${answeredClass}">
            ${card.options.map((option, index) => reviewOption(option, index, card)).join("")}
          </div>
          ${
            card.answered
              ? `<div class="answer-panel ${card.correct ? "correct" : "wrong"}">
                  <strong>${card.correct ? "答对了" : "正确释义"}</strong>
                  <span>${current.meaning}</span>
                </div>`
              : ""
          }
          ${current.example ? `<p class="subtext">例句：${current.example}</p>` : ""}
          <div class="chips" style="justify-content:center">
            <span class="tag">${current.type}</span>
            <span class="tag ${current.importance === "高频" ? "blue" : ""}">${current.importance}</span>
            <span class="tag">查看原文出处</span>
          </div>
        </div>
        <div class="review-buttons ${card.answered ? "" : "single"}">
          ${
            card.answered
              ? `
                <button data-mark="unknown">不认识</button>
                <button data-mark="fuzzy">模糊</button>
                <button data-mark="known">已记住</button>
              `
              : `<button data-skip="unknown">不认识，直接看答案</button>`
          }
        </div>
      </div>
      <div class="card">
        <div class="eyebrow">复习策略</div>
        <h2>先选择词义，再自评掌握度</h2>
        <div class="library-list">
          ${taskItem("答对", "记录为正确，可延后复习", "正确率")}
          ${taskItem("答错", "显示正确释义，再标记掌握度", "需巩固")}
          ${taskItem("不认识", "直接看答案，进入高优先级复习", "高优先级")}
        </div>
      </div>
    </div>
  `;
  views.review.querySelectorAll("[data-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      if (card.answered) return;
      const selected = card.options[Number(button.dataset.choice)];
      card.selected = selected;
      card.correct = selected === current.meaning;
      card.answered = true;
      recordAttempt(current, card.correct, "choice", selected);
      state.progress[current.id] = card.correct ? "known" : "fuzzy";
      saveState();
      renderReview();
    });
  });
  views.review.querySelector("[data-skip]")?.addEventListener("click", () => {
    card.selected = "";
    card.correct = false;
    card.answered = true;
    recordAttempt(current, false, "unknown", "");
    state.progress[current.id] = "unknown";
    saveState();
    renderReview();
  });
  views.review.querySelectorAll("[data-mark]").forEach((button) => {
    button.addEventListener("click", () => {
      state.progress[current.id] = button.dataset.mark;
      currentReviewIndex += 1;
      saveState();
      renderReview();
    });
  });
}

function renderAdmin() {
  const draftWords = collectWordsFrom(state.draft);
  const studentStats = getStudentStats();
  const difficultWords = getDifficultWords();
  const activeClass = classRooms[state.adminClassCode] || classRooms["2541"];
  const firstBook = state.draft[0];
  const firstUnit = firstBook.units[0];
  views.admin.innerHTML = `
    <div class="grid two">
      <div class="card">
        <div class="library-head">
          <div>
            <div class="eyebrow">后台官方词库管理</div>
            <h2>编辑草稿，不直接影响学生端</h2>
            <p class="subtext">发布后学生端才会看到新版官方词库。学生个人词库和学习记录不会被覆盖。</p>
          </div>
          <span class="status-chip draft">草稿区</span>
        </div>
        <form class="admin-form" id="adminForm">
          <select name="book">${state.draft.map((book) => `<option value="${book.id}">${book.title}</option>`).join("")}</select>
          <select name="unit">${firstBook.units.map((item) => `<option value="${item.id}">${item.title}</option>`).join("")}</select>
          <input name="term" placeholder="单词或短语，例如：potential" required />
          <input name="phonetic" placeholder="音标，例如：/pəˈtenʃl/" />
          <input name="partOfSpeech" placeholder="词性，例如：n./adj." />
          <input name="importance" placeholder="标签，例如：高频" />
          <textarea name="meaning" placeholder="中文释义" required></textarea>
          <textarea name="example" placeholder="例句或原文出处"></textarea>
          <button class="primary-btn" type="submit">加入草稿词库</button>
          <button class="ghost-btn" type="button" id="publishDraft">发布到学生端</button>
        </form>
      </div>
      <div class="card">
        <div class="eyebrow">发布状态</div>
        <h2>官方词库 v${state.version}</h2>
        <p class="subtext">当前班级：${activeClass.code} · ${activeClass.name}；上次发布：${state.publishedAt}</p>
        <div class="grid three">
          ${metric("官方词条", String(collectOfficialWords().length), "学生端只读")}
          ${metric("草稿词条", String(draftWords.length), "后台可编辑")}
          ${metric("平均正确率", `${studentStats.averageAccuracy}%`, "班级复习统计")}
        </div>
      </div>
    </div>
    <div class="grid two" style="margin-top:18px">
      <div class="card">
        <div class="library-head">
          <div>
            <div class="eyebrow">学生正确率</div>
            <h2>${activeClass.name} 学习看板</h2>
          </div>
          <span class="tag blue">${studentStats.rows.length}名学生</span>
        </div>
        <div class="class-filter">
          ${Object.values(classRooms).map((item) => `<button class="chip ${item.code === activeClass.code ? "active" : ""}" data-class-code="${item.code}">${item.code} · ${item.name}</button>`).join("")}
        </div>
        <table class="admin-table">
          <thead><tr><th>学生</th><th>学号</th><th>练习次数</th><th>正确率</th><th>薄弱状态</th></tr></thead>
          <tbody>
            ${studentStats.rows.map((item) => `<tr><td><strong>${item.name}</strong></td><td>${item.studentNo}</td><td>${item.total}</td><td>${item.accuracy}%</td><td>${item.note}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>
      <div class="card">
        <div class="library-head">
          <div>
            <div class="eyebrow">高频错词</div>
            <h2>优先讲评清单</h2>
          </div>
          <span class="tag amber">按错误率排序</span>
        </div>
        <table class="admin-table">
          <thead><tr><th>词条</th><th>来源</th><th>正确率</th><th>错误</th></tr></thead>
          <tbody>
            ${difficultWords.map((item) => `<tr><td><strong>${item.term}</strong></td><td>${item.source}</td><td>${item.accuracy}%</td><td>${item.wrong}</td></tr>`).join("") || `<tr><td colspan="4">暂无错词记录，学生练习后自动生成。</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
    <div class="card" style="margin-top:18px">
      <div class="library-head">
        <div>
          <div class="eyebrow">草稿预览</div>
          <h2>${firstUnit.title}</h2>
        </div>
        <span class="tag blue">${firstUnit.words.length}词条</span>
      </div>
      <table class="admin-table">
        <thead><tr><th>词条</th><th>释义</th><th>词性</th><th>来源</th></tr></thead>
        <tbody>
          ${draftWords.slice(0, 18).map((item) => `<tr><td><strong>${item.term}</strong><br><span class="subtext">${item.phonetic || ""}</span></td><td>${item.meaning}</td><td>${item.partOfSpeech || item.type}</td><td>${item.source}</td></tr>`).join("")}
        </tbody>
      </table>
    </div>
  `;

  const bookSelect = views.admin.querySelector("select[name='book']");
  const unitSelect = views.admin.querySelector("select[name='unit']");
  bookSelect.addEventListener("change", () => {
    const book = state.draft.find((item) => item.id === bookSelect.value);
    unitSelect.innerHTML = book.units.map((item) => `<option value="${item.id}">${item.title}</option>`).join("");
  });
  views.admin.querySelector("#adminForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const book = state.draft.find((item) => item.id === form.get("book"));
    const unitItem = book.units.find((item) => item.id === form.get("unit"));
    unitItem.words.push({
      id: `admin-${Date.now()}`,
      term: String(form.get("term")).trim(),
      phonetic: String(form.get("phonetic")).trim(),
      meaning: String(form.get("meaning")).trim(),
      partOfSpeech: String(form.get("partOfSpeech")).trim(),
      source: `${book.title} · ${unitItem.title}`,
      example: String(form.get("example")).trim(),
      type: "单词",
      importance: String(form.get("importance")).trim() || "普通",
    });
    event.target.reset();
    renderAll();
    showToast("已加入草稿。学生端暂时看不到，发布后生效。");
  });
  views.admin.querySelector("#publishDraft").addEventListener("click", () => {
    state.official = structuredClone(state.draft);
    state.version += 1;
    state.publishedAt = new Date().toLocaleString("zh-CN", { hour12: false });
    renderAll();
    showToast(`已发布官方词库 v${state.version}。学生个人词库未受影响。`);
  });
  views.admin.querySelectorAll("[data-class-code]").forEach((button) => {
    button.addEventListener("click", () => {
      state.adminClassCode = button.dataset.classCode;
      saveState();
      renderAdmin();
    });
  });
}

function renderWordRows(words) {
  if (!words.length) {
    return `<div class="unit-card"><div class="subtext">暂无词条。后台导入后会出现在这里。</div></div>`;
  }
  return words
    .map((item) => {
      const status = state.progress[item.id] || "";
      return `
        <button class="word-row">
          <span class="mastery-dot ${status}"></span>
          <span class="word-main">${item.term}<br><span class="subtext">${item.phonetic || item.partOfSpeech || item.type}</span></span>
          <span class="word-meaning">${item.meaning}</span>
        </button>
      `;
    })
    .join("");
}

function collectOfficialWords() {
  return collectWordsFrom(state.official);
}

function collectWordsFrom(libraries) {
  return libraries.flatMap((book) => book.units.flatMap((unitItem) => unitItem.words));
}

function collectReviewWords() {
  const official = collectOfficialWords().filter(Boolean);
  const personal = state.personal.flatMap((item) => item.words);
  const unknown = official.filter((item) => state.progress[item.id] === "unknown");
  const fuzzy = official.filter((item) => state.progress[item.id] === "fuzzy");
  const fresh = shuffle(official.filter((item) => !state.progress[item.id])).slice(0, 18);
  return shuffle([...unknown, ...fuzzy, ...fresh, ...personal]).slice(0, 28);
}

function buildReviewSession() {
  return collectReviewWords().map((item) => ({
    word: item,
    options: buildMeaningOptions(item),
    answered: false,
    selected: "",
    correct: false,
  }));
}

function buildMeaningOptions(item) {
  const pool = collectOfficialWords()
    .filter((wordItem) => wordItem.id !== item.id && wordItem.type === item.type && wordItem.meaning)
    .map((wordItem) => wordItem.meaning);
  return shuffle([item.meaning, ...shuffle([...new Set(pool)]).slice(0, 3)]);
}

function reviewOption(option, index, card) {
  const selected = card.selected === option;
  const correct = card.word.meaning === option;
  const classes = [
    "choice-btn",
    card.answered && correct ? "correct" : "",
    card.answered && selected && !correct ? "wrong" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `<button class="${classes}" data-choice="${index}" ${card.answered ? "disabled" : ""}>${option}</button>`;
}

function recordAttempt(wordItem, correct, mode, selectedMeaning = "") {
  const currentStudent = getCurrentStudent();
  if (!currentStudent) return;
  const attempt = {
    id: `attempt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    classCode: currentStudent.classCode,
    className: currentStudent.className,
    studentId: currentStudent.id,
    studentName: currentStudent.name,
    studentNo: currentStudent.studentNo,
    wordId: wordItem.id,
    term: wordItem.term,
    source: wordItem.source,
    selectedMeaning,
    correctMeaning: wordItem.meaning,
    correct,
    mastery: state.progress[wordItem.id] || "",
    mode,
    createdAt: new Date().toISOString(),
  };
  state.attempts.push(attempt);
  apiPost("/api/attempts", attempt)
    .then(() => refreshServerStats())
    .catch(() => {});
}

function seedClassStats() {
  return [
    { classCode: "2541", studentId: "2541-01", studentNo: "01", name: "林同学", total: 86, correct: 71, note: "稳定" },
    { classCode: "2541", studentId: "2541-02", studentNo: "02", name: "周同学", total: 64, correct: 42, note: "需巩固短语" },
    { classCode: "2541", studentId: "2541-03", studentNo: "03", name: "陈同学", total: 93, correct: 84, note: "优秀" },
    { classCode: "2541", studentId: "2541-04", studentNo: "04", name: "王同学", total: 48, correct: 29, note: "新词偏弱" },
  ];
}

function getStudentStats() {
  if (serverStats) {
    return {
      rows: serverStats.students.map((item) => ({
        name: item.name,
        studentNo: item.studentNo,
        total: item.total,
        accuracy: item.accuracy,
        note: item.note,
      })),
      averageAccuracy: serverStats.averageAccuracy,
    };
  }
  const classCode = state.adminClassCode || "2541";
  const grouped = new Map();
  state.classStats
    .filter((item) => item.classCode === classCode)
    .forEach((item) => {
      grouped.set(item.studentId, {
        name: item.name,
        studentNo: item.studentNo,
        total: item.total,
        correct: item.correct,
        note: item.note,
      });
    });
  state.students
    .filter((item) => item.classCode === classCode)
    .forEach((item) => {
      if (!grouped.has(item.id)) {
        grouped.set(item.id, {
          name: item.name,
          studentNo: item.studentNo,
          total: 0,
          correct: 0,
          note: "尚未练习",
        });
      }
    });
  state.attempts
    .filter((item) => item.classCode === classCode)
    .forEach((item) => {
      const row = grouped.get(item.studentId) || {
        name: item.studentName,
        studentNo: item.studentNo || "-",
        total: 0,
        correct: 0,
        note: "实时记录",
      };
      row.total += 1;
      row.correct += item.correct ? 1 : 0;
      row.note = "实时记录";
      grouped.set(item.studentId, row);
    });
  const rows = [...grouped.values()]
    .map((item) => ({
      name: item.name,
      studentNo: item.studentNo || "-",
      total: item.total,
      accuracy: item.total ? Math.round((item.correct / item.total) * 100) : 0,
      note: item.note,
    }))
    .sort((a, b) => String(a.studentNo).localeCompare(String(b.studentNo), "zh-CN", { numeric: true }));
  const activeRows = rows.filter((item) => item.total > 0);
  const averageAccuracy = activeRows.length
    ? Math.round(activeRows.reduce((sum, item) => sum + item.accuracy, 0) / activeRows.length)
    : 0;
  return { rows, averageAccuracy };
}

function getDifficultWords() {
  if (serverStats) return serverStats.difficultWords || [];
  const classCode = state.adminClassCode || "2541";
  const map = new Map();
  state.attempts.filter((item) => item.classCode === classCode).forEach((item) => {
    const stats = map.get(item.wordId) || {
      term: item.term,
      source: item.source,
      total: 0,
      correct: 0,
      wrong: 0,
    };
    stats.total += 1;
    stats.correct += item.correct ? 1 : 0;
    stats.wrong += item.correct ? 0 : 1;
    map.set(item.wordId, stats);
  });
  return [...map.values()]
    .filter((item) => item.wrong > 0)
    .map((item) => ({
      ...item,
      accuracy: Math.round((item.correct / item.total) * 100),
    }))
    .sort((a, b) => b.wrong - a.wrong || a.accuracy - b.accuracy)
    .slice(0, 8);
}

function getCurrentStudent() {
  if (!state.currentStudent) return null;
  return state.students.find((item) => item.id === state.currentStudent) || null;
}

function refreshServerStats() {
  const classCode = state.adminClassCode || "2541";
  apiGet(`/api/classes/${classCode}/stats`)
    .then((payload) => {
      serverStats = payload;
      renderAdmin();
    })
    .catch(() => {});
}

async function apiGet(path) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`API ${response.status}`);
  return response.json();
}

async function apiPost(path, payload) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`API ${response.status}`);
  return response.json();
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function countBookWords(book) {
  return book.units.reduce((sum, item) => sum + item.words.length, 0);
}

function unitShortName(title) {
  const match = title.match(/Unit\s+\d+/i);
  return match ? match[0] : title;
}

function showToast(message) {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2600);
}
