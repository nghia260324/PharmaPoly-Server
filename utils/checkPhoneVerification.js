
const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault(),
    });
}

async function checkPhoneVerification(phone_number) {
    try {
        const userRecord = await admin.auth().getUserByPhoneNumber(phone_number);
        return userRecord ? true : false;
    } catch (error) {
        console.error("Phone number verification failed:", error);
        return false;
    }
}

async function checkUidAndPhoneNumber(uid, phone_number) {
    try {
        const userRecord = await admin.auth().getUser(uid);
        
        if (userRecord.phoneNumber === phone_number) {
            return true;
        } else {
            return false;
        }
    } catch (error) {
        console.error("Error fetching user from Firebase:", error);
        return false;
    }
}

module.exports = { checkPhoneVerification, checkUidAndPhoneNumber };
