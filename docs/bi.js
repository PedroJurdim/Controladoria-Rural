// Visão geral, Explorar e Frota: BI sobre os lançamentos. Filtros compartilhados + clique nos gráficos filtra tudo.
(function () {
  const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nf3 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  const brl0 = (v) => 'R$ ' + nf0.format(v);
  const brl2 = (v) => 'R$ ' + nf2.format(v);
  const brlC = (v) => { const a = Math.abs(v); if (a >= 1e6) return 'R$ ' + nf2.format(v / 1e6) + ' mi'; if (a >= 1e4) return 'R$ ' + nf1.format(v / 1e3) + ' mil'; return brl0(v); };
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const ehMes = (m) => /^\d{4}-\d{2}$/.test(m);
  const fmtMes = (m) => ehMes(m) ? MESES[Number(m.slice(5, 7)) - 1] + '/' + m.slice(2, 4) : m;
  const monthRange = (a, b) => {
    const out = []; let y = +a.slice(0, 4), m = +a.slice(5, 7); const ye = +b.slice(0, 4), me = +b.slice(5, 7);
    while (y < ye || (y === ye && m <= me)) { out.push(y + '-' + String(m).padStart(2, '0')); if (++m > 12) { m = 1; y++; } }
    return out;
  };
  const h = (tag, attrs, ...kids) => {
    const e = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'text') e.textContent = v; else if (k === 'class') e.className = v; else e.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().filter((c) => c !== null && c !== undefined && c !== false).forEach((c) => e.append(c));
    return e;
  };
  const PAL = ['#33176b', '#fa4a2e', '#1ac963', '#00bfc7', '#e0d938', '#a3b2bf', '#bd3824', '#6b7c8f', '#8a63d2', '#ff9a8a', '#0f8f55', '#7fd6db'];

  const ROT = { fazenda: 'Fazenda', mes: 'Mês', categoria: 'Categoria', classif: 'Classificação gerencial', conta: 'Nome da conta',
    tipo: 'Tipo de item / serviço', analise: 'Análise do item', frota: 'Frota (máquina)', dest: 'Destinação', forma: 'Forma de pagamento',
    fornec: 'Fornecedor', planilha: 'Planilha de origem', venc: 'Vencimento' };
  const FILTROS = ['fazenda', 'mes', 'categoria', 'tipo', 'fornec', 'frota', 'classif', 'conta', 'dest', 'forma', 'planilha', 'venc'];
  const PRINCIPAIS = ['fazenda', 'mes', 'categoria'];
  const ehData = (k) => k === 'mes' || k === 'venc';

  let L = null, HA = {}, N = 0, SEM_COD = -1;
  const SEL = {};                       // dimensão -> Set de códigos marcados (vazio/ausente = todos)
  let aba = 'geral';
  const ui = { empilhar: null, metricaFaz: 'valor', abertos: {}, maisFiltros: false };
  const rotulo = (k, i) => { const v = L.dic[k][i]; return ehData(k) ? fmtMes(v) : v; };
  const nomeFaz = (i) => L.dic.fazenda[i];
  const ativo = (k) => SEL[k] && SEL[k].size > 0;

  // ---------------------------------------------------------------- cálculo
  function mascara(ignorar, soFrota) {
    const m = new Uint8Array(N);
    const ks = FILTROS.filter((k) => ativo(k) && !(ignorar && ignorar.includes(k)));
    const fr = L.cod.frota;
    for (let i = 0; i < N; i++) {
      if (soFrota && fr[i] === SEM_COD) continue;
      let ok = true;
      for (const k of ks) if (!SEL[k].has(L.cod[k][i])) { ok = false; break; }
      if (ok) m[i] = 1;
    }
    return m;
  }
  function agrupa(dim, m) {
    const n = L.dic[dim].length, v = new Float64Array(n), c = new Int32Array(n), cod = L.cod[dim];
    for (let i = 0; i < N; i++) if (m[i]) { v[cod[i]] += L.valor[i]; c[cod[i]]++; }
    return { v, c };
  }
  function contexto(m) {   // área considerada para R$/ha
    const pres = new Set(); for (let i = 0; i < N; i++) if (m[i]) pres.add(L.cod.fazenda[i]);
    const comArea = [...pres].filter((f) => HA[nomeFaz(f)]);
    const tot = comArea.filter((f) => HA[nomeFaz(f)].conta_total);
    const usadas = new Set(tot.length ? tot : comArea);
    const ha = [...usadas].reduce((a, f) => a + HA[nomeFaz(f)].ha, 0);
    return { usadas, ha, nFaz: usadas.size };
  }
  const totais = (m) => {
    const ctx = contexto(m); let v = 0, n = 0, vha = 0; const fz = L.cod.fazenda;
    for (let i = 0; i < N; i++) if (m[i]) { v += L.valor[i]; n++; if (ctx.usadas.has(fz[i])) vha += L.valor[i]; }
    return { v, n, rha: ctx.ha ? vha / ctx.ha : null, ha: ctx.ha, nFaz: ctx.nFaz };
  };
  const tile = (t, v, s) => h('div', { class: 'pc-tile' }, h('div', { class: 'pc-tl', text: t }), h('div', { class: 'pc-tv', text: v }), h('div', { class: 'pc-ts', text: s || '' }));
  const tilesDe = (r, m) => {
    const cat = agrupa('categoria', m); let top = -1;
    cat.v.forEach((x, i) => { if (top < 0 || x > cat.v[top]) top = i; });
    return [tile('Custo no filtro', brl0(r.v), nf0.format(r.n) + ' lançamentos'),
      tile('Custo por hectare', r.rha === null ? '—' : brl2(r.rha), r.ha ? 'área considerada: ' + nf0.format(r.ha) + ' ha (' + r.nFaz + ' fazenda' + (r.nFaz === 1 ? '' : 's') + ')' : 'sem fazenda com área neste filtro'),
      tile('Custo por m²', r.rha === null ? '—' : 'R$ ' + nf3.format(r.rha / 10000), 'R$/ha ÷ 10.000'),
      tile('Maior categoria', top >= 0 && cat.v[top] > 0 ? L.dic.categoria[top] : '—', top >= 0 && r.v ? nf1.format(cat.v[top] / r.v * 100) + '% do custo' : ''),
      tile('Valor médio por lançamento', r.n ? brl2(r.v / r.n) : '—', '')];
  };

  // ---------------------------------------------------------------- seleção (filtros compartilhados)
  function alterna(k, i, soUm) {
    if (soUm) { SEL[k] = new Set([i]); }
    else { if (!SEL[k]) SEL[k] = new Set(); SEL[k].has(i) ? SEL[k].delete(i) : SEL[k].add(i); }
    mudou();
  }
  function limpa(k) { if (k) delete SEL[k]; else FILTROS.forEach((x) => delete SEL[x]); mudou(); }

  // ---------------------------------------------------------------- barra de filtros
  const barra = document.getElementById('filtros');
  const dets = {};
  function montarBarra() {
    barra.replaceChildren();
    const chips = h('div', { class: 'bi-chips' });
    const linha1 = h('div', { class: 'bi-barra' }); const linha2 = h('div', { class: 'bi-barra' });
    const btnMais = h('button', { type: 'button', class: 'bi-link', text: 'Mais filtros ▾' });
    btnMais.addEventListener('click', () => { ui.maisFiltros = !ui.maisFiltros; linha2.hidden = !ui.maisFiltros; btnMais.textContent = ui.maisFiltros ? 'Menos filtros ▴' : 'Mais filtros ▾'; });
    linha2.hidden = !ui.maisFiltros;
    FILTROS.forEach((k) => {
      const lista = h('div', { class: 'bi-fl' });
      const busca = h('input', { type: 'search', placeholder: 'Buscar…' });
      const sum = h('summary');
      const det = h('details', { class: 'bi-f' }, sum, h('div', { class: 'bi-fp' }, busca, h('div', { class: 'acoes' }, h('button', { type: 'button', 'data-a': 'limpar', text: 'Limpar' })), lista));
      const ordem = L.dic[k].map((_, i) => i);
      if (ehData(k)) ordem.sort((a, b) => L.dic[k][a].localeCompare(L.dic[k][b]));
      const desenhaLista = () => {
        const q = busca.value.trim().toLowerCase(); lista.replaceChildren(); let n = 0, extra = 0;
        for (const i of ordem) {
          const t = rotulo(k, i); if (q && !t.toLowerCase().includes(q)) continue;
          if (n >= 120) { extra++; continue; } n++;
          const cb = h('input', { type: 'checkbox' }); cb.checked = !!(SEL[k] && SEL[k].has(i));
          cb.addEventListener('change', () => alterna(k, i));
          lista.append(h('label', null, cb, h('span', { text: t })));
        }
        if (extra) lista.append(h('div', { class: 'mais', text: '+ ' + extra + ' itens: use a busca.' }));
        if (!n) lista.append(h('div', { class: 'mais', text: 'Nada encontrado.' }));
      };
      busca.addEventListener('input', desenhaLista);
      det.addEventListener('toggle', () => { if (det.open) desenhaLista(); });
      det.querySelector('[data-a=limpar]').addEventListener('click', () => limpa(k));
      dets[k] = { det, sum, desenhaLista };
      (PRINCIPAIS.includes(k) ? linha1 : linha2).append(det);
    });
    const limparTudo = h('button', { type: 'button', class: 'bi-link', text: 'Limpar tudo' });
    limparTudo.addEventListener('click', () => limpa());
    barra.append(h('h3', { class: 'pc-h2', text: 'Filtros' }),
      h('p', { class: 'bi-nota', text: 'Marque mais de uma fazenda para comparar. Clicar em uma barra dos gráficos também filtra todo o resto.' }),
      linha1, h('div', null, btnMais, ' ', limparTudo), linha2, chips);
    barra._chips = chips;
  }
  function atualizaBarra() {
    FILTROS.forEach((k) => {
      const d = dets[k], s = SEL[k];
      d.sum.replaceChildren(ROT[k], ativo(k) ? h('b', { text: ' (' + s.size + ')' }) : '');
      d.det.classList.toggle('ativo', !!ativo(k));
      if (d.det.open) d.desenhaLista();
    });
    const ch = barra._chips; ch.replaceChildren();
    FILTROS.forEach((k) => { if (ativo(k)) [...SEL[k]].forEach((i) => {
      const c = h('button', { type: 'button', class: 'bi-chip', title: 'Remover este filtro' }, ROT[k] + ': ' + rotulo(k, i) + ' ×');
      c.addEventListener('click', () => alterna(k, i)); ch.append(c);
    }); });
  }
  document.addEventListener('click', (ev) => { Object.values(dets).forEach((d) => { if (d.det.open && !d.det.contains(ev.target)) d.det.open = false; }); });

  // ---------------------------------------------------------------- Visão geral
  const raizG = document.getElementById('v-geral');
  const gTiles = h('section', { class: 'pc-tiles' });
  const gMes = h('section', { class: 'pc-card' });
  const gFaz = h('section', { class: 'pc-card' });
  const gGrade = h('div', { class: 'bi-grade' });
  const CARTOES = [['categoria', 'Por categoria'], ['tipo', 'Tipo de item / serviço'], ['fornec', 'Fornecedores'], ['frota', 'Frota (máquinas)'],
    ['dest', 'Destinação'], ['forma', 'Forma de pagamento'], ['venc', 'Vencimentos (mês)'], ['classif', 'Classificação gerencial'], ['conta', 'Nome da conta']];
  const cardsRank = {};
  CARTOES.forEach(([k, t]) => { cardsRank[k] = h('section', { class: 'pc-card' }); gGrade.append(cardsRank[k]); });
  raizG.replaceChildren(h('div', null, h('h1', { class: 'pc-title', text: 'Custos das fazendas · safra 2026/2027' }),
    h('p', { class: 'bi-nota', id: 'g-nota' })), gTiles, gMes, gFaz, gGrade);

  function selecionado(k, i) { return ativo(k) && SEL[k].has(i); }

  function desenhaMensal() {
    const m = mascara(['mes']);
    const modo = ui.empilhar || ((SEL.fazenda && SEL.fazenda.size > 1) ? 'fazenda' : 'categoria');
    const meses = L.dic.mes.slice().sort(); const lista = monthRange(meses[0], meses[meses.length - 1]);
    const idxMes = {}; L.dic.mes.forEach((x, i) => { idxMes[x] = i; });
    const kdim = modo, nk = L.dic[kdim].length, cm = L.cod.mes, ck = L.cod[kdim];
    const mat = lista.map(() => new Float64Array(nk)), tot = new Float64Array(lista.length), pos = {}; lista.forEach((x, i) => { pos[x] = i; });
    for (let i = 0; i < N; i++) if (m[i]) { const p = pos[L.dic.mes[cm[i]]]; mat[p][ck[i]] += L.valor[i]; tot[p] += L.valor[i]; }
    const totK = new Float64Array(nk); mat.forEach((r) => r.forEach((x, j) => { totK[j] += x; }));
    const ordemK = [...totK.keys()].filter((j) => totK[j] > 0).sort((a, b) => totK[b] - totK[a]);
    const cor = (j) => PAL[j % PAL.length];
    const max = Math.max(...tot) || 1;
    const sel = SEL.mes && SEL.mes.size;
    const sx = h('select'); [['categoria', 'Categoria'], ['fazenda', 'Fazenda']].forEach(([v, t]) => sx.append(new Option(t, v))); sx.value = modo;
    sx.addEventListener('change', () => { ui.empilhar = sx.value; desenhaMensal(); });
    const cols = h('div', { class: 'bi-cols' });
    lista.forEach((mes, p) => {
      const i = idxMes[mes]; const on = i !== undefined && selecionado('mes', i);
      const col = h('div', { class: 'bi-col' + (sel && !on ? ' fraco' : '') + (i === undefined ? ' vazio' : ''), title: fmtMes(mes) + ': ' + brl0(tot[p]) });
      const pilha = h('div', { class: 'bi-pilha' });
      [...ordemK].reverse().forEach((j) => { if (mat[p][j] > 0) pilha.append(h('i', { style: `height:${(mat[p][j] / max * 100).toFixed(2)}%;background:${cor(j)}`, title: L.dic[kdim][j] + ': ' + brl0(mat[p][j]) })); });
      col.append(h('div', { class: 'bi-vv', text: tot[p] ? brlC(tot[p]).replace('R$ ', '') : '' }), pilha, h('div', { class: 'bi-ml' }, fmtMes(mes)));
      if (i !== undefined) col.addEventListener('click', () => alterna('mes', i));
      cols.append(col);
    });
    const leg = h('div', { class: 'bi-leg' });
    ordemK.forEach((j) => {
      const b = h('button', { type: 'button', class: 'bi-lg' + (ativo(kdim) && !SEL[kdim].has(j) ? ' fraco' : '') }, h('i', { style: 'background:' + cor(j) }), L.dic[kdim][j]);
      b.addEventListener('click', () => alterna(kdim, j)); leg.append(b);
    });
    gMes.replaceChildren(h('div', { class: 'bi-cab' }, h('div', null, h('h3', { class: 'pc-h2', text: 'Custo por mês' }), h('p', { class: 'bi-nota', text: 'Clique em uma barra para filtrar o mês (clique de novo para soltar).' })),
      h('label', { class: 'bi-ctl' }, 'Empilhar por', sx)), h('div', { class: 'bi-rolagem' }, cols), leg);
  }

  function linhaBarra(o) {   // linha clicável de gráfico de barras horizontal
    const r = h('div', { class: 'bi-lh' + (o.sel ? ' on' : '') + (o.fraco ? ' fraco' : ''), title: o.dica || '' },
      h('div', { class: 'bi-ln', text: o.nome }),
      h('div', { class: 'bi-lb' }, h('i', { style: `width:${Math.max(o.w > 0 ? 1.5 : 0, o.w).toFixed(1)}%;background:${o.cor || 'var(--brand-2)'}` })),
      h('div', { class: 'bi-lv', text: o.valor }));
    if (o.clique) r.addEventListener('click', o.clique);
    return r;
  }

  function desenhaFazendas() {
    const m = mascara(['fazenda']); const { v, c } = agrupa('fazenda', m);
    const sx = h('select'); [['valor', 'Valor (R$)'], ['ha', 'R$ por hectare'], ['m2', 'R$ por m²']].forEach(([a, t]) => sx.append(new Option(t, a))); sx.value = ui.metricaFaz;
    sx.addEventListener('change', () => { ui.metricaFaz = sx.value; desenhaFazendas(); });
    const rows = [...v.keys()].filter((i) => c[i] > 0 || selecionado('fazenda', i)).map((i) => {
      const f = HA[nomeFaz(i)]; const rha = f ? v[i] / f.ha : null;
      return { i, v: v[i], rha, m2: rha === null ? null : rha / 10000, c: c[i] };
    });
    const chv = (r) => ui.metricaFaz === 'valor' ? r.v : (ui.metricaFaz === 'ha' ? r.rha : r.m2);
    rows.sort((a, b) => (chv(b) ?? -1) - (chv(a) ?? -1));
    const max = Math.max(...rows.map((r) => chv(r) || 0)) || 1;
    const lista = h('div', { class: 'bi-lista' });
    rows.forEach((r) => lista.append(linhaBarra({
      nome: nomeFaz(r.i), w: (chv(r) || 0) / max * 100, sel: selecionado('fazenda', r.i), fraco: ativo('fazenda') && !selecionado('fazenda', r.i),
      cor: PAL[r.i % PAL.length],
      valor: brlC(r.v) + (r.rha === null ? ' · sem área' : ' · ' + (ui.metricaFaz === 'm2' ? 'R$ ' + nf3.format(r.m2) + '/m²' : brl0(r.rha) + '/ha')),
      dica: nf0.format(r.c) + ' lançamentos', clique: () => alterna('fazenda', r.i)
    })));
    gFaz.replaceChildren(h('div', { class: 'bi-cab' }, h('div', null, h('h3', { class: 'pc-h2', text: 'Custo por fazenda' }),
      h('p', { class: 'bi-nota', text: 'Clique para escolher fazendas e comparar. R$/ha = custo ÷ área cadastrada (fazendas sem área ficam com "sem área").' })),
      h('label', { class: 'bi-ctl' }, 'Barra mostra', sx)), lista);
  }

  function desenhaRanking(k, titulo) {
    const m = mascara([k]); const { v, c } = agrupa(k, m);
    let idx = [...v.keys()].filter((i) => c[i] > 0 || selecionado(k, i));
    if (k === 'frota') idx = idx.filter((i) => i !== SEM_COD);
    const cron = k === 'venc';
    idx.sort(cron ? (a, b) => L.dic[k][a].localeCompare(L.dic[k][b]) : (a, b) => v[b] - v[a]);
    const tot = idx.reduce((a, i) => a + v[i], 0);
    const limite = cron ? 99 : 10; const aberto = ui.abertos[k];
    const mostra = aberto ? idx : idx.slice(0, limite);
    const max = Math.max(...idx.map((i) => v[i]), 1);
    const lista = h('div', { class: 'bi-lista' });
    mostra.forEach((i) => lista.append(linhaBarra({ nome: rotulo(k, i), w: v[i] / max * 100, sel: selecionado(k, i), fraco: ativo(k) && !selecionado(k, i),
      cor: k === 'categoria' ? PAL[i % PAL.length] : null, valor: brlC(v[i]) + (tot ? ' · ' + nf1.format(v[i] / tot * 100) + '%' : ''),
      dica: nf0.format(c[i]) + ' lançamentos', clique: () => alterna(k, i) })));
    if (!idx.length) lista.append(h('p', { class: 'bi-vazio', text: 'Nada neste filtro.' }));
    const cx = [h('h3', { class: 'pc-h2', text: titulo }), lista];
    if (idx.length > limite) {
      const b = h('button', { type: 'button', class: 'bi-link', text: aberto ? 'Mostrar menos' : 'Ver todos (' + nf0.format(idx.length) + ')' });
      b.addEventListener('click', () => { ui.abertos[k] = !aberto; desenhaRanking(k, titulo); }); cx.push(b);
    }
    cardsRank[k].replaceChildren(...cx);
  }

  function desenhaGeral() {
    const m = mascara(); const r = totais(m);
    gTiles.replaceChildren(...tilesDe(r, m));
    desenhaMensal(); desenhaFazendas();
    CARTOES.forEach(([k, t]) => desenhaRanking(k, t));
    const ult = (dash.data('geral').data || [{}])[0] || {};
    const nota = document.getElementById('g-nota');
    nota.textContent = (ult.atualizado_em ? 'Atualizado em ' + ult.atualizado_em.slice(8, 10) + '/' + ult.atualizado_em.slice(5, 7) + '/' + ult.atualizado_em.slice(0, 4) + '. ' : '') +
      'Só custos: mão de obra fica fora deste painel.';
  }

  // ---------------------------------------------------------------- tabela (Explorar e Frota)
  const TODAS_DIM = ['fazenda', 'mes', 'categoria', 'classif', 'tipo', 'conta', 'analise', 'frota', 'dest', 'forma', 'fornec', 'planilha', 'venc'];
  function criarTabela(raiz, cfg) {
    const est = { g1: cfg.g1, g2: cfg.g2 || '', metrica: 'valor', ordem: null, todos: false };
    let linhasAtuais = [], resumo = null;
    const selG1 = h('select'), selG2 = h('select'), selM = h('select');
    cfg.agrupar.forEach((k) => selG1.append(new Option(ROT[k], k)));
    selG2.append(new Option('(nenhum)', '')); cfg.agrupar.forEach((k) => selG2.append(new Option(ROT[k], k)));
    [['valor', 'Valor (R$)'], ['ha', 'R$ por hectare'], ['m2', 'R$ por m²']].forEach(([v, t]) => selM.append(new Option(t, v)));
    selG1.value = est.g1; selG2.value = est.g2;
    const bCsv = h('button', { type: 'button', text: 'Baixar CSV' });
    const tiles = h('section', { class: 'pc-tiles' }); const nota = h('p', { class: 'bi-nota' }); const tabela = h('div', { class: 'pc-tw' });
    raiz.replaceChildren(h('div', null, h('h1', { class: 'pc-title', text: cfg.titulo }), h('p', { class: 'bi-nota', text: cfg.sub })),
      h('section', { class: 'pc-card' }, h('div', { class: 'bi-barra' }, h('label', { class: 'bi-ctl' }, 'Agrupar por', selG1), h('label', { class: 'bi-ctl' }, 'e depois por', selG2), h('label', { class: 'bi-ctl' }, 'Barra mostra', selM), bCsv)),
      tiles, h('section', { class: 'pc-card' }, tabela), nota);
    selG1.addEventListener('change', () => { est.g1 = selG1.value; est.ordem = null; est.todos = false; render(); });
    selG2.addEventListener('change', () => { est.g2 = selG2.value; est.ordem = null; est.todos = false; render(); });
    selM.addEventListener('change', () => { est.metrica = selM.value; desenha(); });
    bCsv.addEventListener('click', () => baixarCsv());

    function render() {
      const m = mascara(null, cfg.soFrota);
      const ctx = contexto(m); const porFaz = est.g1 === 'fazenda' || est.g2 === 'fazenda';
      const g1 = L.cod[est.g1], g2 = est.g2 ? L.cod[est.g2] : null, fz = L.cod.fazenda;
      const mapa = new Map(); let vT = 0, nT = 0, vhaT = 0;
      for (let i = 0; i < N; i++) {
        if (!m[i]) continue;
        const v = L.valor[i], f = fz[i], k = g1[i] * 65536 + (g2 ? g2[i] : 0);
        let e = mapa.get(k); if (!e) { e = { a: g1[i], b: g2 ? g2[i] : -1, v: 0, n: 0, vha: 0, faz: porFaz ? f : -1 }; mapa.set(k, e); }
        e.v += v; e.n++;
        if (porFaz) { if (HA[nomeFaz(f)]) e.vha += v; } else if (ctx.usadas.has(f)) e.vha += v;
        vT += v; nT++; if (ctx.usadas.has(f)) vhaT += v;
      }
      linhasAtuais = [...mapa.values()].map((e) => {
        let ha = null; if (porFaz) { const hf = HA[nomeFaz(e.faz)]; ha = hf ? hf.ha : null; } else ha = ctx.ha || null;
        const rha = ha ? e.vha / ha : null;
        return { a: rotulo(est.g1, e.a), b: e.b >= 0 ? rotulo(est.g2, e.b) : '', ka: e.a, v: e.v, n: e.n, pct: vT ? e.v / vT : 0, ha: rha, m2: rha === null ? null : rha / 10000 };
      });
      resumo = { v: vT, n: nT, rha: ctx.ha ? vhaT / ctx.ha : null, ha: ctx.ha, nFaz: ctx.nFaz, porFaz };
      tiles.replaceChildren(...tilesDe(resumo, m).filter((_, i) => i !== 3));
      desenha();
    }
    function ordenar(linhas) {
      let { campo, dir } = est.ordem || {}; if (!campo) { campo = ehData(est.g1) ? 'a' : 'v'; dir = ehData(est.g1) ? 1 : -1; }
      return linhas.slice().sort((x, y) => {
        let c;
        if (campo === 'a') c = ehData(est.g1) ? L.dic[est.g1][x.ka].localeCompare(L.dic[est.g1][y.ka]) : x.a.localeCompare(y.a, 'pt-BR');
        else if (campo === 'b') c = x.b.localeCompare(y.b, 'pt-BR'); else c = (x[campo] ?? -Infinity) - (y[campo] ?? -Infinity);
        return (c || (y.v - x.v)) * dir;
      });
    }
    function desenha() {
      const r = resumo;
      if (!linhasAtuais.length) { tabela.replaceChildren(h('p', { class: 'bi-vazio', text: 'Nenhum lançamento com esses filtros.' })); nota.textContent = ''; return; }
      const ord = ordenar(linhasAtuais), mostrar = est.todos ? ord : ord.slice(0, 40);
      const cb = est.metrica === 'valor' ? 'v' : est.metrica, max = Math.max(...ord.map((x) => x[cb] || 0)) || 1;
      const cab = (t, campo, n) => {
        const a = est.ordem && est.ordem.campo === campo;
        const th = h('th', { class: n ? 'n' : '', text: t + (a ? (est.ordem.dir === 1 ? ' ▲' : ' ▼') : '') });
        th.addEventListener('click', () => { est.ordem = { campo, dir: a ? -est.ordem.dir : (n ? -1 : 1) }; desenha(); }); return th;
      };
      const t = h('table', { class: 'bi-t' });
      t.append(h('thead', null, h('tr', null, cab(ROT[est.g1], 'a'), est.g2 ? cab(ROT[est.g2], 'b') : null, cab('Valor', 'v', 1), cab('% do total', 'pct', 1), cab('Lançam.', 'n', 1), cab('R$/ha', 'ha', 1), cab('R$/m²', 'm2', 1), h('th'))));
      const tb = h('tbody');
      mostrar.forEach((x) => tb.append(h('tr', null, h('td', { text: x.a }), est.g2 ? h('td', { text: x.b }) : null, h('td', { class: 'n', text: brl0(x.v) }),
        h('td', { class: 'n', text: nf1.format(x.pct * 100) + '%' }), h('td', { class: 'n', text: nf0.format(x.n) }),
        h('td', { class: 'n', text: x.ha === null ? '—' : brl2(x.ha) }), h('td', { class: 'n', text: x.m2 === null ? '—' : 'R$ ' + nf3.format(x.m2) }),
        h('td', null, h('span', { class: 'bi-b' }, h('i', { style: 'width:' + Math.max(1, Math.round((x[cb] || 0) / max * 100)) + '%' }))))));
      tb.append(h('tr', { class: 'tot' }, h('td', { text: 'Total' }), est.g2 ? h('td') : null, h('td', { class: 'n', text: brl0(r.v) }), h('td', { class: 'n', text: '100%' }), h('td', { class: 'n', text: nf0.format(r.n) }),
        h('td', { class: 'n', text: r.rha === null ? '—' : brl2(r.rha) }), h('td', { class: 'n', text: r.rha === null ? '—' : 'R$ ' + nf3.format(r.rha / 10000) }), h('td')));
      t.append(tb); const partes = [t];
      if (ord.length > mostrar.length) {
        const b = h('button', { type: 'button', class: 'bi-link', text: 'Mostrar todas as ' + nf0.format(ord.length) + ' linhas' });
        b.addEventListener('click', () => { est.todos = true; desenha(); }); partes.push(b);
      }
      tabela.replaceChildren(...partes);
      nota.textContent = r.porFaz ? 'R$/ha por linha usa a área da própria fazenda; fazendas sem área ficam com "—".' : 'R$/ha por linha = custo da linha (só fazendas com área) ÷ área das fazendas do filtro. Clique nos títulos para ordenar.';
    }
    function baixarCsv() {
      const ord = ordenar(linhasAtuais), num = (v) => v === null ? '' : String(Math.round(v * 1000) / 1000).replace('.', ','), esc = (s) => '"' + String(s).replace(/"/g, '""') + '"';
      const cab = [ROT[est.g1]].concat(est.g2 ? [ROT[est.g2]] : [], ['Valor', '% do total', 'Lançamentos', 'R$/ha', 'R$/m²']);
      const rows = ord.map((x) => [esc(x.a)].concat(est.g2 ? [esc(x.b)] : [], [num(x.v), num(x.pct * 100), x.n, num(x.ha), num(x.m2)]));
      const txt = '﻿' + [cab.map(esc).join(';')].concat(rows.map((r) => r.join(';'))).join('\r\n');
      const a = h('a', { href: URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' })), download: 'painel-' + cfg.id + '.csv' });
      document.body.append(a); a.click(); a.remove();
    }
    return { render };
  }

  // ---------------------------------------------------------------- orquestração
  let tabExplorar = null, tabFrota = null;
  function render() {
    if (!L) return;
    if (aba === 'geral') desenhaGeral(); else if (aba === 'explorar') tabExplorar.render(); else if (aba === 'frota') tabFrota.render();
  }
  function mudou() { atualizaBarra(); render(); }

  const abas = document.getElementById('abas');
  abas.addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-aba]'); if (!b) return;
    aba = b.dataset.aba;
    abas.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    document.querySelectorAll('.aba').forEach((s) => { s.hidden = s.id !== 'v-' + aba; });
    barra.hidden = aba === 'qual';
    render(); window.scrollTo(0, 0);
  });

  dash.onData(() => {
    const d = dash.data('lanc'); if (d.status !== 'ok') return;
    L = d.data; N = L.n; HA = {};
    ((dash.data('areas_faz').data) || []).forEach((a) => { HA[a.fazenda] = a; });
    SEM_COD = L.dic.frota.indexOf('(sem código)');
    FILTROS.forEach((k) => delete SEL[k]);
    ui.empilhar = null; ui.abertos = {};
    tabExplorar = criarTabela(document.getElementById('v-explorar'), { id: 'explorar', titulo: 'Explorar os lançamentos',
      sub: 'Agrupe e some os lançamentos do jeito que precisar, usando os filtros do topo. O custo por hectare usa a área das fazendas cadastradas.',
      agrupar: TODAS_DIM, g1: 'fazenda', g2: '' });
    tabFrota = criarTabela(document.getElementById('v-frota'), { id: 'frota', titulo: 'Frota (máquinas e veículos)', soFrota: true,
      sub: 'Somente lançamentos com código de máquina no campo Frota (ex.: SF47, CG07, SR04), em qualquer categoria. Textos que não parecem código (ex.: "salário") ficam de fora e aparecem na aba Qualidade dos dados.',
      agrupar: ['frota', 'fazenda', 'categoria', 'tipo', 'mes', 'conta', 'fornec'], g1: 'frota', g2: 'fazenda' });
    montarBarra(); atualizaBarra(); barra.hidden = aba === 'qual'; render();
  });
})();
