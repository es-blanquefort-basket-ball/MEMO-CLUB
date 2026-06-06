const APP_CONFIG = {
  appsScriptUrl: "https://script.google.com/macros/s/AKfycbzNUxH-a2ToXdl4K3TM8Wt54tpV_5GPO-ub9ejyEjx5vJ8JYKmLEmET1kEDVb7MA_I/exec",
  localMode: true
};

const STATUSES = ["Nouveau", "À voir", "En cours", "Fait", "Archivé"];
const CATEGORIES = [
  "Bug appli",
  "Idée",
  "Modification appli",
  "Matériel",
  "Organisation",
  "Communication",
  "Terrain",
  "Mémo",
  "Retour coach",
  "Autre"
];
const PRIORITIES = ["Basse", "Normale", "Haute", "Urgente"];
const DEFAULT_USERS = [
  { id: "antoni", name: "Antoni", profile: "20 ans" },
  { id: "vincent", name: "Vincent", profile: "Carnet" },
  { id: "laurence", name: "Laurence", profile: "Carnet" }
];

const state = {
  view: "new",
  users: DEFAULT_USERS,
  notes: [],
  currentUserId: localStorage.getItem("carnetUserId") || "laurence"
};

const els = {};

document.addEventListener("DOMContentLoaded", init);

function init() {
  bindElements();
  fillStaticInputs();
  bindEvents();
  loadData();
}

function bindElements() {
  Object.assign(els, {
    viewNav: document.getElementById("viewNav"),
    userSelect: document.getElementById("userSelect"),
    profileHint: document.getElementById("profileHint"),
    statusDot: document.getElementById("statusDot"),
    syncText: document.getElementById("syncText"),
    viewTitle: document.getElementById("viewTitle"),
    newNotePanel: document.getElementById("newNotePanel"),
    listPanel: document.getElementById("listPanel"),
    noteForm: document.getElementById("noteForm"),
    noteText: document.getElementById("noteText"),
    categoryInput: document.getElementById("categoryInput"),
    priorityInput: document.getElementById("priorityInput"),
    statusInput: document.getElementById("statusInput"),
    dueDateInput: document.getElementById("dueDateInput"),
    followupInput: document.getElementById("followupInput"),
    searchInput: document.getElementById("searchInput"),
    statusFilter: document.getElementById("statusFilter"),
    notesList: document.getElementById("notesList"),
    noteCardTemplate: document.getElementById("noteCardTemplate")
  });
}

function fillStaticInputs() {
  fillSelect(els.categoryInput, CATEGORIES);
  fillSelect(els.priorityInput, PRIORITIES);
  fillSelect(els.statusInput, STATUSES);
  fillSelect(els.statusFilter, ["Tous les statuts", ...STATUSES]);
  els.categoryInput.value = "Bug appli";
  els.priorityInput.value = "Normale";
  els.statusInput.value = "Nouveau";
}

function bindEvents() {
  els.viewNav.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-view]");
    if (!button) return;
    setView(button.dataset.view);
  });

  els.userSelect.addEventListener("change", () => {
    state.currentUserId = els.userSelect.value;
    localStorage.setItem("carnetUserId", state.currentUserId);
    updateUserUi();
    render();
  });

  els.noteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await createNote();
  });

  els.searchInput.addEventListener("input", renderNotes);
  els.statusFilter.addEventListener("change", renderNotes);

  els.notesList.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    await handleNoteAction(button.closest(".note-card").dataset.id, button.dataset.action);
  });
}

async function loadData() {
  setSync("Chargement...", false);
  try {
    if (APP_CONFIG.appsScriptUrl) {
      const data = await api("list", {});
      state.users = data.users?.length ? data.users : DEFAULT_USERS;
      if (data.currentUser?.id) state.currentUserId = data.currentUser.id;
      state.notes = data.notes || [];
      setSync("Connecté au Google Sheet", true);
    } else {
      state.users = DEFAULT_USERS;
      state.notes = JSON.parse(localStorage.getItem("carnetNotes") || "[]");
      setSync("Mode local de démonstration", false);
    }
  } catch (error) {
    state.users = DEFAULT_USERS;
    state.notes = JSON.parse(localStorage.getItem("carnetNotes") || "[]");
    setSync("Connexion indisponible", false, true);
  }
  hydrateUsers();
  render();
}

function persistLocalData() {
  localStorage.setItem("carnetNotes", JSON.stringify(state.notes));
}

function hydrateUsers() {
  els.userSelect.innerHTML = "";
  state.users.forEach((user) => {
    const option = document.createElement("option");
    option.value = user.id;
    option.textContent = user.name;
    els.userSelect.append(option);
  });
  if (!state.users.some((user) => user.id === state.currentUserId)) {
    state.currentUserId = state.users[0]?.id || "";
  }
  els.userSelect.value = state.currentUserId;
  updateUserUi();
}

function fillSelect(select, values) {
  select.innerHTML = "";
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  });
}

function updateUserUi() {
  const user = getCurrentUser();
  els.profileHint.textContent = `${user.name} - ${user.profile}`;
}

function setView(view) {
  state.view = view;
  document.querySelectorAll(".view-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  render();
}

function render() {
  const titles = {
    new: "Nouvelle note",
    all: "Toutes les notes",
    todo: "À voir",
    bugs: "Bugs appli",
    ideas: "Idées",
    material: "Matériel",
    done: "Fait / archivé"
  };
  els.viewTitle.textContent = titles[state.view];
  els.newNotePanel.classList.toggle("hidden", state.view !== "new");
  els.listPanel.classList.toggle("hidden", state.view === "new");
  if (state.view !== "new") renderNotes();
}

function renderNotes() {
  const notes = getFilteredNotes();
  els.notesList.innerHTML = "";

  if (!notes.length) {
    els.notesList.innerHTML = '<div class="empty-state">Aucune note pour cette vue.</div>';
    return;
  }

  notes.forEach((note) => {
    const card = els.noteCardTemplate.content.firstElementChild.cloneNode(true);
    card.dataset.id = note.id;
    card.querySelector(".category-pill").textContent = note.category;
    card.querySelector("h3").textContent = noteTitle(note);
    card.querySelector(".priority-badge").textContent = note.priority;
    card.querySelector(".note-meta").textContent = `${formatDate(note.createdAt)} - ${note.authorName} - ${note.status}`;
    card.querySelector(".note-body").textContent = note.text;
    card.querySelector(".note-details").innerHTML = detailHtml(note);
    card.querySelector(".followup-box").textContent = note.followup || "Aucun suivi renseigné.";
    els.notesList.append(card);
  });
}

function getFilteredNotes() {
  const query = els.searchInput.value.trim().toLowerCase();
  const statusFilter = els.statusFilter.value;

  return state.notes
    .filter((note) => {
      if (state.view === "todo") return ["Nouveau", "À voir", "En cours"].includes(note.status);
      if (state.view === "bugs") return normalize(note.category).includes("bug");
      if (state.view === "ideas") return normalize(note.category).includes("idee");
      if (state.view === "material") return normalize(note.category).includes("materiel");
      if (state.view === "done") return ["Fait", "Archivé"].includes(note.status);
      return true;
    })
    .filter((note) => statusFilter === "Tous les statuts" || note.status === statusFilter)
    .filter((note) => {
      if (!query) return true;
      return [note.text, note.category, note.status, note.followup, note.authorName]
        .join(" ")
        .toLowerCase()
        .includes(query);
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function createNote() {
  const user = getCurrentUser();
  const now = new Date().toISOString();
  const note = {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    authorId: user.id,
    authorName: user.name,
    text: els.noteText.value.trim(),
    category: els.categoryInput.value.trim(),
    priority: els.priorityInput.value,
    status: els.statusInput.value,
    dueDate: els.dueDateInput.value,
    followup: els.followupInput.value.trim()
  };

  if (!note.text || !note.category) return;

  await saveMutation("createNote", { note });
  state.notes.unshift(note);
  persistLocalData();
  els.noteForm.reset();
  els.categoryInput.value = "Bug appli";
  els.priorityInput.value = "Normale";
  els.statusInput.value = "Nouveau";
  setView("all");
}

async function handleNoteAction(noteId, action) {
  const note = state.notes.find((item) => item.id === noteId);
  if (!note) return;
  const now = new Date().toISOString();
  const nextStatus = {
    todo: "À voir",
    progress: "En cours",
    done: "Fait",
    archive: "Archivé"
  }[action];

  note.status = nextStatus;
  note.updatedAt = now;
  await saveMutation("updateStatus", { noteId, status: nextStatus, updatedAt: now });
  persistLocalData();
  renderNotes();
}

async function saveMutation(action, payload) {
  if (!APP_CONFIG.appsScriptUrl) return;
  await api(action, payload);
}

async function api(action, payload) {
  if (action === "list") {
    return jsonpRequest({ action, currentUserId: state.currentUserId });
  }

  const response = await fetch(APP_CONFIG.appsScriptUrl, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, currentUserId: state.currentUserId, ...payload })
  });
  return { ok: true };
}

function jsonpRequest(params) {
  return new Promise((resolve, reject) => {
    const callbackName = `memoCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const url = new URL(APP_CONFIG.appsScriptUrl);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    url.searchParams.set("callback", callbackName);

    const script = document.createElement("script");
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Connexion Google Sheet indisponible"));
    }, 12000);

    window[callbackName] = (data) => {
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("Connexion Google Sheet indisponible"));
    };

    function cleanup() {
      window.clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
    }

    script.src = url.toString();
    document.body.append(script);
  });
}

function detailHtml(note) {
  const details = [
    ["Échéance", note.dueDate || "Aucune"],
    ["Mise à jour", formatDate(note.updatedAt)]
  ];
  return details.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(value))}</dd></div>`).join("");
}

function noteTitle(note) {
  return note.text.replace(/\s+/g, " ").slice(0, 86) || "Note sans titre";
}

function getCurrentUser() {
  return state.users.find((user) => user.id === state.currentUserId) || state.users[0] || DEFAULT_USERS[0];
}

function normalize(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function setSync(text, online, error = false) {
  els.syncText.textContent = text;
  els.statusDot.classList.toggle("online", online);
  els.statusDot.classList.toggle("error", error);
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

