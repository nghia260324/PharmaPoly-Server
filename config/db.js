const mongoose = require('mongoose');
mongoose.set('strictQuery',true);
require('dotenv').config();

const username = process.env.MONGO_USER;
const password = process.env.MONGO_PASSWORD;
const dbName = process.env.MONGO_DB;
const local = `mongodb+srv://${username}:${password}@cluster0.y421t.mongodb.net/${dbName}?retryWrites=true&w=majority&appName=Cluster0`;

const connect = async () => {
    try {
        await mongoose.connect(local, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        })
        console.log('Connect succes!');
    } catch (err) {
        console.log(err);
    }
}
module.exports = {connect};