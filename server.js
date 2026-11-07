const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const Database = require('better-sqlite3');
const multer = require('multer');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const db = new Database('database.db');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const storage = multer.diskStorage({
    destination: './uploads/',
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'));
    }
});
const upload = multer({ storage });

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        avatar TEXT,
        bio TEXT
    );
    CREATE TABLE IF NOT EXISTS rooms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        icon TEXT,
        description TEXT
    );
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id INTEGER,
        user_id INTEGER,
        username TEXT,
        avatar TEXT,
        content TEXT,
        image_url TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);

const count = db.prepare('SELECT count(*) as count FROM rooms').get();
if (count.count === 0) {
    const insert = db.prepare('INSERT INTO rooms (name, icon, description) VALUES (?, ?, ?)');
    insert.run('العامة 💬', '💬', 'الغرفة العامة للمناقشات');
    insert.run('برمجة وتقنية 💻', '💻', 'مجتمع الأكواد والتطوير');
}

app.post('/api/register', upload.single('avatarFile'), (req, res) => {
    const { username, password, bio, avatarUrl } = req.body;
    let avatar = req.file ? '/uploads/' + req.file.filename : (avatarUrl || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + username);
    try {
        const stmt = db.prepare('INSERT INTO users (username, password, avatar, bio) VALUES (?, ?, ?, ?)');
        const info = stmt.run(username, password, avatar, bio || '');
        res.json({ success: true, user: { id: info.lastInsertRowid, username, avatar, bio } });
    } catch (e) {
        res.status(400).json({ success: false, message: 'اسم المستخدم مسجل مسبقاً' });
    }
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = db.prepare('SELECT id, username, avatar, bio FROM users WHERE username = ? AND password = ?').get(username, password);
    if (user) res.json({ success: true, user });
    else res.status(401).json({ success: false, message: 'بيانات الدخول غير صحيحة' });
});

app.post('/api/user/update', upload.single('avatarFile'), (req, res) => {
    const { userId, bio } = req.body;
    let avatarPath = req.file ? '/uploads/' + req.file.filename : req.body.avatarUrl;
    if (avatarPath) {
        db.prepare('UPDATE users SET bio = ?, avatar = ? WHERE id = ?').run(bio, avatarPath, userId);
    } else {
        db.prepare('UPDATE users SET bio = ? WHERE id = ?').run(bio, userId);
    }
    const updatedUser = db.prepare('SELECT id, username, avatar, bio FROM users WHERE id = ?').get(userId);
    res.json({ success: true, user: updatedUser });
});

app.get('/api/rooms', (req, res) => res.json(db.prepare('SELECT * FROM rooms').all()));
app.get('/api/messages/:roomId', (req, res) => res.json(db.prepare('SELECT * FROM messages WHERE room_id = ?').all(req.params.roomId)));

app.post('/api/upload', upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'خطأ بالرفع' });
    res.json({ imageUrl: '/uploads/' + req.file.filename });
});

io.on('connection', (socket) => {
    socket.on('join_room', (roomId) => socket.join('room_' + roomId));
    socket.on('send_message', (data) => {
        const stmt = db.prepare('INSERT INTO messages (room_id, user_id, username, avatar, content, image_url) VALUES (?, ?, ?, ?, ?, ?)');
        const info = stmt.run(data.room_id, data.user_id, data.username, data.avatar, data.content || '', data.image_url || '');
        io.to('room_' + data.room_id).emit('new_message', { ...data, id: info.lastInsertRowid });
    });
});

server.listen(3000, () => console.log('Server started on port 3000'));
