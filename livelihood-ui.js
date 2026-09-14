(function (S) {
  'use strict';
  // 营生 (livelihood) lists of the city scenes. 长安 opens 酒肆诗令 directly (tavern-ui.js 'work'); 敦煌 and 于阗 open a list panel whose
  // job cards are registered by the minigame host UIs (驼队装货 / 缀纹成章 → 'dunhuang', 于阗织坊 → 'khotan'). A card only describes the job
  // and its availability; entering hands over to the game's own panel, which owns the world contract (caravan.js / pattern-chain.js /
  // weaving.js). The card markup / classes are the ones the 驼队装货 card has used since R7 (caravan.css).
  const cards = {};
  function asset(name) { const f = S.assets && S.assets[name]; if (!f) throw new Error('CURRENT asset mapping missing: ' + name); return f; }
  S.livelihood = {
    register(city, card) { if (!cards[city]) cards[city] = []; cards[city] = cards[city].filter(x => x.id !== card.id).concat([card]); return card; },
    cards(city) { return (cards[city] || []).slice(); }
  };
  function renderList(city) {
    return (c, b) => {
      const list = cards[city] || [];
      for (const card of list) {
        const av = card.availability(c.p);
        const box = c.el('section', 'caravan-job-card'); box.dataset.job = card.id;
        box.append(c.el('h3', '', card.title), c.el('p', 'caravan-job-desc', card.description));
        const meta = c.el('div', 'caravan-job-meta'); meta.append(c.el('span', '', card.time), c.el('span', '', card.pay)); box.append(meta);
        if (card.art) { const artBox = c.el('div', 'caravan-job-art ' + (card.art.className || '')); artBox.style.backgroundImage = `url('${asset(card.art.key)}')`; artBox.setAttribute('role', 'img'); artBox.setAttribute('aria-label', card.art.label || card.title); box.append(artBox); }
        if (!av.canStartFormal && av.reason) box.append(c.el('p', 'caravan-job-note', av.reason + (av.canTrial ? '（仍可试玩）' : '')));
        box.append(c.button(card.enter, () => c.openPanel(card.panel)));
        b.append(box);
      }
      if (!list.length) c.paragraph(b, '敬请期待');
    };
  }
  S.ui.registerPanel('dunhuang-work', { title: '营生', render: renderList('dunhuang') });
  S.ui.registerPanel('khotan-work', { title: '营生', render: renderList('khotan') });
})(globalThis.Silk = globalThis.Silk || {});
