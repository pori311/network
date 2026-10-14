// Firebase SDK ES Modules Import
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  onSnapshot, 
  deleteDoc, 
  doc, 
  updateDoc, 
  setDoc, 
  getDoc, 
  query, 
  orderBy 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ⚠️ 본인의 Firebase Console 프로젝트 설정 객체로 치환하세요.
const firebaseConfig = {
  apiKey: "AIzaSyAjd9Pb8VLnXDKYnkASmsUY_-Ay8MCPZJA",
  authDomain: "project-657db.firebaseapp.com",
  projectId: "project-657db",
  storageBucket: "project-657db.firebasestorage.app",
  messagingSenderId: "223343111107",
  appId: "1:223343111107:web:9205114dbe6dd7ecc1eb76",
  measurementId: "G-W324EC2NXW"
};


// 전역 변수
let app = null;
let db = null;
let allTasks = [];
let currentFilter = "전체";
let selectedSubject = '';
let pendingDeleteId = null;
let activeSubjects = [];

// 1. Firebase DB 초기화
try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  setStatus(true);
} catch (e) {
  console.error("Firebase 초기화 실패:", e);
  setStatus(false);
}

function setStatus(오케이) {
  const dot = document.getElementById("status-dot");
  const txt = document.getElementById("status-text");
  if (dot && txt) {
    dot.className = "dot " + (ok ? "connected" : "error");
    txt.textContent = ok ? "연결됨" : "오프라인(Local)";
  }
}

// 2. 색상 생성기
function getSubjectColor(subject) {
  const fixedColors = {
    "공통국어1": "#818cf8", "공통국어2": "#818cf8",
    "공통영어1": "#34d399", "공통영어2": "#34d399",
    "공통수학1": "#fbbf24", "공통수학2": "#fbbf24",
    "통합과학1": "#60a5fa", "통합과학2": "#60a5fa",
    "통합사회1": "#f87171", "통합사회2": "#f87171",
    "한국사": "#c084fc", "체육": "#2dd4bf",
    "음악": "#fb923c", "기술가정": "#a7f3d0",
    "정보": "#38bdf8", "미술": "#f472b6",
    "화법과 언어": "#a78bfa", "대수": "#f59e0b",
    "영어1": "#10b981", "문학": "#e879f9",
    "미적분1": "#f43f5e", "영어2": "#06b6d4"
  };
  if (fixedColors[subject]) return fixedColors[subject];
  let hash = 0;
  for (let i = 0; i < subject.length; i++) {
    hash = subject.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash % 360);
  return `hsl(${h}, 70%, 65%)`;
}

// 3. UI 페이지 전환
window.showPage = function(pageId) {
  document.querySelectorAll('.view-page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(pageId);
  if (target) target.classList.add('active');
};

// 4. 학년별 반 선택 옵션 자동 동기화 (1학년: 13반, 2학년: 12반)
window.updateClassOptions = function() {
  const gradeSelect = document.getElementById("setup-grade");
  const classSelect = document.getElementById("setup-class");
  if (!gradeSelect || !classSelect) return;

  const grade = gradeSelect.value;
  const maxClass = grade === "2" ? 12 : 13;
  
  let optionsHtml = "";
  for (let i = 1; i <= maxClass; i++) {
    optionsHtml += `<option value="${i}">${i}반</option>`;
  }
  classSelect.innerHTML = optionsHtml;
};

// 5. 설정 제출 및 대시보드 진입
window.submitSetup = async function() {
  const grade = document.getElementById("setup-grade").value;
  const sClass = parseInt(document.getElementById("setup-class").value);
  const term = document.getElementById("setup-term").value;

  let subjects = [];

  if (grade === "1") {
    subjects = [
      `공통국어${term}`, `공통영어${term}`, `공통수학${term}`,
      `통합과학${term}`, `통합사회${term}`, "한국사", "체육"
    ];
    if (sClass >= 1 && sClass <= 6) {
      if (term === "1") subjects.push("음악", "기술가정");
      else subjects.push("정보", "미술");
    } else {
      if (term === "1") subjects.push("정보", "미술");
      else subjects.push("음악", "기술가정");
    }
  } else if (grade === "2") {
    if (term === "1") {
      subjects = ["화법과 언어", "대수", "영어1", "체육"];
      subjects.push(sClass >= 1 && sClass <= 6 ? "음악" : "미술");
    } else {
      subjects = ["문학", "미적분1", "영어2", "체육"];
      subjects.push(sClass >= 1 && sClass <= 6 ? "미술" : "음악");
    }
  }

  activeSubjects = subjects;
  localStorage.setItem("activeSubjects", JSON.stringify(activeSubjects));
  localStorage.setItem("userClassConfig", JSON.stringify({ grade, sClass, term }));

  // Firestore 메타 정보 동기화
  await syncSubjectsToFirestore();
  initDashboard();
};

window.resetSetupData = function() {
  if (confirm("학급 설정을 변경하시겠습니까? (저장된 과목 리스트가 초기화됩니다.)")) {
    localStorage.removeItem("activeSubjects");
    localStorage.removeItem("userClassConfig");
    const fc = document.getElementById("filter-container");
    if (fc) fc.innerHTML = "";
    updateClassOptions();
    showPage("page-setup");
  }
};

// 6. Firestore 데이터 수신 및 대시보드 초기화
function initDashboard() {
  const config = JSON.parse(localStorage.getItem("userClassConfig"));
  if (config) {
    document.getElementById("header-class-info").textContent = `${config.grade}학년 ${config.sClass}반 (${config.term}학기) ⚙️`;
  }
  
  activeSubjects = JSON.parse(localStorage.getItem("activeSubjects")) || [];
  if (activeSubjects.length > 0 && (!selectedSubject || !activeSubjects.includes(selectedSubject))) {
    selectedSubject = activeSubjects[0];
  }

  renderFiltersAndDropdown();
  listenToFirestore();
  showPage("page-dashboard");
}

function getClassCollectionRef() {
  const config = JSON.parse(localStorage.getItem("userClassConfig"));
  if (!config) return null;
  const classId = `${config.grade}-${config.sClass}`;
  return collection(db, "classes", classId, "tasks");
}

async function syncSubjectsToFirestore() {
  const config = JSON.parse(localStorage.getItem("userClassConfig"));
  if (!config || !db) return;
  const classId = `${config.grade}-${config.sClass}`;
  const docRef = doc(db, "classes", classId);
  await setDoc(docRef, { subjects: activeSubjects }, { merge: true });
}

function listenToFirestore() {
  const tasksRef = getClassCollectionRef();
  if (!tasksRef) return;

  const q = query(tasksRef, orderBy("due", "asc"));
  onSnapshot(q, (snapshot) => {
    allTasks = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));
    renderTasks();
    updateStats();
  }, (err) => {
    console.error("Firestore 동기화 실패:", err);
    setStatus(false);
  });
}

// 7. C.R.U.D 핸들러
window.addTask = async function() {
  const subject = selectedSubject;
  const titleInput = document.getElementById("title");
  const dueInput = document.getElementById("due");

  const title = titleInput ? titleInput.value.trim() : "";
  const due = dueInput ? dueInput.value : "";

  if (!subject) { alert("과목을 선택하거나 과목 관리에서 등록해주세요!"); return; }
  if (!title) { alert("제목을 입력해주세요!"); return; }
  if (!due) { alert("마감일을 선택해주세요!"); return; }

  const tasksRef = getClassCollectionRef();
  if (tasksRef) {
    try {
      await addDoc(tasksRef, {
        subject,
        title,
        due,
        done: false,
        createdAt: new Date()
      });
      if (titleInput) titleInput.value = "";
      if (dueInput) dueInput.value = "";
      toggleModal();
    } catch (err) {
      alert("데이터 저장 중 오류가 발생했습니다: " + err.message);
    }
  }
};

window.toggleDone = async function(id, currentDone) {
  const config = JSON.parse(localStorage.getItem("userClassConfig"));
  if (!config || !db) return;
  const docRef = doc(db, "classes", `${config.grade}-${config.sClass}`, "tasks", id);
  try {
    await updateDoc(docRef, { done: !currentDone });
  } catch (err) {
    console.error("상태 업데이트 실패:", err);
  }
};

window.deleteTask = function(id) {
  pendingDeleteId = id;
  const overlay = document.getElementById("confirm-overlay");
  const okBtn = document.getElementById("confirm-ok-btn");
  
  if (overlay) overlay.classList.add("open");
  
  if (okBtn) {
    okBtn.onclick = async () => {
      const targetId = pendingDeleteId;
      closeConfirm();
      
      if (targetId !== null) {
        const config = JSON.parse(localStorage.getItem("userClassConfig"));
        if (config && db) {
          const docRef = doc(db, "classes", `${config.grade}-${config.sClass}`, "tasks", targetId);
          try {
            await deleteDoc(docRef);
          } catch (err) {
            console.error("삭제 실패:", err);
          }
        }
      }
    };
  }
};

window.closeConfirm = function() {
  const overlay = document.getElementById("confirm-overlay");
  if (overlay) overlay.classList.remove("open");
  pendingDeleteId = null;
};

// 8. 과목 관리 모달 제어
window.openSubjectModal = function() {
  const sm = document.getElementById("subject-modal");
  if (sm) sm.classList.add("open");
  renderSubjectManageList();
};

window.closeSubjectModal = function() {
  const sm = document.getElementById("subject-modal");
  if (sm) sm.classList.remove("open");
  const input = document.getElementById("new-subject-input");
  if (input) input.value = "";
};

window.closeSubjectModalOnOverlay = function(e) {
  if (e.target === document.getElementById("subject-modal")) closeSubjectModal();
};

window.addSubjectInline = async function() {
  const input = document.getElementById("new-subject-input");
  const value = input ? input.value.trim() : "";
  
  if (!value) { alert("과목명을 입력해 주세요!"); return; }
  if (activeSubjects.includes(value)) { alert("이미 존재하는 과목명입니다."); return; }

  activeSubjects.push(value);
  localStorage.setItem("activeSubjects", JSON.stringify(activeSubjects));
  await syncSubjectsToFirestore();
  
  if (input) input.value = "";
  selectedSubject = value; 
  
  renderSubjectManageList();
  renderFiltersAndDropdown();
  renderTasks();
};

window.removeSubjectInline = async function(subject) {
  const relatedTasks = allTasks.filter(t => t.subject === subject);
  const count = relatedTasks.length;

  let confirmMessage = `'${subject}' 과목을 목록에서 삭제할까요?`;
  if (count > 0) {
    confirmMessage = `'${subject}' 과목을 삭제하면 등록된 관련 수행평가 ${count}개도 함께 삭제됩니다. 정말 삭제하시겠습니까?`;
  }

  if (!confirm(confirmMessage)) return;

  const config = JSON.parse(localStorage.getItem("userClassConfig"));

  if (count > 0 && config && db) {
    for (const task of relatedTasks) {
      try {
        const docRef = doc(db, "classes", `${config.grade}-${config.sClass}`, "tasks", task.id);
        await deleteDoc(docRef);
      } catch (e) {}
    }
  }

  activeSubjects = activeSubjects.filter(s => s !== subject);
  localStorage.setItem("activeSubjects", JSON.stringify(activeSubjects));
  await syncSubjectsToFirestore();
  
  if (currentFilter === subject) currentFilter = "전체";
  if (selectedSubject === subject) selectedSubject = activeSubjects[0] || '';

  renderSubjectManageList();
  renderFiltersAndDropdown();
  renderTasks();
};

// 9. UI 렌더링 헬퍼 함수
function renderSubjectManageList() {
  const box = document.getElementById("subject-manage-list");
  if (!box) return;

  if (activeSubjects.length === 0) {
    box.innerHTML = `<div style="text-align:center; color:var(--text-muted); font-size:13px; padding:20px 0;">등록된 과목이 없습니다.</div>`;
    return;
  }

  box.innerHTML = activeSubjects.map(sub => {
    const color = getSubjectColor(sub);
    return `
      <div class="subject-manage-item">
        <div class="sub-item-left">
          <span class="sub-item-dot" style="background:${color}"></span>
          <span>${sub}</span>
        </div>
        <button class="btn-sub-item-del" onclick="removeSubjectInline('${sub}')">✕</button>
      </div>
    `;
  }).join("");
}

function renderFiltersAndDropdown() {
  const filterContainer = document.getElementById("filter-container");
  if (filterContainer) {
    let filterHtml = `<button class="filter-btn ${currentFilter === '전체' ? 'active' : ''}" onclick="setFilter('전체', this)">전체</button>`;
    activeSubjects.forEach(sub => {
      filterHtml += `<button class="filter-btn ${currentFilter === sub ? 'active' : ''}" onclick="setFilter('${sub}', this)">${sub}</button>`;
    });
    filterContainer.innerHTML = filterHtml;
  }

  const dropdownContainer = document.getElementById("select-dropdown");
  const labelContainer = document.getElementById("select-label");
  
  if (dropdownContainer) {
    if (activeSubjects.length > 0 && (!selectedSubject || !activeSubjects.includes(selectedSubject))) {
      selectedSubject = activeSubjects[0];
    }
    
    if (labelContainer && selectedSubject) {
      labelContainer.textContent = selectedSubject;
      labelContainer.style.color = getSubjectColor(selectedSubject);
    }

    let dropdownHtml = "";
    activeSubjects.forEach(sub => {
      const color = getSubjectColor(sub);
      dropdownHtml += `
        <div class="custom-select-option ${selectedSubject === sub ? 'selected' : ''}" onclick="selectOption('${sub}', '${color}')">
          <span class="opt-dot" style="background:${color}"></span>${sub}
        </div>`;
    });
    dropdownContainer.innerHTML = dropdownHtml;
  }
}

function renderTasks() {
  const list = document.getElementById("task-list");
  if (!list) return;

  const filtered = currentFilter === "전체" ? allTasks : allTasks.filter(t => t.subject === currentFilter);

  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty"><div class="empty-icon">🎉</div>수행평가가 없어요!</div>`;
    return;
  }

  list.innerHTML = filtered.map(task => {
    const color = getSubjectColor(task.subject);
    return `
      <div class="task-item ${task.done ? 'done' : ''}">
        <div class="task-check ${task.done ? 'checked' : ''}" onclick="toggleDone('${task.id}', ${task.done})">${task.done ? '✓' : ''}</div>
        <span class="subject-badge" style="background:${color}20; color:${color}">${task.subject}</span>
        <div class="task-info">
          <div class="task-title">${task.title}</div>
          <div class="task-due">마감일: ${task.due}</div>
        </div>
        <span class="dday-badge ${ddayClass(task.due, task.done)}">${ddayText(task.due, task.done)}</span>
        <button class="btn-del" onclick="deleteTask('${task.id}')">×</button>
      </div>
    `;
  }).join("");
}

function updateStats() {
  const total = allTasks.length;
  const done = allTasks.filter(t => t.done).length;
  const tEl = document.getElementById("stat-total");
  const dEl = document.getElementById("stat-done");
  const rEl = document.getElementById("stat-remain");

  if (tEl) tEl.textContent = total;
  if (dEl) dEl.textContent = done;
  if (rEl) rEl.textContent = total - done;
}

function dday(due) {
  const today = new Date(); today.setHours(0,0,0,0);
  return Math.ceil((new Date(due) - today) / 86400000);
}

function ddayText(due, done) {
  if (done) return "완료";
  const d = dday(due);
  if (d < 0) return "기한초과";
  if (d === 0) return "D-Day";
  return `D-${d}`;
}

function ddayClass(due, done) {
  if (done) return "dday-done";
  const d = dday(due);
  if (d <= 3) return "dday-urgent";
  if (d <= 7) return "dday-soon";
  return "dday-ok";
}

window.toggleModal = function() {
  const overlay = document.getElementById("modal-overlay");
  const fab = document.getElementById("fab");
  if (!overlay || !fab) return;

  const isOpen = overlay.classList.contains("open");
  overlay.classList.toggle("open");
  fab.classList.toggle("open");
  
  const sb = document.getElementById("select-btn");
  const sd = document.getElementById("select-dropdown");
  if (sb) sb.classList.remove("open");
  if (sd) sd.classList.remove("open");

  if (!isOpen) {
    const titleEl = document.getElementById("title");
    if (titleEl) titleEl.focus();
  }
};

window.closeOnOverlay = function(e) {
  if (e.target === document.getElementById("modal-overlay")) toggleModal();
};

window.toggleDropdown = function() {
  const btn = document.getElementById("select-btn");
  const dd = document.getElementById("select-dropdown");
  if (btn && dd) {
    btn.classList.toggle("open");
    dd.classList.toggle("open");
  }
};

window.selectOption = function(value, color) {
  selectedSubject = value;
  const label = document.getElementById("select-label");
  if (label) {
    label.textContent = value;
    label.style.color = color;
  }
  document.querySelectorAll(".custom-select-option").forEach(o => o.classList.remove("selected"));
  if (window.event && window.event.currentTarget) {
    window.event.currentTarget.classList.add("selected");
  }
  const btn = document.getElementById("select-btn");
  const dd = document.getElementById("select-dropdown");
  if (btn) btn.classList.remove("open");
  if (dd) dd.classList.remove("open");
};

window.setFilter = function(subject, btn) {
  currentFilter = subject;
  document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add('active');
  renderTasks();
};

document.addEventListener("click", (e) => {
  const cs = document.getElementById("custom-select");
  if (cs && !cs.contains(e.target)) {
    const btn = document.getElementById("select-btn");
    const dd = document.getElementById("select-dropdown");
    if (btn) btn.classList.remove("open");
    if (dd) dd.classList.remove("open");
  }
});

// 초기화 이벤트
window.addEventListener('DOMContentLoaded', () => {
  const dueEl = document.getElementById("due");
  if (dueEl) dueEl.min = new Date().toISOString().split("T")[0];
  
  updateClassOptions();
  
  const hasConfig = localStorage.getItem("userClassConfig");
  if (hasConfig) {
    initDashboard();
  } else {
    showPage("page-setup");
  }
});
