import type { Request, Response } from "express";
import { createObjectCsvStringifier } from "csv-writer";
import { localPrisma } from "../config/db.js";
import { hrRequests, submittedData } from "../shared/state.js";
import { generateToken } from "../utils/jwt.js";
import mysql from "mysql2/promise";

const HR_USER = { username: "HRUser", password: "123456" };

const createStaffDbConnection = async () => {
  const connection = await mysql.createConnection({
    host: "172.16.134.51",
    user: "sumit31",
    password: "sumit123",
    database: "rndautomation",
  });
  return connection;
};

async function calculateWorkingDays(
  startDate: Date,
  endDate: Date,
): Promise<number> {
  const totalDays = endDate.getDate();
  const holidaysAndWeekends = await localPrisma.calendar.count({
    where: {
      date: { gte: startDate, lte: endDate },
      OR: [{ isHoliday: true }, { isWeekend: true }],
    },
  });
  return totalDays - holidaysAndWeekends;
}

// Add this helper function to your hr.controller.ts
async function calculateWorkingDaysUpToToday(
  startDate: Date,
  endDate: Date,
): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Use the earlier of endDate or today
  const effectiveEndDate = endDate > today ? today : endDate;

  // If we haven't reached the start of the month yet, return 0
  if (today < startDate) {
    return 0;
  }

  const totalDays = effectiveEndDate.getDate();
  const holidaysAndWeekends = await localPrisma.calendar.count({
    where: {
      date: { gte: startDate, lte: effectiveEndDate },
      OR: [{ isHoliday: true }, { isWeekend: true }],
    },
  });
  return totalDays - holidaysAndWeekends;
}

export const hrLogin = async (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (username === HR_USER.username && password === HR_USER.password) {
    const token = generateToken({
      employeeNumber: "HR01",
      username: "HRUser",
      empClass: "HR",
    });
    return res.json({ success: true, message: "HR Login Successful", token });
  }
  return res.status(401).json({ success: false, error: "Invalid credentials" });
};

export const getAllPIs = async (req: Request, res: Response) => {
  let connection;
  try {
    connection = await createStaffDbConnection();
    const [rows] = await connection.execute(
      "SELECT DISTINCT piUsername, piFullName FROM staff_with_pi ORDER BY piUsername ASC",
    );

    const piList = (rows as any[]).map((row) => ({
      username: row.piUsername,
      fullName: row.piFullName,
    }));

    return res.json({ success: true, data: piList });
  } catch (error) {
    console.error("Error fetching PIs:", error);
    return res
      .status(500)
      .json({ success: false, error: "Could not retrieve PI list." });
  } finally {
    if (connection) await connection.end();
  }
};

export const requestDataFromPIs = async (req: Request, res: Response) => {
  const { piUsernames, month, year } = req.body;
  if (!piUsernames || !Array.isArray(piUsernames) || !month || !year) {
    return res.status(400).json({
      success: false,
      error: "PI usernames array, month, and year are required.",
    });
  }

  const requestKey = `${month}-${year}`;
  piUsernames.forEach((pi: string) => {
    if (!hrRequests[pi]) hrRequests[pi] = {};
    hrRequests[pi][requestKey] = { requestedAt: Date.now() };
  });

  return res.json({
    success: true,
    message: `Request sent to ${piUsernames.length} PIs for ${requestKey}`,
  });
};

export const getSubmissionStatus = async (req: Request, res: Response) => {
  let connection;
  try {
    const { month, year } = req.query;
    if (!month || !year) {
      return res
        .status(400)
        .json({ success: false, error: "Month and year are required." });
    }
    const requestKey = `${month}-${year}`;
    const statuses: Record<string, { status: string; fullName: string }> = {};

    connection = await createStaffDbConnection();
    const [rows] = await connection.execute(
      "SELECT DISTINCT piUsername, piFullName FROM staff_with_pi ORDER BY piUsername ASC",
    );

    const piList = rows as any[];

    piList.forEach((pi) => {
      const submission = submittedData[pi.piUsername]?.[requestKey];
      const hasRequest = hrRequests[pi.piUsername]?.[requestKey];

      let status: string;
      if (submission) {
        const isComplete = submission.users && submission.users.length > 0;
        status = isComplete ? "complete" : "pending";
      } else if (hasRequest) {
        status = "requested";
      } else {
        status = "none";
      }

      statuses[pi.piUsername] = {
        status,
        fullName: pi.piFullName,
      };
    });

    return res.json({ success: true, data: statuses });
  } catch (error) {
    console.error("Error retrieving submission statuses:", error);
    return res.status(500).json({
      success: false,
      error: "Could not retrieve submission statuses.",
    });
  } finally {
    if (connection) await connection.end();
  }
};

// Update the downloadReport function:
export const downloadReport = async (req: Request, res: Response) => {
  const { piUsernames, month, year } = req.query;
  if (!piUsernames || !month || !year) {
    return res
      .status(400)
      .json({ success: false, error: "Missing required parameters." });
  }
  const piList = (piUsernames as string).split(",");
  const requestKey = `${month}-${year}`;

  const queryYear = parseInt(year as string);
  const queryMonth = parseInt(month as string);

  const startDate = new Date(queryYear, queryMonth - 1, 1);
  const endDate = new Date(queryYear, queryMonth, 0);

  // FIX: Calculate working days only up to today
  const totalWorkingDays = await calculateWorkingDaysUpToToday(
    startDate,
    endDate,
  );

  let allUsersData: any[] = [];
  piList.forEach((pi) => {
    const submission = submittedData[pi]?.[requestKey];
    if (submission && submission.users) {
      allUsersData = [...allUsersData, ...submission.users];
    }
  });

  if (allUsersData.length === 0) {
    return res.status(404).json({
      success: false,
      error: "No data has been submitted for the selected criteria.",
    });
  }

  const records = allUsersData.map((user) => {
    const presentDays = user.monthlyStatistics.totalDays;
    const absentDays = Math.max(0, totalWorkingDays - presentDays);

    return {
      Project_Staff_Name: user.username,
      "Total Working Days": totalWorkingDays,
      "Present Days": presentDays.toFixed(1),
      "Absent Days": absentDays.toFixed(1),
    };
  });

  const csvStringifier = createObjectCsvStringifier({
    header: [
      { id: "Project_Staff_Name", title: "Project_Staff_Name" },
      { id: "Total Working Days", title: "Total Working Days" },
      { id: "Present Days", title: "Present Days" },
      { id: "Absent Days", title: "Absent Days" },
    ],
  });

  const csvData =
    csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(records);

  const fileName =
    piList.length > 1
      ? `Combined_Report_${month}_${year}.csv`
      : `${piList[0]}_Report_${month}_${year}.csv`;
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);
  res.send(csvData);
};

// Also update getPIUsersWithAttendance function:
export const getPIUsersWithAttendance = async (req: Request, res: Response) => {
  let connection;
  try {
    const { username: piUsername } = req.params;
    const { month, year } = req.query;

    if (!piUsername) {
      return res
        .status(400)
        .json({ success: false, error: "PI username is required." });
    }

    const queryMonth = month
      ? parseInt(month as string)
      : new Date().getMonth() + 1;
    const queryYear = year
      ? parseInt(year as string)
      : new Date().getFullYear();

    const startDate = new Date(queryYear, queryMonth - 1, 1);
    const endDate = new Date(queryYear, queryMonth, 0);

    connection = await createStaffDbConnection();
    const [staffRows] = await connection.execute(
      "SELECT * FROM staff_with_pi WHERE piUsername = ?",
      [piUsername],
    );

    const staffEntries = staffRows as any[];
    const staffIds = [...new Set(staffEntries.map((s) => s.staffEmpId))];

    if (staffIds.length === 0) {
      return res.json({ success: true, data: { piUsername, users: [] } });
    }

    const [attendances, totalWorkingDays] = await Promise.all([
      localPrisma.attendance.findMany({
        where: {
          employeeNumber: { in: staffIds },
          date: { gte: startDate, lte: endDate },
        },
        orderBy: { date: "asc" },
      }),
      // FIX: Calculate working days only up to today
      calculateWorkingDaysUpToToday(startDate, endDate),
    ]);

    const attendancesMap = new Map<string, any[]>();
    attendances.forEach((att) => {
      if (!attendancesMap.has(att.employeeNumber))
        attendancesMap.set(att.employeeNumber, []);
      attendancesMap.get(att.employeeNumber)!.push(att);
    });

    const formattedUsers = staffIds
      .map((staffId) => {
        const userAttendances = attendancesMap.get(staffId) || [];
        const userDetails = staffEntries.find((s) => s.staffEmpId === staffId);

        const presentDays = new Set(
          userAttendances.map((a) => a.date.toISOString().split("T")[0]),
        ).size;
        const absentDays = Math.max(0, totalWorkingDays - presentDays);

        return {
          username: userDetails?.staffUsername || "Unknown",
          employeeId: userDetails?.staffEmpId || "Unknown",
          workingDays: totalWorkingDays,
          presentDays,
          absentDays,
          attendances: userAttendances,
        };
      })
      .sort((a, b) => a.username.localeCompare(b.username));

    res.json({
      success: true,
      data: {
        piUsername,
        month: queryMonth,
        year: queryYear,
        totalWorkingDays,
        users: formattedUsers,
      },
    });
  } catch (error: any) {
    console.error("Get PI users attendance error:", error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    if (connection) await connection.end();
  }
};

// Also update downloadPIReport function similarly:
export const downloadPIReport = async (req: Request, res: Response) => {
  let connection;
  try {
    const { username: piUsername } = req.params;
    const { month, year } = req.query;

    if (!piUsername || !month || !year) {
      return res.status(400).json({
        success: false,
        error: "PI username, month, and year are required.",
      });
    }

    const queryMonth = parseInt(month as string);
    const queryYear = parseInt(year as string);

    const startDate = new Date(queryYear, queryMonth - 1, 1);
    const endDate = new Date(queryYear, queryMonth, 0);

    connection = await createStaffDbConnection();
    const [staffRows] = await connection.execute(
      "SELECT * FROM staff_with_pi WHERE piUsername = ?",
      [piUsername],
    );

    const staffEntries = staffRows as any[];

    if (staffEntries.length === 0) {
      return res.status(404).send("No staff found for this PI.");
    }

    const staffIds = [...new Set(staffEntries.map((s) => s.staffEmpId))];

    const [attendances, totalWorkingDays] = await Promise.all([
      localPrisma.attendance.findMany({
        where: {
          employeeNumber: { in: staffIds },
          date: { gte: startDate, lte: endDate },
        },
      }),
      // FIX: Calculate working days only up to today
      calculateWorkingDaysUpToToday(startDate, endDate),
    ]);

    const attendancesMap = new Map<string, any[]>();
    attendances.forEach((att) => {
      if (!attendancesMap.has(att.employeeNumber))
        attendancesMap.set(att.employeeNumber, []);
      attendancesMap.get(att.employeeNumber)!.push(att);
    });

    const records = staffIds
      .map((staffId) => {
        const userAttendances = attendancesMap.get(staffId) || [];
        const userDetails = staffEntries.find((s) => s.staffEmpId === staffId);

        const presentDays = new Set(
          userAttendances.map((a) => a.date.toISOString().split("T")[0]),
        ).size;
        const absentDays = Math.max(0, totalWorkingDays - presentDays);

        return {
          Username: userDetails?.staffUsername || "Unknown",
          "Working Days": totalWorkingDays,
          "Present Days": presentDays,
          "Absent Days": absentDays,
        };
      })
      .sort((a, b) => a.Username.localeCompare(b.Username));

    const csvStringifier = createObjectCsvStringifier({
      header: [
        { id: "Username", title: "Username" },
        { id: "Working Days", title: "Working Days" },
        { id: "Present Days", title: "Present Days" },
        { id: "Absent Days", title: "Absent Days" },
      ],
    });

    const csvData =
      csvStringifier.getHeaderString() +
      csvStringifier.stringifyRecords(records);
    const fileName = `PI_${piUsername}_Report_${month}_${year}.csv`;
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);
    res.send(csvData);
  } catch (error: any) {
    console.error("Download PI report error:", error);
    res.status(500).send("Failed to generate report");
  } finally {
    if (connection) await connection.end();
  }
};
