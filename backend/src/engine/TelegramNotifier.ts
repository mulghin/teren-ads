import https from 'https';
import { getSetting } from '../db';

/**
 * Sends notifications to a Telegram chat via Bot API.
 * Config (in settings): telegram_bot_token, telegram_chat_id, telegram_enabled,
 * and per-event toggles telegram_notify_{ad_start,ad_end,silence_alert,source_switch}.
 */

export type TgEvent = 'ad_start' | 'ad_end' | 'silence_alert' | 'source_switch';

const EVENT_SETTING_KEY: Record<TgEvent, string> = {
  ad_start:      'telegram_notify_ad_start',
  ad_end:        'telegram_notify_ad_end',
  silence_alert: 'telegram_notify_silence_alert',
  source_switch: 'telegram_notify_source_switch',
};

interface NotifyPayload {
  event: TgEvent;
  region_id?: number;
  region_name?: string;
  playlist_id?: number;
  trigger_type?: string;
  reason?: string;
  url?: string;
  ts: string;
}

async function postTelegram(token: string, chatId: string, text: string): Promise<{ ok: boolean; error?: string }> {
  if (!/^[0-9]+:[A-Za-z0-9_-]{20,}$/.test(token)) return { ok: false, error: 'invalid token format' };
  if (!/^-?[0-9]+$/.test(chatId)) return { ok: false, error: 'invalid chat_id (must be numeric, may start with -)' };

  const body = JSON.stringify({
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${token}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ ok: true });
        } else {
          const msg = Buffer.concat(chunks).toString('utf8').slice(0, 200);
          resolve({ ok: false, error: `HTTP ${res.statusCode}: ${msg}` });
        }
      });
    });
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.setTimeout(5000, () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(body);
    req.end();
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderMessage(p: NotifyPayload): string {
  const region = p.region_name ? escapeHtml(p.region_name) : '';
  const time = new Date(p.ts).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  switch (p.event) {
    case 'ad_start': {
      const trig = p.trigger_type ? ` <i>(${escapeHtml(p.trigger_type)})</i>` : '';
      return `📢 <b>Реклама — старт</b>${trig}\n` +
             `Регіон: <b>${region}</b>\n` +
             `Плейлист: <code>${p.playlist_id ?? '?'}</code>\n` +
             `<code>${time}</code>`;
    }
    case 'ad_end':
      return `✅ <b>Реклама — завершення</b>\n` +
             `Регіон: <b>${region}</b>\n` +
             (p.reason ? `Причина: <i>${escapeHtml(p.reason)}</i>\n` : '') +
             `<code>${time}</code>`;
    case 'silence_alert':
      return `🔇 <b>Тиша в ефірі</b>\n` +
             (p.reason ? `${escapeHtml(p.reason)}\n` : '') +
             (p.url ? `Джерело: <code>${escapeHtml(p.url)}</code>\n` : '') +
             `<code>${time}</code>`;
    case 'source_switch':
      return `⚠️ <b>Перемкнулось на резерв</b>\n` +
             `Регіон: <b>${region}</b>\n` +
             (p.url ? `Нове джерело: <code>${escapeHtml(p.url)}</code>\n` : '') +
             (p.reason ? `<i>${escapeHtml(p.reason)}</i>\n` : '') +
             `<code>${time}</code>`;
  }
}

export async function sendTelegramNotification(payload: NotifyPayload): Promise<void> {
  const enabled = (await getSetting('telegram_enabled')) === 'true';
  if (!enabled) return;

  const perEvent = await getSetting(EVENT_SETTING_KEY[payload.event]);
  if (perEvent !== 'true') return;

  const token = await getSetting('telegram_bot_token');
  const chatId = await getSetting('telegram_chat_id');
  if (!token || !chatId) return;

  const text = renderMessage(payload);
  const result = await postTelegram(token, chatId, text);
  if (!result.ok) {
    console.warn(`[TelegramNotifier] send failed: ${result.error}`);
  }
}

export async function sendTelegramTest(): Promise<{ ok: boolean; error?: string }> {
  const token = await getSetting('telegram_bot_token');
  const chatId = await getSetting('telegram_chat_id');
  if (!token) return { ok: false, error: 'Bot token not configured' };
  if (!chatId) return { ok: false, error: 'Chat ID not configured' };

  const text =
    `🤖 <b>Teren ADS — тест</b>\n` +
    `Бот налаштований коректно. Цей чат буде отримувати сповіщення про події.\n` +
    `<code>${new Date().toLocaleString('uk-UA')}</code>`;
  return postTelegram(token, chatId, text);
}
