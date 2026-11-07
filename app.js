const socket = io();
let currentUser = null;
let currentRoomId = null;
let roomsData = [];

function switchAuthTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    if (tab === 'login') {
        document.getElementById('tabLoginBtn').classList.add('active');
        document.getElementById('loginForm').classList.remove('hidden');
        document.getElementById('regForm').classList.add('hidden');
    } else {
        document.getElementById('tabRegBtn').classList.add('active');
        document.getElementById('regForm').classList.remove('hidden');
        document.getElementById('loginForm').classList.add('hidden');
    }
}

function previewAvatar(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = e => {
            const img = document.getElementById('avatarPreview');
            img.src = e.target.result;
            img.classList.remove('hidden');
        };
        reader.readAsDataURL(input.files[0]);
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('loginUser').value;
    const password = document.getElementById('loginPass').value;

    const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.success) { currentUser = data.user; launchApp(); }
    else alert(data.message);
}

async function handleRegister(e) {
    e.preventDefault();
    const formData = new FormData();
    formData.append('username', document.getElementById('regUser').value);
    formData.append('password', document.getElementById('regPass').value);
    formData.append('bio', document.getElementById('regBio').value);
    const avatarFile = document.getElementById('regAvatarFile').files[0];
    if (avatarFile) formData.append('avatarFile', avatarFile);

    const res = await fetch('/api/register', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.success) { currentUser = data.user; launchApp(); }
    else alert(data.message);
}

function launchApp() {
    document.getElementById('authView').classList.remove('active');
    document.getElementById('appView').classList.add('active');
    updateProfileUI();
    loadRooms();
}

function switchScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
    if (screenId === 'homeScreen') document.getElementById('navHome').classList.add('active');
    if (screenId === 'profileScreen') document.getElementById('navProfile').classList.add('active');
}

function updateProfileUI() {
    document.getElementById('profileAvatar').src = currentUser.avatar;
    document.getElementById('profileUsername').innerText = currentUser.username;
    document.getElementById('profileBio').innerText = currentUser.bio || 'لا توجد نبذة';
}

async function handleUpdateProfile(e) {
    e.preventDefault();
    const formData = new FormData();
    formData.append('userId', currentUser.id);
    formData.append('bio', document.getElementById('updateBioInput').value);
    const file = document.getElementById('updateAvatarFile').files[0];
    if (file) formData.append('avatarFile', file);

    const res = await fetch('/api/user/update', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.success) { currentUser = data.user; updateProfileUI(); alert('تم التحديث بنجاح'); }
}

function logout() {
    currentUser = null;
    document.getElementById('appView').classList.remove('active');
    document.getElementById('authView').classList.add('active');
}

async function loadRooms() {
    const res = await fetch('/api/rooms');
    roomsData = await res.json();
    renderRooms(roomsData);
    if (roomsData.length > 0) selectRoom(roomsData[0].id, roomsData[0].name);
}

function renderRooms(list) {
    const container = document.getElementById('roomsList');
    container.innerHTML = '';
    list.forEach(r => {
        const item = document.createElement('div');
        item.className = `room-item ${r.id === currentRoomId ? 'active' : ''}`;
        item.onclick = () => selectRoom(r.id, r.name);
        item.innerHTML = `<div class="room-icon">${r.icon || '💬'}</div><div><div class="room-name">${r.name}</div></div>`;
        container.appendChild(item);
    });
}

async function selectRoom(roomId, roomName) {
    currentRoomId = roomId;
    document.getElementById('activeRoomName').innerText = roomName;
    socket.emit('join_room', roomId);
    renderRooms(roomsData);
    const res = await fetch(`/api/messages/${roomId}`);
    const messages = await res.json();
    const box = document.getElementById('messagesBox');
    box.innerHTML = '';
    messages.forEach(renderSingleMessage);
    box.scrollTop = box.scrollHeight;
}

function renderSingleMessage(msg) {
    const box = document.getElementById('messagesBox');
    const isMe = msg.user_id === currentUser.id;
    const row = document.createElement('div');
    row.className = `msg-row ${isMe ? 'me' : ''}`;
    let imgHTML = msg.image_url ? `<br><img src="${msg.image_url}" class="msg-img">` : '';
    row.innerHTML = `<img class="msg-avatar" src="${msg.avatar}"><div class="msg-bubble"><div class="msg-author">${msg.username}</div><div>${msg.content || ''}</div>${imgHTML}</div>`;
    box.appendChild(row);
    box.scrollTop = box.scrollHeight;
}

async function sendMessage(e) {
    e.preventDefault();
    const input = document.getElementById('msgInput');
    const content = input.value.trim();
    if (!content || !currentRoomId) return;
    socket.emit('send_message', { room_id: currentRoomId, user_id: currentUser.id, username: currentUser.username, avatar: currentUser.avatar, content });
    input.value = '';
}

async function sendImageMsg(input) {
    if (!input.files || !input.files[0] || !currentRoomId) return;
    const formData = new FormData();
    formData.append('image', input.files[0]);
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.imageUrl) {
        socket.emit('send_message', { room_id: currentRoomId, user_id: currentUser.id, username: currentUser.username, avatar: currentUser.avatar, content: '', image_url: data.imageUrl });
    }
}

socket.on('new_message', msg => { if (msg.room_id === currentRoomId) renderSingleMessage(msg); });

function filterContent() {
    const q = document.getElementById('searchInput').value.toLowerCase();
    renderRooms(roomsData.filter(r => r.name.toLowerCase().includes(q)));
}
