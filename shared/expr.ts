/**
 * Простой калькулятор в поле количества: «6*4+2», «3,5×2», «(10+12)*2,7».
 * Только числа, + − * / и скобки — никакого eval.
 */
export function evalExpr(input: string): number | null {
  const s = String(input ?? '').replace(/\s/g, '').replace(/,/g, '.').replace(/[×xх]/gi, '*').replace(/÷/g, '/').replace(/−/g, '-');
  if (!s || !/^[\d.+\-*/()]+$/.test(s)) return null;
  let i = 0;
  const peek = () => s[i];
  function num(): number {
    if (peek() === '(') { i++; const v = add(); if (peek() !== ')') throw 0; i++; return v; }
    if (peek() === '-') { i++; return -num(); }
    if (peek() === '+') { i++; return num(); }
    const m = /^\d*\.?\d+|^\d+\.?/.exec(s.slice(i));
    if (!m) throw 0;
    i += m[0].length;
    return parseFloat(m[0]);
  }
  function mul(): number {
    let v = num();
    while (peek() === '*' || peek() === '/') { const op = s[i++]; const b = num(); if (op === '/' && b === 0) throw 0; v = op === '*' ? v * b : v / b; }
    return v;
  }
  function add(): number {
    let v = mul();
    while (peek() === '+' || peek() === '-') { const op = s[i++]; const b = mul(); v = op === '+' ? v + b : v - b; }
    return v;
  }
  try {
    const v = add();
    if (i !== s.length || !Number.isFinite(v)) return null;
    return Math.round(v * 10000) / 10000;
  } catch { return null; }
}

export const isExpr = (s: string) => /\d\s*[+*/×xх÷(]|\)|\d\s*-\s*\d/i.test(String(s ?? ''));
