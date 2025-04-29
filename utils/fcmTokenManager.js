// const { db } = require("../firebase/firebaseAdmin");

// const fcmRef = db.ref("fcm_tokens");

// const saveFcmToken = async (userId, token) => {
//     await fcmRef.child(userId).set(token);
// };

// const getFcmToken = async (userId) => {
//     const snapshot = await fcmRef.child(userId).once("value");
//     return snapshot.val();
// };

// const deleteFcmToken = async (userId) => {
//     await fcmRef.child(userId).remove();
// };

// const getAllFcmTokens = async () => {
//     const snapshot = await fcmRef.once("value");
//     return snapshot.val(); // Trả về object { userId: token, ... }
// };

// module.exports = {
//     saveFcmToken,
//     getFcmToken,
//     deleteFcmToken,
//     getAllFcmTokens
// };

const { db } = require("../firebase/firebaseAdmin");

const fcmRef = db.ref("fcm_tokens");

const encodeKey = (key) => {
    return String(key).replace(/[.#$[\]]/g, "_");
};

const saveFcmToken = async (userId, token) => {
    const safeKey = encodeKey(userId);
    await fcmRef.child(safeKey).set(token);
};

const getFcmToken = async (userId) => {
    const safeKey = encodeKey(userId);
    const snapshot = await fcmRef.child(safeKey).once("value");
    return snapshot.val();
};

const deleteFcmToken = async (userId) => {
    const safeKey = encodeKey(userId);
    await fcmRef.child(safeKey).remove();
};

const getAllFcmTokens = async () => {
    const snapshot = await fcmRef.once("value");
    return snapshot.val();
};

module.exports = {
    saveFcmToken,
    getFcmToken,
    deleteFcmToken,
    getAllFcmTokens
};
