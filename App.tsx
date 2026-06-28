import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from './src/firebase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

type UserProfile = {
  displayName?: string;
  coupleId?: string;
  inviteCode?: string;
  expoPushToken?: string;
};

type ChatItem = {
  id: string;
  senderId: string;
  type: 'text' | 'gift';
  text?: string;
  giftEmoji?: string;
  giftName?: string;
  createdAt?: { toDate?: () => Date };
};

const GIFTS = [
  { emoji: '🌹', name: '玫瑰' },
  { emoji: '🧋', name: '珍珠奶茶' },
  { emoji: '🍰', name: '蛋糕' },
  { emoji: '🤗', name: '擁抱券' },
  { emoji: '💋', name: '親吻券' },
  { emoji: '🎬', name: '電影約會' },
  { emoji: '💌', name: '情書' },
  { emoji: '❤️', name: '愛心' },
];

function makePairCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function formatTime(item: ChatItem): string {
  const date = item.createdAt?.toDate?.();
  if (!date) return '傳送中…';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function registerPushToken(uid: string): Promise<void> {
  if (!Device.isDevice) return;

  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== 'granted') {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') return;

  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  if (!projectId) {
    console.warn('Missing EXPO_PUBLIC_EAS_PROJECT_ID; push notifications are disabled.');
    return;
  }

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await setDoc(doc(db, 'users', uid), { expoPushToken: token }, { merge: true });
}

export default function App() {
  const [uid, setUid] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile>({});
  const [members, setMembers] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [displayName, setDisplayName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [draft, setDraft] = useState('');
  const [tab, setTab] = useState<'chat' | 'gifts'>('chat');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        await signInAnonymously(auth);
        return;
      }
      setUid(user.uid);
      await setDoc(
        doc(db, 'users', user.uid),
        { createdAt: serverTimestamp() },
        { merge: true },
      );
      registerPushToken(user.uid).catch(console.warn);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(doc(db, 'users', uid), (snapshot) => {
      const data = (snapshot.data() ?? {}) as UserProfile;
      setProfile(data);
      if (data.displayName) setDisplayName(data.displayName);
    });
  }, [uid]);

  useEffect(() => {
    if (!profile.coupleId) {
      setMembers([]);
      return;
    }
    return onSnapshot(doc(db, 'couples', profile.coupleId), (snapshot) => {
      setMembers((snapshot.data()?.members ?? []) as string[]);
    });
  }, [profile.coupleId]);

  useEffect(() => {
    if (!profile.coupleId) {
      setMessages([]);
      return;
    }
    const messagesQuery = query(
      collection(db, 'couples', profile.coupleId, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(100),
    );
    return onSnapshot(messagesQuery, (snapshot) => {
      setMessages(
        snapshot.docs.map((messageDoc) => ({
          id: messageDoc.id,
          ...(messageDoc.data() as Omit<ChatItem, 'id'>),
        })),
      );
    });
  }, [profile.coupleId]);

  const partnerConnected = members.length === 2;
  const title = useMemo(() => {
    if (!partnerConnected) return '等待另一半加入 💗';
    return '我哋嘅二人空間 💞';
  }, [partnerConnected]);

  const perform = async (task: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await task();
    } catch (error) {
      const message = error instanceof Error ? error.message : '發生未知錯誤';
      Alert.alert('未能完成', message);
    } finally {
      setBusy(false);
    }
  };

  const createCouple = () =>
    perform(async () => {
      if (!uid) return;
      const code = makePairCode();
      const coupleRef = doc(collection(db, 'couples'));
      const batch = writeBatch(db);
      batch.set(coupleRef, {
        members: [uid],
        createdBy: uid,
        createdAt: serverTimestamp(),
      });
      batch.set(doc(db, 'pairCodes', code), {
        coupleId: coupleRef.id,
        ownerUid: uid,
        createdAt: serverTimestamp(),
      });
      batch.set(
        doc(db, 'users', uid),
        {
          displayName: displayName.trim() || '我',
          coupleId: coupleRef.id,
          inviteCode: code,
        },
        { merge: true },
      );
      await batch.commit();
    });

  const joinCouple = () =>
    perform(async () => {
      if (!uid) return;
      const code = joinCode.trim().toUpperCase();
      if (code.length !== 8) throw new Error('請輸入 8 位配對碼。');

      const pairRef = doc(db, 'pairCodes', code);
      await runTransaction(db, async (transaction) => {
        const pairSnapshot = await transaction.get(pairRef);
        if (!pairSnapshot.exists()) throw new Error('配對碼不存在或已被使用。');

        const { coupleId } = pairSnapshot.data() as { coupleId: string };
        const coupleRef = doc(db, 'couples', coupleId);
        const coupleSnapshot = await transaction.get(coupleRef);
        if (!coupleSnapshot.exists()) throw new Error('情侶空間不存在。');

        const currentMembers = (coupleSnapshot.data().members ?? []) as string[];
        if (currentMembers.length >= 2 && !currentMembers.includes(uid)) {
          throw new Error('這個情侶空間已經有兩名成員。');
        }

        const nextMembers = currentMembers.includes(uid)
          ? currentMembers
          : [...currentMembers, uid];

        transaction.update(coupleRef, { members: nextMembers });
        transaction.set(
          doc(db, 'users', uid),
          {
            displayName: displayName.trim() || '我',
            coupleId,
          },
          { merge: true },
        );
        transaction.delete(pairRef);
      });
    });

  const sendText = () =>
    perform(async () => {
      const text = draft.trim();
      if (!uid || !profile.coupleId || !text) return;
      setDraft('');
      await addDoc(collection(db, 'couples', profile.coupleId, 'messages'), {
        senderId: uid,
        type: 'text',
        text,
        createdAt: serverTimestamp(),
      });
    });

  const sendGift = (gift: (typeof GIFTS)[number]) =>
    perform(async () => {
      if (!uid || !profile.coupleId) return;
      await addDoc(collection(db, 'couples', profile.coupleId, 'messages'), {
        senderId: uid,
        type: 'gift',
        giftEmoji: gift.emoji,
        giftName: gift.name,
        createdAt: serverTimestamp(),
      });
      setTab('chat');
    });

  if (!uid) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>正在建立私人空間…</Text>
      </SafeAreaView>
    );
  }

  if (!profile.coupleId) {
    return (
      <SafeAreaView style={styles.authScreen}>
        <KeyboardAvoidingView
          style={styles.authInner}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Text style={styles.logo}>💗</Text>
          <Text style={styles.appName}>Couple Space</Text>
          <Text style={styles.subtitle}>只屬於你哋兩個嘅私人聊天空間</Text>

          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="你的名稱"
            maxLength={20}
          />

          <Pressable style={styles.primaryButton} onPress={createCouple} disabled={busy}>
            <Text style={styles.primaryButtonText}>建立情侶空間</Text>
          </Pressable>

          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>或者</Text>
            <View style={styles.divider} />
          </View>

          <TextInput
            style={[styles.input, styles.codeInput]}
            value={joinCode}
            onChangeText={(value) => setJoinCode(value.toUpperCase())}
            placeholder="輸入另一半的 8 位配對碼"
            autoCapitalize="characters"
            maxLength={8}
          />
          <Pressable style={styles.secondaryButton} onPress={joinCouple} disabled={busy}>
            <Text style={styles.secondaryButtonText}>加入情侶空間</Text>
          </Pressable>
          {busy && <ActivityIndicator style={styles.busyIndicator} />}
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  const renderItem = ({ item }: { item: ChatItem }) => {
    const mine = item.senderId === uid;
    if (item.type === 'gift') {
      return (
        <View style={styles.giftMessage}>
          <Text style={styles.giftEmoji}>{item.giftEmoji}</Text>
          <Text style={styles.giftMessageText}>
            {mine ? '你送出' : '你收到'}「{item.giftName}」
          </Text>
          <Text style={styles.giftTime}>{formatTime(item)}</Text>
        </View>
      );
    }
    return (
      <View style={[styles.messageRow, mine ? styles.messageRowMine : styles.messageRowOther]}>
        <View style={[styles.messageBubble, mine ? styles.messageMine : styles.messageOther]}>
          <Text style={[styles.messageText, mine && styles.messageTextMine]}>{item.text}</Text>
          <Text style={[styles.messageTime, mine && styles.messageTimeMine]}>{formatTime(item)}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{title}</Text>
        <Text style={styles.headerStatus}>
          {partnerConnected ? '● 另一半已連線' : '○ 尚未配對完成'}
        </Text>
      </View>

      {!partnerConnected && profile.inviteCode ? (
        <View style={styles.inviteCard}>
          <Text style={styles.inviteLabel}>將以下配對碼傳給另一半</Text>
          <Text style={styles.inviteCode}>{profile.inviteCode}</Text>
          <Pressable
            onPress={async () => {
              await Clipboard.setStringAsync(profile.inviteCode ?? '');
              Alert.alert('已複製', '配對碼已複製到剪貼簿。');
            }}
          >
            <Text style={styles.copyText}>複製配對碼</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.tabs}>
        <Pressable
          style={[styles.tab, tab === 'chat' && styles.activeTab]}
          onPress={() => setTab('chat')}
        >
          <Text style={[styles.tabText, tab === 'chat' && styles.activeTabText]}>💬 聊天</Text>
        </Pressable>
        <Pressable
          style={[styles.tab, tab === 'gifts' && styles.activeTab]}
          onPress={() => setTab('gifts')}
        >
          <Text style={[styles.tabText, tab === 'gifts' && styles.activeTabText]}>🎁 送禮物</Text>
        </Pressable>
      </View>

      {tab === 'gifts' ? (
        <ScrollView contentContainerStyle={styles.giftGrid}>
          <Text style={styles.giftHeading}>揀一份心意送畀另一半</Text>
          <View style={styles.giftWrap}>
            {GIFTS.map((gift) => (
              <Pressable
                key={gift.name}
                style={styles.giftCard}
                onPress={() => sendGift(gift)}
                disabled={!partnerConnected || busy}
              >
                <Text style={styles.giftCardEmoji}>{gift.emoji}</Text>
                <Text style={styles.giftCardName}>{gift.name}</Text>
              </Pressable>
            ))}
          </View>
          {!partnerConnected && (
            <Text style={styles.waitingHint}>另一半加入後先可以送禮物。</Text>
          )}
        </ScrollView>
      ) : (
        <KeyboardAvoidingView
          style={styles.chatArea}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={8}
        >
          <FlatList
            style={styles.messageList}
            contentContainerStyle={styles.messageListContent}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            inverted
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                {partnerConnected ? '講第一句甜言蜜語啦 💕' : '等待另一半輸入配對碼…'}
              </Text>
            }
          />
          <View style={styles.composer}>
            <TextInput
              style={styles.composerInput}
              value={draft}
              onChangeText={setDraft}
              placeholder={partnerConnected ? '輸入訊息…' : '配對後即可聊天'}
              editable={partnerConnected}
              multiline
              maxLength={1000}
            />
            <Pressable
              style={[styles.sendButton, (!draft.trim() || !partnerConnected) && styles.disabledButton]}
              onPress={sendText}
              disabled={!draft.trim() || !partnerConnected || busy}
            >
              <Text style={styles.sendButtonText}>➤</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}
      {busy && <ActivityIndicator style={styles.floatingBusy} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff7fa' },
  loadingText: { marginTop: 14, color: '#7b5363' },
  authScreen: { flex: 1, backgroundColor: '#fff7fa' },
  authInner: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  logo: { fontSize: 66, textAlign: 'center' },
  appName: { fontSize: 32, fontWeight: '800', textAlign: 'center', color: '#52233a' },
  subtitle: { textAlign: 'center', color: '#8b6675', marginTop: 8, marginBottom: 30 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#efd3dd', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16 },
  codeInput: { letterSpacing: 2, textAlign: 'center', fontWeight: '700' },
  primaryButton: { backgroundColor: '#e64c7f', borderRadius: 16, paddingVertical: 15, marginTop: 14 },
  primaryButtonText: { color: '#fff', textAlign: 'center', fontWeight: '800', fontSize: 16 },
  secondaryButton: { borderWidth: 2, borderColor: '#e64c7f', borderRadius: 16, paddingVertical: 13, marginTop: 14 },
  secondaryButtonText: { color: '#d83970', textAlign: 'center', fontWeight: '800', fontSize: 16 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 24 },
  divider: { flex: 1, height: 1, backgroundColor: '#ead5de' },
  dividerText: { color: '#9b7483', marginHorizontal: 12 },
  busyIndicator: { marginTop: 18 },
  screen: { flex: 1, backgroundColor: '#fff9fb' },
  header: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#4c2436' },
  headerStatus: { color: '#9b6078', marginTop: 4, fontSize: 12 },
  inviteCard: { marginHorizontal: 16, marginBottom: 12, padding: 16, borderRadius: 18, backgroundColor: '#ffe6ef', alignItems: 'center' },
  inviteLabel: { color: '#7d4058' },
  inviteCode: { fontSize: 28, fontWeight: '900', letterSpacing: 4, color: '#bb285b', marginVertical: 8 },
  copyText: { color: '#cc3266', fontWeight: '700' },
  tabs: { flexDirection: 'row', marginHorizontal: 16, backgroundColor: '#f7e9ee', padding: 4, borderRadius: 14 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 11, alignItems: 'center' },
  activeTab: { backgroundColor: '#fff' },
  tabText: { color: '#95677a', fontWeight: '700' },
  activeTabText: { color: '#c72e63' },
  chatArea: { flex: 1 },
  messageList: { flex: 1 },
  messageListContent: { padding: 16, flexGrow: 1 },
  messageRow: { flexDirection: 'row', marginVertical: 4 },
  messageRowMine: { justifyContent: 'flex-end' },
  messageRowOther: { justifyContent: 'flex-start' },
  messageBubble: { maxWidth: '80%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  messageMine: { backgroundColor: '#e64c7f', borderBottomRightRadius: 5 },
  messageOther: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#f0dce3', borderBottomLeftRadius: 5 },
  messageText: { color: '#4d3140', fontSize: 16, lineHeight: 21 },
  messageTextMine: { color: '#fff' },
  messageTime: { color: '#a98392', fontSize: 10, marginTop: 4, textAlign: 'right' },
  messageTimeMine: { color: '#ffd9e6' },
  giftMessage: { alignSelf: 'center', backgroundColor: '#fff1c9', borderRadius: 20, paddingHorizontal: 22, paddingVertical: 14, alignItems: 'center', marginVertical: 8 },
  giftEmoji: { fontSize: 42 },
  giftMessageText: { color: '#765224', fontWeight: '800', marginTop: 4 },
  giftTime: { color: '#aa8759', fontSize: 10, marginTop: 4 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', padding: 10, borderTopWidth: 1, borderTopColor: '#f0dfe5', backgroundColor: '#fff' },
  composerInput: { flex: 1, maxHeight: 110, borderRadius: 20, backgroundColor: '#f8edf1', paddingHorizontal: 15, paddingVertical: 10, fontSize: 16 },
  sendButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#e64c7f', alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  disabledButton: { opacity: 0.35 },
  sendButtonText: { color: '#fff', fontSize: 20, fontWeight: '900' },
  emptyText: { textAlign: 'center', color: '#a77d8d', marginTop: 50, transform: [{ scaleY: -1 }] },
  giftGrid: { padding: 18 },
  giftHeading: { fontSize: 20, fontWeight: '800', color: '#5c3042', marginBottom: 16 },
  giftWrap: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  giftCard: { width: '48%', backgroundColor: '#fff', borderRadius: 18, paddingVertical: 20, alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: '#f2dce4' },
  giftCardEmoji: { fontSize: 38 },
  giftCardName: { color: '#6e4354', fontWeight: '700', marginTop: 8 },
  waitingHint: { color: '#a36f82', textAlign: 'center', marginTop: 12 },
  floatingBusy: { position: 'absolute', top: 16, right: 16 },
});
