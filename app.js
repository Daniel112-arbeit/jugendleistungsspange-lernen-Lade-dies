/* Lernlogik für die Jugendleistungsspange – reine Client-seitige App */

(function () {
  const data = window.LEARNING_DATA;

  if (!data || !Array.isArray(data.groups)) {
    // Hard fail, aber ohne den ganzen Screen zu crashten
    console.error("LEARNING_DATA fehlt oder ist kaputt.");
    document.body.innerHTML =
      "<h1>Fehler: Lern-Daten nicht gefunden.</h1><p>Bitte prüfe, ob <code>questions.js</code> korrekt eingebunden ist.</p>";
    return;
  }

  const els = {
    stepSelectGroups: document.getElementById("stepSelectGroups"),
    stepQuiz: document.getElementById("stepQuiz"),
    stepReveal: document.getElementById("stepReveal"),
    stepSummary: document.getElementById("stepSummary"),

    groupGrid: document.getElementById("groupGrid"),
    btnStart: document.getElementById("btnStart"),
    btnResetSelection: document.getElementById("btnResetSelection"),

    questionTitle: document.getElementById("questionTitle"),
    questionMeta: document.getElementById("questionMeta"),
    answerInput: document.getElementById("answerInput"),
    btnBack: document.getElementById("btnBack"),

    btnSubmitAnswer: document.getElementById("btnSubmitAnswer"),

    revealTitle: document.getElementById("revealTitle"),
    revealMeta: document.getElementById("revealMeta"),
    yourAnswerBox: document.getElementById("yourAnswerBox"),
    solutionBox: document.getElementById("solutionBox"),
    btnBackToEdit: document.getElementById("btnBackToEdit"),

    btnMarkCorrect: document.getElementById("btnMarkCorrect"),
    btnMarkWrong: document.getElementById("btnMarkWrong"),
    btnNextAfterRating: document.getElementById("btnNextAfterRating"),

    progressText: document.getElementById("progressText"),
    progressFill: document.getElementById("progressFill"),
    progressText2: document.getElementById("progressText2"),
    progressFill2: document.getElementById("progressFill2"),

    summaryStats: document.getElementById("summaryStats"),
    wrongList: document.getElementById("wrongList"),
    btnRestart: document.getElementById("btnRestart"),
  };

  const state = {
    selectedGroupIds: new Set(),
    quiz: [], // { groupId, groupTitle, questionId, questionText, solutionText }
    index: 0,

    userAnswers: new Map(), // key = questionId => string
    ratings: new Map(), // key = questionId => "correct" | "wrong"
    // autoCorrectCache: key = questionId => boolean
    autoCorrectCache: new Map(),
  };

  function normalize(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function isAutoCorrect(user, solution) {
    const u = normalize(user);
    const a = normalize(solution);

    if (!u) return false;

    // Strengster Fall: exakt (nach Normalisierung)
    if (u === a) return true;

    // Hilfsfall: Inhalt enthält sich (hilft bei Zeilenumbrüchen/Listen)
    if (a && u.length >= 6 && u.includes(a.slice(0, Math.min(a.length, 60)))) return true;
    if (u && a.length >= 6 && a.includes(u.slice(0, Math.min(u.length, 60)))) return true;

    return false;
  }

  function setStep(stepName) {
    const map = {
      select: els.stepSelectGroups,
      quiz: els.stepQuiz,
      reveal: els.stepReveal,
      summary: els.stepSummary,
    };

    for (const key of Object.keys(map)) {
      map[key].style.display = key === stepName ? "" : "none";
    }
  }

  function setProgress(idx, total) {
    const pct = total <= 0 ? 0 : Math.round(((idx + 1) / total) * 100);
    els.progressText.textContent = `${idx + 1} / ${total} (${pct}%)`;
    els.progressFill.style.width = `${pct}%`;

    els.progressText2.textContent = `${idx + 1} / ${total} (${pct}%)`;
    els.progressFill2.style.width = `${pct}%`;
  }

  function renderGroupGrid() {
    els.groupGrid.innerHTML = "";

    const groups = data.groups;

    for (const group of groups) {
      const id = `group_${group.id}`;
      const card = document.createElement("label");
      card.className = "groupCard";
      card.setAttribute("for", id);
      card.tabIndex = 0;

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = id;
      checkbox.value = String(group.id);
      checkbox.className = "groupCard__input";

      const title = document.createElement("div");
      title.className = "groupCard__title";
      title.textContent = group.title;

      const meta = document.createElement("div");
      meta.className = "groupCard__meta";
      const count = Array.isArray(group.questions) ? group.questions.length : 0;
      meta.textContent = `${count} Fragen`;

      card.appendChild(checkbox);
      card.appendChild(title);
      card.appendChild(meta);

      checkbox.addEventListener("change", () => {
        const checked = checkbox.checked;
        if (checked) state.selectedGroupIds.add(group.id);
        else state.selectedGroupIds.delete(group.id);

        const selectedCount = state.selectedGroupIds.size;
        els.btnStart.disabled = selectedCount === 0;
        els.btnResetSelection.style.display = selectedCount === 0 ? "none" : "";
      });

      els.groupGrid.appendChild(card);
    }

    els.btnStart.disabled = true;
    els.btnResetSelection.style.display = "none";
  }

  function buildQuiz() {
    const selectedIds = state.selectedGroupIds;
    const quiz = [];

    for (const group of data.groups) {
      if (!selectedIds.has(group.id)) continue;
      for (const q of group.questions) {
        quiz.push({
          groupId: group.id,
          groupTitle: group.title,
          questionId: q.id,
          questionText: q.text,
          solutionText: q.answer,
        });
      }
    }

    return quiz;
  }

  function currentQuestion() {
    return state.quiz[state.index];
  }

  function updateQuestionUI() {
    const q = currentQuestion();
    const total = state.quiz.length;

    els.questionTitle.textContent = q.questionText;
    els.questionMeta.textContent = `${q.groupTitle} • Frage ${state.index + 1} von ${total}`;

    const saved = state.userAnswers.get(q.questionId);
    els.answerInput.value = saved ? saved : "";
  }

  function showReveal() {
    const q = currentQuestion();
    const total = state.quiz.length;
    setProgress(state.index, total);

    const userAnswer = state.userAnswers.get(q.questionId) || "";

    els.revealTitle.textContent = "Lösung & Vergleich";
    els.revealMeta.textContent = `${q.groupTitle} • Frage ${state.index + 1} von ${total}`;

    els.yourAnswerBox.textContent = userAnswer.trim() ? userAnswer.trim() : "— (keine Eingabe)";
    els.solutionBox.textContent = q.solutionText.trim();

    // Automatische Einschätzung (nur Hinweis, nicht die endgültige Bewertung)
    const auto = state.autoCorrectCache.get(q.questionId);
    if (typeof auto === "boolean") {
      els.revealMeta.textContent += auto
        ? " • Automatisch: sieht richtig aus ✅"
        : " • Automatisch: sieht eher falsch aus ⚠️";
    }

    // Rating-Buttons zurücksetzen
    els.btnMarkCorrect.classList.remove("btn--active");
    els.btnMarkWrong.classList.remove("btn--active");
    els.btnNextAfterRating.disabled = true;

    const rating = state.ratings.get(q.questionId);
    if (rating === "correct") {
      els.btnMarkCorrect.classList.add("btn--active");
      els.btnNextAfterRating.disabled = false;
    } else if (rating === "wrong") {
      els.btnMarkWrong.classList.add("btn--active");
      els.btnNextAfterRating.disabled = false;
    }
  }

  function renderSummary() {
    const total = state.quiz.length;
    let correctCount = 0;
    let wrongCount = 0;

    for (const item of state.quiz) {
      const r = state.ratings.get(item.questionId);
      if (r === "correct") correctCount++;
      if (r === "wrong") wrongCount++;
    }

    const pct = total <= 0 ? 0 : Math.round((correctCount / total) * 100);

    els.summaryStats.innerHTML = `
      <div class="statGrid">
        <div class="stat">
          <div class="stat__num">${total}</div>
          <div class="stat__label">Fragen gesamt</div>
        </div>
        <div class="stat">
          <div class="stat__num stat__num--good">${correctCount}</div>
          <div class="stat__label">Von dir als richtig markiert</div>
        </div>
        <div class="stat">
          <div class="stat__num stat__num--bad">${wrongCount}</div>
          <div class="stat__label">Von dir als falsch markiert</div>
        </div>
        <div class="stat">
          <div class="stat__num">${pct}%</div>
          <div class="stat__label">Richtig (deine Bewertung)</div>
        </div>
      </div>
    `;

    els.wrongList.innerHTML = "";

    const wrongItems = state.quiz.filter((q) => state.ratings.get(q.questionId) === "wrong");

    if (wrongItems.length === 0) {
      const empty = document.createElement("div");
      empty.className = "emptyBox";
      empty.textContent = "Alles gut! Keine falsch markierten Antworten.";
      els.wrongList.appendChild(empty);
    } else {
      for (const item of wrongItems) {
        const row = document.createElement("div");
        row.className = "wrongRow";

        const qTitle = document.createElement("div");
        qTitle.className = "wrongRow__q";
        qTitle.textContent = item.questionText;

        const a = state.userAnswers.get(item.questionId) || "";
        const ansWrap = document.createElement("div");
        ansWrap.className = "wrongRow__a";

        const line1 = document.createElement("div");
        const tagYourAnswer = document.createElement("span");
        tagYourAnswer.className = "tag";
        tagYourAnswer.textContent = "Deine Antwort";
        line1.appendChild(tagYourAnswer);

        const yourText = a.trim() ? a.trim() : "—";
        line1.appendChild(document.createTextNode(" " + yourText));

        const solutionLine = document.createElement("div");
        solutionLine.className = "wrongRow__solution";

        const tagSolution = document.createElement("span");
        tagSolution.className = "tag tag--solution";
        tagSolution.textContent = "Lösung";

        solutionLine.appendChild(tagSolution);
        solutionLine.appendChild(
          document.createTextNode(" " + (item.solutionText.trim() || ""))
        );

        ansWrap.appendChild(line1);
        ansWrap.appendChild(solutionLine);

        row.appendChild(qTitle);
        row.appendChild(ansWrap);

        els.wrongList.appendChild(row);
      }
    }

    setStep("summary");
  }

  // Hinweis: Keine eigene HTML-Escaping-Utility nötig/erlaubt.
  // Wir bauen die Ergebnisliste per DOM + textContent (keine innerHTML-Strings).

  function startQuiz() {
    if (state.selectedGroupIds.size === 0) return;

    state.quiz = buildQuiz();
    state.index = 0;
    state.userAnswers.clear();
    state.ratings.clear();
    state.autoCorrectCache.clear();

    for (const q of state.quiz) {
      const existing = state.userAnswers.get(q.questionId);
      void existing;
      // autoCorrect cache wird beim ersten Submit gesetzt
    }

    setStep("quiz");
    updateQuestionUI();
    setProgress(state.index, state.quiz.length);
    els.btnBack.style.display = "";
  }

  function submitAnswerAndReveal() {
    const q = currentQuestion();
    const total = state.quiz.length;

    const userAnswer = els.answerInput.value || "";
    state.userAnswers.set(q.questionId, userAnswer);

    const auto = isAutoCorrect(userAnswer, q.solutionText);
    state.autoCorrectCache.set(q.questionId, auto);

    setStep("reveal");
    setProgress(state.index, total);
    showReveal();
  }

  function goBackToEdit() {
    setStep("quiz");
    updateQuestionUI();
    setProgress(state.index, state.quiz.length);
  }

  function setRating(rating) {
    const q = currentQuestion();
    state.ratings.set(q.questionId, rating);

    els.btnMarkCorrect.classList.remove("btn--active");
    els.btnMarkWrong.classList.remove("btn--active");

    if (rating === "correct") {
      els.btnMarkCorrect.classList.add("btn--active");
    } else if (rating === "wrong") {
      els.btnMarkWrong.classList.add("btn--active");
    }

    els.btnNextAfterRating.disabled = false;
  }

  function nextAfterRating() {
    state.index++;
    if (state.index >= state.quiz.length) {
      renderSummary();
      return;
    }

    setStep("quiz");
    updateQuestionUI();
    setProgress(state.index, state.quiz.length);
  }

  function resetAll() {
    state.selectedGroupIds.clear();
    state.quiz = [];
    state.index = 0;
    state.userAnswers.clear();
    state.ratings.clear();
    state.autoCorrectCache.clear();

    renderGroupGrid();
    // Auf Startstep
    setStep("select");
  }

  function attachEvents() {
    els.btnStart.addEventListener("click", () => {
      startQuiz();
    });

    els.btnResetSelection.addEventListener("click", () => {
      resetAll();
    });

    els.btnSubmitAnswer.addEventListener("click", () => {
      submitAnswerAndReveal();
    });

    els.btnBack.addEventListener("click", () => {
      // In der Quiz-Ansicht gibt es "Zurück" derzeit nur als Platzhalter;
      // Wir lassen es einfach deaktiviert, falls kein sinnvoller Zustand.
      // (Daher: no-op)
    });

    els.btnBackToEdit.addEventListener("click", () => {
      goBackToEdit();
    });

    els.btnMarkCorrect.addEventListener("click", () => {
      setRating("correct");
    });

    els.btnMarkWrong.addEventListener("click", () => {
      setRating("wrong");
    });

    els.btnNextAfterRating.addEventListener("click", () => {
      nextAfterRating();
    });

    els.btnRestart.addEventListener("click", () => {
      resetAll();
    });

    // Enter-Shortcut: in Textarea nicht immer senden; daher nur wenn Fokus nicht textarea?
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      if (document.activeElement === els.answerInput) return;
    });
  }

  function init() {
    renderGroupGrid();
    attachEvents();
    setStep("select");
  }

  init();
})();
