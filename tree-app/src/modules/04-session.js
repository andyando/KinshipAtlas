  // ---------------------------------------------------------------------------
  // 4. Session persistence (IndexedDB)
  // ---------------------------------------------------------------------------

  function getActiveSessionId() {
    let sessionId = sessionStorage.getItem('kinship-atlas-session-id');
    if (!sessionId) {
      sessionId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem('kinship-atlas-session-id', sessionId);
    }
    return sessionId;
  }

  function openSessionDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('kinship-atlas-session', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('sessions');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function readActiveSession() {
    const database = await openSessionDatabase();
    return new Promise((resolve, reject) => {
      const request = database.transaction('sessions', 'readonly').objectStore('sessions').get(getActiveSessionId());
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async function writeActiveSession(session) {
    const database = await openSessionDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction('sessions', 'readwrite');
      transaction.objectStore('sessions').put(session, getActiveSessionId());
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('Session write aborted.'));
    });
  }

  async function persistActiveSession() {
    if (!state.fileName || !state.gedcomText) return;
    const snapshot = {
      fileName: state.fileName,
      gedcomText: state.gedcomText,
      gedcomDirty: state.gedcomDirty,
      gedcomSource: state.gedcomSource,
      gedcomBaseHash: state.gedcomBaseHash,
      gedcomFileHandle: state.gedcomFileHandle,
      primaryMediaKey: state.primaryMediaKey,
      selectedId: state.selectedId,
      mediaDirectoryHandle: state.mediaDirectoryHandle
    };
    state.sessionSaveQueue = state.sessionSaveQueue.catch(() => {}).then(() => writeActiveSession(snapshot));
    try {
      await state.sessionSaveQueue;
    } catch {
      showToast('This browser could not retain the current session. Keep the GEDCOM saved to a file.');
    }
  }

  async function clearActiveSession() {
    const sessionId = sessionStorage.getItem('kinship-atlas-session-id');
    sessionStorage.removeItem('kinship-atlas-session-id');
    if (!sessionId) return;
    await state.sessionSaveQueue.catch(() => {});
    try {
      const database = await openSessionDatabase();
      await new Promise((resolve, reject) => {
        const transaction = database.transaction('sessions', 'readwrite');
        transaction.objectStore('sessions').delete(sessionId);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });
    } catch {
      showToast('The saved browser session could not be cleared.');
    }
    state.sessionSaveQueue = Promise.resolve();
  }

