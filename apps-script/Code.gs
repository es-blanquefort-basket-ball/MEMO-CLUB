const SPREADSHEET_NAME = 'CARNET_BORD_ESB';
const CLUB_CARNET_FOLDER_ID = '';
const SHEETS = {
  notes: 'NOTES',
  reads: 'LECTURES',
  users: 'UTILISATEURS',
  params: 'PARAMETRES',
  archives: 'ARCHIVES',
  replies: 'REPONSES'
};

const HEADERS = {
  NOTES: ['id', 'createdAt', 'updatedAt', 'authorId', 'authorName', 'text', 'category', 'priority', 'status', 'dueDate', 'followup', 'imageName', 'imageUrl', 'imageThumbUrl', 'imagePreview'],
  LECTURES: ['id', 'noteId', 'userId', 'readAt'],
  UTILISATEURS: ['id', 'name', 'profile', 'email', 'active'],
  PARAMETRES: ['key', 'value'],
  ARCHIVES: ['id', 'createdAt', 'updatedAt', 'authorId', 'authorName', 'text', 'category', 'priority', 'status', 'dueDate', 'followup', 'imageName', 'imageUrl', 'imageThumbUrl', 'imagePreview', 'archivedAt', 'archivedBy'],
  REPONSES: ['id', 'noteId', 'createdAt', 'authorId', 'authorName', 'text']
};

function doGet(event) {
  const payload = event && event.parameter ? {
    action: event.parameter.action || 'list',
    currentUserId: event.parameter.currentUserId
  } : { action: 'list' };
  const data = handleAction(payload);
  if (event && event.parameter && event.parameter.callback) {
    return jsonpResponse(event.parameter.callback, data);
  }
  return jsonResponse(data);
}

function doPost(event) {
  const payload = JSON.parse(event.postData.contents || '{}');
  return jsonResponse(handleAction(payload));
}

function handleAction(payload) {
  const spreadsheet = getOrCreateSpreadsheet_();
  setupSheets_(spreadsheet);
  const currentUser = getCurrentUser_(spreadsheet, payload.currentUserId);

  if (payload.action === 'list') {
    return {
      users: readObjects_(spreadsheet.getSheetByName(SHEETS.users)).filter((user) => user.active !== 'FALSE'),
      notes: readObjects_(spreadsheet.getSheetByName(SHEETS.notes)),
      replies: readObjects_(spreadsheet.getSheetByName(SHEETS.replies)),
      currentUser
    };
  }

  if (payload.action === 'createNote') {
    appendObject_(spreadsheet.getSheetByName(SHEETS.notes), normalizeNote_(payload.note, currentUser, spreadsheet));
    return { ok: true };
  }

  if (payload.action === 'updateStatus') {
    updateNoteFields_(spreadsheet, payload.noteId, {
      status: payload.status,
      updatedAt: payload.updatedAt || new Date().toISOString()
    });
    appendObject_(spreadsheet.getSheetByName(SHEETS.params), {
      key: 'statut:' + new Date().toISOString(),
      value: JSON.stringify({ noteId: payload.noteId, status: payload.status, userId: currentUser.id })
    });
    return { ok: true };
  }

  if (payload.action === 'addReply') {
    appendObject_(spreadsheet.getSheetByName(SHEETS.replies), normalizeReply_(payload.reply, currentUser));
    updateNoteFields_(spreadsheet, payload.reply.noteId, {
      status: 'Répondu',
      updatedAt: new Date().toISOString()
    });
    return { ok: true };
  }

  if (payload.action === 'deleteNote') {
    deleteNote_(spreadsheet, payload.noteId);
    appendObject_(spreadsheet.getSheetByName(SHEETS.params), {
      key: 'suppression:' + new Date().toISOString(),
      value: JSON.stringify({ noteId: payload.noteId, userId: currentUser.id })
    });
    return { ok: true };
  }

  if (payload.action === 'archiveNote') {
    archiveNote_(spreadsheet, payload.noteId, currentUser.id);
    return { ok: true };
  }

  throw new Error('Action inconnue');
}

function getOrCreateSpreadsheet_() {
  const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (activeSpreadsheet) {
    return activeSpreadsheet;
  }

  const files = DriveApp.getFilesByName(SPREADSHEET_NAME);
  if (files.hasNext()) {
    return SpreadsheetApp.open(files.next());
  }
  const spreadsheet = SpreadsheetApp.create(SPREADSHEET_NAME);
  moveSpreadsheetToClubFolder_(spreadsheet);
  return spreadsheet;
}

function moveSpreadsheetToClubFolder_(spreadsheet) {
  if (!CLUB_CARNET_FOLDER_ID) return;
  const file = DriveApp.getFileById(spreadsheet.getId());
  DriveApp.getFolderById(CLUB_CARNET_FOLDER_ID).addFile(file);
  DriveApp.getRootFolder().removeFile(file);
}

function setupSheets_(spreadsheet) {
  Object.values(SHEETS).forEach((name) => {
    let sheet = spreadsheet.getSheetByName(name);
    if (!sheet) sheet = spreadsheet.insertSheet(name);
    const headers = HEADERS[name];
    const firstRow = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0];
    if (firstRow.every((cell) => cell === '')) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
    } else {
      ensureHeaders_(sheet, headers);
    }
  });

  const usersSheet = spreadsheet.getSheetByName(SHEETS.users);
  if (usersSheet.getLastRow() < 2) {
    appendObject_(usersSheet, { id: 'antoni', name: 'Antoni', profile: '20 ans', email: '', active: true });
    appendObject_(usersSheet, { id: 'vincent', name: 'Vincent', profile: 'Carnet', email: '', active: true });
    appendObject_(usersSheet, { id: 'laurence', name: 'Laurence', profile: 'Carnet', email: '', active: true });
  }
}

function ensureHeaders_(sheet, requiredHeaders) {
  const currentHeaders = getHeaders_(sheet);
  const missingHeaders = requiredHeaders.filter((header) => !currentHeaders.includes(header));
  if (!missingHeaders.length) return;
  sheet.getRange(1, currentHeaders.length + 1, 1, missingHeaders.length).setValues([missingHeaders]);
}

function normalizeNote_(note, user, spreadsheet) {
  const image = saveImage_(spreadsheet, note);
  return {
    id: note.id,
    createdAt: note.createdAt || new Date().toISOString(),
    updatedAt: note.updatedAt || new Date().toISOString(),
    authorId: user.id,
    authorName: user.name,
    text: note.text,
    category: note.category,
    priority: note.priority,
    status: note.status || 'Nouveau',
    dueDate: note.dueDate,
    followup: note.followup,
    imageName: image.name,
    imageUrl: image.url,
    imageThumbUrl: image.thumbUrl,
    imagePreview: note.imagePreview || image.preview || ''
  };
}

function saveImage_(spreadsheet, note) {
  if (!note.imageData) {
    return { name: note.imageName || '', url: note.imageUrl || '', thumbUrl: note.imageThumbUrl || '', preview: note.imagePreview || '' };
  }

  const match = String(note.imageData).match(/^data:(.+);base64,(.+)$/);
  if (!match) {
    return { name: '', url: '', thumbUrl: '' };
  }

  const contentType = match[1];
  const bytes = Utilities.base64Decode(match[2]);
  const safeName = String(note.imageName || 'capture.jpg').replace(/[\\/:*?"<>|]/g, '-');
  const blob = Utilities.newBlob(bytes, contentType, note.id + '-' + safeName);
  const folder = getImageFolder_(spreadsheet);
  const file = folder.createFile(blob);
  return {
    name: safeName,
    url: file.getUrl(),
    thumbUrl: 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1000'
  };
}

function getImageFolder_(spreadsheet) {
  if (CLUB_CARNET_FOLDER_ID) {
    return DriveApp.getFolderById(CLUB_CARNET_FOLDER_ID);
  }

  const spreadsheetFile = DriveApp.getFileById(spreadsheet.getId());
  const parents = spreadsheetFile.getParents();
  if (parents.hasNext()) {
    return parents.next();
  }
  return DriveApp.getRootFolder();
}

function normalizeReply_(reply, user) {
  return {
    id: reply.id,
    noteId: reply.noteId,
    createdAt: reply.createdAt || new Date().toISOString(),
    authorId: user.id,
    authorName: user.name,
    text: reply.text
  };
}

function updateNoteFields_(spreadsheet, noteId, fields) {
  const sheet = spreadsheet.getSheetByName(SHEETS.notes);
  const headers = getHeaders_(sheet);
  const values = sheet.getDataRange().getValues();
  for (let row = 1; row < values.length; row++) {
    if (values[row][headers.indexOf('id')] === noteId) {
      Object.keys(fields).forEach((key) => {
        const column = headers.indexOf(key);
        if (column >= 0) sheet.getRange(row + 1, column + 1).setValue(fields[key]);
      });
      return;
    }
  }
}

function archiveNote_(spreadsheet, noteId, archivedBy) {
  const notesSheet = spreadsheet.getSheetByName(SHEETS.notes);
  const archiveSheet = spreadsheet.getSheetByName(SHEETS.archives);
  const headers = getHeaders_(notesSheet);
  const values = notesSheet.getDataRange().getValues();
  for (let row = 1; row < values.length; row++) {
    if (values[row][headers.indexOf('id')] === noteId) {
      const object = rowToObject_(headers, values[row]);
      object.status = 'Archivé';
      object.archivedAt = new Date().toISOString();
      object.archivedBy = archivedBy;
      appendObject_(archiveSheet, object);
      notesSheet.deleteRow(row + 1);
      return;
    }
  }
}

function deleteNote_(spreadsheet, noteId) {
  const notesSheet = spreadsheet.getSheetByName(SHEETS.notes);
  const headers = getHeaders_(notesSheet);
  const values = notesSheet.getDataRange().getValues();
  for (let row = 1; row < values.length; row++) {
    if (values[row][headers.indexOf('id')] === noteId) {
      notesSheet.deleteRow(row + 1);
      deleteReplies_(spreadsheet, noteId);
      return;
    }
  }
}

function deleteReplies_(spreadsheet, noteId) {
  const repliesSheet = spreadsheet.getSheetByName(SHEETS.replies);
  const headers = getHeaders_(repliesSheet);
  const values = repliesSheet.getDataRange().getValues();
  for (let row = values.length - 1; row >= 1; row--) {
    if (values[row][headers.indexOf('noteId')] === noteId) {
      repliesSheet.deleteRow(row + 1);
    }
  }
}

function readObjects_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1).filter((row) => row.some((cell) => cell !== '')).map((row) => rowToObject_(headers, row));
}

function rowToObject_(headers, row) {
  return headers.reduce((object, header, index) => {
    object[header] = row[index];
    return object;
  }, {});
}

function appendObject_(sheet, object) {
  const headers = getHeaders_(sheet);
  sheet.appendRow(headers.map((header) => object[header] ?? ''));
}

function getHeaders_(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
}

function getCurrentUser_(spreadsheet, userId) {
  const users = readObjects_(spreadsheet.getSheetByName(SHEETS.users));
  const email = Session.getActiveUser().getEmail();
  if (email) {
    const matchedUser = users.find((user) => String(user.email).toLowerCase() === email.toLowerCase() && user.active !== 'FALSE');
    if (matchedUser) return matchedUser;
  }
  return users.find((user) => user.id === userId && user.active !== 'FALSE') || users[0];
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonpResponse(callback, data) {
  const safeCallback = String(callback).replace(/[^\w.$]/g, '');
  return ContentService
    .createTextOutput(safeCallback + '(' + JSON.stringify(data) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
