import { Router } from 'express';
import { pool } from '../db';

const router = Router();

// Station-local timezone for report bucketing. `al.start_time` is stored in
// UTC; without conversion, DATE()/range predicates bucket by UTC and
// mis-attribute Kyiv 00:00–03:00 plays to the previous day. This is a
// trusted const (not user input), but validate the shape before splicing it
// into SQL as a literal to keep it injection-proof by construction.
const REPORT_TZ = (() => {
  const tz = process.env.REPORT_TZ || 'Europe/Kyiv';
  if (!/^[A-Za-z_/+-]+$/.test(tz)) {
    console.warn(`[reports] Invalid REPORT_TZ ${JSON.stringify(tz)} — falling back to Europe/Kyiv`);
    return 'Europe/Kyiv';
  }
  return tz;
})();
// `start_time` is timestamptz; `AT TIME ZONE` returns the wall-clock time in
// REPORT_TZ as a plain timestamp, which is exactly what we bucket/compare on.
const LOCAL_START = `(al.start_time AT TIME ZONE '${REPORT_TZ}')`;

// Clamp a from/to range to a sane window: valid YYYY-MM-DD dates, with the
// span capped at maxDays. Falls back to last `defaultDays` when absent.
function resolveRange(from: unknown, to: unknown, defaultDays: number, maxDays: number) {
  const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  let fromDate = isDate(from) ? from : new Date(Date.now() - defaultDays * 86400000).toISOString().slice(0, 10);
  let toDate = isDate(to) ? to : new Date().toISOString().slice(0, 10);
  if (fromDate > toDate) [fromDate, toDate] = [toDate, fromDate];
  // Cap the span to maxDays (inclusive) to bound query/export cost.
  const spanDays = Math.round((Date.parse(toDate) - Date.parse(fromDate)) / 86400000);
  if (spanDays > maxDays) {
    fromDate = new Date(Date.parse(toDate) - maxDays * 86400000).toISOString().slice(0, 10);
  }
  return { fromDate, toDate };
}

// Campaign report: plays per playlist
router.get('/campaigns', async (req, res) => {
  const { region_id } = req.query;
  const { fromDate, toDate } = resolveRange(req.query.from, req.query.to, 30, 366);

  // total_plays counts only finished plays — in-progress/zombie status='running'
  // rows would inflate delivered counts (proof-of-play). The reaper flips
  // orphans to 'interrupted' at boot; this FILTER guards live in-flight rows too.
  let query = `
    SELECT
      p.id as playlist_id,
      p.name as playlist_name,
      p.start_date, p.end_date,
      p.max_plays_per_day, p.max_plays_per_week,
      COUNT(al.id) FILTER (WHERE al.status <> 'running') as total_plays,
      SUM(al.duration_sec) as total_duration_sec,
      COUNT(CASE WHEN al.status='completed' THEN 1 END) as completed,
      COUNT(CASE WHEN al.status='interrupted' THEN 1 END) as interrupted,
      MIN(al.start_time) as first_play,
      MAX(al.start_time) as last_play
    FROM playlists p
    LEFT JOIN ad_logs al ON al.playlist_id=p.id
      AND ${LOCAL_START} >= $1::date
      AND ${LOCAL_START} < ($2::date + INTERVAL '1 day')
  `;
  const params: any[] = [fromDate, toDate];

  if (region_id) {
    query += ` AND al.region_id=$3`;
    params.push(region_id);
  }

  query += ` GROUP BY p.id ORDER BY total_plays DESC NULLS LAST`;

  const r = await pool.query(query, params);
  res.json({ from: fromDate, to: toDate, campaigns: r.rows });
});

// Region statistics: plays per day per region
router.get('/regions', async (req, res) => {
  const { fromDate, toDate } = resolveRange(req.query.from, req.query.to, 30, 366);

  const r = await pool.query(`
    SELECT
      rg.id as region_id,
      rg.name as region_name,
      DATE(${LOCAL_START}) as date,
      COUNT(al.id) as plays,
      SUM(al.duration_sec) as total_sec,
      COUNT(CASE WHEN al.trigger_type='tone' THEN 1 END) as tone_plays,
      COUNT(CASE WHEN al.trigger_type='api' THEN 1 END) as api_plays,
      COUNT(CASE WHEN al.trigger_type='schedule' THEN 1 END) as schedule_plays
    FROM regions rg
    LEFT JOIN ad_logs al ON al.region_id=rg.id
      AND ${LOCAL_START} >= $1::date
      AND ${LOCAL_START} < ($2::date + INTERVAL '1 day')
    GROUP BY rg.id, DATE(${LOCAL_START})
    ORDER BY rg.id, date
  `, [fromDate, toDate]);
  res.json({ from: fromDate, to: toDate, rows: r.rows });
});

// Detailed play log
router.get('/plays', async (req, res) => {
  const { region_id, playlist_id } = req.query;
  const limit = Math.min(parseInt(req.query.limit as string) || 200, 5000);
  const { fromDate, toDate } = resolveRange(req.query.from, req.query.to, 7, 366);

  const conditions: string[] = [
    `${LOCAL_START} >= $1::date`,
    `${LOCAL_START} < ($2::date + INTERVAL '1 day')`,
  ];
  const params: any[] = [fromDate, toDate];

  if (region_id) { conditions.push(`al.region_id=$${params.length + 1}`); params.push(region_id); }
  if (playlist_id) { conditions.push(`al.playlist_id=$${params.length + 1}`); params.push(playlist_id); }

  params.push(limit);
  const r = await pool.query(`
    SELECT al.*, rg.name as region_name, p.name as playlist_name
    FROM ad_logs al
    LEFT JOIN regions rg ON rg.id=al.region_id
    LEFT JOIN playlists p ON p.id=al.playlist_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY al.start_time DESC
    LIMIT $${params.length}
  `, params);
  res.json(r.rows);
});

// Media plan: schedules + assignments per region
router.get('/mediaplan', async (req, res) => {
  const regions = await pool.query(`SELECT * FROM regions WHERE enabled=TRUE ORDER BY id`);
  const result = [];

  for (const region of regions.rows) {
    const schedules = await pool.query(
      `SELECT rs.*, p.name as playlist_name FROM region_schedules rs
       JOIN playlists p ON p.id=rs.playlist_id
       WHERE rs.region_id=$1 AND rs.is_active=TRUE ORDER BY rs.time_hhmm`,
      [region.id]
    );
    const assignments = await pool.query(
      `SELECT ra.*, p.name as playlist_name FROM region_assignments ra
       JOIN playlists p ON p.id=ra.playlist_id
       WHERE ra.region_id=$1 AND ra.active=TRUE ORDER BY ra.priority DESC`,
      [region.id]
    );
    result.push({
      region,
      schedules: schedules.rows,
      assignments: assignments.rows,
    });
  }
  res.json(result);
});

// Excel media plan export
router.get('/mediaplan/xlsx', async (req, res) => {
  try {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Teren ADS';
    workbook.created = new Date();

    const regions = await pool.query(`SELECT * FROM regions WHERE enabled=TRUE ORDER BY id`);

    const usedSheetNames = new Set<string>();
    for (const region of regions.rows) {
      const cleaned = String(region.name || '').replace(/[\\\/\?\*\[\]:]/g, ' ').trim() || `region-${region.id}`;
      let baseName = cleaned.slice(0, 31);
      if (usedSheetNames.has(baseName)) {
        const suffix = ` #${region.id}`;
        baseName = cleaned.slice(0, Math.max(0, 31 - suffix.length)) + suffix;
      }
      usedSheetNames.add(baseName);
      const sheet = workbook.addWorksheet(baseName);

      // Header style
      const headerFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF2563EB' } };
      const headerFont = { bold: true, color: { argb: 'FFFFFFFF' } };

      // Time schedules section
      sheet.addRow(['Розклад за часом']).font = { bold: true, size: 12 };
      sheet.addRow([]);
      const sHeader = sheet.addRow(['Мітка', 'Час', 'Допуск (хв)', 'Дні', 'Плейлист', 'Активна']);
      sHeader.eachCell(c => { c.fill = headerFill; c.font = headerFont; });

      const schedules = await pool.query(
        `SELECT rs.*, p.name as playlist_name FROM region_schedules rs
         JOIN playlists p ON p.id=rs.playlist_id
         WHERE rs.region_id=$1 ORDER BY rs.time_hhmm`,
        [region.id]
      );
      for (const s of schedules.rows) {
        sheet.addRow([s.label, s.time_hhmm, s.tolerance_minutes, s.days, s.playlist_name, s.is_active ? 'Так' : 'Ні']);
      }

      sheet.addRow([]);
      sheet.addRow(['Призначення (за сигналом)']).font = { bold: true, size: 12 };
      sheet.addRow([]);
      const aHeader = sheet.addRow(['Плейлист', 'Пріоритет', 'Активний']);
      aHeader.eachCell(c => { c.fill = headerFill; c.font = headerFont; });

      const assignments = await pool.query(
        `SELECT ra.*, p.name as playlist_name FROM region_assignments ra
         JOIN playlists p ON p.id=ra.playlist_id
         WHERE ra.region_id=$1 ORDER BY ra.priority DESC`,
        [region.id]
      );
      for (const a of assignments.rows) {
        sheet.addRow([a.playlist_name, a.priority, a.active ? 'Так' : 'Ні']);
      }

      sheet.columns.forEach(col => { col.width = 20; });
    }

    // Ad log sheet — honours the report's from/to (default last 30 days,
    // span capped at 366 days) with the same station-local TZ conversion.
    const { fromDate, toDate } = resolveRange(req.query.from, req.query.to, 30, 366);
    const LOG_CAP = 50000;

    const logSheet = workbook.addWorksheet('Виходи реклами');
    const lHeader = logSheet.addRow(['Регіон', 'Плейлист', 'Тригер', 'Початок', 'Кінець', 'Тривалість (с)', 'Статус']);
    const headerFill2 = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF2563EB' } };
    lHeader.eachCell(c => { c.fill = headerFill2; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; });

    const logs = await pool.query(`
      SELECT al.*, rg.name as region_name, p.name as playlist_name
      FROM ad_logs al
      LEFT JOIN regions rg ON rg.id=al.region_id
      LEFT JOIN playlists p ON p.id=al.playlist_id
      WHERE ${LOCAL_START} >= $1::date
        AND ${LOCAL_START} < ($2::date + INTERVAL '1 day')
      ORDER BY al.start_time DESC LIMIT $3
    `, [fromDate, toDate, LOG_CAP + 1]);

    const truncated = logs.rows.length > LOG_CAP;
    if (truncated) {
      logs.rows.length = LOG_CAP;
      console.warn(`[reports/mediaplan] Ad log export truncated to ${LOG_CAP} rows for ${fromDate}..${toDate}`);
    }

    const DATE_FMT = 'yyyy-mm-dd hh:mm:ss';
    for (const l of logs.rows) {
      const row = logSheet.addRow([
        l.region_name, l.playlist_name, l.trigger_type,
        l.start_time ? new Date(l.start_time) : null,
        l.end_time ? new Date(l.end_time) : null,
        l.duration_sec != null ? Math.round(l.duration_sec) : null,
        l.status,
      ]);
      // Real Date cells (numeric under the hood) so Excel can sort/filter by
      // time; format for human display without losing the value.
      if (l.start_time) row.getCell(4).numFmt = DATE_FMT;
      if (l.end_time) row.getCell(5).numFmt = DATE_FMT;
    }
    if (truncated) {
      logSheet.addRow([`⚠ Показано перші ${LOG_CAP} рядків — звузьте діапазон дат`]);
    }
    logSheet.columns.forEach(col => { col.width = 22; });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="mediaplan-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (e: any) {
    console.error('[reports/mediaplan]', e);
    res.status(500).json({ error: 'failed to generate mediaplan' });
  }
});

export default router;
