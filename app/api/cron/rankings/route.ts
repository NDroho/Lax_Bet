import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { kv } from '@vercel/kv';

const RANKINGS_URL = 'https://www.usalacrosse.com/magazine/usa-lacrosse-division-i-mens-top-20';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const res = await fetch(RANKINGS_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      next: { revalidate: 0 },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const html = await res.text();
    const $ = cheerio.load(html);
    const rankings: { rank: number; team: string; record: string; prev: string }[] = [];
    const alsoConsidered: string[] = [];
    let weekLabel = '';

    const pageText = $('body').text();
    const weekMatch = pageText.match(/Week[:\s]*(\d+)/i);
    const dateMatch = pageText.match(/Date[:\s]*([\w\s,]+\d{4})/i);
    if (weekMatch) weekLabel = `Week ${weekMatch[1]}`;
    if (dateMatch) weekLabel += ` · ${dateMatch[1].trim()}`;

    $('table').each((_, table) => {
      $(table).find('tr').each((_, row) => {
        const cells = $(row).find('td, th');
        if (cells.length < 3) return;
        const first = $(cells[0]).text().trim();
        const team = $(cells[1]).text().trim();
        const record = $(cells[2]).text().trim();
        const prev = cells.length > 3 ? $(cells[3]).text().trim() : '';

        if (first.toLowerCase() === 'rank') return;

        const rankNum = parseInt(first);
        if (!isNaN(rankNum) && rankNum >= 1 && rankNum <= 25 && team) {
          rankings.push({ rank: rankNum, team, record, prev: prev || 'NR' });
        } else if ((first === '—' || first === '-' || first === '') && team && team.length > 1) {
          alsoConsidered.push(team);
        }
      });
    });

    if (rankings.length === 0) throw new Error('No rankings found');
    rankings.sort((a, b) => a.rank - b.rank);

    await kv.set('rankings', JSON.stringify({ rankings, alsoConsidered, weekLabel, scrapedAt: new Date().toISOString() }));
    await kv.set('rankings_updated', new Date().toISOString());

    return NextResponse.json({ success: true, count: rankings.length, weekLabel, updatedAt: new Date().toISOString() });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
