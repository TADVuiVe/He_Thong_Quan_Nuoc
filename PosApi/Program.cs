using Microsoft.Data.SqlClient;

var builder = WebApplication.CreateBuilder(args);

// Bật tính năng CORS 
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll",
        policy => policy.AllowAnyOrigin()
                        .AllowAnyMethod()
                        .AllowAnyHeader());
});

var app = builder.Build();
app.UseCors("AllowAll");

string connectionString = builder.Configuration.GetConnectionString("DefaultConnection") ?? "";

// ==========================================
// PHẦN 1: API QUẢN LÝ THỰC ĐƠN (MENU)
// ==========================================
app.MapGet("/api/menu", () =>
{
    var menuList = new List<object>();
    using (SqlConnection conn = new SqlConnection(connectionString))
    {
        conn.Open();
        string sql = "SELECT ID, Name, Price, InStock FROM MenuItems";
        using (SqlCommand cmd = new SqlCommand(sql, conn))
        {
            using (SqlDataReader reader = cmd.ExecuteReader())
            {
                while (reader.Read())
                {
                    menuList.Add(new
                    {
                        // Thêm ?? "" để vá lỗi CS8604
                        id = reader["ID"].ToString() ?? "",
                        name = reader["Name"].ToString() ?? "",
                        price = Convert.ToInt32(reader["Price"]),
                        inStock = Convert.ToBoolean(reader["InStock"])
                    });
                }
            }
        }
    }
    return Results.Ok(menuList);
});

app.MapPost("/api/menu", (MenuItem item) =>
{
    using (SqlConnection conn = new SqlConnection(connectionString))
    {
        conn.Open();
        string sql = "INSERT INTO MenuItems (ID, Name, Price, InStock) VALUES (@id, @name, @price, @inStock)";
        using (SqlCommand cmd = new SqlCommand(sql, conn))
        {
            cmd.Parameters.AddWithValue("@id", item.Id);
            cmd.Parameters.AddWithValue("@name", item.Name);
            cmd.Parameters.AddWithValue("@price", item.Price);
            cmd.Parameters.AddWithValue("@inStock", item.InStock ? 1 : 0);
            cmd.ExecuteNonQuery(); 
        }
    }
    return Results.Ok(new { message = "Thêm món thành công!" });
});

app.MapPut("/api/menu/{id}", (string id) =>
{
    using (SqlConnection conn = new SqlConnection(connectionString))
    {
        conn.Open();
        string sql = "UPDATE MenuItems SET InStock = ~InStock WHERE ID = @id";
        using (SqlCommand cmd = new SqlCommand(sql, conn))
        {
            cmd.Parameters.AddWithValue("@id", id);
            cmd.ExecuteNonQuery(); 
        }
    }
    return Results.Ok(new { message = "Cập nhật trạng thái thành công!" });
});

// ==========================================
// PHẦN 2: API QUẢN LÝ HÓA ĐƠN
// ==========================================
app.MapPost("/api/invoices", (InvoiceDTO invoice) =>
{
    using (SqlConnection conn = new SqlConnection(connectionString))
    {
        conn.Open();
        string sqlInvoice = "INSERT INTO Invoices (TableName, TotalAmount) OUTPUT INSERTED.InvoiceID VALUES (@tableName, @totalAmount)";
        int newInvoiceId = 0;

        using (SqlCommand cmd = new SqlCommand(sqlInvoice, conn))
        {
            cmd.Parameters.AddWithValue("@tableName", invoice.TableName);
            cmd.Parameters.AddWithValue("@totalAmount", invoice.TotalAmount);
            newInvoiceId = (int)cmd.ExecuteScalar(); 
        }

        if (invoice.Items != null && invoice.Items.Count > 0)
        {
            string sqlDetails = "INSERT INTO InvoiceDetails (InvoiceID, ItemName, Quantity, Price) VALUES (@invId, @name, @qty, @price)";
            foreach (var item in invoice.Items)
            {
                using (SqlCommand cmdDetail = new SqlCommand(sqlDetails, conn))
                {
                    cmdDetail.Parameters.AddWithValue("@invId", newInvoiceId);
                    cmdDetail.Parameters.AddWithValue("@name", item.ItemName);
                    cmdDetail.Parameters.AddWithValue("@qty", item.Quantity);
                    cmdDetail.Parameters.AddWithValue("@price", item.Price);
                    cmdDetail.ExecuteNonQuery();
                }
            }
        }
    }
    return Results.Ok(new { message = "Đã lưu hóa đơn thành công!" });
});

// ==========================================
// PHẦN 3: API QUẢN LÝ TÀI KHOẢN (NHÂN VIÊN)
// ==========================================
app.MapPost("/api/login", (LoginDTO login) =>
{
    using (SqlConnection conn = new SqlConnection(connectionString))
    {
        conn.Open();
        string sql = "SELECT Role FROM Users WHERE Username = @user AND Password = @pass";
        using (SqlCommand cmd = new SqlCommand(sql, conn))
        {
            cmd.Parameters.AddWithValue("@user", login.Username);
            cmd.Parameters.AddWithValue("@pass", login.Password);
            
            using (SqlDataReader reader = cmd.ExecuteReader())
            {
                if (reader.Read()) 
                {
                    return Results.Ok(new { success = true, username = login.Username, role = reader["Role"].ToString() });
                }
            }
        }
    }
    return Results.BadRequest(new { success = false, message = "Sai tài khoản hoặc mật khẩu!" });
});

app.MapGet("/api/users", () =>
{
    var users = new List<UserResponseDTO>();
    using (SqlConnection conn = new SqlConnection(connectionString))
    {
        conn.Open();
        using (SqlCommand cmd = new SqlCommand("SELECT Username, Role FROM Users", conn))
        {
            using (SqlDataReader reader = cmd.ExecuteReader())
            {
                while (reader.Read()) 
                {
                    // Thêm ?? "" để vá lỗi CS8604
                    users.Add(new UserResponseDTO(
                        reader["Username"].ToString() ?? "", 
                        reader["Role"].ToString() ?? ""
                    ));
                }
            }
        }
    }
    return Results.Ok(users);
});

app.MapPost("/api/users", (CreateUserDTO newUser) =>
{
    using (SqlConnection conn = new SqlConnection(connectionString))
    {
        conn.Open();
        string checkSql = "SELECT COUNT(1) FROM Users WHERE Username = @user";
        using (SqlCommand checkCmd = new SqlCommand(checkSql, conn))
        {
            checkCmd.Parameters.AddWithValue("@user", newUser.Username);
            if ((int)checkCmd.ExecuteScalar() > 0) return Results.BadRequest(new { message = "Tài khoản đã tồn tại!" });
        }

        string sql = "INSERT INTO Users (Username, Password, Role) VALUES (@user, @pass, @role)";
        using (SqlCommand cmd = new SqlCommand(sql, conn))
        {
            cmd.Parameters.AddWithValue("@user", newUser.Username);
            cmd.Parameters.AddWithValue("@pass", newUser.Password);
            cmd.Parameters.AddWithValue("@role", newUser.Role);
            cmd.ExecuteNonQuery();
        }
    }
    return Results.Ok(new { message = "Tạo tài khoản thành công!" });
});

app.MapDelete("/api/users/{username}", (string username) =>
{
    if (username.ToLower() == "admin123") return Results.BadRequest(new { message = "Không được xóa Admin gốc!" });
    
    using (SqlConnection conn = new SqlConnection(connectionString))
    {
        conn.Open();
        using (SqlCommand cmd = new SqlCommand("DELETE FROM Users WHERE Username = @user", conn))
        {
            cmd.Parameters.AddWithValue("@user", username);
            cmd.ExecuteNonQuery();
        }
    }
    return Results.Ok(new { message = "Đã xóa!" });
});

// ==========================================
// PHẦN 5: API THỐNG KÊ DOANH THU THEO NGÀY
// ==========================================
app.MapGet("/api/revenue", () =>
{
    var revenueList = new List<DailyRevenueDTO>();
    using (SqlConnection conn = new SqlConnection(connectionString))
    {
        conn.Open();
        // Gom nhóm (GROUP BY) hóa đơn theo ngày và tính Tổng tiền (SUM)
        string sql = @"
            SELECT 
                CONVERT(VARCHAR(10), CheckoutTime, 103) as DateString,
                SUM(TotalAmount) as Total,
                CAST(CheckoutTime AS DATE) as SortDate
            FROM Invoices 
            GROUP BY CONVERT(VARCHAR(10), CheckoutTime, 103), CAST(CheckoutTime AS DATE)
            ORDER BY SortDate";
            
        using (SqlCommand cmd = new SqlCommand(sql, conn))
        {
            using (SqlDataReader reader = cmd.ExecuteReader())
            {
                while (reader.Read())
                {
                    revenueList.Add(new DailyRevenueDTO(
                        reader["DateString"].ToString() ?? "",
                        Convert.ToInt32(reader["Total"])
                    ));
                }
            }
        }
    }
    return Results.Ok(revenueList);
});

// 11. API TÍNH TỔNG DOANH THU 4 MỐC THỜI GIAN
app.MapGet("/api/revenue/summary", () =>
{
    using (SqlConnection conn = new SqlConnection(connectionString))
    {
        conn.Open();
        // THỦ THUẬT: Lùi thời gian đi 6 tiếng (DATEADD). 
        // Ví dụ: 5h59' sáng hôm nay lùi 6 tiếng sẽ lọt về ngày hôm qua => Chốt ca hoàn hảo!
        string sql = @"
            SELECT 
                ISNULL(SUM(CASE WHEN CAST(DATEADD(hour, -6, CheckoutTime) AS DATE) = CAST(DATEADD(hour, -6, GETDATE()) AS DATE) THEN TotalAmount ELSE 0 END), 0) AS Today,
                ISNULL(SUM(CASE WHEN DATEPART(wk, DATEADD(hour, -6, CheckoutTime)) = DATEPART(wk, DATEADD(hour, -6, GETDATE())) AND YEAR(DATEADD(hour, -6, CheckoutTime)) = YEAR(DATEADD(hour, -6, GETDATE())) THEN TotalAmount ELSE 0 END), 0) AS Week,
                ISNULL(SUM(CASE WHEN MONTH(DATEADD(hour, -6, CheckoutTime)) = MONTH(DATEADD(hour, -6, GETDATE())) AND YEAR(DATEADD(hour, -6, CheckoutTime)) = YEAR(DATEADD(hour, -6, GETDATE())) THEN TotalAmount ELSE 0 END), 0) AS Month,
                ISNULL(SUM(CASE WHEN YEAR(DATEADD(hour, -6, CheckoutTime)) = YEAR(DATEADD(hour, -6, GETDATE())) THEN TotalAmount ELSE 0 END), 0) AS Year
            FROM Invoices";
        
        using (SqlCommand cmd = new SqlCommand(sql, conn))
        {
            using (SqlDataReader reader = cmd.ExecuteReader())
            {
                if (reader.Read()) return Results.Ok(new RevenueSummaryDTO(Convert.ToInt32(reader["Today"]), Convert.ToInt32(reader["Week"]), Convert.ToInt32(reader["Month"]), Convert.ToInt32(reader["Year"])));
            }
        }
    }
    return Results.Ok(new RevenueSummaryDTO(0, 0, 0, 0));
});
// 12. API LẤY TOP 5 MÓN BÁN CHẠY NHẤT TRONG THÁNG
app.MapGet("/api/revenue/top5", () =>
{
    var topList = new List<object>();
    using (SqlConnection conn = new SqlConnection(connectionString))
    {
        conn.Open();
        // Lấy tất cả các món chưa bị lột tem (IsTop5 = 1)
        string sql = @"
            SELECT TOP 5 d.ItemName, SUM(d.Quantity) as TotalQty
            FROM InvoiceDetails d
            JOIN Invoices i ON d.InvoiceID = i.InvoiceID
            WHERE d.IsTop5 = 1
            GROUP BY d.ItemName
            ORDER BY TotalQty DESC";
            
        using (SqlCommand cmd = new SqlCommand(sql, conn))
        {
            using (SqlDataReader reader = cmd.ExecuteReader())
            {
                while (reader.Read()) topList.Add(new { name = reader["ItemName"].ToString(), qty = Convert.ToInt32(reader["TotalQty"]) });
            }
        }
    }
    return Results.Ok(topList);
});
app.MapPut("/api/revenue/reset-top5", () =>
{
    using (SqlConnection conn = new SqlConnection(connectionString))
    {
        conn.Open();
        // Lột tem tất cả các món trước đó thành 0
        using (SqlCommand cmd = new SqlCommand("UPDATE InvoiceDetails SET IsTop5 = 0", conn))
        {
            cmd.ExecuteNonQuery();
        }
    }
    return Results.Ok(new { message = "Đã làm mới Top 5!" });
});
app.Run();

// ==========================================
// PHẦN 4: KHAI BÁO CẤU TRÚC DỮ LIỆU (DTO)
// ==========================================
public record MenuItem(string Id, string Name, int Price, bool InStock);
public record InvoiceItemDTO(string ItemName, int Quantity, int Price);
public record InvoiceDTO(string TableName, int TotalAmount, List<InvoiceItemDTO> Items);
public record LoginDTO(string Username, string Password);
public record CreateUserDTO(string Username, string Password, string Role);
public record UserResponseDTO(string Username, string Role);
public record DailyRevenueDTO(string Date, int Total);
public record RevenueSummaryDTO(int Today, int Week, int Month, int Year);