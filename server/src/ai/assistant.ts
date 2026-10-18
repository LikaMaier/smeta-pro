import { prisma, num, HttpError, audit, requireFeature, useAi, accessOf } from '../util';
import { env } from '../env';
import { chatJson, aiConfigured } from './openai';
import { AI_SCHEMA, AiReply, buildDraft, calculatorsForPrompt } from '../../../shared/aiDraft';
import { STARTER_PRICES } from '../../../shared/starterPrices';

let CALC_TEXT = '';
const calcText = () => (CALC_TEXT ||= calculatorsForPrompt());

function systemPrompt(catalogNames: string[]) {
  return `Ты — ИИ-сметчик в приложении СМЕТА PRO для строителей. Пользователь пересказывает заказ клиента (часто голосом). Твоя задача — собрать черновик сметы.

ПРАВИЛА:
1. Не придумывай размеры, объёмы и количества. Если для расчёта не хватает параметра — задай ОДИН самый важный уточняющий вопрос (status "need_info"). Не задавай анкету из многих вопросов сразу.
2. Ты НЕ считаешь математику. Количества бери так:
   - если пользователь прямо назвал количество («2 смены экскаватора», «40 метров забора») — укажи его в qty;
   - если количество получается расчётом — добавь расчёт в calculations (id калькулятора и значения полей) и в items укажи fromCalc: {calc: индекс расчёта, row: точное название строки результата}. qty тогда null.
   - иначе qty = null — пользователь уточнит.
3. Не указывай цены — их подставит приложение из прайс-листа пользователя.
4. Названия работ бери из прайс-листа пользователя, если подходит по смыслу (точное совпадение названия важно). Иначе — из списка типовых работ. Иначе — короткое понятное название.
5. Отделяй известные данные (known) от допущений (assumptions). Любое допущение — явно в assumptions.
6. Когда данных достаточно для черновика — status "draft", в reply кратко перечисли, что вошло, и что стоит проверить.
7. Отвечай по-русски, коротко, как прораб прорабу. reply — до 3 предложений.
8. Если пользователь пишет не про смету — вежливо верни к задаче.

КАЛЬКУЛЯТОРЫ (id: поля; результат):
${calcText()}

ПРАЙС-ЛИСТ ПОЛЬЗОВАТЕЛЯ (названия):
${catalogNames.length ? catalogNames.join('; ') : 'пока пуст'}

ТИПОВЫЕ РАБОТЫ:
${STARTER_PRICES.map((p) => `${p.name} (${p.unit})`).join('; ')}`;
}

export function assertAiAllowed(user: any) {
  if (!user.aiEnabled) throw new HttpError(403, 'ИИ-сметчик выключен. Включите его в Настройках.', 'ai_disabled');
  if (!aiConfigured()) throw new HttpError(503, 'ИИ-сметчик ещё не подключён на сервере.', 'ai_not_configured');
  requireFeature(user, 'ai');
}

async function activeSession(userId: string) {
  return (await prisma.aiSession.findFirst({ where: { userId, status: 'active' }, orderBy: { updatedAt: 'desc' } }))
    || prisma.aiSession.create({ data: { userId, messages: [] } });
}

export function sessionView(s: any) {
  const msgs = (s.messages as any[]).map((m) => {
    if (m.role === 'assistant') { try { const j = JSON.parse(m.content); return { role: 'assistant', text: j.reply, status: j.status }; } catch { return { role: 'assistant', text: m.content }; } }
    return { role: 'user', text: m.content, voice: m.voice };
  });
  return { id: s.id, messages: msgs, draft: s.draft, estimateId: s.estimateId };
}

export async function getSession(userId: string) {
  const s = await prisma.aiSession.findFirst({ where: { userId, status: 'active' }, orderBy: { updatedAt: 'desc' } });
  return s ? sessionView(s) : { id: null, messages: [], draft: null };
}

export async function handleMessage(user: any, text: string, voice = false) {
  assertAiAllowed(user);
  await useAi(user);
  const s = await activeSession(user.id);
  const items = await prisma.catalogItem.findMany({ where: { userId: user.id, deletedAt: null, active: true }, orderBy: { priceUpdatedAt: 'desc' }, take: 300 });
  const history = (s.messages as any[]).slice(-16).map((m) => ({ role: m.role, content: m.content }));
  const ai = await chatJson<AiReply>([{ role: 'system', content: systemPrompt(items.map((i) => i.name)) }, ...history, { role: 'user', content: text }], AI_SCHEMA);
  let draft: any = s.draft;
  if (ai.status === 'draft') {
    const built = buildDraft(ai, {
      catalog: items.map((i) => ({ id: i.id, name: i.name, unit: i.unit, price: num(i.price), costPrice: i.costPrice == null ? null : num(i.costPrice) })),
      approx: STARTER_PRICES,
    });
    draft = { lines: built.lines, problems: built.problems, known: ai.known, assumptions: ai.assumptions, at: new Date().toISOString() };
  }
  const messages = [...(s.messages as any[]), { role: 'user', content: text, ...(voice ? { voice: true } : {}) }, { role: 'assistant', content: JSON.stringify(ai) }];
  const saved = await prisma.aiSession.update({ where: { id: s.id }, data: { messages, draft: draft ?? undefined } });
  return { ...sessionView(saved), last: { reply: ai.reply, status: ai.status } };
}

export async function resetSession(userId: string) {
  await prisma.aiSession.updateMany({ where: { userId, status: 'active' }, data: { status: 'done' } });
}

export async function createEstimateFromDraft(user: any) {
  const s = await prisma.aiSession.findFirst({ where: { userId: user.id, status: 'active' }, orderBy: { updatedAt: 'desc' } });
  const draft: any = s?.draft;
  if (!s || !draft?.lines?.length) throw new HttpError(400, 'Черновика пока нет — опишите заказ ИИ-сметчику', 'no_draft');
  const firstUser = (s.messages as any[]).find((m) => m.role === 'user')?.content || 'Смета от ИИ';
  const notes = [
    draft.known?.length ? `Известно: ${draft.known.join('; ')}` : '',
    draft.assumptions?.length ? `Допущения: ${draft.assumptions.join('; ')}` : '',
  ].filter(Boolean).join('\n');
  const e = await prisma.estimate.create({
    data: {
      userId: user.id, madeOnPro: accessOf(user).active, title: firstUser.slice(0, 60), source: 'ai', notes: notes || null,
      lines: { create: draft.lines.map((l: any, i: number) => ({ position: i, name: l.name, qty: l.qty, unit: l.unit, type: l.type, category: l.category, price: l.price, costPrice: l.costPrice, catalogItemId: l.catalogItemId, note: l.note, unconfirmed: l.unconfirmed })) },
    },
  });
  await prisma.aiSession.update({ where: { id: s.id }, data: { estimateId: e.id, status: 'done' } });
  await audit(user.id, 'estimate', e.id, 'create', { source: 'ai' });
  return e;
}
