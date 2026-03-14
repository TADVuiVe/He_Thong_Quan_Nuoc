// ========================================================
// 1. KIỂM TRA BẢO MẬT & KHỞI TẠO BIẾN TOÀN CỤC
// ========================================================
const currentUser = JSON.parse(localStorage.getItem('currentUser'));

if (!currentUser) {
    alert('❌ BẠN CHƯA ĐĂNG NHẬP!');
    window.location.href = 'index.html';
}

document.getElementById('emp-name').innerText = currentUser.username;

document.getElementById('btn-logout').addEventListener('click', () => {
    if (confirm("Xác nhận đăng xuất ca làm việc?")) {
        localStorage.removeItem('currentUser');
        window.location.href = 'index.html';
    }
});

// TÍNH NĂNG MỚI: Tự động khôi phục Bàn đang phục vụ từ Local Storage
let tables = JSON.parse(localStorage.getItem('activeTables')) || [];

// Khôi phục lại bộ đếm ID để không bị trùng lặp khi tạo bàn mới
let uniqueIdCounter = tables.length > 0 ? Math.max(...tables.map(t => t.id)) + 1 : 1;
let currentActiveTableId = null;

// HÀM MỚI: Tự động lưu toàn bộ bàn đang ăn vào bộ nhớ tạm
function saveTablesToLocal() {
    localStorage.setItem('activeTables', JSON.stringify(tables));
}

// Các phần tử DOM hay dùng
const menuListEl = document.getElementById('menu-list');
const tableGridEl = document.getElementById('table-grid');
const instructionText = document.getElementById('menu-instruction');


// ========================================================
// 2. QUẢN LÝ THỰC ĐƠN (API)
// ========================================================
async function fetchMenuFromAPI() {
    try {
        const response = await fetch('http://localhost:5152/api/menu');
        menuData = await response.json();
        renderMenu();
    } catch (error) {
        console.error("Lỗi kết nối máy chủ:", error);
        alert("❌ Mất kết nối đến Máy chủ SQL!");
    }
}

document.getElementById('search-menu').addEventListener('input', (e) => {
    renderMenu(e.target.value.toLowerCase().trim());
});

function renderMenu(keyword = '') {
    menuListEl.innerHTML = '';
    const filteredMenu = menuData.filter(m => m.name.toLowerCase().includes(keyword));

    filteredMenu.forEach(item => {
        const div = document.createElement('div');
        div.className = `menu-item ${item.inStock ? '' : 'out-stock'}`;
        
        const stockStatus = item.inStock ? '' : '<small style="color:#e53e3e;">(Hết)</small>';
        div.innerHTML = `
            <span class="item-name">${item.name} ${stockStatus}</span>
            <span class="menu-price">${item.price.toLocaleString('vi-VN')}đ</span>
        `;
        
        div.onclick = () => {
            if (item.inStock) addToOrder(item);
        };
        menuListEl.appendChild(div);
    });
}


// ========================================================
// 3. QUẢN LÝ BÀN & GỌI MÓN
// ========================================================
function getNextAvailableTableNumber() {
    const used = tables.flatMap(t => t.tableNumbers);
    let num = 1;
    while (used.includes(num)) num++;
    return num;
}

function renumberEmptyTables() {
    const locked = tables.filter(t => t.orders.length > 0).flatMap(t => t.tableNumbers);
    const empty = tables.filter(t => t.orders.length === 0).sort((a, b) => Math.min(...a.tableNumbers) - Math.min(...b.tableNumbers));
    
    let target = 1;
    empty.forEach(t => {
        while (locked.includes(target)) target++;
        t.tableNumbers = [target];
        t.name = `Bàn ${target}`;
        target++;
    });
    
    tables.sort((a, b) => Math.min(...a.tableNumbers) - Math.min(...b.tableNumbers));
    saveTablesToLocal(); // Lưu sau khi đánh lại số bàn
}

document.getElementById('btn-add-table').addEventListener('click', () => {
    const nextNum = getNextAvailableTableNumber();
    tables.push({ 
        id: uniqueIdCounter++, 
        tableNumbers: [nextNum], 
        name: `Bàn ${nextNum}`, 
        orders: [] 
    });
    
    setActiveTable(uniqueIdCounter - 1);
    tables.sort((a, b) => Math.min(...a.tableNumbers) - Math.min(...b.tableNumbers));
    
    saveTablesToLocal(); // Lưu sau khi tạo bàn mới
    renderTables();
});

function setActiveTable(id) {
    currentActiveTableId = id;
    if (id !== null) {
        menuListEl.classList.remove('disabled-menu');
        instructionText.style.display = 'none';
    } else {
        menuListEl.classList.add('disabled-menu');
        instructionText.style.display = 'block';
    }
    renderTables();
}

function addToOrder(menuItem) {
    if (!currentActiveTableId) return;
    
    const table = tables.find(t => t.id === currentActiveTableId);
    const existing = table.orders.find(o => o.id === menuItem.id);
    
    if (existing) {
        existing.qty++;
    } else {
        table.orders.push({ ...menuItem, qty: 1, confirmedQty: 0 });
    }
    
    saveTablesToLocal(); // Lưu sau khi thêm món
    renderTables();
}

function updateQuantity(tableId, itemId, change, event) {
    event.stopPropagation();
    const table = tables.find(t => t.id === tableId);
    const orderIndex = table.orders.findIndex(o => o.id === itemId);
    const order = table.orders[orderIndex];

    if (change < 0 && order.qty <= order.confirmedQty) {
        return alert(`❌ Món "${order.name}" đã được xác nhận. Không thể hủy!`);
    }

    order.qty += change;
    if (order.qty <= 0) table.orders.splice(orderIndex, 1);
    if (table.orders.length === 0) renumberEmptyTables();
    
    saveTablesToLocal(); // Lưu sau khi tăng/giảm món
    renderTables();
}

function confirmOrders(tableId, event) {
    event.stopPropagation();
    const table = tables.find(t => t.id === tableId);
    let hasUnconfirmed = false;
    
    table.orders.forEach(o => {
        if (o.qty > (o.confirmedQty || 0)) {
            o.confirmedQty = o.qty;
            hasUnconfirmed = true;
        }
    });
    
    if (hasUnconfirmed) {
        saveTablesToLocal(); // Lưu sau khi Bếp xác nhận
        renderTables();
    }
}


// ========================================================
// 4. CHUYỂN BÀN, GỘP BÀN & XÓA BÀN
// ========================================================
function splitMergedTable(table) {
    if (table.tableNumbers.length > 1) {
        const extraNumbers = table.tableNumbers.slice(1);
        extraNumbers.forEach(num => {
            tables.push({
                id: uniqueIdCounter++,
                tableNumbers: [num],
                name: `Bàn ${num}`,
                orders: []
            });
        });
        table.tableNumbers = [table.tableNumbers[0]];
        table.name = `Bàn ${table.tableNumbers[0]}`;
    }
}

function deleteTable(id, event) {
    event.stopPropagation();
    const tableIndex = tables.findIndex(t => t.id === id);
    if (tableIndex === -1) return;
    
    const table = tables[tableIndex];
    if (table.orders.length > 0 && !confirm(`CẢNH BÁO: Bàn đang có khách!\nXác nhận xóa?`)) return;
    
    splitMergedTable(table);
    tables.splice(tables.findIndex(t => t.id === table.id), 1);
    renumberEmptyTables();
    
    if (currentActiveTableId === id) setActiveTable(null); 
    
    saveTablesToLocal(); // Lưu sau khi xóa bàn
    renderTables();
}

function moveOrMergeTable(sourceId, event, isMerge) {
    event.stopPropagation();
    const sourceTable = tables.find(t => t.id === sourceId);
    
    if (sourceTable.orders.length === 0) {
        return alert("Bàn đang trống, không có gì để chuyển!");
    }

    const actionName = isMerge ? "GỘP CHUNG với" : "CHUYỂN ĐẾN";
    const targetNumStr = prompt(`Đang thao tác [ ${sourceTable.name} ].\nNhập SỐ BÀN muốn ${actionName}:`);
    
    if (!targetNumStr) return;
    const targetNum = parseInt(targetNumStr);
    
    if (isNaN(targetNum) || targetNum <= 0 || sourceTable.tableNumbers.includes(targetNum)) {
        return alert("Số bàn không hợp lệ!");
    }

    let targetTable = tables.find(t => t.tableNumbers.includes(targetNum));

    if (isMerge) {
        if (!targetTable) return alert(`❌ Bàn ${targetNum} chưa được tạo! Để chuyển sang bàn trống, vui lòng dùng nút Mũi tên (➡️).`);
        targetTable.tableNumbers = [...targetTable.tableNumbers, ...sourceTable.tableNumbers].sort((a, b) => a - b);
        targetTable.name = "Bàn " + targetTable.tableNumbers.join(" + ");
    } else {
        if (targetTable && targetTable.orders.length > 0) {
            if (!confirm(`Bàn ${targetNum} ĐANG CÓ KHÁCH.\nXác nhận CHUYỂN toàn bộ món của [ ${sourceTable.name} ] sang [ Bàn ${targetNum} ]?\n(Tên Bàn ${targetNum} sẽ được giữ nguyên)`)) {
                return;
            }
        } else if (!targetTable) {
            targetTable = { id: uniqueIdCounter++, tableNumbers: [targetNum], name: `Bàn ${targetNum}`, orders: [] };
            tables.push(targetTable);
        }
    }

    sourceTable.orders.forEach(sourceOrder => {
        const sQty = sourceOrder.qty || 1;
        const sConf = sourceOrder.confirmedQty || 0;
        const existing = targetTable.orders.find(o => o.id === sourceOrder.id);
        
        if (existing) {
            existing.qty += sQty;
            existing.confirmedQty = (existing.confirmedQty || 0) + sConf;
        } else {
            targetTable.orders.push({ ...sourceOrder, qty: sQty, confirmedQty: sConf });
        }
    });

    if (isMerge) {
        tables = tables.filter(t => t.id !== sourceId);
    } else {
        sourceTable.orders = [];
    }

    renumberEmptyTables();
    setActiveTable(targetTable.id);
    
    saveTablesToLocal(); // Lưu sau khi chuyển/gộp bàn
}


// ========================================================
// 5. THANH TOÁN & GỌI API HÓA ĐƠN TỚI SQL
// ========================================================
function paySingleItem(tableId, itemId, event) {
    event.stopPropagation();
    const table = tables.find(t => t.id === tableId);
    const orderIndex = table.orders.findIndex(o => o.id === itemId);
    const item = table.orders[orderIndex];

    if (!item.confirmedQty || item.confirmedQty <= 0) {
        return alert(`❌ Món "${item.name}" chưa được xác nhận với Bếp. Không thể thanh toán!`);
    }

    const inputStr = prompt(`Thanh toán bao nhiêu phần "${item.name}"?\n(Lưu ý: Chỉ được thu tiền món ĐÃ XÁC NHẬN. Tối đa: ${item.confirmedQty})`, item.confirmedQty);
    if (!inputStr) return;
    
    const payQty = parseInt(inputStr);
    if (isNaN(payQty) || payQty <= 0 || payQty > item.confirmedQty) {
        return alert(`❌ Số lượng không hợp lệ! Bạn chỉ có thể thu tiền tối đa ${item.confirmedQty} phần đã chốt.`);
    }

    const payTotal = item.price * payQty;

    if (confirm(`Xác nhận thu ${payTotal.toLocaleString('vi-VN')}đ cho ${payQty} phần "${item.name}"?`)) {
        
        // MẸO: Tương lai bạn có thể viết API thu tiền lẻ món gửi xuống SQL ở đây
        
        if (payQty === item.qty) {
            table.orders.splice(orderIndex, 1);
        } else {
            item.qty -= payQty;
            item.confirmedQty -= payQty;
        }

        if (table.orders.length === 0) {
            splitMergedTable(table);
            renumberEmptyTables();
        }
        
        saveTablesToLocal(); // Lưu lại sau khi khách trả tiền 1 phần
        renderTables();
    }
}

async function checkoutTable(id, event) {
    event.stopPropagation();
    const table = tables.find(t => t.id === id);
    const hasUnconfirmed = table.orders.some(o => o.qty > (o.confirmedQty || 0));
    
    if (hasUnconfirmed) {
        return alert("❌ Bàn này đang có món CHƯA XÁC NHẬN. Vui lòng ấn Xác Nhận Món trước khi thanh toán!");
    }

    const total = table.orders.reduce((sum, item) => sum + (item.price * item.qty), 0);

    if (confirm(`Thanh toán toàn bộ ${total.toLocaleString('vi-VN')}đ cho ${table.name}?`)) {
        const invoicePayload = {
            TableName: table.name,
            TotalAmount: total,
            Items: table.orders.map(o => ({
                ItemName: o.name,
                Quantity: o.qty,
                Price: o.price
            }))
        };

        try {
            const response = await fetch('http://localhost:5152/api/invoices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(invoicePayload)
            });

            if (response.ok) {
                alert("✅ Hóa đơn đã được lưu vào CƠ SỞ DỮ LIỆU SQL!");
                
                // Giải phóng bàn sau khi tính tiền
                table.orders = [];
                splitMergedTable(table);
                renumberEmptyTables();
                
                saveTablesToLocal(); // Lưu trạng thái bàn trống lại
                renderTables();
            }
        } catch (error) {
            alert("❌ Lỗi mất kết nối! Không thể lưu hóa đơn.");
        }
    }
}


// ========================================================
// 6. RENDER GIAO DIỆN BÀN
// ========================================================
function renderTables() {
    tableGridEl.innerHTML = '';
    
    tables.forEach(table => {
        const total = table.orders.reduce((sum, item) => sum + (item.price * item.qty), 0);
        let orderHTML = '';
        let hasUnconfirmed = false;

        if (table.orders.length === 0) {
            orderHTML = '<div class="empty-state">Bàn trống</div>';
        } else {
            table.orders.forEach(order => {
                const confQty = order.confirmedQty || 0;
                const newQty = order.qty - confQty;
                if (newQty > 0) hasUnconfirmed = true;

                let newBadge = newQty > 0 ? `<span class="new-badge">New +${newQty}</span>` : '';
                let confirmedBadge = confQty > 0 ? `<span class="confirmed-badge">Đã chốt: ${confQty}</span>` : '';

                let minusBtnHTML = '';
                if (order.qty > confQty) {
                    minusBtnHTML = `<button class="qty-btn" onclick="updateQuantity(${table.id}, '${order.id}', -1, event)">-</button>`;
                } else {
                    minusBtnHTML = `<div style="width: 26px;"></div>`;
                }

                let payBtnHTML = confQty > 0 
                    ? `<button class="btn-pay-item" onclick="paySingleItem(${table.id}, '${order.id}', event)">💰 Thu</button>`
                    : `<button class="btn-pay-item" style="background:#a0aec0; cursor:not-allowed;" title="Vui lòng xác nhận món trước" onclick="event.stopPropagation(); alert('❌ Vui lòng Xác nhận món trước khi thu tiền!')">💰 Thu</button>`;

                orderHTML += `
                    <li class="order-item">
                        <div class="order-top">
                            <span style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                                ${order.name} 
                                ${newBadge}
                                ${confirmedBadge}
                            </span>
                            <span>${(order.price * order.qty).toLocaleString('vi-VN')}đ</span>
                        </div>
                        <div class="order-controls">
                            <div class="qty-group">
                                ${minusBtnHTML}
                                <span class="qty-text">${order.qty}</span>
                                <button class="qty-btn" onclick="updateQuantity(${table.id}, '${order.id}', 1, event)">+</button>
                            </div>
                            ${payBtnHTML}
                        </div>
                    </li>
                `;
            });
        }

        const card = document.createElement('div');
        card.className = `table-card ${currentActiveTableId === table.id ? 'active' : ''}`;
        
        let confirmBtnHTML = '';
        if (table.orders.length > 0) {
            const btnState = !hasUnconfirmed ? 'disabled' : '';
            const btnText = hasUnconfirmed ? '🔔 Xác Nhận Món' : '✅ Đã Xác Nhận Hết';
            confirmBtnHTML = `<button class="btn-confirm" ${btnState} onclick="confirmOrders(${table.id}, event)">${btnText}</button>`;
        }

        const checkoutBtnState = (table.orders.length === 0 || hasUnconfirmed) ? 'disabled' : '';

        card.innerHTML = `
            <div class="table-header" onclick="setActiveTable(${table.id})">
                <span>${table.name}</span>
                <div>
                    <button class="btn-icon" title="Chuyển Bàn" onclick="moveOrMergeTable(${table.id}, event, false)">➡️</button>
                    <button class="btn-icon" title="Gộp Bàn" onclick="moveOrMergeTable(${table.id}, event, true)">🔗</button>
                    <button class="btn-icon del" title="Xóa Bàn" onclick="deleteTable(${table.id}, event)">✖</button>
                </div>
            </div>
            <div class="table-body" onclick="setActiveTable(${table.id})">
                <ul class="order-list">${orderHTML}</ul>
            </div>
            <div class="table-footer">
                <div class="total-text">
                    <span>Tổng:</span>
                    <span>${total.toLocaleString('vi-VN')}đ</span>
                </div>
                ${confirmBtnHTML}
                <button class="btn-success" ${checkoutBtnState} onclick="checkoutTable(${table.id}, event)">
                    Thanh Toán Hóa Đơn
                </button>
            </div>
        `;
        tableGridEl.appendChild(card);
    });
}


// ========================================================
// 7. KHỞI CHẠY KHI MỞ TRANG
// ========================================================
fetchMenuFromAPI();
renderTables(); // Vẽ lại các bàn đang ăn từ Local Storage ngay khi vừa load web