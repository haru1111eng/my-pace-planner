const $ = (id) => document.getElementById(id);

let tasks = [];
let nextId = 1;
let selectedTaskId = null;
let proposals = {};
let subtasksByTask = {};
let expandedTaskId = null;

let planningTimerRemaining = 300;
let planningTimerInterval = null;
let restDuration = 5;
let restRemaining = 300;
let restInterval = null;
let restRunning = false;
let toastTimeout = null;
let lastDateKey = dateKey(new Date());

function dateKey(date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}
function timeToMinutes(time) {
  if (!time || !time.includes(":")) return null;
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
function minutesToTime(total) {
  const safe = ((Math.round(total) % 1440) + 1440) % 1440;
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}
function addMinutesToTime(time, minutes) {
  const base = timeToMinutes(time);
  return base === null ? time : minutesToTime(base + minutes);
}
function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}時間${m > 0 ? `${m}分` : ""}` : `${m}分`;
}
function currentMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}
function formatClock(seconds) {
  const safe = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}
function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("show"), 2600);
}
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char]));
}
function getTask(id) {
  return tasks.find(task => task.id === Number(id));
}
function sortedTasks(day) {
  return tasks
    .filter(task => task.day === day)
    .sort((a, b) => (timeToMinutes(a.time) ?? 0) - (timeToMinutes(b.time) ?? 0));
}
function priorityLabel(priority) {
  return priority === "high" ? "優先度：高" : priority === "low" ? "優先度：低" : "優先度：ふつう";
}
function addTask(data) {
  const task = {
    id: nextId++,
    name: data.name.trim(),
    day: data.day,
    time: data.time,
    duration: Math.max(1, Number(data.duration) || 30),
    priority: data.priority || "normal",
    deadline: data.deadline || "",
    completed: false,
    subtasks: []
  };
  tasks.push(task);
  return task;
}
function initializeDefaultTimes() {
  const now = new Date();
  const start1 = minutesToTime(currentMinutes() + 20);
  const start2 = minutesToTime(currentMinutes() + 90);
  const start3 = minutesToTime(currentMinutes() + 150);
  addTask({ name: "今日の予定を確認する", day: "today", time: start1, duration: 10, priority: "high" });
  addTask({ name: "課題を少し進める", day: "today", time: start2, duration: 30, priority: "normal" });
  addTask({ name: "持ち物を確認する", day: "today", time: start3, duration: 15, priority: "low" });
}
function updateClock() {
  const now = new Date();
  $("clock").textContent = now.toLocaleTimeString("ja-JP", { hour12: false });
  $("todayDate").textContent = now.toLocaleDateString("ja-JP", {
    year: "numeric", month: "long", day: "numeric", weekday: "short"
  });
  const currentKey = dateKey(now);
  if (currentKey !== lastDateKey) {
    lastDateKey = currentKey;
    showToast("日付が変わりました。今日の予定を確認しましょう。");
  }
  updateCurrentTask();
  updateCountdowns();
}
function updateCurrentTask() {
  const task = getTask(selectedTaskId);
  if (!task || task.day !== "today" || task.completed) {
    $("currentTaskName").textContent = "まだ予定が選ばれていません";
    $("currentTaskDetail").textContent = "今日の予定一覧から、取り組みたいものを選べます。";
    $("completeTaskButton").disabled = true;
    $("breakdownButton").disabled = true;
    $("delayButton").disabled = true;
    return;
  }
  $("currentTaskName").textContent = task.name;
  $("currentTaskDetail").textContent = `${task.time}から・予定時間 ${formatDuration(task.duration)}・${priorityLabel(task.priority)}`;
  $("completeTaskButton").disabled = false;
  $("breakdownButton").disabled = false;
  $("delayButton").disabled = false;
}
function updateCountdowns() {
  const task = getTask(selectedTaskId);
  const taskCountdown = $("taskCountdown");
  const deadlineCountdown = $("deadlineCountdown");
  taskCountdown.className = "";
  deadlineCountdown.className = "";
  if (!task || task.day !== "today" || task.completed) {
    taskCountdown.textContent = "--:--";
    deadlineCountdown.textContent = "--";
    return;
  }
  const now = new Date();
  const nowSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  let endSeconds = (timeToMinutes(task.time) + task.duration) * 60;
  if (endSeconds >= 24 * 3600) endSeconds -= 24 * 3600;
  let diff = endSeconds - nowSeconds;
  if (diff < -12 * 3600) diff += 24 * 3600;
  if (diff <= 0) {
    taskCountdown.textContent = "予定時間を過ぎています";
    taskCountdown.classList.add("countdown-danger");
  } else {
    taskCountdown.textContent = formatClock(diff);
    if (diff <= 5 * 60) taskCountdown.classList.add("countdown-danger");
    else if (diff <= 15 * 60) taskCountdown.classList.add("countdown-warning");
  }
  if (!task.deadline) {
    deadlineCountdown.textContent = "設定なし";
  } else {
    let deadlineDiff = (timeToMinutes(task.deadline) * 60) - nowSeconds;
    if (deadlineDiff < -12 * 3600) deadlineDiff += 24 * 3600;
    if (deadlineDiff <= 0) {
      deadlineCountdown.textContent = "時間を過ぎています";
      deadlineCountdown.classList.add("countdown-danger");
    } else {
      deadlineCountdown.textContent = formatClock(deadlineDiff);
      if (deadlineDiff <= 30 * 60) deadlineCountdown.classList.add("countdown-danger");
      else if (deadlineDiff <= 60 * 60) deadlineCountdown.classList.add("countdown-warning");
    }
  }
}
function renderTaskList(day, containerId) {
  const container = $(containerId);
  const list = sortedTasks(day);
  if (list.length === 0) {
    container.innerHTML = `<div class="empty-message">今日の予定はまだありません。下から追加できます。</div>`;
    return;
  }
  container.innerHTML = list.map(task => {
    const selected = selectedTaskId === task.id;
    const proposal = proposals[task.id];
    return `
      <article class="task-item ${selected ? "selected" : ""} ${task.completed ? "completed" : ""}">
        <div class="task-main">
          <p class="task-title ${task.completed ? "done" : ""}">${escapeHTML(task.name)}</p>
          <div class="task-meta">
            <span>${escapeHTML(task.time)}〜${escapeHTML(addMinutesToTime(task.time, task.duration))}</span>
            <span>${escapeHTML(formatDuration(task.duration))}</span>
            <span>${escapeHTML(priorityLabel(task.priority))}</span>
            ${task.deadline ? `<span>締め切り ${escapeHTML(task.deadline)}</span>` : ""}
            ${task.completed ? `<span>✓ 完了</span>` : ""}
          </div>
          ${proposal ? `<p class="proposal-note">変更案：${escapeHTML(proposal.oldTime)} → ${escapeHTML(proposal.newTime)}（15分ずらす）</p>
          <div class="task-actions proposal-actions">
            <button class="small-button" data-action="accept-delay" data-id="${task.id}">この案にする</button>
            <button class="small-button" data-action="reject-delay" data-id="${task.id}">やめる</button>
          </div>` : ""}
        </div>
        <div class="task-actions">
          ${day === "today" && !task.completed ? `<button class="small-button" data-action="select" data-id="${task.id}">これを選ぶ</button>
          <button class="small-button" data-action="done" data-id="${task.id}">完了</button>` : ""}
          <button class="small-button delete" data-action="delete" data-id="${task.id}">削除</button>
        </div>
      </article>`;
  }).join("");
}
function renderProgress() {
  const today = tasks.filter(task => task.day === "today");
  const completed = today.filter(task => task.completed).length;
  const remaining = today.length - completed;
  const percent = today.length ? Math.round(completed / today.length * 100) : 0;
  $("completedCount").textContent = completed;
  $("remainingCount").textContent = remaining;
  $("progressPercent").textContent = `${percent}%`;
  $("progressBar").style.width = `${percent}%`;
  $("progressMessage").textContent = today.length === 0
    ? "予定を一つ登録するところから始めよう。"
    : completed === today.length
      ? "今日の予定をすべて完了！島もいちばん賑やかになったよ。"
      : completed > 0
        ? "一歩進められたね。島にも新しい変化が生まれたよ。"
        : "小さな一歩から始めよう。予定どおりでなくても大丈夫。";

  const stage = Math.min(5, completed);
  const scene = $("islandScene");
  scene.className = `island-scene stage-${stage}`;
  const stageLabels = ["まだ小さな島", "芽が出たよ！", "木が育ってきた！", "花が咲いたよ！", "島に小さな家ができた！", "島がにぎやかになった！"];
  $("islandStageLabel").textContent = stageLabels[stage];
}
function renderAll() {
  renderTaskList("today", "todayTasks");
  renderProgress();
  updateCurrentTask();
  updateCountdowns();
  renderSubtasks();
}
function selectTask(id) {
  const task = getTask(id);
  if (!task || task.day !== "today" || task.completed) return;
  selectedTaskId = task.id;
  $("nextActionSection").classList.add("hidden");
  $("proposalArea").classList.add("hidden");
  $("subtaskArea").classList.add("hidden");
  expandedTaskId = null;
  renderAll();
  showToast(`「${task.name}」を選びました。`);
}
function completeTask(id) {
  const task = getTask(id);
  if (!task || task.completed) return;
  task.completed = true;
  if (selectedTaskId === task.id) selectedTaskId = null;
  proposals[task.id] = null;
  renderAll();
  $("nextActionSection").classList.remove("hidden");
  $("restPanel").classList.add("hidden");
  $("taskPickerPanel").classList.add("hidden");
  $("nextActionTitle").textContent = "目標達成！";
  $("nextActionText").textContent = `「${task.name}」が完了しました。お疲れさま！次はどうする？`;
  $("nextActionSection").scrollIntoView({ behavior: "smooth", block: "center" });
  showToast("完了！次の行動は自分で選べます。");
}
function completeSelectedTask() {
  if (selectedTaskId === null) return;
  completeTask(selectedTaskId);
}
function deleteTask(id) {
  const task = getTask(id);
  if (!task) return;
  if (!confirm(`「${task.name}」を削除しますか？`)) return;
  tasks = tasks.filter(item => item.id !== task.id);
  delete proposals[task.id];
  delete subtasksByTask[task.id];
  if (selectedTaskId === task.id) selectedTaskId = null;
  renderAll();
  showToast("予定を削除しました。");
}
function proposeDelay(id) {
  const task = getTask(id);
  if (!task || task.day !== "today" || task.completed) return;
  const oldTime = task.time;
  const newTime = addMinutesToTime(oldTime, 15);
  const newStart = timeToMinutes(newTime);
  const newEnd = newStart + task.duration;
  const conflicts = tasks.filter(other => {
    if (other.id === task.id || other.day !== "today" || other.completed) return false;
    const otherStart = timeToMinutes(other.time);
    const otherEnd = otherStart + other.duration;
    return newStart < otherEnd && newEnd > otherStart;
  });
  proposals[task.id] = { oldTime, newTime, conflicts: conflicts.map(item => item.name) };
  $("proposalArea").classList.remove("hidden");
  $("proposalArea").innerHTML = `
    <strong>15分ずらす案</strong>
    <p>${escapeHTML(task.name)}：${escapeHTML(oldTime)} → ${escapeHTML(newTime)}</p>
    ${conflicts.length ? `<p class="proposal-warning">この時間には「${conflicts.map(item => escapeHTML(item.name)).join("」「")}」と重なる可能性があります。採用するか確認してください。</p>` : `<p>ほかの予定との重なりは見つかりませんでした。</p>`}
    <div class="button-row">
      <button class="button primary" id="acceptCurrentProposal" type="button">この案にする</button>
      <button class="button secondary" id="rejectCurrentProposal" type="button">今回はやめる</button>
    </div>`;
  $("acceptCurrentProposal").addEventListener("click", () => acceptProposal(task.id));
  $("rejectCurrentProposal").addEventListener("click", () => rejectProposal(task.id));
}
function acceptProposal(id) {
  const task = getTask(id);
  const proposal = proposals[id];
  if (!task || !proposal) return;
  if (proposal.conflicts.length && !confirm("ほかの予定と重なる可能性があります。それでもこの時間に変更しますか？")) return;
  task.time = proposal.newTime;
  delete proposals[id];
  $("proposalArea").classList.add("hidden");
  renderAll();
  showToast("予定を変更しました。");
}
function rejectProposal(id) {
  delete proposals[id];
  $("proposalArea").classList.add("hidden");
  renderAll();
  showToast("予定は変更していません。");
}
function makeSubtasks(task) {
  const name = task.name;
  if (/レポート|作文|文章|レジュメ/.test(name)) return ["資料や課題の条件を確認する", "書く内容を箇条書きにする", "見出しを作る", "本文を一段落だけ書く"];
  if (/勉強|テスト|試験|英語|課題/.test(name)) return ["必要な教材を用意する", "範囲や問題を一つ確認する", "15分だけ取り組む", "できたところを確認する"];
  if (/発表|プレゼン|スライド/.test(name)) return ["伝えたいことを一つ決める", "構成を箇条書きにする", "最初のスライドを作る", "全体を見直す"];
  if (/掃除|片付け|整理/.test(name)) return ["必要な道具を用意する", "一か所だけ片付ける", "不要なものを分ける", "終わった場所を確認する"];
  return ["始めるための準備をする", "最初の小さな作業をする", "少し進んだところを確認する"];
}
function toggleSubtasks() {
  const task = getTask(selectedTaskId);
  if (!task) return;
  if (!subtasksByTask[task.id]) {
    subtasksByTask[task.id] = makeSubtasks(task).map((text, index) => ({ id: index + 1, text, done: false }));
  }
  expandedTaskId = expandedTaskId === task.id ? null : task.id;
  renderSubtasks();
}
function renderSubtasks() {
  const area = $("subtaskArea");
  const task = getTask(expandedTaskId);
  if (!task) {
    area.classList.add("hidden");
    area.innerHTML = "";
    return;
  }
  const subtasks = subtasksByTask[task.id] || [];
  const subtaskDone = subtasks.filter(item => item.done).length;
  area.classList.remove("hidden");
  area.innerHTML = `
    <h3>「${escapeHTML(task.name)}」を小さく分ける</h3>
    <p class="muted small">作業名の編集・追加・削除ができます。自分に合う手順に変えてね。</p>
    <p class="subtask-progress">小さな作業：${subtaskDone} / ${subtasks.length} 完了</p>
    <div class="subtask-list">
      ${subtasks.map(item => `<div class="subtask-row">
        <input type="checkbox" data-subtask-id="${item.id}" aria-label="${escapeHTML(item.text)}を完了にする" ${item.done ? "checked" : ""}>
        <span class="${item.done ? "subtask-done" : ""}">${escapeHTML(item.text)}</span>
        <div class="subtask-actions">
          <button class="small-button" data-edit-subtask="${item.id}" type="button">編集</button>
          <button class="small-button delete" data-delete-subtask="${item.id}" type="button">削除</button>
        </div>
      </div>`).join("")}
      ${subtasks.length ? "" : `<p class="muted small">まだ作業がありません。下から追加できます。</p>`}
    </div>
    <form id="subtaskForm" class="subtask-add-form">
      <input id="newSubtaskText" type="text" placeholder="小さな作業を追加" maxlength="100" required>
      <button class="button secondary" type="submit">追加</button>
    </form>`;
  area.querySelectorAll("[data-subtask-id]").forEach(input => {
    input.addEventListener("change", () => {
      const item = subtasks.find(sub => sub.id === Number(input.dataset.subtaskId));
      if (item) item.done = input.checked;
      renderSubtasks();
      renderProgress();
    });
  });
  area.querySelectorAll("[data-edit-subtask]").forEach(button => {
    button.addEventListener("click", () => {
      const item = subtasks.find(sub => sub.id === Number(button.dataset.editSubtask));
      if (!item) return;
      const edited = prompt("作業名を編集してください", item.text);
      if (edited === null) return;
      if (!edited.trim()) {
        showToast("作業名が空なので変更しませんでした。");
        return;
      }
      item.text = edited.trim().slice(0, 100);
      renderSubtasks();
      showToast("作業名を変更しました。");
    });
  });
  area.querySelectorAll("[data-delete-subtask]").forEach(button => {
    button.addEventListener("click", () => {
      const itemId = Number(button.dataset.deleteSubtask);
      const item = subtasks.find(sub => sub.id === itemId);
      if (!item || !confirm(`「${item.text}」を削除しますか？`)) return;
      subtasksByTask[task.id] = subtasks.filter(sub => sub.id !== itemId);
      renderSubtasks();
      showToast("小さな作業を削除しました。");
    });
  });
  $("subtaskForm").addEventListener("submit", event => {
    event.preventDefault();
    const input = $("newSubtaskText");
    const text = input.value.trim();
    if (!text) return;
    subtasks.push({ id: Math.max(0, ...subtasks.map(item => item.id)) + 1, text: text.slice(0, 100), done: false });
    renderSubtasks();
    showToast("小さな作業を追加しました。");
  });
}
function showTaskPicker() {
  $("restPanel").classList.add("hidden");
  $("taskPickerPanel").classList.remove("hidden");
  const choices = tasks.filter(task => task.day === "today" && !task.completed).sort((a, b) => {
    const p = { high: 0, normal: 1, low: 2 };
    return p[a.priority] - p[b.priority] || (timeToMinutes(a.time) ?? 0) - (timeToMinutes(b.time) ?? 0);
  });
  const container = $("nextTaskChoices");
  if (!choices.length) {
    container.innerHTML = `<div class="empty-message">選べる予定がありません。今日の予定を追加するか、少し休憩しても大丈夫です。</div>`;
    return;
  }
  container.innerHTML = choices.map(task => `
    <article class="task-item">
      <div class="task-main">
        <p class="task-title">${escapeHTML(task.name)}</p>
        <div class="task-meta"><span>${escapeHTML(task.time)}</span><span>${escapeHTML(formatDuration(task.duration))}</span></div>
      </div>
      <button class="small-button goal-button" data-pick-task="${task.id}" type="button">これを選ぶ</button>
    </article>`).join("");
  container.querySelectorAll("[data-pick-task]").forEach(button => {
    button.addEventListener("click", () => {
      selectTask(Number(button.dataset.pickTask));
      $("nextActionSection").classList.add("hidden");
      showToast("次に取り組む予定を選びました。");
    });
  });
}
function chooseBreak() {
  $("taskPickerPanel").classList.add("hidden");
  $("restPanel").classList.remove("hidden");
  stopRestTimer();
  restDuration = 5;
  restRemaining = 300;
  updateRestDisplay();
  document.querySelectorAll(".rest-duration").forEach(button => button.classList.toggle("active", button.dataset.minutes === "5"));
}
function chooseTaskFromNext() {
  showTaskPicker();
}
function updateRestDisplay() {
  $("restCountdown").textContent = formatClock(restRemaining);
  $("restStatus").textContent = restRunning ? "休憩中" : restRemaining === 0 ? "休憩終了" : "休憩時間";
  $("startRestButton").textContent = restRunning ? "休憩中…" : restRemaining < restDuration * 60 ? "休憩を再開" : "休憩を始める";
  $("startRestButton").disabled = restRunning || restRemaining === 0;
}
function stopRestTimer() {
  if (restInterval) clearInterval(restInterval);
  restInterval = null;
  restRunning = false;
}
function startRest() {
  if (restRunning) return;
  if (restRemaining <= 0) restRemaining = restDuration * 60;
  restRunning = true;
  updateRestDisplay();
  restInterval = setInterval(() => {
    restRemaining--;
    updateRestDisplay();
    if (restRemaining <= 0) {
      stopRestTimer();
      restRemaining = 0;
      updateRestDisplay();
      showToast("休憩終了！次にすることをもう一度選ぼう。");
      $("nextActionText").textContent = "休憩お疲れさま！次はどうする？";
    }
  }, 1000);
}
function finishRestAndChoose() {
  stopRestTimer();
  restRemaining = 0;
  updateRestDisplay();
  $("nextActionText").textContent = "休憩を終了しました。次にすることを選ぼう。";
  $("restPanel").classList.add("hidden");
  $("taskPickerPanel").classList.add("hidden");
  $("nextActionSection").classList.remove("hidden");
  showToast("次の行動を選べます。");
}
function selectRestDuration(minutes) {
  if (restRunning) stopRestTimer();
  restDuration = minutes;
  restRemaining = minutes * 60;
  document.querySelectorAll(".rest-duration").forEach(button => button.classList.toggle("active", Number(button.dataset.minutes) === minutes));
  updateRestDisplay();
}
function addTaskFromForm() {
  const name = $("todayTaskName").value.trim();
  const time = $("todayTaskTime").value;
  const duration = Number($("todayTaskDuration").value);
  const priority = $("todayTaskPriority").value;
  const deadline = $("todayTaskDeadline").value;
  if (!name || !time || !duration || duration < 1) {
    showToast("やること・開始時刻・予定時間を入力してください。");
    return;
  }
  addTask({ name, time, duration, priority, deadline, day: "today" });
  $("todayTaskForm").reset();
  $("todayTaskTime").value = minutesToTime(currentMinutes() + 30);
  $("todayTaskDuration").value = 30;
  renderAll();
  showToast("今日の予定を追加しました。");
}
function startPlanningTimer() {
  if (planningTimerInterval) return;
  if (planningTimerRemaining <= 0) planningTimerRemaining = 300;
  $("planningTimerMessage").textContent = "予定を整理中。焦らず自分のペースで。";
  $("startPlanningTimerButton").textContent = "再開";
  $("planningTimerChoices").classList.add("hidden");
  planningTimerInterval = setInterval(() => {
    planningTimerRemaining--;
    $("planningTimerDisplay").textContent = formatClock(planningTimerRemaining);
    if (planningTimerRemaining <= 0) {
      clearInterval(planningTimerInterval);
      planningTimerInterval = null;
      planningTimerRemaining = 0;
      $("planningTimerDisplay").textContent = "00:00";
      $("planningTimerMessage").textContent = "予定の整理はここまで。次にすることを選ぼう。";
      $("startPlanningTimerButton").textContent = "もう一度整理する";
      $("planningTimerChoices").classList.remove("hidden");
      $("planningTimerChoices").scrollIntoView({ behavior: "smooth", block: "center" });
      showToast("5分間お疲れさま！次の行動を選ぼう。");
    }
  }, 1000);
}
function pausePlanningTimer() {
  if (planningTimerInterval) clearInterval(planningTimerInterval);
  planningTimerInterval = null;
  $("planningTimerMessage").textContent = "一時停止中。準備ができたら再開できます。";
  $("startPlanningTimerButton").textContent = "再開";
}
function resetPlanningTimer() {
  if (planningTimerInterval) clearInterval(planningTimerInterval);
  planningTimerInterval = null;
  planningTimerRemaining = 300;
  $("planningTimerDisplay").textContent = "05:00";
  $("planningTimerMessage").textContent = "5分だけ、今日の予定を見直してみよう。";
  $("startPlanningTimerButton").textContent = "整理を始める";
  $("planningTimerChoices").classList.add("hidden");
}
function planningChooseTask() {
  $("nextActionSection").classList.remove("hidden");
  $("nextActionTitle").textContent = "今日の予定を選ぼう";
  $("nextActionText").textContent = "今の自分が取り組めそうな予定を一つ選んでください。";
  $("restPanel").classList.add("hidden");
  showTaskPicker();
  $("nextActionSection").scrollIntoView({ behavior: "smooth", block: "center" });
}
function planningAddTask() {
  $("todaySection").scrollIntoView({ behavior: "smooth", block: "start" });
  window.setTimeout(() => $("todayTaskName").focus(), 400);
  showToast("今日の予定を追加できます。");
}
function planningTakeBreak() {
  $("nextActionSection").classList.remove("hidden");
  $("nextActionTitle").textContent = "少し休憩しよう";
  $("nextActionText").textContent = "予定の整理、お疲れさま。休憩時間を選んでね。";
  chooseBreak();
  $("nextActionSection").scrollIntoView({ behavior: "smooth", block: "center" });
}

function bindEvents() {
  $("todayTaskForm").addEventListener("submit", event => {
    event.preventDefault();
    addTaskFromForm();
  });
  $("todayTasks").addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const id = Number(button.dataset.id);
    const action = button.dataset.action;
    if (action === "select") selectTask(id);
    if (action === "done") completeTask(id);
    if (action === "delete") deleteTask(id);
    if (action === "accept-delay") acceptProposal(id);
    if (action === "reject-delay") rejectProposal(id);
  });
  $("completeTaskButton").addEventListener("click", completeSelectedTask);
  $("breakdownButton").addEventListener("click", toggleSubtasks);
  $("delayButton").addEventListener("click", () => proposeDelay(selectedTaskId));
  $("chooseBreakButton").addEventListener("click", chooseBreak);
  $("chooseTaskButton").addEventListener("click", chooseTaskFromNext);
  $("backToNextActionButton").addEventListener("click", () => {
    $("taskPickerPanel").classList.add("hidden");
  });
  document.querySelectorAll(".rest-duration").forEach(button => {
    button.addEventListener("click", () => selectRestDuration(Number(button.dataset.minutes)));
  });
  $("startRestButton").addEventListener("click", startRest);
  $("endRestButton").addEventListener("click", finishRestAndChoose);
  $("startPlanningTimerButton").addEventListener("click", startPlanningTimer);
  $("pausePlanningTimerButton").addEventListener("click", pausePlanningTimer);
  $("resetPlanningTimerButton").addEventListener("click", resetPlanningTimer);
  $("planningChooseTaskButton").addEventListener("click", planningChooseTask);
  $("planningAddTaskButton").addEventListener("click", planningAddTask);
  $("planningTakeBreakButton").addEventListener("click", planningTakeBreak);
}
function setInitialFormTimes() {
  $("todayTaskTime").value = minutesToTime(currentMinutes() + 30);
}
initializeDefaultTimes();
setInitialFormTimes();
bindEvents();
renderAll();
updateClock();
updateRestDisplay();
setInterval(updateClock, 1000);
