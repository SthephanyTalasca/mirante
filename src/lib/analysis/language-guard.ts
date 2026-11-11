// Guarda de linguagem: impede que descrições e relatórios afirmem emoções sentidas,
// intenções, interesse, personalidade ou estados mentais. O sistema descreve apenas sinais.

const BLOCKED: RegExp[] = [
  // estados emocionais e mentais
  /\bentediad[oa]s?\b/i, /\btédio\b/i, /\bdesinteress\w*/i, /\binteressad[oa]s?\b/i,
  /\bansios[oa]s?\b/i, /\bansiedade\b/i, /\bnervos[oa]s?\b/i, /\birritad[oa]s?\b/i,
  /\btriste(s|za)?\b/i, /\bfeliz(es)?\b/i, /\bfelicidade\b/i, /\balegre(s)?\b/i, /\bfrustrad[oa]s?\b/i,
  /\bestressad[oa]s?\b/i, /\bdeprimid[oa]s?\b/i, /\bdepress\w*/i, /\bchatead[oa]s?\b/i,
  /\bimpacient\w*/i, /\braiva\b/i, /\braivos[oa]s?\b/i, /\bconfiante(s)?\b/i, /\binsegur[oa]s?\b/i,
  /\bempolgad[oa]s?\b/i, /\banimad[oa]s?\b/i, /\b(des)?motivad[oa]s?\b/i, /\bdistraíd[oa]s?\b/i,
  /\bconcentrad[oa]s?\b/i, /\bcansad[oa]s?\b/i, /\bcom medo\b/i, /\bpreocupad[oa]s?\b/i,
  /\bsatisfeit[oa]s?\b/i, /\binsatisfeit[oa]s?\b/i, /\bconfus[oa]\b(?! aparente)/i,
  // intenção, opinião, julgamento
  /\b(não )?gostou\b/i, /\bconcord(ou|a|ando)\b/i, /\bdiscord(ou|a|ando)\b/i, /\baprov(ou|ando)\b/i,
  /\bpensando\b/i, /\bquer(ia)? comprar\b/i, /\bintenção\b/i, /\bmentind[oa]\b/i, /\bdesonest\w*/i,
  /\bpersonalidade\b/i, /\bintrovertid[oa]\b/i, /\bextrovertid[oa]\b/i, /\bnão se importa\b/i,
  /\bsem interesse\b/i, /\bperdeu o interesse\b/i, /\bengajad[oa]\b/i, /\bdesengajad[oa]\b/i,
  // inglês (caso o modelo responda em inglês)
  /\bbored\b/i, /\b(un|dis)?interested\b/i, /\banxious\b/i, /\bhappy\b/i, /\bsad\b/i, /\bangry\b/i,
  /\bfrustrated\b/i, /\bconfused\b/i, /\bdistracted\b/i, /\bnervous\b/i, /\bannoyed\b/i, /\bfeels?\b/i,
];

export interface GuardResult {
  ok: boolean;
  text: string;
  hits: string[];
}

/**
 * Verifica um texto. Quando há termo bloqueado, devolve o texto alternativo (neutro).
 * "Expressão aparentemente confusa" é o nome de categoria permitido pelo briefing; o
 * qualificador "aparente(mente)" é exigido para que passe.
 */
export function guardText(text: string, fallback: string): GuardResult {
  const clean = (text ?? "").replace(/\s+/g, " ").trim().slice(0, 280);
  const normalized = clean.replace(/aparentemente confus[oa]/gi, "aparente-confusão");
  const hits = BLOCKED.filter((r) => r.test(normalized)).map((r) => r.source);
  if (!clean || hits.length) return { ok: false, text: fallback, hits };
  return { ok: true, text: clean, hits };
}

export const USAGE_NOTICE =
  "Este relatório descreve sinais visuais observáveis identificados automaticamente e sujeitos a erro. " +
  "Ele não indica emoções, intenções, interesse, personalidade ou estado de saúde de ninguém e " +
  "não deve ser usado, sozinho, para decisões profissionais ou comerciais sobre pessoas.";
