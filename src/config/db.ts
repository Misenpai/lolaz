import { PrismaClient as LocalPrismaClient } from "../../generated/presence/index.js";
import { PrismaClient as StaffViewPrismaClient } from "../../generated/staff_view/index.js";

export const localPrisma = new LocalPrismaClient();
export const staffViewPrisma = new StaffViewPrismaClient();
const prisma = localPrisma;
export default prisma;

export const connectDB = async () => {
  const errors: { database: string; error: string }[] = [];
  let localConnected = false;
  let staffViewConnected = false;
  try {
    console.log("📡 Attempting to connect to presence database...");
    await localPrisma.$connect();
    localConnected = true;
    console.log("✅ Successfully connected to presence database");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("❌ Failed to connect to local database:", errorMessage);
    errors.push({ database: "local", error: errorMessage });
  }

  try {
    console.log("📡 Attempting to connect to staff_view database...");
    await staffViewPrisma.$connect();
    staffViewConnected = true;
    console.log("✅ Successfully connected to staff_view database");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("❌ Failed to connect to staff_view database:", errorMessage);
    errors.push({ database: "staff_view", error: errorMessage });
  }

  if (localConnected && staffViewConnected) {
    console.log("🎉 All database connections established successfully");
    return {
      success: true,
      message: "Successfully connected to both databases",
      connections: {
        local: true,
        staff_view: true,
      },
    };
  } else {
    const failedDatabases = errors.map((e) => e.database).join(", ");
    console.error(`⚠️ Connection failed for: ${failedDatabases}`);
    return {
      success: false,
      message: `Failed to connect to: ${failedDatabases}`,
      connections: {
        local: localConnected,
        staff_view: staffViewConnected,
      },
      errors: errors,
    };
  }
};

export const seedBasicCalendar = async () => {
  try {
    const currentYear = new Date().getFullYear();
    const weekendDates = [];

    for (let month = 0; month < 12; month++) {
      const daysInMonth = new Date(currentYear, month + 1, 0).getDate();

      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(Date.UTC(currentYear, month, day, 12));
        const dayOfWeek = date.getDay();

        if (dayOfWeek === 0 || dayOfWeek === 6) {
          weekendDates.push({
            date: date,
            description: dayOfWeek === 0 ? "Sunday" : "Saturday",
            isHoliday: true,
            isWeekend: true,
          });
        }
      }
    }

    await localPrisma.calendar.createMany({
      data: weekendDates,
      skipDuplicates: true,
    });

    console.log(
      `✅ Seeded ${weekendDates.length} weekend dates for ${currentYear}`,
    );
    return {
      success: true,
      message: `Basic calendar seeded for ${currentYear}`,
      count: weekendDates.length,
    };
  } catch (error) {
    console.error("❌ Error seeding basic calendar:", error);
    return {
      success: false,
      message: "Failed to seed basic calendar",
      error: error instanceof Error ? error.message : error,
    };
  }
};

export const addHoliday = async (date: Date, description: string) => {
  try {
    const existingCalendar = await localPrisma.calendar.findUnique({
      where: { date },
    });

    if (existingCalendar) {
      await localPrisma.calendar.update({
        where: { date },
        data: {
          description,
          isHoliday: true,
        },
      });
    } else {
      await localPrisma.calendar.create({
        data: {
          date,
          description,
          isHoliday: true,
          isWeekend: false,
        },
      });
    }

    return {
      success: true,
      message: `Holiday added: ${description} on ${date.toDateString()}`,
    };
  } catch (error) {
    return {
      success: false,
      message: "Failed to add holiday",
      error: error instanceof Error ? error.message : error,
    };
  }
};

export const initializeDatabase = async () => {
  try {
    console.log("🚀 Initializing database...");

    const connection = await connectDB();
    if (!connection.success) {
      console.error("⚠️ Database connection details:", connection);
      throw new Error(connection.message);
    }

    await seedBasicCalendar();

    console.log("✅ Database initialization completed successfully");
    return {
      success: true,
      message: "Database initialized successfully",
    };
  } catch (error) {
    console.error("❌ Database initialization failed:", error);
    return {
      success: false,
      message: "Database initialization failed",
      error: error instanceof Error ? error.message : error,
    };
  }
};

export const disconnectDB = async () => {
  const errors: { database: string; error: string }[] = [];
  let localDisconnected = false;
  let staffViewDisconnected = false;

  try {
    console.log("🔌 Disconnecting from local database...");
    await localPrisma.$disconnect();
    localDisconnected = true;
    console.log("✅ Disconnected from local database");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("❌ Failed to disconnect from local database:", errorMessage);
    errors.push({ database: "local", error: errorMessage });
  }

  try {
    console.log("🔌 Disconnecting from staff_view database...");
    await staffViewPrisma.$disconnect();
    staffViewDisconnected = true;
    console.log("✅ Disconnected from staff_view database");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      "❌ Failed to disconnect from staff_view database:",
      errorMessage,
    );
    errors.push({ database: "staff_view", error: errorMessage });
  }

  if (localDisconnected && staffViewDisconnected) {
    console.log("🎉 All database connections closed successfully");
    return {
      success: true,
      message: "Databases disconnected successfully",
      disconnections: {
        local: true,
        staff_view: true,
      },
    };
  } else {
    const failedDatabases = errors.map((e) => e.database).join(", ");
    console.error(`⚠️ Disconnection failed for: ${failedDatabases}`);
    return {
      success: false,
      message: `Failed to disconnect from: ${failedDatabases}`,
      disconnections: {
        local: localDisconnected,
        staff_view: staffViewDisconnected,
      },
      errors: errors,
    };
  }
};
