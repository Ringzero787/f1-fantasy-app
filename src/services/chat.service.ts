import {
  collection,
  doc,
  addDoc,
  updateDoc,
  setDoc,
  getDocs,
  getDoc,
  query,
  orderBy,
  limit as firestoreLimit,
  startAfter,
  serverTimestamp,
  onSnapshot,
  Timestamp,
  arrayUnion,
  arrayRemove,
  deleteField,
} from 'firebase/firestore';
import { db, firebaseAuth } from '../config/firebase';
import type { ChatMessage } from '../types';

const STORAGE_BUCKET = process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || '';

export const chatService = {
  /**
   * Subscribe to real-time messages in a league chat.
   * Returns an unsubscribe function.
   */
  subscribeToMessages(
    leagueId: string,
    messageLimit: number,
    callback: (messages: ChatMessage[]) => void,
    onError?: (error: Error) => void
  ): () => void {
    const q = query(
      collection(db, 'leagues', leagueId, 'messages'),
      orderBy('createdAt', 'desc'),
      firestoreLimit(messageLimit)
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const messages: ChatMessage[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            senderId: data.senderId,
            senderName: data.senderName,
            senderAvatarUrl: data.senderAvatarUrl,
            text: data.text || '',
            imageUrl: data.imageUrl,
            replyTo: data.replyTo,
            reactions: data.reactions || {},
            isDeleted: data.isDeleted,
            editedAt: data.editedAt?.toDate(),
            createdAt: data.createdAt?.toDate() || new Date(),
          };
        });
        callback(messages);
      },
      (error) => {
        console.error('Chat subscription error:', error);
        onError?.(error);
      }
    );
  },

  /**
   * Load older messages before a given timestamp (cursor pagination).
   */
  async loadOlderMessages(
    leagueId: string,
    beforeTimestamp: Date,
    messageLimit: number = 30
  ): Promise<ChatMessage[]> {
    const ts = Timestamp.fromDate(beforeTimestamp);
    const q = query(
      collection(db, 'leagues', leagueId, 'messages'),
      orderBy('createdAt', 'desc'),
      startAfter(ts),
      firestoreLimit(messageLimit)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        senderId: data.senderId,
        senderName: data.senderName,
        senderAvatarUrl: data.senderAvatarUrl,
        text: data.text || '',
        imageUrl: data.imageUrl,
        replyTo: data.replyTo,
        reactions: data.reactions || {},
        isDeleted: data.isDeleted,
        editedAt: data.editedAt?.toDate(),
        createdAt: data.createdAt?.toDate() || new Date(),
      };
    });
  },

  /**
   * Send a new message to a league chat.
   */
  async sendMessage(
    leagueId: string,
    message: {
      senderId: string;
      senderName: string;
      senderAvatarUrl?: string;
      text: string;
      imageUrl?: string;
      replyTo?: { messageId: string; senderName: string; text: string };
    }
  ): Promise<string> {
    const messagesRef = collection(db, 'leagues', leagueId, 'messages');
    const docData: Record<string, unknown> = {
      senderId: message.senderId,
      senderName: message.senderName,
      text: message.text,
      reactions: {},
      createdAt: serverTimestamp(),
    };

    if (message.senderAvatarUrl) {
      docData.senderAvatarUrl = message.senderAvatarUrl;
    }
    if (message.imageUrl) {
      docData.imageUrl = message.imageUrl;
    }
    if (message.replyTo) {
      docData.replyTo = message.replyTo;
    }

    const docRef = await addDoc(messagesRef, docData);
    return docRef.id;
  },

  /**
   * Soft-delete a message (sets isDeleted: true).
   */
  async deleteMessage(leagueId: string, messageId: string): Promise<void> {
    const docRef = doc(db, 'leagues', leagueId, 'messages', messageId);
    await updateDoc(docRef, { isDeleted: true });
  },

  /**
   * Toggle a reaction on a message.
   * If user already reacted with this emoji, remove it. Otherwise, add it.
   */
  async toggleReaction(
    leagueId: string,
    messageId: string,
    emoji: string,
    userId: string
  ): Promise<void> {
    const docRef = doc(db, 'leagues', leagueId, 'messages', messageId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return;

    const data = docSnap.data();
    const reactions = data.reactions || {};
    const users: string[] = reactions[emoji] || [];

    if (users.includes(userId)) {
      // Remove reaction
      const updated = users.filter((u: string) => u !== userId);
      if (updated.length === 0) {
        // Remove the emoji key entirely
        await updateDoc(docRef, { [`reactions.${emoji}`]: deleteField() });
      } else {
        await updateDoc(docRef, { [`reactions.${emoji}`]: arrayRemove(userId) });
      }
    } else {
      // Add reaction
      await updateDoc(docRef, { [`reactions.${emoji}`]: arrayUnion(userId) });
    }
  },

  /**
   * Update read receipt for a user in a league chat.
   */
  async updateReadReceipt(leagueId: string, userId: string): Promise<void> {
    const receiptRef = doc(db, 'leagues', leagueId, 'chatReadReceipts', userId);
    await setDoc(receiptRef, { lastReadAt: serverTimestamp() });
  },

  /**
   * Get the latest message for a league (for chat list preview).
   */
  async getLatestMessage(leagueId: string): Promise<ChatMessage | null> {
    const q = query(
      collection(db, 'leagues', leagueId, 'messages'),
      orderBy('createdAt', 'desc'),
      firestoreLimit(1)
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;

    const docSnap = snapshot.docs[0];
    const data = docSnap.data();
    return {
      id: docSnap.id,
      senderId: data.senderId,
      senderName: data.senderName,
      senderAvatarUrl: data.senderAvatarUrl,
      text: data.text || '',
      imageUrl: data.imageUrl,
      replyTo: data.replyTo,
      reactions: data.reactions || {},
      isDeleted: data.isDeleted,
      editedAt: data.editedAt?.toDate(),
      createdAt: data.createdAt?.toDate() || new Date(),
    };
  },

  /**
   * Get read receipt timestamp for a user.
   */
  async getReadReceipt(leagueId: string, userId: string): Promise<Date | null> {
    const receiptRef = doc(db, 'leagues', leagueId, 'chatReadReceipts', userId);
    const docSnap = await getDoc(receiptRef);
    if (!docSnap.exists()) return null;
    const data = docSnap.data();
    return data.lastReadAt?.toDate() || null;
  },

  /**
   * Upload a chat image to Firebase Storage using REST API.
   */
  async uploadChatImage(
    leagueId: string,
    userId: string,
    base64Data: string,
    contentType: string = 'image/jpeg'
  ): Promise<string> {
    const user = firebaseAuth.currentUser;
    if (!user) {
      throw new Error('User must be authenticated to upload chat image');
    }

    const token = await user.getIdToken();
    const extension = contentType.split('/')[1] || 'jpg';
    const fileName = `${userId}_${Date.now()}.${extension}`;
    const path = `chat/${leagueId}/${fileName}`;
    const encodedPath = encodeURIComponent(path);

    const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodedPath}`;

    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Firebase ${token}`,
        'Content-Type': contentType,
        'Content-Transfer-Encoding': 'base64',
      },
      body: base64Data,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Chat image upload failed:', response.status, errorText);
      throw new Error(`Failed to upload image: ${response.status}`);
    }

    const result = await response.json();
    const downloadToken = result.downloadTokens;
    const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodedPath}?alt=media&token=${downloadToken}`;

    return downloadUrl;
  },
};
