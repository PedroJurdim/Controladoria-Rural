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
  const denom = (f, campo) => { const a = HA[nomeFaz(f)]; return a && a[campo] > 0 ? a[campo] : 0; };
  function contexto(m, campo) {   // denominador (hectares ou plantas) das fazendas presentes no filtro
    campo = campo || 'ha';
    const pres = new Set(); for (let i = 0; i < N; i++) if (m[i]) pres.add(L.cod.fazenda[i]);
    const comD = [...pres].filter((f) => denom(f, campo) > 0);
    const tot = comD.filter((f) => HA[nomeFaz(f)].conta_total);
    const usadas = new Set(tot.length ? tot : comD);
    const ha = [...usadas].reduce((a, f) => a + denom(f, campo), 0);
    return { usadas, ha, nFaz: usadas.size };
  }
  const totais = (m) => {
    const cA = contexto(m, 'ha'), cP = contexto(m, 'plantas'); let v = 0, n = 0, vha = 0, vpl = 0; const fz = L.cod.fazenda;
    for (let i = 0; i < N; i++) if (m[i]) { v += L.valor[i]; n++; if (cA.usadas.has(fz[i])) vha += L.valor[i]; if (cP.usadas.has(fz[i])) vpl += L.valor[i]; }
    return { v, n, rha: cA.ha ? vha / cA.ha : null, ha: cA.ha, nFaz: cA.nFaz, rpl: cP.ha ? vpl / cP.ha : null, pl: cP.ha, nFazP: cP.nFaz };
  };
  const tile = (t, v, s) => h('div', { class: 'pc-tile' }, h('div', { class: 'pc-tl', text: t }), h('div', { class: 'pc-tv', text: v }), h('div', { class: 'pc-ts', text: s || '' }));
  const tilesDe = (r, m) => {
    const cat = agrupa('categoria', m); let top = -1;
    cat.v.forEach((x, i) => { if (top < 0 || x > cat.v[top]) top = i; });
    return [tile('Custo no filtro', brl0(r.v), nf0.format(r.n) + ' lançamentos'),
      tile('Custo por hectare', r.rha === null ? '—' : brl2(r.rha), r.ha ? 'área considerada: ' + nf0.format(r.ha) + ' ha (' + r.nFaz + ' fazenda' + (r.nFaz === 1 ? '' : 's') + ')' : 'sem fazenda com área neste filtro'),
      tile('Custo por m²', r.rha === null ? '—' : 'R$ ' + nf3.format(r.rha / 10000), 'R$/ha ÷ 10.000'),
      tile('Custo por planta', r.rpl === null ? '—' : brl2(r.rpl), r.pl ? nf0.format(r.pl) + ' plantas (' + r.nFazP + ' fazenda' + (r.nFazP === 1 ? '' : 's') + ')' : 'sem plantas cadastradas neste filtro'),
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
    const sx = h('select'); [['valor', 'Valor (R$)'], ['ha', 'R$ por hectare'], ['m2', 'R$ por m²'], ['pl', 'R$ por planta']].forEach(([a, t]) => sx.append(new Option(t, a))); sx.value = ui.metricaFaz;
    sx.addEventListener('change', () => { ui.metricaFaz = sx.value; desenhaFazendas(); });
    const rows = [...v.keys()].filter((i) => c[i] > 0 || selecionado('fazenda', i)).map((i) => {
      const f = HA[nomeFaz(i)]; const rha = f && f.ha > 0 ? v[i] / f.ha : null; const rpl = f && f.plantas > 0 ? v[i] / f.plantas : null;
      return { i, v: v[i], rha, m2: rha === null ? null : rha / 10000, rpl, c: c[i] };
    });
    const chv = (r) => ui.metricaFaz === 'valor' ? r.v : (ui.metricaFaz === 'ha' ? r.rha : (ui.metricaFaz === 'pl' ? r.rpl : r.m2));
    rows.sort((a, b) => (chv(b) ?? -1) - (chv(a) ?? -1));
    const max = Math.max(...rows.map((r) => chv(r) || 0)) || 1;
    const lista = h('div', { class: 'bi-lista' });
    rows.forEach((r) => lista.append(linhaBarra({
      nome: nomeFaz(r.i), w: (chv(r) || 0) / max * 100, sel: selecionado('fazenda', r.i), fraco: ativo('fazenda') && !selecionado('fazenda', r.i),
      cor: PAL[r.i % PAL.length],
      valor: brlC(r.v) + (ui.metricaFaz === 'pl' ? (r.rpl === null ? ' · sem plantas' : ' · ' + brl2(r.rpl) + '/planta') : (r.rha === null ? ' · sem área' : ' · ' + (ui.metricaFaz === 'm2' ? 'R$ ' + nf3.format(r.m2) + '/m²' : brl0(r.rha) + '/ha'))),
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
      const ctx = contexto(m, 'ha'), ctxP = contexto(m, 'plantas'); const porFaz = est.g1 === 'fazenda' || est.g2 === 'fazenda';
      const g1 = L.cod[est.g1], g2 = est.g2 ? L.cod[est.g2] : null, fz = L.cod.fazenda;
      const mapa = new Map(); let vT = 0, nT = 0, vhaT = 0;
      for (let i = 0; i < N; i++) {
        if (!m[i]) continue;
        const v = L.valor[i], f = fz[i], k = g1[i] * 65536 + (g2 ? g2[i] : 0);
        let e = mapa.get(k); if (!e) { e = { a: g1[i], b: g2 ? g2[i] : -1, v: 0, n: 0, vha: 0, vpl: 0, faz: porFaz ? f : -1 }; mapa.set(k, e); }
        e.v += v; e.n++;
        if (porFaz) { if (denom(f, 'ha') > 0) e.vha += v; if (denom(f, 'plantas') > 0) e.vpl += v; }
        else { if (ctx.usadas.has(f)) e.vha += v; if (ctxP.usadas.has(f)) e.vpl += v; }
        vT += v; nT++; if (ctx.usadas.has(f)) vhaT += v;
      }
      linhasAtuais = [...mapa.values()].map((e) => {
        let ha = null, pl = null; if (porFaz) { ha = denom(e.faz, 'ha') || null; pl = denom(e.faz, 'plantas') || null; } else { ha = ctx.ha || null; pl = ctxP.ha || null; }
        const rha = ha ? e.vha / ha : null, rpl = pl ? e.vpl / pl : null;
        return { a: rotulo(est.g1, e.a), b: e.b >= 0 ? rotulo(est.g2, e.b) : '', ka: e.a, v: e.v, n: e.n, pct: vT ? e.v / vT : 0, ha: rha, m2: rha === null ? null : rha / 10000, pl: rpl };
      });
      resumo = { v: vT, n: nT, rha: ctx.ha ? vhaT / ctx.ha : null, ha: ctx.ha, nFaz: ctx.nFaz, porFaz };
      tiles.replaceChildren(...tilesDe(resumo, m).filter((_, i) => i !== 4));
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
      t.append(h('thead', null, h('tr', null, cab(ROT[est.g1], 'a'), est.g2 ? cab(ROT[est.g2], 'b') : null, cab('Valor', 'v', 1), cab('% do total', 'pct', 1), cab('Lançam.', 'n', 1), cab('R$/ha', 'ha', 1), cab('R$/m²', 'm2', 1), cab('R$/planta', 'pl', 1), h('th'))));
      const tb = h('tbody');
      mostrar.forEach((x) => tb.append(h('tr', null, h('td', { text: x.a }), est.g2 ? h('td', { text: x.b }) : null, h('td', { class: 'n', text: brl0(x.v) }),
        h('td', { class: 'n', text: nf1.format(x.pct * 100) + '%' }), h('td', { class: 'n', text: nf0.format(x.n) }),
        h('td', { class: 'n', text: x.ha === null ? '—' : brl2(x.ha) }), h('td', { class: 'n', text: x.m2 === null ? '—' : 'R$ ' + nf3.format(x.m2) }), h('td', { class: 'n', text: x.pl === null ? '—' : brl2(x.pl) }),
        h('td', null, h('span', { class: 'bi-b' }, h('i', { style: 'width:' + Math.max(1, Math.round((x[cb] || 0) / max * 100)) + '%' }))))));
      tb.append(h('tr', { class: 'tot' }, h('td', { text: 'Total' }), est.g2 ? h('td') : null, h('td', { class: 'n', text: brl0(r.v) }), h('td', { class: 'n', text: '100%' }), h('td', { class: 'n', text: nf0.format(r.n) }),
        h('td', { class: 'n', text: r.rha === null ? '—' : brl2(r.rha) }), h('td', { class: 'n', text: r.rha === null ? '—' : 'R$ ' + nf3.format(r.rha / 10000) }), h('td', { class: 'n', text: r.rpl === null ? '—' : brl2(r.rpl) }), h('td')));
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
      const cab = [ROT[est.g1]].concat(est.g2 ? [ROT[est.g2]] : [], ['Valor', '% do total', 'Lançamentos', 'R$/ha', 'R$/m²', 'R$/planta']);
      const rows = ord.map((x) => [esc(x.a)].concat(est.g2 ? [esc(x.b)] : [], [num(x.v), num(x.pct * 100), x.n, num(x.ha), num(x.m2), num(x.pl)]));
      const txt = '﻿' + [cab.map(esc).join(';')].concat(rows.map((r) => r.join(';'))).join('\r\n');
      const a = h('a', { href: URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' })), download: 'painel-' + cfg.id + '.csv' });
      document.body.append(a); a.click(); a.remove();
    }
    return { render };
  }


  // ---------------------------------------------------------------- Orçado x Realizado
  const mesDe = (iso) => String(iso || '').slice(0, 7);
  function criarOrc(raiz) {
    const dados = (dash.data('orcamento').data) || [];
    const per = dados.find((r) => r.id === 'periodo');
    const taxas = dados.filter((r) => r.id !== 'periodo');
    if (!per || !taxas.length) {
      raiz.replaceChildren(h('h1', { class: 'pc-title', text: 'Orçado × realizado' }),
        h('section', { class: 'pc-card' }, h('p', { class: 'bi-vazio', text: 'A planilha "Orcamento por hectare.xlsx" ainda não foi encontrada (ou está sem valores). Coloque-a na pasta das planilhas e rode a atualização.' })));
      return { render() {} };
    }
    const taxa = {}; taxas.forEach((t) => { taxa[t.classif] = t; });
    const hoje = mesDe(((dash.data('geral').data || [{}])[0] || {}).atualizado_em) || per.fim;
    const ate = hoje < per.fim ? hoje : per.fim;
    const janela = monthRange(per.inicio, ate > per.inicio ? ate : per.inicio);
    const tiles = h('section', { class: 'pc-tiles' }), cMes = h('section', { class: 'pc-card' }), cClas = h('section', { class: 'pc-card' }), cFaz = h('section', { class: 'pc-card' }), nota = h('p', { class: 'bi-nota' });
    raiz.replaceChildren(h('div', null, h('h1', { class: 'pc-title', text: 'Orçado × realizado' }),
      h('p', { class: 'bi-nota', text: 'Orçamento = R$ por hectare (' + (per.base === 'safra' ? 'da safra, dividido por mês' : 'por mês') + ') × hectares de cada fazenda. Período ' + fmtMes(per.inicio) + ' a ' + fmtMes(per.fim) + ', contando até o mês atual. Esta aba usa os filtros de Fazenda, Mês e Categoria.' })),
      tiles, cMes, cClas, cFaz, nota);
    const cor = (p) => (p > 1.1 ? '#f21f36' : (p > 1 ? '#e0a800' : '#1ac963'));
    const estilo = (pp) => 'font-weight:700;' + (pp === null ? '' : 'color:' + cor(pp));
    const pctT = (pp) => (pp === null ? '—' : nf0.format(pp * 100) + '%');
    function render() {
      const meses = janela.filter((x) => !ativo('mes') || [...SEL.mes].some((i) => L.dic.mes[i] === x));
      const cand = ativo('fazenda') ? [...SEL.fazenda].map((i) => nomeFaz(i)) : Object.keys(HA);
      const comArea = cand.filter((f) => HA[f] && HA[f].ha > 0);
      const tot = comArea.filter((f) => HA[f].conta_total);
      const usadas = new Set(tot.length ? tot : comArea);
      const haFaz = {}; usadas.forEach((f) => { haFaz[f] = HA[f].ha; });
      const mesSet = new Set(meses);
      const real = { total: 0, porMes: {}, porFaz: {}, porClas: {} };
      meses.forEach((x) => { real.porMes[x] = 0; });
      for (let i = 0; i < N; i++) {
        const f = nomeFaz(L.cod.fazenda[i]); if (!usadas.has(f)) continue;
        const mes = L.dic.mes[L.cod.mes[i]]; if (!mesSet.has(mes)) continue;
        if (ativo('categoria') && !SEL.categoria.has(L.cod.categoria[i])) continue;
        const ci = L.cod.categoria[i], cc = L.dic.categoria[ci], v = L.valor[i];
        real.total += v; real.porMes[mes] += v; real.porFaz[f] = (real.porFaz[f] || 0) + v;
        const o = real.porClas[cc] || (real.porClas[cc] = { v: 0, ci }); o.v += v;
      }
      const classSel = (cc) => !ativo('categoria') || [...SEL.categoria].some((i) => L.dic.categoria[i] === cc);
      const orcClas = {}; Object.values(taxa).forEach((t) => { if (classSel(t.classif)) orcClas[t.classif] = t.valor_ha_mes; });
      const taxaSel = Object.values(orcClas).reduce((a, b) => a + b, 0);
      const haTot = Object.values(haFaz).reduce((a, b) => a + b, 0);
      const orcTotal = taxaSel * haTot * meses.length;
      const saldo = orcTotal - real.total, p = orcTotal ? real.total / orcTotal : null;
      tiles.replaceChildren(tile('Orçado no período', brl0(orcTotal), meses.length + ' mês(es) · ' + nf0.format(haTot) + ' ha'),
        tile('Realizado', brl0(real.total), usadas.size + ' fazenda' + (usadas.size === 1 ? '' : 's') + ' com área'),
        tile(saldo >= 0 ? 'Saldo (sobrou)' : 'Estouro', brl0(Math.abs(saldo)), saldo >= 0 ? 'ainda dentro do orçamento' : 'gasto acima do orçado'),
        tile('Orçamento usado', p === null ? '—' : nf1.format(p * 100) + '%', 'realizado ÷ orçado'));
      const orcMes = taxaSel * haTot, max = Math.max(orcMes, ...meses.map((x) => real.porMes[x]), 1);
      const cols = h('div', { class: 'bi-cols' });
      meses.forEach((x) => {
        const r = real.porMes[x], pp = orcMes ? r / orcMes : 0, idx = L.dic.mes.indexOf(x);
        const col = h('div', { class: 'bi-col', title: fmtMes(x) + ': realizado ' + brl0(r) + ' · orçado ' + brl0(orcMes) });
        col.append(h('div', { class: 'bi-vv', text: orcMes ? nf0.format(pp * 100) + '%' : '' }),
          h('div', { class: 'bi-par' }, h('i', { class: 'orc', style: 'height:' + (orcMes / max * 100).toFixed(1) + '%' }), h('i', { style: 'height:' + (r / max * 100).toFixed(1) + '%;background:' + cor(pp) })),
          h('div', { class: 'bi-ml', text: fmtMes(x) }));
        if (idx >= 0) col.addEventListener('click', () => alterna('mes', idx));
        cols.append(col);
      });
      cMes.replaceChildren(h('h3', { class: 'pc-h2', text: 'Mês a mês' }), h('p', { class: 'bi-nota', text: 'Barra cinza = orçado do mês. Barra colorida = realizado (verde dentro do orçamento, amarela até 10% acima, vermelha acima disso). Clique para filtrar o mês.' }), h('div', { class: 'bi-rolagem' }, cols));
      const todas = new Set([...Object.keys(orcClas), ...Object.keys(real.porClas)]);
      const linhas = [...todas].map((cc) => {
        const o = (orcClas[cc] || 0) * haTot * meses.length, r = (real.porClas[cc] || { v: 0 }).v;
        return { cc, nome: '', o, r, ci: (real.porClas[cc] || {}).ci, semOrc: !orcClas[cc] };
      }).sort((a, b) => b.r - a.r);
      const tb = h('table', { class: 'bi-t' });
      tb.append(h('thead', null, h('tr', null, h('th', { text: 'Classificação orçamentária' }), h('th', { class: 'n', text: 'Orçado' }), h('th', { class: 'n', text: 'Realizado' }), h('th', { class: 'n', text: 'Saldo' }), h('th', { class: 'n', text: '% usado' }))));
      const tbd = h('tbody');
      linhas.forEach((x) => {
        const pp = x.o ? x.r / x.o : null, sd = x.o - x.r;
        const tr = h('tr', { style: 'cursor:pointer' }, h('td', { text: x.cc }), h('td', { class: 'n', text: x.semOrc ? 'sem orçamento' : brl0(x.o) }), h('td', { class: 'n', text: brl0(x.r) }),
          h('td', { class: 'n', style: x.semOrc ? '' : 'color:' + (sd >= 0 ? '#0f8f55' : '#f21f36'), text: x.semOrc ? '—' : (sd >= 0 ? '' : '−') + brl0(Math.abs(sd)) }),
          h('td', { class: 'n', style: estilo(pp), text: pctT(pp) }));
        if (x.ci !== undefined) tr.addEventListener('click', () => alterna('categoria', x.ci));
        tbd.append(tr);
      });
      tbd.append(h('tr', { class: 'tot' }, h('td', { text: 'Total' }), h('td', { class: 'n', text: brl0(orcTotal) }), h('td', { class: 'n', text: brl0(real.total) }),
        h('td', { class: 'n', text: (saldo >= 0 ? '' : '−') + brl0(Math.abs(saldo)) }), h('td', { class: 'n', text: pctT(p) })));
      tb.append(tbd);
      cClas.replaceChildren(h('h3', { class: 'pc-h2', text: 'Por classificação orçamentária (categoria)' }), h('div', { class: 'pc-tw' }, tb));
      const lf = [...usadas].map((f) => ({ f, o: taxaSel * haFaz[f] * meses.length, r: real.porFaz[f] || 0 })).sort((a, b) => b.r - a.r);
      const tf = h('table', { class: 'bi-t' });
      tf.append(h('thead', null, h('tr', null, h('th', { text: 'Fazenda' }), h('th', { class: 'n', text: 'Hectares' }), h('th', { class: 'n', text: 'Orçado' }), h('th', { class: 'n', text: 'Realizado' }), h('th', { class: 'n', text: '% usado' }))));
      const tfb = h('tbody');
      lf.forEach((x) => {
        const pp = x.o ? x.r / x.o : null, idx = L.dic.fazenda.indexOf(x.f);
        const tr = h('tr', { style: 'cursor:pointer' }, h('td', { text: x.f }), h('td', { class: 'n', text: nf0.format(haFaz[x.f]) }), h('td', { class: 'n', text: brl0(x.o) }), h('td', { class: 'n', text: brl0(x.r) }),
          h('td', { class: 'n', style: estilo(pp), text: pctT(pp) }));
        if (idx >= 0) tr.addEventListener('click', () => alterna('fazenda', idx));
        tfb.append(tr);
      });
      tf.append(tfb);
      cFaz.replaceChildren(h('h3', { class: 'pc-h2', text: 'Por fazenda' }), h('div', { class: 'pc-tw' }, tf));
      const fora = Object.keys(real.porClas).filter((cc) => !taxa[cc]);
      nota.textContent = 'Entram só fazendas com área cadastrada' + (tot.length && tot.length < comArea.length ? ' (áreas que se sobrepõem, como o mamão, ficam de fora do total)' : '') +
        '. O mês em andamento entra inteiro no orçado, por isso parece sobrar até fechar.' + (fora.length ? ' Categorias sem orçamento: ' + fora.join(', ') + '.' : '');
    }
    return { render };
  }


  // ---------------------------------------------------------------- Fazendas e talhões (cadastro)
  function criarCadastro(raiz) {
    const T = (dash.data('talhoes').data) || [];
    if (!T.length) { raiz.replaceChildren(h('h1', { class: 'pc-title', text: 'Fazendas e talhões' }), h('section', { class: 'pc-card' }, h('p', { class: 'bi-vazio', text: 'Não encontrei os talhões na planilha de Talhões.' }))); return { render() {} }; }
    const ano = new Date().getFullYear();
    const est = { vars: new Set(), metrica: 'pes', todos: false, busca: '' };
    const tiles = h('section', { class: 'pc-tiles' }), cVar = h('section', { class: 'pc-card' }), cAno = h('section', { class: 'pc-card' }), cMat = h('section', { class: 'pc-card' }), cTab = h('section', { class: 'pc-card' });
    const chips = h('div', { class: 'bi-chips' });
    raiz.replaceChildren(h('div', null, h('h1', { class: 'pc-title', text: 'Fazendas e talhões' }),
      h('p', { class: 'bi-nota', text: 'Cadastro dos talhões (planilha de Talhões): variedades, plantas, área e idade do pomar. Esta aba usa o filtro de Fazenda; clique em uma variedade para filtrar.' })), chips, tiles, h('div', { class: 'bi-grade' }, cVar, cAno), cMat, cTab);
    const nomesFaz = () => (ativo('fazenda') ? new Set([...SEL.fazenda].map((i) => nomeFaz(i))) : null);
    const soma = (rows, f) => rows.reduce((a, r) => a + f(r), 0);
    function render() {
      const fz = nomesFaz();
      const base = T.filter((t) => !fz || fz.has(t.fazenda));
      const rows = base.filter((t) => !est.vars.size || est.vars.has(t.variedade));
      chips.replaceChildren(); est.vars.forEach((v) => { const c = h('button', { type: 'button', class: 'bi-chip', text: 'Variedade: ' + v + ' ×' }); c.addEventListener('click', () => { est.vars.delete(v); render(); }); chips.append(c); });
      const pes = soma(rows, (r) => r.pes), area = soma(rows, (r) => r.area);
      const comAno = rows.filter((r) => r.ano && r.pes), idade = comAno.length ? soma(comAno, (r) => (ano - r.ano) * r.pes) / soma(comAno, (r) => r.pes) : null;
      const comCx = rows.filter((r) => r.cx_pe && r.pes), cx = soma(comCx, (r) => r.pes * r.cx_pe);
      tiles.replaceChildren(tile('Talhões', nf0.format(rows.length), new Set(rows.map((r) => r.fazenda)).size + ' fazenda(s)'), tile('Área dos talhões', nf0.format(area) + ' ha', ''),
        tile('Plantas', nf0.format(pes), area ? nf0.format(pes / area) + ' plantas por ha' : ''), tile('Variedades', nf0.format(new Set(rows.map((r) => r.variedade)).size), ''),
        tile('Idade média do pomar', idade === null ? '—' : nf1.format(idade) + ' anos', 'média ponderada por planta'),
        tile('Produção estimada', comCx.length ? nf0.format(cx) + ' cx' : '—', comCx.length ? 'só talhões com estimativa (' + nf0.format(soma(comCx, (r) => r.pes)) + ' plantas)' : 'sem estimativa cx/pé'));
      // por variedade (ignora o próprio filtro de variedade para poder trocar)
      const porVar = {}; base.forEach((t) => { const o = porVar[t.variedade] || (porVar[t.variedade] = { pes: 0, area: 0, n: 0 }); o.pes += t.pes; o.area += t.area; o.n++; });
      const sx = h('select'); [['pes', 'Plantas'], ['area', 'Área (ha)'], ['n', 'Nº de talhões']].forEach(([v, t]) => sx.append(new Option(t, v))); sx.value = est.metrica;
      sx.addEventListener('change', () => { est.metrica = sx.value; render(); });
      const lv = Object.entries(porVar).sort((a, b) => b[1][est.metrica] - a[1][est.metrica]);
      const mx = Math.max(...lv.map(([, o]) => o[est.metrica]), 1), tt = soma(lv, ([, o]) => o[est.metrica]);
      const fmtM = (o) => est.metrica === 'area' ? nf0.format(o.area) + ' ha' : (est.metrica === 'pes' ? nf0.format(o.pes) : nf0.format(o.n));
      const lista = h('div', { class: 'bi-lista' });
      lv.forEach(([v, o], i) => lista.append(linhaBarra({ nome: v, w: o[est.metrica] / mx * 100, sel: est.vars.has(v), fraco: est.vars.size > 0 && !est.vars.has(v), cor: PAL[i % PAL.length],
        valor: fmtM(o) + ' · ' + nf1.format(o[est.metrica] / tt * 100) + '%', dica: nf0.format(o.n) + ' talhões · ' + nf0.format(o.area) + ' ha · ' + nf0.format(o.pes) + ' plantas',
        clique: () => { est.vars.has(v) ? est.vars.delete(v) : est.vars.add(v); render(); } })));
      cVar.replaceChildren(h('div', { class: 'bi-cab' }, h('h3', { class: 'pc-h2', text: 'Por variedade' }), h('label', { class: 'bi-ctl' }, 'Mostrar', sx)), lista);
      // por ano de plantio
      const porAno = {}; rows.forEach((t) => { if (t.ano) porAno[t.ano] = (porAno[t.ano] || 0) + t.pes; });
      const anos = Object.keys(porAno).map(Number).sort((a, b) => a - b), mxa = Math.max(...anos.map((a) => porAno[a]), 1);
      const cols = h('div', { class: 'bi-cols', style: 'height:230px' });
      anos.forEach((a) => cols.append(h('div', { class: 'bi-col', style: 'cursor:default', title: a + ': ' + nf0.format(porAno[a]) + ' plantas' },
        h('div', { class: 'bi-vv', text: nf0.format(porAno[a] / 1000) + ' mil' }), h('div', { class: 'bi-pilha', style: 'flex:0 0 170px' }, h('i', { style: 'height:' + (porAno[a] / mxa * 100).toFixed(1) + '%;background:var(--brand)' })), h('div', { class: 'bi-ml', text: String(a) }))));
      cAno.replaceChildren(h('h3', { class: 'pc-h2', text: 'Plantas por ano de plantio' }), h('p', { class: 'bi-nota', text: 'Mostra a idade do pomar: pés mais velhos à esquerda.' }), h('div', { class: 'bi-rolagem' }, cols));
      // matriz variedade x fazenda
      const fazs = [...new Set(rows.map((r) => r.fazenda))].sort();
      const mat = {}; rows.forEach((t) => { const m = mat[t.variedade] || (mat[t.variedade] = {}); m[t.fazenda] = (m[t.fazenda] || 0) + t.pes; });
      const vs = Object.keys(mat).sort((a, b) => soma(Object.values(mat[b]), (x) => x) - soma(Object.values(mat[a]), (x) => x));
      const tm = h('table', { class: 'bi-t' });
      tm.append(h('thead', null, h('tr', null, h('th', { text: 'Variedade (plantas)' }), fazs.map((f) => h('th', { class: 'n', text: f })), h('th', { class: 'n', text: 'Total' }))));
      const tb = h('tbody');
      vs.forEach((v) => tb.append(h('tr', null, h('td', { text: v }), fazs.map((f) => h('td', { class: 'n', text: mat[v][f] ? nf0.format(mat[v][f]) : '—' })), h('td', { class: 'n', style: 'font-weight:700', text: nf0.format(soma(Object.values(mat[v]), (x) => x)) }))));
      tb.append(h('tr', { class: 'tot' }, h('td', { text: 'Total' }), fazs.map((f) => h('td', { class: 'n', text: nf0.format(soma(vs, (v) => mat[v][f] || 0)) })), h('td', { class: 'n', text: nf0.format(pes) })));
      tm.append(tb);
      cMat.replaceChildren(h('h3', { class: 'pc-h2', text: 'Variedades por fazenda' }), h('div', { class: 'pc-tw' }, tm));
      // talhões
      const busca = h('input', { type: 'search', placeholder: 'Buscar talhão, variedade…', value: est.busca, style: 'font:inherit;font-size:14px;padding:.4rem .5rem;border:1px solid var(--color-border-line);border-radius:8px;max-width:280px' });
      busca.addEventListener('input', () => { est.busca = busca.value; desenhaTab(); busca.focus(); });
      const corpo = h('div', { class: 'pc-tw' });
      cTab.replaceChildren(h('div', { class: 'bi-cab' }, h('h3', { class: 'pc-h2', text: 'Talhões' }), busca), corpo);
      function desenhaTab() {
        const q = est.busca.trim().toLowerCase();
        const lst = rows.filter((r) => !q || (r.talhao + ' ' + r.variedade + ' ' + r.sub + ' ' + r.fazenda).toLowerCase().includes(q)).sort((a, b) => a.fazenda.localeCompare(b.fazenda) || a.talhao.localeCompare(b.talhao));
        const mostra = est.todos ? lst : lst.slice(0, 50);
        const t = h('table', { class: 'bi-t' });
        t.append(h('thead', null, h('tr', null, ['Fazenda', 'Talhão', 'Variedade'].map((x) => h('th', { text: x })), ['Área (ha)', 'Plantas', 'Pés/ha'].map((x) => h('th', { class: 'n', text: x })), h('th', { text: 'Plantio' }), h('th', { text: 'Espaçamento' }), h('th', { class: 'n', text: 'cx/pé' }), h('th', { class: 'n', text: 'Caixas est.' }))));
        const b = h('tbody');
        mostra.forEach((r) => b.append(h('tr', null, h('td', { text: r.fazenda === r.sub ? r.fazenda : r.fazenda + ' · ' + r.sub }), h('td', { text: r.talhao }), h('td', { text: r.variedade }), h('td', { class: 'n', text: nf2.format(r.area) }),
          h('td', { class: 'n', text: nf0.format(r.pes) }), h('td', { class: 'n', text: r.area ? nf0.format(r.pes / r.area) : '—' }), h('td', { text: r.ano ? String(r.ano) : '—' }), h('td', { text: r.esp || '—' }),
          h('td', { class: 'n', text: r.cx_pe ? nf1.format(r.cx_pe) : '—' }), h('td', { class: 'n', text: r.cx_pe && r.pes ? nf0.format(r.pes * r.cx_pe) : '—' }))));
        t.append(b); const partes = [t];
        if (lst.length > mostra.length) { const bt = h('button', { type: 'button', class: 'bi-link', text: 'Mostrar todos os ' + nf0.format(lst.length) + ' talhões' }); bt.addEventListener('click', () => { est.todos = true; desenhaTab(); }); partes.push(bt); }
        corpo.replaceChildren(...partes);
      }
      desenhaTab();
    }
    return { render };
  }

  // ---------------------------------------------------------------- orquestração
  let tabExplorar = null, tabFrota = null, tabOrc = null, tabCad = null;
  function render() {
    if (!L) return;
    if (aba === 'geral') desenhaGeral(); else if (aba === 'explorar') tabExplorar.render(); else if (aba === 'frota') tabFrota.render(); else if (aba === 'orc') tabOrc.render(); else if (aba === 'cad') tabCad.render();
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
    tabOrc = criarOrc(document.getElementById('v-orc'));
    tabCad = criarCadastro(document.getElementById('v-cad'));
    montarBarra(); atualizaBarra(); barra.hidden = aba === 'qual'; render();
  });
})();
