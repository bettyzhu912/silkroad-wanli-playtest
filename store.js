(function (S) {
  'use strict';
  const { ensure, clone, stable, integer, DomainError } = S.util;
  const keyFor = c => c.generation + ':' + c.sourceType + ':' + c.sourceId;
  const fingerprint = c => stable({ type: c.type, payload: c.payload || {} });
  const safeError = error => ({ code: error.code || 'SAVE_FAILED', message: error.message || '暂时未能保存，请重试' });
  function validateCommand(command) {
    ensure(command && integer(command.generation) && integer(command.revision), 'INVALID_COMMAND');
    ensure(typeof command.type === 'string' && typeof command.sourceType === 'string' && typeof command.sourceId === 'string' && command.sourceId.length > 0 && command.sourceId.length <= 200, 'INVALID_COMMAND');
    ensure(!command.sourceType.includes(':') && !command.sourceId.includes(':'), 'INVALID_SOURCE_ID');
  }
  class SaveStore {
    constructor(name = 'silkroad-rebuild-v1', options = {}) { this.name = name; this.db = null; this.options = options; this.busy = false; }
    async open() {
      ensure(typeof indexedDB !== 'undefined', 'STORAGE_UNAVAILABLE', '当前环境无法使用自动存档');
      if(this.db){this.db.close();this.db=null;}
      this.db = await new Promise((resolve, reject) => {
        // A database version change closes old clients before they can write with old rules.
        const request = indexedDB.open(this.name, 2);
        request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('state')) request.result.createObjectStore('state'); };
        request.onsuccess = () => { const db = request.result; db.onversionchange = () => { db.close(); this.db = null; }; resolve(db); };
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new DomainError('STORAGE_BLOCKED', '请先关闭另一处游戏页面后重试'));
      });
      await this.transaction('readwrite', (store, set, fail) => {
        const request = store.get('current'); request.onsuccess = () => {
          if (!request.result) store.put(S.core.emptyEnvelope(), 'current'); set(true);
        }; request.onerror = () => fail(request.error);
      });
      return this.load();
    }
    transaction(mode, body) {
      ensure(this.db, 'STORAGE_CLOSED');
      return new Promise((resolve, reject) => {
        let result; let failure;
        const tx = this.db.transaction(['state'], mode);
        tx.oncomplete = () => resolve(result);
        tx.onabort = () => reject(failure || tx.error || new DomainError('SAVE_FAILED', '保存未完成，进度尚未更改'));
        tx.onerror = () => { /* onabort owns failure; do not report success early */ };
        const fail = error => { failure = error; try { tx.abort(); } catch (_) { reject(error); } };
        try { body(tx.objectStore('state'), value => { result = value; }, fail, tx); } catch (error) { fail(error); }
      });
    }
    async load() {
      const state = await this.transaction('readonly', (store, set, fail) => {
        const r = store.get('current'); r.onsuccess = () => set(r.result); r.onerror = () => fail(r.error);
      });
      S.core.validate(state); return clone(state);
    }
    async readBackup() {
      return this.transaction('readonly', (store, set, fail) => {
        const r = store.get('backup'); r.onsuccess = () => { try { if (r.result) S.core.validate(r.result); set(r.result || null); } catch (e) { fail(e); } }; r.onerror = () => fail(r.error);
      });
    }
    async recoveryInfo(){
      return this.transaction('readonly',(store,set,fail)=>{
        const a=store.get('current'),b=store.get('backup');let current,backup,count=0;
        const finish=()=>{if(++count!==2)return;let valid=false;try{S.core.validate(backup);valid=true;}catch(_){}
          const safeMeta=current?.meta&&integer(current.meta.generation)&&integer(current.meta.revision);
          set({canRestore:Boolean(safeMeta&&valid&&backup.meta.generation===current.meta.generation),generation:safeMeta?current.meta.generation:null,revision:safeMeta?current.meta.revision:null});};
        a.onsuccess=()=>{current=a.result;finish();};b.onsuccess=()=>{backup=b.result;finish();};a.onerror=()=>fail(a.error);b.onerror=()=>fail(b.error);
      });
    }
    async prepare(command) {
      validateCommand(command);
      return this.transaction('readwrite', (store, set, fail) => {
        const request = store.get('current'); request.onsuccess = () => {
          try {
            const current = request.result; S.core.validate(current);
            ensure(S.core.isCurrent(current),'RULES_UPGRADE_REQUIRED','请重新载入，完成存档规则升级后继续');
            ensure(command.generation === current.meta.generation, 'STALE_GENERATION', '这处页面的进度已经重开，请重新载入');
            const key = keyFor(command); const existing = current.ledger[key];
            if (existing) {
              ensure(existing.fingerprint === fingerprint(command), 'IDEMPOTENCY_CONFLICT', '同一操作标识不能用于另一项操作');
              set({ replayed: true, state: current, record: existing }); return;
            }
            if (current.pending) {
              ensure(current.pending.key === key && current.pending.fingerprint === fingerprint(command), 'TRANSACTION_PENDING', '上一次操作尚待保存，请先恢复');
              set({ pending: clone(current.pending) }); return;
            }
            ensure(command.revision === current.meta.revision, 'STALE_REVISION', '进度已在另一处更新，请重新载入');
            ensure(current.progress || command.type === 'game.start' || command.type === 'game.reset' || command.type === 'settings.update', 'NO_GAME');   // settings live in the envelope: editable from the home screen too
            current.pending = { key, fingerprint: fingerprint(command), command: clone(command), baseRevision: current.meta.revision, status: 'pending' };
            store.put(current, 'current'); set({ pending: clone(current.pending) });
          } catch (error) { fail(error); }
        }; request.onerror = () => fail(request.error);
      });
    }
    async commit(pending) {
      return this.transaction('readwrite', (store, set, fail, tx) => {
        const request = store.get('current'); request.onsuccess = () => {
          try {
            const current = request.result;
            ensure(current.meta.generation === pending.command.generation, 'STALE_GENERATION');
            const already = current.ledger[pending.key];
            if (already) { ensure(already.fingerprint === pending.fingerprint, 'IDEMPOTENCY_CONFLICT'); set({ state: current, record: already, replayed: true }); return; }
            ensure(current.pending && current.pending.key === pending.key && current.pending.fingerprint === pending.fingerprint, 'STALE_PENDING');
            ensure(current.meta.revision === pending.baseRevision, 'STALE_REVISION');
            const draft = clone(current); const before = clone(current); before.pending = null;
            const command = pending.command;
            let result;
            try {
              // A click prepared by an older build has not applied gameplay yet. Do not
              // silently execute it at new prices; preserve its key as a zero-effect failure.
              ensure(S.core.isCurrent(current),'RULES_UPGRADED_RETRY','规则已更新，上次未完成的操作未扣费，请重新确认');
              if (command.type === 'game.start') {
                ensure(!draft.progress, 'GAME_ALREADY_STARTED');
                draft.progress = S.core.initialProgress(command.payload.mode, command.payload.seed);
                if(S.tutorial?.started)S.tutorial.started(draft.progress);
                draft.preferences.tutorialEnabled = command.payload.mode === 'guided';
                result = { kind: 'gameStarted', modal: false };
              } else if (command.type === 'game.reset') {
                draft.meta.generation++;
                draft.progress = null; draft.ledger = {}; draft.results = {};
                result = { kind: 'gameReset', modal: false };
              } else if (command.type === 'settings.update') {
                const {key,value}=command.payload;
                // GLOBAL_AUDIO_SYSTEM_v0.1: musicEnabled / sfxEnabled (boolean) and musicVolume / sfxVolume (0..1) live in the same persisted preferences
                ensure((['tutorialEnabled','soundEnabled','musicEnabled','sfxEnabled'].includes(key) && typeof value==='boolean')||(['musicVolume','sfxVolume'].includes(key)&&typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1),'INVALID_SETTING');
                draft.preferences[key]=value;
                if(key==='tutorialEnabled')draft.progress.presentation.tutorialEnabled=value;
                result={kind:'settingsUpdated',modal:false};
              } else {
                result = S.commands.run(draft.progress, command, S.core.context(command.sourceId)) || { modal: false };
              }
              ensure(!result || typeof result.then !== 'function', 'ASYNC_REDUCER', '业务处理不可在保存事务中异步执行');
              if (result && result.modal !== false && draft.progress) {
                const resultId = pending.key;
                result = { ...result, id: resultId };
                draft.progress.presentation.activeResult = clone(result);
              }
              draft.meta.revision++;
              draft.pending = null;
              const record = { status: 'committed', fingerprint: pending.fingerprint, result: clone(result), revision: draft.meta.revision, generation: draft.meta.generation };
              if (command.type !== 'game.reset') draft.ledger[pending.key] = record;
              S.core.validate(draft);
              if (command.type === 'game.reset') {store.delete('backup');store.delete('recovery-source');} else store.put(before, 'backup');
              store.put(draft, 'current');
              if (this.options.failBeforeCommit) { this.options.failBeforeCommit = false; tx.abort(); return; }
              set({ state: draft, record, replayed: false });
            } catch (error) {
              if (!(error instanceof DomainError)) throw error;
              // Failed business validation is durable, with zero gameplay mutation.
              current.pending = null;
              const record = { status: 'failed', fingerprint: pending.fingerprint, error: safeError(error), revision: current.meta.revision, generation: current.meta.generation };
              current.ledger[pending.key] = record; store.put(current, 'current');
              set({ state: current, record, replayed: false });
            }
          } catch (error) { fail(error); }
        }; request.onerror = () => fail(request.error);
      });
    }
    async execute(command) {
      const prepared = await this.prepare(command);
      const outcome = prepared.replayed ? prepared : await this.commit(prepared.pending);
      if (outcome.record.status === 'failed') {
        const error = new DomainError(outcome.record.error.code, outcome.record.error.message); error.state = clone(outcome.state); throw error;
      }
      return { state: clone(outcome.state), result: clone(outcome.record.result), replayed: Boolean(outcome.replayed) };
    }
    async recoverPending() {
      const state = await this.load();
      if (!state.pending) return { state, result: null, recovered: false };
      const outcome = await this.commit(state.pending);
      if (outcome.record.status === 'failed') return { state: outcome.state, result: null, recovered: true, error: outcome.record.error };
      return { state: clone(outcome.state), result: clone(outcome.record.result), recovered: true };
    }
    async upgrade() {
      return this.transaction('readwrite',(store,set,fail)=>{
        const request=store.get('current');request.onsuccess=()=>{try{
          const current=request.result,upgrade=S.core.upgradeEnvelope(current);
          if(upgrade.changed){store.put(current,'backup');store.put(upgrade.state,'current');}
          set(upgrade);
        }catch(error){fail(error);}};request.onerror=()=>fail(request.error);
      });
    }
    async restoreBackup(expectedGeneration, expectedRevision) {
      return this.transaction('readwrite', (store, set, fail) => {
        const a = store.get('current'); const b = store.get('backup'); let current; let backup; let read = 0;
        const finish = () => { if (++read !== 2) return; try {
          ensure(current && current.meta.generation === expectedGeneration && current.meta.revision === expectedRevision, 'STALE_REVISION');
          ensure(backup && backup.meta.generation === current.meta.generation, 'NO_VALID_BACKUP'); S.core.validate(backup);
          backup.pending = null;backup=S.core.upgradeEnvelope(backup).state;
          backup.meta.revision = current.meta.revision + 1; store.put(current,'recovery-source');store.put(backup, 'current'); set(clone(backup));
        } catch (error) { fail(error); } };
        a.onsuccess = () => { current = a.result; finish(); }; b.onsuccess = () => { backup = b.result; finish(); };
        a.onerror = () => fail(a.error); b.onerror = () => fail(b.error);
      });
    }
    async resetUnreadable(expectedGeneration,expectedRevision){
      return this.transaction('readwrite',(store,set,fail)=>{
        const r=store.get('current');r.onsuccess=()=>{try{
          const current=r.result;
          ensure(current?.meta?.generation===expectedGeneration&&current.meta.revision===expectedRevision,'STALE_REVISION');
          const next=S.core.emptyEnvelope();next.meta.generation=expectedGeneration+1;next.meta.revision=expectedRevision+1;
          for(const key of ['soundEnabled','tutorialEnabled','musicEnabled','sfxEnabled','musicVolume','sfxVolume'])if(['boolean','number'].includes(typeof current.preferences?.[key]))next.preferences[key]=current.preferences[key];
          S.core.validate(next);store.put(next,'current');store.delete('backup');store.delete('recovery-source');set(clone(next));
        }catch(e){fail(e);}};r.onerror=()=>fail(r.error);
      });
    }
    close() { if (this.db) this.db.close(); this.db = null; }
  }
  S.SaveStore = SaveStore;
})(globalThis.Silk = globalThis.Silk || {});
