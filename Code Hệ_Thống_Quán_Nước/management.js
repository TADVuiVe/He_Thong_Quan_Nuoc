// ==========================================
// 1. BẢO VỆ AN NINH & ĐIỀU HƯỚNG TAB
// ==========================================
const currentUser = JSON.parse(localStorage.getItem('currentUser'));

// Chặn truy cập nếu không phải Admin
if (!currentUser || currentUser.role !== 'admin') {
    alert('❌ BẠN KHÔNG CÓ QUYỀN TRUY CẬP TRANG QUẢN TRỊ!');
    window.location.href = 'index.html';
}

document.getElementById('admin-name').innerText = currentUser.username;

document.getElementById('btn-logout').addEventListener('click', () => {
    if(confirm("Xác nhận đăng xuất?")) {
        localStorage.removeItem('currentUser');
        window.location.href = 'index.html';
    }
});

// Hàm chuyển Tab
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.nav-menu li').forEach(li => li.classList.remove('active'));
    
    document.getElementById(tabId).classList.add('active');
    event.currentTarget.classList.add('active');
}

function setTodayDate() {
    const dateInput = document.getElementById('stat-date');
    if (dateInput) {
        const today = new Date().toISOString().split('T')[0];
        dateInput.value = today;
    }
}


// ==========================================
// 2. THỐNG KÊ DOANH THU & TOP 5 (DASHBOARD)
// ==========================================
let revenueChart = null; 

async function loadRevenueSummary() {
    try {
        const response = await fetch('http://localhost:5152/api/revenue/summary');
        const data = await response.json();
        
        document.getElementById('val-today').innerText = data.today.toLocaleString('vi-VN');
        document.getElementById('val-week').innerText = data.week.toLocaleString('vi-VN');
        document.getElementById('val-month').innerText = data.month.toLocaleString('vi-VN');
        document.getElementById('val-year').innerText = data.year.toLocaleString('vi-VN');
    } catch (error) { console.error("Lỗi tải tổng doanh thu", error); }
}

async function loadRevenueFromAPI() {
    try {
        const response = await fetch('http://localhost:5152/api/revenue');
        const data = await response.json();

        const labels = data.map(item => item.date);   
        const totals = data.map(item => item.total);  

        renderRevenueChart(labels, totals);
    } catch (error) { console.error("Lỗi tải biểu đồ:", error); }
}

function renderRevenueChart(labels, data) {
    const ctx = document.getElementById('revenueChart').getContext('2d');
    if (revenueChart) revenueChart.destroy();

    revenueChart = new Chart(ctx, {
        type: 'bar', 
        data: {
            labels: labels,
            datasets: [{
                label: 'Doanh thu theo ngày (VNĐ)',
                data: data,
                backgroundColor: '#4361ee', 
                borderRadius: 4
            }]
        },
        options: { responsive: true, scales: { y: { beginAtZero: true } } }
    });
}

async function loadTop5FromAPI() {
    try {
        const response = await fetch('http://localhost:5152/api/revenue/top5');
        const data = await response.json();
        
        const ul = document.getElementById('top5-list');
        ul.innerHTML = ''; 
        
        if (data.length === 0) {
            ul.innerHTML = '<li style="padding: 10px; color: gray;">Chưa có dữ liệu bán hàng.</li>';
            return;
        }

        data.forEach((item, index) => {
            ul.innerHTML += `
                <li style="display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px dashed #ccc;">
                    <span><strong style="color: #ef233c; margin-right: 10px;">#${index + 1}</strong> ${item.name}</span>
                    <strong style="color: #4361ee;">${item.qty} ly</strong>
                </li>
            `;
        });
    } catch (error) { console.error("Lỗi tải Top 5", error); }
}

async function resetTop5() {
    if (!confirm("Bạn có chắc muốn làm mới Bảng xếp hạng Top 5? (Doanh thu tổng vẫn sẽ được giữ nguyên)")) return;
    try {
        const response = await fetch('http://localhost:5152/api/revenue/reset-top5', { method: 'PUT' });
        if (response.ok) {
            alert("✅ Đã làm mới bảng xếp hạng! Bắt đầu đếm lại từ số 0.");
            loadTop5FromAPI(); 
        }
    } catch (error) { alert("❌ Lỗi kết nối!"); }
}


// ==========================================
// 3. QUẢN LÝ THỰC ĐƠN (KHO HÀNG)
// ==========================================
let adminMenuData = [];

async function loadAdminMenuFromAPI() {
    try {
        const response = await fetch('http://localhost:5152/api/menu'); 
        adminMenuData = await response.json();
        renderMenuManager(adminMenuData);
    } catch (error) { console.error("Lỗi kết nối:", error); }
}

function renderMenuManager(menuList) {
    const tbody = document.getElementById('menu-tbody');
    tbody.innerHTML = '';

    menuList.forEach(item => {
        tbody.innerHTML += `
            <tr style="${item.inStock ? '' : 'opacity: 0.6; background: #f8f9fa;'}">
                <td>#${item.id}</td>
                <td><strong>${item.name}</strong></td>
                <td>${item.price.toLocaleString('vi-VN')}đ</td>
                <td>
                    <button class="btn btn-toggle ${item.inStock ? '' : 'out'}" onclick="toggleStock('${item.id}')">
                        ${item.inStock ? '✅ Đang bán' : '❌ Hết hàng'}
                    </button>
                </td>
                <td><i>Cập nhật qua SQL</i></td>
            </tr>
        `;
    });
}

async function toggleStock(id) {
    try {
        const response = await fetch(`http://localhost:5152/api/menu/${id}`, { method: 'PUT' });
        if (response.ok) loadAdminMenuFromAPI(); 
    } catch (error) { alert("❌ Lỗi cập nhật trạng thái!"); }
}

// Bắt sự kiện nút Thêm Sản Phẩm
document.getElementById('btn-add-item').addEventListener('click', async () => {
    const name = prompt("Nhập TÊN sản phẩm mới (VD: Trà Đào):");
    if(!name) return;
    
    if(adminMenuData.some(m => m.name.toLowerCase() === name.trim().toLowerCase())) {
        return alert("❌ Sản phẩm này đã tồn tại trong kho!");
    }

    const price = parseInt(prompt("Nhập GIÁ BÁN (chỉ ghi số, VD: 35000):"));
    if(isNaN(price) || price <= 0) return alert("❌ Giá không hợp lệ!");

    const newItem = {
        Id: 'm' + Date.now(), 
        Name: name.trim(),
        Price: price,
        InStock: true
    };

    try {
        const response = await fetch('http://localhost:5152/api/menu', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newItem)
        });

        if (response.ok) {
            alert("✅ Đã thêm món mới vào Cơ sở dữ liệu!");
            loadAdminMenuFromAPI(); 
        }
    } catch (error) { alert("❌ Lỗi không thể lưu vào SQL Server!"); }
});


// ==========================================
// 4. QUẢN LÝ TÀI KHOẢN NHÂN VIÊN
// ==========================================
async function loadUsersFromAPI() {
    try {
        const response = await fetch('http://localhost:5152/api/users');
        const users = await response.json();
        
        const tbody = document.getElementById('account-tbody');
        tbody.innerHTML = '';

        users.forEach(u => {
            const roleText = u.role === 'admin' ? '<span style="color:red;font-weight:bold;">Admin</span>' : 'Nhân viên';
            const btnDelete = u.username.toLowerCase() === 'admin123' 
                ? `<span style="color:gray">Mặc định</span>` 
                : `<button class="btn" style="background:#ef233c; padding: 5px 10px; color: white; border: none; border-radius: 4px; cursor: pointer;" onclick="deleteAccountAPI('${u.username}')">Xóa</button>`;

            tbody.innerHTML += `
                <tr>
                    <td><strong>${u.username}</strong></td>
                    <td>${roleText}</td>
                    <td>${btnDelete}</td>
                </tr>
            `;
        });
    } catch (err) { console.error("Lỗi tải User"); }
}

async function createNewAccount() {
    const user = document.getElementById('new-emp-user').value.trim();
    const pass = document.getElementById('new-emp-pass').value.trim();
    const role = document.getElementById('new-emp-role').value;

    if (!user || !pass) return alert("❌ Vui lòng nhập đầy đủ!");

    try {
        const response = await fetch('http://localhost:5152/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ Username: user, Password: pass, Role: role })
        });

        if (response.ok) {
            alert(`✅ Cấp tài khoản ${user} thành công!`);
            document.getElementById('new-emp-user').value = '';
            document.getElementById('new-emp-pass').value = '';
            loadUsersFromAPI(); 
        } else {
            const err = await response.json();
            alert(`❌ ${err.message}`);
        }
    } catch (e) { alert("Lỗi máy chủ!"); }
}

async function deleteAccountAPI(username) {
    if(!confirm(`Bạn chắc chắn muốn xóa tài khoản "${username}" khỏi hệ thống?`)) return;
    
    try {
        const response = await fetch(`http://localhost:5152/api/users/${username}`, { method: 'DELETE' });
        if(response.ok) {
            alert("Đã xóa!");
            loadUsersFromAPI();
        }
    } catch (e) { alert("Lỗi xóa!"); }
}


// ==========================================
// 5. KHỞI CHẠY HỆ THỐNG KHI MỞ TRANG
// ==========================================
// Các hàm này sẽ tự động chạy để kéo dữ liệu từ SQL lên ngay khi Admin mở web
setTodayDate();
loadRevenueSummary();
loadRevenueFromAPI();
loadTop5FromAPI();
loadAdminMenuFromAPI();
loadUsersFromAPI();