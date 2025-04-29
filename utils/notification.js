const Notification = require('../models/notifications');
const { admin } = require('../firebase/firebaseAdmin');
const { getFcmToken } = require('../utils/fcmTokenManager');

const sendNotification = async ({ user_id, title, message }) => {
    try {
        await Notification.create({
            user_id,
            title,
            message,
            is_read: false
        });

        const fcmToken = await getFcmToken(user_id);

        if (fcmToken) {
            const payload = {
                notification: {
                    title,
                    body: message,
                },
                token: fcmToken
            };
            await admin.messaging().send(payload);
        }
    } catch (error) {
        console.error('Lỗi gửi thông báo:', error.message);
    }
};

module.exports = { sendNotification };
