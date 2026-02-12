import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import Parser from 'rss-parser';
import { GoogleGenerativeAI } from '@google/generative-ai';

const db = admin.firestore();
const parser = new Parser();

// Secret managed via: firebase functions:secrets:set GEMINI_API_KEY
const geminiApiKey = defineSecret('GEMINI_API_KEY');

// RSS feed URLs
const RSS_FEEDS = [
  { url: 'https://www.fia.com/rss/news', source: 'FIA' as const },
  { url: 'https://www.formula1.com/en/latest/all.xml', source: 'F1' as const },
];

// Keywords to filter FIA feed for F1-related articles
const F1_KEYWORDS = [
  'f1', 'formula 1', 'formula one', 'grand prix', 'gp',
  'fia formula', 'world championship', 'constructor', 'pit lane',
  'pole position', 'grid', 'podium', 'fastest lap',
];

// Category keywords for auto-classification
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  practice: ['practice', 'fp1', 'fp2', 'fp3', 'free practice', 'shakedown'],
  qualifying: ['qualifying', 'pole', 'q1', 'q2', 'q3', 'grid position', 'sprint shootout'],
  race: ['race result', 'race winner', 'victory', 'podium', 'race day', 'chequered flag', 'grand prix result'],
  transfer: ['transfer', 'signing', 'contract', 'joins', 'departure', 'replaced', 'seat', 'announce driver'],
  regulation: ['regulation', 'rule change', 'technical directive', 'fia ruling', 'penalty', 'stewards', 'budget cap'],
};

function isF1Related(title: string, content: string): boolean {
  const text = `${title} ${content}`.toLowerCase();
  return F1_KEYWORDS.some(keyword => text.includes(keyword));
}

function categorizeArticle(title: string, summary: string): string {
  const text = `${title} ${summary}`.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(keyword => text.includes(keyword))) {
      return category;
    }
  }
  return 'general';
}

async function summarizeWithGemini(
  genAI: GoogleGenerativeAI,
  title: string,
  content: string
): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const prompt = `Summarize this F1 news article in 2-3 concise sentences for a fantasy F1 app. Focus on facts relevant to F1 fans (driver performance, team changes, race results). Keep it under 200 characters if possible.\n\nTitle: ${title}\n\nContent: ${content}`;
    const result = await model.generateContent(prompt);
    const response = result.response;
    return response.text().trim();
  } catch (e) {
    console.error('Gemini summarization failed:', e);
    // Fallback: use first 200 chars of content
    return content.substring(0, 200).trim() + (content.length > 200 ? '...' : '');
  }
}

/**
 * Scheduled function to fetch F1 news from RSS feeds every 30 minutes.
 * Uses Gemini to summarize articles and stores them as drafts in Firestore.
 *
 * Set the secret: firebase functions:secrets:set GEMINI_API_KEY
 */
export const fetchF1News = onSchedule(
  { schedule: 'every 30 minutes', secrets: [geminiApiKey] },
  async () => {
    const apiKey = geminiApiKey.value();
    if (!apiKey) {
      console.error('GEMINI_API_KEY secret not set. Run: firebase functions:secrets:set GEMINI_API_KEY');
      return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    let totalNew = 0;

    for (const feed of RSS_FEEDS) {
      try {
        console.log(`Fetching RSS from ${feed.source}: ${feed.url}`);
        const rssFeed = await parser.parseURL(feed.url);

        for (const item of rssFeed.items || []) {
          const guid = item.guid || item.link || item.title || '';
          if (!guid) continue;

          // For FIA feed, filter to F1-related articles only
          if (feed.source === 'FIA') {
            const content = item.contentSnippet || item.content || '';
            if (!isF1Related(item.title || '', content)) {
              continue;
            }
          }

          // Dedup by guid
          const existing = await db.collection('articles')
            .where('guid', '==', guid)
            .limit(1)
            .get();

          if (!existing.empty) continue;

          const title = item.title || 'Untitled';
          const content = item.contentSnippet || item.content || item.summary || '';
          const sourceUrl = item.link || '';

          // Summarize with Gemini
          const summary = await summarizeWithGemini(genAI, title, content);

          // Auto-categorize
          const category = categorizeArticle(title, summary);

          // Write to Firestore as draft
          await db.collection('articles').add({
            title,
            summary,
            sourceUrl,
            source: feed.source,
            category,
            guid,
            publishedAt: item.pubDate
              ? admin.firestore.Timestamp.fromDate(new Date(item.pubDate))
              : admin.firestore.FieldValue.serverTimestamp(),
            status: 'draft',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            ...(item.enclosure?.url ? { imageUrl: item.enclosure.url } : {}),
          });

          totalNew++;
          console.log(`Added draft article: "${title}" [${feed.source}] [${category}]`);
        }
      } catch (e) {
        console.error(`Failed to process ${feed.source} feed:`, e);
      }
    }

    console.log(`fetchF1News complete: ${totalNew} new articles added as drafts`);
  }
);
