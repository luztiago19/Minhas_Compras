/* Padronização: nome comum do produto, unidades (kg, L, dúzia) e tamanhos de embalagem. Puro, sem DOM. */
(function (root) {
  'use strict';
  const strip = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  const r4 = (n) => Math.round((n + Number.EPSILON) * 1e4) / 1e4;

  // abreviações comuns de nota fiscal (a nota vem sem acento, em maiúsculas e cortada)
  const ABBR = {
    IOG: 'IOGURTE', IOGUR: 'IOGURTE', MANT: 'MANTEIGA', MANTEIG: 'MANTEIGA', NAT: 'NATURAL', TAB: 'TABLETE',
    REFRIG: 'REFRIGERANTE', REFRI: 'REFRIGERANTE', CHOC: 'CHOCOLATE', DET: 'DETERGENTE', DETERG: 'DETERGENTE', AMAC: 'AMACIANTE',
    SH: 'SHAMPOO', SHAMP: 'SHAMPOO', COND: 'CONDICIONADOR', PAP: 'PAPEL', HIG: 'HIGIENICO', QJO: 'QUEIJO', QJ: 'QUEIJO',
    MUSS: 'MUSSARELA', MUSSAR: 'MUSSARELA', MUSSARELA: 'MUSSARELA', PRES: 'PRESUNTO', PRESUN: 'PRESUNTO', SALS: 'SALSICHA', LING: 'LINGUICA',
    FRG: 'FRANGO', BISC: 'BISCOITO', MAC: 'MACARRAO', ESPAG: 'ESPAGUETE', INT: 'INTEGRAL', DESN: 'DESNATADO', TRAD: 'TRADICIONAL',
    GARR: 'GARRAFA', PCT: 'PACOTE', CX: 'CAIXA', ACUC: 'ACUCAR', REFIN: 'REFINADO', CRIST: 'CRISTAL', FEIJ: 'FEIJAO', CARIOC: 'CARIOCA',
    SAB: 'SABAO', SABON: 'SABONETE', DESOD: 'DESODORANTE', CR: 'CREME', DENT: 'DENTAL', ESC: 'ESCOVA', LIMP: 'LIMPADOR',
    MIN: 'MINERAL', VEG: 'VEGETAL', MARG: 'MARGARINA', REQ: 'REQUEIJAO', TOM: 'TOMATE', EXT: 'EXTRATO', ACHOC: 'ACHOCOLATADO',
    BAT: 'BATATA', CEN: 'CENOURA', LAR: 'LARANJA', ABOB: 'ABOBORA', PEIT: 'PEITO', FIL: 'FILE', BOV: 'BOVINO', SUIN: 'SUINO',
    ORG: 'ORGANICO', SEMI: 'SEMI', ZERO: 'ZERO', LIQ: 'LIQUIDO', CONC: 'CONCENTRADO', PREM: 'PREMIUM',
    SUP: 'SUPER', EXTR: 'EXTRA', GRAN: 'GRANDE', PEQ: 'PEQUENO', MED: 'MEDIO', BCO: 'BRANCO', BRANC: 'BRANCO', VERM: 'VERMELHO', PRET: 'PRETO',
    AMAR: 'AMARELO', ESCUR: 'ESCURO', CLAR: 'CLARO', SORT: 'SORTIDO', SORTID: 'SORTIDO', LIGHT: 'LIGHT', DIET: 'DIET', ECON: 'ECONOMICO',
  };
  // palavras comuns que perdem o acento na nota
  const ACC = {
    ACUCAR: 'Açúcar', FEIJAO: 'Feijão', MACARRAO: 'Macarrão', CAFE: 'Café', OLEO: 'Óleo', AGUA: 'Água', LINGUICA: 'Linguiça',
    HIGIENICO: 'Higiênico', REQUEIJAO: 'Requeijão', SABAO: 'Sabão', PAO: 'Pão', GELEIA: 'Geleia', LIMAO: 'Limão', MACA: 'Maçã',
    MAMAO: 'Mamão', PIMENTAO: 'Pimentão', CHA: 'Chá', GUARANA: 'Guaraná', ACEM: 'Acém', FILE: 'Filé', MOIDA: 'Moída', SUINA: 'Suína',
    SUINO: 'Suíno', SANITARIA: 'Sanitária', ALCOOL: 'Álcool', LAMPADA: 'Lâmpada', PACOCA: 'Paçoca', ABOBORA: 'Abóbora', MEDIO: 'Médio',
    ECONOMICO: 'Econômico', ORGANICO: 'Orgânico', LIQUIDO: 'Líquido', CAFEZINHO: 'Cafezinho', SODA: 'Soda', PURE: 'Purê', FUBA: 'Fubá',
    ARROZ: 'Arroz', ACAI: 'Açaí', MARACUJA: 'Maracujá', GOIABA: 'Goiaba', GRAO: 'Grão', TRADICIONAL: 'Tradicional', CREME: 'Creme',
    PO: 'Pó', ESPAGUETE: 'Espaguete', PARAFUSO: 'Parafuso', VINAGRE: 'Vinagre', ATUM: 'Atum', SARDINHA: 'Sardinha', ULTRA: 'Ultra', CONDENSADO: 'Condensado',
    SORVETE: 'Sorvete', REFRIGERANTE: 'Refrigerante', BISCOITO: 'Biscoito', TOMATE: 'Tomate', MUSSARELA: 'Mussarela', MORTADELA: 'Mortadela',
  };
  const SMALL = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'COM', 'SEM', 'EM', 'PARA', 'P']);
  const UNIT_ALIAS = {
    KG: 'KG', KGS: 'KG', QUILO: 'KG', QUILOS: 'KG', G: 'G', GR: 'G', GRS: 'G', GRAMA: 'G', GRAMAS: 'G',
    L: 'L', LT: 'L', LTS: 'L', LITRO: 'L', LITROS: 'L', ML: 'ML', MLS: 'ML', DZ: 'DZ', DZS: 'DZ', DUZIA: 'DZ', DUZIAS: 'DZ',
  };
  const normUnit = (u) => { const k = strip(u).replace(/[^A-Z]/g, ''); return UNIT_ALIAS[k] || 'UN'; };

  const fmtNum = (v) => { let s = (Math.round(v * 1000) / 1000).toFixed(3).replace(/0+$/, '').replace(/\.$/, ''); return s.replace('.', ','); };
  const toNum = (s, unit) => {
    s = String(s);
    if ((unit === 'G' || unit === 'ML') && /^\d{1,3}\.\d{3}$/.test(s)) s = s.replace('.', ''); // 1.150G = 1150 g
    return parseFloat(s.replace(',', '.'));
  };
  const SZ = '(KGS?|GRAMAS?|GRS|GR|G|MLS?|LITROS?|LTS?|L)';
  const SIZE_RE = new RegExp('(\\d+(?:[.,]\\d+)?)\\s*' + SZ + '\\b');
  const MULTI_RE = new RegExp('\\b(\\d{1,3})\\s*X\\s*(\\d+(?:[.,]\\d+)?)\\s*' + SZ + '\\b');

  // conteúdo em kg ou L a partir de um número e uma unidade da nota
  function content(valStr, uRaw) {
    const u = UNIT_ALIAS[uRaw] || normUnit(uRaw), v = toNum(valStr, u);
    if (!isFinite(v) || v <= 0) return null;
    if (u === 'KG') return { amount: v, unit: 'kg' };
    if (u === 'G') return { amount: v / 1000, unit: 'kg' };
    if (u === 'L') return { amount: v, unit: 'l' };
    if (u === 'ML') return { amount: v / 1000, unit: 'l' };
    return null;
  }
  function sizeLabel(c) {
    if (!c) return '';
    if (c.unit === 'kg') return c.amount < 1 ? fmtNum(c.amount * 1000) + ' g' : fmtNum(c.amount) + ' kg';
    return c.amount < 1 ? fmtNum(c.amount * 1000) + ' ml' : fmtNum(c.amount) + ' L';
  }
  // tamanho que aparece num nome (original da nota ou nome comum já padronizado)
  function sizeOf(name) {
    const s = strip(name).replace(/(\d)\s*,\s*(\d)/g, '$1,$2');
    const mm = s.match(MULTI_RE);
    if (mm) { const c = content(mm[2], mm[3]); return c && { amount: c.amount * +mm[1], unit: c.unit }; }
    const m = s.match(SIZE_RE);
    return m ? content(m[1], m[2]) : null;
  }
  const sameSize = (a, b) => { const x = sizeOf(a), y = sizeOf(b); if (!x && !y) return true; if (!x || !y) return false; return x.unit === y.unit && Math.abs(x.amount - y.amount) < 1e-6; };

  function titleCase(words) {
    return words.map((w, i) => {
      if (/^\d/.test(w)) return w.toLowerCase();
      if (ACC[w]) return ACC[w];
      const lw = w.toLowerCase();
      if (i > 0 && SMALL.has(w)) return lw;
      return lw.charAt(0).toUpperCase() + lw.slice(1);
    });
  }

  // marcas (nome de exibição). Aparecem nas notas sem acento e em maiúsculas.
  const BRAND_LIST = ["Garibaldi", "Salton", "Aurora", "Miolo", "Cassero", "Perini", "Batavo", "Presidente", "Piracanjuba", "Italac", "Parmalat", "Ninho", "Nestle", "Danone", "Vigor", "Aurora", "Tirol", "Itambe", "Elege", "Leco", "Qualy", "Doriana", "Claybom", "Delicia", "Becel", "Primor", "Soya", "Liza", "Cocamar", "Salada", "Camil", "Kicaldo", "Tio Joao", "Namorado", "Prato Fino", "Broto Legal", "Pilao", "3 Coracoes", "Melitta", "Santa Clara", "Caboclo", "Dona Benta", "Renata", "Adria", "Piraque", "Vitarella", "Marilan", "Bauducco", "Nissin", "Barilla", "Galo", "Sao Jorge", "Quero", "Predilecta", "Heinz", "Hellmanns", "Knorr", "Maggi", "Sazon", "Kitano", "Cica", "Fugini", "Pomarola", "Elefante", "Sadia", "Perdigao", "Seara", "Friboi", "Swift", "Maturatta", "Bassi", "Frimesa", "Copacol", "Rezende", "Ceratti", "Coca Cola", "Pepsi", "Fanta", "Sprite", "Guarana Antarctica", "Antarctica", "Kuat", "Schweppes", "Dolly", "Convencao", "Prats", "Del Valle", "Maguary", "Tang", "Clight", "Skol", "Brahma", "Heineken", "Itaipava", "Amstel", "Budweiser", "Original", "Antartica", "Ype", "Omo", "Brilhante", "Ariel", "Surf", "Tixan", "Minuano", "Bombril", "Bom Bril", "Veja", "Pinho Sol", "Lysoform", "Comfort", "Downy", "Mon Bijou", "Qboa", "Sanol", "Dove", "Nivea", "Rexona", "Colgate", "Oral B", "Sorriso", "Close Up", "Johnson", "Pantene", "Seda", "Elseve", "Clear", "Palmolive", "Protex", "Lux", "Monange", "Natura", "Neve", "Personal", "Scott", "Snob", "Mili", "Sempre Livre", "Always", "Intimus", "Pampers", "Huggies", "Turma da Monica", "Neston", "Nescau", "Toddy", "Ovomaltine", "Nutella", "Nescafe", "Dolca", "Lacta", "Garoto", "Hershey", "Arcor", "Mentos", "Trident", "Halls", "Fini", "Oetker", "Yoki", "Hikari", "Qualitat", "Zaeli", "Carrefour", "Taeq", "Pif Paf", "Sinhá", "Sinha", "Uniao", "Caravelas", "Duquesa", "Duas Rodas", "Ducoco", "Sococo", "Gallo", "Andorinha", "Carbonell", "Borges", "Cocinero", "Pomodoro", "Fleischmann", "Royal", "Apti", "Tereza", "Kenko", "Verde Campo", "Jussara", "Polenghi", "Catupiry", "Scala", "Tirolez", "Paulista", "Poços", "Pocos", "Sao Geraldo", "Eleve", "Vabene", "Orquidea", "Lebre", "Nobre", "Mococa", "Cooper", "Bom Sabor", "Mabel", "Isabela", "Fortaleza", "Treloso", "Triunfo", "Zabet", "Ouro Fino", "Santa Amalia", "Pet Quality", "Pedigree", "Whiskas", "Golden", "Premier", "Dog Chow", "Cat Chow", "Friskies"];
  const BRANDS = {}; // 'TIO JOAO' -> 'Tio João'
  BRAND_LIST.forEach((b) => { BRANDS[strip(b)] = b; });
  const BRAND_FIX = { 'Tio Joao': 'Tio João', 'Pilao': 'Pilão', '3 Coracoes': '3 Corações', 'Sao Jorge': 'São Jorge', 'Italac': 'Italac', 'Hellmanns': "Hellmann's", 'Nestle': 'Nestlé', 'Itambe': 'Itambé', 'Delicia': 'Delícia', 'Ype': 'Ypê', 'Sinha': 'Sinhá', 'Pocos': 'Poços', 'Orquidea': 'Orquídea', 'Quero': 'Quero', 'Sao Geraldo': 'São Geraldo', 'Perdigao': 'Perdigão', 'Convencao': 'Convenção', 'Guarana Antarctica': 'Guaraná Antarctica', 'Antartica': 'Antarctica', 'Monica': 'Mônica', 'Oral B': 'Oral-B', 'Qualitat': 'Qualitat', 'Uniao': 'União', 'Santa Amalia': 'Santa Amália', 'Mon Bijou': 'Mon Bijou' };
  Object.keys(BRAND_FIX).forEach((k) => { BRANDS[strip(k)] = BRAND_FIX[k]; });
  const brandNames = () => Array.from(new Set(Object.values(BRANDS))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const bwords = (name) => strip(name).replace(/[^A-Z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  // acha a primeira marca conhecida num texto: { brand, at, len } (palavras) ou null
  function findBrand(name) {
    const w = bwords(name);
    for (let n = 3; n >= 1; n--) for (let i = 0; i + n <= w.length; i++) {
      const k = w.slice(i, i + n).join(' ');
      if (BRANDS[k]) return { brand: BRANDS[k], at: i, len: n };
    }
    return null;
  }
  const brandIn = (name) => { const f = findBrand(name); return f ? f.brand : ''; };
  // nome sem a marca: "Iogurte Batavo Natural" -> "Iogurte Natural"
  function genericName(name, brand) {
    const b = bwords(brand || brandIn(name)); if (!b.length) return String(name || '').trim();
    const w = String(name || '').trim().split(/\s+/), sw = w.map((x) => strip(x).replace(/[^A-Z0-9]/g, ''));
    for (let i = 0; i + b.length <= w.length; i++) if (b.every((x, j) => sw[i + j] === x)) { w.splice(i, b.length); break; }
    return w.join(' ').trim();
  }
  // garante a marca no nome (depois da primeira palavra): "Manteiga 200 g" + Presidente -> "Manteiga Presidente 200 g"
  function withBrand(name, brand) {
    name = String(name || '').trim(); brand = String(brand || '').trim();
    if (!brand) return name;
    const b = bwords(brand), sw = bwords(name);
    for (let i = 0; i + b.length <= sw.length; i++) if (b.every((x, j) => sw[i + j] === x)) return name;
    const w = name.split(/\s+/); w.splice(Math.min(1, w.length), 0, brand);
    return w.join(' ');
  }

  // palavras comuns de nota fiscal (ajuda a corrigir letras trocadas pelo OCR)
  const COMMON = new Set(["ABACAXI", "ABOBORA", "ABSORVENTE", "ACEM", "ACHOCOLATADO", "ACUCAR", "AGUA", "AGULHINHA", "ALCATRA", "ALFACE", "ALHO", "ALVEJANTE", "AMACIANTE", "AMENDOIM", "ARROZ", "ATUM", "AVEIA", "AZEITE", "AZEITONA", "BALA", "BANANA", "BANDEJA", "BARRA", "BATATA", "BIFE", "BISCOITO", "BOLACHA", "BOVINA", "BRANCO", "BROCOLIS", "CAFE", "CAIXA", "CALDO", "CANELA", "CARIOCA", "CARNE", "CASTANHA", "CATCHUP", "CEBOLA", "CENOURA", "CEREAL", "CERVEJA", "CHICLETE", "CHOCOLATE", "CHUCHU", "COLORAU", "CONDENSADO", "CONDICIONADOR", "COSTELA", "COUVE", "COXA", "CREME", "CRISTAL", "DEMERARARA", "DENTAL", "DESINFETANTE", "DESNATADO", "DESODORANTE", "DETERGENTE", "DIET", "DOG", "ERVILHA", "ESCOVA", "ESPAGUETE", "ESPONJA", "EXTRA", "EXTRATO", "FARINHA", "FATIADO", "FEIJAO", "FERMENTO", "FILE", "FORMA", "FRALDA", "FRANGO", "FRUTAS", "GALINHA", "GARIBALDI", "GARRAFA", "GELATINA", "GIRASSOL", "GRANOLA", "GUARDANAPO", "HAMBURGUER", "HIGIENICO", "HOT", "INTEGRAL", "IOGURTE", "KETCHUP", "LARANJA", "LASANHA", "LATA", "LEGUMES", "LEITE", "LIGHT", "LIMAO", "LINGUICA", "LINHACA", "LIQUIDO", "MACA", "MACARRAO", "MAIONESE", "MAMAO", "MANGA", "MANTEIGA", "MARGARINA", "MELANCIA", "MILHO", "MINERAL", "MOIDA", "MOLHO", "MORANGO", "MORTADELA", "MOSTARDA", "MUSSARELA", "NAT", "NATA", "NATURAL", "OLEO", "ORIGANO", "OVO", "OVOS", "PACOCA", "PACOTE", "PAO", "PAPEL", "PARBOILIZADO", "PATINHO", "PEDACO", "PEITO", "PEPINO", "PET", "PIMENTA", "PIMENTAO", "PIZZA", "PO", "PREMIUM", "PRESUNTO", "PRETO", "PUDIM", "QUEIJO", "RALADO", "REFINADO", "REFRIGERANTE", "REPOLHO", "REQUEIJAO", "ROSE", "SABAO", "SABONETE", "SAL", "SALGADINHO", "SALSICHA", "SANITARIA", "SARDINHA", "SAZON", "SEMIDESNATADO", "SHAMPOO", "SOJA", "SORVETE", "SUCO", "SUINA", "SUPER", "TABLETE", "TEMPERO", "TINTO", "TOALHA", "TOMATE", "TRADICIONAL", "TRIGO", "UNIDADE", "UVA", "VINAGRE", "VINHO", "ZERO"]);
  function vocabOf(extraNames) {
    const v = new Set(COMMON);
    Object.keys(ABBR).forEach((k) => { v.add(k); v.add(ABBR[k]); });
    Object.keys(ACC).forEach((k) => v.add(k));
    Object.keys(BRANDS).forEach((b) => b.split(' ').forEach((w) => { if (w.length > 2) v.add(w); }));
    (extraNames || []).forEach((n) => strip(n).replace(/[^A-Z ]+/g, ' ').split(/\s+/).forEach((w) => { if (w.length > 2) v.add(w); }));
    return v;
  }
  // distância de edição com troca de letras vizinhas (Damerau), com corte
  function dist(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    const d = []; for (let i = 0; i <= a.length; i++) { d[i] = [i]; } for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
    return d[a.length][b.length];
  }
  const LOOK = { '0': ['O'], '1': ['I', 'L'], '2': ['Z'], '4': ['A'], '5': ['S'], '6': ['G'], '8': ['B', 'G'], '9': ['G'] };
  function fixWord(w, vocab) {
    if (vocab.has(w)) return w;
    const letters = (w.match(/[A-Z]/g) || []).length, digits = (w.match(/\d/g) || []).length;
    let cands = [w];
    if (digits && letters >= digits && letters >= 2) { // "8ATAVO", "DO8", "D0G": números no lugar de letras
      cands = [''];
      for (const ch of w) { const alts = /\d/.test(ch) ? (LOOK[ch] || [ch]) : [ch]; const nx = []; cands.forEach((c) => alts.forEach((a) => { if (nx.length < 24) nx.push(c + a); })); cands = nx; }
      const hit = cands.find((c) => vocab.has(c)); if (hit) return hit;
    } else if (digits) return w;
    // letras trocadas: palavra do vocabulário a 1 letra de distância (2 em palavras longas)
    const base = cands[0], L = base.length; if (L < 3) return w;
    const max = L >= 9 ? 2 : 1; let best = null, n = 0;
    vocab.forEach((v) => {
      if (Math.abs(v.length - L) > max) return;
      if (L <= 4 && (v[0] !== base[0] || v[v.length - 1] !== base[L - 1])) return; // palavras curtas: início e fim iguais
      if (L === 3 && v.length !== 3) return;
      const dd = dist(base, v, max); if (dd <= max) { if (!best || dd < best.d) { best = { v, d: dd }; n = 1; } else if (dd === best.d) n++; }
    });
    return best && n === 1 ? best.v : w;
  }
  // Corrige o nome lido por OCR palavra por palavra (letras trocadas, números no lugar de letras, lixo de linha vizinha)
  function ocrFix(name, extraNames, vocab) {
    vocab = vocab || vocabOf(extraNames);
    let s = strip(name).replace(/\b(?:DESC\w*|ITEN?)\b\.*:?\s*\d*/g, ' ').replace(/\s+/g, ' ').trim();
    s = s.replace(/\b(\d[.,]\d{3})6\b/g, '$1G').replace(/\b(100|150|200|250|300|350|400|450|500|900)[46]\b/g, '$1G');
    const out = s.split(' ').map((w) => (/^[A-Z0-9]+$/.test(w) && /[A-Z]/.test(w) ? fixWord(w, vocab) : w));
    return out.join(' ');
  }

  // Principal: nome padrão + como o produto é vendido
  function standardize(rawName, unit) {
    let s = strip(rawName).replace(/\s+/g, ' ').trim();
    const u = normUnit(unit);
    let size = null, multi = null, count = null;
    const mm = s.match(MULTI_RE);
    if (mm) { const c = content(mm[2], mm[3]); if (c) { multi = { n: +mm[1], each: c }; size = { amount: c.amount * +mm[1], unit: c.unit }; s = s.replace(MULTI_RE, ' '); } }
    if (!size) { const m = s.match(SIZE_RE); if (m) { size = content(m[1], m[2]); if (size) s = s.replace(SIZE_RE, ' '); } }
    let cm = s.match(/\bC\s*\/\s*(\d{1,3})\b/) || s.match(/\b(\d{1,3})\s*(?:UN|UND|UNID|UNIDADES?)\b/);
    if (cm) { count = +cm[1]; s = s.replace(cm[0], ' '); }
    if (/\b(?:DZ|DUZIA)\b/.test(s)) { count = count || 12; s = s.replace(/\b(?:DZ|DUZIA)\b/g, ' '); }
    s = s.replace(/\bC\s*\/\s*/g, 'COM ').replace(/\bS\s*\/\s*/g, 'SEM ').replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
    let words = s.split(' ').filter((w) => w && !/^(UN|UND|UNID|UNIDADE|UNIDADES|KG|G|GR|L|LT|ML)$/.test(w));
    words = words.map((w) => ABBR[w] || w);
    const eggs = words.some((w) => w === 'OVO' || w === 'OVOS') && !words.some((w) => /^(PASCOA|CHOCOLATE|CHOCOLATES)$/.test(w));
    let name = titleCase(words).join(' ').trim();

    let base = 'un', pack = null, assumed = false;
    if (eggs) { base = 'dz'; if (u !== 'DZ' && !count) assumed = true; }
    else if (u === 'KG' || u === 'G') base = 'kg';
    else if ((u === 'L' || u === 'ML') && !size) base = 'l';
    else if (size) pack = size;
    if (base === 'un' && count && !eggs) name += ' ' + count + ' un';
    if (base === 'un' || base === 'dz') { /* tamanho só aparece na embalagem */ }
    if (base === 'un' && size) name += ' ' + (multi ? multi.n + ' x ' + sizeLabel(multi.each) : sizeLabel(size));
    name = name.replace(/\s+/g, ' ').trim();
    const bf = findBrand(name); if (bf) { const nw = name.split(/\s+/); if (nw.length >= bf.at + bf.len) { nw.splice(bf.at, bf.len, bf.brand); name = nw.join(' '); } }
    return { name, base, pack, count: count || null, eggs, assumed, unit: u, brand: brandIn(name) };
  }

  // Converte um item do jeito que veio na nota para a unidade padrão do produto
  function normalizeItem(rawName, unit, qty, unitPrice, info) {
    info = info || standardize(rawName, unit);
    const u = info.unit;
    let f = 1;
    if (info.base === 'kg') f = u === 'G' ? 0.001 : 1;
    else if (info.base === 'l') f = u === 'ML' ? 0.001 : 1;
    else if (info.base === 'dz') f = u === 'DZ' ? 1 : info.count ? info.count / 12 : 1;
    const label = { kg: 'KG', l: 'L', dz: 'DZ', un: 'UN' }[info.base];
    return { qty: Math.round(qty * f * 1e6) / 1e6, unit: label, unitPrice: r4(unitPrice / f), f, assumed: !!info.assumed };
  }

  // R$ por kg ou por L de uma embalagem (para comparar tamanhos diferentes)
  function perUnit(name, price) {
    const c = sizeOf(name); if (!c || !(price > 0)) return null;
    return { value: price / c.amount, unit: c.unit === 'kg' ? 'kg' : 'L' };
  }

  function words(n) { return new Set(strip(n).replace(/(\d)\s*,\s*(\d)/g, '$1.$2').replace(/[^A-Z0-9. ]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)); }
  function bigr(n) { const t = strip(n).replace(/[^A-Z0-9]/g, ''), m = new Map(); for (let i = 0; i < t.length - 1; i++) { const b = t.slice(i, i + 2); m.set(b, (m.get(b) || 0) + 1); } return m; }
  function diceSets(a, b) { let i = 0; a.forEach((w) => { if (b.has(w)) i++; }); return a.size + b.size ? (2 * i) / (a.size + b.size) : 0; }
  function diceMaps(a, b) { let i = 0, ta = 0, tb = 0; a.forEach((v) => { ta += v; }); b.forEach((v) => { tb += v; }); a.forEach((v, k) => { if (b.has(k)) i += Math.min(v, b.get(k)); }); return ta + tb ? (2 * i) / (ta + tb) : 0; }
  // Semelhança entre dois nomes; tamanhos diferentes nunca são o mesmo produto
  function similarity(a, b) {
    if (!sameSize(a, b)) return 0;
    if (strip(a).replace(/[^A-Z0-9]/g, '') === strip(b).replace(/[^A-Z0-9]/g, '')) return 1;
    return Math.max(diceSets(words(a), words(b)), diceMaps(bigr(a), bigr(b)));
  }
  // melhor produto já cadastrado para um nome, ou null
  function bestMatch(name, names, min) {
    min = min || 0.72;
    let best = null, bs = 0, second = 0;
    names.forEach((n) => { const sc = similarity(name, n); if (sc > bs) { second = bs; bs = sc; best = n; } else if (sc > second) second = sc; });
    return best && bs >= min && (bs === 1 || bs - second >= 0.05) ? { name: best, score: bs } : null;
  }

  const api = { standardize, normalizeItem, normUnit, sizeOf, sameSize, sizeLabel, perUnit, similarity, bestMatch, fmtNum, brandIn, findBrand, ocrFix, vocabOf, genericName, withBrand, brandNames };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Std = api;
})(typeof self !== 'undefined' ? self : this);
