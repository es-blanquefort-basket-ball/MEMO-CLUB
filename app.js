const APP_CONFIG = {
  appsScriptUrl: "https://script.google.com/macros/s/AKfycbzNUxH-a2ToXdl4K3TM8Wt54tpV_5GPO-ub9ejyEjx5vJ8JYKmLEmET1kEDVb7MA_I/exec",
  localMode: true
};

const STATUSES = ["Nouveau", "À voir", "En cours", "Répondu", "Archivé"];
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
  replies: [],
  currentUserId: localStorage.getItem("carnetUserId") || "laurence",
  isSaving: false,
  isRecording: false,
  recognition: null,
  recordingTimer: null,
  pendingImage: null
};

const els = {};

document.addEventListener("DOMContentLoaded", init);

function init() {
  bindElements();
  fillStaticInputs();
  bindEvents();
  setupSpeech();
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
    micButton: document.getElementById("micButton"),
    voiceIndicator: document.getElementById("voiceIndicator"),
    submitButton: document.getElementById("submitButton"),
    formMessage: document.getElementById("formMessage"),
    categoryInput: document.getElementById("categoryInput"),
    priorityInput: document.getElementById("priorityInput"),
    statusInput: document.getElementById("statusInput"),
    dueDateInput: document.getElementById("dueDateInput"),
    followupInput: document.getElementById("followupInput"),
    imageInput: document.getElementById("imageInput"),
    imagePreview: document.getElementById("imagePreview"),
    clearImageButton: document.getElementById("clearImageButton"),
    statusSummary: document.getElementById("statusSummary"),
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
  els.imageInput.addEventListener("change", handleImageSelection);
  els.clearImageButton.addEventListener("click", clearPendingImage);

  els.notesList.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    await handleNoteAction(button.closest(".note-card").dataset.id, button.dataset.action);
  });

  els.notesList.addEventListener("submit", async (event) => {
    const form = event.target.closest(".reply-form");
    if (!form) return;
    event.preventDefault();
    await createReply(form.closest(".note-card").dataset.id, form);
  });
}

function setupSpeech() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    els.micButton.disabled = true;
    els.micButton.textContent = "Micro indisponible";
    return;
  }

  state.recognition = new SpeechRecognition();
  state.recognition.lang = "fr-FR";
  state.recognition.continuous = false;
  state.recognition.interimResults = false;

  els.micButton.addEventListener("click", () => {
    if (state.isRecording) {
      state.recognition.stop();
      finishRecording();
      return;
    }

    try {
      state.isRecording = true;
      els.micButton.textContent = "Stop";
      els.micButton.classList.add("recording");
      els.voiceIndicator.classList.add("active");
      showFormMessage("Dictée en cours...", "info");
      state.recordingTimer = window.setTimeout(() => state.recognition.stop(), 15000);
      state.recognition.start();
    } catch (error) {
      finishRecording();
      showFormMessage("Micro indisponible sur ce navigateur.", "error");
    }
  });

  state.recognition.addEventListener("result", (event) => {
    const text = Array.from(event.results).map((result) => result[0].transcript).join(" ");
    els.noteText.value = [els.noteText.value, text].filter(Boolean).join("\n");
    showFormMessage("Dictée ajoutée.", "success");
  });

  state.recognition.addEventListener("error", () => {
    finishRecording();
    showFormMessage("Micro refusé ou indisponible.", "error");
  });

  state.recognition.addEventListener("end", finishRecording);
}

function finishRecording() {
  state.isRecording = false;
  window.clearTimeout(state.recordingTimer);
  state.recordingTimer = null;
  if (els.micButton) els.micButton.textContent = "Dicter";
  if (els.micButton) els.micButton.classList.remove("recording");
  if (els.voiceIndicator) els.voiceIndicator.classList.remove("active");
}

async function loadData() {
  setSync("Chargement...", false);
  try {
    if (APP_CONFIG.appsScriptUrl) {
      const data = await api("list", {});
      state.users = data.users?.length ? data.users : DEFAULT_USERS;
      if (data.currentUser?.id) state.currentUserId = data.currentUser.id;
      state.notes = data.notes || [];
      state.replies = data.replies || [];
      setSync("Connecté au Google Sheet", true);
    } else {
      state.users = DEFAULT_USERS;
      state.notes = JSON.parse(localStorage.getItem("carnetNotes") || "[]");
      state.replies = JSON.parse(localStorage.getItem("carnetReplies") || "[]");
      setSync("Mode local de démonstration", false);
    }
  } catch (error) {
    state.users = DEFAULT_USERS;
    state.notes = JSON.parse(localStorage.getItem("carnetNotes") || "[]");
    state.replies = JSON.parse(localStorage.getItem("carnetReplies") || "[]");
    setSync("Connexion indisponible", false, true);
  }
  hydrateUsers();
  render();
}

function persistLocalData() {
  if (APP_CONFIG.appsScriptUrl) return;
  localStorage.setItem("carnetNotes", JSON.stringify(state.notes));
  localStorage.setItem("carnetReplies", JSON.stringify(state.replies));
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
    done: "Répondu / archivé"
  };
  els.viewTitle.textContent = titles[state.view];
  els.newNotePanel.classList.toggle("hidden", state.view !== "new");
  els.listPanel.classList.toggle("hidden", state.view === "new");
  renderCounters();
  if (state.view !== "new") renderNotes();
}

function renderCounters() {
  const counts = getCounts();
  document.querySelectorAll("[data-count]").forEach((item) => {
    item.textContent = counts[item.dataset.count] ?? 0;
  });

  els.statusSummary.innerHTML = [
    ["Nouveau", counts.status.Nouveau],
    ["À voir", counts.status["À voir"]],
    ["En cours", counts.status["En cours"]],
    ["Répondu", counts.status["Répondu"]],
    ["Archivé", counts.status["Archivé"]]
  ].map(([label, value]) => `<span class="summary-pill"><strong>${value}</strong>${label}</span>`).join("");
}

function getCounts() {
  const status = {
    Nouveau: 0,
    "À voir": 0,
    "En cours": 0,
    "Répondu": 0,
    Archivé: 0
  };

  state.notes.forEach((note) => {
    const normalizedStatus = normalizeStatus(note.status);
    if (status[normalizedStatus] !== undefined) status[normalizedStatus] += 1;
  });

  return {
    all: state.notes.length,
    todo: state.notes.filter((note) => ["Nouveau", "À voir", "En cours"].includes(note.status)).length,
    bugs: state.notes.filter((note) => normalize(note.category).includes("bug")).length,
    ideas: state.notes.filter((note) => normalize(note.category).includes("idee")).length,
    material: state.notes.filter((note) => normalize(note.category).includes("materiel")).length,
    done: state.notes.filter((note) => ["Répondu", "Fait", "Archivé"].includes(note.status)).length,
    status
  };
}

function renderNotes() {
  const notes = getFilteredNotes();
  renderCounters();
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
    card.dataset.status = normalizeStatus(note.status);
    card.querySelector(".note-meta").textContent = `${formatDate(note.createdAt)} - ${note.authorName} - ${note.status}`;
    card.querySelector(".note-body").textContent = note.text;
    renderNoteImage(card, note);
    card.querySelector(".note-details").innerHTML = detailHtml(note);
    const followupBox = card.querySelector(".followup-box");
    followupBox.classList.toggle("hidden", !note.followup);
    followupBox.textContent = note.followup ? `Précision : ${note.followup}` : "";
    renderReplies(card, note.id);
    renderActionChips(card, note);
    els.notesList.append(card);
  });
}

function renderActionChips(card, note) {
  const currentStatus = normalizeStatus(note.status);
  const actionStatus = {
    todo: "À voir",
    progress: "En cours",
    done: "Répondu",
    archive: "Archivé"
  };

  card.querySelectorAll("[data-action]").forEach((button) => {
    const status = actionStatus[button.dataset.action];
    const isCurrent = status === currentStatus;
    button.classList.toggle("active", isCurrent);
    if (isCurrent) {
      button.setAttribute("aria-current", "true");
    } else {
      button.removeAttribute("aria-current");
    }
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
      if (state.view === "done") return ["Répondu", "Fait", "Archivé"].includes(note.status);
      return true;
    })
    .filter((note) => statusFilter === "Tous les statuts" || note.status === statusFilter)
    .filter((note) => {
      if (!query) return true;
      return [note.text, note.category, note.status, note.followup, note.authorName, getReplies(note.id).map((reply) => reply.text).join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(query);
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function createNote() {
  if (state.isSaving) return;
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
    followup: els.followupInput.value.trim(),
    imageName: state.pendingImage?.name || "",
    imageType: state.pendingImage?.type || "",
    imageData: state.pendingImage?.dataUrl || "",
    imageUrl: state.pendingImage?.dataUrl || ""
  };

  if (!note.text || !note.category) return;

  state.isSaving = true;
  els.submitButton.disabled = true;
  els.submitButton.textContent = "Enregistrement...";
  showFormMessage("Enregistrement en cours...", "info");

  try {
    await saveMutation("createNote", { note });
    note.imageData = "";
    state.notes.unshift(note);
    persistLocalData();
    els.noteForm.reset();
    clearPendingImage();
    els.categoryInput.value = "Bug appli";
    els.priorityInput.value = "Normale";
    els.statusInput.value = "Nouveau";
    showFormMessage("Note enregistrée.", "success");
    setSync("Note enregistrée", true);
    setView("all");
  } catch (error) {
    showFormMessage("Enregistrement impossible. Réessaie dans un instant.", "error");
  } finally {
    state.isSaving = false;
    els.submitButton.disabled = false;
    els.submitButton.textContent = "Enregistrer";
  }
}

async function handleImageSelection() {
  const file = els.imageInput.files?.[0];
  if (!file) {
    clearPendingImage();
    return;
  }

  if (!file.type.startsWith("image/")) {
    clearPendingImage();
    showFormMessage("Le fichier choisi n'est pas une image.", "error");
    return;
  }

  showFormMessage("Préparation de l'image...", "info");
  try {
    const image = await resizeImage(file);
    state.pendingImage = image;
    els.imagePreview.innerHTML = `
      <img src="${image.dataUrl}" alt="Aperçu de l'image">
      <span>${escapeHtml(image.name)}</span>
    `;
    els.imagePreview.classList.remove("hidden");
    els.clearImageButton.classList.remove("hidden");
    showFormMessage("Image ajoutée à la note.", "success");
  } catch (error) {
    clearPendingImage();
    showFormMessage("Image impossible à préparer.", "error");
  }
}

function clearPendingImage() {
  state.pendingImage = null;
  els.imageInput.value = "";
  els.imagePreview.innerHTML = "";
  els.imagePreview.classList.add("hidden");
  els.clearImageButton.classList.add("hidden");
}

function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const maxSize = 1400;
        const ratio = Math.min(1, maxSize / Math.max(img.width, img.height));
        const width = Math.round(img.width * ratio);
        const height = Math.round(img.height * ratio);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        context.drawImage(img, 0, 0, width, height);
        resolve({
          name: file.name,
          type: "image/jpeg",
          dataUrl: canvas.toDataURL("image/jpeg", 0.78)
        });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function handleNoteAction(noteId, action) {
  const note = state.notes.find((item) => item.id === noteId);
  if (!note) return;
  if (action === "delete") {
    const confirmed = window.confirm("Supprimer cette note ?");
    if (!confirmed) return;
    await saveMutation("deleteNote", { noteId });
    state.notes = state.notes.filter((item) => item.id !== noteId);
    persistLocalData();
    setSync("Note supprimée", true);
    renderNotes();
    return;
  }

  const now = new Date().toISOString();
  const nextStatus = {
    todo: "À voir",
    progress: "En cours",
    done: "Répondu",
    archive: "Archivé"
  }[action];

  note.status = nextStatus;
  note.updatedAt = now;
  await saveMutation("updateStatus", { noteId, status: nextStatus, updatedAt: now });
  persistLocalData();
  renderNotes();
}

async function createReply(noteId, form) {
  const textarea = form.elements.replyText;
  const text = textarea.value.trim();
  if (!text) return;

  const user = getCurrentUser();
  const now = new Date().toISOString();
  const reply = {
    id: crypto.randomUUID(),
    noteId,
    createdAt: now,
    authorId: user.id,
    authorName: user.name,
    text
  };
  const button = form.querySelector("button");
  button.disabled = true;
  button.textContent = "Envoi...";

  try {
    await saveMutation("addReply", { reply });
    state.replies.push(reply);
    const note = state.notes.find((item) => item.id === noteId);
    if (note && note.status !== "Archivé") {
      note.status = "Répondu";
      note.updatedAt = now;
    }
    textarea.value = "";
    persistLocalData();
    setSync("Réponse ajoutée", true);
    renderNotes();
  } finally {
    button.disabled = false;
    button.textContent = "Répondre";
  }
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
    ["Échéance", formatDateOnly(note.dueDate) || "Aucune"],
    ["Image", note.imageUrl ? "Oui" : "Non"],
    ["Réponses", getReplies(note.id).length],
    ["Mise à jour", formatDate(note.updatedAt)]
  ];
  return details.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(value))}</dd></div>`).join("");
}

function renderNoteImage(card, note) {
  const link = card.querySelector(".note-image-link");
  const image = card.querySelector(".note-image");
  const src = note.imageThumbUrl || note.imageUrl;
  if (!src) {
    link.classList.add("hidden");
    return;
  }

  link.href = note.imageUrl || src;
  image.src = src;
  link.classList.remove("hidden");
}

function renderReplies(card, noteId) {
  const repliesList = card.querySelector(".replies-list");
  const replies = getReplies(noteId);
  if (!replies.length) {
    repliesList.innerHTML = '<p class="reply-empty">Aucune réponse pour le moment.</p>';
    return;
  }
  repliesList.innerHTML = replies
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .map((reply) => `
      <article class="reply-item">
        <p class="reply-meta">${escapeHtml(reply.authorName)} - ${escapeHtml(formatDate(reply.createdAt))}</p>
        <p>${escapeHtml(reply.text)}</p>
      </article>
    `)
    .join("");
}

function getReplies(noteId) {
  return state.replies.filter((reply) => reply.noteId === noteId);
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

function normalizeStatus(status) {
  return status === "Fait" ? "Répondu" : status;
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatDateOnly(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(date);
}

function setSync(text, online, error = false) {
  els.syncText.textContent = text;
  els.statusDot.classList.toggle("online", online);
  els.statusDot.classList.toggle("error", error);
}

function showFormMessage(text, type = "info") {
  els.formMessage.textContent = text;
  els.formMessage.dataset.type = type;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
