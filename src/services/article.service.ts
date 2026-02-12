import {
  getDocs,
  query,
  orderBy,
  limit,
  where,
  Timestamp,
  doc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { collections, db } from '../config/firebase';
import type { Article, ArticleStatus } from '../types';
import { useAuthStore } from '../store/auth.store';

function mapDocToArticle(docSnap: any): Article {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    title: data.title ?? '',
    summary: data.summary ?? '',
    sourceUrl: data.sourceUrl ?? '',
    source: data.source ?? 'F1',
    category: data.category ?? 'general',
    guid: data.guid ?? '',
    publishedAt: data.publishedAt instanceof Timestamp
      ? data.publishedAt.toDate()
      : new Date(data.publishedAt ?? 0),
    status: data.status ?? 'draft',
    createdAt: data.createdAt instanceof Timestamp
      ? data.createdAt.toDate()
      : new Date(data.createdAt ?? 0),
    reviewedBy: data.reviewedBy,
    reviewedAt: data.reviewedAt instanceof Timestamp
      ? data.reviewedAt.toDate()
      : data.reviewedAt ? new Date(data.reviewedAt) : undefined,
    imageUrl: data.imageUrl,
    isRead: data.isRead ?? false,
  };
}

export const articleService = {
  async fetchApprovedArticles(limitCount = 20): Promise<Article[]> {
    try {
      const q = query(
        collections.articles,
        where('status', '==', 'approved'),
        orderBy('publishedAt', 'desc'),
        limit(limitCount),
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(mapDocToArticle);
    } catch (e) {
      console.log('articleService: failed to fetch approved articles:', e);
      return [];
    }
  },

  async fetchArticlesByStatus(status: ArticleStatus, limitCount = 50): Promise<Article[]> {
    try {
      const q = query(
        collections.articles,
        where('status', '==', status),
        orderBy('createdAt', 'desc'),
        limit(limitCount),
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(mapDocToArticle);
    } catch (e) {
      console.log('articleService: failed to fetch articles:', e);
      return [];
    }
  },

  async approveArticle(id: string, editedSummary?: string): Promise<void> {
    try {
      const userId = useAuthStore.getState().user?.id || 'unknown';
      const articleRef = doc(db, 'articles', id);
      await updateDoc(articleRef, {
        status: 'approved',
        reviewedBy: userId,
        reviewedAt: serverTimestamp(),
        ...(editedSummary !== undefined ? { summary: editedSummary } : {}),
      });
    } catch (e) {
      console.log('articleService: failed to approve article:', e);
      throw e;
    }
  },

  async rejectArticle(id: string): Promise<void> {
    try {
      const userId = useAuthStore.getState().user?.id || 'unknown';
      const articleRef = doc(db, 'articles', id);
      await updateDoc(articleRef, {
        status: 'rejected',
        reviewedBy: userId,
        reviewedAt: serverTimestamp(),
      });
    } catch (e) {
      console.log('articleService: failed to reject article:', e);
      throw e;
    }
  },

  async markArticleRead(id: string): Promise<void> {
    try {
      const userId = useAuthStore.getState().user?.id || 'unknown';
      const articleRef = doc(db, 'articles', id);
      await updateDoc(articleRef, {
        isRead: true,
        reviewedBy: userId,
        reviewedAt: serverTimestamp(),
      });
    } catch (e) {
      console.log('articleService: failed to mark article read:', e);
      throw e;
    }
  },

  async markArticleUnread(id: string): Promise<void> {
    try {
      const articleRef = doc(db, 'articles', id);
      await updateDoc(articleRef, {
        isRead: false,
      });
    } catch (e) {
      console.log('articleService: failed to mark article unread:', e);
      throw e;
    }
  },

  async getDraftCount(): Promise<number> {
    try {
      const q = query(
        collections.articles,
        where('status', '==', 'draft'),
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.filter(d => !d.data().isRead).length;
    } catch (e) {
      console.log('articleService: failed to get draft count:', e);
      return 0;
    }
  },
};
