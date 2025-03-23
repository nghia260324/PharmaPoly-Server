// var admin = require("firebase-admin");
// const fs = require("fs");
// //var serviceAccount = require("./firebaseAdmin.json");

// let serviceAccount;

// if (fs.existsSync("./firebase/firebaseAdmin.json")) {
//   serviceAccount = require("./firebaseAdmin.json");
// } else {
//   serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
// }

// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount)
// });

// const auth = admin.auth();

// module.exports = { admin, auth };


var admin = require("firebase-admin");
const fs = require("fs");
//var serviceAccount = require("./firebaseAdmin.json");

let serviceAccount;

if (fs.existsSync("./firebase/firebaseAdmin.json")) {
  serviceAccount = require("./firebaseAdmin.json");
} else {
  serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://pharmapoly-62b41-default-rtdb.firebaseio.com",
});

const auth = admin.auth();
const storage = admin.storage();
const bucket = storage.bucket("pharmapoly-62b41.firebasestorage.app"); 
const db = admin.database();
module.exports = { admin, auth, bucket, db };
