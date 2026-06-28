import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js';
import {
  addDoc, collection, doc, getFirestore, limit, onSnapshot, orderBy, query,
  runTransaction, serverTimestamp, setDoc,
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
    getFirestore,
    limit,
    onSnapshot,
    orderBy,
    query,
    runTransaction,
    serverTimestamp,
    setDoc,
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
};

await import('./core-v11.js?release=11');
await import('./rooms-v11.js?release=11');
await import('./chat-v11.js?release=11');
await import('./media-base-v11.js?release=11');
await import('./media-image-v11.js?release=11');
await import('./recorder-v11.js?release=11');
await import('./bootstrap-v11.js?release=11');
