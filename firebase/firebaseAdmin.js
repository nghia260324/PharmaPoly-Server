var admin = require("firebase-admin");

//var serviceAccount = require("./firebaseAdmin.json");

let serviceAccount;

if (fs.existsSync("./firebase/firebaseAdmin.json")) {
  serviceAccount = require("./firebaseAdmin.json");
} else {
  serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const auth = admin.auth();

module.exports = { admin, auth };