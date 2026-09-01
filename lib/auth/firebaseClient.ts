"use client";

import { initializeApp, getApps, type FirebaseOptions } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
} from "firebase/auth";

const config: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export function isFirebaseClientConfigured(): boolean {
  return Boolean(config.apiKey && config.projectId && config.appId);
}

function getClientApp() {
  const existing = getApps();
  return existing.length > 0 ? existing[0] : initializeApp(config);
}

export async function signInWithGoogle(): Promise<string> {
  const auth = getAuth(getClientApp());
  const result = await signInWithPopup(auth, new GoogleAuthProvider());
  return result.user.getIdToken();
}

export async function signInWithEmail(email: string, password: string): Promise<string> {
  const auth = getAuth(getClientApp());
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user.getIdToken();
}

export async function signUpWithEmail(email: string, password: string): Promise<string> {
  const auth = getAuth(getClientApp());
  const result = await createUserWithEmailAndPassword(auth, email, password);
  return result.user.getIdToken();
}

export async function signOutClient(): Promise<void> {
  if (!isFirebaseClientConfigured()) return;
  const auth = getAuth(getClientApp());
  await firebaseSignOut(auth);
}
