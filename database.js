import admin from "firebase-admin";
import { readFileSync } from "fs";

const serviceAccount = JSON.parse(readFileSync("./serviceAccountKey.json"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL:
    "https://tars-db-default-rtdb.asia-southeast1.firebasedatabase.app/",
});

const db = admin.database();
const usersRef = db.ref("users");

export async function getConversation(userId) {
  try {
    const snapshot = await usersRef.child(userId).get();
    if (snapshot.exists()) {
      const data = snapshot.val();
      if (!data.messages) data.messages = [];
      if (!data.profile) data.profile = {};
      return data;
    } else {
      const newUser = { messages: [], profile: {} };
      await usersRef.child(userId).set(newUser);
      return newUser;
    }
  } catch (error) {
    console.error("Firebase Get Error:", error);
    return { messages: [], profile: {} };
  }
}

export async function saveConversation(userId, data) {
  try {
    if (data.messages && Array.isArray(data.messages)) {
      
      if (data.messages.length > 10) {
        data.messages = data.messages.slice(-10);
      }
    }

    await usersRef.child(userId).update(data);
    
  } catch (error) {
    console.error("Firebase Save Error:", error);
  }
}

export async function updateProfile(userId, key, value) {
  try {
    await usersRef.child(`${userId}/profile`).update({ [key]: value });
  } catch (error) {
    console.error("Firebase Profile Update Error:", error);
  }
}
