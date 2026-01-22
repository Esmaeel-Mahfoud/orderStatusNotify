import { Client, Databases } from "node-appwrite";
import { Expo } from "expo-server-sdk";

const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT)
  .setProject(process.env.APPWRITE_PROJECT)
  .setKey(process.env.APPWRITE_KEY);

const databases = new Databases(client);
const expo = new Expo();

// 🧑‍🍳 IDs الموظفين
const EMPLOYEE_IDS = [
  "6971ed0e000b7f7fac20",
  // أضف موظفين لاحقًا هنا
];

export default async ({ req, res, log, error }) => {
  try {
    const body = JSON.parse(req.body || "{}");
    const { orderId, newStatus } = body;

    if (!orderId || !newStatus) {
      return res.json({ success: false, error: "Missing parameters" }, 400);
    }

    // 🔹 جلب الطلب
    const order = await databases.getDocument(
      process.env.DATABASE_ID,
      process.env.ORDERS_COLLECTION_ID,
      orderId
    );

    const notifications = [];

    /* =========================
       👤 إشعار الزبون
    ========================== */
    const customerRes = await databases.listDocuments(
      process.env.DATABASE_ID,
      process.env.USERS_COLLECTION_ID,
      [`equal("email","${order.userEmail}")`]
    );

    if (customerRes.total > 0) {
      const customer = customerRes.documents[0];

      if (Expo.isExpoPushToken(customer.expoPushToken)) {
        let message = "";

        if (newStatus === "on_the_way") {
          message = "🍳 تم بدء تحضير طلبك";
        } else if (newStatus === "done") {
          message = "✅ تم تنفيذ طلبك، صحتين!";
        }

        if (message) {
          notifications.push({
            to: customer.expoPushToken,
            sound: "default",
            title: "تحديث الطلب",
            body: message,
            data: { type: "order", orderId }
          });
        }
      }
    }

    /* =========================
       🧑‍🍳 إشعار الموظفين
    ========================== */
    for (const employeeId of EMPLOYEE_IDS) {
      try {
        const employee = await databases.getDocument(
          process.env.DATABASE_ID,
          process.env.USERS_COLLECTION_ID,
          employeeId
        );

        if (Expo.isExpoPushToken(employee.expoPushToken)) {
          notifications.push({
            to: employee.expoPushToken,
            sound: "default",
            title: "📦 تحديث طلب",
            body: `تم تغيير حالة طلب إلى: ${newStatus}`,
            data: { type: "order", orderId }
          });
        }
      } catch (e) {
        log(`Employee not found: ${employeeId}`);
      }
    }

    if (notifications.length === 0) {
      return res.json({ success: true, message: "No notifications to send" });
    }

    await expo.sendPushNotificationsAsync(notifications);

    return res.json({
      success: true,
      sent: notifications.length
    });

  } catch (err) {
    error(err.message);
    return res.json(
      { success: false, error: err.message },
      500
    );
  }
};
