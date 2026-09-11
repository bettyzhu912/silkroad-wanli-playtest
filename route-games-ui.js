(function (S) {
  "use strict";
  let app = null, refs = {}, frame = 0, operation = null;
  const local = { sessionId: null, savedSequence: null, baseMs: 0, anchor: 0, running: false, hold: false, failed: null, settling: false };
  const instructions = {
    "RM-01": "货箱往哪边倒，就点另一边把它扶正。",
    "RM-02": "点击队伍所在方向，把骆驼牵回来。",
    "RM-03": "点击四处沙尘，把前路清出来。",
    "RM-04": "点击新鲜的驼蹄印，辨清前路。",
    "RM-05": "点击收起散落的五件货物。",
    "RM-06": "点击左、右，让驼队避开碎石。"
  };
  const current = () => app?.state.progress ? S.minigames.view(app.state.progress) : null;
  function elapsed(v = current()) {
    if (!v) return 0;
    return Math.min(v.durationMs, Math.max(v.elapsedMs, Math.floor(local.baseMs + (local.running ? performance.now() - local.anchor : 0))));
  }
  function stop(v = current()) {
    if (v && local.sessionId === v.sessionId) local.baseMs = elapsed(v);
    local.running = false; cancelAnimationFrame(frame); frame = 0;
  }
  function sync(v) {
    if (!v) { stop(); local.sessionId = null; return; }
    if (v.sessionId !== local.sessionId) {
      stop(); Object.assign(local, { sessionId: v.sessionId, savedSequence: v.sequence, baseMs: v.elapsedMs, anchor: performance.now(), hold: false, failed: null, settling: false });
    }
    if (local.savedSequence !== v.sequence) { local.savedSequence = v.sequence; local.baseMs = v.elapsedMs; local.anchor = performance.now(); }
    if (v.phase !== "PLAYING" || v.result) { stop(v); local.baseMs = v.elapsedMs; }
    else if (!operation && !local.hold && !document.hidden && !local.running) {
      local.baseMs = v.elapsedMs; local.anchor = performance.now(); local.running = true;
    }
    if (local.running && !frame) frame = requestAnimationFrame(animate);
  }
  function sourceId(type, payload) {
    return "route-ui-" + app.state.meta.generation + "-" + app.state.meta.revision + "-" + type + "-" + (payload.sequence || 0);
  }
  async function send(type, payload, id) {
    if (operation) return operation;
    stop(); const stableId = id || sourceId(type, payload);
    operation = S.ui.dispatch(type, payload, stableId);
    let outcome;
    try {
      outcome = await operation;
      if (outcome === null) { local.failed = { type, payload, id: stableId }; local.hold = true; }
      else local.failed = null;
    } finally {
      operation = null;
      const v = current(); if (v) { local.baseMs = v.elapsedMs; local.savedSequence = v.sequence; local.anchor = performance.now(); }
      sync(v); if (app) S.ui.render(app.state);
    }
    return outcome;
  }
  async function step(action, ms) {
    const v = current(); if (!v || v.result || v.phase !== "PLAYING" || operation) return null;
    const payload = { sessionId: v.sessionId, sequence: v.sequence + 1, elapsedMs: ms === undefined ? elapsed(v) : ms };
    if (action) payload.action = action;
    const result = await send("RM_STEP", payload);
    if (result !== null) await settle();
    return result;
  }
  async function settle() {
    const v = current();
    if (!v?.result || v.result.worldEffectsCommitted || operation || local.settling || local.failed) return;
    local.settling = true;
    try { await send("EVENT_RM_RESOLVE", { eventSessionId: v.eventSessionId, rmSessionId: v.sessionId }); }
    finally { local.settling = false; }
  }
  function paint(v) {
    const now = elapsed(v), projected = S.minigames.preview(app.state.progress, now);
    if (refs.timer?.isConnected) refs.timer.textContent = (Math.max(0, v.durationMs - now) / 1000).toFixed(1) + "秒";
    if (refs.progress?.isConnected) refs.progress.value = now;
    const available = v.phase === "PLAYING" && !operation && !local.hold && !S.ui.getState().busy && now < v.durationMs;
    for (const button of refs.controls || []) if (button.isConnected) button.disabled = !available || button.dataset.collected === "true";
    if (refs.marker?.isConnected && ["RM-01", "RM-02"].includes(v.moduleId)) {
      refs.marker.style.left = (projected.x / 4) + "%";
      if (v.moduleId === "RM-01") refs.marker.style.transform = "translateX(-50%) rotate(" + ((projected.x - 200) / 7) + "deg)";
    }
    if (v.moduleId === "RM-06") {
      if (refs.marker?.isConnected) refs.marker.style.left = ((projected.lane + .5) / 3 * 100) + "%";
      for (let i = 0; i < (refs.stones || []).length; i++) {
        const stone = refs.stones[i], obstacle = projected.obstacles[i];
        stone.hidden = obstacle.checked;
        stone.style.top = Math.max(2, Math.min(83, 83 - (obstacle.atMs - now) / 3000 * 78)) + "%";
      }
    }
  }
  function animate() {
    frame = 0; const v = current();
    if (!v || v.phase !== "PLAYING" || v.result || local.hold || document.hidden) { stop(v); return; }
    paint(v);
    if (elapsed(v) >= v.durationMs && !operation) { void step(); return; }
    frame = requestAnimationFrame(animate);
  }
  async function pause() {
    let v = current(); if (!v || v.result) return;
    const at = elapsed(v); local.hold = true; stop(v);
    if (operation) await operation;
    v = current(); if (!v || v.result || local.failed) return;
    if (v.phase === "PLAYING" && at > v.elapsedMs) await step(undefined, at);
    v = current();
    if (v && !v.result && !local.failed) await send("RM_PAUSE", { sessionId: v.sessionId });
  }
  async function resume() {
    if (operation) return;
    if (local.failed) {
      const failed = local.failed;
      if (await send(failed.type, failed.payload, failed.id) === null) return;
    }
    const v = current(); if (!v) return;
    local.hold = false;
    if (v.result) { await settle(); return; }
    if (v.phase === "PAUSED") await send("RM_RESUME", { sessionId: v.sessionId });
    else { sync(v); S.ui.render(app.state); }
  }
  async function start(event, skip = false) {
    const result = await send("RM_START", { moduleId: event.eventId, eventSessionId: event.id });
    if (result === null) return;
    if (skip) await skipCurrent();
  }
  async function skipCurrent() {
    const v = current(); if (!v || v.result || operation) return;
    if (await send("RM_SKIP", { sessionId: v.sessionId }) !== null) await settle();
  }
  // RC3 BUG-05: skipping settles the module's MISSED outcome; the player confirms first.
  function confirmSkip(c, run) {
    c.showModal({ title: "跳过小游戏？", body: "跳过将按本次小游戏未完成的结果结算。", actions: [{ label: "返回", run: c.dismissModal }, { label: "确认跳过", run: async () => { c.dismissModal(); await run(); } }] });
  }
  function controls(c, target, v) {
    refs.controls = [];
    const add = (label, action, className) => {
      const button = c.button(label, () => step(action), { className: className || "ui-button" });
      refs.controls.push(button); target.append(button); return button;
    };
    if (["RM-01", "RM-02", "RM-06"].includes(v.moduleId)) {
      add("向左", { direction: -1 }); add("向右", { direction: 1 });
    } else if (v.moduleId === "RM-04") {
      ["陈旧的车辙", "新鲜的驼蹄印", "覆沙的足迹"].forEach((label, index) => add(label, { target: index }, "ui-button route-sign"));
    } else {
      const count = v.moduleId === "RM-03" ? 4 : 5;
      for (let i = 0; i < count; i++) {
        const collected = v.targets.includes(i);
        const label = v.moduleId === "RM-03" ? collected ? "前路清晰" : "拂去风沙" : collected ? "已收好" : "收起货包";
        const button = add(label, { target: i }, "ui-button route-target " + (v.moduleId === "RM-03" ? "sand-target" : "cargo-target"));
        button.setAttribute("aria-label", label + " " + (i + 1)); button.dataset.collected = String(collected);
        if (collected) { button.classList.add("target-collected"); button.disabled = true; delete button.dataset.busyDisabled; }
      }
    }
  }
  S.ui.registerPanel("event", {
    title: "商路见闻", noClose: true,
    render(c, body) {
      app = c.app; const e = c.p.eventSession;
      if (!e || e.status === "ACKNOWLEDGED") { c.paragraph(body, "这段见闻已经记下。可以继续赶路。"); return; }
      const d = S.events.definitions[e.eventId];
      body.append(c.el("h3", "route-event-title", d.title)); c.paragraph(body, d.eventText);
      if(e.storyProtectionChoices?.length){
          const text=[...new Set(e.storyProtectionChoices.map(x=>x.chapterText).filter(Boolean))].join('\n\n');if(text)c.paragraph(body,text);
          const selected=e.storyProtectionChoices.find(x=>x.id===e.node?.storyProtectionChoice);
          if(selected)c.paragraph(body,'已选：'+selected.text,'form-hint');
          else for(const choice of e.storyProtectionChoices)body.append(c.button(choice.text,()=>c.dispatch('EVENT_STORY_PROTECTION_SELECT',{eventSessionId:e.id,choiceId:choice.id})));
      }
      if (e.status === "AWAITING_SKILL") c.paragraph(body, instructions[e.eventId], "form-hint");
      else if (e.status === "AWAITING_CHOICE") {
        const group = c.el("div", "route-event-choices");
        for (const choice of d.choices) {
          const enabled = S.events.choiceAllowed(c.p, choice.condition);
          group.append(c.button(choice.choiceText.replace(/\bTick\b/g, "时段"), () => c.dispatch("EVENT_CHOOSE", { eventSessionId: e.id, choiceId: choice.choiceId }), { disabled: !enabled }));
        }
        body.append(group);
      }
    },
    footer(c, footer) {
      const e = c.p.eventSession;
      if (e?.status === "AWAITING_SKILL") footer.append(c.button("开始", () => start(e),{disabled:Boolean(e.storyProtectionChoices?.length&&!e.node?.storyProtectionChoice)}), c.button("跳过", () => confirmSkip(c, () => start(e, true)), { className: "text-button", disabled: Boolean(e.storyProtectionChoices?.length && !e.node?.storyProtectionChoice) }));
      else if (!e || e.status === "ACKNOWLEDGED") footer.append(c.button("继续", () => c.closePanel()));
    }
  });
  S.ui.registerPanel("route-minigame", {
    title: "路途小事", noClose: true,
    render(c, body) {
      app = c.app; const v = S.minigames.view(c.p); refs = {}; sync(v);
      if (!v) { c.paragraph(body, "当前没有待处理的路途小事。"); return; }
      body.append(c.el("h3", "route-event-title", v.name));
      if (local.failed || local.hold || v.phase === "PAUSED") { c.paragraph(body, local.failed ? "保存尚未完成，计时已暂停。" : "驼队暂歇，回来后继续。", "route-pause"); return; }
      if (v.result) {
        c.paragraph(body, v.result.worldEffectsCommitted ? "这段路途小事已经记下。" : "操作已结束，正在记下结果。");
        if (!v.result.worldEffectsCommitted && !operation && !local.settling) queueMicrotask(settle);
        return;
      }
      const top = c.el("div", "route-game-top"); refs.timer = c.el("strong", "route-game-timer");
      top.append(c.el("span", "", instructions[v.moduleId]), refs.timer); body.append(top);
      refs.progress = c.el("progress", "route-game-progress"); refs.progress.max = v.durationMs; refs.progress.setAttribute("aria-label", "剩余操作时间"); body.append(refs.progress);
      if (["RM-01", "RM-02"].includes(v.moduleId)) {
        const track = c.el("div", "route-track");
        if (v.moduleId === "RM-01") track.append(c.el("div", "route-safe-zone"));
        else track.append(c.el("span", "route-team", "队伍"));
        refs.marker = c.el("div", v.moduleId === "RM-01" ? "route-crate" : "route-camel", v.moduleId === "RM-01" ? "货箱" : "骆驼");
        track.append(refs.marker); body.append(track);
      } else if (v.moduleId === "RM-06") {
        const road = c.el("div", "route-lanes"); refs.stones = [];
        for (let i = 0; i < 3; i++) road.append(c.el("div", "route-lane"));
        for (const obstacle of v.obstacles) { const stone = c.el("div", "route-stone", "碎石"); stone.style.left = ((obstacle.lane + .5) / 3 * 100) + "%"; refs.stones.push(stone); road.append(stone); }
        refs.marker = c.el("div", "route-moving-team", "驼队"); road.append(refs.marker); body.append(road);
      }
      const group = c.el("div", "route-game-controls " + (["RM-03", "RM-05"].includes(v.moduleId) ? "route-target-grid" : "")); controls(c, group, v); body.append(group); paint(v);
    },
    footer(c, footer) {
      const v = S.minigames.view(c.p); if (!v) { footer.append(c.button("返回", () => c.closePanel())); return; }
      if (local.failed || local.hold || v.phase === "PAUSED") footer.append(c.button(local.failed ? "重试保存" : "继续", resume));
      else if (!v.result) footer.append(c.button("暂歇", pause, { className: "text-button" }), c.button("跳过", () => confirmSkip(c, skipCurrent), { className: "text-button" }));
      else if (v.result.worldEffectsCommitted) footer.append(c.button("继续", () => c.closePanel()));
    }
  });
  S.ui.registerResult("event", (c, body, result) => {
    c.paragraph(body, "你的选择：" + result.chosenDisplayText, "form-hint"); c.paragraph(body, result.resultText);
    for (const effect of result.effects || []) {
      if (effect.type === "cash") c.row("钱财", (effect.delta > 0 ? "+" : "−") + c.formatMoney(Math.abs(effect.delta)), body);
      else if (effect.type === "reputation") c.row("商誉", (effect.delta > 0 ? "+" : "") + effect.delta, body);
      else if (effect.type === "world_time") c.row("时间", "耗时" + effect.deltaTicks + "个时段", body);
      else if (effect.type === "info") c.paragraph(body,effect.actualInfoText||effect.text);
      else if (effect.type === "story_protection") c.paragraph(body,effect.text);
      else if (effect.type === "route_remaining") c.row("行程", (effect.deltaTicks < 0 ? "缩短" : "延长") + Math.abs(effect.deltaTicks) + "个时段", body);
      else if (effect.type === "provisions") c.row("补给", (effect.delta > 0 ? "+" : "") + effect.delta + "日份", body);
      else if (effect.type === "cargo_damage" || effect.type === "cargo_loss") c.row("货物", effect.goodId + "×" + effect.quantity + " " + ({ damaged: "受损", destroyed: "损毁", lost: "遗失" }[effect.condition] || ""), body);
    }
    for (const note of result.outcomeNotes || []) c.paragraph(body, note, "form-hint");
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) void pause(); });
  window.addEventListener("pagehide", () => { stop(); local.hold = true; });
})(globalThis.Silk = globalThis.Silk || {});
