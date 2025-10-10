import { createObjectCsvStringifier } from "csv-writer";
import { localPrisma, staffViewPrisma } from "../config/db.js";
import { hrRequests, submittedData } from "../shared/state.js";
import { generateToken } from "../utils/jwt.js";
const HR_USER = { username: "HRUser", password: "123456" };
async function calculateWorkingDays(startDate, endDate) {
    const totalDays = endDate.getDate();
    const holidaysAndWeekends = await localPrisma.calendar.count({
        where: {
            date: { gte: startDate, lte: endDate },
            OR: [{ isHoliday: true }, { isWeekend: true }]
        }
    });
    return totalDays - holidaysAndWeekends;
}
export const hrLogin = async (req, res) => {
    const { username, password } = req.body;
    if (username === HR_USER.username && password === HR_USER.password) {
        const token = generateToken({ employeeNumber: 'HR01', username: 'HRUser', empClass: 'HR' });
        return res.json({ success: true, message: "HR Login Successful", token });
    }
    return res.status(401).json({ success: false, error: "Invalid credentials" });
};
export const getAllPIs = async (req, res) => {
    try {
        const piEntries = await staffViewPrisma.staffWithPi.findMany({
            select: { piUsername: true },
            distinct: ['piUsername'],
            orderBy: { piUsername: 'asc' }
        });
        const piUsernames = piEntries.map(p => p.piUsername);
        return res.json({ success: true, data: piUsernames });
    }
    catch (error) {
        return res.status(500).json({ success: false, error: "Could not retrieve PI list." });
    }
};
export const requestDataFromPIs = async (req, res) => {
    const { piUsernames, month, year } = req.body;
    if (!piUsernames || !Array.isArray(piUsernames) || !month || !year) {
        return res.status(400).json({ success: false, error: "PI usernames array, month, and year are required." });
    }
    const requestKey = `${month}-${year}`;
    piUsernames.forEach((pi) => {
        if (!hrRequests[pi])
            hrRequests[pi] = {};
        hrRequests[pi][requestKey] = { requestedAt: Date.now() };
    });
    return res.json({ success: true, message: `Request sent to ${piUsernames.length} PIs for ${requestKey}` });
};
export const getSubmissionStatus = async (req, res) => {
    try {
        const { month, year } = req.query;
        if (!month || !year) {
            return res.status(400).json({ success: false, error: "Month and year are required." });
        }
        const requestKey = `${month}-${year}`;
        const statuses = {};
        const piEntries = await staffViewPrisma.staffWithPi.findMany({
            select: { piUsername: true },
            distinct: ['piUsername']
        });
        const piUsernames = piEntries.map(p => p.piUsername);
        piUsernames.forEach(pi => {
            const submission = submittedData[pi]?.[requestKey];
            const hasRequest = hrRequests[pi]?.[requestKey];
            if (submission) {
                const isComplete = submission.users && submission.users.length > 0;
                statuses[pi] = isComplete ? 'complete' : 'pending';
            }
            else if (hasRequest) {
                statuses[pi] = 'requested';
            }
            else {
                statuses[pi] = 'none';
            }
        });
        return res.json({ success: true, data: statuses });
    }
    catch (error) {
        console.error("Error retrieving submission statuses:", error);
        return res.status(500).json({ success: false, error: "Could not retrieve submission statuses." });
    }
};
export const downloadReport = async (req, res) => {
    const { piUsernames, month, year } = req.query;
    if (!piUsernames || !month || !year) {
        return res.status(400).json({ success: false, error: "Missing required parameters." });
    }
    const piList = piUsernames.split(',');
    const requestKey = `${month}-${year}`;
    const queryYear = parseInt(year);
    const queryMonth = parseInt(month);
    const startDate = new Date(queryYear, queryMonth - 1, 1);
    const endDate = new Date(queryYear, queryMonth, 0);
    const totalWorkingDays = await calculateWorkingDays(startDate, endDate);
    let allUsersData = [];
    piList.forEach(pi => {
        const submission = submittedData[pi]?.[requestKey];
        if (submission && submission.users) {
            allUsersData = [...allUsersData, ...submission.users];
        }
    });
    if (allUsersData.length === 0) {
        return res.status(404).json({ success: false, error: "No data has been submitted for the selected criteria." });
    }
    const records = allUsersData.map(user => {
        const presentDays = user.monthlyStatistics.totalDays;
        const absentDays = Math.max(0, totalWorkingDays - presentDays);
        return {
            Project_Staff_Name: user.username,
            'Total Working Days': totalWorkingDays,
            'Present Days': presentDays.toFixed(1),
            'Absent Days': absentDays.toFixed(1)
        };
    });
    const csvStringifier = createObjectCsvStringifier({
        header: [
            { id: 'Project_Staff_Name', title: 'Project_Staff_Name' },
            { id: 'Total Working Days', title: 'Total Working Days' },
            { id: 'Present Days', title: 'Present Days' },
            { id: 'Absent Days', title: 'Absent Days' }
        ]
    });
    const csvData = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(records);
    const fileName = piList.length > 1 ? `Combined_Report_${month}_${year}.csv` : `${piList[0]}_Report_${month}_${year}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    res.send(csvData);
};
export const getPIUsersWithAttendance = async (req, res) => {
    try {
        const { username: piUsername } = req.params;
        const { month, year } = req.query;
        if (!piUsername) {
            return res.status(400).json({ success: false, error: "PI username is required." });
        }
        const queryMonth = month ? parseInt(month) : new Date().getMonth() + 1;
        const queryYear = year ? parseInt(year) : new Date().getFullYear();
        const startDate = new Date(queryYear, queryMonth - 1, 1);
        const endDate = new Date(queryYear, queryMonth, 0);
        const staffEntries = await staffViewPrisma.staffWithPi.findMany({
            where: { piUsername: piUsername },
        });
        const staffIds = [...new Set(staffEntries.map(s => s.staffEmpId))];
        if (staffIds.length === 0) {
            return res.json({ success: true, data: { piUsername, users: [] } });
        }
        const [attendances, totalWorkingDays] = await Promise.all([
            localPrisma.attendance.findMany({
                where: { employeeNumber: { in: staffIds }, date: { gte: startDate, lte: endDate } },
                orderBy: { date: 'asc' },
            }),
            calculateWorkingDays(startDate, endDate)
        ]);
        const attendancesMap = new Map();
        attendances.forEach(att => {
            if (!attendancesMap.has(att.employeeNumber))
                attendancesMap.set(att.employeeNumber, []);
            attendancesMap.get(att.employeeNumber).push(att);
        });
        const formattedUsers = staffIds.map(staffId => {
            const userAttendances = attendancesMap.get(staffId) || [];
            const userDetails = staffEntries.find(s => s.staffEmpId === staffId);
            const presentDays = new Set(userAttendances.map(a => a.date.toISOString().split('T')[0])).size;
            const absentDays = Math.max(0, totalWorkingDays - presentDays);
            return {
                username: userDetails?.staffUsername || 'Unknown',
                workingDays: totalWorkingDays,
                presentDays,
                absentDays,
                attendances: userAttendances,
            };
        }).sort((a, b) => a.username.localeCompare(b.username));
        res.json({
            success: true,
            data: { piUsername, month: queryMonth, year: queryYear, totalWorkingDays, users: formattedUsers },
        });
    }
    catch (error) {
        console.error("Get PI users attendance error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};
export const downloadPIReport = async (req, res) => {
    try {
        const { username: piUsername } = req.params;
        const { month, year } = req.query;
        if (!piUsername || !month || !year) {
            return res.status(400).json({ success: false, error: "PI username, month, and year are required." });
        }
        const queryMonth = parseInt(month);
        const queryYear = parseInt(year);
        const startDate = new Date(queryYear, queryMonth - 1, 1);
        const endDate = new Date(queryYear, queryMonth, 0);
        const staffEntries = await staffViewPrisma.staffWithPi.findMany({
            where: { piUsername: piUsername },
        });
        if (staffEntries.length === 0) {
            return res.status(404).send('No staff found for this PI.');
        }
        const staffIds = [...new Set(staffEntries.map(s => s.staffEmpId))];
        const [attendances, totalWorkingDays] = await Promise.all([
            localPrisma.attendance.findMany({
                where: { employeeNumber: { in: staffIds }, date: { gte: startDate, lte: endDate } },
            }),
            calculateWorkingDays(startDate, endDate)
        ]);
        const attendancesMap = new Map();
        attendances.forEach(att => {
            if (!attendancesMap.has(att.employeeNumber))
                attendancesMap.set(att.employeeNumber, []);
            attendancesMap.get(att.employeeNumber).push(att);
        });
        const records = staffIds.map(staffId => {
            const userAttendances = attendancesMap.get(staffId) || [];
            const userDetails = staffEntries.find(s => s.staffEmpId === staffId);
            const presentDays = new Set(userAttendances.map(a => a.date.toISOString().split('T')[0])).size;
            const absentDays = Math.max(0, totalWorkingDays - presentDays);
            return {
                Username: userDetails?.staffUsername || 'Unknown',
                'Working Days': totalWorkingDays,
                'Present Days': presentDays,
                'Absent Days': absentDays,
            };
        }).sort((a, b) => a.Username.localeCompare(b.Username));
        const csvStringifier = createObjectCsvStringifier({
            header: [
                { id: 'Username', title: 'Username' },
                { id: 'Working Days', title: 'Working Days' },
                { id: 'Present Days', title: 'Present Days' },
                { id: 'Absent Days', title: 'Absent Days' },
            ]
        });
        const csvData = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(records);
        const fileName = `PI_${piUsername}_Report_${month}_${year}.csv`;
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
        res.send(csvData);
    }
    catch (error) {
        console.error("Download PI report error:", error);
        res.status(500).send('Failed to generate report');
    }
};
//# sourceMappingURL=hr.controller.js.map