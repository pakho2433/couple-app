import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js';
import {
  addDoc, collection, doc, getDoc, getFirestore, limit, onSnapshot, orderBy,
  query, runTransaction, serverTimestamp, setDoc, where,
} from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';
import {
  deleteObject, getDownloadURL, getStorage, ref as storageRef, uploadBytesResumable,
} from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-storage.js';
import { firebaseConfig, publicAppUrl } from './firebase-config.js';

globalThis.CoupleSpace = {
  fb: {
    initializeApp,
    getAuth,
    onAuthStateChanged,
    signInAnonymously,
    addDoc,
    collection,
    doc,
    getDoc,
    getFirestore,
    limit,
    onSnapshot,
    orderBy,
    query,
    runTransaction,
    serverTimestamp,
    setDoc,
    where,
    deleteObject,
    getDownloadURL,
    getStorage,
    storageRef,
    uploadBytesResumable,
  },
  firebaseConfig,
  publicAppUrl,
  state: {},
  ui: {},
  rooms: {},
  chat: {},
  media: {},
  social: {},
  friends: {},
  game: {},
};

await import('./core-v11.js?release=13');
await import('./rooms-v11.js?release=13');
await import('./room-delete-v13.js?release=13');
await import('./social-ui-v13.js?release=13');
await import('./chat-v11.js?release=13');
await import('./media-base-v11.js?release=13');
await import('./media-image-v11.js?release=13');
await import('./recorder-v11.js?release=13');
await import('./friends-v13.js?release=13');
await import('./game-v13.js?release=13');
await import('./bootstrap-v11.js?release=13');
