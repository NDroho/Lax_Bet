import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { kv } from '@vercel/kv';

const RANKINGS_URLS = [
  'https://www.usalacrosse.com/magazine/usa-lacrosse-division-i-mens-top-20',
  'https://www.usalacrosse.com/rankings/division-i-mens-top-20',
];

function parseTable($: cheerio.CheerioAPI): { rankings: any[]; alsoConsidered: string[] } {
  const rankings: { rank: number; team: string; record: string; prev: string }[] = [];
  const alsoConsidered: string[] = [];

  $('table').each((_, table) => {
    $(table).find('tr').each((_, row) => {
      const cells = $(row).find('td, th');
      if (cells.length < 2) return;
      const first = $(cells[0]).text().trim();
      const team = $(cells[1]).text().trim();
      const record = cells.length > 2 ? $(cells[2]).text().trim() : '';
      const prev = cells.length > 3 ? $(cells[3]).text().trim() : '';

      if (first.toLowerCase() === 'rank' || first.toLowerCase() === '#') return;

      const rankNum = parseInt(first);
      if (!isNaN(rankNum) && rankNum >= 1 && rankNum <= 25 && team && team.length > 1) {
        rankings.push({ rank: rankNum, team, record, prev: prev || 'NR' });
      } else if ((first === '—' || first === '-' || first === '') && team && team.length > 1) {
        alsoConsidered.push(team);
      }
    });
  });

  return { rankings, alsoConsidered };
}

function parseList($: cheerio.CheerioAPI): { rankings: any[]; alsoConsidered: string[] } {
  const rankings: { rank: number; team: string; record: string; prev: string }[] = [];

  $('ol li').each((i, el) => {
    const text = $(el).text().trim();
    if (text && text.length > 1) {
      rankings.push({ rank: i + 1, team: text.split(/\s+\d+-\d+/)[0].trim(), record: '', prev: 'NR' });
    }
  });

  return { rankings, alsoConsidered: [] };
}

function parseText(text: string): { rankings: any[]; alsoConsidered: string[] } {
  const rankings: { rank: number; team: string; record: string; prev: string }[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Match patterns like: "1. Duke (12-1)" or "1 Duke 12-1" or "1. Duke"
  const rankPattern = /^(\d{1,2})[\.\)]\s+(.+?)(?:\s+(\d{1,2}-\d{1,2}))?$/;
  for (const line of lines) {
    const m = line.match(rankPattern);
    if (m) {
      const rank = parseInt(m[1]);
      if (rank >= 1 && rank <= 25) {
        rankings.push({ rank, team: m[2].trim(), record: m[3] || '', prev: 'NR' });
      }
    }
  }

  return { rankings, alsoConsidered: [] };
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const errors: string[] = [];

  for (const url of RANKINGS_URLS) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        next: { revalidate: 0 },
      });

      if (!res.ok) {
        errors.push(`${url}: HTTP ${res.status}`);
        continue;
      }

      const html = await res.text();
      const $ = cheerio.load(html);

      // Extract week label from page text
      let weekLabel = '';
      const pageText = $('body').text();
      const weekMatch = pageText.match(/Week[:\s#]*(\d+)/i);
      const dateMatch = pageText.match(/(?:April|May|June|July|August|September|October|November|December|January|February|March)\s+\d{1,2},?\s+\d{4}/i);
      if (weekMatch) weekLabel = `Week ${weekMatch[1]}`;
      if (dateMatch) weekLabel = weekLabel ? `${weekLabel} · ${dateMatch[0]}` : dateMatch[0];

      // Try each parsing strategy in order
      let rankings: any[] = [];
      let alsoConsidered: string[] = [];

      ({ rankings, alsoConsidered } = parseTable($));

      if (rankings.length === 0) {
        ({ rankings, alsoConsidered } = parseList($));
      }

      if (rankings.length === 0) {
        ({ rankings, alsoConsidered } = parseText(pageText));
      }

      if (rankings.length === 0) {
        errors.push(`${url}: no rankings found in page`);
        continue;
      }

      rankings.sort((a, b) => a.rank - b.rank);

      await kv.set('rankings', JSON.stringify({ rankings, alsoConsidered, weekLabel, scrapedAt: new Date().toISOString() }));
      await kv.set('rankings_updated', new Date().toISOString());

      return NextResponse.json({ success: true, count: rankings.length, weekLabel, updatedAt: new Date().toISOString() });
    } catch (err: any) {
      errors.push(`${url}: ${err.message}`);
    }
  }

  return NextResponse.json({ error: 'All sources failed', details: errors }, { status: 500 });
}
