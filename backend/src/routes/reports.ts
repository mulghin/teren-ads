import { Router } from 'express';
import { pool } from '../db';

const router = Router();

// Campaign report: plays per playlist
router.get('/campaigns', async (req, res) => {
  const { from, to, region_id } = req.query;
  const fromDate = from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const toDate = to || new Date().toISOString().slice(0, 10);

  let query = `
    SELECT
      p.id as playlist_id,
      p.name as playlist_name,
      p.start_date, p.end_date,
      p.max_plays_per_day, p.max_plays_per_week,
      COUNT(al.id) as total_plays,
      SUM(al.duration_sec) as total_duration_sec,
      COUNT(CASE WHEN al.status='completed' THEN 1 END) as completed,
      COUNT(CASE WHEN al.status='interrupted' THEN 1 END) as interrupted,
      MIN(al.start_time) as first_play,
      MAX(al.start_time) as last_play
    FROM playlists p
    LEFT JOIN ad_logs al ON al.playlist_id=p.id
      AND al.start_time >= $1::date
      AND al.start_time < ($2::date + INTERVAL '1 day')
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
  const { from, to } = req.query;
  const fromDate = from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const toDate = to || new Date().toISOString().slice(0, 10);

  const r = await pool.query(`
    SELECT
      rg.id as region_id,
      rg.name as region_name,
      DATE(al.start_time) as date,
      COUNT(al.id) as plays,
      SUM(al.duration_sec) as total_sec,
      COUNT(CASE WHEN al.trigger_type='tone' THEN 1 END) as tone_plays,
      COUNT(CASE WHEN al.trigger_type='api' THEN 1 END) as api_plays,
      COUNT(CASE WHEN al.trigger_type='schedule' THEN 1 END) as schedule_plays
    FROM regions rg
    LEFT JOIN ad_logs al ON al.region_id=rg.id
      AND al.start_time >= $1::date
      AND al.start_time < ($2::date + INTERVAL '1 day')
    GROUP BY rg.id, DATE(al.start_time)
    ORDER BY rg.id, date
  `, [fromDate, toDate]);
  res.json({ from: fromDate, to: toDate, rows: r.rows });
});

// Detailed play log
router.get('/plays', async (req, res) => {
  const { from, to, region_id, playlist_id } = req.query;
  const limit = Math.min(parseInt(req.query.limit as string) || 200, 5000);
  const fromDate = from || new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const toDate = to || new Date().toISOString().slice(0, 10);

  const conditions: string[] = [
    `al.start_time >= $1::date`,
    `al.start_time < ($2::date + INTERVAL '1 day')`,
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

    for (const region of regions.rows) {
      const sheet = workbook.addWorksheet(region.name.slice(0, 31));

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

    // Ad log sheet (last 30 days)
    const logSheet = workbook.addWorksheet('Виходи реклами');
    const lHeader = logSheet.addRow(['Регіон', 'Плейлист', 'Тригер', 'Початок', 'Кінець', 'Тривалість (с)', 'Статус']);
    const headerFill2 = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF2563EB' } };
    lHeader.eachCell(c => { c.fill = headerFill2; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; });

    const logs = await pool.query(`
      SELECT al.*, rg.name as region_name, p.name as playlist_name
      FROM ad_logs al
      LEFT JOIN regions rg ON rg.id=al.region_id
      LEFT JOIN playlists p ON p.id=al.playlist_id
      WHERE al.start_time >= NOW() - INTERVAL '30 days'
      ORDER BY al.start_time DESC LIMIT 2000
    `);
    for (const l of logs.rows) {
      logSheet.addRow([
        l.region_name, l.playlist_name, l.trigger_type,
        l.start_time ? new Date(l.start_time).toLocaleString('uk-UA') : '',
        l.end_time ? new Date(l.end_time).toLocaleString('uk-UA') : '',
        l.duration_sec ? Math.round(l.duration_sec) : '',
        l.status,
      ]);
    }
    logSheet.columns.forEach(col => { col.width = 22; });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="mediaplan-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
