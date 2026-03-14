// Gỡ bỏ hoàn toàn initSystem() lưu localStorage cũ
localStorage.removeItem('currentUser'); 

document.getElementById('login-form').addEventListener('submit', async function(e) {
    e.preventDefault(); 
    
    const user = document.getElementById('login-user').value.trim();
    const pass = document.getElementById('login-pass').value.trim();
    const msgEl = document.getElementById('login-msg');

    try {
        // Gửi thông tin đăng nhập lên SQL Server kiểm tra
        const response = await fetch('http://localhost:5152/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ Username: user, Password: pass })
        });

        if (response.ok) {
            const data = await response.json();
            
            // Đăng nhập đúng: Lưu "thẻ thông hành" vào Web và chuyển trang
            localStorage.setItem('currentUser', JSON.stringify({
                username: data.username,
                role: data.role
            }));
            
            window.location.href = data.role === 'admin' ? 'management.html' : 'shop.html';       
        } else {
            const error = await response.json();
            msgEl.textContent = `❌ ${error.message}`;
            msgEl.className = 'msg error';
        }
    } catch (err) {
        msgEl.textContent = '❌ Lỗi kết nối đến máy chủ C#!';
        msgEl.className = 'msg error';
    }
});