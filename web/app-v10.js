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
    initializeApp, getAuth, onAuthStateChanged, signInAnonymously,
    addDoc, collection, doc, getFirestore, limit, onSnapshot, orderBy, query,
    runTransaction, serverTimestamp, setDoc,
    deleteObject, getDownloadURL, getStorage, storageRef, uploadBytesResumable,
  },
  firebaseConfig,
  publicAppUrl,
  state: {},
  ui: {},
  chat: {},
  media: {},
};

await import('./core.js?release=10');
await import('./chat.js?release=10');
await import('./media.js?release=10');
await import('./bootstrap.js?release=10');
