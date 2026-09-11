(function (S) {
  'use strict';
  const cities = ['changan', 'dunhuang', 'khotan'];
  const ensure = (...args) => S.util.ensure(...args);
  const round = value => S.money.round(value);
  const bands = [
    { min: 0, credit: 200, loanRate: .008, feeRate: .03 },
    { min: 10, credit: 400, loanRate: .0065, feeRate: .025 },
    { min: 20, credit: 700, loanRate: .005, feeRate: .02 },
    { min: 40, credit: 1000, loanRate: .004, feeRate: .015 }
  ];
  function initial() {
    return { deposits: { changan: 0, dunhuang: 0, khotan: 0 }, loans: [], vouchers: [], lastFinanceSettlementTick: 0 };
  }
  function city(p) { ensure(cities.includes(p.world.city) && !p.world.route, 'CITY_REQUIRED', '请抵达城市后前往柜坊办理。'); return p.world.city; }
  function amount(n) { ensure(Number.isSafeInteger(n) && n > 0, 'INVALID_AMOUNT', '请输入有效的正整数钱数。'); return n; }
  function band(p) { return bands.filter(b => p.reputation.value >= b.min).at(-1); }
  function outstanding(f) { return f.loans.filter(l => l.status !== 'repaid'); }
  function snapshot(p) {
    const f = p.finance;
    const deposits = cities.map(cityId => ({ cityId, balance: round(f.deposits[cityId]) }));
    const vouchers = f.vouchers.filter(v => v.status === 'issued').map(v => ({ ...v }));
    const loans = outstanding(f).map(l => ({ loanId: l.loanId, originCity: l.originCity, remainingPrincipal: l.remainingPrincipal, outstandingBalance: round(l.outstandingBalance), accruedInterest: Math.max(0, round(l.outstandingBalance) - l.remainingPrincipal), dailyRate: l.dailyRate, borrowedTick: l.borrowedTick, dueTick: l.dueTick, status: l.status }));
    const wageArrears = (p.merchant?.wageArrears || []).filter(a => a.amount > 0).map(a => ({ ...a }));
    const businessBalance = p.merchant?.businessBalance || 0;
    const totalAssets = p.cash + deposits.reduce((n, x) => n + x.balance, 0) + vouchers.reduce((n, x) => n + x.redeemableAmount, 0) + businessBalance;
    const totalDebt = loans.reduce((n, x) => n + x.outstandingBalance, 0) + wageArrears.reduce((n, x) => n + x.amount, 0);
    const usedCredit = loans.reduce((n, x) => n + x.remainingPrincipal, 0);
    return { cash: p.cash, deposits, vouchers, businessBalance, loans, wageArrears, totalAssets, totalDebt, netFunds: totalAssets - totalDebt, usedCredit, creditLimit: band(p).credit, availableCredit: Math.max(0, band(p).credit - usedCredit), borrowingAllowed: !loans.some(l => l.status === 'overdue'), currentLoanRate: band(p).loanRate, currentFeeRate: band(p).feeRate };
  }
  const cityLabels = { changan: '长安', dunhuang: '敦煌', khotan: '于阗' };
  const noticeSeverity = { threeDays: 1, oneDay: 2, overdue: 3 };
  function queueReminders(p) {
    const fresh = [];
    for (const loan of outstanding(p.finance)) {
      const remaining = loan.dueTick - p.world.tick;
      const tier = remaining < 0 ? 'overdue' : remaining <= 3 ? 'oneDay' : remaining <= 9 ? 'threeDays' : null;
      if (tier && !loan.noticeFlags?.[tier]) fresh.push({ loan, tier });
    }
    const old = p.presentation.notices.find(n => n.kind === 'loan');
    p.presentation.notices = p.presentation.notices.filter(n => n.kind !== 'loan');
    if (!fresh.length) return;
    // Reconcile on every tick: an undisplayed lower stage is replaced, not permanently marked seen.
    const severity = Math.max(...fresh.map(x => noticeSeverity[x.tier]));
    const selected = fresh.filter(x => noticeSeverity[x.tier] === severity), tier = selected[0].tier;
    const loans = selected.map(({ loan }) => ({ loanId: loan.loanId, originCity: loan.originCity, dueTick: loan.dueTick, dueLabel: S.time.format(loan.dueTick), amount: round(loan.outstandingBalance) }));
    const signature = tier + ':' + loans.map(l => l.loanId).sort().join(',');
    p.presentation.notices.push({ id: old?.signature === signature ? old.id : S.util.id(p, 'loan-notice'), kind: 'loan', tier, threshold: tier, severity, signature, nonBlocking: true, title: { threeDays: '贷款即将到期', oneDay: '贷款明日到期', overdue: '贷款已逾期' }[tier], lines: loans.map(l => cityLabels[l.originCity] + '借款：尚欠' + l.amount + '钱，到期' + l.dueLabel), loans });
  }
  function acknowledgeNotices(p, notices) {
    for (const notice of notices) {
      if (notice.kind !== 'loan') continue;
      for (const row of notice.loans || []) {
        const loan = p.finance.loans.find(l => l.loanId === row.loanId);
        if (!loan) continue;
        loan.noticeFlags ||= {};
        for (const [tier, severity] of Object.entries(noticeSeverity)) if (severity <= noticeSeverity[notice.tier]) loan.noticeFlags[tier] = true;
      }
    }
    queueReminders(p);
  }
  function fundsSnapshot(p) {
    const view = snapshot(p);
    const assets = [{ id: 'cash', label: '随身现钱', amount: view.cash }, ...view.deposits.map(d => ({ id: 'deposit-' + d.cityId, label: cityLabels[d.cityId] + '寄存', amount: d.balance })), ...view.vouchers.map(v => ({ id: v.voucherId, label: '飞钱 · ' + cityLabels[v.destinationCity] + '兑付', amount: v.redeemableAmount })), { id: 'merchant', label: '商号账款', amount: view.businessBalance }];
    const debts = [...view.loans.map(l => ({ id: l.loanId, label: cityLabels[l.originCity] + '借款', amount: l.outstandingBalance, dueTick: l.dueTick, dueLabel: S.time.format(l.dueTick), overdue: l.status === 'overdue' })), ...view.wageArrears.map(w => ({ id: w.id, label: '商号欠薪', amount: w.amount, dueLabel: '工钱待付', overdue: false }))];
    return { cash: view.cash, totalFunds: view.totalAssets, totalDebt: view.totalDebt, netFunds: view.netFunds, assets, debts };
  }
  function settle(p, tick = p.world.tick) {
    const f = p.finance;
    ensure(Number.isSafeInteger(tick) && tick >= f.lastFinanceSettlementTick && tick === p.world.tick, 'FINANCE_CLOCK', '金融时间记录不一致。');
    const elapsed = tick - f.lastFinanceSettlementTick;
    if (elapsed) {
      for (const c of cities) f.deposits[c] *= Math.pow(1.003, elapsed / 3);
      for (const l of outstanding(f)) l.outstandingBalance *= Math.pow(1 + l.dailyRate, elapsed / 3);
      ensure(cities.every(c => Number.isFinite(f.deposits[c])) && outstanding(f).every(l => Number.isFinite(l.outstandingBalance)), 'AMOUNT_OVERFLOW', '当前金额无法继续安全结算。');
      f.lastFinanceSettlementTick = tick;
    }
    for (const l of outstanding(f)) {
      if (tick > l.dueTick) {
        l.status = 'overdue';
        if (!l.overduePenaltyApplied) {
          S.reputation.change(p, -2, { type: 'loan-overdue', id: l.loanId });
          l.overduePenaltyApplied = true;
        }
      }
    }
    queueReminders(p);
  }
  function getLoan(p, id) { const l = p.finance.loans.find(x => x.loanId === id); ensure(l && l.status !== 'repaid', 'LOAN_UNAVAILABLE', '该借款已经结清或不存在。'); return l; }
  // Single fee function shared by the reducer and the UI (RC3 BUG-11): fee = max(1, round(face * rate)).
  function voucherFee(rate, n) { return Math.max(1, round(n * rate)); }
  function voucherQuote(p, n) {
    const feeRate = band(p).feeRate;
    let minimumFace = 1; while (minimumFace - voucherFee(feeRate, minimumFace) < 1) minimumFace++;
    const face = Number.isSafeInteger(n) && n > 0 ? n : minimumFace, feeAmount = voucherFee(feeRate, face);
    return { feeRate, faceAmount: face, feeAmount, redeemableAmount: face - feeAmount, minimumFace, valid: face - feeAmount >= 1 };
  }
  function transfer(p, payload, direction) {
    const c = city(p); const n = amount(payload.amount); settle(p);
    p.finance.deposits[c] = round(p.finance.deposits[c]);
    if (direction === 'deposit') { ensure(p.cash >= n, 'INSUFFICIENT_CASH', '随身现钱不足。'); p.cash -= n; p.finance.deposits[c] += n; }
    else { ensure(p.finance.deposits[c] >= n, 'INSUFFICIENT_DEPOSIT', '本地寄存余额不足。'); p.finance.deposits[c] -= n; p.cash += n; }
    return { type: direction, cityId: c, amount: n, cash: p.cash, depositBalance: p.finance.deposits[c] };
  }
  function borrow(p, payload) {
    const c = city(p); const n = amount(payload.amount); settle(p);
    // A financial booking makes current debt balances integer, without repricing old loans.
    for (const l of outstanding(p.finance)) l.outstandingBalance = round(l.outstandingBalance);
    const view = snapshot(p);
    ensure(view.borrowingAllowed, 'OVERDUE_LOAN', '请先清偿逾期借款。');
    ensure(n <= view.availableCredit, 'CREDIT_EXCEEDED', '借款金额超过当前可用授信。');
    const loan = { loanId: S.util.id(p, 'loan'), originCity: c, originalPrincipal: n, remainingPrincipal: n, outstandingBalance: n, dailyRate: band(p).loanRate, borrowedTick: p.world.tick, dueTick: p.world.tick + 90, overduePenaltyApplied: false, status: 'active', noticeFlags: {} };
    p.finance.loans.push(loan); p.cash += n;
    return { type: 'borrow', loan: { ...loan }, cashDelta: n, cash: p.cash };
  }
  function repay(p, payload) {
    city(p); const n = amount(payload.amount); settle(p); const l = getLoan(p, payload.loanId);
    l.outstandingBalance = round(l.outstandingBalance);
    ensure(n <= l.outstandingBalance, 'OVERPAYMENT', '还款金额超过当前应还总额。');
    ensure(n <= p.cash, 'INSUFFICIENT_CASH', '随身现钱不足。');
    const interest = Math.max(0, l.outstandingBalance - l.remainingPrincipal);
    const interestPaid = Math.min(n, interest), principalPaid = Math.min(l.remainingPrincipal, n - interestPaid);
    p.cash -= n; l.outstandingBalance -= n; l.remainingPrincipal -= principalPaid;
    if (l.outstandingBalance === 0) { l.remainingPrincipal = 0; l.status = 'repaid'; }
    queueReminders(p);
    return { type: 'repay', loanId: l.loanId, amount: n, interestPaid, principalPaid, remainingPrincipal: l.remainingPrincipal, remainingDebt: l.outstandingBalance, status: l.status, cashDelta: -n };
  }
  function issue(p, payload) {
    const c = city(p); const n = amount(payload.amount); settle(p);
    ensure(cities.includes(payload.destinationCity) && payload.destinationCity !== c, 'INVALID_DESTINATION', '请选择另一座城市兑付。');
    ensure(['cash', 'deposit'].includes(payload.source), 'INVALID_SOURCE', '请选择随身现钱或本地寄存。');
    if (payload.source === 'deposit') p.finance.deposits[c] = round(p.finance.deposits[c]);
    const balance = payload.source === 'cash' ? p.cash : p.finance.deposits[c];
    ensure(balance >= n, 'INSUFFICIENT_FUNDS', '可用钱款不足。');
    const quote = voucherQuote(p, n), feeRate = quote.feeRate, feeAmount = quote.feeAmount;
    // RC3 BUG-11: a new voucher must redeem at least 1 coin after the fee; nothing is charged otherwise.
    ensure(quote.redeemableAmount >= 1, 'VOUCHER_TOO_SMALL', '面额扣除手续费后须至少可兑1钱，本档最低面额为' + quote.minimumFace + '钱。');
    if (payload.source === 'cash') p.cash -= n; else p.finance.deposits[c] -= n;
    const voucher = { voucherId: S.util.id(p, 'voucher'), originCity: c, destinationCity: payload.destinationCity, faceAmount: n, feeRate, feeAmount, redeemableAmount: n - feeAmount, issuedTick: p.world.tick, status: 'issued' };
    p.finance.vouchers.push(voucher);
    return { type: 'issueVoucher', voucher: { ...voucher }, source: payload.source, amount: n, feeAmount };
  }
  function redeem(p, payload) {
    const c = city(p); settle(p);
    const v = p.finance.vouchers.find(x => x.voucherId === payload.voucherId);
    ensure(v && v.status === 'issued', 'VOUCHER_UNAVAILABLE', '该凭券已经兑付或不存在。');
    ensure(v.destinationCity === c, 'WRONG_CITY', '请抵达凭券指定城市后兑付。');
    p.cash += v.redeemableAmount; v.status = 'redeemed'; v.redeemedTick = p.world.tick;
    return { type: 'redeemVoucher', voucherId: v.voucherId, cashDelta: v.redeemableAmount, cash: p.cash };
  }
  function validate(p) {
    const f = p.finance, integer = S.util.integer;
    ensure(f && cities.every(c => Number.isFinite(f.deposits[c]) && f.deposits[c] >= 0 && f.deposits[c] <= Number.MAX_SAFE_INTEGER), 'INVALID_FINANCE_BALANCE');
    ensure(integer(f.lastFinanceSettlementTick, 0, p.world.tick) && Array.isArray(f.loans) && Array.isArray(f.vouchers), 'INVALID_FINANCE_STATE');
    const ids = new Set();
    for (const l of f.loans) {
      ensure(typeof l.loanId === 'string' && !ids.has(l.loanId), 'DUPLICATE_LOAN'); ids.add(l.loanId);
      ensure(cities.includes(l.originCity) && integer(l.originalPrincipal, 1) && integer(l.remainingPrincipal, 0, l.originalPrincipal), 'INVALID_LOAN');
      ensure(Number.isFinite(l.outstandingBalance) && l.outstandingBalance >= l.remainingPrincipal && l.outstandingBalance <= Number.MAX_SAFE_INTEGER && bands.some(b => b.loanRate === l.dailyRate), 'INVALID_LOAN_BALANCE');
      ensure(integer(l.borrowedTick, 0, p.world.tick) && l.dueTick === l.borrowedTick + 90 && ['active', 'overdue', 'repaid'].includes(l.status), 'INVALID_LOAN_TERM');
      ensure(l.status !== 'repaid' || l.outstandingBalance === 0 && l.remainingPrincipal === 0, 'INVALID_REPAID_LOAN');
    }
    for (const v of f.vouchers) {
      ensure(typeof v.voucherId === 'string' && !ids.has(v.voucherId), 'DUPLICATE_VOUCHER'); ids.add(v.voucherId);
      ensure(cities.includes(v.originCity) && cities.includes(v.destinationCity) && v.originCity !== v.destinationCity, 'INVALID_VOUCHER_CITY');
      ensure(integer(v.faceAmount, 1) && integer(v.feeAmount, 1, v.faceAmount) && v.redeemableAmount === v.faceAmount - v.feeAmount && ['issued', 'redeemed'].includes(v.status), 'INVALID_VOUCHER');
    }
    return true;
  }
  const reducers = { 'finance.deposit': (p, x) => transfer(p, x, 'deposit'), 'finance.withdraw': (p, x) => transfer(p, x, 'withdraw'), 'finance.borrow': borrow, 'finance.repay': repay, 'finance.issueVoucher': issue, 'finance.redeemVoucher': redeem };
  function reduce(p, command, ctx) { ensure(Object.hasOwn(reducers, command.type), 'UNKNOWN_COMMAND', '无法办理该业务。'); const result = reducers[command.type](p, command.payload || {}, ctx); return { ...result, kind: result.type, financeSnapshot: snapshot(p) }; }
  S.finance = { initial, validate, reduce, settle, snapshot, fundsSnapshot, bands, queueReminders, acknowledgeNotices, voucherQuote };
  for (const [type, fn] of Object.entries(reducers)) S.commands.register(type, (p, x, ctx) => reduce(p, { type, payload: x }, ctx));
  S.time.register('finance', { afterTick: p => settle(p) });
})(globalThis.Silk = globalThis.Silk || {});
